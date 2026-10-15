import { useState, useMemo, memo } from 'react';
import type { Stock, Mothership } from '@/types/game';
import { getStockFeeMult, getStockSellFeeMult } from '@/data/gameData';
import { isStockCooling, getStockCooldownHint } from '@/hooks/useStock';
import { getStockDelistRisk, type StockDelistRiskLevel } from '@/lib/turn/nextTurnHints';
import { STOCK_DELIST } from '@/lib/turn/priceFluctuation';
import StockPriceChart from './StockPriceChart';
import { TrendingUp, TrendingDown, Search, Clock, ArrowLeft } from 'lucide-react';

interface StockMarketProps {
  stocks: Stock[];
  ship: Mothership;
  shipIndex: number;
  currentTurn: number;
  onBuy: (shipIndex: number, stockId: string, qty: number) => { error: string | null };
  onSell: (shipIndex: number, stockId: string, qty: number) => { error: string | null; profit?: number; profitRate?: number };
}

const SECTOR_COLORS: Record<string, string> = {
  '能源': 'bg-orange-900/30 text-orange-400 border-orange-700/40',
  '科技': 'bg-cyan-900/30 text-cyan-400 border-cyan-700/40',
  '军工': 'bg-red-900/30 text-red-400 border-red-700/40',
  '生物': 'bg-green-900/30 text-green-400 border-green-700/40',
  '医疗': 'bg-emerald-900/30 text-emerald-400 border-emerald-700/40',
  '金融': 'bg-yellow-900/30 text-yellow-400 border-yellow-700/40',
  '资源': 'bg-amber-900/30 text-amber-400 border-amber-700/40',
  '科研教育': 'bg-purple-900/30 text-purple-400 border-purple-700/40',
  '基建设施': 'bg-indigo-900/30 text-indigo-400 border-indigo-700/40',
  '娱乐服务': 'bg-pink-900/30 text-pink-400 border-pink-700/40',
};

/** 退市徽章配色（唯一一张表：列表行与详情区共用） */
const DELIST_BADGE_CLASS: Record<StockDelistRiskLevel, string> = {
  none: '',
  mid: 'bg-red-950/60 text-red-400 border-red-700/60',
  deep: 'bg-red-900/70 text-red-200 border-red-500/70',
  delisted: 'bg-slate-800 text-slate-400 border-slate-600',
};

/** 退市徽章（唯一渲染点：列表行、手机卡片、桌面/手机详情区都渲染它）
 *  判据与概率来自 lib 的 getStockDelistRisk（阈值读 STOCK_DELIST，勿在这里写 -0.65 / 3% / 12% / 5 次）。 */
function DelistBadge({ stock }: { stock: Stock }) {
  const risk = getStockDelistRisk(stock);
  if (risk.level === 'none') return null;
  const restructureNote =
    risk.level === 'delisted'
      ? ''
      : risk.restructures > 0
        ? ` · 已重整 ${risk.restructures}/${STOCK_DELIST.MAX_RESTRUCTURES}`
        : '';
  const label =
    risk.level === 'delisted'
      ? `已退市${risk.permanentlyClosed ? '（不再重整）' : ''}`
      : `${risk.level === 'deep' ? '高危区' : '退市风险区'} · 每回合 ${Math.round(risk.chance * 100)}%${restructureNote}`;
  return (
    <span className={`inline-block align-middle flex-shrink-0 text-[10px] px-1.5 py-0.5 rounded border ${DELIST_BADGE_CLASS[risk.level]}`}>
      {label}
    </span>
  );
}

/** 退市后果提示（唯一文案出处：桌面与手机详情区共用；概率/残值/重整上限一律读 STOCK_DELIST） */
function delistNoticeOf(stock: Stock): string {
  const risk = getStockDelistRisk(stock);
  const residual = Math.round(STOCK_DELIST.RESIDUAL * 100);
  if (risk.level === 'delisted') {
    return risk.permanentlyClosed
      ? `已退市且不再重整（重整 ${STOCK_DELIST.MAX_RESTRUCTURES}/${STOCK_DELIST.MAX_RESTRUCTURES} 次已用尽），不能再买入或卖出；退市时持仓已按最后价 ${residual}% 残值清算`
      : `已退市，不能再买入或卖出；退市时持仓已按最后价 ${residual}% 残值清算`;
  }
  if (risk.level === 'none') return '';
  const zone = risk.level === 'deep' ? '高危区' : '退市风险区';
  const restructure = risk.restructuresLeft > 0
    ? `；退市后会用尽一次重整机会（已重整 ${risk.restructures}/${STOCK_DELIST.MAX_RESTRUCTURES} 次），重整再上市时价格回到基准价 ${stock.basePrice}，但持仓不恢复，只按残值清算`
    : `；重整 ${STOCK_DELIST.MAX_RESTRUCTURES} 次已用尽，再退市即彻底关闭（不再上市，原位置补一家新公司）`;
  return `${zone}：每回合 ${Math.round(risk.chance * 100)}% 概率退市，退市后按最后价 ${residual}% 残值清算${restructure}`;
}

function StockMarket({ stocks, ship, shipIndex, currentTurn, onBuy, onSell }: StockMarketProps) {
  const [search, setSearch] = useState('');
  // 只存选中的 id：详情区每次渲染按 id 取**当前**数据，否则结束回合后价格/退市标记会停留在点击那一刻
  const [selectedStockId, setSelectedStockId] = useState<string | null>(null);
  const [activeSector, setActiveSector] = useState<string>('全部');
  const [tradeQty, setTradeQty] = useState(1);
  const [tradeMode, setTradeMode] = useState<'buy' | 'sell'>('buy');
  const [message, setMessage] = useState('');
  const [messageType, setMessageType] = useState<'success' | 'error' | 'profit' | 'loss'>('success');

  const selectedStock = useMemo(
    () => (selectedStockId ? stocks.find((s) => s.id === selectedStockId) || null : null),
    [stocks, selectedStockId]
  );

  const sectors = useMemo(() => {
    const set = new Set(stocks.map((s) => s.sector));
    return ['全部', '持有', ...Array.from(set).sort()];
  }, [stocks]);

  const holdings = ship?.stockHoldings || {};
  const feeMult = getStockFeeMult(ship);
  // 卖出到账倍率：唯一真值（勿再用 `2 − 买入倍率` 反推——万众一心手续费减半时反推会得到 ×1.015，与实收 ×0.985 差 4.6%）
  const sellFeeMult = getStockSellFeeMult(ship);

  const filteredStocks = useMemo(() => {
    let result = stocks;
    if (activeSector === '持有') {
      result = result.filter((s) => (holdings[s.id] || 0) > 0);
    } else if (activeSector !== '全部') {
      result = result.filter((s) => s.sector === activeSector);
    }
    if (search.trim()) {
      const q = search.toLowerCase();
      result = result.filter((s) => s.name.toLowerCase().includes(q) || s.sector.toLowerCase().includes(q));
    }
    return result;
  }, [stocks, activeSector, search, holdings]);

  const handleTrade = () => {
    if (!selectedStock || tradeQty <= 0) return;
    setMessage('');
    if (tradeMode === 'buy') {
      const totalCost = Math.round(selectedStock.currentPrice * tradeQty * feeMult);
      if (ship.gold < totalCost) {
        setMessage(`金币不足，需${totalCost.toLocaleString()}金币`);
        setMessageType('error');
        setTimeout(() => setMessage(''), 5000);
        return;
      }
      const result = onBuy(shipIndex, selectedStock.id, tradeQty);
      if (result.error) {
        setMessage(result.error);
        setMessageType('error');
      } else {
        setMessage(`成功买入 ${tradeQty} 股 ${selectedStock.name}，总花费 ${totalCost.toLocaleString()} 金币（含手续费）`);
        setMessageType('success');
      }
    } else {
      const result = onSell(shipIndex, selectedStock.id, tradeQty);
      if (result.error) {
        setMessage(result.error);
        setMessageType('error');
      } else {
        const revenue = Math.round(selectedStock.currentPrice * tradeQty * sellFeeMult);
        setMessage(`成功卖出 ${tradeQty} 股 ${selectedStock.name}，收入 ${revenue.toLocaleString()} 金币`);
        setMessageType('success');
      }
    }
    setTimeout(() => setMessage(''), 5000);
  };

  const costs = ship?.stockCosts || {};
  const buyTurns = ship?.stockBuyTurn || {};

  const getCooldownStatus = (stockId: string): { cooling: boolean; buyTurn?: number } => {
    const bt = buyTurns[stockId];
    return isStockCooling(bt, currentTurn) ? { cooling: true, buyTurn: bt } : { cooling: false };
  };

  // 移动端选中某支股票后显示交易面板
  const [mobileTradeStock, setMobileTradeStock] = useState<Stock | null>(null);

  return (
    <div>
      <h2 className="text-xl md:text-2xl font-bold text-white mb-3 md:mb-4">银河股票交易所</h2>

      {/* ========== 移动端：全屏交易面板 ========== */}
      {mobileTradeStock && (
        <div className="md:hidden fixed inset-0 bg-slate-950 z-50 p-4 overflow-auto">
          <button
            onClick={() => setMobileTradeStock(null)}
            className="mb-4 flex items-center gap-1 text-sm text-cyan-400"
          >
            <ArrowLeft size={18} /> 返回列表
          </button>
          <MobileTradePanel
            stock={mobileTradeStock}
            ship={ship}
            shipIndex={shipIndex}
            currentTurn={currentTurn}
            onBuy={onBuy}
            onSell={onSell}
          />
        </div>
      )}

      <div className="flex flex-col md:flex-row gap-3 md:gap-4">
        {/* 股票列表 */}
        <div className="flex-1 min-w-0">
          {/* 搜索 */}
          <div className="relative mb-3">
            <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" />
            <input
              type="text"
              placeholder="搜索股票名称..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full bg-slate-900/60 border border-slate-700 rounded-lg pl-9 pr-4 py-2 text-sm text-slate-200 placeholder-slate-600 focus:outline-none focus:border-cyan-500"
            />
          </div>

          {/* 板块筛选 - 横向滚动 */}
          <div className="flex gap-1.5 mb-3 overflow-x-auto pb-1 scrollbar-hide">
            {sectors.map((sector) => (
              <button
                key={sector}
                onClick={() => { setActiveSector(sector); setSelectedStockId(null); }}
                className={`flex-shrink-0 px-2.5 py-1 rounded-md text-xs font-bold border transition-all ${
                  activeSector === sector
                    ? 'bg-cyan-600/30 text-cyan-400 border-cyan-500/60'
                    : 'bg-slate-800 text-slate-400 border-slate-700 hover:border-slate-500'
                }`}
              >
                {sector}
                {sector !== '全部' && (
                  <span className="ml-1 text-slate-500">
                    ({sector === '持有' ? Object.values(holdings).filter((v) => v > 0).length : stocks.filter((s) => s.sector === sector).length})
                  </span>
                )}
              </button>
            ))}
          </div>

          {/* ===== 桌面端：表格 ===== */}
          <div className="hidden md:block bg-slate-900/60 border border-slate-700 rounded-xl overflow-hidden">
            <table className="w-full text-sm">
              <thead className="bg-slate-800/80 text-slate-400">
                <tr>
                  <th className="px-3 py-2 text-left">名称</th>
                  <th className="px-3 py-2 text-left">板块</th>
                  <th className="px-3 py-2 text-right">价格</th>
                  <th className="px-3 py-2 text-right">涨跌</th>
                  <th className="px-3 py-2 text-right">持仓</th>
                  <th className="px-3 py-2 text-center">状态</th>
                </tr>
              </thead>
              <tbody>
                {filteredStocks.map((stock) => {
                  const prevPrice = stock.prices[stock.prices.length - 2] || stock.currentPrice;
                  const change = ((stock.currentPrice - prevPrice) / prevPrice) * 100;
                  const hold = holdings[stock.id] || 0;
                  const isSelected = selectedStock?.id === stock.id;
                  const cd = getCooldownStatus(stock.id);
                  const sectorColor = SECTOR_COLORS[stock.sector] || 'bg-slate-800 text-slate-400 border-slate-700';
                  return (
                    <tr
                      key={stock.id}
                      className={`border-t border-slate-800 cursor-pointer transition-colors ${
                        isSelected ? 'bg-cyan-950/30' : 'hover:bg-slate-800/50'
                      }`}
                      onClick={() => setSelectedStockId(stock.id)}
                    >
                      <td className="px-3 py-2">
                        <div className="flex items-center gap-1.5 flex-wrap">
                          <span className="font-medium text-slate-200">{stock.name}</span>
                          <DelistBadge stock={stock} />
                        </div>
                      </td>
                      <td className="px-3 py-2">
                        <span className={`text-xs px-2 py-0.5 rounded border ${sectorColor}`}>{stock.sector}</span>
                      </td>
                      <td className="px-3 py-2 text-right font-mono text-slate-200">{stock.currentPrice}</td>
                      <td className="px-3 py-2 text-right">
                        <span className={`inline-flex items-center gap-1 text-sm ${change >= 0 ? 'text-cyan-400' : 'text-red-400'}`}>
                          {change >= 0 ? <TrendingUp size={14} /> : <TrendingDown size={14} />}
                          {change >= 0 ? '+' : ''}{change.toFixed(1)}%
                        </span>
                      </td>
                      <td className="px-3 py-2 text-right font-mono">
                        {hold > 0 ? <span className="text-yellow-400">{hold}</span> : <span className="text-slate-600">-</span>}
                      </td>
                      <td className="px-3 py-2 text-center">
                        {cd.cooling ? (
                          <span className="inline-flex items-center gap-1 text-xs text-orange-400">
                            <Clock size={14} /> 冷却
                          </span>
                        ) : hold > 0 ? (
                          <span className="text-[10px] text-green-400">可卖</span>
                        ) : (
                          <span className="text-[10px] text-slate-600">-</span>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
            {filteredStocks.length === 0 && (
              <div className="p-6 text-center text-slate-500 text-sm">没有匹配的股票</div>
            )}
          </div>

          {/* ===== 移动端：卡片列表 ===== */}
          <div className="md:hidden space-y-2">
            {filteredStocks.map((stock) => {
              const prevPrice = stock.prices[stock.prices.length - 2] || stock.currentPrice;
              const change = ((stock.currentPrice - prevPrice) / prevPrice) * 100;
              const hold = holdings[stock.id] || 0;
              const cd = getCooldownStatus(stock.id);
              const sectorColor = SECTOR_COLORS[stock.sector] || 'bg-slate-800 text-slate-400 border-slate-700';
              return (
                <button
                  key={stock.id}
                  onClick={() => {
                    setSelectedStockId(stock.id);
                    setMobileTradeStock(stock);
                  }}
                  className="w-full text-left bg-slate-900/60 border border-slate-700 rounded-xl p-3 flex items-center gap-3 active:bg-slate-800/60"
                >
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1">
                      <span className="font-medium text-slate-200 text-sm truncate">{stock.name}</span>
                      <span className={`flex-shrink-0 text-[10px] px-1.5 py-0.5 rounded border ${sectorColor}`}>{stock.sector}</span>
                      <DelistBadge stock={stock} />
                    </div>
                    <div className="flex items-center gap-3 text-xs">
                      <span className="font-mono text-slate-200">{stock.currentPrice}</span>
                      <span className={`inline-flex items-center gap-0.5 ${change >= 0 ? 'text-cyan-400' : 'text-red-400'}`}>
                        {change >= 0 ? <TrendingUp size={12} /> : <TrendingDown size={12} />}
                        {change >= 0 ? '+' : ''}{change.toFixed(1)}%
                      </span>
                      {hold > 0 && <span className="text-yellow-400">持仓 {hold}</span>}
                      {cd.cooling && <span className="text-orange-400 flex items-center gap-0.5"><Clock size={10} />冷却</span>}
                    </div>
                  </div>
                  <TrendingUp size={16} className="text-slate-600 flex-shrink-0" />
                </button>
              );
            })}
            {filteredStocks.length === 0 && (
              <div className="p-6 text-center text-slate-500 text-sm">没有匹配的股票</div>
            )}
          </div>
        </div>

        {/* ===== 桌面端：右侧交易面板 ===== */}
        <div className="hidden md:block w-80 flex-shrink-0">
          {selectedStock ? (
            <TradeDetailPanel
              stock={selectedStock}
              tradeQty={tradeQty}
              tradeMode={tradeMode}
              message={message}
              messageType={messageType}
              holdings={holdings}
              costs={costs}
              buyTurns={buyTurns}
              currentTurn={currentTurn}
              getCooldownStatus={getCooldownStatus}
              setTradeMode={setTradeMode}
              setTradeQty={setTradeQty}
              handleTrade={handleTrade}
              feeMult={feeMult}
              sellFeeMult={sellFeeMult}
            />
          ) : (
            <div className="bg-slate-900/60 border border-slate-700 rounded-xl p-8 text-center text-slate-500">
              选择一支股票查看详情并进行交易
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// ==================== 移动端全屏交易面板 ====================
function MobileTradePanel({
  stock,
  ship,
  shipIndex,
  currentTurn,
  onBuy,
  onSell,
}: {
  stock: Stock;
  ship: Mothership;
  shipIndex: number;
  currentTurn: number;
  onBuy: (shipIndex: number, stockId: string, qty: number) => { error: string | null };
  onSell: (shipIndex: number, stockId: string, qty: number) => { error: string | null; profit?: number; profitRate?: number };
}) {
  const [tradeQty, setTradeQty] = useState(1);
  const [tradeMode, setTradeMode] = useState<'buy' | 'sell'>('buy');
  const [message, setMessage] = useState('');
  const [messageType, setMessageType] = useState<'success' | 'error' | 'profit' | 'loss'>('success');

  const holdings = ship?.stockHoldings || {};
  const costs = ship?.stockCosts || {};
  const buyTurns = ship?.stockBuyTurn || {};
  const cd = isStockCooling(buyTurns[stock.id], currentTurn);
  const feeMult = getStockFeeMult(ship);
  const sellFeeMult = getStockSellFeeMult(ship);

  const handleTrade = () => {
    if (tradeQty <= 0) return;
    setMessage('');
    if (tradeMode === 'buy') {
      const totalCost = Math.round(stock.currentPrice * tradeQty * feeMult);
      if (ship.gold < totalCost) {
        setMessage(`金币不足，需${totalCost.toLocaleString()}金币`);
        setMessageType('error');
        setTimeout(() => setMessage(''), 5000);
        return;
      }
      const result = onBuy(shipIndex, stock.id, tradeQty);
      if (result.error) { setMessage(result.error); setMessageType('error'); }
      else {
        setMessage(`成功买入 ${tradeQty} 股，总花费 ${totalCost.toLocaleString()} 金币`);
        setMessageType('success');
      }
    } else {
      const result = onSell(shipIndex, stock.id, tradeQty);
      if (result.error) { setMessage(result.error); setMessageType('error'); }
      else {
        const revenue = Math.round(stock.currentPrice * tradeQty * sellFeeMult);
        setMessage(`卖出收入 ${revenue.toLocaleString()} 金币`);
        setMessageType('success');
      }
    }
    setTimeout(() => setMessage(''), 5000);
  };

  const sectorColor = SECTOR_COLORS[stock.sector] || 'bg-slate-800 text-slate-400 border-slate-700';
  const delistNotice = delistNoticeOf(stock);

  return (
    <div>
      <div className="flex items-center gap-2 mb-4">
        <h3 className="text-xl font-bold text-white">{stock.name}</h3>
        <span className={`text-xs px-2 py-0.5 rounded border ${sectorColor}`}>{stock.sector}</span>
        <DelistBadge stock={stock} />
      </div>
      <p className="text-xs text-slate-500 mb-4">{stock.description}</p>

      <div className="flex justify-between text-sm mb-4">
        <span className="text-slate-400">当前价格</span>
        <span className="text-xl font-bold text-cyan-400">{stock.currentPrice} 金币</span>
      </div>

      {/* 走势图（手机详情区此前完全没有画布 → 手机上根本看不到走势） */}
      <StockPriceChart prices={stock.prices} />

      {delistNotice && (
        <p className="text-xs text-red-300 bg-red-950/40 border border-red-900/60 rounded-lg p-2 mb-4">{delistNotice}</p>
      )}

      {/* 持仓信息 */}
      <div className="bg-slate-800/60 rounded-lg p-3 mb-4 text-sm space-y-1">
        <div className="flex justify-between">
          <span className="text-slate-400">持仓</span>
          <span className="text-yellow-400 font-bold">{holdings[stock.id] || 0} 股</span>
        </div>
        {holdings[stock.id] > 0 && costs[stock.id] && (
          <>
            <div className="flex justify-between">
              <span className="text-slate-400">成本</span>
              <span className="text-slate-300">{costs[stock.id].toFixed(1)} 金币/股</span>
            </div>
            {cd && (
              <div className="text-orange-400 text-xs flex items-center gap-1">
                <Clock size={12} /> {getStockCooldownHint(buyTurns[stock.id] || 0, currentTurn)}
              </div>
            )}
          </>
        )}
      </div>

      {/* 已退市：不给买入/卖出入口（动作层另有拦截，界面也不该还提供） */}
      {!stock.delisted && (
        <>
          {/* 买卖切换 */}
          <div className="flex mb-3 bg-slate-800 rounded-lg p-1">
            <button onClick={() => setTradeMode('buy')} className={`flex-1 py-2 text-sm font-bold rounded transition-colors ${tradeMode === 'buy' ? 'bg-cyan-600 text-white' : 'text-slate-400'}`}>买入</button>
            <button onClick={() => setTradeMode('sell')} className={`flex-1 py-2 text-sm font-bold rounded transition-colors ${tradeMode === 'sell' ? 'bg-red-600 text-white' : 'text-slate-400'}`}>卖出</button>
          </div>

          {/* 数量输入 */}
          <div className="mb-3">
            <input
              type="text"
              inputMode="numeric"
              pattern="[0-9]*"
              value={tradeQty}
              onChange={(e) => { const v = e.target.value.replace(/[^0-9]/g, ''); if (v === '') { setTradeQty(0); return; } setTradeQty(parseInt(v)); }}
              disabled={false}
              className="w-full bg-slate-800 border border-slate-600 rounded-lg px-3 py-2.5 text-sm text-slate-200 focus:outline-none focus:border-cyan-500 disabled:opacity-50"
            />
            <div className="text-xs text-slate-500 mt-1">
              {tradeMode === 'buy'
                ? `需要: ${Math.round(stock.currentPrice * tradeQty * feeMult).toLocaleString()} 金币${feeMult === 1 ? '（无手续费）' : feeMult > 1 ? '（含手续费）' : '（手续费减免）'}`
                : `收入: ${Math.round(stock.currentPrice * tradeQty * sellFeeMult).toLocaleString()} 金币${sellFeeMult === 1 ? '（无手续费）' : '（含手续费）'}`
              }
            </div>
          </div>

          <button
            onClick={handleTrade}
            className={`w-full py-3 rounded-lg font-bold transition-colors ${
              tradeMode === 'buy' ? 'bg-cyan-600 hover:bg-cyan-500 text-white' : 'bg-red-600 hover:bg-red-500 text-white'
            }`}
          >
            {`${tradeMode === 'buy' ? '买入' : '卖出'} ${tradeQty} 股`}
          </button>
        </>
      )}

      {message && (
        <p className={`mt-3 text-sm text-center ${
          messageType === 'error' ? 'text-red-400' : messageType === 'profit' ? 'text-cyan-400' : messageType === 'loss' ? 'text-red-400' : 'text-green-400'
        }`}>{message}</p>
      )}
    </div>
  );
}

// ==================== 桌面端交易面板 ====================
function TradeDetailPanel({
  stock,
  tradeQty,
  tradeMode,
  message,
  messageType,
  holdings,
  costs,
  buyTurns,
  currentTurn,
  getCooldownStatus,
  setTradeMode,
  setTradeQty,
  handleTrade,
  feeMult,
  sellFeeMult,
}: {
  stock: Stock;
  tradeQty: number;
  tradeMode: 'buy' | 'sell';
  message: string;
  messageType: string;
  holdings: Record<string, number>;
  costs: Record<string, number>;
  buyTurns: Record<string, number>;
  currentTurn: number;
  getCooldownStatus: (stockId: string) => { cooling: boolean; buyTurn?: number };
  setTradeMode: (mode: 'buy' | 'sell') => void;
  setTradeQty: (qty: number) => void;
  handleTrade: () => void;
  feeMult: number;
  sellFeeMult: number;
}) {
  const sectorColor = SECTOR_COLORS[stock.sector] || 'bg-slate-800 text-slate-400 border-slate-700';
  const cd = getCooldownStatus(stock.id);
  const delistNotice = delistNoticeOf(stock);

  return (
    <div className="bg-slate-900/60 border border-slate-700 rounded-xl p-4">
      <div className="flex items-center gap-2 mb-1 flex-wrap">
        <h3 className="text-lg font-bold text-slate-100">{stock.name}</h3>
        <span className={`text-[10px] px-1.5 py-0.5 rounded border ${sectorColor}`}>{stock.sector}</span>
        <DelistBadge stock={stock} />
      </div>
      <p className="text-xs text-slate-500 mb-3">{stock.description}</p>

      <StockPriceChart prices={stock.prices} />

      <div className="flex justify-between text-sm mb-3">
        <span className="text-slate-400">当前价格</span>
        <span className="text-xl font-bold text-cyan-400">{stock.currentPrice} 金币</span>
      </div>
      {delistNotice && (
        <p className="text-xs text-red-300 bg-red-950/40 border border-red-900/60 rounded-lg p-2 mb-3">{delistNotice}</p>
      )}
      <div className="flex justify-between text-sm mb-3">
        <span className="text-slate-400">手续费</span>
        <span className="text-slate-300">
          {feeMult === 1
            ? '0%（无手续费）'
            : feeMult > 1
              ? `${Math.round((feeMult - 1) * 100)}%（买入×${feeMult.toFixed(3)} / 卖出×${sellFeeMult.toFixed(3)}）`
              : `减免${Math.round((1 - feeMult) * 100)}%（买入×${feeMult.toFixed(3)} / 卖出×${sellFeeMult.toFixed(3)}）`}
        </span>
      </div>

      <div className="text-sm mb-3 space-y-1">
        <div className="flex justify-between">
          <span className="text-slate-400">当前持仓</span>
          <span className="text-yellow-400 font-bold">{holdings[stock.id] || 0} 股</span>
        </div>
        {holdings[stock.id] > 0 && costs[stock.id] && (
          <>
            <div className="flex justify-between">
              <span className="text-slate-400">买入成本</span>
              <span className="text-slate-300">{costs[stock.id].toFixed(1)} 金币/股</span>
            </div>
            {cd.cooling && (
              <div className="flex justify-between text-orange-400">
                <span className="flex items-center gap-1"><Clock size={12} />冷却中</span>
                <span>{getStockCooldownHint(buyTurns[stock.id] || 0, currentTurn)}</span>
              </div>
            )}
          </>
        )}
      </div>

      {/* 已退市：不给买入/卖出入口（动作层另有拦截，界面也不该还提供） */}
      {!stock.delisted && (
        <>
          <div className="flex mb-3 bg-slate-800 rounded-lg p-1">
            <button onClick={() => setTradeMode('buy')} className={`flex-1 py-1.5 text-sm font-bold rounded transition-colors ${tradeMode === 'buy' ? 'bg-cyan-600 text-white' : 'text-slate-400 hover:text-slate-200'}`}>买入</button>
            <button onClick={() => setTradeMode('sell')} className={`flex-1 py-1.5 text-sm font-bold rounded transition-colors ${tradeMode === 'sell' ? 'bg-red-600 text-white' : 'text-slate-400 hover:text-slate-200'}`}>卖出</button>
          </div>

          <div className="mb-3">
            <input
              type="text"
              inputMode="numeric"
              pattern="[0-9]*"
              value={tradeQty}
              onChange={(e) => { const v = e.target.value.replace(/[^0-9]/g, ''); if (v === '') { setTradeQty(0); return; } setTradeQty(parseInt(v)); }}
              disabled={false}
              className="w-full bg-slate-800 border border-slate-600 rounded-lg px-3 py-2 text-sm text-slate-200 focus:outline-none focus:border-cyan-500 disabled:opacity-50"
            />
            <div className="text-xs text-slate-500 mt-1">
              {tradeMode === 'buy'
                ? `需要: ${Math.round(stock.currentPrice * tradeQty * feeMult).toLocaleString()} 金币${feeMult === 1 ? '（无手续费）' : feeMult > 1 ? '（含手续费）' : '（手续费减免）'}`
                : `收入: ${Math.round(stock.currentPrice * tradeQty * sellFeeMult).toLocaleString()} 金币${sellFeeMult === 1 ? '（无手续费）' : '（含手续费）'}`
              }
            </div>
          </div>

          <button
            onClick={handleTrade}
            className={`w-full py-2.5 rounded-lg font-bold transition-colors ${
              tradeMode === 'buy' ? 'bg-cyan-600 hover:bg-cyan-500 text-white' : 'bg-red-600 hover:bg-red-500 text-white'
            }`}
          >
            {`${tradeMode === 'buy' ? '买入' : '卖出'} ${tradeQty} 股`}
          </button>
        </>
      )}

      {message && (
        <p className={`mt-2 text-sm text-center ${messageType === 'error' ? 'text-red-400' : messageType === 'profit' ? 'text-cyan-400' : messageType === 'loss' ? 'text-red-400' : 'text-green-400'}`}>{message}</p>
      )}
    </div>
  );
}


export default memo(StockMarket);
