// ==================== 银河雇佣兵协会 · 敌人视图（**不含重复定义**） ====================
// A2 起，m01~m05 的 `name / hp / skill` 由 DEMO 生成到 `data/battle/pirates.ts`（`PIRATE_BOSSES`）——
// **唯一来源**。本文件只是"从生成物里挑出雇佣兵那 5 个"的视图，供悬赏/建场/断言按名字取用。
//
// ⚠ **不许**在这里重写 hp/name/skill：那就是第二份敌人定义（改一处漏一处）。
// ⚠ 它们**不是老巢**：不在 `LAIR_BOSS_IDS`（生成物里已排除 m*）与星图 `pirateLair` 白名单里，
//   所以 `battleRewards` 不会给它们发老巢战利品（打赢的收益走悬赏报酬 + 头目掉落）。
// ⚠ 敌方卡池与编队在 `pools.ts`（生成物不产出敌池，见 engine.ts 的依赖说明）。

import type { PirateBossDef } from '@/types/battle';
import { PIRATE_BOSSES } from '@/data/battle/pirates';

/** 雇佣兵协会的 5 个敌人 id（顺序 = 展示顺序：m01~m05） */
export const MERCENARY_BOSS_IDS: readonly string[] = ['m01', 'm02', 'm03', 'm04', 'm05'];

/** 雇佣兵协会的敌人（从生成物里取；生成物缺条目时缺键，调用方兜底） */
export const MERCENARY_BOSSES: Readonly<Record<string, PirateBossDef>> = Object.fromEntries(
  MERCENARY_BOSS_IDS.filter((id) => !!PIRATE_BOSSES[id]).map((id) => [id, PIRATE_BOSSES[id]])
);

// TODO(A2 续)：m01~m05 的头目技能分支**尚未实现**（DEMO 与移植版都只有数据条目）。
//   落地顺序：先加进 `carddemo/engine.js` 的按 id 分支（bossTurnStart / endTurn / startBattle 各处），
//   再逐字搬进 `lib/battle/engine.ts`，然后用 `check-mercenary.cjs` 加定点断言。
//   ⚠ 在那之前，技能文案描述的效果**不生效**——别写成"已实现"。
