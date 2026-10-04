// ==================== 金币流水写入（唯一真值） ====================
// 为什么集中：全库曾有 34 处手写「拼一条流水 + 裁到上限」，格式一模一样却各写各的
// （买卖特产/黑市/投资/打探/合同/股票/生产/建筑/人口/领袖/远征/奇观/殖民地收入/贷款/
//  兑换码/装置转化/事件结算…），改流水结构或上限时必然漏改。
//
// ⚠ 前置条件：调用方**已经**把金币改完（本函数读当前金币作为 balanceAfter）。
//   2026-08 全代码自检已逐处核对 34 个调用点：全部是"先改钱、后记账"，故集中不改变任何余额数字。

import type { GoldLogEntry } from '@/types/game';
import { GOLD_LOG_LIMIT } from '@/data/gameData';

/** 记一笔金币流水：新条目放最前，并裁到 GOLD_LOG_LIMIT 条。 */
export function pushGoldLog(
  ship: { gold: number; goldLog: GoldLogEntry[] },
  turn: number,
  amount: number,
  reason: string
): void {
  ship.goldLog = [{ turn, amount, reason, balanceAfter: ship.gold }, ...(ship.goldLog || [])].slice(0, GOLD_LOG_LIMIT);
}
