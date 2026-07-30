import { useCallback } from 'react';
import { getWonderDef, rollWonderEvent } from '@/data/colony/wonders';
import type { GameState } from '@/types/game';
import type { WonderState } from '@/types/colony';

interface WonderActions {
  selectWonder: (wonderId: string) => { success: boolean; message: string };
  submitWonderResources: () => { success: boolean; message: string };
  handleWonderEvent: (choice: 'A' | 'B') => { success: boolean; message: string };
  canStartWonder: () => { success: boolean; reasons: string[] };
  completeWonder: () => { success: boolean; message: string };
}

export function useWonder(
  _gameState: GameState,
  dispatch: React.Dispatch<{ type: 'FUNCTIONAL_UPDATE'; updater: (state: GameState) => GameState }>
): WonderActions {

  const canStartWonder = useCallback(() => {
    const reasons: string[] = [];
    const ship = _gameState.ships[0];
    if (!ship?.colony) {
      reasons.push('尚未解锁殖民地');
      return { success: false, reasons };
    }
    const c = ship.colony;
    const researchedCount = c.techState?.researched?.length || 0;
    if (researchedCount < 10) reasons.push(`科技研究不足（当前 ${researchedCount}/10）`);
    if (!c.techState?.researched?.includes('T25')) reasons.push('尚未研发「星河奇迹」科技');
    if (c.population.total < 20) reasons.push(`殖民地人口不足（当前 ${c.population.total}/20）`);
    return { success: reasons.length === 0, reasons };
  }, [_gameState.ships]);

  const selectWonder = useCallback((wonderId: string): { success: boolean; message: string } => {
    const { success, reasons } = canStartWonder();
    if (!success) return { success: false, message: `条件未满足：${reasons.join('；')}` };
    const wonder = getWonderDef(wonderId);
    if (!wonder) return { success: false, message: '无效的奇观 ID' };
    let result = { success: false, message: '' };
    dispatch({
      type: 'FUNCTIONAL_UPDATE',
      updater: (prev) => {
        const ships = [...prev.ships];
        const s = { ...ships[0], colony: { ...ships[0].colony! } };
        const newWS: WonderState = {
          phase: 'building', selectedWonderId: wonderId as WonderState['selectedWonderId'],
          currentStage: 0, stageProgress: 0, eventPending: null,
          totalTurnsSpent: 0, eventHistory: [], submittedThisTurn: false,
        };
        const ev = rollWonderEvent();
        newWS.eventPending = ev.id;
        newWS.eventHistory = [`[阶段1开始] 触发事件：${ev.name}`];
        s.colony = { ...s.colony, wonder: newWS };
        ships[0] = s;
        result = { success: true, message: `开始建造「${wonder.name}」！触发事件：${ev.name}` };
        return { ...prev, ships };
      },
    });
    return result;
  }, [canStartWonder, dispatch]);

  /** 提交本回合资源（仅扣资源+标记已提交，推进由回合处理结算） */
  const submitWonderResources = useCallback((): { success: boolean; message: string } => {
    let result = { success: false, message: '' };
    dispatch({
      type: 'FUNCTIONAL_UPDATE',
      updater: (prev) => {
        const ships = [...prev.ships];
        const s = { ...ships[0], colony: { ...ships[0].colony! } };
        const ws = s.colony.wonder;
        if (!ws || !ws.selectedWonderId) { result = { success: false, message: '尚未选择奇观' }; return prev; }
        if (ws.eventPending) { result = { success: false, message: '有事件待处理，请先处理事件' }; return prev; }
        if (ws.submittedThisTurn) { result = { success: false, message: '本回合已提交资源，请结束回合后再来' }; return prev; }

        const wonder = getWonderDef(ws.selectedWonderId);
        if (!wonder) { result = { success: false, message: '奇观数据错误' }; return prev; }
        const stage = wonder.stages[ws.currentStage];
        if (!stage) { result = { success: false, message: '已是最终阶段' }; return prev; }

        // 资源检查
        const checks: string[] = [];
        if (stage.gold > 0 && s.gold < stage.gold) checks.push(`金币不足（${s.gold}/${stage.gold}）`);
        if (stage.alloy > 0 && s.alloy < stage.alloy) checks.push(`合金不足（${s.alloy}/${stage.alloy}）`);
        if (stage.silicon > 0 && (s.materials.silicon || 0) < stage.silicon) checks.push(`硅片不足`);
        if (stage.quantum > 0 && (s.materials.quantum || 0) < stage.quantum) checks.push(`量子簇不足`);
        if (stage.dark_matter > 0 && (s.materials.dark_matter || 0) < stage.dark_matter) checks.push(`暗物质不足`);
        if (stage.stardust > 0 && s.stardust < stage.stardust) checks.push(`星尘不足`);
        if (stage.food > 0 && s.food < stage.food) checks.push(`食物不足`);
        if (stage.carbon > 0 && (s.materials.carbon || 0) < stage.carbon) checks.push(`碳块不足`);
        if (stage.oil > 0 && (s.materials.oil || 0) < stage.oil) checks.push(`石油不足`);
        if (stage.gold_ore > 0 && (s.materials.gold_ore || 0) < stage.gold_ore) checks.push(`金矿不足`);
        if (stage.research > 0 && (s.colony.techState?.researchPoints || 0) < stage.research) checks.push(`科研点不足`);

        if (checks.length > 0) { result = { success: false, message: checks.join('；') }; return prev; }

        // 扣除资源
        if (stage.gold > 0) { s.gold -= stage.gold; s.goldLog = [{ turn: prev.turn, amount: -stage.gold, reason: `奇观「${wonder.name}」${stage.name}`, balanceAfter: s.gold }, ...(s.goldLog || [])].slice(0, 200); }
        if (stage.alloy > 0) s.alloy -= stage.alloy;
        if (stage.stardust > 0) s.stardust -= stage.stardust;
        if (stage.food > 0) s.food -= stage.food;
        s.materials = { ...s.materials };
        if (stage.silicon > 0) s.materials.silicon = (s.materials.silicon || 0) - stage.silicon;
        if (stage.quantum > 0) s.materials.quantum = (s.materials.quantum || 0) - stage.quantum;
        if (stage.dark_matter > 0) s.materials.dark_matter = (s.materials.dark_matter || 0) - stage.dark_matter;
        if (stage.carbon > 0) s.materials.carbon = (s.materials.carbon || 0) - stage.carbon;
        if (stage.oil > 0) s.materials.oil = (s.materials.oil || 0) - stage.oil;
        if (stage.gold_ore > 0) s.materials.gold_ore = (s.materials.gold_ore || 0) - stage.gold_ore;
        if (stage.research > 0 && s.colony.techState) {
          s.colony = { ...s.colony, techState: { ...s.colony.techState, researchPoints: s.colony.techState.researchPoints - stage.research } };
        }

        s.colony = { ...s.colony, wonder: { ...ws, submittedThisTurn: true } };
        ships[0] = s;
        result = { success: true, message: `资源已缴纳！请结束回合以推进建设。` };
        return { ...prev, ships };
      },
    });
    return result;
  }, [dispatch]);

  /** 处理奇观事件（即时生效） */
  const handleWonderEvent = useCallback((choice: 'A' | 'B'): { success: boolean; message: string } => {
    let result = { success: false, message: '' };
    dispatch({
      type: 'FUNCTIONAL_UPDATE',
      updater: (prev) => {
        const ships = [...prev.ships];
        const s = { ...ships[0], colony: { ...ships[0].colony! } };
        const ws = s.colony.wonder;
        if (!ws || !ws.eventPending) { result = { success: false, message: '没有待处理事件' }; return prev; }

        const wonder = getWonderDef(ws.selectedWonderId!);
        if (!wonder) { result = { success: false, message: '奇观数据错误' }; return prev; }

        let newProgress = ws.stageProgress;
        let newStage = ws.currentStage;
        let historyMsg = '';

        // 跨阶段进度调整（正数为推进，负数为倒退）
        const applyProgressDelta = (delta: number) => {
          let p = newProgress + delta;
          let s = newStage;
          if (p >= 0) {
            // 正向溢出：前进到后续阶段
            while (s < wonder.stages.length && p >= wonder.stages[s].turns) {
              p -= wonder.stages[s].turns;
              s++;
            }
          } else {
            // 负向溢出：退回到前面阶段
            while (s > 0 && p < 0) {
              s--;
              p += wonder.stages[s].turns;
            }
            if (p < 0) { p = 0; s = 0; } // 不能退到第一阶段之前
          }
          newStage = s;
          newProgress = p;
        };

        switch (ws.eventPending) {
          case 'tech_breakthrough':
            if (choice === 'A' && s.gold >= 5000) {
              s.gold -= 5000;
              s.goldLog = [{ turn: prev.turn, amount: -5000, reason: '奇观事件：技术突破', balanceAfter: s.gold }, ...(s.goldLog || [])].slice(0, 200);
              applyProgressDelta(3); historyMsg = '技术突破：投入5,000金币，��度+3';
            } else if (choice === 'A') { result = { success: false, message: '金币不足5000' }; return prev; }
            else { historyMsg = '技术突破：选择放弃'; }
            break;
          case 'construction_accident':
            if (choice === 'A' && s.alloy >= 30) { s.alloy -= 30; historyMsg = '施工事故：花费30合金抢修'; }
            else if (choice === 'A') { result = { success: false, message: '合金不足30' }; return prev; }
            else { applyProgressDelta(-2); historyMsg = '施工事故：倒退2回合'; }
            break;
          case 'faction_intervention':
            if (choice === 'A' && s.gold >= 10000) {
              s.gold -= 10000; s.goldLog = [{ turn: prev.turn, amount: -10000, reason: '奇观事件：势力干预', balanceAfter: s.gold }, ...(s.goldLog || [])].slice(0, 200);
              historyMsg = '势力干预：支付10,000金币';
            } else if (choice === 'A') { result = { success: false, message: '金币不足10000' }; return prev; }
            else { historyMsg = '势力干预：拒绝赔偿（后续暂停进度由下一回合决定）'; }
            break;
          case 'unexpected_discovery':
            if (choice === 'A') { applyProgressDelta(4); historyMsg = '意外之喜：进度+4'; }
            else { if (s.colony.techState) { s.colony = { ...s.colony, techState: { ...s.colony.techState, researchPoints: (s.colony.techState.researchPoints || 0) + 20 } }; } historyMsg = '意外之喜：获得20科研点'; }
            break;
          case 'plague_outbreak':
            if (choice === 'A' && s.food >= 200) { s.food -= 200; historyMsg = '瘟疫爆发：花费200食物隔离'; }
            else if (choice === 'A') { result = { success: false, message: '食物不足200' }; return prev; }
            else { s.colony = { ...s.colony, population: { ...s.colony.population, total: Math.max(0, s.colony.population.total - 3), available: Math.max(0, s.colony.population.available - 3) } }; applyProgressDelta(-1); historyMsg = '瘟疫爆发：死亡3人口，倒退1回合'; }
            break;
          case 'sabotage':
            if (choice === 'A' && s.gold >= 5000) {
              s.gold -= 5000; s.goldLog = [{ turn: prev.turn, amount: -5000, reason: '奇观事件：增援安保', balanceAfter: s.gold }, ...(s.goldLog || [])].slice(0, 200);
              historyMsg = '破坏行动：花费5,000金币安保';
            } else if (choice === 'A') { result = { success: false, message: '金币不足5000' }; return prev; }
            else { const activeB = s.colony.buildings.filter((b: any) => b.active && b.defId !== 'B27'); if (activeB.length > 0) { const victim = activeB[Math.floor(Math.random() * activeB.length)]; s.colony = { ...s.colony, buildings: s.colony.buildings.filter((b: any) => b.uid !== victim.uid) }; } applyProgressDelta(-3); historyMsg = '破坏行动：损失1座建筑，倒退3回合'; }
            break;
          case 'leader_sacrifice':
            if (choice === 'A') { const l3 = s.colony.leaders.findIndex((l: any) => l.level >= 3); if (l3 >= 0) { s.colony = { ...s.colony, leaders: s.colony.leaders.filter((_: any, i: number) => i !== l3) }; applyProgressDelta(8); historyMsg = '领袖献身：永久离开，进度+8'; } else { result = { success: false, message: '没有3级领袖' }; return prev; } }
            else { historyMsg = '领袖献身：婉拒'; }
            break;
        }

        // 完成检测
          s.colony = { ...s.colony, wonder: { ...ws, eventPending: null, currentStage: newStage, stageProgress: 0, eventHistory: [...ws.eventHistory, `[事件] ${historyMsg}`, '[胜利] 奇观完成！'] } };
          ships[0] = s; result = { success: true, message: '🎉 奇观建设完成！你赢得了胜利！' }; return { ...prev, ships };
        }

        const newWS: WonderState = { ...ws, currentStage: newStage, stageProgress: newProgress, eventPending: null, eventHistory: [...ws.eventHistory, `[事件] ${historyMsg}`] };
        s.colony = { ...s.colony, wonder: newWS };
        ships[0] = s;
        result = { success: true, message: `事件已处理：${historyMsg}` };
        return { ...prev, ships };
      },
    });
    return result;
  }, [dispatch]);

  /** 确认建成奇观，结束游戏 */
  const completeWonder = useCallback((): { success: boolean; message: string } => {
    let result = { success: false, message: '' };
    dispatch({
      type: 'FUNCTIONAL_UPDATE',
      updater: (prev) => {
        const ship = prev.ships[0];
        const ws = ship?.colony?.wonder;
        if (!ws || !ws.selectedWonderId || ws.currentStage < 8) {
          result = { success: false, message: '奇观尚未建设完成' };
          return prev;
        }
        const wonder = getWonderDef(ws.selectedWonderId);
        result = { success: true, message: `🎉 奇观「${wonder?.name || ''}」建成！` };
        return { ...prev, gameWon: true, wonWonderName: wonder?.name || '' };
      },
    });
    return result;
  }, [dispatch]);

  return { selectWonder, submitWonderResources, handleWonderEvent, canStartWonder, completeWonder };
}

/** 由 processColonyTurn 调用：结算奇观推进 */
export function processWonderTurn(ship: any, _turn: number): void {
  const ws = ship.colony?.wonder;
  if (!ws || ws.phase !== 'building' || !ws.selectedWonderId) return;
  if (!ws.submittedThisTurn) { return; }

  const wonder = getWonderDef(ws.selectedWonderId);
  if (!wonder) return;

  let newStage = ws.currentStage;
  let newProgress = ws.stageProgress + 1;
  let newTotal = ws.totalTurnsSpent + 1;
  let eventNote = '';
  let newEvent: ReturnType<typeof rollWonderEvent> | null = null;

  // 阶段切换
  if (newStage < wonder.stages.length && newProgress >= wonder.stages[newStage].turns) {
    newProgress = 0;
    newStage++;
    if (newStage < wonder.stages.length) {
      newEvent = rollWonderEvent();
      eventNote = `\n⚠ 新事件：${newEvent.name}`;
    }
  }

  const newWS: WonderState = {
    ...ws,
    currentStage: newStage,
    stageProgress: newProgress,
    totalTurnsSpent: newTotal,
    submittedThisTurn: false,
    eventPending: newEvent ? newEvent.id : null,
    eventHistory: [...ws.eventHistory, `第${newTotal}回合：${wonder.stages[ws.currentStage]?.name || ''}进度 +1${eventNote}`],
  };

  ship.colony.wonder = newWS;
}
