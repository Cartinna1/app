// ==================== 价格波动（纯逻辑，从 useTurn 抽离） ====================
// 股票四因子（基础随机 + 均值回归 + 动量 + 板块联动 + 供需）；computePriceFluctuation
// 直接作为 FUNCTIONAL_UPDATE 的 updater。
// ⚠ 事件系统不参与市场价格：历史上的"情报"（事件发放 → 下回合定向偏移）已彻底移除，
//   新增的市场影响一律走独立的态势/消息面机制（见本文件股票因子的接入点），勿再从事件回接。

import type { GameState, Mothership, Stock } from '@/types/game';
import { MAT_MAX_UP, PRODUCT_PRICE_LIMITS, EVENT_LOG_LIMIT, createStockRefill } from '@/data/gameData';
import { getStockRefill } from '@/data/stockRefills';
import { pushGoldLog } from './goldLog';

// ===== 股票：地板与退市（2026-10 用户口径：不要保管费；退市给 10% 残值，且必须有预警出口） =====
/** 价格地板 = 基准价的 2%（原 20%）。⚠ 必须再钳 ≥1：公式里有 (price−ref)/ref 与 cost=price×1.03，价格归零会除以 0 */
const STOCK_FLOOR_RATIO = 0.02;
/** 退市风险区与每回合概率（越深越危险；蒙特卡洛定档：无脑抄底 10 回合从 +75% 降到 ≈0）
 *   跌破基准价 65%（MID）→ 每回合 3%；跌破 85%（DEEP）→ 每回合 12% */
const DELIST_DEEP = -0.85, DELIST_MID = -0.65, DELIST_P_DEEP = 0.12, DELIST_P_MID = 0.03;
/** 退市清算：按退市时的价格折 10% 返还持仓者（不是归零） */
const DELIST_RESIDUAL = 0.1;
/** 重整上限：一只股票最多重整 5 次（第 6 次退市即彻底关闭，由 data/stockRefills.ts 的全新公司补位） */
const MAX_RESTRUCTURES = 5;
/** 退市/重整唯一真值（UI 与"下一回合预告"都读它，别硬编码任何阈值或概率） */
export const STOCK_DELIST = {
  DEEP: DELIST_DEEP,
  MID: DELIST_MID,
  P_DEEP: DELIST_P_DEEP,
  P_MID: DELIST_P_MID,
  RESIDUAL: DELIST_RESIDUAL,
  MAX_RESTRUCTURES,
};

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

/** 价格波动 updater：股票多因子模型 */
export function computePriceFluctuation(prev: GameState): GameState {
  // 1. 先计算板块风气（每回合一次性生成，同板块共享）
  const sectorBiases: Record<string, number> = {};
  SECTORS.forEach((sector) => {
    sectorBiases[sector] = (Math.random() - 0.5) * 2 * 0.05; // ±5%
  });

  // 2. 股票波动（四因子：基础随机 + 均值回归 + 动量 + 板块联动 + 供需）
  let stocks = prev.stocks.map((s) => {
    if (s.delisted) return s;                                    // 已退市：价格冻结，不再参与波动
    const baseChange = (Math.random() - 0.5) * 2 * s.volatility;
    const deviation = (s.currentPrice - s.basePrice) / s.basePrice;
    const meanReversion = -deviation * 0.2; // 减弱回拉（旧0.4→新0.2）
    const lastChange = s.prices.length >= 2 ? (s.prices[s.prices.length - 1] - s.prices[s.prices.length - 2]) / s.prices[s.prices.length - 2] : 0;
    const momentum = lastChange * 0.25; // 加强趋势（旧0.15→新0.25）
    const sectorBias = sectorBiases[s.sector] || 0; // 板块联动
    const demandEffect = calculateDemandEffect(prev.ships, s.id, prev.turn); // 供需影响

    // ===== 市场态势接入点：将来新增的板块/个股影响因子（政策、局势、财报等）在此处加算 =====
    const totalChange = baseChange + meanReversion + momentum + sectorBias + demandEffect;
    const rawPrice = Math.round(s.currentPrice * (1 + totalChange));
    // 价格保护：下限 basePrice*2%（且 ≥1），上限 basePrice*3.0
    const newPrice = Math.max(1, Math.max(Math.round(s.basePrice * STOCK_FLOOR_RATIO), Math.min(Math.round(s.basePrice * 3.0), rawPrice)));
    // 退市判定：跌得越深，每回合退市概率越高（命中则价格冻结在当回合、标记 delisted）
    const dev = (newPrice - s.basePrice) / s.basePrice;
    const p = dev < DELIST_DEEP ? DELIST_P_DEEP : dev < DELIST_MID ? DELIST_P_MID : 0;
    const delisted = p > 0 && Math.random() < p;
    return { ...s, prices: [...s.prices, newPrice].slice(-30), currentPrice: newPrice, delisted: delisted || undefined };
  });

  // 2b. 退市清算：本回合**新**退市的股票，按最后价的 10% 折成金币返给持仓者，持仓清零并写金币流水
  const newlyDelisted = stocks.filter((s, i) => s.delisted && !prev.stocks[i]?.delisted);
  let ships = prev.ships;
  if (newlyDelisted.length > 0) {
    ships = prev.ships.map((ship) => {
      const next = { ...ship };
      let gained = 0;
      for (const s of newlyDelisted) {
        const qty = next.stockHoldings[s.id] || 0;
        if (qty <= 0) continue;
        gained += Math.round(s.currentPrice * qty * DELIST_RESIDUAL);
        next.stockHoldings = { ...next.stockHoldings, [s.id]: 0 };
        next.stockCosts = { ...next.stockCosts, [s.id]: 0 };
      }
      if (gained > 0) {
        next.gold += gained;                                     // ⚠ 先改金币再写流水（pushGoldLog 读当前金币作为余额）
        pushGoldLog(next, prev.turn, gained, `股票退市清算（${Math.round(DELIST_RESIDUAL * 100)}% 残值）`);
      }
      return next;
    });
  }

  // 2c. 重整再上市 / 彻底关闭（2026-10 口径）
  //   · 重整次数 < 5：重整再上市——restructures+1、价格重置回 basePrice、prices 清空为 [basePrice]、清掉 delisted
  //     （玩家持仓**不恢复**，退市当回合已按 10% 残值清算 = 上面那块，重整与否不影响清算）；
  //   · 已重整 5 次（第 6 次退市）：彻底关闭——保持 delisted 并标 permanentlyClosed，
  //     再从 data/stockRefills.ts 取一家全新公司补位（市场股票总数不变）。
  //   ⚠ 补位顺序**不新增存档字段**：本局已补过几次 = 市场里 `permanentlyClosed` 的个数，
  //     它本身就是"每关一只补一只"的账本，读档后自洽（旧档没有该字段 → 0 → 从第 1 家开始）。
  //     重整/关闭各写一条事件记录（与 ADD_EVENT_LOG 共用 EVENT_LOG_LIMIT 上限）。
  const restructured: { id: string; name: string; count: number }[] = [];
  const closed: Stock[] = [];
  let eventLog = prev.eventLog;
  if (newlyDelisted.length > 0) {
    const closedCount = stocks.filter((s) => s.permanentlyClosed).length;
    const nextStocks = [...stocks];
    newlyDelisted.forEach((s) => {
      const idx = nextStocks.findIndex((t) => t.id === s.id);   // ⚠ 用 id 找位（filter 出来的 i 是"新数组中已退市者的序号"，不是原数组下标）
      if (idx < 0) return;
      const used = s.restructures || 0;
      if (used < MAX_RESTRUCTURES) {
        // 重整再上市：回到正常交易，历史走势清空（只留基准价这一个点，走势图对 <2 点不绘制）
        nextStocks[idx] = {
          ...s,
          currentPrice: s.basePrice,
          prices: [s.basePrice],
          restructures: used + 1,
          delisted: undefined,
        };
        restructured.push({ id: s.id, name: s.name, count: used + 1 });
      } else {
        // 彻底关闭：记录证据（保留 delisted），位置由全新公司补上
        nextStocks[idx] = { ...s, permanentlyClosed: true };
        closed.push(nextStocks[idx]);
      }
    });
    // 补位：按顺序取下一家（用尽则从第 1 家循环 + 名字后加「·二代」这类后缀，见 stockRefills.getStockRefill）
    closed.forEach((dead, n) => {
      const idx = nextStocks.findIndex((t) => t.id === dead.id);
      if (idx < 0) return;
      const refill = createStockRefill(getStockRefill(closedCount + n));
      nextStocks[idx] = refill;
      eventLog = [
        { id: `stock_refill_${prev.turn}_${dead.id}`, turn: prev.turn, event: '股市动态', detail: `「${dead.name}」重整失败彻底关闭，新公司「${refill.name}」上市` },
        ...eventLog,
      ].slice(0, EVENT_LOG_LIMIT);
    });
    restructured.forEach((r) => {
      eventLog = [
        { id: `stock_restructure_${prev.turn}_${r.id}`, turn: prev.turn, event: '股市动态', detail: `「${r.name}」退市后重整再上市（第 ${r.count}/${MAX_RESTRUCTURES} 次），价格回到基准价` },
        ...eventLog,
      ].slice(0, EVENT_LOG_LIMIT);
    });
    stocks = nextStocks;
  }

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

  return { ...prev, stocks, materials, products, ships, eventLog };
}
