// ============================================================================
// 战舰科技 T28–T36 · 「解锁哪些舰船」的派生（纯函数，不依赖 React/DOM）
//
// 为什么单独一个文件（AGENTS 第三节「单一真值」）：
//   · 科技描述（`data/colony/techs.ts` 的 `description`）**只许是指号台词**（AGENTS 第八节），
//     所以"本科技解锁哪些卡"不能写进 description，也不能在 UI 里手写一份会过期的名单；
//   · 「系列 × 稀有度 → 解锁它的科技」的唯一真值是 `lib/battle/shipyard.ts` 的
//     `TECH_BY_SERIES` / `requiredTechId`，而**卡牌数据**（`data/battle/cards.ts` 的 series/rarity）
//     才是"有哪些卡"的真值 —— 本文件把两者**反过来查**：遍历全部可造卡，
//     按 `requiredTechId(card)` 归组 → 「科技 → 它解锁的系列 / 稀有度 / 型数」。
//     ⇒ 以后加卡（或改系列↔科技映射）这里自动跟上，不需要同步任何名单。
//   · 本文件不 import `shipyard.ts`（那会把造价表、建筑表、资源成本全拖进来），
//     只复用同一个 `requiredTechId` 判定 —— 映射仍只有一份。
// ============================================================================

import type { BattleRarity, ShipCardDef, ShipCardId } from '@/types/battle';
import { BATTLE_CARDS, BATTLE_CARD_IDS } from '@/data/battle/cards';
import { requiredTechId } from '@/lib/battle/shipyard';

/** 稀有度的展示顺序（与 data/battle/cards.ts 的 series→rarity 排列一致：白 → 蓝 → 紫 → 橙） */
const RARITY_ORDER: readonly BattleRarity[] = ['白', '蓝', '紫', '橙'];

/** 一个科技解锁的一组舰船（系列 + 稀有度 + 型数）：
 *  如 T28 → `{ series: '圣辉', rarities: ['蓝'], cardCount: 3 }`、T29 → 圣辉 `['紫','橙']` 3 型。 */
export interface TechShipUnlock {
  /** 卡牌数据里的系列名（如 '圣辉'） */
  series: string;
  /** 该系列在这个科技档里的稀有度（按 白 → 蓝 → 紫 → 橙 排序） */
  rarities: BattleRarity[];
  /** 型数（不是张数） */
  cardCount: number;
  /** 涉及的具体卡 id（数据顺序），供复验脚本核对 */
  cardIds: ShipCardId[];
}

/** 某张卡会不会出现在船坞的可造列表里（海盗系 PvE 专属、衍生单位不进卡库 —— 同 shipyard.isBuildableCard 口径） */
function buildable(card: ShipCardDef): boolean {
  return !card.token && card.series !== '海盗';
}

/**
 * 科技 id → 它解锁的舰船（**从卡牌数据反查**；没有科技的卡、不可造的卡都不参与）。
 * 惰性建一次并缓存：卡牌数据是静态的，且这里只做纯计算、无副作用。
 */
let cache: Map<string, TechShipUnlock[]> | null = null;

function index(): Map<string, TechShipUnlock[]> {
  if (cache) return cache;
  const map = new Map<string, TechShipUnlock[]>();
  for (const id of BATTLE_CARD_IDS) {
    const card = BATTLE_CARDS[id];
    if (!card || !buildable(card)) continue;
    const techId = requiredTechId(card);
    if (!techId) continue; // 白卡（与海盗系）不需要科技 → 不属于任何科技的解锁清单
    const groups = map.get(techId) || [];
    const hit = groups.find((g) => g.series === card.series);
    if (hit) {
      hit.cardCount += 1;
      hit.cardIds.push(id);
      if (!hit.rarities.includes(card.rarity)) {
        // 稀有度去重 + 保持 白→蓝→紫→橙 顺序（不硬编码组合，如 T29 = 紫 + 橙）
        const set = new Set<BattleRarity>([...hit.rarities, card.rarity]);
        hit.rarities = RARITY_ORDER.filter((r) => set.has(r));
      }
    } else {
      groups.push({ series: card.series, rarities: [card.rarity], cardCount: 1, cardIds: [id] });
    }
    map.set(techId, groups);
  }
  cache = map;
  return map;
}

/** 某科技解锁的舰船（没有则空数组；科技 id 不存在、或是循环科技都返回空数组） */
export function getTechShipUnlocks(techId: string | null | undefined): TechShipUnlock[] {
  if (!techId) return [];
  return index().get(techId) || [];
}

/**
 * 科技卡片上那一行「解锁」文案（**唯一真值**；`components/colony/ColonyPanel` 只渲染它）。
 * 例：T28 → `解锁：圣辉 蓝卡`；T29 → `解锁：圣辉 紫卡与橙卡`；T36 → `解锁：通用 蓝卡`。
 * 不需要科技 / 查不到卡时返回 null（UI 不渲染这一行）。
 */
export function techUnlockText(techId: string | null | undefined): string | null {
  const groups = getTechShipUnlocks(techId);
  if (groups.length === 0) return null;
  const parts = groups.map((g) => `${g.series} ${g.rarities.map((r) => `${r}卡`).join('与')}`);
  return `解锁：${parts.join('、')}`;
}
