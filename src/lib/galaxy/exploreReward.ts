// ==================== 首次探索奖励（唯一真值） ====================
// 口径（已定稿，见 docs/01-首次探索奖励.md）：**按本次跃迁实际消耗的回合数**分档
// （付费过境时取实际支付的 `tollTurns`），不看距起点多远、不看现在是第几回合。
// 首访判据不在这里：走 ship.galaxy.visitedNodes（与 lib/galaxy/knowledge 同口径），勿另立一套。
//
// 唯一结算调用点 = hooks/useTrade.travelToNode 的**起跳处**：那是"本次实际消耗回合数"最后一次存在的地方
//   （抵达分支在 lib/turn/shipTurn.ts，那时 travelTurnsRemaining 已经归零，取不到这个数）。
// ⚠ 前提：本设计假定「跃迁一旦起跳必然抵达」。将来若加入中止跃迁，必须同步二选一：
//   中止时收回奖励，或把发奖挪到抵达处并新增一个「本程总回合数」字段（= 升 saveVersion）。
//
// 三个文案（金币流水 / 事件 detail / 预览行）都从本文件产出，UI 与 hook 都不许自己拼数字。

import { famineHalveGold } from '@/lib/turn/shipTurn';

/** 档位：近（1~2 回合）/ 中（3~4 回合）/ 远（≥5 回合）。只用于上色或图标，**不许**按金币数反推。 */
export type ExploreRewardTier = 'near' | 'mid' | 'far';

/** 一次首访奖励（金币已按饥荒口径折算，合金不受饥荒影响） */
export interface ExploreReward {
  gold: number;
  alloy: number;
  tier: ExploreRewardTier;
}

/** 事件记录的 event 名（事件面板显示最近 30 条，保持四个字） */
export const EXPLORE_EVENT = '首次探索';

/** 档位表。**数值定稿，勿改**（调参前先出前后对比表，见 docs/01-首次探索奖励.md 第 5 节）。 */
const REWARD_TABLE: Record<ExploreRewardTier, { gold: number; alloy: number }> = {
  near: { gold: 800, alloy: 3 }, // 跃迁 1~2 回合
  mid: { gold: 1500, alloy: 6 }, // 跃迁 3~4 回合
  far: { gold: 3000, alloy: 10 }, // 跃迁 5 回合及以上
};

/** 按本次跃迁回合数取档。turns 由调用点保证 >= 1，这里仍做下限兜底（防 0 或 NaN 掉进空档）。 */
export function getExploreReward(turns: number): ExploreReward {
  const t = Math.max(1, Math.floor(turns || 0));
  const tier: ExploreRewardTier = t <= 2 ? 'near' : t <= 4 ? 'mid' : 'far';
  const { gold, alloy } = REWARD_TABLE[tier];
  return { gold, alloy, tier };
}

/** 饥荒（食物 < 0）时金币减半，合金原样。
 *  ⚠ 预览与实发**必须都走这里**：口径唯一真值仍是 lib/turn/shipTurn.ts 的 famineHalveGold，
 *    否则会出现「预览 1,500、到账 750」的分叉。 */
export function applyFamineToReward(reward: ExploreReward, food: number): ExploreReward {
  const gold = famineHalveGold(food, reward.gold);
  if (gold === reward.gold) return reward;
  return { gold, alloy: reward.alloy, tier: reward.tier };
}

/** 金币流水的原因文案（唯一产出口）：流水表格自带金额列，这里不写金额。
 *  ⚠ 文案里不带星系名：首访节点此刻仍未探明，带名会与迷雾口径矛盾。 */
export function exploreGoldLogReason(turns: number): string {
  return `首次探索奖励（跃迁 ${turns} 回合）`;
}

/** 事件记录的 detail 文案（唯一产出口）。reward 必须是**过了饥荒**的那份（实发值）。 */
export function exploreEventDetail(turns: number, reward: ExploreReward): string {
  return `跃迁 ${turns} 回合后首次抵达一处未曾到访的星系，获得探索奖励 ${reward.gold.toLocaleString()} 金币、${reward.alloy} 合金`;
}

/** 预览行文案（唯一产出口）：星图跃迁按钮下方与跃迁提示条共用。reward 同样必须是过了饥荒的那份。 */
export function explorePreviewText(reward: ExploreReward): string {
  return `首次抵达：${reward.gold.toLocaleString()} 金币 + ${reward.alloy} 合金`;
}

/** 星图跃迁按钮下方的预览行（判定 + 数额 + 文案的唯一出口）：
 *  目标已在 `visitedNodes` 里（重复到访）或节点 id 为空时返回 null → 界面不显示这一行；
 *  未到访则按本次跃迁回合数落档并过饥荒减半，与 useTrade 的实发同源。 */
export function getExplorePreviewText(
  visitedNodes: string[] | undefined,
  nodeId: string | null | undefined,
  turns: number,
  food: number
): string | null {
  if (!nodeId) return null;
  if ((visitedNodes || []).includes(nodeId)) return null;
  return explorePreviewText(applyFamineToReward(getExploreReward(turns), food));
}
