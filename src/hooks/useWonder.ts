import { useCallback } from 'react';
import { getWonderDef, toStageCost } from '@/data/colony/wonders';
import { firstMissing, payCost } from '@/lib/turn/resourceCost';
import type { GameState } from '@/types/game';
import type { WonderState } from '@/types/colony';
import { pushGoldLog } from '@/lib/turn/goldLog';

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
          currentStage: 0, stageProgress: 0,
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
        if (ws.submittedThisTurn) { result = { success: false, message: '本回合已提交资源，请结束回合后再来' }; return prev; }

        const wonder = getWonderDef(ws.selectedWonderId);
        if (!wonder) { result = { success: false, message: '奇观数据错误' }; return prev; }
        const stage = wonder.stages[ws.currentStage];
        if (!stage) { result = { success: false, message: '已是最终阶段' }; return prev; }

        // 资源校验与扣减的唯一真值：toStageCost（把阶段的 11 个扁平字段摊平成 cost 对象）
        // + lib/turn/resourceCost 的 firstMissing/payCost（科研点扣殖民地、其余扣母舰，与远征/考古同口径）。
        // 历史上这里是手写的 11 项检查 + 11 项扣减，且面板另写一套 → 两处文案与顺序都不同。
        const cost = toStageCost(stage);
        const missing = firstMissing(s, s.colony, cost);
        if (missing) { result = { success: false, message: missing }; return prev; }

        payCost(s, s.colony, cost);
        if (cost.gold > 0) {
          pushGoldLog(s, prev.turn, -cost.gold, `奇观「${wonder.name}」${stage.name}`);
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
        const wonder = ws?.selectedWonderId ? getWonderDef(ws.selectedWonderId) : undefined;
        if (!ws || !wonder || ws.currentStage < wonder.stages.length) {
          result = { success: false, message: '奇观尚未建设完成' };
          return prev;
        }
        result = { success: true, message: `🎉 奇观「${wonder.name}」建成！` };
        return { ...prev, gameWon: true, wonWonderName: wonder.name };
      },
    });
    return result;
  }, [dispatch]);

  return { selectWonder, submitWonderResources, canStartWonder, completeWonder };
}
