// ==================== 战斗战利品（V1.5 §〇 战利品 / §10.2 掠夺） ====================
// 主游戏侧「打赢之后给什么」的唯一真值。规则出处：
//   · 出征打老巢（b1~b5）赢 → **固定 100000 金币 + 40 星尘**（§〇 / §10.2）
//   · 掠夺队（bossId === 'raid'）本阶段**不给奖励**（§10.2 的随机奖励属后续阶段，接入点见下方 TODO）
//   · 打输 → 不给任何奖励（永久损失由 gameReducer 的 END_BATTLE 按 P3 规则写回，不在本文件）
// ⚠ 本文件只做纯计算：不 mutate 传入对象，不读随机数，不 dispatch。
// ⚠ 金币收益**必须**过 lib/turn/shipTurn.ts 的 famineHalveGold（AGENTS 第十节：新增金币收益都要问饥荒减半），
//   并按 AGENTS 第三节写 pushGoldLog（**调用前必须先改完金币**）。

import type { Mothership } from '@/types/game';
import type { BattleState } from '@/types/battle';
import { famineHalveGold } from '@/lib/turn/shipTurn';
import { pushGoldLog } from '@/lib/turn/goldLog';

/** 老巢战利品（§〇 / §10.2）：固定 100000 金币 + 40 星尘 */
export const LAIR_REWARD_GOLD = 100000;
export const LAIR_REWARD_STARDUST = 40;

/**
 * 本场战斗的**基础**战利品（未过饥荒减半）。
 * 掠夺队与打输的战斗一律 0/0；掠夺的随机奖励（§10.2）将来接在这里（改这个函数即可，调用方无需改）。
 */
export function battleRewards(battle: BattleState): { gold: number; stardust: number } {
  // TODO(P7)：掠夺战（battle.bossId === 'raid'）的随机奖励 —— §10.2「掠夺成功后获得随机奖励」，
  //   接入点是本函数：按 battle.winner 与掠夺档位返回 gold/stardust（仍必须过 famineHalveGold 与 pushGoldLog）。
  if (battle.bossId === 'raid' || battle.winner !== 'player') return { gold: 0, stardust: 0 };
  return { gold: LAIR_REWARD_GOLD, stardust: LAIR_REWARD_STARDUST };
}

/**
 * 本场战斗**实收**的金币（= 基础战利品过 famineHalveGold）——UI 展示与结算同源，勿在别处再算一遍。
 * `food` 取打这场仗时母舰的食物（食 < 0 即饥荒，金币减半）。
 */
export function expectedBattleGold(food: number, battle: BattleState): number {
  return famineHalveGold(food, battleRewards(battle).gold);
}

/**
 * 结算并写回战利品：返回**新的 ship**（不改传入的 ship / battle）。
 * 顺序：① 先算实收金币（饥荒减半）→ ② 改金币 → ③ pushGoldLog（读改完后的余额）→ ④ 加星尘。
 * 没有任何收益时原样返回传入的 ship 引用（调用方可据此判断"没变"）。
 */
export function grantBattleRewards(ship: Mothership, battle: BattleState, turn: number): Mothership {
  const { stardust } = battleRewards(battle);
  const gold = expectedBattleGold(ship.food, battle);
  if (gold <= 0 && stardust <= 0) return ship;

  const next: Mothership = { ...ship };
  if (gold > 0) {
    const reason = `出征战利品：${battle.bossId} 老巢`;
    next.gold += gold;                                  // 一、先改金币（pushGoldLog 读的是改完后的余额）
    pushGoldLog(next, turn, gold, reason);              // 二、再记流水（唯一真值 lib/turn/goldLog.ts）
  }
  if (stardust > 0) next.stardust += stardust;           // 三、星尘直接加在母舰上
  return next;
}
