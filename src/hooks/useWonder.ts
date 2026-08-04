import { useCallback } from 'react';
import { getWonderDef } from '@/data/colony/wonders';
import type { GameState } from '@/types/game';
import type { WonderState } from '@/types/colony';

interface WonderActions {
  selectWonder: (wonderId: string) => { success: boolean; message: string };
  submitWonderResources: () => { success: boolean; message: string };
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
        s.colony = { ...s.colony, wonder: newWS };
        ships[0] = s;
        result = { success: true, message: `开始建造「${wonder.name}」！` };
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

  return { selectWonder, submitWonderResources, canStartWonder, completeWonder };
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

  // 阶段切换
  if (newStage < wonder.stages.length && newProgress >= wonder.stages[newStage].turns) {
    newProgress = 0;
    newStage++;
  }

  const newWS: WonderState = {
    ...ws,
    currentStage: newStage,
    stageProgress: newProgress,
    totalTurnsSpent: newTotal,
    submittedThisTurn: false,
    eventPending: null,
    eventHistory: [...ws.eventHistory, `第${newTotal}回合：${wonder.stages[ws.currentStage]?.name || ''}进度 +1`],
  };

  ship.colony.wonder = newWS;
}
