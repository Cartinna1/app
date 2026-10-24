// ==================== 老巢清剿冷却（唯一真值） ====================
// 用户裁定：老巢**保留可重复打**，但同一老巢清剿后要冷却 10 回合（配 `rewards.ts` 的递减档）。
// 本文件只回答两件事：还剩几回合、现在能不能打；**不写奖励、不写账本**。
//
// 三个"老巢记账"字段的语义（**不许混用**）：
//   · `state.defeatedLairs`    —— "这个老巢**打赢过没有**"（只增不减，决定掠夺队是否改名「海盗残兵」）；
//   · `state.lairClearedTurn`  —— "**最近一次**被清剿是第几回合"（会被覆盖，冷却判据读它）；
//   · 本文件的 `LAIR_COOLDOWN_TURNS` —— 冷却长度（10 回合，唯一真值）。
//
// ⚠ 冷却只挡**发起出征**（`lib/battle/expedition.canStartExpedition` 读 `canFightLair`，**只此一处**）。
//   它**不能**进 `readyExpedition`：那会让"已经在路上的舰队抵达时正好撞上冷却"变成永远打不了的死状态。

import type { GameState } from '@/types/game';
import type { PirateBossId } from '@/types/battle';
import { LAIR_BOSS_IDS_FROM_NODES } from './lairIds';

/** 同一老巢清剿后的冷却回合数 */
export const LAIR_COOLDOWN_TURNS = 10;

/** 是不是老巢（白名单来自星图 `pirateLair` 派生，不硬编码 b1~b5）。掠夺队与悬赏敌人一律 false。 */
export function isLairBoss(bossId: PirateBossId): boolean {
  return LAIR_BOSS_IDS_FROM_NODES.includes(bossId);
}

/**
 * 该老巢还剩几回合冷却（0 = 不在冷却，可以打）。
 * 判据 = `LAIR_COOLDOWN_TURNS - (turn - 最近一次清剿回合)`，下限 0；没有记录 = 从未清剿过 = 0。
 */
export function lairCooldownRemaining(state: GameState, bossId: PirateBossId): number {
  if (!isLairBoss(bossId)) return 0;
  const clearedAt = state.lairClearedTurn ? state.lairClearedTurn[bossId] : undefined;
  if (clearedAt === undefined) return 0;
  return Math.max(0, LAIR_COOLDOWN_TURNS - (state.turn - clearedAt));
}

/** 冷却原因文案（**唯一产出口**）：`该老巢已清剿，N 回合后可再战`。
 *  N 的下限是 1：冷却只剩 0 回合时**不应该**走进这条文案（那说明已经能打了），
 *  但即使调用方判错了，也绝不渲染出「0 回合后可再战」这种死文案。 */
export function lairCooldownText(remaining: number): string {
  return `该老巢已清剿，${Math.max(1, remaining)} 回合后可再战`;
}

/**
 * 现在能不能打这个老巢（**UI 与 reducer 共用的唯一判据**）。
 * `reason` 为空串表示可以打（与 `bounties.BountyCheck` 同形状，方便 UI 统一渲染）。
 */
export function canFightLair(state: GameState, bossId: PirateBossId): { ok: boolean; reason: string } {
  const remaining = lairCooldownRemaining(state, bossId);
  if (remaining <= 0) return { ok: true, reason: '' };
  return { ok: false, reason: lairCooldownText(remaining) };
}

/**
 * 记一次清剿（纯函数）：返回新的 `lairClearedTurn`。
 * ⚠ 只对**老巢**写（掠夺队与悬赏敌人不写）—— 白名单判据与 `battleRewards` 同源（`lairIds`）。
 */
export function recordLairCleared(
  lairClearedTurn: Record<string, number> | undefined,
  bossId: PirateBossId,
  turn: number
): Record<string, number> {
  if (!isLairBoss(bossId)) return lairClearedTurn || {};
  return { ...(lairClearedTurn || {}), [bossId]: turn };
}
