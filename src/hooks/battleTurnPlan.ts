// ==================== 结束回合时「战斗状态该派发什么」的唯一真值（纯函数，不吃随机数） ====================
// `useTurn.nextTurn` 是 React hook（本仓库不在 Node 里跑组件），而"回合推进"这条链出过一次极隐蔽的
// 故障（用户 2026-08 报："回合数字在加，但出征 / 掠夺的倒计时和战斗一动不动"）。把**该派发什么**抽成
// 不依赖 React 的纯函数后，`scripts/check-battle-expedition.cjs` 就能用**真实 reducer** 原样回放这几次
// 派发（TICK → START_BATTLE → ARRIVE_RAID / APPLY_RAID_LOOT），把"只生效一次"这类故障钉死在脚本里。
//
// ⚠ 两件东西**不**在这里（它们不是纯判定）：
//   · 随机数：新掠夺的掷骰（`shouldStartRaid` / `raidSquadCount`）由调用方取好随机数后再判；
//   · seed：出征开战的 seed 由调用方按既定口径取 `Date.now()`（战斗不进存档）。
// ⚠ 判定顺序与 useTurn 的派发顺序一一对应，改这里就必须同步 useTurn（那边只执行、不重算）。

import type { GameState } from '@/types/game';
import { readyExpedition, tickExpedition } from '@/lib/battle/expedition';
import { raidResolution, tickRaid } from '@/lib/battle/raid';

/** 结束回合的战斗派发计划（判定结果，不含随机数与 seed） */
export interface BattleTurnPlan {
  /** 出征倒计时归零 → 该自动开战（调用方派发 START_BATTLE / kind 'expedition'）；null = 不开战 */
  startBattle: ReturnType<typeof readyExpedition>;
  /** 掠夺这一步怎么走：none（还没到/该掷骰）/ arrived（阶段 A 归零 → 转阶段 B）/ looted（超时 → 掠夺成功） */
  raidStep: 'none' | 'arrived' | 'looted';
}

/**
 * 本回合结束前，战斗状态该派发什么。
 * ⚠ 入参必须是**当前状态**（也就是 TICK 之前的状态）：函数内部先投影"本次 TICK 之后"的状态
 *   （与 reducer 的 `TICK_BATTLE_STATE` 同一份算式：`tickExpedition` / `tickRaid`），再从未投影结果判定 ——
 *   判定与最终落库的状态**逐值同源**，不存在"读 TICK 前 + 猜一位"的 off-by-one 窗口。
 */
export function planBattleTurn(state: GameState): BattleTurnPlan {
  const afterTick: GameState = {
    ...state,
    expedition: tickExpedition(state.expedition),
    raid: tickRaid(state.raid),
  };
  return {
    startBattle: readyExpedition(afterTick),
    raidStep: raidResolution(afterTick),
  };
}
