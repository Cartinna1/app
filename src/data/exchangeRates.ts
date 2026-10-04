// ==================== 资源兑换价与星尘集市价格（唯一真值） ====================
// 为什么单独一个文件：这些价格原来同时存在于「hook 实扣」与「面板文案/置灰判定」两处
// （合金 1200、食物 800、投资 8000、黑市默认倍率 3.2、星尘集市 4/2/15…），
// 改一处不会影响另一处 → 玩家看到的价与实扣不符。收敛方式与特产价格的
// lib/turn/tradePrice.ts 完全一致：结算与显示都从这里取。

/** 合金市场：1 合金 的金币价（ProductMarket 与 useGameState.buyAlloy 共用） */
export const ALLOY_GOLD_PRICE = 1200;
/** 星尘 → 合金：1 星尘 换多少合金 */
export const ALLOY_PER_STARDUST = 5;

/** 食物补给：1 食物 的金币价 */
export const FOOD_GOLD_PRICE = 800;
/** 合金 → 食物：1 合金 换多少食物 */
export const FOOD_PER_ALLOY = 2;
/** 星尘 → 食物：1 星尘 换多少食物 */
export const FOOD_PER_STARDUST = 20;

/** 声望投资：每次固定消耗的金币与每回合次数上限（useTrade.investFaction 与贸易面板文案共用） */
export const INVEST_GOLD_PER_REP = 8000;
export const INVEST_MAX_PER_TURN = 10;

/** 黑市：每回合随机倍率的基准值与浮动区间（factionTurn 生成、读档兜底、UI 显示共用） */
export const BLACK_MARKET_DEFAULT = 3.2;
export const BLACK_MARKET_SPREAD = 1.3;

/** 星尘集市条目：星尘价与效果数值的唯一真值（hook 校验/扣减与面板条目表共用；
 *  配色与图标属展示层，留在 ProductMarket。turns/bonus 用于「产品售价 +N% 持续 M 回合」。 */
export interface StardustShopEntry {
  key: string;
  /** 星尘价格 */
  cost: number;
  /** 售价加成百分比（bonus* 条目用） */
  bonus?: number;
  /** 加成持续回合（bonus* 条目用） */
  turns?: number;
  /** 直接给金币（gold5000 条目用） */
  goldGain?: number;
  /** 给随机原料数量（randomMats 条目用） */
  matsGain?: number;
}

export const STARDUST_SHOP: Record<string, StardustShopEntry> = {
  randomMats: { key: 'randomMats', cost: 4, matsGain: 10 },
  bonus10: { key: 'bonus10', cost: 8, bonus: 10, turns: 5 },
  bonus25: { key: 'bonus25', cost: 15, bonus: 25, turns: 5 },
  gold5000: { key: 'gold5000', cost: 2, goldGain: 5000 },
  rerollPolicy: { key: 'rerollPolicy', cost: 15 },
};

/** 强制刷新贸易政策的星尘价（= STARDUST_SHOP.rerollPolicy.cost，供 hook 直接引用） */
export const POLICY_REROLL_STARDUST = STARDUST_SHOP.rerollPolicy.cost;
