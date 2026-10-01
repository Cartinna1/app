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

/** 单个势力是否已探明 */
export function isFactionKnown(ship: Mothership, factionId: string): boolean {
  return getKnownFactionIds(ship).has(factionId);
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
