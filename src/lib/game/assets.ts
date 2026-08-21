// ==================== 舰队总资产（唯一真值） ====================
// 本模块是「舰队总资产」的唯一计算来源，UI 展示与系统判定（股息/誊录仪等）共用同一口径。
//
// 口径约定：产品按标价（currentSellPrice）估值，【不】计入售价加成（银河之心技能 sellPriceBonus、
// 事件/星尘集市临时 sellBonuses）。原因：
//   1. 账实相符 —— 玩家看到的总资产与系统用于判定（股息、誊录仪、破产相关）的总资产是同一个数；
//   2. 加成是「卖出时才兑现的交易溢价」，属于交易行为而非资产本身的价值；
//   3. 避免加成流派在「按总资产发钱」的机制上被二次放大，利于控制后期通胀。
// 修改资产口径时只需改这里，UI 与结算不会再分叉。

import type { Mothership, Stock, RawMaterial, Product } from '@/types/game';

/**
 * 计算舰队总资产（不含售价加成）。
 * 构成：现金 - 贷款未还 + 持仓股票市值 + 原料库存市值 + 产品库存标价。
 */
export function getShipTotalAssets(
  ship: Mothership,
  stocks: Stock[],
  materials: RawMaterial[],
  products: Product[]
): number {
  let total = ship.gold;
  const loanDebt = ship.loans.reduce((sum, l) => sum + (l.totalRepay - l.repaid), 0);
  total -= loanDebt;

  Object.entries(ship.stockHoldings).forEach(([stockId, count]) => {
    const stock = stocks.find((s) => s.id === stockId);
    if (stock && count > 0) total += stock.currentPrice * count;
  });

  Object.entries(ship.materials).forEach(([matId, count]) => {
    const mat = materials.find((m) => m.id === matId);
    if (mat && count > 0) total += mat.currentPrice * count;
  });

  // 产品按标价估值，不计售价加成（统一口径，见文件头注释）
  ship.products.forEach((p) => {
    const product = products.find((pr) => pr.id === p.productId);
    if (product) total += product.currentSellPrice;
  });

  return Math.round(total);
}
