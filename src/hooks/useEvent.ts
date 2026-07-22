import { useState, useCallback, useRef, useLayoutEffect } from 'react';
import type { GameState, GameAction, ChoiceEvent, EventOption, EventOutcome, ResourceChange, EventSubChoice } from '@/types/game';
import { ALL_EVENTS } from '@/data/choiceEvents';
import { RESOURCE_EVENTS } from '@/data/resourceEvents';
import { rng } from '@/utils/prng';

export interface EventResult {
  description: string;
  message: string;
  subMessage?: string;
  goldChange: number;
  foodChange: number;
  alloyChange: number;
  stardustChange: number;
}

export type ChooseResult =
  | { type: 'subChoice'; subChoice: EventSubChoice; accumulator: ResourceChange }
  | { type: 'final'; result: EventResult; accumulator: ResourceChange };

export type DodgeReason = false | 'jumper' | 'crisis';

interface UseEventReturn {
  activeEvent: ChoiceEvent | null;
  eventDodged: DodgeReason;
  drawEvent: (shipIndex: number) => ChoiceEvent | null;
  chooseOption: (shipIndex: number, option: EventOption, accumulator: ResourceChange) => ChooseResult | null;
  applyResources: (shipIndex: number, res: ResourceChange, reason: string) => void;
  clearActiveEvent: () => void;
  clearDodged: () => void;
}

function isRewardOutcome(res: ResourceChange): boolean {
  return (res.goldChange || 0) > 0 || (res.foodChange || 0) > 0 || (res.alloyChange || 0) > 0 || (res.stardustChange || 0) > 0;
}

function isPenaltyOutcome(res: ResourceChange): boolean {
  return (res.goldChange || 0) < 0 || (res.foodChange || 0) < 0 || (res.alloyChange || 0) < 0 || (res.stardustChange || 0) < 0 || !!res.productLoss;
}

export function useEvent(
  gameState: GameState,
  dispatch: React.Dispatch<GameAction>,
): UseEventReturn {
  const [activeEvent, setActiveEvent] = useState<ChoiceEvent | null>(null);
  const [eventDodged, setEventDodged] = useState<DodgeReason>(false);
  const drawingRef = useRef(false);

  // 回合推进时自动清除所有事件状态，防止旧事件残留
  const prevTurnRef = useRef(gameState.turn);
  useLayoutEffect(() => {
    if (gameState.turn !== prevTurnRef.current) {
      prevTurnRef.current = gameState.turn;
      setActiveEvent(null);
      setEventDodged(false);
    }
  }, [gameState.turn]);

  // 统一应用资源变动
  const applyResources = useCallback(
    (shipIndex: number, res: ResourceChange, prev: GameState, turn: number, reason: string) => {
      const ships = [...prev.ships];
      const s = { ...ships[shipIndex] };

      const hasVoidSafe = s.relics.some((r) => r.id === 'r_011');
      const actualGoldChange = (hasVoidSafe && (res.goldChange || 0) < 0) ? 0 : res.goldChange;
      const famineHalve = (amt: number): number => {
        if (amt <= 0) return amt;
        if (s.food < 0) return Math.floor(amt * 0.5);
        return amt;
      };
      const checkBk = () => { if (s.gold < 0 && !s.bankrupt) { s.bankrupt = true; s.bankruptTimer = 10; } };

      if (actualGoldChange) {
        const halved = famineHalve(actualGoldChange);
        s.gold += halved;
        checkBk();
        if (s.gold >= 0 && s.bankrupt) { s.bankrupt = false; s.bankruptTimer = 0; }
        s.goldLog = [{ turn, amount: halved, reason, balanceAfter: s.gold }, ...s.goldLog].slice(0, 200);
      }
      if (res.foodChange) s.food += res.foodChange;
      if (res.alloyChange) s.alloy = Math.max(0, s.alloy + res.alloyChange);
      if (res.stardustChange) s.stardust = Math.max(0, s.stardust + res.stardustChange);
      if (res.materialCost) {
        s.materials = { ...s.materials };
        for (const mc of res.materialCost) {
          s.materials[mc.materialId] = Math.max(0, (s.materials[mc.materialId] || 0) - mc.amount);
        }
      }
      if (res.materialBuys) {
        s.materials = { ...s.materials };
        for (const mb of res.materialBuys) {
          const mat = prev.materials.find((m) => m.id === mb.materialId);
          const cost = Math.round((mat ? mat.currentPrice : 100) * mb.amount * mb.discount);
          s.gold -= cost;
          checkBk();
          s.materials[mb.materialId] = (s.materials[mb.materialId] || 0) + mb.amount;
        }
      }
      if (res.materialDrops) {
        s.materials = { ...s.materials };
        for (const drop of res.materialDrops) {
          const amount = Math.floor(rng() * (drop.max - drop.min + 1)) + drop.min;
          s.materials[drop.materialId] = (s.materials[drop.materialId] || 0) + amount;
        }
      }
      if (res.productLoss && s.products.length > 0) {
        s.products = s.products.slice(0, Math.max(0, s.products.length - res.productLoss));
      }
      if (res.grantTip === 'stock') {
        const pool = prev.stocks.filter((stk) => stk.volatility >= 0.12);
        if (pool.length > 0) {
          const target = pool[Math.floor(rng() * pool.length)];
          const dir = rng() > 0.3 ? '上涨' : '下跌';
          const mag = Math.round(rng() * 15 + 5);
          s.nextTurnStockTip = `「${target.name}」(${target.sector}) 下回合可能${dir} ${mag}%`;
        }
      }
      if (res.grantTip === 'material') {
        const pool = prev.materials;
        if (pool.length > 0) {
          const target = pool[Math.floor(rng() * pool.length)];
          const dir = rng() > 0.3 ? '上涨' : '下跌';
          const mag = Math.round(rng() * 10 + 3);
          s.nextTurnMatTip = `「${target.name}」下回合可能${dir} ${mag}%`;
        }
      }
      if (res.setBonus) {
        s.sellBonuses = [...(s.sellBonuses || []), { bonus: res.setBonus.bonus, remainingTurns: res.setBonus.turns, source: res.setBonus.source }];
      }
      if (res.allianceRounds) s.allianceRounds = (s.allianceRounds || 0) + res.allianceRounds;

      ships[shipIndex] = s;
      return ships;
    },
    [rng]
  );

  // 掷一个 outcome，应用所有加成，返回处理后的 ResourceChange + outcome 信息
  const processOutcome = useCallback(
    (outcome: EventOutcome, shipIndex: number): { res: ResourceChange; description: string; message: string; subMessage?: string } => {
      const ship = gameState.ships[shipIndex];
      const turnMul = 1 + gameState.turn * 0.08;

      // 神圣荣耀
      const isReward = isRewardOutcome(outcome.resources);
      const isPenalty = isPenaltyOutcome(outcome.resources);
      const isHolyGlory = ship?.id === 5;
      let gloryMul = 1;
      if (isHolyGlory && isPenalty && !isReward) gloryMul = 0.5;
      if (isHolyGlory && isReward) gloryMul = 1.25;

      // 命运之骰
      const hasDice = ship?.relics.some((r) => r.id === '100005' || r.id === 'r_005') || false;
      let diceMul = 1;
      if (hasDice && (outcome.resources.goldChange || 0) !== 0) {
        diceMul = (outcome.resources.goldChange || 0) > 0 ? 1.2 : 0.8;
      }

      // 应用加成
      const res: ResourceChange = { ...outcome.resources };
      if (res.goldChange) res.goldChange = Math.round(res.goldChange * turnMul * diceMul * gloryMul);
      if (res.foodChange) res.foodChange = Math.round(res.foodChange * gloryMul);
      if (res.alloyChange) res.alloyChange = Math.round(res.alloyChange * gloryMul);
      if (res.stardustChange) res.stardustChange = Math.round(res.stardustChange * gloryMul);

      // 处理随机子结果（subOutcomes）
      let subMessage: string | undefined;
      if (outcome.subOutcomes && outcome.subOutcomes.length > 0) {
        const subRoll = rng() * 100;
        let subCum = 0;
        for (const sub of outcome.subOutcomes) {
          subCum += sub.probability;
          if (subRoll <= subCum) {
            if (sub.resources.goldChange) sub.resources.goldChange = Math.round(sub.resources.goldChange * turnMul * diceMul * gloryMul);
            if (sub.resources.foodChange) sub.resources.foodChange = Math.round(sub.resources.foodChange * gloryMul);
            if (sub.resources.alloyChange) sub.resources.alloyChange = Math.round(sub.resources.alloyChange * gloryMul);
            if (sub.resources.stardustChange) sub.resources.stardustChange = Math.round(sub.resources.stardustChange * gloryMul);
            // 合并子结果资源到主结果
            if (sub.resources.goldChange) res.goldChange = (res.goldChange || 0) + sub.resources.goldChange;
            if (sub.resources.foodChange) res.foodChange = (res.foodChange || 0) + sub.resources.foodChange;
            if (sub.resources.alloyChange) res.alloyChange = (res.alloyChange || 0) + sub.resources.alloyChange;
            if (sub.resources.stardustChange) res.stardustChange = (res.stardustChange || 0) + sub.resources.stardustChange;
            if (sub.resources.materialDrops) res.materialDrops = [...(res.materialDrops || []), ...sub.resources.materialDrops];
            if (sub.resources.materialCost) res.materialCost = [...(res.materialCost || []), ...sub.resources.materialCost];
            if (sub.resources.productLoss) res.productLoss = (res.productLoss || 0) + sub.resources.productLoss;
            if (sub.resources.stockFreeze) res.stockFreeze = true;
            if (sub.resources.grantTip) res.grantTip = sub.resources.grantTip;
            if (sub.resources.setBonus) {
              const existing = res.setBonus;
              res.setBonus = existing ? { ...existing, bonus: existing.bonus + sub.resources.setBonus.bonus } : sub.resources.setBonus;
            }
            subMessage = sub.message;
            break;
          }
        }
      }

      return { res, description: outcome.description, message: outcome.message, subMessage };
    },
    [gameState, rng]
  );

  // 判断事件是否为"有风险的事件"——只要任意选项的任意outcome包含资源损失就算
  const isPenaltyEvent = (event: ChoiceEvent): boolean => {
    // 战斗和灾难类直接判定为有风险
    if (event.category === 'combat' || event.category === 'disaster') return true;
    // 其他类别：检查是否有任何outcome包含资源损失
    return event.options.some((opt) =>
      opt.outcomes.some((oc) => {
        const r = oc.resources;
        return (r.goldChange && r.goldChange < 0) ||
               (r.foodChange && r.foodChange < 0) ||
               (r.alloyChange && r.alloyChange < 0) ||
               (r.stardustChange && r.stardustChange < 0) ||
               (r.productLoss && r.productLoss > 0) ||
               r.stockFreeze;
      })
    );
  };

  // 抽取事件（先抽事件，确认是惩罚事件后再判定闪避）
  const drawEvent = useCallback(
    (shipIndex: number): ChoiceEvent | null => {
      if (drawingRef.current) return null;
      drawingRef.current = true;

      const ship = gameState.ships[shipIndex];
      if (!ship || ship.eventTriggeredThisTurn) { drawingRef.current = false; return null; }

      // 先抽取事件
      let event: ChoiceEvent;
      if (rng() < 0.4) {
        const categories = ['combat', 'opportunity', 'disaster', 'social', 'mystery', 'business'];
        const cat = categories[Math.floor(rng() * categories.length)];
        const pool = ALL_EVENTS.filter((e) => e.category === cat);
        event = pool[Math.floor(rng() * pool.length)] || ALL_EVENTS[0];
      } else {
        event = RESOURCE_EVENTS[Math.floor(rng() * RESOURCE_EVENTS.length)] || RESOURCE_EVENTS[0];
      }

      // 如果是惩罚事件，判定闪避
      if (isPenaltyEvent(event)) {
        // 跃迁者闪避（30%概率）
        if ((ship.eventDodgeChance || 0) > 0 && rng() < ship.eventDodgeChance) {
          dispatch({ type: 'FUNCTIONAL_UPDATE', updater: (prev) => { const ships = [...prev.ships]; ships[0] = { ...ships[0], eventTriggeredThisTurn: true }; return { ...prev, ships }; } });
          setEventDodged('jumper');
          drawingRef.current = false;
          return null;
        }

        // 危机预知：50%概率闪避惩罚事件
        const hasCrisis = ship.relics.some((r) => r.id === 'r_010');
        if (hasCrisis && rng() < 0.5) {
          dispatch({ type: 'FUNCTIONAL_UPDATE', updater: (prev) => { const ships = [...prev.ships]; ships[0] = { ...ships[0], eventTriggeredThisTurn: true }; return { ...prev, ships }; } });
          setEventDodged('crisis');
          drawingRef.current = false;
          return null;
        }
      }

      // 非惩罚事件 或 闪避失败 → 正常展示
      setActiveEvent(event);
      dispatch({
        type: 'FUNCTIONAL_UPDATE',
        updater: (prev) => { const ships = [...prev.ships]; ships[0] = { ...ships[0], eventTriggeredThisTurn: true }; return { ...prev, ships }; },
      });

      drawingRef.current = false;
      return event;
    },
    [gameState, dispatch, setActiveEvent, setEventDodged, rng]
  );

  // 选择选项（支持多级嵌套）
  const chooseOption = useCallback(
    (shipIndex: number, option: EventOption, accumulator: ResourceChange): ChooseResult | null => {
      const ship = gameState.ships[shipIndex];
      if (!ship) return null;

      // 掷 outcome
      const roll = rng() * 100;
      let cum = 0;
      let outcome = option.outcomes[option.outcomes.length - 1];
      for (const o of option.outcomes) {
        cum += o.probability;
        if (roll <= cum) { outcome = o; break; }
      }

      const processed = processOutcome(outcome, shipIndex);

      // 累积资源：金币用替换（二级选择覆盖一级），其他资源用累加
      const newAcc: ResourceChange = { ...accumulator };
      // 金币：如果当前层级有goldChange，替换（不是累加），避免"+5000 then -4000 = +1000"的荒谬结果
      if (processed.res.goldChange !== undefined) newAcc.goldChange = processed.res.goldChange;
      if (processed.res.foodChange) newAcc.foodChange = (newAcc.foodChange || 0) + processed.res.foodChange;
      if (processed.res.alloyChange) newAcc.alloyChange = (newAcc.alloyChange || 0) + processed.res.alloyChange;
      if (processed.res.stardustChange) newAcc.stardustChange = (newAcc.stardustChange || 0) + processed.res.stardustChange;
      if (processed.res.materialDrops) newAcc.materialDrops = [...(newAcc.materialDrops || []), ...processed.res.materialDrops];
      if (processed.res.materialCost) newAcc.materialCost = [...(newAcc.materialCost || []), ...processed.res.materialCost];
      if (processed.res.materialBuys) newAcc.materialBuys = [...(newAcc.materialBuys || []), ...processed.res.materialBuys];
      if (processed.res.productLoss) newAcc.productLoss = (newAcc.productLoss || 0) + (processed.res.productLoss || 0);
      if (processed.res.stockFreeze) newAcc.stockFreeze = true;
      if (processed.res.grantTip) newAcc.grantTip = processed.res.grantTip;
      if (processed.res.setBonus) newAcc.setBonus = processed.res.setBonus;
      if (processed.res.allianceRounds) newAcc.allianceRounds = (newAcc.allianceRounds || 0) + (processed.res.allianceRounds || 0);

      // 如果有二级选择，返回 subChoice
      if (outcome.subChoice) {
        return {
          type: 'subChoice',
          subChoice: outcome.subChoice,
          accumulator: newAcc,
        };
      }

      // 最终结果
      return {
        type: 'final',
        result: {
          description: processed.description,
          message: processed.message,
          subMessage: processed.subMessage,
          goldChange: newAcc.goldChange || 0,
          foodChange: newAcc.foodChange || 0,
          alloyChange: newAcc.alloyChange || 0,
          stardustChange: newAcc.stardustChange || 0,
        },
        accumulator: newAcc,
      };
    },
    [gameState, rng, processOutcome]
  );

  // 清除躲避提示
  const clearDodged = useCallback(() => {
    setEventDodged(false);
  }, []);

  const clearActiveEvent = useCallback(() => {
    setActiveEvent(null);
  }, []);

  return {
    activeEvent,
    eventDodged,
    drawEvent,
    chooseOption,
    applyResources: (shipIndex: number, res: ResourceChange, reason: string) => {
      dispatch({
        type: 'FUNCTIONAL_UPDATE',
        updater: (prev) => {
          const ships = applyResources(shipIndex, res, prev, prev.turn, reason);
          ships[shipIndex] = { ...ships[shipIndex], eventProcessedThisTurn: true };
          return { ...prev, ships };
        },
      });
    },
    clearActiveEvent,
    clearDodged,
  };
}
