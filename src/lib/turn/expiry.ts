// ==================== 「还剩几回合」口径（唯一真值） ====================
// 合同有效期、产品保质期等所有"剩余回合"都按同一算法：到期回合 − 当前回合，下限 0。
// 结算侧的过期判定是 `turn > expiresAt` 才失效，所以 **0 表示"本回合仍然有效"**。
// （buff 的剩余回合见 lib/turn/factionTurn.getBuffRemainingTurns，口径相同、入参形态不同。）

/** 距某个到期回合还剩几回合（下限 0）。 */
export function getTurnsUntil(turn: number, expiresAt: number): number {
  return Math.max(0, expiresAt - turn);
}
