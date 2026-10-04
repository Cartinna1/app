// ==================== 星图通行与位置口径（唯一真值） ====================
// 谁被封锁、母舰当前在哪个势力、某节点能否进入，都只在这里判定，
// UI（星图/贸易面板）与结算（useTrade）必须共用，勿各自判断声望阈值。

import type { Mothership } from '@/types/game';
import { FACTIONS } from '@/data/factions';
import { getGalaxyNode } from '@/data/galaxy/nodes';

/** 宿敌声望阈值：达到此值及以下的势力封锁边境，不可进入、不可途经（与 checkRepBlock 同源） */
export const HOSTILE_REP_THRESHOLD = -91;

/** 宿敌「过路费」：**仅当不存在免费路线时**才提供，每途经一处宿敌节点收 20,000 金币。
 *  付费同时给该势力 +1 声望——这是**宿敌状态下唯一的自救通道**（宿敌拒绝买/投/合同；若不回声望，
 *  声望掉到 −91 后就永久无法回升，其后方节点会永久不可达）。宿敌节点**仍不能作为目的地**。
 *  唯一真值：实扣（useTrade.travelToNode）与星图跃迁按钮显示共用本常量。 */
export const HOSTILE_TOLL_GOLD = 20000;
export const HOSTILE_TOLL_REP = 1;

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

/** 声望拦截：返回 null 表示允许，否则返回给玩家看的原因。
 *  唯一真值（原私藏在 hooks/useTrade.ts，现移到 access 与 HOSTILE_REP_THRESHOLD 同处）：
 *  贸易动作与「下一回合预告」（探索/打探提醒）共用，否则会出现"提示还能探索、实际被恶意势力拒绝"的分叉。
 *  分档：宿敌 ≤−91 全拒；恶意 −90~−51 只许跃迁/投资；敌意 −50~−21 只许跃迁/买/投资；声望 <0 不可打探。 */
export function checkRepBlock(prev: { factionReputation?: Record<string, number> }, factionId: string, action: string): string | null {
  const rep = (prev.factionReputation || {})[factionId] || 0;
  // 宿敌 -100~-91：拒绝一切操作（含跃迁）
  if (rep <= HOSTILE_REP_THRESHOLD) return '宿敌势力拒绝与你交易';
  // 恶意 -90~-51：可跃迁、可投资，其余拒绝
  if (rep >= -90 && rep <= -51) {
    if (action === 'travel' || action === 'invest') return null;
    return '恶意势力拒绝此项操作';
  }
  // 敌意 -50~-21：可跃迁、可购买、可投资，其余拒绝
  if (rep >= -50 && rep <= -21) {
    if (action === 'buy' || action === 'invest' || action === 'travel') return null;
    return '敌意势力拒绝此项操作';
  }
  if (rep < 0 && action === 'intel') return '该势力不信任你，无法打探消息';
  return null;
}
