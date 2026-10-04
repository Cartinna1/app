import { useCallback } from 'react';
import type { GameState } from '@/types/game';
import { GOLD_LOG_LIMIT, getStockFeeMult, getStockSellFeeMult } from '@/data/gameData';

export function useStock(
  dispatch: React.Dispatch<{ type: 'FUNCTIONAL_UPDATE'; updater: (state: GameState) => GameState }>
) {
  const buyStock = useCallback(
    (shipIndex: number, stockId: string, quantity: number): { error: string | null } => {
      if (quantity <= 0) return { error: '购买数量必须大于0' };
      let result: { error: string | null } = { error: null };

      dispatch({
        type: 'FUNCTIONAL_UPDATE',
        updater: (prev) => {
          const ships = [...prev.ships];
          const ship = { ...ships[shipIndex] };
          if (ship.gold <= 0) { result = { error: '金币不足无法买入' }; return prev; }
          const stock = prev.stocks.find((s) => s.id === stockId);
          if (!stock) { result = { error: '股票不存在' }; return prev; }

          // 买入手续费走唯一真值 getStockFeeMult（与 StockMarket 显示同源）
          const feeMult = getStockFeeMult(ship);
          const cost = Math.round(stock.currentPrice * quantity * feeMult);
          if (ship.gold < cost) { result = { error: '金币不足' }; return prev; }

          ship.gold -= cost;
          ship.goldLog = [{ turn: prev.turn, amount: -cost, reason: `买入股票「${stock.name}」x${quantity}`, balanceAfter: ship.gold }, ...ship.goldLog].slice(0, GOLD_LOG_LIMIT);
          ship.stockHoldings = { ...ship.stockHoldings };
          ship.stockHoldings[stockId] = (ship.stockHoldings[stockId] || 0) + quantity;
          ship.stockBuyTurn = { ...ship.stockBuyTurn, [stockId]: prev.turn };
          ship.stockCosts = { ...ship.stockCosts };
          const prevQty = (ship.stockHoldings[stockId] || 0) - quantity;
          const newAvg = ((ship.stockCosts[stockId] || 0) * prevQty + stock.currentPrice * quantity) / ship.stockHoldings[stockId];
          ship.stockCosts[stockId] = Math.round(newAvg * 100) / 100;
          ships[shipIndex] = ship;
          result = { error: null };
          return { ...prev, ships };
        },
      });
      return result;
    },
    [dispatch]
  );

  const sellStock = useCallback(
    (shipIndex: number, stockId: string, quantity: number): { error: string | null; profit?: number; profitRate?: number } => {
      if (quantity <= 0) return { error: '卖出数量必须大于0' };
      let result: { error: string | null; profit?: number; profitRate?: number } = { error: null };

      dispatch({
        type: 'FUNCTIONAL_UPDATE',
        updater: (prev) => {
          const ships = [...prev.ships];
          const ship = { ...ships[shipIndex] };
          const bt = ship.stockBuyTurn[stockId];
          if (bt !== undefined && prev.turn <= bt) { result = { error: `第${bt}回合买入，需第${bt + 1}回合后卖出` }; return prev; }
          const stock = prev.stocks.find((s) => s.id === stockId);
          if (!stock) { result = { error: '股票不存在' }; return prev; }
          const hold = ship.stockHoldings[stockId] || 0;
          if (hold < quantity) { result = { error: '持仓不足' }; return prev; }

          // 卖出到账倍率唯一真值：黄金集团 0 手续费 = 1.0；万众一心手续费减半 = 0.985（与其技能文案一致）；
          // 其余 = 0.97。显示侧（StockMarket 收入预览/说明）读同一函数。
          const feeMult = getStockSellFeeMult(ship);
          const revenue = Math.round(stock.currentPrice * quantity * feeMult);
          const avgCost = ship.stockCosts[stockId] || stock.currentPrice;
          const costBasis = Math.round(avgCost * quantity);
          const profit = revenue - costBasis;
          const profitRate = costBasis > 0 ? Math.round((profit / costBasis) * 10000) / 100 : 0;

          ship.gold += revenue;
          if (ship.bankrupt && ship.gold > 0) ship.bankrupt = false;
          ship.goldLog = [{ turn: prev.turn, amount: revenue, reason: `卖出股票「${stock.name}」x${quantity}`, balanceAfter: ship.gold }, ...ship.goldLog].slice(0, GOLD_LOG_LIMIT);
          ship.stockHoldings = { ...ship.stockHoldings };
          ship.stockHoldings[stockId] = hold - quantity;
          ship.stockCosts = { ...ship.stockCosts };
          // 记录卖出（用于供需影响计算）
          ship.stockSellThisTurn = { ...ship.stockSellThisTurn, [stockId]: prev.turn };
          ship.stockSellQtyThisTurn = { ...ship.stockSellQtyThisTurn, [stockId]: (ship.stockSellQtyThisTurn?.[stockId] || 0) + quantity };
          if (ship.stockHoldings[stockId] === 0) {
            delete ship.stockHoldings[stockId];
            delete ship.stockCosts[stockId];
            delete ship.stockBuyTurn[stockId];
          }
          result = { error: null, profit, profitRate };
          ships[shipIndex] = ship;
          return { ...prev, ships };
        },
      });
      return result;
    },
    [dispatch]
  );

  return { buyStock, sellStock };
}
