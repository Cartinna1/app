import { useCallback } from 'react';
import type { GameState } from '@/types/game';
import { getStockFeeMult, getStockSellFeeMult } from '@/data/gameData';
import { pushGoldLog } from '@/lib/turn/goldLog';

/** 股票 T+1 冷却判定（**唯一真值**）：买入当回合不能卖，`买入回合 + 1` 起可卖。
 *  结算（sellStock）、桌面表格与移动面板的"冷却"标记共用，勿再各写 `currentTurn <= buyTurn`。 */
export function isStockCooling(buyTurn: number | undefined, turn: number): boolean {
  return buyTurn !== undefined && turn <= buyTurn;
}

/** 冷却提示文案（**唯一真值**：两处面板文案与结算报错共用，勿再各自拼"第 N 回合"） */
export function getStockCooldownHint(buyTurn: number, currentTurn: number): string {
  const turnsLeft = buyTurn + 1 - currentTurn;
  return turnsLeft > 1 ? `第${buyTurn + 1}回合后可卖出（还需 ${turnsLeft - 1} 回合）` : `第${buyTurn + 1}回合后可卖出`;
}

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
          pushGoldLog(ship, prev.turn, -cost, `买入股票「${stock.name}」x${quantity}`);
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
          if (bt !== undefined && isStockCooling(bt, prev.turn)) { result = { error: `买入后需等待：${getStockCooldownHint(bt, prev.turn)}` }; return prev; }
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
          pushGoldLog(ship, prev.turn, revenue, `卖出股票「${stock.name}」x${quantity}`);
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
