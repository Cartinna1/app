// ==================== 特产买卖价格（唯一真值） ====================
// 结算（hooks/useTrade 的 buySpecialty / sellSpecialty / blackMarketBuy）与
// 贸易面板显示（components/TradePanel）共用本文件，勿再各写一份。
//
// 为什么单独建这个文件：显示侧曾漏掉「讨价还价 AI 9 折」「反垄断 1.1×」「套利凭证 1.05×」「贸易枢纽 1.15×」，
// 并且买入价的分步 ceil / 黑市价的"末尾一次 ceil"与结算不一致 → 玩家看到的价/收益与实收不符。
//
// 口径一律以**结算**为准（本文件就是从结算代码逐字搬移出来的，未改数值）。

import { FACTIONS, getReputationTier } from '@/data/factions';
import { RELIC_BARGAIN_AI, RELIC_ANTI_MONOPOLY, RELIC_ARBITRAGE_NOTE } from '@/data/relics';
import { MODULE_TRADE_HUB } from '@/data/modules';

/** 特产买入单价（分步向上取整：声望折扣/加价 → 涨价 buff → 讨价还价 AI 9 折） */
export function getSpecialtyBuyUnitPrice(
  factionId: string,
  factionPrices: Record<string, number>,
  reputation: number,
  buyBuffMult: number,
  relicIds: string[]
): number {
  const faction = FACTIONS.find((f) => f.id === factionId);
  const tier = getReputationTier(reputation);
  let price = factionPrices[factionId] || faction?.basePrice || 0;
  if (reputation < -20 || tier.discount > 0) price = Math.ceil(price * (1 - tier.discount));
  price = Math.ceil(price * buyBuffMult);
  if (relicIds.includes(RELIC_BARGAIN_AI)) price = Math.ceil(price * 0.9);
  return price;
}

/** 黑市采购总价（市场价 × 涨价 buff × 黑市倍率 × 数量，**末尾一次 ceil**；不含声望折扣） */
export function getBlackMarketTotal(
  factionId: string,
  factionPrices: Record<string, number>,
  buyBuffMult: number,
  blackMarketMultiplier: number,
  qty: number
): number {
  const faction = FACTIONS.find((f) => f.id === factionId);
  const basePrice = factionPrices[factionId] || faction?.basePrice || 0;
  return Math.ceil(basePrice * buyBuffMult * (blackMarketMultiplier || 3.2) * qty);
}

/** 特产卖出总收益（收购价 × 数量 × 反垄断 × 套利凭证 × 贸易枢纽 × 售出 buff，**末尾一次 round**）
 *  收购单价由调用方用 getSellPrice 先算好传入（本函数只负责加成与取整） */
export function getSpecialtySellRevenue(
  qty: number,
  unitSellPrice: number,
  sellBuffMult: number,
  relicIds: string[],
  moduleIds: string[]
): number {
  const relicBonus = relicIds.includes(RELIC_ANTI_MONOPOLY) ? 1.1 : 1;
  const arbitrageBonus = relicIds.includes(RELIC_ARBITRAGE_NOTE) ? 1.05 : 1;
  const tradeHubBonus = moduleIds.includes(MODULE_TRADE_HUB) ? 1.15 : 1;
  return Math.round(unitSellPrice * qty * relicBonus * arbitrageBonus * tradeHubBonus * sellBuffMult);
}
