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
import { HOSTILE_TOLL_GOLD } from '@/lib/galaxy/access';
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

/** 跃迁方案（唯一真值）：**免费路线优先**；只有完全没有免费路线时，才给"付费途经宿敌"方案。
 *  ⚠ 宿敌节点**永远不能作为目的地**（由 caller 的 checkRepBlock 拦住），本函数只解决"途经"。 */
export interface ShipTravelPlan {
  route: GalaxyRoute | null;
  turns: number;
  tollRoute: GalaxyRoute | null;
  tollTurns: number;
  /** 途经的宿敌节点 id（按路径顺序，路径不重复节点，故天然去重） */
  hostileVia: string[];
  /** 过路费总额 = 途经宿敌数 × HOSTILE_TOLL_GOLD */
  tollGold: number;
}

/** 跃迁到 targetNodeId 的方案（路线 + **实际**回合数 + 是否需要过路费）。
 *  blocked 传入被封禁的节点（宿敌势力），与星图高亮、实扣同一口径。 */
export function getShipTravel(
  ship: Mothership,
  targetNodeId: string,
  blocked?: Iterable<string>
): ShipTravelPlan {
  const blockedSet = new Set(blocked ? Array.from(blocked) : []);
  const none: ShipTravelPlan = { route: null, turns: 0, tollRoute: null, tollTurns: 0, hostileVia: [], tollGold: 0 };
  if (ship.galaxy.currentNodeId === targetNodeId) return none;

  const free = shortestRoute(ship.galaxy.currentNodeId, targetNodeId, blockedSet);
  if (free) return { route: free, turns: applyTravelReduction(ship, free.turns), tollRoute: null, tollTurns: 0, hostileVia: [], tollGold: 0 };

  // 免费路线不可达 → 允许途经宿敌（付费）；目的地本身仍不能是宿敌（caller 已拦）
  const open = shortestRoute(ship.galaxy.currentNodeId, targetNodeId);
  if (!open) return none;
  const hostileVia = open.path.filter((id) => blockedSet.has(id));
  if (hostileVia.length === 0) return none; // 理论上不会发生：无宿敌途经就该有免费路线
  return {
    route: null,
    turns: 0,
    tollRoute: open,
    tollTurns: applyTravelReduction(ship, open.turns),
    hostileVia,
    tollGold: hostileVia.length * HOSTILE_TOLL_GOLD,
  };
}

/** 把减免应用到原始回合数上（各自钳到下限 1；口径 = max(1, 基础 − 减免合计)，勿在别处重写这段） */
export function applyTravelReduction(ship: Mothership, baseTurns: number): number {
  const reduce = getTravelReduction(ship);
  return reduce > 0 ? Math.max(1, baseTurns - reduce) : baseTurns;
}
