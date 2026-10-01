// ==================== 星图通行与位置口径（唯一真值） ====================
// 谁被封锁、母舰当前在哪个势力、某节点能否进入，都只在这里判定，
// UI（星图/贸易面板）与结算（useTrade）必须共用，勿各自判断声望阈值。

import type { Mothership } from '@/types/game';
import { FACTIONS } from '@/data/factions';
import { getGalaxyNode } from '@/data/galaxy/nodes';

/** 宿敌声望阈值：达到此值及以下的势力封锁边境，不可进入、不可途经（与 checkRepBlock 同源） */
export const HOSTILE_REP_THRESHOLD = -91;

/** 当前不可通行的节点 id（宿敌势力节点；势力节点 id 与 factionId 同值） */
export function getBlockedNodeIds(reputation: Record<string, number> | undefined): string[] {
  if (!reputation) return [];
  return FACTIONS.filter((f) => (reputation[f.id] ?? 0) <= HOSTILE_REP_THRESHOLD).map((f) => f.id);
}

/** 母舰当前所在星系对应的势力 id；停在非势力节点（殖民地/遗迹/空星系）时返回 null */
export function getCurrentFactionId(ship: Mothership | undefined): string | null {
  const node = getGalaxyNode(ship?.galaxy?.currentNodeId);
  return node?.factionId ?? null;
}

/** 该节点能否进入（宿敌势力封锁时为 false；非势力节点恒可进入） */
export function canEnterNode(nodeId: string, reputation: Record<string, number> | undefined): boolean {
  const node = getGalaxyNode(nodeId);
  if (!node?.factionId) return true;
  return (reputation?.[node.factionId] ?? 0) > HOSTILE_REP_THRESHOLD;
}
