// ==================== 卡牌总表（唯一查询口） ====================
// A2 起，24 张敌方专属卡已经由 DEMO 生成进 `data/battle/cards.ts`（`BATTLE_CARDS`），
// 所以"玩家卡 + 敌人卡"是**同一份数据**，本文件不再做任何合并 —— 它只是给
// 船坞 / 机库 / 科技清单提供"按 id 取卡定义"的统一入口（免得各处直接摸生成文件）。
//
// ⚠ 与 `engine.CARDS` 的区别：engine 那份还带 `kw`/`fx`（战斗行为），本文件只有静态字段。

import type { ShipCardDef, ShipCardId } from '@/types/battle';
import { BATTLE_CARDS } from '@/data/battle/cards';

/** 全部卡牌定义（74 张 = 玩家 33 + 海盗 10 + 雇佣兵 24 + 衍生 7） */
export const ALL_CARDS: Readonly<Record<string, ShipCardDef>> = BATTLE_CARDS;

/** 按 id 取卡定义；未知 id 返回 undefined（调用方兜底，不抛） */
export function getCardDef(cardId: ShipCardId | string): ShipCardDef | undefined {
  return ALL_CARDS[cardId];
}

// ---------------- 卡牌展示排序（唯一真值） ----------------

/** 稀有度序号（白 < 蓝 < 紫 < 橙；`衍` 等非常规值排最后，不参与比较基数） */
const RARITY_ORDER: Readonly<Record<string, number>> = { 白: 0, 蓝: 1, 紫: 2, 橙: 3 };
function rarityRank(rarity: string): number {
  const n = RARITY_ORDER[rarity];
  return n == null ? 99 : n;
}

/** id 升序（卡 id 是 `h1` / `c4` 这种短标识，直接按代码单元比即可） */
function compareCardId(a: string, b: string): number {
  return a < b ? -1 : a > b ? 1 : 0;
}

/**
 * 卡牌展示排序的**唯一真值**：系列 → **稀有度（白<蓝<紫<橙）** → 费用 → id。
 * 机库卡库 / 机库编队 / 船坞列表**都调它**（少一处就又分叉）。
 * 行只要带 `series` / `rarity` / `cost` / `id` 四个字段即可（`LibraryRow` / `FleetRow` / `ShipyardCardRow` 都满足）。
 *
 * 为什么稀有度在费用前：用户 2026-10 报「涤罪炮舰（紫·5 费）排在圣光方舟（橙·6 费）后面」——
 * 按费用排会让高稀有度卡被低稀有度卡顶到后面，玩家看不出稀有度梯度；同系列内先按稀有度分档
 * （白→蓝→紫→橙）、再档内按费用，才符合"越靠后越稀有"的直觉。
 * ⚠ 四级键保证排序**唯一且稳定**（同输入两次结果一致），不依赖输入顺序。
 */
export function compareCardOrder(
  a: { id: string; series: string; rarity: string; cost: number },
  b: { id: string; series: string; rarity: string; cost: number }
): number {
  const s = compareCardId(a.series, b.series);
  if (s !== 0) return s;
  const r = rarityRank(a.rarity) - rarityRank(b.rarity);
  if (r !== 0) return r;
  if (a.cost !== b.cost) return a.cost - b.cost;
  return compareCardId(a.id, b.id);
}
