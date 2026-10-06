import { useReducer, useCallback, useRef } from 'react';
import type { Mothership, GameState } from '@/types/game';
import type { BattleAction, PirateBossId, ShipCardId } from '@/types/battle';
import { gameReducer, createInitialGameState } from './gameReducer';
import { useStock } from './useStock';
import { useProduction } from './useProduction';
import { useEvent } from './useEvent';
import { useLoan } from './useLoan';
import { useTrade } from './useTrade';
import { useGalaxy } from './useGalaxy';
import { useSave } from './useSave';
import { useTurn } from './useTurn';
import { getShipTotalAssets } from '@/lib/game/assets';
import { MATERIAL_NAME_MAP, ALL_MATERIAL_IDS } from '@/data/materialNames';
import { ALLOY_GOLD_PRICE, ALLOY_PER_STARDUST, FOOD_GOLD_PRICE, FOOD_PER_ALLOY, FOOD_PER_STARDUST, STARDUST_SHOP, POLICY_REROLL_STARDUST } from '@/data/exchangeRates';
import { useRedeem } from './useRedeem';
import { useModule } from './useModule';
import { useColony } from './useColony';
import { getRelicById } from '@/data/relics';
import { rollPolicy, POLICY_EFFECTS } from '@/data/factions';
import { pushGoldLog } from '@/lib/turn/goldLog';

/**
 * 游戏主 Hook —— 整合所有子 Hook，对外保持接口兼容
 * 
 * 架构：
 * - useReducer 管理 gameState（dispatch 引用稳定，减少不必要的函数重建）
 * - 各业务 Hook（useStock/useProduction/useEvent/useLoan/useTrade/useSave/useTurn/useRedeem）
 *   接收 dispatch，通过 FUNCTIONAL_UPDATE action 更新状态
 * - getShipTotalAssets 是纯函数，不触发任何更新
 */

/** 去掉元组第一个元素（用于收敛 shipIndex 恒为 0 的单舰队接口） */
type Tail<T extends unknown[]> = T extends [unknown, ...infer R] ? R : never;

/**
 * 把一组 action 函数包装成引用稳定的版本：
 * 每次渲染更新内部 ref，调用时始终执行最新闭包。
 * 这样子 hook 里依赖 gameState 的 useCallback 即使每次渲染都重建，
 * 透传到组件层的函数引用也保持不变，不会击穿面板组件的 React.memo。
 *
 * 也用于**组件内部**：把依赖当前 props（每次渲染都会变）的处理器包成稳定引用，
 * 再传给已经 memo 的子组件（战斗界面 BattleScreen 就是这么做的）。
 */
export function useStableActions<T extends Record<string, (...args: never[]) => unknown>>(actions: T): T {
  const ref = useRef(actions);
  ref.current = actions;
  const stableRef = useRef<T | null>(null);
  if (stableRef.current === null) {
    const wrapped: Record<string, unknown> = {};
    for (const key of Object.keys(actions)) {
      wrapped[key] = (...args: unknown[]) => (ref.current[key] as (...a: unknown[]) => unknown)(...args);
    }
    stableRef.current = wrapped as unknown as T;
  }
  return stableRef.current;
}

export function useGameState() {
  const [gameState, dispatch] = useReducer(gameReducer, undefined, createInitialGameState);

  // 子 Hook（dispatch 引用稳定，不会导致函数重建）
  const { buyStock, sellStock } = useStock(dispatch);
  const { buyMaterial, startProduction, sellProduct, sellProductQty } = useProduction(gameState, dispatch);
  const { activeEvent, eventDodged, drawEvent, chooseOption: chooseEventOption, applyResources: applyEventResources, logEvent: logEventEntry, clearActiveEvent, clearDodged: clearEventDodged } = useEvent(gameState, dispatch);
  const { takeLoan, repayLoan } = useLoan(gameState, dispatch);
  const { travelToNode, buySpecialty, sellSpecialty, exploreFaction, investFaction, gatherIntel, acceptContract, completeContract, blackMarketBuy } = useTrade(gameState, dispatch);
  const { autoSave, hasSave, loadSave, exportSave, importSave, resetGame } = useSave(gameState, dispatch);
  const { redeemCode } = useRedeem(gameState, dispatch);
  const { installModule, useManualModule } = useModule(dispatch);
  const { foundColony, buildColonyBuilding, recruitPop, assignPop, startResearch, recruitLeader, upgradeLeader, rollAndRecruit, clearRecruitPool, cancelBuilding, demolishBuilding, selectWonder, submitWonderResources, canStartWonder, completeWonder, startExpedition, payExpeditionNode, unlockUltimate } = useColony(gameState, dispatch);
  const { nextTurn, fluctuatePrices } = useTurn(gameState, dispatch, autoSave);
  const { startExcavation, continueExcavation, resolveExcavationChoice, steadyExcavation, changeExcavationLeader, abandonExcavation } = useGalaxy(gameState, dispatch);

  // 初始化游戏（选择单舰队）
  const selectShips = useCallback(
    (shipId: number) => {
      dispatch({ type: 'SELECT_SHIP', shipId });
    },
    []
  );

  // 从星尘集市购买遗物
  // 合金购买
  const buyAlloy = useCallback(
    (type: 'gold' | 'stardust', qty: number): boolean => {
      const ship = gameState.ships[0];
      if (!ship) return false;
      if (type === 'gold') {
        const cost = ALLOY_GOLD_PRICE * qty;
        if (ship.gold < cost) return false;
        dispatch({
          type: 'FUNCTIONAL_UPDATE',
          updater: (prev) => {
            const ships = [...prev.ships];
            const s = { ...ships[0] };
            s.gold -= cost;
            s.alloy += qty;
            pushGoldLog(s, prev.turn, -cost, `购买合金x${qty}`);
            ships[0] = s;
            return { ...prev, ships };
          },
        });
      } else {
        if (ship.stardust < qty) return false;
        dispatch({
          type: 'FUNCTIONAL_UPDATE',
          updater: (prev) => {
            const ships = [...prev.ships];
            const s = { ...ships[0] };
            s.stardust -= qty;
            s.alloy += qty * ALLOY_PER_STARDUST;
            ships[0] = s;
            return { ...prev, ships };
          },
        });
      }
      return true;
    },
    [gameState, dispatch]
  );

  // 食物购买
  const buyFood = useCallback(
    (type: 'gold' | 'alloy', qty: number): boolean => {
      const ship = gameState.ships[0];
      if (!ship) return false;
      if (type === 'gold') {
        const cost = FOOD_GOLD_PRICE * qty;
        if (ship.gold < cost) return false;
        dispatch({
          type: 'FUNCTIONAL_UPDATE',
          updater: (prev) => {
            const ships = [...prev.ships];
            const s = { ...ships[0] };
            s.gold -= cost;
            s.food += qty;
            pushGoldLog(s, prev.turn, -cost, `购买食物x${qty}`);
            ships[0] = s;
            return { ...prev, ships };
          },
        });
      } else {
        if (ship.alloy < qty) return false;
        dispatch({
          type: 'FUNCTIONAL_UPDATE',
          updater: (prev) => {
            const ships = [...prev.ships];
            const s = { ...ships[0] };
            s.alloy -= qty;
            s.food += qty * FOOD_PER_ALLOY;
            ships[0] = s;
            return { ...prev, ships };
          },
        });
      }
      return true;
    },
    [gameState, dispatch]
  );

  const buyRelic = useCallback(
    (relicId: string): { success: boolean; message: string } => {
      const relic = getRelicById(relicId);
      if (!relic) return { success: false, message: '遗物不存在' };
      const ship = gameState.ships[0];
      if (!ship) return { success: false, message: '舰队不存在' };
      if (ship.stardust < relic.stardustCost) return { success: false, message: `星尘不足，需要 ${relic.stardustCost} 星尘` };
      if (ship.relics.some((r) => r.id === relicId)) return { success: false, message: '已拥有该遗物' };

      let result = { success: false, message: '' };
      dispatch({
        type: 'FUNCTIONAL_UPDATE',
        updater: (prev: GameState) => {
          const ships = [...prev.ships];
          const s = { ...ships[0] };
          s.stardust -= relic.stardustCost;
          s.relics = [...s.relics, { id: relic.id, name: relic.name, description: relic.description, effect: relic.effect, stardustCost: relic.stardustCost }];
          ships[0] = s;
          result = { success: true, message: `获得遗物「${relic.name}」！${relic.effect}` };
          return {
            ...prev,
            ships,
            stardustMarket: { ...prev.stardustMarket, soldRelicIds: [...prev.stardustMarket.soldRelicIds, relicId], currentRelicId: null },
          };
        },
      });
      return result;
    },
    [gameState.ships, dispatch]
  );

  // 星尘购买随机原料（星尘价与数量走 data/exchangeRates.STARDUST_SHOP 唯一真值）
  const buyRandomMats = useCallback(
    (): { success: boolean; message: string } => {
      const ship = gameState.ships[0];
      if (!ship) return { success: false, message: '舰队不存在' };
      const { cost, matsGain } = STARDUST_SHOP.randomMats;
      if (ship.stardust < cost) return { success: false, message: `星尘不足（需要${cost}星尘）` };
      const matIds = ALL_MATERIAL_IDS;
      const matNames: Record<string, string> = MATERIAL_NAME_MAP;
      let result = { success: false, message: '' };
      dispatch({
        type: 'FUNCTIONAL_UPDATE',
        updater: (prev) => {
          const ships = [...prev.ships];
          const s = { ...ships[0] };
          s.stardust -= cost;
          s.materials = { ...s.materials };
          const drops: string[] = [];
          for (let i = 0; i < (matsGain || 0); i++) {
            const mat = matIds[Math.floor(Math.random() * matIds.length)];
            s.materials[mat] = (s.materials[mat] || 0) + 1;
            drops.push(matNames[mat]);
          }
          result = { success: true, message: `获得原料：${[...new Set(drops)].map((m) => `${m}×${drops.filter((d) => d === m).length}`).join('、')}` };
          ships[0] = s;
          return { ...prev, ships };
        },
      });
      return result;
    },
    [gameState.ships, dispatch]
  );

  // 星尘购买产品售价加成（5回合）
  const buySellBonus = useCallback(
    (turns: number, bonus: number, stardustCost: number): { success: boolean; message: string } => {
      const ship = gameState.ships[0];
      if (!ship) return { success: false, message: '舰队不存在' };
      if (ship.stardust < stardustCost) return { success: false, message: `星尘不足（需要${stardustCost}星尘）` };
      let result = { success: false, message: '' };
      dispatch({
        type: 'FUNCTIONAL_UPDATE',
        updater: (prev) => {
          const ships = [...prev.ships];
          const s = { ...ships[0] };
          s.stardust -= stardustCost;
          s.sellBonuses = [...(s.sellBonuses || []), { bonus, remainingTurns: turns, source: '星尘集市' }];
          result = { success: true, message: `产品售价+${bonus}%，持续${turns}回合！` };
          ships[0] = s;
          return { ...prev, ships };
        },
      });
      return result;
    },
    [gameState.ships, dispatch]
  );

  // 星尘兑换金币（星尘价与数额走 STARDUST_SHOP 唯一真值）
  const buyGoldWithStardust = useCallback(
    (): { success: boolean; message: string } => {
      const ship = gameState.ships[0];
      if (!ship) return { success: false, message: '舰队不存在' };
      const { cost, goldGain } = STARDUST_SHOP.gold5000;
      if (ship.stardust < cost) return { success: false, message: `星尘不足（需要${cost}星尘）` };
      let result = { success: false, message: '' };
      dispatch({
        type: 'FUNCTIONAL_UPDATE',
        updater: (prev) => {
          const ships = [...prev.ships];
          const s = { ...ships[0] };
          s.stardust -= cost;
          s.gold += goldGain || 0;
          if (s.bankrupt && s.gold > 0) s.bankrupt = false;
          pushGoldLog(s, prev.turn, goldGain || 0, '星尘集市兑换金币');
          result = { success: true, message: `兑换成功，获得${goldGain}金币！` };
          ships[0] = s;
          return { ...prev, ships };
        },
      });
      return result;
    },
    [gameState.ships, dispatch]
  );

  // 星尘强制刷新贸易政策（星尘价走 STARDUST_SHOP）
  const rerollPolicy = useCallback(
    (): { success: boolean; message: string } => {
      const ship = gameState.ships[0];
      if (!ship) return { success: false, message: '舰队不存在' };
      if (ship.stardust < POLICY_REROLL_STARDUST) return { success: false, message: `星尘不足（需要${POLICY_REROLL_STARDUST}星尘）` };
      let result = { success: false, message: '' };
      dispatch({
        type: 'FUNCTIONAL_UPDATE',
        updater: (prev) => {
          const ships = [...prev.ships];
          const s = { ...ships[0] };
          s.stardust -= POLICY_REROLL_STARDUST;
          const newType = rollPolicy();
          const newEffect = POLICY_EFFECTS[newType];
          const newRemaining = Math.floor(Math.random() * 3) + 3;
          result = { success: true, message: `已强制刷新贸易政策！当前：「${newEffect.name}」（持续${newRemaining}回合）` };
          ships[0] = s;
          return {
            ...prev,
            ships,
            factionPolicy: { type: newType, effect: newEffect },
            policyRemainingTurns: newRemaining,
          };
        },
      });
      return result;
    },
    [gameState.ships, dispatch]
  );

  // 星尘购买食物（1星尘→20食物）
  const buyFoodWithStardust = useCallback(
    (qty: number): { success: boolean; message: string } => {
      const ship = gameState.ships[0];
      if (!ship) return { success: false, message: '舰队不存在' };
      if (ship.stardust < qty) return { success: false, message: `星尘不足（需要${qty}星尘）` };
      let result = { success: false, message: '' };
      dispatch({
        type: 'FUNCTIONAL_UPDATE',
        updater: (prev) => {
          const ships = [...prev.ships];
          const s = { ...ships[0] };
          s.stardust -= qty;
          s.food += qty * FOOD_PER_STARDUST;
          if (s.food >= 0 && s.famineTimer > 0 && !s.isRebellion) s.famineTimer = 0;
          result = { success: true, message: `花费${qty}星尘购买了${qty * FOOD_PER_STARDUST}个食物` };
          ships[0] = s;
          return { ...prev, ships };
        },
      });
      return result;
    },
    [gameState.ships, dispatch]
  );

  // 纯函数：计算总资产（不触发更新，按需计算）
  // 复用全局唯一口径（不含售价加成），与系统判定保持一致。
  const computeShipAssets = useCallback(
    (ship: Mothership): number =>
      getShipTotalAssets(ship, gameState.stocks, gameState.materials, gameState.products),
    [gameState.stocks, gameState.materials, gameState.products]
  );

  // ==================== 舰船卡牌战斗（V1.5 §10） ====================
  // P3 只提供「状态 + 动作」（UI 在 P4/P6 接：战斗页签 / 机库页签）。
  // ⚠ 命名提醒：这里是**舰队出征**（START_EXPEDITION），与殖民地领袖远征的 startExpedition（useColony）是两回事，
  //   故出征/取消两个动作用 startBattleExpedition / cancelBattleExpedition 以示区分，勿与殖民地那个混用。
  const createBattleFleet = useCallback((name?: string) => {
    dispatch({ type: 'CREATE_BATTLE_FLEET', name });
  }, []);

  const deleteBattleFleet = useCallback((fleetId: string) => {
    dispatch({ type: 'DELETE_BATTLE_FLEET', fleetId });
  }, []);

  const renameBattleFleet = useCallback((fleetId: string, name: string) => {
    dispatch({ type: 'RENAME_BATTLE_FLEET', fleetId, name });
  }, []);

  const addShipToFleet = useCallback((fleetId: string, shipId: ShipCardId) => {
    dispatch({ type: 'ADD_SHIP_TO_FLEET', fleetId, shipId });
  }, []);

  const removeShipFromFleet = useCallback((fleetId: string, shipId: ShipCardId) => {
    dispatch({ type: 'REMOVE_SHIP_FROM_FLEET', fleetId, shipId });
  }, []);

  const toggleFleetDefending = useCallback((fleetId: string) => {
    dispatch({ type: 'TOGGLE_FLEET_DEFENDING', fleetId });
  }, []);

  const startBattleExpedition = useCallback((bossId: PirateBossId, fleetId: string, turns: number) => {
    dispatch({ type: 'START_EXPEDITION', bossId, fleetId, turns });
  }, []);

  const cancelBattleExpedition = useCallback(() => {
    dispatch({ type: 'CANCEL_EXPEDITION' });
  }, []);

  // ⚠ 这里**故意没有**通用的 startBattle（不把"随便开一场战斗"的能力交给 UI）：
  //   出征战由 useTurn 在出征倒计时归零时自动派发 START_BATTLE（P5）。
  //   玩家唯一能主动点开的战斗是**阶段 B 的掠夺防守战** —— 走下面这个**窄回调**：
  //   它没有参数，bossId 'raid' / kind 'defense' / 参战池 / seed 全部由 reducer 侧的
  //   lib/battle/raid.readyRaidBattle 组装（UI 无从指定目标或编制）。
  const startRaidBattle = useCallback(() => {
    dispatch({ type: 'START_RAID_BATTLE' });
  }, []);

  const battleAction = useCallback((action: BattleAction) => {
    dispatch({ type: 'BATTLE_ACTION', action });
  }, []);

  const endBattle = useCallback(() => {
    dispatch({ type: 'END_BATTLE' });
  }, []);

  /**
   * 造舰（V1.5 §8.3）：下单建造一艘战舰。门槛（船坞等级 / 科技 / 资源）与扣费都在 reducer 里走
   * lib/battle/shipyard.canEnqueue + lib/turn/resourceCost.payCost（UI 的禁用原因读同一份判定）。
   * 同时建造 2 艘、排队无限 —— 入队时由 shipyard.enqueueBuild 决定"立刻开工"还是"排队"。
   */
  const enqueueBuild = useCallback((cardId: ShipCardId) => {
    dispatch({ type: 'ENQUEUE_BUILD', cardId });
  }, []);

  /** 取消**未开工**的排队项（已开工的由 canCancelBuild 挡住；完工由 useTurn 的 advanceQueue 写进卡库） */
  const cancelBuild = useCallback((index: number) => {
    dispatch({ type: 'CANCEL_BUILD', index });
  }, []);

  /** 每个游戏回合调用一次（useTurn 编排）：出征 / 掠夺倒计时各减 1；归零后开战由调用方判断 */
  const tickBattleState = useCallback(() => {
    dispatch({ type: 'TICK_BATTLE_STATE' });
  }, []);

  // 所有对外 action 包成引用稳定的函数（见 useStableActions）。
  // shipIndex 恒为 0 的单舰队接口在此收敛，组件层不再感知 shipIndex 参数。
  const actions = useStableActions({
    // 初始化
    selectShips,

    // 股票
    buyStock,
    sellStock,

    // 原料与生产
    buyMaterial,
    startProduction,
    sellProduct,
    sellProductQty,

    // 回合
    nextTurn,
    fluctuatePrices,

    // 事件
    drawEvent,
    chooseEventOption,
    applyEventResources,
    logEventEntry,
    clearActiveEvent,
    clearEventDodged,

    // 贷款
    takeLoan: (...args: Tail<Parameters<typeof takeLoan>>) => takeLoan(0, ...args),
    repayLoan: (...args: Tail<Parameters<typeof repayLoan>>) => repayLoan(0, ...args),

    // 贸易
    travelToNode: (...args: Tail<Parameters<typeof travelToNode>>) => travelToNode(0, ...args),
    buySpecialty: (...args: Tail<Parameters<typeof buySpecialty>>) => buySpecialty(0, ...args),
    sellSpecialty: (...args: Tail<Parameters<typeof sellSpecialty>>) => sellSpecialty(0, ...args),
    exploreFaction: () => exploreFaction(0),
    investFaction: (...args: Tail<Parameters<typeof investFaction>>) => investFaction(0, ...args),
    gatherIntel: () => gatherIntel(0),
    acceptContract,
    completeContract: (...args: Tail<Parameters<typeof completeContract>>) => completeContract(0, ...args),
    blackMarketBuy: (...args: Tail<Parameters<typeof blackMarketBuy>>) => blackMarketBuy(0, ...args),

    // 考古（星图遗迹）
    startExcavation,
    continueExcavation,
    resolveExcavationChoice,
    steadyExcavation,
    changeExcavationLeader,
    abandonExcavation,

    // 合金/食物购买
    buyAlloy,
    buyFood,

    // 星尘集市
    buyRelic,
    buyRandomMats,
    buySellBonus,
    buyGoldWithStardust,
    rerollPolicy,
    buyFoodWithStardust,

    // 兑换码
    redeemCode,

    // 母舰改造
    installModule: (...args: Tail<Parameters<typeof installModule>>) => installModule(0, ...args),
    useManualModule: (...args: Tail<Parameters<typeof useManualModule>>) => useManualModule(0, ...args),

    // 星际殖民（建立入口统一到星图 foundColony；旧的 3 选 1 星球池已删除）
    foundColony,
    buildColonyBuilding,
    recruitPop,
    assignPop,
    startResearch,
    recruitLeader,
    upgradeLeader,
    rollAndRecruit,
    clearRecruitPool,
    cancelBuilding,
    demolishBuilding,
    selectWonder, submitWonderResources, canStartWonder, completeWonder,
    startExpedition, payExpeditionNode, unlockUltimate,

    // 舰船卡牌战斗（V1.5 §10：机库编队 / 防守标签 / 出征 / 战斗 / 回合推进）
    createBattleFleet,
    deleteBattleFleet,
    renameBattleFleet,
    addShipToFleet,
    removeShipFromFleet,
    toggleFleetDefending,
    startBattleExpedition,
    cancelBattleExpedition,
    startRaidBattle,
    battleAction,
    endBattle,
    tickBattleState,
    // 船坞与造舰（V1.5 §8.2 / §8.3：船坞建筑在殖民地页签建造，造舰在机库页签的船坞面板下单）
    enqueueBuild,
    cancelBuild,

    // 存档
    autoSave,
    hasSave,
    loadSave,
    exportSave,
    importSave,
    resetGame,

    // 计算
    getShipTotalAssets: computeShipAssets,
  });

  return {
    // 状态
    gameState,
    activeEvent,
    eventDodged,
    ...actions,
  };
}

// 重新导出 getShipTotalAssets 纯函数（供组件外部使用）
export { getShipTotalAssets } from '@/lib/game/assets';
