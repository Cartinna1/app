// ==================== 声望的取值范围（唯一真值） ====================
// 为什么要单独一处：声望的 ±100 夹取原先在 4 处各写一遍
//   · useTrade.applyRepChange（主入口，买/投资/合同）
//   · useTrade.applyRepChange 的敌人惩罚分支
//   · useTrade.completeContract 的走私失败（只夹下限）
//   · gameReducer.applyRaidReward（掠夺奖励，注释自己写着"与 applyRepChange 同口径"）
// 改上限（例如将来放宽到 ±150）时只改这里即可；新增任何写声望的路径都必须过 clampRep。

/** 声望下限（宿敌阈值 −91 相关口径见 lib/galaxy/access.HOSTILE_REP_THRESHOLD） */
export const REP_MIN = -100;
/** 声望上限 */
export const REP_MAX = 100;

/** 把任意声望值夹到 [REP_MIN, REP_MAX]。 */
export function clampRep(value: number): number {
  return Math.max(REP_MIN, Math.min(REP_MAX, value));
}
