// ==================== 雇佣兵协会 · 专属元数据（**不含任何卡牌属性**） ====================
// A2 起，24 张敌方专属卡的 `cost/atk/shield/structure/text` 已由 DEMO 生成到
// `data/battle/cards.ts`（`BATTLE_CARDS`）——**唯一来源**。
// 本文件只剩两样"生成物不产出、但 app 需要"的元数据：
//   ① 系列 → 那 6 张卡的 id（敌池 / 编队 / 掉落分组共用一份口径，免得各处写 `q1..q6`）；
//   ② 四支势力的系列名清单。
// ⚠ **不许**再往这里加 cost/atk/shield/structure：那就是第二份属性定义。
// ⚠ 玩家不可建造的判据不在这里，而是 `lib/battle/shipyard.ENEMY_SERIES`（含 `海盗`）。

import type { ShipCardId } from '@/types/battle';

/** 四个系列 → 各自的 6 张（唯一分组口径） */
export const MERCENARY_SERIES_CARDS: Readonly<Record<string, readonly ShipCardId[]>> = {
  虫群: ['q1', 'q2', 'q3', 'q4', 'q5', 'q6'],
  智械: ['z1', 'z2', 'z3', 'z4', 'z5', 'z6'],
  灵潮: ['y1', 'y2', 'y3', 'y4', 'y5', 'y6'],
  旧律: ['v1', 'v2', 'v3', 'v4', 'v5', 'v6'],
};

/** 四支势力的系列名（顺序 = 显示顺序） */
export const MERCENARY_SERIES: readonly string[] = ['虫群', '智械', '灵潮', '旧律'];

/** 24 张的 id 清单（由上面那张表派生，别手抄） */
export const MERCENARY_CARD_IDS: readonly ShipCardId[] = MERCENARY_SERIES.flatMap(
  (series) => MERCENARY_SERIES_CARDS[series]
);
