// ==================== 价格波动（纯逻辑，从 useTurn 抽离） ====================
// 四因子模型 + 情报兑现；computePriceFluctuation 直接作为 FUNCTIONAL_UPDATE 的 updater。

import type { GameState, Mothership } from '@/types/game';
import { MAT_MAX_UP, PRODUCT_PRICE_LIMITS } from '@/data/gameData';

// 板块列表（用于生成板块风气）
const SECTORS = ['能源', '科技', '军工', '生物', '医疗', '金融', '资源', '科研教育', '基建设施', '娱乐服务'];

// 供需影响计算（简化版：统计本回合净买入量）
function calculateDemandEffect(ships: Mothership[], stockId: string, currentTurn: number): number {
  const CIRCULATION_BASE = 100; // 虚拟基准流通量
  const DEMAND_COEFF = 0.02; // 每100股净买入推价2%

  let netBuy = 0;
  ships.forEach((ship) => {
    // 买入：如果本回合买入了这只股票
    const buyTurn = ship.stockBuyTurn[stockId];
    if (buyTurn === currentTurn) {
      netBuy += ship.stockHoldings[stockId] || 0;
    }
    // 卖出：如果本回合卖出了这只股票
    const sellTurn = ship.stockSellThisTurn?.[stockId];
    if (sellTurn === currentTurn) {
      netBuy -= ship.stockSellQtyThisTurn?.[stockId] || 0;
    }
  });

  return (netBuy / CIRCULATION_BASE) * DEMAND_COEFF;
}

// ==================== 情报兑现辅助函数 ====================
// 解析股票情报字符串，返回 { name, direction(1=涨,-1=跌), magnitude }
function parseStockTip(tip: string | undefined): { name: string; direction: number; magnitude: number } | null {
  if (!tip) return null;
  const match = tip.match(/「(.+?)」.+?可能(上涨|下跌)\s+(\d+)%/);
  if (!match) return null;
  return { name: match[1], direction: match[2] === '上涨' ? 1 : -1, magnitude: parseInt(match[3], 10) };
}
// 解析原料情报字符串
function parseMatTip(tip: string | undefined): { name: string; direction: number; magnitude: number } | null {
  if (!tip) return null;
  const match = tip.match(/「(.+?)」下回合可能(上涨|下跌)\s+(\d+)%/);
  if (!match) return null;
  return { name: match[1], direction: match[2] === '上涨' ? 1 : -1, magnitude: parseInt(match[3], 10) };
}

/** 价格波动 updater：四因子模型 + 情报兑现 */
export function computePriceFluctuation(prev: GameState): GameState {
  // 从舰船获取当前回合情报
  const ship = prev.ships[0];
  const stockTip = parseStockTip(ship?.stockTipThisTurn);
  const matTip = parseMatTip(ship?.matTipThisTurn);

  // 1. 先计算板块风气（每回合一次性生成，同板块共享）
  const sectorBiases: Record<string, number> = {};
  SECTORS.forEach((sector) => {
    sectorBiases[sector] = (Math.random() - 0.5) * 2 * 0.05; // ±5%
  });

  // 2. 股票波动（四因子：基础随机 + 均值回归 + 动量 + 板块联动 + 供需）
  const stocks = prev.stocks.map((s) => {
    const baseChange = (Math.random() - 0.5) * 2 * s.volatility;
    const deviation = (s.currentPrice - s.basePrice) / s.basePrice;
    const meanReversion = -deviation * 0.2; // 减弱回拉（旧0.4→新0.2）
    const lastChange = s.prices.length >= 2 ? (s.prices[s.prices.length - 1] - s.prices[s.prices.length - 2]) / s.prices[s.prices.length - 2] : 0;
    const momentum = lastChange * 0.25; // 加强趋势（旧0.15→新0.25）
    const sectorBias = sectorBiases[s.sector] || 0; // 板块联动
    const demandEffect = calculateDemandEffect(prev.ships, s.id, prev.turn); // 供需影响

    // 情报兑现：如果情报匹配该股票，施加定向偏移
    let intelEffect = 0;
    if (stockTip && s.name.includes(stockTip.name)) {
      // 情报兑现：偏移 = 方向 * 幅度% * 0.6（兑现60%的承诺，留一点随机性）
      intelEffect = stockTip.direction * (stockTip.magnitude / 100) * 0.6;
    }

    const totalChange = baseChange + meanReversion + momentum + sectorBias + demandEffect + intelEffect;
    // 价格保护：下限 basePrice*0.2，上限 basePrice*3.0
    const rawPrice = Math.round(s.currentPrice * (1 + totalChange));
    const newPrice = Math.max(Math.round(s.basePrice * 0.2), Math.min(Math.round(s.basePrice * 3.0), rawPrice));
    return { ...s, prices: [...s.prices, newPrice].slice(-30), currentPrice: newPrice };
  });

  // 3. 原料波动：每回合价格完全独立，直接基于基准价计算
  // 例：基准500，涨→随机147%→500×1.147=573.5；跌→随机10%→500×0.9=450
  const MAT_MAX_DOWN = 0.15;
  const materials = prev.materials.map((m) => {
    const base = m.basePrice;
    const maxUp = MAT_MAX_UP[m.id] || 2.0;

    let multiplier: number;
    if (Math.random() < 0.5) {
      // 50%概率跌：基准价 × (1 - 随机0%~15%)
      multiplier = 1 - Math.random() * MAT_MAX_DOWN;
    } else {
      // 50%概率涨：基准价 × (1 + 随机0%~maxUp%)
      multiplier = 1 + Math.random() * maxUp;
    }

    let newPrice = Math.round(base * multiplier);

    // 情报兑现：额外加/减基于基准价的固定金额
    if (matTip && m.name.includes(matTip.name)) {
      newPrice += Math.round(matTip.direction * base * (matTip.magnitude / 100) * 0.3);
    }

    // 上下限保护
    const upperLimit = Math.round(base * (1 + maxUp));
    const lowerLimit = Math.round(base * (1 - MAT_MAX_DOWN));
    newPrice = Math.max(lowerLimit, Math.min(upperLimit, newPrice));
    newPrice = Math.max(10, newPrice);
    return { ...m, prices: [...m.prices, newPrice].slice(-30), currentPrice: newPrice };
  });

  // 4. 产品波动：每回合价格完全独立，直接基于基准价计算
  // 例：基准1000，涨→随机20%→1000×1.2=1200；跌→随机15%→1000×0.85=850
  const products = prev.products.map((p) => {
    const base = p.baseSellPrice;
    const limits = PRODUCT_PRICE_LIMITS[p.id] || { maxUp: 0.20, maxDown: 0.15 };

    let multiplier: number;
    if (Math.random() < 0.5) {
      // 50%概率跌：基准价 × (1 - 随机0%~maxDown%)
      multiplier = 1 - Math.random() * limits.maxDown;
    } else {
      // 50%概率涨：基准价 × (1 + 随机0%~maxUp%)
      multiplier = 1 + Math.random() * limits.maxUp;
    }

    let newPrice = Math.round(base * multiplier);

    // 上下限保护
    const upperLimit = Math.round(base * (1 + limits.maxUp));
    const lowerLimit = Math.round(base * (1 - limits.maxDown));
    newPrice = Math.max(lowerLimit, Math.min(upperLimit, newPrice));
    newPrice = Math.max(10, newPrice);
    return { ...p, sellPrices: [...p.sellPrices, newPrice], currentSellPrice: newPrice };
  });

  return { ...prev, stocks, materials, products };
}
