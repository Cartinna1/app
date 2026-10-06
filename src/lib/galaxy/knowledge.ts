// ==================== 势力信息可见性（迷雾唯一真值） ====================
// 星图的势力信息卡与贸易面板的「星际势力分布」共用本模块。
// 规则：只有"到访过"的势力才算探明；未探明势力不暴露名称、特产、市场价、外交关系。
// 探明的唯一依据是 ship.galaxy.visitedNodes —— 写入点只有 lib/turn/shipTurn.ts 的"到达即探明"。
// ⚠ 两处 UI 的过滤必须都走这里，勿再各写一份内联判断（曾出现星图过滤、贸易面板全露的分叉）。

import type { Mothership } from '@/types/game';
import { getGalaxyNode } from '@/data/galaxy/nodes';
import { RELATION_MATRIX } from '@/data/factions';

/** 已探明势力 id 集合（visitedNodes 中的势力节点；势力节点 id 与 factionId 同值） */
export function getKnownFactionIds(ship: Mothership): Set<string> {
  const visited = ship.galaxy?.visitedNodes || [];
  return new Set(visited.filter((id) => getGalaxyNode(id)?.type === 'faction'));
}

/** 某节点是否已探明（= 在 `ship.galaxy.visitedNodes` 里；写入点只有 shipTurn 的"到达即探明"）。
 *  **迷雾的唯一判据**：星图节点配图（lib/galaxy/nodeImage）、节点显示名、势力可见性都从这里取，
 *  勿在别处另写一套 `visitedNodes.includes(...)`（AGENTS 第九节：规则要落到函数上，写在注释里不算）。
 *  未知节点 id 恒返回 false（保守方向：不泄露不存在的东西）。ship 不传 = 按"都没探明"处理。 */
export function isNodeDiscovered(ship: Mothership | undefined, nodeId: string | null | undefined): boolean {
  if (!nodeId) return false;
  if (!getGalaxyNode(nodeId)) return false;
  const visited = ship?.galaxy?.visitedNodes || [];
  return visited.includes(nodeId);
}

/** 节点显示名（迷雾）：只对**已到访**的节点返回真名，否则返回「未探测星系」。
 *  唯一真值：星图信息卡、星图"途经/跃迁中"提示、贸易面板的目的地、**下一回合预告**共用，
 *  勿再各写一份内联判断（曾出现"下回合抵达「光语者宁静域」"这种提前泄露星系名的分叉）。
 *  探明判据走 isNodeDiscovered（本文件唯一）。 */
export function getNodeDisplayName(ship: Mothership | undefined, nodeId: string | null | undefined): string {
  if (!nodeId) return '未知星系';
  const node = getGalaxyNode(nodeId);
  if (!node) return '未知星系';
  return isNodeDiscovered(ship, node.id) ? node.name : '未探测星系';
}

/** 关系探明结果：只保留"我已到访过"的相关势力，其余计入 hiddenCount（显示为"N 条关系未知"） */
export interface KnownRelation {
  allies: string[];
  enemies: string[];
  hiddenCount: number;
}

export function getKnownRelation(factionId: string, knownFactionIds: Set<string>): KnownRelation {
  const rel = RELATION_MATRIX[factionId] || { allies: [], enemies: [] };
  const allies = rel.allies.filter((id) => knownFactionIds.has(id));
  const enemies = rel.enemies.filter((id) => knownFactionIds.has(id));
  return {
    allies,
    enemies,
    hiddenCount: (rel.allies.length - allies.length) + (rel.enemies.length - enemies.length),
  };
}
