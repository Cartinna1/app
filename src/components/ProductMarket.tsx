import { useState, useMemo } from 'react';
import type { Mothership, Product, StardustMarket } from '@/types/game';
import { INITIAL_PRODUCTS, RECIPES } from '@/data/gameData';
import { getRelicById } from '@/data/relics';
import { ShoppingCart, AlertTriangle, TrendingUp, TrendingDown, Package, Sparkles, Gem, Coins } from 'lucide-react';

interface ProductMarketProps {
  ship: Mothership;
  shipIndex: number;
  products: Product[];
  materials: { id: string; name: string; currentPrice: number; basePrice: number }[];
  stardustMarket: StardustMarket;
  onSellQty: (shipIndex: number, productId: string, qty?: number) => { totalRevenue: number; count: number; avgMatCost: number; unitPrice: number } | null;
  onBuyRelic: (relicId: string) => { success: boolean; message: string };
  onBuyAlloy?: (type: 'gold' | 'stardust', qty: number) => boolean;
  onBuyFood?: (type: 'gold' | 'alloy', qty: number) => boolean;
}

interface ProductGroup {
  productId: string;
  name: string;
  description: string;
  count: number;
  avgMatCost: number;
  totalMatCost: number;
  earliestExpire: number;
  productionTurns: number;
}

export default function ProductMarket({ ship, shipIndex, products, materials, stardustMarket, onSellQty, onBuyRelic, onBuyAlloy, onBuyFood }: ProductMarketProps) {
  const [quantities, setQuantities] = useState<Record<string, number>>({});
  const [messages, setMessages] = useState<Record<string, string>>({});
  const [msgTypes, setMsgTypes] = useState<Record<string, 'success' | 'error'>>({});
  const [relicMessage, setRelicMessage] = useState('');
  const [relicMsgType, setRelicMsgType] = useState<'success' | 'error'>('success');
  const [goldAlloyQty, setGoldAlloyQty] = useState(1);
  const [stardustAlloyQty, setStardustAlloyQty] = useState(1);
  const [alloyMessage, setAlloyMessage] = useState('');
  const [alloyMsgType, setAlloyMsgType] = useState<'success' | 'error'>('success');
  const [goldFoodQty, setGoldFoodQty] = useState(1);
  const [alloyFoodQty, setAlloyFoodQty] = useState(1);
  const [foodMessage, setFoodMessage] = useState('');
  const [foodMsgType, setFoodMsgType] = useState<'success' | 'error'>('success');

  // 按productId分组合并
  const groups = useMemo<ProductGroup[]>(() => {
    const map = new Map<string, ProductGroup>();
    ship.products.forEach((item) => {
      const info = INITIAL_PRODUCTS.find((p) => p.id === item.productId);
      const existing = map.get(item.productId);
      if (existing) {
        existing.count += 1;
        existing.totalMatCost += item.materialCost || 0;
        existing.earliestExpire = Math.min(existing.earliestExpire, item.expiresAt);
      } else {
        map.set(item.productId, {
          productId: item.productId,
          name: info?.name || item.productId,
          description: info?.description || '',
          count: 1,
          avgMatCost: item.materialCost || 0,
          totalMatCost: item.materialCost || 0,
          earliestExpire: item.expiresAt,
          productionTurns: info?.productionTurns || 1,
        });
      }
    });
    // 计算平均值
    map.forEach((g) => { if (g.count > 1) g.avgMatCost = g.totalMatCost / g.count; });
    return Array.from(map.values()).sort((a, b) => a.earliestExpire - b.earliestExpire);
  }, [ship.products]);

  const getQty = (productId: string) => {
    const g = groups.find((gr) => gr.productId === productId);
    return Math.min(quantities[productId] || 1, g?.count || 1);
  };

  // 计算产品按当前原料市场价的成本（机会成本）
  const getCurrentMatCost = (productId: string, allMaterials: { id: string; currentPrice: number }[]): number => {
    const recipe = RECIPES.find((r) => r.id === productId);
    if (!recipe) return 0;
    return recipe.inputs.reduce((sum, inp) => {
      const mat = allMaterials.find((m) => m.id === inp.materialId);
      return sum + (mat ? mat.currentPrice * inp.amount : 0);
    }, 0);
  };

  const handleSell = (group: ProductGroup) => {
    const qty = getQty(group.productId);
    const result = onSellQty(shipIndex, group.productId, qty);

    if (!result) {
      setMessages({ ...messages, [group.productId]: '出售失败：产品已过期或不存在' });
      setMsgTypes({ ...msgTypes, [group.productId]: 'error' });
      setTimeout(() => {
        setMessages((prev) => ({ ...prev, [group.productId]: '' }));
        setMsgTypes((prev) => ({ ...prev, [group.productId]: 'success' }));
      }, 3000);
      return;
    }

    const baseRef = INITIAL_PRODUCTS.find((p) => p.id === group.productId)?.baseSellPrice || result.unitPrice;
    const matProfit = result.unitPrice - result.avgMatCost;
    const baseProfit = result.unitPrice - baseRef;
    const skillBonus = ship.sellPriceBonus || 0;
    const eventBonus = (ship.sellBonuses || []).reduce((sum, b) => sum + b.bonus, 0);

    let msg = `出售 ${group.name} \u00d7${result.count}，收入 ${result.totalRevenue.toLocaleString()} 金币`;
    msg += ` | \u539f\u6599${result.avgMatCost > 0 ? '成本' + Math.round(result.avgMatCost).toLocaleString() + '/个\u2192' : ''}${matProfit >= 0 ? '赚' : '亏'}${Math.abs(matProfit).toLocaleString()}/个`;
    msg += ` | \u57fa\u51c6${baseRef}/个\u2192${baseProfit >= 0 ? '+' : ''}${((baseProfit / baseRef) * 100).toFixed(0)}%`;
    if (skillBonus > 0) msg += ` [技能+${Math.round(skillBonus * 100)}%]`;
    if (eventBonus > 0) msg += ` [事件+${eventBonus}%]`;

    setMessages({ ...messages, [group.productId]: msg });
    setMsgTypes({ ...msgTypes, [group.productId]: 'success' });
    setTimeout(() => {
      setMessages((prev) => ({ ...prev, [group.productId]: '' }));
    }, 6000);
  };

  const handleSellAll = (group: ProductGroup) => {
    const result = onSellQty(shipIndex, group.productId, group.count);
    if (!result) {
      setMessages({ ...messages, [group.productId]: '出售失败：产品已过期或不存在' });
      setMsgTypes({ ...msgTypes, [group.productId]: 'error' });
      setTimeout(() => {
        setMessages((prev) => ({ ...prev, [group.productId]: '' }));
        setMsgTypes((prev) => ({ ...prev, [group.productId]: 'success' }));
      }, 3000);
      return;
    }
    const baseRef = INITIAL_PRODUCTS.find((p) => p.id === group.productId)?.baseSellPrice || result.unitPrice;
    const matProfit = result.unitPrice - result.avgMatCost;
    const baseProfit = result.unitPrice - baseRef;
    const skillBonus = ship.sellPriceBonus || 0;
    const eventBonus = (ship.sellBonuses || []).reduce((sum, b) => sum + b.bonus, 0);
    let msg = `\u51fa\u552e ${group.name} \u00d7${result.count}\uff0c\u6536\u5165 ${result.totalRevenue.toLocaleString()} \u91d1\u5e01`;
    msg += ` | \u539f\u6599${result.avgMatCost > 0 ? '\u6210\u672c' + Math.round(result.avgMatCost).toLocaleString() + '/\u4e2a\u2192' : ''}${matProfit >= 0 ? '\u8d5a' : '\u4e8f'}${Math.abs(matProfit).toLocaleString()}/\u4e2a`;
    msg += ` | \u57fa\u51c6${baseRef}/\u4e2a\u2192${baseProfit >= 0 ? '+' : ''}${((baseProfit / baseRef) * 100).toFixed(0)}%`;
    if (skillBonus > 0) msg += ` [技能+${Math.round(skillBonus * 100)}%]`;
    if (eventBonus > 0) msg += ` [事件+${eventBonus}%]`;
    setMessages({ ...messages, [group.productId]: msg });
    setMsgTypes({ ...msgTypes, [group.productId]: 'success' });
    setTimeout(() => setMessages((prev) => ({ ...prev, [group.productId]: '' })), 6000);
  };

  const handleBuyAlloy = (type: 'gold' | 'stardust') => {
    if (!onBuyAlloy) return;
    if (type === 'gold') {
      const cost = 1200 * goldAlloyQty;
      if (ship.gold < cost) {
        setAlloyMessage(`金币不足（需要${cost.toLocaleString()}金币）`);
        setAlloyMsgType('error');
        setTimeout(() => setAlloyMessage(''), 3000);
        return;
      }
      onBuyAlloy('gold', goldAlloyQty);
      setAlloyMessage(`花费${cost.toLocaleString()}金币购买了${goldAlloyQty}个合金`);
      setAlloyMsgType('success');
    } else {
      if (ship.stardust < stardustAlloyQty) {
        setAlloyMessage(`星尘不足（需要${stardustAlloyQty}星尘）`);
        setAlloyMsgType('error');
        setTimeout(() => setAlloyMessage(''), 3000);
        return;
      }
      onBuyAlloy('stardust', stardustAlloyQty);
      setAlloyMessage(`花费${stardustAlloyQty}星尘购买了${stardustAlloyQty * 5}个合金`);
      setAlloyMsgType('success');
    }
    setTimeout(() => setAlloyMessage(''), 3000);
  };

  const handleBuyFood = (type: 'gold' | 'alloy') => {
    if (!onBuyFood) return;
    if (type === 'gold') {
      const cost = 800 * goldFoodQty;
      if (ship.gold < cost) {
        setFoodMessage(`金币不足（需要${cost.toLocaleString()}金币）`);
        setFoodMsgType('error');
        setTimeout(() => setFoodMessage(''), 3000);
        return;
      }
      onBuyFood('gold', goldFoodQty);
      setFoodMessage(`花费${cost.toLocaleString()}金币购买了${goldFoodQty}个食物`);
      setFoodMsgType('success');
    } else {
      if (ship.alloy < alloyFoodQty) {
        setFoodMessage(`合金不足（需要${alloyFoodQty}合金）`);
        setFoodMsgType('error');
        setTimeout(() => setFoodMessage(''), 3000);
        return;
      }
      onBuyFood('alloy', alloyFoodQty);
      setFoodMessage(`花费${alloyFoodQty}合金购买了${alloyFoodQty * 2}个食物`);
      setFoodMsgType('success');
    }
    setTimeout(() => setFoodMessage(''), 3000);
  };

  const handleBuyRelic = () => {
    if (!stardustMarket.currentRelicId) return;
    const res = onBuyRelic(stardustMarket.currentRelicId);
    setRelicMessage(res.message);
    setRelicMsgType(res.success ? 'success' : 'error');
    setTimeout(() => setRelicMessage(''), 6000);
  };

  // 当前可售的遗物
  const currentRelic = stardustMarket.currentRelicId ? getRelicById(stardustMarket.currentRelicId) : null;

  return (
    <div className="space-y-4">
      {/* ========== 产品出售区域 ========== */}
      <div>
        <h2 className="text-xl md:text-2xl font-bold text-white mb-3 md:mb-4">星际交易集会</h2>
        <p className="text-xs md:text-sm text-slate-400 mb-2">出售你的产品换取金币。收购价每回合波动，注意时机。</p>
        <div className="flex items-center gap-2 mb-4 md:mb-6 text-xs md:text-sm text-red-400">
          <AlertTriangle size={16} />
          <span>产品生产后3回合内未售出将自动过期销毁！快过期的产品优先卖出。</span>
        </div>

        {groups.length === 0 ? (
          <div className="bg-slate-900/60 border border-slate-700 rounded-xl p-8 text-center text-slate-500">
            <ShoppingCart size={48} className="mx-auto mb-3 opacity-30" />
            <p>没有可出售的产品</p>
            <p className="text-sm mt-1">去生产中心制作产品</p>
          </div>
        ) : (
          <div className="space-y-3">
            {groups.map((group) => {
              const productInfo = products.find((p) => p.id === group.productId);
              const basePrice = productInfo?.currentSellPrice || 0;
              const skillBonus = ship.sellPriceBonus || 0;
              const eventBonus = (ship.sellBonuses || []).reduce((sum, b) => sum + b.bonus, 0) / 100;
              const totalBonus = skillBonus + eventBonus;
              const unitSellPrice = Math.round(basePrice * (1 + totalBonus));
              const baseRef = INITIAL_PRODUCTS.find((p) => p.id === group.productId)?.baseSellPrice || basePrice;
              const currentMatCost = getCurrentMatCost(group.productId, materials);
              const matProfitPerUnit = unitSellPrice - group.avgMatCost;
              const baseProfitPerUnit = unitSellPrice - baseRef;
              const isUrgent = group.earliestExpire <= 2;
              const msg = messages[group.productId] || '';

              return (
                <div key={group.productId} className="bg-slate-900/60 border border-slate-700 rounded-xl p-3 md:p-4">
                  <div className="flex flex-col md:flex-row md:items-center md:justify-between mb-3 gap-2 md:gap-0">
                    <div className="flex items-center gap-2 md:gap-3">
                      <div className={`rounded-lg w-8 h-8 md:w-10 md:h-10 flex items-center justify-center font-bold text-base md:text-lg ${isUrgent ? 'bg-red-900/30 text-red-400' : 'bg-cyan-900/30 text-cyan-400'}`}>
                        {group.count}
                      </div>
                      <div>
                        <div className="flex items-center gap-1 md:gap-2 flex-wrap">
                          <Package size={14} className="text-cyan-400" />
                          <h4 className="font-bold text-slate-100 text-sm md:text-base">{group.name}</h4>
                          <span className="text-[10px] md:text-xs bg-slate-800 text-slate-400 px-1.5 py-0.5 rounded">
                            {group.description}
                          </span>
                          <span className={`text-[10px] md:text-xs px-1.5 py-0.5 rounded font-bold ${
                            group.productionTurns === 1 ? 'bg-green-900/30 text-green-400' :
                            group.productionTurns === 2 ? 'bg-yellow-900/30 text-yellow-400' :
                            'bg-red-900/30 text-red-400'
                          }`}>
                            {group.productionTurns}回合生产
                          </span>
                        </div>
                        <div className="flex items-center gap-2 md:gap-3 mt-1 text-[10px] md:text-xs">
                          <span className={isUrgent ? 'text-red-400 font-bold' : 'text-yellow-400'}>
                            {isUrgent ? '\u26a0 ' : ''}最早{group.earliestExpire}回合后过期
                          </span>
                          {totalBonus > 0 && (
                            <span className="text-purple-400">
                              售价加成 +{Math.round(totalBonus * 100)}%
                              {skillBonus > 0 && eventBonus > 0 ? ` (技能${Math.round(skillBonus * 100)}%+事件${Math.round(eventBonus * 100)}%)` : ''}
                            </span>
                          )}
                        </div>
                      </div>
                    </div>

                    {/* 数量输入 + 出售按钮 */}
                    <div className="flex items-center gap-2">
                      <input
                        type="number"
                        min={1}
                        max={group.count}
                        value={getQty(group.productId)}
                        onChange={(e) => {
                          const v = parseInt(e.target.value) || 1;
                          setQuantities({ ...quantities, [group.productId]: Math.max(1, Math.min(v, group.count)) });
                        }}
                        className="w-14 md:w-16 bg-slate-800 border border-slate-600 rounded-lg px-2 py-1.5 text-sm text-slate-200 text-center focus:outline-none focus:border-cyan-500"
                      />
                      <button
                        onClick={() => handleSell(group)}
                        className="px-3 md:px-4 py-2 bg-green-600 hover:bg-green-500 rounded-lg font-bold text-white text-sm transition-colors"
                      >
                        出售
                      </button>
                      <button
                        onClick={() => handleSellAll(group)}
                        className="px-3 md:px-4 py-2 bg-green-700 hover:bg-green-600 rounded-lg font-bold text-white text-sm transition-colors"
                        title="全部卖出"
                      >
                        全部
                      </button>
                    </div>
                  </div>

                  {/* 价格和盈亏信息 */}
                  <div className="grid grid-cols-2 md:grid-cols-5 gap-2 md:gap-3 text-xs md:text-sm">
                    <div className="bg-slate-800/50 rounded-lg p-1.5 md:p-2">
                      <div className="text-[10px] md:text-xs text-slate-500 mb-0.5 md:mb-1">单价/总价</div>
                      <div className="text-cyan-400 font-bold text-xs md:text-sm">{unitSellPrice.toLocaleString()}</div>
                      <div className="text-[10px] text-slate-400">\u00d7{getQty(group.productId)} = {(unitSellPrice * getQty(group.productId)).toLocaleString()}</div>
                    </div>
                    <div className="bg-slate-800/50 rounded-lg p-1.5 md:p-2">
                      <div className="text-[10px] md:text-xs text-slate-500 mb-0.5 md:mb-1">生产成本/个</div>
                      <div className="text-slate-300 text-xs md:text-sm">{group.avgMatCost.toLocaleString()}</div>
                      <div className="text-[10px] text-slate-600">现价:{currentMatCost.toLocaleString()}</div>
                    </div>
                    <div className="bg-slate-800/50 rounded-lg p-1.5 md:p-2">
                      <div className="text-[10px] md:text-xs text-slate-500 mb-0.5 md:mb-1">原料盈亏/个</div>
                      <div className={`font-bold flex items-center gap-1 text-xs md:text-sm ${matProfitPerUnit >= 0 ? 'text-cyan-400' : 'text-red-400'}`}>
                        {matProfitPerUnit >= 0 ? <TrendingUp size={12}/> : <TrendingDown size={12}/>}
                        {matProfitPerUnit >= 0 ? '+' : ''}{matProfitPerUnit.toLocaleString()}
                      </div>
                      <div className={`text-[10px] md:text-xs ${matProfitPerUnit >= 0 ? 'text-cyan-400' : 'text-red-400'}`}>
                        {group.avgMatCost > 0 ? ((matProfitPerUnit / group.avgMatCost) * 100).toFixed(0) : 0}%
                      </div>
                    </div>
                    <div className="bg-slate-800/50 rounded-lg p-1.5 md:p-2">
                      <div className="text-[10px] md:text-xs text-slate-500 mb-0.5 md:mb-1">基准价/个</div>
                      <div className="text-slate-300 text-xs md:text-sm">{baseRef.toLocaleString()}</div>
                    </div>
                    <div className="bg-slate-800/50 rounded-lg p-1.5 md:p-2">
                      <div className="text-[10px] md:text-xs text-slate-500 mb-0.5 md:mb-1">基准盈亏/个</div>
                      <div className={`font-bold flex items-center gap-1 text-xs md:text-sm ${baseProfitPerUnit >= 0 ? 'text-cyan-400' : 'text-red-400'}`}>
                        {baseProfitPerUnit >= 0 ? <TrendingUp size={12}/> : <TrendingDown size={12}/>}
                        {baseProfitPerUnit >= 0 ? '+' : ''}{baseProfitPerUnit.toLocaleString()}
                      </div>
                      <div className={`text-[10px] md:text-xs ${baseProfitPerUnit >= 0 ? 'text-cyan-400' : 'text-red-400'}`}>
                        {((baseProfitPerUnit / baseRef) * 100).toFixed(0)}%
                      </div>
                    </div>
                  </div>

                  {/* 消息 */}
                  {msg && (
                    <div className={`mt-3 p-2.5 rounded-lg text-sm ${
                      (msgTypes[group.productId] || 'success') === 'success'
                        ? 'bg-green-900/20 text-green-400 border border-green-700/30'
                        : 'bg-red-900/20 text-red-400 border border-red-700/30'
                    }`}>
                      {msg}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* ========== 合金购买 ========== */}
      <div className="border-t border-slate-700/50 pt-4 md:pt-6">
        <h3 className="text-lg md:text-xl font-bold text-white mb-2 flex items-center gap-2">
          <Coins size={20} className="text-slate-400" />
          合金市场
        </h3>
        <p className="text-xs md:text-sm text-slate-400 mb-3">用金币或星尘购买合金。</p>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-3 mb-3">
          {/* 金币购买 */}
          <div className="bg-slate-800/60 border border-slate-700 rounded-xl p-4">
            <div className="flex items-center justify-between mb-2">
              <span className="text-sm text-yellow-400 font-bold">1200金币 → 1合金</span>
            </div>
            <div className="flex items-center gap-2 mb-2">
              <input
                type="number"
                min={1}
                value={goldAlloyQty}
                onChange={(e) => setGoldAlloyQty(Math.max(1, parseInt(e.target.value) || 1))}
                className="w-16 bg-slate-800 border border-slate-600 rounded-lg px-2 py-1.5 text-sm text-slate-200 text-center focus:outline-none focus:border-cyan-500"
              />
              <button
                onClick={() => handleBuyAlloy('gold')}
                disabled={ship.gold < 1200 * goldAlloyQty}
                className={`flex-1 py-2 rounded-lg text-sm font-bold transition-colors ${
                  ship.gold >= 1200 * goldAlloyQty
                    ? 'bg-yellow-600 hover:bg-yellow-500 text-white'
                    : 'bg-slate-700 text-slate-500 cursor-not-allowed'
                }`}
              >
                金币购买
              </button>
            </div>
            <div className="flex justify-between text-xs text-slate-500">
              <span>花费: {(1200 * goldAlloyQty).toLocaleString()}金币</span>
              <span>获得: {goldAlloyQty}合金</span>
            </div>
          </div>

          {/* 星尘购买 */}
          <div className="bg-slate-800/60 border border-purple-700/40 rounded-xl p-4">
            <div className="flex items-center justify-between mb-2">
              <span className="text-sm text-purple-400 font-bold">1星尘 → 5合金</span>
            </div>
            <div className="flex items-center gap-2 mb-2">
              <input
                type="number"
                min={1}
                value={stardustAlloyQty}
                onChange={(e) => setStardustAlloyQty(Math.max(1, parseInt(e.target.value) || 1))}
                className="w-16 bg-slate-800 border border-slate-600 rounded-lg px-2 py-1.5 text-sm text-slate-200 text-center focus:outline-none focus:border-cyan-500"
              />
              <button
                onClick={() => handleBuyAlloy('stardust')}
                disabled={ship.stardust < stardustAlloyQty}
                className={`flex-1 py-2 rounded-lg text-sm font-bold transition-colors ${
                  ship.stardust >= stardustAlloyQty
                    ? 'bg-purple-600 hover:bg-purple-500 text-white'
                    : 'bg-slate-700 text-slate-500 cursor-not-allowed'
                }`}
              >
                星尘购买
              </button>
            </div>
            <div className="flex justify-between text-xs text-slate-500">
              <span>花费: {stardustAlloyQty}星尘</span>
              <span>获得: {stardustAlloyQty * 5}合金</span>
            </div>
          </div>
        </div>

        {/* 合金购买消息 */}
        {alloyMessage && (
          <div className={`p-3 rounded-lg text-sm text-center mb-3 ${
            alloyMsgType === 'success'
              ? 'bg-green-900/20 border border-green-700/50 text-green-400'
              : 'bg-red-900/20 border border-red-700/50 text-red-400'
          }`}>
            {alloyMessage}
          </div>
        )}
      </div>

      {/* ========== 食物购买 ========== */}
      <div className="border-t border-slate-700/50 pt-4 md:pt-6">
        <h3 className="text-lg md:text-xl font-bold text-white mb-2 flex items-center gap-2">
          <Package size={20} className="text-green-400" />
          食物补给
        </h3>
        <p className="text-xs md:text-sm text-slate-400 mb-3">用金币或合金购买食物。</p>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-3 mb-3">
          {/* 金币购买 */}
          <div className="bg-slate-800/60 border border-slate-700 rounded-xl p-4">
            <div className="flex items-center justify-between mb-2">
              <span className="text-sm text-yellow-400 font-bold">800金币 → 1食物</span>
            </div>
            <div className="flex items-center gap-2 mb-2">
              <input
                type="number"
                min={1}
                value={goldFoodQty}
                onChange={(e) => setGoldFoodQty(Math.max(1, parseInt(e.target.value) || 1))}
                className="w-16 bg-slate-800 border border-slate-600 rounded-lg px-2 py-1.5 text-sm text-slate-200 text-center focus:outline-none focus:border-green-500"
              />
              <button
                onClick={() => handleBuyFood('gold')}
                disabled={ship.gold < 800 * goldFoodQty}
                className={`flex-1 py-1.5 rounded-lg text-xs font-bold transition-colors ${
                  ship.gold >= 800 * goldFoodQty
                    ? 'bg-yellow-600 hover:bg-yellow-500 text-white'
                    : 'bg-slate-700 text-slate-500 cursor-not-allowed'
                }`}
              >
                金币购买
              </button>
            </div>
            <div className="flex justify-between text-xs text-slate-500">
              <span>花费: {(800 * goldFoodQty).toLocaleString()}金币</span>
              <span>获得: {goldFoodQty}食物</span>
            </div>
          </div>

          {/* 合金购买 */}
          <div className="bg-slate-800/60 border border-slate-700 rounded-xl p-4">
            <div className="flex items-center justify-between mb-2">
              <span className="text-sm text-slate-300 font-bold">1合金 → 2食物</span>
            </div>
            <div className="flex items-center gap-2 mb-2">
              <input
                type="number"
                min={1}
                value={alloyFoodQty}
                onChange={(e) => setAlloyFoodQty(Math.max(1, parseInt(e.target.value) || 1))}
                className="w-16 bg-slate-800 border border-slate-600 rounded-lg px-2 py-1.5 text-sm text-slate-200 text-center focus:outline-none focus:border-green-500"
              />
              <button
                onClick={() => handleBuyFood('alloy')}
                disabled={ship.alloy < alloyFoodQty}
                className={`flex-1 py-1.5 rounded-lg text-xs font-bold transition-colors ${
                  ship.alloy >= alloyFoodQty
                    ? 'bg-slate-600 hover:bg-slate-500 text-white'
                    : 'bg-slate-700 text-slate-500 cursor-not-allowed'
                }`}
              >
                合金购买
              </button>
            </div>
            <div className="flex justify-between text-xs text-slate-500">
              <span>花费: {alloyFoodQty}合金</span>
              <span>获得: {alloyFoodQty * 2}食物</span>
            </div>
          </div>
        </div>

        {/* 食物购买消息 */}
        {foodMessage && (
          <div className={`p-3 rounded-lg text-sm text-center mb-3 ${
            foodMsgType === 'success'
              ? 'bg-green-900/20 border border-green-700/50 text-green-400'
              : 'bg-red-900/20 border border-red-700/50 text-red-400'
          }`}>
            {foodMessage}
          </div>
        )}
      </div>

      {/* ========== 星尘集市（合并到这里） ========== */}
      <div className="border-t border-slate-700/50 pt-4 md:pt-6">
        <h3 className="text-lg md:text-xl font-bold text-white mb-2 flex items-center gap-2">
          <Sparkles size={20} className="text-purple-400" />
          星尘集市
        </h3>
        <p className="text-xs md:text-sm text-slate-400 mb-3">每回合刷新一件遗物，可用星尘购买。每件遗物只能购买一次。</p>

        {/* 星尘余额 */}
        <div className="bg-purple-900/20 border border-purple-700/40 rounded-lg p-3 mb-4 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Sparkles size={16} className="text-purple-400" />
            <span className="text-sm text-purple-300">你的星尘</span>
          </div>
          <span className="text-lg font-bold text-purple-300">{ship.stardust}</span>
        </div>

        {/* 当前遗物 */}
        {currentRelic ? (
          <div className="bg-slate-800/60 border border-purple-700/40 rounded-xl p-4">
            <div className="flex items-center gap-2 mb-2">
              <Gem size={18} className="text-purple-400" />
              <h4 className="font-bold text-purple-300 text-base">{currentRelic.name}</h4>
            </div>
            <p className="text-sm text-slate-300 mb-1">{currentRelic.description}</p>
            <p className="text-xs text-purple-400 mb-3">{currentRelic.effect}</p>
            <div className="flex items-center justify-between">
              <span className="text-sm text-purple-400 font-bold">{currentRelic.stardustCost} 星尘</span>
              <button
                onClick={handleBuyRelic}
                disabled={ship.stardust < currentRelic.stardustCost}
                className={`px-4 py-2 rounded-lg text-sm font-bold transition-colors ${
                  ship.stardust >= currentRelic.stardustCost
                    ? 'bg-purple-600 hover:bg-purple-500 text-white'
                    : 'bg-slate-700 text-slate-500 cursor-not-allowed'
                }`}
              >
                {ship.stardust >= currentRelic.stardustCost ? '购买' : '星尘不足'}
              </button>
            </div>
          </div>
        ) : (
          <div className="text-center text-sm text-slate-500 py-8 bg-slate-800/40 rounded-xl">
            <Sparkles size={24} className="mx-auto mb-2 text-slate-600" />
            <p>本回合暂无遗物上架</p>
            <p className="text-xs text-slate-600 mt-1">下回合可能会刷新新的遗物</p>
          </div>
        )}

        {/* 已拥有遗物 */}
        {ship.relics.length > 0 && (
          <div className="mt-4">
            <h4 className="text-sm font-bold text-slate-400 mb-2">已拥有遗物 ({ship.relics.length})</h4>
            <div className="space-y-2">
              {ship.relics.map((r) => (
                <div key={r.id} className="bg-purple-900/10 border border-purple-700/20 rounded-lg p-2 flex items-center gap-2">
                  <Gem size={12} className="text-purple-400" />
                  <span className="text-xs text-purple-300 font-bold">{r.name}</span>
                  <span className="text-[10px] text-slate-500">{r.effect}</span>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* 遗物购买消息 */}
        {relicMessage && (
          <div className={`mt-3 p-3 rounded-lg text-sm text-center ${
            relicMsgType === 'success'
              ? 'bg-green-900/20 border border-green-700/50 text-green-400'
              : 'bg-red-900/20 border border-red-700/50 text-red-400'
          }`}>
            {relicMessage}
          </div>
        )}
      </div>
    </div>
  );
}
