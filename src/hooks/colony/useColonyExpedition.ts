// ==================== 远征动作（开始/支付/解锁终极技能） ====================
// 资源校验与扣减全部读节点数据 cost（不硬编码）；researchPoints 扣殖民地科研点，
// 其余（金币/食物/合金/星尘/原料）扣母舰资源。支付遵循「每回合一次」：paidThisTurn 回合结算重置。

import { useCallback } from 'react';
import type { GameState } from '@/types/game';
import { EXPEDITION_COST, EXPEDITION_UNLOCK_COUNT, getLeaderExpedition } from '@/data/colony/expeditions';
import { getLeaderDef } from '@/data/colony/leaders';
import { getArchaeologySite } from '@/data/galaxy/archaeology';
import { enterExpeditionHistory, recordExpeditionEnding } from '@/lib/colony/expeditionTurn';
import { GOLD_LOG_LIMIT } from '@/data/gameData';
import { findStationedSite } from '@/lib/galaxy/archaeologyTurn';
import { deductResource, firstMissing, payCost } from '@/lib/turn/resourceCost';

interface ExpeditionActions {
  startExpedition: (leaderId: string) => { success: boolean; message: string };
  payExpeditionNode: () => { success: boolean; message: string };
  unlockUltimate: (leaderId: string) => { success: boolean; message: string };
}

export function useColonyExpedition(
  gameState: GameState,
  dispatch: React.Dispatch<{ type: 'FUNCTIONAL_UPDATE'; updater: (state: GameState) => GameState }>
): ExpeditionActions {
  // 开始远征（20,000 金币 + 50 合金，唯一真值 EXPEDITION_COST；未开发领袖提示等待；可重复远征同一领袖收集 12 结局）
  const startExpedition = useCallback((leaderId: string): { success: boolean; message: string } => {
    const ship = gameState.ships[0];
    const colony = ship?.colony;
    if (!colony || colony.phase !== 'active') return { success: false, message: '殖民地未激活，无法远征' };
    if (colony.expedition) return { success: false, message: '已有远征进行中，请先完成当前远征' };
    if (!colony.leaders.some((l) => l.id === leaderId)) return { success: false, message: '该领袖尚未招募' };
    if (!getLeaderExpedition(leaderId)) return { success: false, message: '该领袖的远征故事尚未开启，敬请期待！' };
    // 驻守↔远征互斥：正在考古遗迹驻守的领袖不能同时出征（反向守卫在 useGalaxy.checkDigContext；
    // "是否在驻守"的唯一真值：lib/galaxy/archaeologyTurn.findStationedSite，digging 与 idle 都算驻守）
    const stationed = findStationedSite(ship.galaxy.archaeology, leaderId);
    if (stationed) {
      const siteName = getArchaeologySite(stationed)?.name || stationed;
      return { success: false, message: `该领袖正在「${siteName}」驻守考古遗迹，无法远征` };
    }
    const missing = firstMissing(ship, colony, EXPEDITION_COST);
    if (missing) return { success: false, message: missing };

    let result = { success: false, message: '' };
    dispatch({
      type: 'FUNCTIONAL_UPDATE',
      updater: (prev) => {
        const ships = [...prev.ships];
        const s = { ...ships[0], colony: { ...ships[0].colony! } };
        payCost(s, s.colony, EXPEDITION_COST);
        // 金币支付记入金币日志（与其它扣款口径一致）
        if (EXPEDITION_COST.gold) {
          const ld = getLeaderDef(leaderId);
          s.goldLog = [{ turn: prev.turn, amount: -EXPEDITION_COST.gold, reason: `开启远征「${ld?.name || leaderId}」`, balanceAfter: s.gold }, ...s.goldLog].slice(0, GOLD_LOG_LIMIT);
        }
        s.colony = {
          ...s.colony,
          expedition: { leaderId, stage: 0, currentNodeId: null, paidThisTurn: false, startedTurn: prev.turn, endingId: null, history: [] },
        };
        ships[0] = s;
        result = { success: true, message: '远征准备就绪，下回合登陆！' };
        return { ...prev, ships };
      },
    });
    return result;
  }, [gameState.ships, dispatch]);

  // 支付当前节点资源（B/C/D 层；每回合一次；不足提示资源不足）
  const payExpeditionNode = useCallback((): { success: boolean; message: string } => {
    const ship = gameState.ships[0];
    const colony = ship?.colony;
    const ex = colony?.expedition;
    if (!ex) return { success: false, message: '没有进行中的远征' };
    if (ex.stage < 3 || ex.stage > 5) return { success: false, message: '当前阶段无需支付' };
    if (ex.paidThisTurn) return { success: false, message: '本回合已支付，请结束回合推进' };
    const route = getLeaderExpedition(ex.leaderId);
    const node = ex.currentNodeId ? route?.nodes[ex.currentNodeId] : undefined;
    const cost = node?.cost;
    if (!node || !cost) return { success: false, message: '当前节点无需支付' };

    // 资源校验（口径唯一真值：lib/turn/resourceCost.ts，与考古共用）
    const missing = firstMissing(ship, colony, cost);
    if (missing) return { success: false, message: missing };

    let result = { success: false, message: '' };
    dispatch({
      type: 'FUNCTIONAL_UPDATE',
      updater: (prev) => {
        const ships = [...prev.ships];
        const s = { ...ships[0], colony: { ...ships[0].colony! } };
        const c = { ...s.colony, expedition: { ...s.colony.expedition! } };
        for (const [key, amount] of Object.entries(cost)) {
          deductResource(s, c, key, amount);
        }
        // 金币支付记入金币日志（与其他扣款口径一致）
        if (cost.gold) {
          s.goldLog = [{ turn: prev.turn, amount: -cost.gold, reason: `远征「${node.title}」支付`, balanceAfter: s.gold }, ...s.goldLog].slice(0, GOLD_LOG_LIMIT);
        }
        c.expedition = { ...c.expedition, paidThisTurn: true };
        // 结局节点：支付即记账（写入 expeditionEndings + 记入剧情回顾），回合结算收尾时再幂等兜底一次；
        // 避免「付了 20000 金币但没点结束回合就退出」导致结局白付
        if (node.isEnding) {
          enterExpeditionHistory(c, node.id);
          recordExpeditionEnding(c, ex.leaderId, node.id);
        }
        s.colony = c;
        ships[0] = s;
        result = { success: true, message: `已支付，解锁「${node.title}」！` };
        return { ...prev, ships };
      },
    });
    return result;
  }, [gameState.ships, dispatch]);

  // 解锁终极技能（需 12/12 结局 + 领袖 Lv3；数据驱动 leaderDef.ultimateSkill）
  const unlockUltimate = useCallback((leaderId: string): { success: boolean; message: string } => {
    const colony = gameState.ships[0]?.colony;
    if (!colony) return { success: false, message: '殖民地未激活' };
    const endings = colony.expeditionEndings?.[leaderId] || [];
    if (endings.length < EXPEDITION_UNLOCK_COUNT) return { success: false, message: `需收集 ${EXPEDITION_UNLOCK_COUNT} 个结局（当前 ${endings.length}/${EXPEDITION_UNLOCK_COUNT}）` };
    if (colony.expeditionUnlocks?.includes(leaderId)) return { success: false, message: '该领袖终极技能已解锁' };
    const ld = getLeaderDef(leaderId);
    if (!ld?.ultimateSkill) return { success: false, message: '该领袖暂无终极技能' };
    // Lv3 门槛：终极加成按 Lv3 键集结算，故解锁时要求领袖已满级
    const leaderInst = (colony.leaders || []).find((x) => x.id === leaderId);
    if (!leaderInst) return { success: false, message: '该领袖尚未招募' };
    if (leaderInst.level < 3) return { success: false, message: `需先将该领袖升至 Lv3（当前 Lv${leaderInst.level}）` };

    let result = { success: false, message: '' };
    dispatch({
      type: 'FUNCTIONAL_UPDATE',
      updater: (prev) => {
        const ships = [...prev.ships];
        const s = { ...ships[0], colony: { ...ships[0].colony! } };
        s.colony = {
          ...s.colony,
          expeditionUnlocks: [...(s.colony.expeditionUnlocks || []), leaderId],
        };
        ships[0] = s;
        result = { success: true, message: `终极技能「${ld.ultimateSkill!.name}」已解锁！` };
        return { ...prev, ships };
      },
    });
    return result;
  }, [gameState.ships, dispatch]);

  return { startExpedition, payExpeditionNode, unlockUltimate };
}
