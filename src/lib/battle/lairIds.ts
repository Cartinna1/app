// ==================== 老巢 BOSS id 白名单（数据驱动 · 唯一真值） ====================
// 为什么单独一个小模块（**别把它并回 raid.ts**）：
//   · "哪些 bossId 是海盗老巢"原先派生在 lib/battle/raid.ts（`LAIR_BOSS_IDS_FROM_NODES`）；
//   · 但 lib/battle/rewards.ts 也要用这份白名单（battleRewards 判"这一场该不该发老巢战利品"）；
//   · 而 raid.ts 现在 import rewards.ts（`raidLootItems`：掠夺失败那条事件记录的明细由它拼）——
//     rewards.ts 若反向 `import { LAIR_BOSS_IDS_FROM_NODES } from './raid'` 就成**循环 import**
//     （ESM 求值期会拿到 undefined，最坏是白名单静默为空 → 老巢奖励整体消失）。
//   → 把"从星图派生"下沉到本文件：rewards.ts 与 raid.ts **都从这里取**，
//     谁都不许再写第二份派生（AGENTS 第三节单一真值）。
//
// ⚠ 本文件必须是**依赖图上的叶子**：只读 data/galaxy/nodes（其运行时依赖为空）+ types（纯类型），
//   绝不 import lib/** —— 否则下沉就白做了（又能绕回 raid.ts / rewards.ts）。
// ⚠ 判据**数据驱动**：老巢就是星图里带 `pirateLair` 标记的节点（data/galaxy/nodes.ts），
//   当前 5 个（b1~b5），**不许硬编码 5 或 b1~b5**。

import type { PirateBossId } from '@/types/battle';
import { GALAXY_NODES } from '@/data/galaxy/nodes';

/**
 * 老巢 BOSS id 全集（**唯一派生点**：星图里带 `pirateLair` 的节点）。
 * 消费方：
 *   · `lib/battle/raid.ts` —— `allLairsDefeated` / `recordDefeatedLair` / 「海盗残兵」改名判据
 *     （该文件同时 re-export 本符号，保持既有导出面不变）；
 *   · `lib/battle/rewards.ts` —— `battleRewards` 的**老巢白名单**：只有在这里面的 bossId
 *     才发老巢战利品（100000 金币 + 40 星尘），白名单外一律 0 并 console.warn（**绝不抛异常**）。
 */
export const LAIR_BOSS_IDS_FROM_NODES: readonly PirateBossId[] = GALAXY_NODES
  .map((n) => n.pirateLair)
  .filter((id): id is PirateBossId => !!id);
