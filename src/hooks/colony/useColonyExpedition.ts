// ==================== 远征动作（开始/支付/解锁终极技能） ====================
// 资源校验与扣减全部读节点数据 cost（不硬编码）；researchPoints 扣殖民地科研点，
// 其余（金币/食物/合金/星尘/原料）扣母舰资源。支付遵循「每回合一次」：paidThisTurn 回合结算重置。

import { useCallback } from 'react';
import type { GameState } from '@/types/game';
import type { Colony } from '@/types/colony';
import { EXPEDITION_COST, RESOURCE_LABELS, getLeaderExpedition } from '@/data/colony/expeditions';
import { getLeaderDef } from '@/data/colony/leaders';

interface ExpeditionActions {
  startExpedition: (leaderId: string) => { success: boolean; message: string };
  payExpeditionNode: () => { success: boolean; message: string };
  unlockUltimate: (leaderId: string) => { success: boolean; message: string };
}

/** 当前持有量（按资源 key） */
function resourceAmount(s: GameState['ships'][0], colony: Colony, key: string): number {
  switch (key) {
    case 'gold': return s.gold;
    case 'food': return s.food;
    case 'alloy': return s.alloy;
    case 'stardust': return s.stardust;
    case 'researchPoints': return colony.techState?.researchPoints || 0;
    default: return (s.materials && s.materials[key]) || 0; // silicon/quantum/carbon/dark_matter 等
  }
}

/** 扣减（调用方已克隆 s 与 colony，直接改写） */
function deductResource(s: GameState['ships'][0], colony: Colony, key: string, amount: number): void {
  switch (key) {
    case 'gold': s.gold -= amount; break;
    case 'food': s.food -= amount; break;
    case 'alloy': s.alloy -= amount; break;
    case 'stardust': s.stardust -= amount; break;
    case 'researchPoints':
      if (colony.techState) colony.techState = { ...colony.techState, researchPoints: colony.techState.researchPoints - amount };
      break;
    default:
      s.materials = { ...s.materials, [key]: ((s.materials && s.materials[key]) || 0) - amount };
      break;
  }
}

export function useColonyExpedition(
  gameState: GameState,
  dispatch: React.Dispatch<{ type: 'FUNCTIONAL_UPDATE'; updater: (state: GameState) => GameState }>
): ExpeditionActions {
  // 开始远征（30 星尘；未开发领袖提示等待；可重复远征同一领袖收集 12 结局）
  const startExpedition = useCallback((leaderId: string): { success: boolean; message: string } => {
    const ship = gameState.ships[0];
    const colony = ship?.colony;
    if (!colony || colony.phase !== 'active') return { success: false, message: '殖民地未激活，无法远征' };
    if (colony.expedition) return { success: false, message: '已有远征进行中，请先完成当前远征' };
    if (!colony.leaders.some((l) => l.id === leaderId)) return { success: false, message: '该领袖尚未招募' };
    if (!getLeaderExpedition(leaderId)) return { success: false, message: '该领袖的远征故事尚未开启，敬请期待！' };
    if (ship.stardust < EXPEDITION_COST) return { success: false, message: `星尘不足（需要 ${EXPEDITION_COST} 星尘）` };

    let result = { success: false, message: '' };
    dispatch({
      type: 'FUNCTIONAL_UPDATE',
      updater: (prev) => {
        const ships = [...prev.ships];
        const s = { ...ships[0], colony: { ...ships[0].colony! } };
        s.stardust -= EXPEDITION_COST;
        s.colony = {
          ...s.colony,
          expedition: { leaderId, stage: 0, currentNodeId: null, paidThisTurn: false, startedTurn: prev.turn, endingId: null },
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
    if (!node || !node.cost) return { success: false, message: '当前节点无需支付' };

    // 资源校验
    for (const [key, amount] of Object.entries(node.cost)) {
      if (resourceAmount(ship, colony, key) < amount) {
        return { success: false, message: `资源不足：${RESOURCE_LABELS[key] || key}不足（需要 ${amount}）` };
      }
    }

    let result = { success: false, message: '' };
    dispatch({
      type: 'FUNCTIONAL_UPDATE',
      updater: (prev) => {
        const ships = [...prev.ships];
        const s = { ...ships[0], colony: { ...ships[0].colony! } };
        const c = { ...s.colony, expedition: { ...s.colony.expedition! } };
        for (const [key, amount] of Object.entries(node.cost)) {
          deductResource(s, c, key, amount);
        }
        c.expedition = { ...c.expedition, paidThisTurn: true };
        s.colony = c;
        ships[0] = s;
        result = { success: true, message: `已支付，解锁「${node.title}」！` };
        return { ...prev, ships };
      },
    });
    return result;
  }, [gameState.ships, dispatch]);

  // 解锁终极技能（12/12 结局后可点击解锁；数据驱动 leaderDef.ultimateSkill）
  const unlockUltimate = useCallback((leaderId: string): { success: boolean; message: string } => {
    const colony = gameState.ships[0]?.colony;
    if (!colony) return { success: false, message: '殖民地未激活' };
    const endings = colony.expeditionEndings?.[leaderId] || [];
    if (endings.length < 12) return { success: false, message: `需收集 12 个结局（当前 ${endings.length}/12）` };
    if (colony.expeditionUnlocks?.includes(leaderId)) return { success: false, message: '该领袖终极技能已解锁' };
    const ld = getLeaderDef(leaderId);
    if (!ld?.ultimateSkill) return { success: false, message: '该领袖暂无终极技能' };

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
