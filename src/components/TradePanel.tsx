import { useState } from 'react';
import type { Mothership, Faction, TradePolicy, PolicyEffect } from '@/types/game';
import { getDistance, getTravelTurns, getBuyPrice, getSellPrice, getInvestmentTier, getDiscountRate } from '@/data/factions';
import { Globe, ShoppingCart, TrendingUp, Compass, Coins, Rocket, BarChart3, Radio, AlertTriangle } from 'lucide-react';

interface TradePanelProps {
  factions: Faction[];
  ship: Mothership;
  factionPrices: Record<string, number>;
  factionSellMultipliers: Record<string, number>;
  factionPolicy: { type: TradePolicy; effect: PolicyEffect };
  policyRemainingTurns: number;
  onTravel: (targetFactionId: string) => { success: boolean; message: string };
  onBuy: (quantity: number) => { success: boolean; message: string };
  onSell: (factionId: string, quantity: number) => { success: boolean; message: string };
  onExplore: () => { success: boolean; message: string };
  onInvest: (amount: number) => { success: boolean; message: string };
  onGatherIntel: () => { success: boolean; message: string; goldChange: number };
}

type TradeTab = 'overview' | 'buy' | 'sell' | 'explore' | 'invest' | 'intel';

function TravelLockOverlay({ turnsRemaining, targetName }: { turnsRemaining: number; targetName: string }) {
  return (
    <div className="bg-yellow-900/20 border border-yellow-700/40 rounded-xl p-6 text-center">
      <Rocket size={32} className="text-yellow-400 mx-auto mb-3" />
      <p className="text-yellow-400 font-bold text-lg mb-1">跃迁中</p>
      <p className="text-slate-400 text-sm">正在前往 {targetName}...</p>
      <p className="text-slate-500 text-sm">剩余 {turnsRemaining} 回合后抵达</p>
      <p className="text-slate-600 text-xs mt-3">抵达前无法进行交易、探索、投资或打探消息</p>
    </div>
  );
}

export default function TradePanel({ factions, ship, factionPrices, factionSellMultipliers, factionPolicy, policyRemainingTurns, onTravel, onBuy, onSell, onExplore, onInvest, onGatherIntel }: TradePanelProps) {
  const [activeTab, setActiveTab] = useState<TradeTab>('overview');
  const [selectedTarget, setSelectedTarget] = useState<string>('');
  const [buyQty, setBuyQty] = useState(1);
  const [sellFaction, setSellFaction] = useState('');
  const [sellQty, setSellQty] = useState(1);
  const [investAmount, setInvestAmount] = useState('');
  const [message, setMessage] = useState('');
  const [msgType, setMsgType] = useState<'success' | 'error'>('success');

  const ts = ship.tradeStatus;
  const currentFaction = factions.find((f) => f.id === ts.currentFactionId);
  const currentFs = ts.factionStates[ts.currentFactionId];
  const currentTier = getInvestmentTier(currentFs?.invested || 0);
  const currentDiscount = getDiscountRate(currentTier);
  const isTraveling = ts.travelTurnsRemaining > 0;
  const travelTarget = ts.targetFactionId ? factions.find((f) => f.id === ts.targetFactionId) : null;

  const inventoryEntries = Object.entries(ts.inventory).filter(([, count]) => count > 0);

  // 当前势力的市场价
  const marketPrice = currentFaction ? (factionPrices[currentFaction.id] || currentFaction.basePrice) : 0;
  const buyPrice = currentFaction ? getBuyPrice(currentFaction.id, currentFs?.invested || 0, factionPrices) : 0;

  const handleTravel = () => {
    if (!selectedTarget) { setMessage('请选择目标势力'); setMsgType('error'); return; }
    const res = onTravel(selectedTarget);
    setMessage(res.message); setMsgType(res.success ? 'success' : 'error');
    if (res.success) setSelectedTarget('');
    setTimeout(() => setMessage(''), 5000);
  };

  const handleBuy = () => {
    const res = onBuy(buyQty);
    setMessage(res.message); setMsgType(res.success ? 'success' : 'error');
    setTimeout(() => setMessage(''), 5000);
  };

  const handleSell = () => {
    if (!sellFaction) { setMessage('请选择要卖出的特产来源'); setMsgType('error'); return; }
    const res = onSell(sellFaction, sellQty);
    setMessage(res.message); setMsgType(res.success ? 'success' : 'error');
    if (res.success) { setSellFaction(''); setSellQty(1); }
    setTimeout(() => setMessage(''), 5000);
  };

  const handleExplore = () => {
    const res = onExplore();
    setMessage(res.message); setMsgType(res.success ? 'success' : 'error');
    setTimeout(() => setMessage(''), 5000);
  };

  const handleInvest = () => {
    const amt = parseInt(investAmount);
    if (isNaN(amt) || amt <= 0) { setMessage('请输入有效的投资金额'); setMsgType('error'); return; }
    const res = onInvest(amt);
    setMessage(res.message); setMsgType(res.success ? 'success' : 'error');
    if (res.success) setInvestAmount('');
    setTimeout(() => setMessage(''), 5000);
  };

  const handleGatherIntel = () => {
    const res = onGatherIntel();
    setMessage(res.message);
    setMsgType(res.goldChange >= 0 ? 'success' : 'error');
    setTimeout(() => setMessage(''), 6000);
  };

  const tabs: { id: TradeTab; label: string; icon: React.ElementType }[] = [
    { id: 'overview', label: '星际地图', icon: Globe },
    { id: 'buy', label: '购买特产', icon: ShoppingCart },
    { id: 'sell', label: '贩卖特产', icon: TrendingUp },
    { id: 'explore', label: '探索', icon: Compass },
    { id: 'invest', label: '投资建设', icon: BarChart3 },
    { id: 'intel', label: '打探消息', icon: Radio },
  ];

  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-2xl font-bold text-white mb-2 flex items-center gap-2">
          <Rocket size={24} className="text-cyan-400" />
          星际贸易
        </h2>
        <p className="text-sm text-slate-400">在10个星际势力间跃迁贸易，市场价格每回合浮动，受全星系贸易政策影响。</p>
      </div>

      {/* 当前位置 + 贸易政策 */}
      <div className="bg-cyan-900/20 border border-cyan-700/40 rounded-xl p-4">
        <div className="flex items-center gap-3 mb-3">
          <Globe size={20} className="text-cyan-400" />
          <div>
            <p className="text-xs text-cyan-400">当前停靠</p>
            <p className="text-lg font-bold text-white">{currentFaction?.name || '未知'}</p>
          </div>
          {isTraveling && travelTarget && (
            <div className="ml-auto text-right">
              <p className="text-xs text-yellow-400">跃迁中</p>
              <p className="text-sm text-slate-300">前往 {travelTarget.name}</p>
              <p className="text-xs text-slate-500">剩余 {ts.travelTurnsRemaining} 回合</p>
            </div>
          )}
        </div>
        {/* 贸易政策横幅 */}
        {(() => {
          const m = factionPolicy.effect.multiplier;
          const bgColor = m <= 0.55 ? 'bg-red-900/30 border border-red-700/40' :
                          m <= 0.70 ? 'bg-orange-900/30 border border-orange-700/40' :
                          m < 0.90  ? 'bg-amber-900/30 border border-amber-700/40' :
                          m < 1.00  ? 'bg-yellow-900/30 border border-yellow-700/40' :
                          m === 1.00 ? 'bg-slate-800/40 border border-slate-700/40' :
                          m <= 1.20 ? 'bg-blue-900/30 border border-blue-700/40' :
                          m <= 1.35 ? 'bg-green-900/30 border border-green-700/40' :
                          m <= 1.55 ? 'bg-emerald-900/30 border border-emerald-700/40' :
                          'bg-amber-900/40 border border-amber-600/50';
          const textColor = m <= 0.55 ? 'text-red-400' :
                            m <= 0.70 ? 'text-orange-400' :
                            m < 0.90  ? 'text-amber-400' :
                            m < 1.00  ? 'text-yellow-400' :
                            m === 1.00 ? 'text-slate-400' :
                            m <= 1.20 ? 'text-blue-400' :
                            m <= 1.35 ? 'text-green-400' :
                            m <= 1.55 ? 'text-emerald-400' :
                            'text-amber-300';
          return (
            <div className={`rounded-lg px-3 py-2 flex items-center gap-2 ${bgColor}`}>
              {m === 1.00 ? <Globe size={14} className="text-slate-400" /> : <AlertTriangle size={14} className={textColor} />}
              <div>
                <span className={`text-xs font-semibold ${textColor}`}>{factionPolicy.effect.name}</span>
                <span className="text-xs text-slate-500 ml-2">{factionPolicy.effect.description}</span>
                <span className={`text-xs font-bold ml-2 ${m >= 1 ? 'text-green-400' : 'text-red-400'}`}>
                  {m >= 1 ? '+' : ''}{Math.round((m - 1) * 100)}%
                </span>
                <span className="text-xs text-slate-600 ml-2">(剩余 {policyRemainingTurns} 回合)</span>
              </div>
            </div>
          );
          })()}
      </div>

      {/* 子标签页 - 移动端横向滚动 */}
      <div className="flex gap-1 bg-slate-800/40 rounded-lg p-1 overflow-x-auto scrollbar-hide">
        {tabs.map((t) => (
          <button key={t.id} onClick={() => setActiveTab(t.id)}
            className={`flex-shrink-0 flex items-center justify-center gap-1.5 px-3 md:px-2 py-2.5 md:py-2 rounded-md text-xs font-bold transition-all min-h-[40px] ${
              activeTab === t.id ? 'bg-cyan-600 text-white' : 'text-slate-400 hover:text-slate-200 hover:bg-slate-700/50'
            }`}>
            <t.icon size={14} />{t.label}
          </button>
        ))}
      </div>

      {/* 星际地图 */}
      {activeTab === 'overview' && (
        <div className="bg-slate-900/60 border border-slate-700 rounded-xl p-5">
          <h3 className="text-lg font-bold text-slate-200 mb-4 flex items-center gap-2"><Globe size={18} className="text-cyan-400" /> 星际势力分布</h3>
          <div className="space-y-2 max-h-72 overflow-auto">
            {factions.map((f) => {
              const dist = currentFaction ? getDistance(currentFaction.id, f.id) : 0;
              const isCurrent = f.id === ts.currentFactionId;
              const turns = currentFaction ? getTravelTurns(currentFaction.id, f.id) : 0;
              const fs = ts.factionStates[f.id];
              const tier = getInvestmentTier(fs?.invested || 0);
              const fPrice = factionPrices[f.id] || f.basePrice;
              return (
                <div key={f.id} className={`rounded-lg border p-3 ${isCurrent ? 'border-cyan-500 bg-cyan-900/20' : 'border-slate-700 bg-slate-800/40'}`}>
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <Globe size={14} className={isCurrent ? 'text-cyan-400' : 'text-slate-500'} />
                      <span className={`text-sm font-bold ${isCurrent ? 'text-cyan-400' : 'text-slate-200'}`}>{f.name}</span>
                      {isCurrent && <span className="text-[10px] bg-cyan-600 text-white px-1.5 py-0.5 rounded">当前</span>}
                      {tier > 0 && <span className="text-[10px] bg-green-600 text-white px-1.5 py-0.5 rounded">{tier}档</span>}
                    </div>
                    {!isCurrent && <span className="text-xs text-slate-500">距离 {dist} | {turns}回合</span>}
                  </div>
                  <p className="text-xs text-slate-400 mt-1">{f.specialtyName} | 市场价 <span className="text-yellow-400">{fPrice}</span> <span className="text-slate-600">(基价{f.basePrice})</span></p>
                  {fs && fs.invested > 0 && <p className="text-xs text-green-400 mt-0.5">已投资 {fs.invested.toLocaleString()} 金币</p>}
                  {!isCurrent && !isTraveling && (
                    <button onClick={() => setSelectedTarget(f.id)} className={`mt-2 text-xs px-3 py-1 rounded transition-colors ${selectedTarget === f.id ? 'bg-cyan-600 text-white' : 'bg-slate-700 text-slate-300 hover:bg-slate-600'}`}>
                      {selectedTarget === f.id ? '已选择' : '选择跃迁'}
                    </button>
                  )}
                </div>
              );
            })}
          </div>
          {selectedTarget && !isTraveling && (
            <button onClick={handleTravel} className="mt-4 w-full py-2.5 bg-gradient-to-r from-cyan-600 to-blue-600 hover:from-cyan-500 hover:to-blue-500 rounded-lg font-bold text-white transition-all flex items-center justify-center gap-2"><Rocket size={16} /> 确认跃迁</button>
          )}
          {isTraveling && <div className="mt-4 text-center text-sm text-yellow-400 bg-yellow-900/20 rounded-lg py-2">跃迁中... 剩余 {ts.travelTurnsRemaining} 回合抵达 {travelTarget?.name}</div>}
        </div>
      )}

      {/* 购买特产 */}
      {activeTab === 'buy' && (
        isTraveling && travelTarget ? <TravelLockOverlay turnsRemaining={ts.travelTurnsRemaining} targetName={travelTarget.name} /> : (
          <div className="bg-slate-900/60 border border-slate-700 rounded-xl p-5">
            <h3 className="text-lg font-bold text-slate-200 mb-4 flex items-center gap-2"><ShoppingCart size={18} className="text-green-400" /> 购买特产</h3>
            {currentFaction && (
              <div className="bg-slate-800/60 rounded-lg p-4 mb-4">
                <p className="text-sm text-slate-300 mb-1"><span className="text-cyan-400 font-bold">{currentFaction.name}</span> 的特产</p>
                <p className="text-lg font-bold text-white">{currentFaction.specialtyName}</p>
                <p className="text-xs text-slate-500">{currentFaction.specialtyDescription}</p>
                <div className="flex items-center gap-4 mt-3 flex-wrap">
                  <div><p className="text-xs text-slate-500">本回合市场价</p><p className="text-sm text-slate-300">{marketPrice.toLocaleString()} 金</p></div>
                  <div><p className="text-xs text-slate-500">你的购买价</p><p className="text-xl font-bold text-yellow-400">{buyPrice.toLocaleString()} 金</p></div>
                  {currentDiscount > 0 && <div><p className="text-xs text-green-400">投资优惠</p><p className="text-sm text-green-400 font-bold">-{(currentDiscount * 100).toFixed(0)}%</p></div>}
                  <div><p className="text-xs text-slate-500">基价</p><p className="text-sm text-slate-500 line-through">{currentFaction.basePrice.toLocaleString()} 金</p></div>
                </div>
              </div>
            )}
            <div className="flex items-center gap-3 mb-4">
              <label className="text-sm text-slate-400">数量：</label>
              <input type="text" inputMode="numeric" pattern="[0-9]*" value={buyQty || ''} onChange={(e) => { const v = e.target.value.replace(/[^0-9]/g, ''); setBuyQty(v === '' ? 0 : parseInt(v)); }} className="w-24 bg-slate-800 border border-slate-600 rounded-lg px-3 py-2 text-sm text-slate-200" />
              <span className="text-sm text-slate-500">= {(buyPrice * buyQty).toLocaleString()} 金币</span>
            </div>
            <button onClick={handleBuy} disabled={ship.gold < buyPrice * buyQty || ship.bankrupt}
              className="w-full py-2.5 bg-green-700 hover:bg-green-600 disabled:bg-slate-700 disabled:text-slate-500 rounded-lg font-bold text-white transition-colors">
              {ship.bankrupt ? '破产中无法购买' : `购买 (${(buyPrice * buyQty).toLocaleString()} 金币)`}
            </button>
          </div>
        )
      )}

      {/* 贩卖特产 */}
      {activeTab === 'sell' && (
        isTraveling && travelTarget ? <TravelLockOverlay turnsRemaining={ts.travelTurnsRemaining} targetName={travelTarget.name} /> : (
          <div className="bg-slate-900/60 border border-slate-700 rounded-xl p-5">
            <h3 className="text-lg font-bold text-slate-200 mb-4 flex items-center gap-2"><TrendingUp size={18} className="text-yellow-400" /> 贩卖特产</h3>
            {inventoryEntries.length === 0 ? <p className="text-sm text-slate-500 text-center py-8">暂无特产库存</p> : (
              <>
                <div className="mb-4 space-y-2">
                  <p className="text-xs text-slate-500">当前库存（在{currentFaction?.name}卖出）：</p>
                  {inventoryEntries.map(([fid, count]) => {
                    const f = factions.find((fa) => fa.id === fid);
                    if (!f) return null;
                    const sellP = getSellPrice(fid, factionPrices, factionSellMultipliers);
                    const profit = sellP - (factionPrices[fid] || f.basePrice);
                    const dist = currentFaction ? getDistance(currentFaction.id, fid) : 0;
                    const isLocal = ts.currentFactionId === fid;
                    return (
                      <div key={fid} className={`rounded-lg p-3 ${sellFaction === fid ? 'border border-yellow-500 bg-yellow-900/10' : isLocal ? 'border border-red-700/30 bg-red-950/10' : 'border border-slate-700 bg-slate-800/40'}`}>
                        <div className="flex items-center justify-between">
                          <div>
                            <p className="text-sm font-bold text-slate-200">{f.specialtyName}</p>
                            <p className="text-xs text-slate-500">来自 {f.name} | 库存 {count} | 距离 {dist}</p>
                            {isLocal && <p className="text-xs text-red-400 mt-0.5">本地特产不可在本地出售，请跃迁到其他势力</p>}
                          </div>
                          <div className="text-right">
                            {!isLocal && <>
                              <p className="text-sm text-yellow-400 font-bold">{sellP.toLocaleString()}/个</p>
                              <p className={`text-xs ${profit >= 0 ? 'text-green-400' : 'text-red-400'}`}>{profit >= 0 ? '+' : ''}{profit}利润/个</p>
                            </>}
                            <button
                              onClick={() => { if (!isLocal) { setSellFaction(fid); setSellQty(1); } }}
                              disabled={isLocal}
                              className={`text-xs px-2 py-1 rounded mt-1 ${sellFaction === fid ? 'bg-yellow-600 text-white' : isLocal ? 'bg-slate-800 text-slate-600 cursor-not-allowed' : 'bg-slate-700 text-slate-300 hover:bg-slate-600'}`}
                            >
                              {isLocal ? '本地不可售' : sellFaction === fid ? '已选择' : '选择'}
                            </button>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
                {sellFaction && (
                  <>
                    <div className="flex items-center gap-3 mb-4">
                      <label className="text-sm text-slate-400">数量：</label>
                      <input type="text" inputMode="numeric" pattern="[0-9]*" value={sellQty || ''}
                        onChange={(e) => { const v = e.target.value.replace(/[^0-9]/g, ''); if (v === '') { setSellQty(0); return; } const n = parseInt(v); const max = ts.inventory[sellFaction] || 0; setSellQty(Math.min(max, n)); }}
                        className="w-24 bg-slate-800 border border-slate-600 rounded-lg px-3 py-2 text-sm text-slate-200" />
                      <span className="text-sm text-slate-500">
                        = {(() => { const f = factions.find((fa) => fa.id === sellFaction); if (!f) return 0; return (getSellPrice(sellFaction, factionPrices, factionSellMultipliers) * sellQty).toLocaleString(); })()} 金币
                      </span>
                    </div>
                    <button onClick={handleSell} className="w-full py-2.5 bg-yellow-700 hover:bg-yellow-600 rounded-lg font-bold text-white transition-colors">确认卖出</button>
                  </>
                )}
              </>
            )}
          </div>
        )
      )}

      {/* 探索 */}
      {activeTab === 'explore' && (
        isTraveling && travelTarget ? <TravelLockOverlay turnsRemaining={ts.travelTurnsRemaining} targetName={travelTarget.name} /> : (
          <div className="bg-slate-900/60 border border-slate-700 rounded-xl p-5">
            <h3 className="text-lg font-bold text-slate-200 mb-4 flex items-center gap-2"><Compass size={18} className="text-purple-400" /> 探索 {currentFaction?.name}</h3>
            <p className="text-sm text-slate-400 mb-4">在{currentFaction?.name || '当前势力'}的辖区内探索，可能发现随机原料资源。每回合限一次。</p>

            {/* 本回合探索结果（直接从 ship.tradeStatus 读取，与 exploredThisTurn 同步更新） */}
            {ship.tradeStatus.lastExploreResult && (
              <div className="rounded-lg p-4 mb-4 bg-green-900/20 border border-green-700/30">
                <p className="text-sm text-green-400 font-bold flex items-center gap-2">
                  <Compass size={16} /> 探索发现
                </p>
                <p className="text-sm text-slate-200 mt-2">{ship.tradeStatus.lastExploreResult}</p>
              </div>
            )}

            {ship.tradeStatus.exploredThisTurn ? (
              <div className="text-center text-sm text-slate-500 bg-slate-800/40 rounded-lg py-3">本回合已探索过，结束回合后可再次探索</div>
            ) : (
              <button onClick={handleExplore} className="w-full py-2.5 bg-purple-700 hover:bg-purple-600 rounded-lg font-bold text-white transition-colors flex items-center justify-center gap-2"><Compass size={16} /> 开始探索</button>
            )}
          </div>
        )
      )}

      {/* 投资建设 */}
      {activeTab === 'invest' && (
        isTraveling && travelTarget ? <TravelLockOverlay turnsRemaining={ts.travelTurnsRemaining} targetName={travelTarget.name} /> : (
          <div className="bg-slate-900/60 border border-slate-700 rounded-xl p-5">
            <h3 className="text-lg font-bold text-slate-200 mb-4 flex items-center gap-2"><BarChart3 size={18} className="text-blue-400" /> 投资 {currentFaction?.name}</h3>
            <div className="mb-4">
              <div className="flex justify-between text-xs text-slate-400 mb-1"><span>当前投资：{(currentFs?.invested || 0).toLocaleString()} / 80,000</span><span>{Math.round(((currentFs?.invested || 0) / 80000) * 100)}%</span></div>
              <div className="w-full bg-slate-700 rounded-full h-2.5"><div className="h-2.5 rounded-full bg-blue-500 transition-all" style={{ width: `${Math.min(100, ((currentFs?.invested || 0) / 80000) * 100)}%` }} /></div>
            </div>
            <div className="mb-4 space-y-1.5">
              {[{ pct: 12.5, t: 1, l: '购买优惠10%' }, { pct: 25, t: 2, l: '购买优惠20%' }, { pct: 37.5, t: 3, l: '购买优惠20% + 每回合≤800金币' }, { pct: 50, t: 4, l: '购买优惠25% + 每回合≤1300金币' }, { pct: 62.5, t: 5, l: '购买优惠30% + 每回合≤2000金币' }, { pct: 100, t: 6, l: '购买优惠38% + 每回合≤4500金币 + 每5回合特产x3' }].map((item) => (
                <div key={item.t} className={`flex items-center gap-2 text-xs rounded-lg px-3 py-2 ${currentTier >= item.t ? 'bg-blue-900/30 border border-blue-700/30' : 'bg-slate-800/40 text-slate-500'}`}>
                  <div className={`w-2 h-2 rounded-full ${currentTier >= item.t ? 'bg-blue-400' : 'bg-slate-600'}`} /><span className={currentTier >= item.t ? 'text-blue-400 font-bold' : ''}>{item.pct}%</span><span>{item.l}</span>{currentTier >= item.t && <span className="ml-auto text-green-400">已激活</span>}
                </div>
              ))}
            </div>
            {currentFs && currentFs.invested >= 80000 ? <div className="text-center text-sm text-green-400 bg-green-900/20 rounded-lg py-3">投资已满额（80,000金币），享受最高BUFF！</div> : (
              <>
                <div className="flex items-center gap-2 mb-3">
                  <input type="text" inputMode="numeric" pattern="[0-9]*" value={investAmount} onChange={(e) => setInvestAmount(e.target.value.replace(/[^0-9]/g, ''))} placeholder={`1 - ${80000 - (currentFs?.invested || 0)}`} className="flex-1 bg-slate-800 border border-slate-600 rounded-lg px-3 py-2 text-sm text-slate-200 placeholder-slate-600" />
                  <button onClick={() => setInvestAmount(Math.min(ship.gold, 80000 - (currentFs?.invested || 0)).toString())} className="px-3 py-2 bg-slate-700 hover:bg-slate-600 rounded-lg text-xs text-slate-300">全部</button>
                </div>
                <button onClick={handleInvest} disabled={!investAmount || parseInt(investAmount) <= 0 || ship.gold <= 0} className="w-full py-2.5 bg-blue-700 hover:bg-blue-600 disabled:bg-slate-700 disabled:text-slate-500 rounded-lg font-bold text-white transition-colors flex items-center justify-center gap-2"><Coins size={16} /> 投资</button>
              </>
            )}
          </div>
        )
      )}

      {/* 打探消息 */}
      {activeTab === 'intel' && (
        isTraveling && travelTarget ? <TravelLockOverlay turnsRemaining={ts.travelTurnsRemaining} targetName={travelTarget.name} /> : (
          <div className="bg-slate-900/60 border border-slate-700 rounded-xl p-5">
            <h3 className="text-lg font-bold text-slate-200 mb-4 flex items-center gap-2"><Radio size={18} className="text-orange-400" /> 打探消息</h3>
            <p className="text-sm text-slate-400 mb-4">在{currentFaction?.name || '当前势力'}搜集情报。每个势力只能打探一次，跃迁到其他地方后才能再次打探（可以返回之前去过的势力）。</p>
            <div className="bg-slate-800/60 rounded-lg p-4 mb-4 space-y-2 text-xs text-slate-400">
              <p>好消息概率：55%（+200~5000金币）</p><p>坏消息概率：45%（-100~1500金币）</p><p>收益随回合数增长</p>
            </div>

            {/* 本回合打探结果（直接从 ship.tradeStatus 读取，突出剧情文案） */}
            {ship.tradeStatus.lastIntelResult && (
              <div className={`rounded-lg p-4 mb-4 border ${ship.tradeStatus.lastIntelResult.goldChange >= 0 ? 'bg-green-900/20 border-green-700/30' : 'bg-red-900/20 border-red-700/30'}`}>
                <p className={`text-sm font-bold flex items-center gap-2 ${ship.tradeStatus.lastIntelResult.goldChange >= 0 ? 'text-green-400' : 'text-red-400'}`}>
                  <Radio size={16} /> 情报结果
                </p>
                <p className="text-sm text-slate-200 mt-2">{ship.tradeStatus.lastIntelResult.message}</p>
                <p className={`text-xs mt-1 font-mono ${ship.tradeStatus.lastIntelResult.goldChange >= 0 ? 'text-green-400' : 'text-red-400'}`}>
                  {ship.tradeStatus.lastIntelResult.goldChange >= 0 ? '+' : ''}{ship.tradeStatus.lastIntelResult.goldChange.toLocaleString()} 金币
                </p>
              </div>
            )}

            {ts.intelGatheredInFaction === ts.currentFactionId ? (
              <div className="text-center text-sm text-slate-500 bg-slate-800/40 rounded-lg py-3">已在此势力打探过消息，跃迁到其他势力后才能再次打探</div>
            ) : (
              <button onClick={handleGatherIntel} className="w-full py-2.5 bg-orange-700 hover:bg-orange-600 rounded-lg font-bold text-white transition-colors flex items-center justify-center gap-2"><Radio size={16} /> 打探消息</button>
            )}
          </div>
        )
      )}

      {message && <div className={`p-3 rounded-lg text-sm text-center ${msgType === 'success' ? 'bg-green-900/20 border border-green-700/50 text-green-400' : 'bg-red-900/20 border border-red-700/50 text-red-400'}`}>{message}</div>}
    </div>
  );
}