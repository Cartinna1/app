// ==================== 悬赏战斗的建场（唯一入口） ====================
// 敌方数据与敌池都由 `engine.createBattle` 按 bossId 查表：
//   · `m01`~`m04` 的本体血量 / 技能文案在 `data/battle/pirates.ts`（bosses.ts 只是视图），势力池在
//     `data/mercenary/pools.ts`（`MERCENARY_POOLS`：m01/m04 = 12 张、m02/m03 = 18 张，方案 A 口径），
//     两者都已并进 `engine.BOSSES` 与敌池分支；
//   · `m05`（弱海盗杂兵头目）用 30 张的 `PIRATE_POOL`；
//   · 头目档的占位常量 `ELITE_PLACEHOLDER_BOSS` 只作兜底（见 `lib/turn/bounties.bountyEnemyId`）。
// 本函数**只做一件事**：建场后把玩家侧卡池换成出击舰队的编制（与 `START_BATTLE` 同口径）。
//
// ⚠ 不改规则、不改随机数消耗次数（`createBattle` 原样调用一次）。
// ⚠ 阶段 A2 会在这里之后补头目技能分支（在 engine 的按 id 分支里），本层不需要再改。

import type { BattleState, PirateBossId, ShipCardId } from '@/types/battle';
import { createBattle } from './engine';

/**
 * 建一场悬赏战斗：参战池 = 玩家选的舰队，敌方 = `enemyId`（血量/敌池由 engine 按 id 查表）。
 */
export function createBountyBattle(enemyId: PirateBossId, fleet: ShipCardId[], seed: number): BattleState {
  const base = createBattle({ seed, bossId: enemyId });
  return { ...base, player: { ...base.player, pool: fleet.slice() } };
}
