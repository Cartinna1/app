// ==================== 跃迁回合数（唯一真值） ====================
// 为什么单独一个文件：**实扣与显示必须是同一份算式**。
// 历史上只有 hooks/useTrade.travelToNode 里算减免（引力锚定器 −1、跃迁加速器遗物 −1、永久加成 −N），
// 而星图跃迁按钮与贸易列表直接显示最短路原始回合数 → 装了减免装置后界面多报 1~3 回合。
//
// 减免口径（顺序即加算顺序，各自钳到下限 1 回合）：
//   最短路回合 → 引力锚定器 −1 → 跃迁加速器（r_010）−1 → 永久加成 travelTurnReduce −N
// 调用方：hooks/useTrade.travelToNode（实扣）、components/GalaxyMapPanel（跃迁按钮显示）。

import type { Mothership } from '@/types/game';
import { shortestRoute, type GalaxyRoute } from '@/lib/galaxy/graph';
import { RELIC_JUMP_ACCELERATOR } from '@/data/relics';
import { MODULE_GRAVITY_ANCHOR } from '@/data/modules';
import { getPermaBonusValue } from '@/data/galaxy/permaBonuses';

/** 当前最短路减免（引力锚定器 / 跃迁加速器 / 永久加成），用于展示或日志说明。
 *  ⚠ 减免来源**只在本函数列一次**：applyTravelReduction 也调它，新增第 4 种减免只改这里。 */
export function getTravelReduction(ship: Mothership): number {
  let reduce = 0;
  if (ship.installedModuleIds.includes(MODULE_GRAVITY_ANCHOR)) reduce += 1;
  if (ship.relics.some((r) => r.id === RELIC_JUMP_ACCELERATOR)) reduce += 1;
  const perm = getPermaBonusValue(ship.galaxy?.permaBonuses, 'travelTurnReduce');
  if (perm > 0) reduce += perm;
  return reduce;
}

/** 跃迁到 targetNodeId 的路线与**实际**回合数；不可达时 route 为 null、turns 为 0。
 *  blocked 传入被封禁的节点（宿敌势力），与星图高亮、实扣同一口径。 */
export function getShipTravel(
  ship: Mothership,
  targetNodeId: string,
  blocked?: Iterable<string>
): { route: GalaxyRoute | null; turns: number } {
  const route = shortestRoute(ship.galaxy.currentNodeId, targetNodeId, blocked);
  if (!route) return { route: null, turns: 0 };
  return { route, turns: applyTravelReduction(ship, route.turns) };
}

/** 把减免应用到原始回合数上（各自钳到下限 1；口径 = max(1, 基础 − 减免合计)，勿在别处重写这段） */
export function applyTravelReduction(ship: Mothership, baseTurns: number): number {
  const reduce = getTravelReduction(ship);
  return reduce > 0 ? Math.max(1, baseTurns - reduce) : baseTurns;
}
