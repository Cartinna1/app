// ==================== 雇佣兵协会 · 四支势力的敌池与固定编队 ====================
// 照 `docs/03-雇佣兵协会.md` §4：每支势力 6 张卡 × N 份 + **26 艘固定编队**。
// ⚠ 2026-10 方案 A（用户定，目标"玩家胜率 70~80"）：**m01 / m04 的池削到 2 份（12 张）**，
//    m02 / m03 仍是 3 份（18 张）。实测（starter 26，见 `scripts/sim-boss-winrates.cjs`）：
//    m01 12.3% → 65%、m04 58.7% → 74.3%；m02 靠"加攻层数 3→2"、b3 靠"时钟降速+阈值后移"。
// ⚠ DEMO 的 `MERC_POOLS` 必须同口径（m01/m04 是 `Array(2)`，m02/m03 是 `Array(3)`），否则校验会分叉。
// 编队曲线与新手编制 `FLEET_STARTER` 同一口径（4/4/7/3/5/3 份，合计 26 艘），
// 但四条合计各自的攻/盾/结构在"更攻 / 更肉"上做偏移（见 cards.ts 头注释的锚点表）。
//
// ⚠ 敌方卡**不进** `FLEET_ALL`（那是玩家全集 33 张）：敌池只在这里，别混进玩家的卡池/船坞/科技列表。
// ⚠ 编队是**数据**而不是"从敌池随机抽"：固定编队才能让四支势力的手感不同（A2 的落地也靠它）。

import type { ShipCardId } from '@/types/battle';
import { MERCENARY_SERIES_CARDS } from './cards';

/** 敌池：m01 / m04 = 6 张卡各 **2** 份（12 张）；m02 / m03 = 各 **3** 份（18 张）
 *  ⚠ 口径变更（用户 2026-10 方案 A）：m01 / m04 从 18 张削到 12 张，用来把两支的胜率
 *    从 12.3% / 58.7% 拉回 65% / 74.3%（starter 26 实测）。m02 / m03 不动。 */
export const MERCENARY_POOLS: Readonly<Record<string, readonly ShipCardId[]>> = {
  m01: [0, 1].flatMap(() => MERCENARY_SERIES_CARDS['虫群']),
  m02: [0, 1, 2].flatMap(() => MERCENARY_SERIES_CARDS['智械']),
  m03: [0, 1, 2].flatMap(() => MERCENARY_SERIES_CARDS['灵潮']),
  m04: [0, 1].flatMap(() => MERCENARY_SERIES_CARDS['旧律']),
};

/** 26 艘固定编队的**份数曲线**（与 `FLEET_STARTER` 同口径：4/4/7/3/5/3） */
export const MERCENARY_FLEET_CURVE: readonly number[] = [4, 4, 7, 3, 5, 3];

/** 按曲线把某势力的 6 张卡展开成 26 艘固定编队 */
function fleetOf(series: string): readonly ShipCardId[] {
  const ids = MERCENARY_SERIES_CARDS[series];
  const out: ShipCardId[] = [];
  for (let i = 0; i < ids.length; i += 1) {
    for (let n = 0; n < MERCENARY_FLEET_CURVE[i]; n += 1) out.push(ids[i]);
  }
  return out;
}

/** 四支势力的固定编队（26 艘/队） */
export const MERCENARY_FLEETS: Readonly<Record<string, readonly ShipCardId[]>> = {
  m01: fleetOf('虫群'),
  m02: fleetOf('智械'),
  m03: fleetOf('灵潮'),
  m04: fleetOf('旧律'),
};
