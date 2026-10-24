// ==================== 雇佣兵协会 · 四支势力的敌池与固定编队 ====================
// 照 `docs/03-雇佣兵协会.md` §4：每支势力 **30 张敌池**（6 张卡 × 5 份）+ **26 艘固定编队**。
// 编队曲线与新手编制 `FLEET_STARTER` 同一口径（4/4/7/3/5/3 份，合计 26 艘），
// 但四条合计各自的攻/盾/结构在"更攻 / 更肉"上做偏移（见 cards.ts 头注释的锚点表）。
//
// ⚠ 敌方卡**不进** `FLEET_ALL`（那是玩家全集 33 张）：敌池只在这里，别混进玩家的卡池/船坞/科技列表。
// ⚠ 编队是**数据**而不是"从敌池随机抽"：固定编队才能让四支势力的手感不同（A2 的落地也靠它）。

import type { ShipCardId } from '@/types/battle';
import { MERCENARY_SERIES_CARDS } from './cards';

/** 敌池：每支势力 = 它那 6 张卡各 5 份（30 张） */
export const MERCENARY_POOLS: Readonly<Record<string, readonly ShipCardId[]>> = {
  m01: [0, 1, 2, 3, 4].flatMap(() => MERCENARY_SERIES_CARDS['虫群']),
  m02: [0, 1, 2, 3, 4].flatMap(() => MERCENARY_SERIES_CARDS['智械']),
  m03: [0, 1, 2, 3, 4].flatMap(() => MERCENARY_SERIES_CARDS['灵潮']),
  m04: [0, 1, 2, 3, 4].flatMap(() => MERCENARY_SERIES_CARDS['旧律']),
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
