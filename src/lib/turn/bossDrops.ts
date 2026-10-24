// ==================== 悬赏头目掉落（唯一的掉落口径） ====================
// 用户裁定（`docs/03-雇佣兵协会.md` §2.7）：悬赏头目打赢 → 随机掉 **1~2 艘**该头目那 6 张里的卡，
// 写进 `cardLibrary`（份数 +1，同型可重复累加）。
//   · 敌方卡**不可建造**（`shipyard.ENEMY_SERIES` 拦），所以掉落是它们**唯一**的合法来源；
//   · 稀有度加权（白/蓝/紫/橙 = 100/45/15/6，合计 311）；
//   · 本文件**不吃 `Math.random`**：两个 roll 由调用方（reducer）传入，纯函数可回放。

import type { BattleRarity, PirateBossId, ShipCardId } from '@/types/battle';
import { BATTLE_CARDS } from '@/data/battle/cards';
import { MERCENARY_SERIES_CARDS } from '@/data/mercenary/cards';
import { PIRATE_BOSSES } from '@/data/battle/pirates';

/** 一次掉落的张数区间（含两端）：1~2 艘 */
export const BOSS_DROP_MIN = 1;
export const BOSS_DROP_MAX = 2;

/** 稀有度掉落权重（唯一数值位置；白/蓝/紫/橙） */
export const RARITY_DROP_WEIGHT: Readonly<Record<BattleRarity, number>> = {
  白: 100,
  蓝: 45,
  紫: 15,
  橙: 6,
};

/** 头目 → 它那 6 张卡的 `series`（`m01` 虫群 / `m02` 智械 / `m03` 灵潮 / `m04` 旧律） */
export const BOSS_SERIES: Readonly<Record<string, string>> = {
  m01: '虫群',
  m02: '智械',
  m03: '灵潮',
  m04: '旧律',
};

/** 该头目能不能掉卡（只有四支势力的头目会掉；`m05` 弱海盗与老巢/掠夺队都不掉） */
export function canDropForBoss(bossId: PirateBossId): boolean {
  const series = BOSS_SERIES[bossId];
  return !!series && !!PIRATE_BOSSES[bossId];
}

/** 该头目的掉落池：它那 6 张（顺序固定 = 加权抽样的顺序） */
export function bossDropPool(bossId: PirateBossId): readonly ShipCardId[] {
  const series = BOSS_SERIES[bossId];
  return series ? MERCENARY_SERIES_CARDS[series] || [] : [];
}

/** 把任意数夹到 [0, 0.999999]（避免 roll === 1 越界） */
function clamp01(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.max(0, Math.min(0.999999, value));
}

/**
 * 掷一次掉落：返回 **1~2 个 cardId**（可重复，同一场里抽到同一张就是 2 份）。
 * @param rollCount ∈[0,1) 决定张数（< 0.5 → 1 张，否则 2 张；各 50%）
 * @param rollPick  ∈[0,1) 用于**稀有度加权**抽卡（第 2 张用同一 roll 平移，仍是确定性的）
 * 不是掉落头目 → 返回空数组（调用方据此不写库、不写日志）。
 */
export function rollBossDrop(bossId: PirateBossId, rollCount: number, rollPick: number): ShipCardId[] {
  if (!canDropForBoss(bossId)) return [];
  const pool = bossDropPool(bossId);
  if (pool.length === 0) return [];
  const count = clamp01(rollCount) < 0.5 ? BOSS_DROP_MIN : BOSS_DROP_MAX;
  const weights = pool.map((id) => (BATTLE_CARDS[id] ? RARITY_DROP_WEIGHT[BATTLE_CARDS[id].rarity] : 1) || 1);
  const total = weights.reduce((sum, w) => sum + w, 0);
  const out: ShipCardId[] = [];
  for (let i = 0; i < count; i += 1) {
    const r = clamp01(rollPick + i * 0.37);
    let target = r * total;
    let picked = pool[pool.length - 1];
    for (let k = 0; k < pool.length; k += 1) {
      target -= weights[k];
      if (target < 0) { picked = pool[k]; break; }
    }
    out.push(picked);
  }
  return out;
}

/** 把掉落的卡写进卡库（**份数 +1**）：返回新的 `cardLibrary`。
 *  ⚠ `cardLibrary` 是"拥有什么"的唯一真值；同一张卡掉两次就是两份（舰队可拆两队）。 */
export function mergeDrops(cardLibrary: readonly ShipCardId[], drops: readonly ShipCardId[]): ShipCardId[] {
  if (drops.length === 0) return cardLibrary.slice();
  return [...cardLibrary, ...drops];
}

/** 掉落文案（**唯一产出口**）：`获得敌方战利品：裂壳虫 ×1、掘进虫 ×1（不可建造）` */
export function bossDropText(drops: readonly ShipCardId[]): string {
  if (drops.length === 0) return '';
  const names = new Map<ShipCardId, number>();
  for (const id of drops) names.set(id, (names.get(id) || 0) + 1);
  const parts = [...names.entries()].map(([id, n]) => {
    const def = BATTLE_CARDS[id];
    return `${def ? def.name : id} ×${n}`;
  });
  return `获得敌方战利品：${parts.join('、')}（不可建造）`;
}
