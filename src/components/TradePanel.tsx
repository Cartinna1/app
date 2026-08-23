import { useState, memo } from 'react';
import type { Mothership, Faction, TradePolicy, PolicyEffect, FactionContract } from '@/types/game';
import { getDistance, getTravelTurns, getSellPrice, getReputationTier, FACTIONS as FACTIONS_DATA, RELATION_MATRIX } from '@/data/factions';
import { RECIPES } from '@/data/gameData';
import { Globe, ShoppingCart, TrendingUp, Compass, Coins, Rocket, BarChart3, Radio, AlertTriangle } from 'lucide-react';

interface TradePanelProps {
  factions: Faction[];
  ship: Mothership;
  factionPrices: Record<string, number>;
  factionSellMultipliers: Record<string, number>;
  blackMarketMultiplier: number;
  buyStocks: Record<string, number>;
  sellDemands: Record<string, number>;
  buyBuffs: Record<string, { multiplier: number; expiresTurn: number }[]>;
  sellBuffs: Record<string, { multiplier: number; expiresTurn: number }[]>;
  factionPolicy: { type: TradePolicy; effect: PolicyEffect };
  policyRemainingTurns: number;
  onTravel: (targetFactionId: string) => { success: boolean; message: string };
  onBuy: (quantity: number) => { success: boolean; message: string };
  onSell: (factionId: string, quantity: number) => { success: boolean; message: string };
  onExplore: () => { success: boolean; message: string };
  onInvest: (amount: number) => { success: boolean; message: string };
  onGatherIntel: () => { success: boolean; message: string; goldChange: number };
  factionReputation: Record<string, number>;
  factionContracts: FactionContract[];
  currentTurn: number;
  onAcceptContract: (contractId: string) => { success: boolean; message: string };
  onCompleteContract: (contractId: string) => { success: boolean; message: string };
  onBlackMarketBuy: (factionId: string, itemId: string, qty: number) => { success: boolean; message: string };
}

type TradeTab = 'overview' | 'buy' | 'sell' | 'explore' | 'buy-invest' | 'intel';

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

function TradePanel({ factions, ship, factionPrices, factionSellMultipliers, blackMarketMultiplier, buyStocks, sellDemands, buyBuffs, sellBuffs, factionPolicy, policyRemainingTurns, onTravel, onBuy, onSell, onExplore, onInvest, onGatherIntel, factionReputation, factionContracts, currentTurn, onAcceptContract, onCompleteContract, onBlackMarketBuy }: TradePanelProps) {
  const [activeTab, setActiveTab] = useState<TradeTab>('overview');
  const [selectedTarget, setSelectedTarget] = useState<string>('');
  const [buyQty, setBuyQty] = useState('1');
  const [sellFaction, setSellFaction] = useState('');
  const [sellQty, setSellQty] = useState('1');
  const [blackFaction, setBlackFaction] = useState<string>('');
  const [blackQty, setBlackQty] = useState('1');
  const [message, setMessage] = useState('');
  const [msgType, setMsgType] = useState<'success' | 'error'>('success');

  const ts = ship.tradeStatus;
  const currentFaction = factions.find((f) => f.id === ts.currentFactionId);
  const currentRep = (factionReputation || {})[ts.currentFactionId] || 0;
  const currentRepTier = getReputationTier(currentRep);
  /** 获取合同目标物品名 */
  const getContractItemName = (c: FactionContract): string => {
    if (c.type === 'smuggling') {
      const f = FACTIONS_DATA.find((ff) => ff.id === c.targetItemId);
      return f ? `${f.specialtyName}（${f.name}）` : c.targetItemId;
    } else {
      const recipe = RECIPES.find((r) => r.id === c.targetItemId);
      if (recipe) return recipe.productName;
      const f = FACTIONS_DATA.find((ff) => ff.id === c.targetItemId);
      return f ? `${f.specialtyName}（${f.name}特产）` : c.targetItemId;
    }
  };

  /** 获取合同目标物品名 */
  

  const isTraveling = ts.travelTurnsRemaining > 0;
  const travelTarget = ts.targetFactionId ? factions.find((f) => f.id === ts.targetFactionId) : null;

  const inventoryEntries = Object.entries(ts.inventory).filter(([, count]) => count > 0);

  // 当前势力的市场价（带声望折扣 + 涨价buff）
  const marketPrice = currentFaction ? (factionPrices[currentFaction.id] || currentFaction.basePrice) : 0;
  const curFid = ts.currentFactionId;
  const buyBuffMult = currentFaction ? (buyBuffs?.[currentFaction.id] || []).reduce((m, b) => m * b.multiplier, 1) : 1;
  const buyPrice = currentFaction && currentRepTier ? Math.ceil(marketPrice * (1 - currentRepTier.discount) * buyBuffMult) : marketPrice;
  const buyStockLeft = currentFaction ? (buyStocks?.[currentFaction.id] ?? 0) : 0;
  const sellDemandLeft = sellDemands?.[curFid] ?? 0;
  const sellBuffMult = (sellBuffs?.[curFid] || []).reduce((m, b) => m * b.multiplier, 1);
  // 选中跃迁目标是否为宿敌（声望 ≤ -91 禁止进入；恶意 -90~-51 可跃迁）
  const selectedRep = selectedTarget ? (factionReputation || {})[selectedTarget] || 0 : 0;
  const isHostile = selectedRep <= -91;

  // 解析输入数量（字符串 → 数字，非法/空返回 0）
  const buyQtyNum = parseInt(buyQty, 10) || 0;
  const sellQtyNum = parseInt(sellQty, 10) || 0;
  // 可买最大数量（金币 + 库存），可卖最大数量（库存 + 需求）
  const maxBuyQty = buyPrice > 0 ? Math.min(Math.floor(ship.gold / buyPrice), buyStockLeft) : 0;
  const maxSellQty = Math.min(ts.inventory[sellFaction] || 0, sellDemandLeft);

  // 黑市采购：选中势力、单价、总价（涨价buff 也影响黑市价，不含声望折扣）
  const blackFactionData = blackFaction ? factions.find((f) => f.id === blackFaction) : null;
  const blackBasePrice = blackFactionData ? (factionPrices[blackFaction] || blackFactionData.basePrice) : 0;
  const blackBuffMult = blackFaction ? (buyBuffs?.[blackFaction] || []).reduce((m, b) => m * b.multiplier, 1) : 1;
  const blackPrice = Math.ceil(blackBasePrice * blackBuffMult * (blackMarketMultiplier || 3.2));
  const blackQtyNum = parseInt(blackQty, 10) || 0;
  const blackTotal = blackPrice * blackQtyNum;
  const canBlackBuy = !!(blackFactionData && blackQtyNum > 0 && ship.gold >= blackTotal);
  const maxBlackQty = blackPrice > 0 ? Math.floor(ship.gold / blackPrice) : 0;

  const handleTravel = () => {
    if (!selectedTarget) { setMessage('请选择目标势力'); setMsgType('error'); return; }
    const res = onTravel(selectedTarget);
    setMessage(res.message); setMsgType(res.success ? 'success' : 'error');
    if (res.success) setSelectedTarget('');
    setTimeout(() => setMessage(''), 5000);
  };

  const handleBuy = () => {
    const res = onBuy(buyQtyNum);
    setMessage(res.message); setMsgType(res.success ? 'success' : 'error');
    setTimeout(() => setMessage(''), 5000);
  };

  const handleSell = () => {
    if (!sellFaction) { setMessage('请选择要卖出的特产来源'); setMsgType('error'); return; }
    const res = onSell(sellFaction, sellQtyNum);
    setMessage(res.message); setMsgType(res.success ? 'success' : 'error');
    if (res.success) { setSellFaction(''); setSellQty('1'); }
    setTimeout(() => setMessage(''), 5000);
  };

  const handleBlackBuy = () => {
    if (!blackFactionData) { setMessage('请先选择势力'); setMsgType('error'); return; }
    const res = onBlackMarketBuy(blackFaction, blackFactionData.specialtyName, blackQtyNum);
    setMessage(res.message); setMsgType(res.success ? 'success' : 'error');
    if (res.success) setBlackQty('1');
    setTimeout(() => setMessage(''), 5000);
  };

  const handleExplore = () => {
    const res = onExplore();
    setMessage(res.message); setMsgType(res.success ? 'success' : 'error');
    setTimeout(() => setMessage(''), 5000);
  };

  const handleInvest = () => {
    if (ship.gold < 8000) { setMessage('金币不足，需要8000金币'); setMsgType('error'); return; }
    const res = onInvest(8000);
    setMessage(res.message); setMsgType(res.success ? 'success' : 'error');
    
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
          <Globe size={20} className="text-cyan-400 flex-shrink-0" />
          <div className="flex-1 min-w-0">
            <p className="text-xs text-cyan-400">当前停靠</p>
            <p className="text-lg font-bold text-white">{currentFaction?.name || '未知'}</p>
          </div>
          {isTraveling && travelTarget && (
            <div className="text-right">
              <p className="text-xs text-yellow-400">跃迁中</p>
              <p className="text-sm text-slate-300">前往 {travelTarget.name}</p>
              <p className="text-xs text-slate-500">剩余 {ts.travelTurnsRemaining} 回合</p>
            </div>
          )}
        </div>
        {/* 声望条 */}
        {(() => {
              const rep = factionReputation[currentFaction?.id || ''] || 0;
              const tier = getReputationTier(rep);
              const color = rep < 0 ? 'bg-red-500' : rep < 30 ? 'bg-slate-500' : rep < 70 ? 'bg-cyan-500' : 'bg-amber-500';
              const offset = 50 + rep / 2;
              const effects: string[] = [];
              if (tier.discount !== 0) {
                const sign = tier.discount > 0 ? '-' : '+';
                effects.push(`特产${sign}${Math.abs(Math.round(tier.discount * 100))}%`);
              }
              if (tier.passiveIncomeMax > 0) {
                effects.push(`每回合+${tier.passiveIncomeMin}~${tier.passiveIncomeMax}金币`);
              }
              return (
                <div>
                  <div className="flex items-center justify-between mb-1.5">
                    <span className={`text-sm font-bold ${rep < -20 ? 'text-red-400' : rep < 30 ? 'text-slate-300' : rep < 70 ? 'text-cyan-400' : 'text-amber-400'}`}>{tier.label}</span>
                    <span className={`text-base font-bold ${rep < 0 ? 'text-red-400' : rep > 0 ? 'text-green-400' : 'text-slate-400'}`}>{rep > 0 ? '+' : ''}{rep}</span>
                  </div>
                  <div className="h-2 bg-slate-700 rounded-full relative mb-1.5 overflow-hidden">
                    <div className="absolute left-1/2 top-0 bottom-0 w-px bg-slate-500 z-10"></div>
                    <div className={`absolute top-0 bottom-0 rounded-full ${color}`}
                      style={{ left: `${Math.min(offset, 100)}%`, width: `${Math.min(Math.abs(rep) / 2, 100 - Math.min(offset, 100))}%` }}></div>
                  </div>
                  {effects.length > 0 && (
                    <div className="text-xs text-slate-400 leading-relaxed">{effects.join(' · ')}</div>
                  )}
                </div>
              );
            })()}
        {/* 声望投资快捷按钮 */}
        {currentFaction && !isTraveling && currentFaction.id === ts.currentFactionId && (
          <button onClick={() => setActiveTab('buy-invest')} className="mt-3 w-full py-1.5 bg-blue-900/40 hover:bg-blue-800/60 border border-blue-700/40 rounded text-xs text-blue-300">💰 投资 {currentFaction.name}</button>
        )}

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
              
              const fPrice = factionPrices[f.id] || f.basePrice;
              const fRep = (factionReputation || {})[f.id] || 0;
              const fRepTier = getReputationTier(fRep);
              const fRel = RELATION_MATRIX[f.id] || { allies: [], enemies: [] };
              return (
                <div key={f.id} className={`rounded-lg border p-3 ${isCurrent ? 'border-cyan-500 bg-cyan-900/20' : 'border-slate-700 bg-slate-800/40'}`}>
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex items-center gap-3 min-w-0 flex-1">
                      <img
                        src={`/factions/${f.id}.png`}
                        alt={f.name}
                        onError={(e) => { (e.target as HTMLImageElement).style.display='none'; }}
                        className="w-[60px] h-[60px] md:w-[100px] md:h-[100px] rounded-lg object-cover border border-slate-700 flex-shrink-0"
                      />
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className={`text-base font-bold ${isCurrent ? 'text-cyan-400' : 'text-slate-100'}`}>{f.name}</span>
                          {isCurrent && <span className="text-[10px] bg-cyan-600 text-white px-1.5 py-0.5 rounded">当前</span>}
                          <span className={`text-xs px-1.5 py-0.5 rounded font-bold ${fRep < -20 ? 'bg-red-900/60 text-red-300' : fRep < 30 ? 'bg-slate-700 text-slate-300' : fRep < 70 ? 'bg-cyan-700 text-cyan-100' : 'bg-amber-600 text-white'}`}>{fRepTier.label} <span className={fRep < 0 ? 'text-red-400' : fRep > 0 ? 'text-green-300' : ''}>{fRep}</span></span>
                          {fRel.allies.length > 0 && (
                            <span
                              className="text-[10px] md:text-xs px-1.5 py-0.5 rounded bg-emerald-900/40 text-emerald-300 border border-emerald-700/50 font-bold"
                              title={`盟友: ${fRel.allies.map(id => FACTIONS_DATA.find(x => x.id === id)?.name).filter(Boolean).join('、')}`}
                            >
                              友 {fRel.allies.length}
                            </span>
                          )}
                          {fRel.enemies.length > 0 && (
                            <span
                              className="text-[10px] md:text-xs px-1.5 py-0.5 rounded bg-red-900/40 text-red-300 border border-red-700/50 font-bold"
                              title={`敌对: ${fRel.enemies.map(id => FACTIONS_DATA.find(x => x.id === id)?.name).filter(Boolean).join('、')}`}
                            >
                              敌 {fRel.enemies.length}
                            </span>
                          )}
                        </div>
                        <p className="text-sm text-slate-300 mt-1">{f.specialtyName} | 市场价 <span className="text-yellow-400">{fPrice}</span> <span className="text-slate-600">(基价{f.basePrice})</span></p>
                      </div>
                    </div>
                    {!isCurrent && <span className="text-xs text-slate-500 flex-shrink-0">距离 {dist} | {turns}回合</span>}
                  </div>
                  {!isCurrent && !isTraveling && (
                    <button onClick={() => setSelectedTarget(f.id)} className={`mt-2 text-sm px-4 py-2 rounded-lg font-bold transition-colors ${selectedTarget === f.id ? 'bg-cyan-600 text-white' : 'bg-slate-700 text-slate-300 hover:bg-slate-600'}`}>
                      {selectedTarget === f.id ? '✓ 已选择' : '选择跃迁'}
                    </button>
                  )}
                </div>
              );
            })}
          </div>
          {selectedTarget && !isTraveling && (
            <button
              onClick={handleTravel}
              disabled={isHostile}
              className={`mt-4 w-full py-2.5 rounded-lg font-bold transition-all flex items-center justify-center gap-2 ${isHostile ? 'bg-slate-700 text-slate-500 cursor-not-allowed' : 'bg-gradient-to-r from-cyan-600 to-blue-600 hover:from-cyan-500 hover:to-blue-500 text-white'}`}
            >
              <Rocket size={16} /> {isHostile ? '该势力与你为敌，无法进入' : '确认跃迁'}
            </button>
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
              <div className="bg-slate-800/60 rounded-lg p-4 mb-4 flex gap-4 items-start">
                <img
                  src={`/specialty/${currentFaction.id}.png`}
                  alt={currentFaction.specialtyName}
                  onError={(e) => { (e.target as HTMLImageElement).style.display='none'; }}
                  className="w-[80px] h-[80px] md:w-[150px] md:h-[150px] rounded-lg object-cover border border-slate-700 flex-shrink-0"
                />
                <div className="flex-1 min-w-0">
                <p className="text-sm text-slate-300 mb-1"><span className="text-cyan-400 font-bold">{currentFaction.name}</span> 的特产</p>
                <p className="text-lg font-bold text-white">{currentFaction.specialtyName}</p>
                <p className="text-xs text-slate-500">{currentFaction.specialtyDescription}</p>
                <div className="flex items-center gap-4 mt-3 flex-wrap">
                  <div><p className="text-xs text-slate-500">本回合市场价</p><p className="text-sm text-slate-300">{marketPrice.toLocaleString()} 金</p></div>
                  <div><p className="text-xs text-slate-500">你的购买价</p><p className="text-xl font-bold text-yellow-400">{buyPrice.toLocaleString()} 金
                      {currentRepTier.discount !== 0 && (
                        <span className={'ml-2 text-xs px-2 py-0.5 rounded ' + (currentRepTier.discount > 0 ? 'bg-green-900/40 text-green-300' : 'bg-red-900/40 text-red-300')}>
                          {currentRepTier.discount > 0 ? '-' : '+'}{Math.abs(Math.round(currentRepTier.discount * 100))}%
                        </span>
                      )}
                    </p></div>
                  {currentRepTier.discount > 0 && <div><p className="text-xs text-green-400">投资优惠</p><p className="text-sm text-green-400 font-bold">-{(currentRepTier.discount * 100).toFixed(0)}%</p></div>}
                  <div><p className="text-xs text-slate-500">基价</p><p className="text-sm text-slate-500 line-through">{currentFaction.basePrice.toLocaleString()} 金</p></div>
                  <div><p className="text-xs text-slate-500">本回合剩余库存</p><p className={`text-sm font-bold ${buyStockLeft <= 0 ? 'text-red-400' : 'text-slate-300'}`}>{buyStockLeft.toLocaleString()} 个</p></div>
                  {buyBuffMult > 1 && <div><p className="text-xs text-orange-400">涨价中</p><p className="text-sm text-orange-400 font-bold">×{buyBuffMult.toFixed(2)}</p></div>}
                </div>
                </div>
              </div>
            )}
            <div className="flex items-center gap-3 mb-4">
              <label className="text-sm text-slate-400">数量：</label>
              <input type="text" inputMode="numeric" pattern="[0-9]*" value={buyQty} onChange={(e) => setBuyQty(e.target.value.replace(/[^0-9]/g, ''))} className="w-24 bg-slate-800 border border-slate-600 rounded-lg px-3 py-2 text-sm text-slate-200" />
              <button onClick={() => setBuyQty(String(maxBuyQty))} className="px-2.5 py-1.5 bg-slate-700 hover:bg-slate-600 rounded-lg text-xs text-slate-300 transition-colors">最大</button>
              <span className="text-sm text-slate-500">= {(buyPrice * buyQtyNum).toLocaleString()} 金币</span>
            </div>
            <button onClick={handleBuy} disabled={ship.gold < buyPrice * buyQtyNum || buyQtyNum <= 0 || buyQtyNum > buyStockLeft || ship.bankrupt}
              className="w-full py-2.5 bg-green-700 hover:bg-green-600 disabled:bg-slate-700 disabled:text-slate-500 rounded-lg font-bold text-white transition-colors">
              {ship.bankrupt ? '破产中无法购买' : buyQtyNum > buyStockLeft ? `库存不足（仅剩${buyStockLeft}个）` : `购买 (${(buyPrice * buyQtyNum).toLocaleString()} 金币)`}
            </button>
          </div>
        )
      )}

      {/* 声望投资（购买特产内的次级面板） */}
      {activeTab === 'buy-invest' && (
        isTraveling && travelTarget ? <TravelLockOverlay turnsRemaining={ts.travelTurnsRemaining} targetName={travelTarget.name} /> : (
          <div className="bg-slate-900/60 border border-slate-700 rounded-xl p-5">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-bold text-slate-200 flex items-center gap-2"><BarChart3 size={18} className="text-blue-400" /> 投资 {currentFaction?.name}</h3>
              <button onClick={() => setActiveTab('buy')} className="text-xs text-slate-400 hover:text-slate-300">← 返回购买</button>
            </div>
            <p className="text-sm text-slate-400 mb-4">向{currentFaction?.name || '当前势力'}换取声望。每<strong className="text-yellow-400">8000金币</strong>=1声望，每回合最多+10。</p>
            <div className="mb-4 bg-slate-800/60 rounded-lg p-3">
              <div className="flex justify-between text-xs text-slate-400 mb-1"><span>当前声望：<span className="text-amber-400 font-bold">{currentRep}</span>（{currentRepTier.label}）</span><span>每回合最多 10 次</span></div>
              <div className="h-1.5 bg-slate-700 rounded-full relative">
                <div className="absolute left-1/2 top-0 bottom-0 w-px bg-slate-500"></div>
                <div className="absolute top-0 bottom-0 rounded-full bg-blue-500" style={{ left: `${Math.min(50 + currentRep/2, 100)}%`, width: `${Math.abs(currentRep)/2}%` }}></div>
              </div>
            </div>
            <p className="text-xs text-slate-500 mb-3">每次点击投资按钮固定消耗 <span className="text-yellow-400 font-bold">8000金币</span> 获得 <span className="text-amber-400 font-bold">+1声望</span>，本回合最多 10 次。</p>
            <button onClick={handleInvest} disabled={ship.gold < 8000} className="w-full py-2.5 bg-blue-700 hover:bg-blue-600 disabled:bg-slate-700 disabled:text-slate-500 rounded-lg font-bold text-white transition-colors flex items-center justify-center gap-2"><Coins size={16} /> 投资 8000 金币（+1声望）</button>
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
                  <div className="flex items-center gap-3 text-xs">
                    <span className="text-slate-400">本回合剩余需求：<span className={`font-bold ${sellDemandLeft <= 0 ? 'text-red-400' : 'text-slate-300'}`}>{sellDemandLeft.toLocaleString()} 个</span></span>
                    {sellBuffMult < 1 && <span className="text-orange-400 font-bold">降价中 ×{sellBuffMult.toFixed(2)}</span>}
                  </div>
                  {inventoryEntries.map(([fid, count]) => {
                    const f = factions.find((fa) => fa.id === fid);
                    if (!f) return null;
                    const sellP = getSellPrice(fid, factionPrices, factionSellMultipliers);
                    const dist = currentFaction ? getDistance(currentFaction.id, fid) : 0;
                    const isLocal = ts.currentFactionId === fid;
                    return (
                      <div key={fid} className={`rounded-lg p-3 ${sellFaction === fid ? 'border border-yellow-500 bg-yellow-900/10' : isLocal ? 'border border-red-700/30 bg-red-950/10' : 'border border-slate-700 bg-slate-800/40'}`}>
                        <div className="flex items-center justify-between gap-3">
                          <img
                            src={`/specialty/${fid}.png`}
                            alt={f.specialtyName}
                            onError={(e) => { (e.target as HTMLImageElement).style.display='none'; }}
                            className="w-[60px] h-[60px] md:w-[150px] md:h-[150px] rounded-lg object-cover border border-slate-700 flex-shrink-0"
                          />
                          <div className="flex-1 min-w-0">
                            <p className="text-sm font-bold text-slate-200">{f.specialtyName}</p>
                            <p className="text-xs text-slate-500">来自 {f.name} | 库存 {count} | 距离 {dist}</p>
                            {isLocal && <p className="text-xs text-red-400 mt-0.5">本地特产不可在本地出售，请跃迁到其他势力</p>}
                          </div>
                          <div className="text-right">
                            {!isLocal && <>
                              <p className="text-sm text-yellow-400 font-bold">{Math.round(sellP * sellBuffMult).toLocaleString()}/个</p>
                            </>}
                            <button
                              onClick={() => { if (!isLocal) { setSellFaction(fid); setSellQty('1'); } }}
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
                      <input type="text" inputMode="numeric" pattern="[0-9]*" value={sellQty}
                        onChange={(e) => setSellQty(e.target.value.replace(/[^0-9]/g, ''))}
                        className="w-24 bg-slate-800 border border-slate-600 rounded-lg px-3 py-2 text-sm text-slate-200" />
                      <button onClick={() => setSellQty(String(maxSellQty))} className="px-2.5 py-1.5 bg-slate-700 hover:bg-slate-600 rounded-lg text-xs text-slate-300 transition-colors">最大</button>
                      <span className="text-sm text-slate-500">
                        = {(() => { const f = factions.find((fa) => fa.id === sellFaction); if (!f) return 0; return Math.round(getSellPrice(sellFaction, factionPrices, factionSellMultipliers) * sellQtyNum * sellBuffMult).toLocaleString(); })()} 金币
                      </span>
                    </div>
                    <button onClick={handleSell} disabled={sellQtyNum <= 0 || sellQtyNum > maxSellQty} className="w-full py-2.5 bg-yellow-700 hover:bg-yellow-600 disabled:bg-slate-700 disabled:text-slate-500 rounded-lg font-bold text-white transition-colors">
                      {sellQtyNum > sellDemandLeft ? `本回合需求已满（仅剩${sellDemandLeft}个）` : '确认卖出'}
                    </button>
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

            {/* 合同列表 */}
            {currentFaction && (() => {
              const factionContracts_list = factionContracts.filter((c) => c.factionId === currentFaction.id && !c.accepted);
              const activeContracts = factionContracts.filter((c) => c.factionId === currentFaction.id && c.accepted);
              if (factionContracts_list.length === 0 && activeContracts.length === 0) return null;
              return (
                <div className="rounded-lg p-4 mb-4 border bg-amber-900/20 border-amber-700/30">
                  <p className="text-sm font-bold text-amber-400 mb-2">贸易合同</p>
                  {factionContracts_list.map((c) => (
                    <div key={c.id} className="flex items-center justify-between bg-slate-800/60 rounded p-2 mb-1 text-xs">
                      <div className="flex-1">
                        <span className={c.type==='smuggling'?'text-red-400':'text-cyan-400'}>{c.type==='smuggling'?'走私':'采购'}</span>
                        <span className="text-slate-100 font-bold ml-1">{getContractItemName(c)}</span>
                        <span className="text-slate-300 ml-1">x{c.targetQty}</span>
                        <span className="text-slate-500 ml-1">| +{c.rewardGold}金 +{c.rewardRep}声望</span>
                        <span className="text-slate-600 ml-1">| 剩余 {Math.max(0, c.expiresTurn - currentTurn)} 回合可接取</span>
                      </div>
                      <button onClick={() => { const r = onAcceptContract(c.id); setMessage(r.message); setMsgType(r.success ? 'success' : 'error'); setTimeout(() => setMessage(''), 5000); }} className="px-2 py-1 bg-amber-700 hover:bg-amber-600 rounded text-xs">接取</button>
                    </div>
                  ))}
                  {activeContracts.map((c) => (
                    <div key={c.id} className="flex items-center justify-between bg-green-900/30 rounded p-2 mb-1 text-xs">
                      <span className="text-green-400">{c.type==='smuggling'?'走私':'采购'} <span className="font-bold">{getContractItemName(c)}</span> x{c.targetQty} | +{c.rewardGold}金 +{c.rewardRep}声望 | 剩余 {Math.max(0, c.expiresTurn - currentTurn)} 回合完成</span>
                      <button onClick={() => { const r = onCompleteContract(c.id); setMessage(r.message); setMsgType(r.success ? 'success' : 'error'); }} className="px-2 py-1 bg-green-700 hover:bg-green-600 rounded text-xs">提交</button>
                    </div>
                  ))}
                </div>
              );
            })()}

            {ts.intelGatheredInFaction === ts.currentFactionId ? (
              <div className="text-center text-sm text-slate-500 bg-slate-800/40 rounded-lg py-3">已在此势力打探过消息，跃迁到其他势力后才能再次打探</div>
            ) : (
              <button onClick={handleGatherIntel} className="w-full py-2.5 bg-orange-700 hover:bg-orange-600 rounded-lg font-bold text-white transition-colors flex items-center justify-center gap-2"><Radio size={16} /> 打探消息</button>
            )}
            {/* 黑市采购 */}
            {currentFaction && (
              <div className="mt-3 pt-3 border-t border-slate-700">
                <p className="text-xs text-slate-500 mb-2">黑市采购（当前 {blackMarketMultiplier || 3.2} 倍价格，不影响声望）</p>
                {/* 势力选择 */}
                <div className="flex gap-1.5 mb-3 overflow-x-auto pb-1 scrollbar-hide">
                  {['f01','f02','f03','f04','f05','f06','f07','f08','f09','f10'].map(fid => {
                    const f = factions.find(ff => ff.id === fid);
                    if (!f) return null;
                    const isSel = blackFaction === fid;
                    return (
                      <button key={fid} onClick={() => { setBlackFaction(fid); setBlackQty('1'); }}
                        className={`flex-shrink-0 px-2.5 py-1.5 rounded-md text-xs font-bold border transition-all ${isSel ? 'bg-purple-700 text-white border-purple-500' : 'bg-purple-900/60 text-purple-300 border-slate-700 hover:border-purple-500'}`}>
                        {isSel ? f.name : f.name.slice(0, 2)}
                      </button>
                    );
                  })}
                </div>
                {/* 详情 + 购买（仅选中时显示） */}
                {blackFactionData && (
                  <div className="bg-slate-800/60 rounded-lg p-3">
                    <div className="flex items-center gap-3 mb-3">
                      <img
                        src={`/specialty/${blackFactionData.id}.png`}
                        alt={blackFactionData.specialtyName}
                        onError={(e) => { (e.target as HTMLImageElement).style.display='none'; }}
                        className="w-12 h-12 rounded-lg object-cover border border-slate-700 flex-shrink-0"
                      />
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-bold text-slate-200">{blackFactionData.name}</p>
                        <p className="text-xs text-slate-400">特产：{blackFactionData.specialtyName}</p>
                        <p className="text-xs text-slate-500 mt-0.5">单价 <span className="text-purple-300 font-bold">{blackPrice.toLocaleString()}</span> 金币（市场价 {blackBasePrice.toLocaleString()} × {blackMarketMultiplier || 3.2}{blackBuffMult > 1 ? ` × 涨价${blackBuffMult.toFixed(2)}` : ''}）</p>
                      </div>
                    </div>
                    <div className="flex items-center gap-2 mb-3">
                      <label className="text-xs text-slate-400">数量：</label>
                      <input type="text" inputMode="numeric" pattern="[0-9]*" value={blackQty} onChange={(e) => setBlackQty(e.target.value.replace(/[^0-9]/g, ''))} className="w-24 bg-slate-900 border border-slate-600 rounded-lg px-3 py-2 text-sm text-slate-200" />
                      <button onClick={() => setBlackQty(String(maxBlackQty))} disabled={maxBlackQty <= 0} className="px-2.5 py-1.5 bg-slate-700 hover:bg-slate-600 disabled:bg-slate-800 disabled:text-slate-600 rounded-lg text-xs text-slate-300 transition-colors">最大</button>
                      <span className="text-xs text-slate-500 ml-1">总价 <span className="text-purple-300 font-bold">{blackTotal.toLocaleString()}</span> 金币</span>
                    </div>
                    <button onClick={handleBlackBuy} disabled={!canBlackBuy}
                      className="w-full py-2 bg-purple-700 hover:bg-purple-600 disabled:bg-slate-700 disabled:text-slate-500 rounded-lg text-sm font-bold text-white transition-colors">
                      {blackQtyNum <= 0 ? '请输入数量' : ship.gold < blackTotal ? `金币不足，需 ${blackTotal.toLocaleString()}` : `确认购买（${blackTotal.toLocaleString()} 金币）`}
                    </button>
                  </div>
                )}
              </div>
            )}
          </div>
        )
      )}

      {message && <div className={`p-3 rounded-lg text-sm text-center ${msgType === 'success' ? 'bg-green-900/20 border border-green-700/50 text-green-400' : 'bg-red-900/20 border border-red-700/50 text-red-400'}`}>{message}</div>}
    </div>
  );
}

export default memo(TradePanel);
