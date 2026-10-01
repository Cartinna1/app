// ==================== 考古动作（开始 / 继续 / 抉择 / 稳妥推进 / 换人 / 中止） ====================
// 阶段花费在"开始或继续某一阶段"时支付（口径：lib/turn/resourceCost.ts，与远征共用）。
// 回合推进（倒计时、成功率判定、危险）在 lib/galaxy/archaeologyTurn.ts，由 useTurn 每回合调用。

import { useCallback } from 'react';
import type { GameState } from '@/types/game';
import { getArchaeologySite } from '@/data/galaxy/archaeology';
import { getGalaxyNode } from '@/data/galaxy/nodes';
import { firstMissing, flattenCost, payCost } from '@/lib/turn/resourceCost';
import { resolveStage, canOpenExcavation } from '@/lib/galaxy/archaeologyTurn';

interface GalaxyActions {
  startExcavation: (siteId: string, leaderId: string) => { success: boolean; message: string };
  continueExcavation: (siteId: string) => { success: boolean; message: string };
  resolveExcavationChoice: (siteId: string, kind: 'safe' | 'risky') => { success: boolean; message: string };
  steadyExcavation: (siteId: string) => { success: boolean; message: string };
  changeExcavationLeader: (siteId: string, leaderId: string) => { success: boolean; message: string };
  abandonExcavation: (siteId: string) => { success: boolean; message: string };
}

export function useGalaxy(
  gameState: GameState,
  dispatch: React.Dispatch<{ type: 'FUNCTIONAL_UPDATE'; updater: (state: GameState) => GameState }>
): GalaxyActions {
  /** 通用前置校验：遗迹存在 + 母舰停在该遗迹星系 + 驻守领袖合规 */
  const checkDigContext = (siteId: string, leaderId: string): string | null => {
    const ship = gameState.ships[0];
    if (!ship) return '舰队不存在';
    const site = getArchaeologySite(siteId);
    if (!site) return '遗迹数据缺失';
    const node = getGalaxyNode(ship.galaxy.currentNodeId);
    if (node?.siteId !== siteId) return '母舰不在该遗迹星系，请先跃迁抵达';
    const leaders = ship.colony?.leaders || [];
    if (leaders.length === 0) return '需要先建立殖民地并招募领袖，才能派出考古队';
    const leader = leaders.find((l) => l.id === leaderId);
    if (!leader) return '驻守领袖不存在';
    if (site.minLeaderLevel > 0 && leader.level < site.minLeaderLevel) {
      return `该遗迹需驻守领袖达到 Lv${site.minLeaderLevel}（当前 Lv${leader.level}）`;
    }
    for (const [id, st] of Object.entries(ship.galaxy.archaeology || {})) {
      if (id !== siteId && st.status === 'digging' && st.leaderId === leaderId) {
        return '该领袖正在驻守另一处遗迹';
      }
    }
    if (ship.colony?.expedition?.leaderId === leaderId) return '该领袖正在远征中，无法驻守遗迹';
    return null;
  };

  /** 开始发掘（支付第 1 阶段投入） */
  const startExcavation = useCallback((siteId: string, leaderId: string): { success: boolean; message: string } => {
    const ctxError = checkDigContext(siteId, leaderId);
    if (ctxError) return { success: false, message: ctxError };
    const ship0 = gameState.ships[0];
    // 同一时间只能发掘一处（规则唯一实现：lib/galaxy/archaeologyTurn.canOpenExcavation）
    const busy = canOpenExcavation(ship0, siteId);
    if (busy) return { success: false, message: busy };
    const site = getArchaeologySite(siteId)!;
    const stage = site.stages[0];
    const cost = flattenCost(stage.cost);
    const missing = firstMissing(ship0, ship0.colony, cost);
    if (missing) return { success: false, message: missing };
    let result = { success: false, message: '' };
    dispatch({
      type: 'FUNCTIONAL_UPDATE',
      updater: (prev) => {
        const ships = [...prev.ships];
        const s = { ...ships[0], colony: ships[0].colony ? { ...ships[0].colony } : ships[0].colony };
        const g = { ...s.galaxy, archaeology: { ...s.galaxy.archaeology } };
        payCost(s, s.colony, cost);
        g.archaeology[siteId] = {
          leaderId,
          stageIndex: 0,
          turnsLeft: stage.turns,
          fails: 0,
          status: 'digging',
          pendingChoice: stage.choice ? stage.id : null,
          choiceKind: null,
        };
        s.galaxy = g;
        ships[0] = s;
        result = { success: true, message: `考古队已进驻「${site.name}」，开始第 1 阶段` };
        return { ...prev, ships };
      },
    });
    return result;
  }, [gameState, dispatch]);

  /** 继续下一阶段（上一阶段已完成，支付该阶段投入） */
  const continueExcavation = useCallback((siteId: string): { success: boolean; message: string } => {
    const ship0 = gameState.ships[0];
    const site = getArchaeologySite(siteId);
    if (!ship0 || !site) return { success: false, message: '遗迹数据缺失' };
    const st = ship0.galaxy.archaeology?.[siteId];
    if (!st) return { success: false, message: '尚未开始发掘' };
    if (st.status === 'done') return { success: false, message: '此处遗迹已完成' };
    if (st.status === 'digging') return { success: false, message: '该阶段正在发掘中' };
    const stage = site.stages[st.stageIndex];
    if (!stage) return { success: false, message: '没有可继续的阶段' };
    const cost = flattenCost(stage.cost);
    const missing = firstMissing(ship0, ship0.colony, cost);
    if (missing) return { success: false, message: missing };
    let result = { success: false, message: '' };
    dispatch({
      type: 'FUNCTIONAL_UPDATE',
      updater: (prev) => {
        const ships = [...prev.ships];
        const s = { ...ships[0], colony: ships[0].colony ? { ...ships[0].colony } : ships[0].colony };
        const g = { ...s.galaxy, archaeology: { ...s.galaxy.archaeology } };
        payCost(s, s.colony, cost);
        g.archaeology[siteId] = {
          ...st,
          status: 'digging',
          turnsLeft: stage.turns,
          fails: 0,
          pendingChoice: stage.choice ? stage.id : null,
          choiceKind: null,
        };
        s.galaxy = g;
        ships[0] = s;
        result = { success: true, message: `已投入资源，第 ${st.stageIndex + 1} 阶段开始` };
        return { ...prev, ships };
      },
    });
    return result;
  }, [gameState, dispatch]);

  /** 阶段抉择（safe：成功率 +10%、小奖励减半；risky：小奖励翻倍、失败必触发危险） */
  const resolveExcavationChoice = useCallback((siteId: string, kind: 'safe' | 'risky'): { success: boolean; message: string } => {
    const ship0 = gameState.ships[0];
    const st = ship0?.galaxy.archaeology?.[siteId];
    if (!st) return { success: false, message: '尚未开始发掘' };
    if (!st.pendingChoice) return { success: false, message: '当前阶段没有待抉择' };
    let result = { success: false, message: '' };
    dispatch({
      type: 'FUNCTIONAL_UPDATE',
      updater: (prev) => {
        const ships = [...prev.ships];
        const s = { ...ships[0] };
        const g = { ...s.galaxy, archaeology: { ...s.galaxy.archaeology } };
        g.archaeology[siteId] = { ...st, pendingChoice: null, choiceKind: kind };
        s.galaxy = g;
        ships[0] = s;
        result = { success: true, message: kind === 'safe' ? '已选择稳妥方案' : '已选择冒险方案' };
        return { ...prev, ships };
      },
    });
    return result;
  }, [gameState, dispatch]);

  /** 稳妥推进：连续失败 2 次后可用，必定成功但阶段小奖励减半、耗时 +1 */
  const steadyExcavation = useCallback((siteId: string): { success: boolean; message: string } => {
    const ship0 = gameState.ships[0];
    const site = getArchaeologySite(siteId);
    if (!ship0 || !site) return { success: false, message: '遗迹数据缺失' };
    const st = ship0.galaxy.archaeology?.[siteId];
    if (!st || st.status !== 'digging') return { success: false, message: '当前没有进行中的发掘' };
    if (st.pendingChoice) return { success: false, message: '请先完成本阶段的抉择' };
    if (st.fails < 2) return { success: false, message: '连续失败 2 次后才能稳妥推进' };
    let result = { success: false, message: '' };
    dispatch({
      type: 'FUNCTIONAL_UPDATE',
      updater: (prev) => {
        const ships = [...prev.ships];
        const s = { ...ships[0], colony: ships[0].colony ? { ...ships[0].colony } : ships[0].colony };
        // 阶段推进（含奖励发放与日志）由 lib/galaxy/archaeologyTurn.resolveStage 统一处理
        resolveStage(s, site, st.stageIndex, { forced: true, bonusMult: 0.5 });
        ships[0] = s;
        result = { success: true, message: '稳妥推进完成，阶段奖励减半' };
        return { ...prev, ships };
      },
    });
    return result;
  }, [gameState, dispatch]);

  /** 更换驻守领袖（当前阶段耗时 +1，进度保留） */
  const changeExcavationLeader = useCallback((siteId: string, leaderId: string): { success: boolean; message: string } => {
    const ctxError = checkDigContext(siteId, leaderId);
    if (ctxError) return { success: false, message: ctxError };
    const ship0 = gameState.ships[0];
    const st = ship0.galaxy.archaeology?.[siteId];
    if (!st) return { success: false, message: '尚未开始发掘' };
    let result = { success: false, message: '' };
    dispatch({
      type: 'FUNCTIONAL_UPDATE',
      updater: (prev) => {
        const ships = [...prev.ships];
        const s = { ...ships[0] };
        const g = { ...s.galaxy, archaeology: { ...s.galaxy.archaeology } };
        g.archaeology[siteId] = { ...st, leaderId, turnsLeft: st.turnsLeft + 1 };
        s.galaxy = g;
        ships[0] = s;
        result = { success: true, message: '已更换驻守领袖（当前阶段耗时 +1）' };
        return { ...prev, ships };
      },
    });
    return result;
  }, [gameState, dispatch]);

  /** 中止发掘（保留进度，可随时回来继续） */
  const abandonExcavation = useCallback((siteId: string): { success: boolean; message: string } => {
    const ship0 = gameState.ships[0];
    const st = ship0?.galaxy.archaeology?.[siteId];
    if (!st) return { success: false, message: '尚未开始发掘' };
    if (st.status === 'done') return { success: false, message: '此处遗迹已完成' };
    let result = { success: false, message: '' };
    dispatch({
      type: 'FUNCTIONAL_UPDATE',
      updater: (prev) => {
        const ships = [...prev.ships];
        const s = { ...ships[0] };
        const g = { ...s.galaxy, archaeology: { ...s.galaxy.archaeology } };
        g.archaeology[siteId] = { ...st, status: 'idle', pendingChoice: null };
        s.galaxy = g;
        ships[0] = s;
        result = { success: true, message: '已中止发掘，进度保留' };
        return { ...prev, ships };
      },
    });
    return result;
  }, [gameState, dispatch]);

  return { startExcavation, continueExcavation, resolveExcavationChoice, steadyExcavation, changeExcavationLeader, abandonExcavation };
}
