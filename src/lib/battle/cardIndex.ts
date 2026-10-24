// ==================== 卡牌总表（唯一查询口） ====================
// A2 起，24 张敌方专属卡已经由 DEMO 生成进 `data/battle/cards.ts`（`BATTLE_CARDS`），
// 所以"玩家卡 + 敌人卡"是**同一份数据**，本文件不再做任何合并 —— 它只是给
// 船坞 / 机库 / 科技清单提供"按 id 取卡定义"的统一入口（免得各处直接摸生成文件）。
//
// ⚠ 与 `engine.CARDS` 的区别：engine 那份还带 `kw`/`fx`（战斗行为），本文件只有静态字段。

import type { ShipCardDef, ShipCardId } from '@/types/battle';
import { BATTLE_CARDS } from '@/data/battle/cards';

/** 全部卡牌定义（玩家 43 张 + 雇佣兵敌人 24 张 = 74 张） */
export const ALL_CARDS: Readonly<Record<string, ShipCardDef>> = BATTLE_CARDS;

/** 按 id 取卡定义；未知 id 返回 undefined（调用方兜底，不抛） */
export function getCardDef(cardId: ShipCardId | string): ShipCardDef | undefined {
  return ALL_CARDS[cardId];
}
