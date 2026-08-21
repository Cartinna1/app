import { useState, useMemo, memo } from 'react';
import type { Mothership, Product, StardustMarket } from '@/types/game';
import { INITIAL_PRODUCTS, RECIPES } from '@/data/gameData';
import { getRelicById } from '@/data/relics';
import { ShoppingCart, AlertTriangle, TrendingUp, TrendingDown, Package, Sparkles, Gem, Coins, RefreshCw, Zap } from 'lucide-react';

// 产品分类标签颜色（按生产回合数，与生产中心一致）
const TURN_COLORS: Record<number, string> = {
  1: 'bg-green-900/30 text-green-400',
  2: 'bg-yellow-900/30 text-yellow-400',
  3: 'bg-orange-900/30 text-orange-400',
  4: 'bg-red-900/30 text-red-400',
  5: 'bg-purple-900/30 text-purple-400',
  6: 'bg-cyan-900/30 text-cyan-400',
};

interface ProductMarketProps {
  ship: Mothership;
  shipIndex: number;
  products: Product[];
  materials: { id: string; name: string; currentPrice: number; basePrice: number }[];
  stardustMarket: StardustMarket;
  currentTurn: number;
  onSellQty: (shipIndex: number, productId: string, qty?: number) => { totalRevenue: number; count: number; avgMatCost: number; unitPrice: number } | null;
  onBuyRelic: (relicId: string) => { success: boolean; message: string };
  onBuyRandomMats?: () => { success: boolean; message: string };
  onBuySellBonus?: (turns: number, bonus: number, stardustCost: number) => { success: boolean; message: string };
  onBuyGoldWithStardust?: () => { success: boolean; message: string };
  onRerollPolicy?: () => { success: boolean; message: string };
  onBuyFoodWithStardust?: (qty: number) => { success: boolean; message: string };
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

function ProductMarket({ ship, shipIndex, products, materials, stardustMarket, currentTurn, onSellQty, onBuyRelic, onBuyRandomMats, onBuySellBonus, onBuyGoldWithStardust, onRerollPolicy, onBuyFoodWithStardust, onBuyAlloy, onBuyFood }: ProductMarketProps) {
  const [quantities, setQuantities] = useState<Record<string, number>>({});
  const [messages, setMessages] = useState<Record<string, string>>({});
  const [msgTypes, setMsgTypes] = useState<Record<string, 'success' | 'error'>>({});
  const [relicMessage, setRelicMessage] = useState('');
  const [relicMsgType, setRelicMsgType] = useState<'success' | 'error'>('success');
  const [shopMessage, setShopMessage] = useState('');
  const [shopMsgType, setShopMsgType] = useState<'success' | 'error'>('success');
  const [stardustFoodQty, setStardustFoodQty] = useState('1');
  const [goldAlloyQty, setGoldAlloyQty] = useState('1');
  const [stardustAlloyQty, setStardustAlloyQty] = useState('1');
  const [alloyMessage, setAlloyMessage] = useState('');
  const [alloyMsgType, setAlloyMsgType] = useState<'success' | 'error'>('success');
  const [goldFoodQty, setGoldFoodQty] = useState('1');
  const [alloyFoodQty, setAlloyFoodQty] = useState('1');
  const [foodMessage, setFoodMessage] = useState('');
  const [foodMsgType, setFoodMsgType] = useState<'success' | 'error'>('success');

  // 解析数量（字符串 → 数字，非法/空返回 0）
  const goldAlloyQtyNum = parseInt(goldAlloyQty, 10) || 0;
  const stardustAlloyQtyNum = parseInt(stardustAlloyQty, 10) || 0;
  const goldFoodQtyNum = parseInt(goldFoodQty, 10) || 0;
  const alloyFoodQtyNum = parseInt(alloyFoodQty, 10) || 0;
  const stardustFoodQtyNum = parseInt(stardustFoodQty, 10) || 0;

  // 星尘加成二次确认（防误触）
  const [confirmBonus, setConfirmBonus] = useState<string | null>(null);
  const handleBonusClick = (key: string, action: () => void) => {
    if (confirmBonus === key) {
      setConfirmBonus(null);
      action();
    } else {
      setConfirmBonus(key);
      setTimeout(() => setConfirmBonus((cur) => (cur === key ? null : cur)), 3000);
    }
  };

  // 按productId分组合并
  const groups = useMemo<ProductGroup[]>(() => {
    const map = new Map<string, ProductGroup>();
    ship.products.forEach((item) => {
      const info = INITIAL_PRODUCTS.find((p) => p.id === item.productId);
      // productionTurns 唯一真值在 RECIPES（INITIAL_PRODUCTS 不再重复维护）
      const recipe = RECIPES.find((r) => r.id === item.productId);
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
          productionTurns: recipe?.productionTurns || 1,
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
      const cost = 1200 * goldAlloyQtyNum;
      if (ship.gold < cost) {
        setAlloyMessage(`金币不足（需要${cost.toLocaleString()}金币）`);
        setAlloyMsgType('error');
        setTimeout(() => setAlloyMessage(''), 3000);
        return;
      }
      onBuyAlloy('gold', goldAlloyQtyNum);
      setAlloyMessage(`花费${cost.toLocaleString()}金币购买了${goldAlloyQtyNum}个合金`);
      setAlloyMsgType('success');
    } else {
      if (ship.stardust < stardustAlloyQtyNum) {
        setAlloyMessage(`星尘不足（需要${stardustAlloyQtyNum}星尘）`);
        setAlloyMsgType('error');
        setTimeout(() => setAlloyMessage(''), 3000);
        return;
      }
      onBuyAlloy('stardust', stardustAlloyQtyNum);
      setAlloyMessage(`花费${stardustAlloyQtyNum}星尘购买了${stardustAlloyQtyNum * 5}个合金`);
      setAlloyMsgType('success');
    }
    setTimeout(() => setAlloyMessage(''), 3000);
  };

  const handleBuyFood = (type: 'gold' | 'alloy') => {
    if (!onBuyFood) return;
    if (type === 'gold') {
      const cost = 800 * goldFoodQtyNum;
      if (ship.gold < cost) {
        setFoodMessage(`金币不足（需要${cost.toLocaleString()}金币）`);
        setFoodMsgType('error');
        setTimeout(() => setFoodMessage(''), 3000);
        return;
      }
      onBuyFood('gold', goldFoodQtyNum);
      setFoodMessage(`花费${cost.toLocaleString()}金币购买了${goldFoodQtyNum}个食物`);
      setFoodMsgType('success');
    } else {
      if (ship.alloy < alloyFoodQtyNum) {
        setFoodMessage(`合金不足（需要${alloyFoodQtyNum}合金）`);
        setFoodMsgType('error');
        setTimeout(() => setFoodMessage(''), 3000);
        return;
      }
      onBuyFood('alloy', alloyFoodQtyNum);
      setFoodMessage(`花费${alloyFoodQtyNum}合金购买了${alloyFoodQtyNum * 2}个食物`);
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

  // 星尘商店通用消息处理
  const showShopMsg = (msg: string, type: 'success' | 'error') => {
    setShopMessage(msg);
    setShopMsgType(type);
    setTimeout(() => setShopMessage(''), 4000);
  };

  const handleBuyRandomMats = () => {
    if (!onBuyRandomMats) return;
    const res = onBuyRandomMats();
    showShopMsg(res.message, res.success ? 'success' : 'error');
  };

  const handleBuySellBonus = (turns: number, bonus: number, cost: number) => {
    if (!onBuySellBonus) return;
    const res = onBuySellBonus(turns, bonus, cost);
    showShopMsg(res.message, res.success ? 'success' : 'error');
  };

  const handleBuyGoldWithStardust = () => {
    if (!onBuyGoldWithStardust) return;
    const res = onBuyGoldWithStardust();
    showShopMsg(res.message, res.success ? 'success' : 'error');
  };

  const handleRerollPolicy = () => {
    if (!onRerollPolicy) return;
    const res = onRerollPolicy();
    showShopMsg(res.message, res.success ? 'success' : 'error');
  };

  const handleBuyFoodWithStardust = () => {
    if (!onBuyFoodWithStardust) return;
    if (ship.stardust < stardustFoodQtyNum) {
      showShopMsg(`星尘不足（需要${stardustFoodQtyNum}星尘）`, 'error');
      return;
    }
    const res = onBuyFoodWithStardust(stardustFoodQtyNum);
    showShopMsg(res.message, res.success ? 'success' : 'error');
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
              const isUrgent = group.earliestExpire - currentTurn <= 2;
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
                          <span className={`text-[10px] md:text-xs px-1.5 py-0.5 rounded font-bold ${TURN_COLORS[group.productionTurns] || 'bg-slate-800 text-slate-400'}`}>
                            {group.productionTurns}回合生产
                          </span>
                        </div>
                        <div className="flex items-center gap-2 md:gap-3 mt-1 text-[10px] md:text-xs">
                          <span className={isUrgent ? 'text-red-400 font-bold' : 'text-yellow-400'}>
                            {isUrgent ? '\u26a0 ' : ''}剩余 {Math.max(0, group.earliestExpire - currentTurn)} 回合过期
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
                type="text"
                inputMode="numeric"
                pattern="[0-9]*"
                value={goldAlloyQty}
                onChange={(e) => setGoldAlloyQty(e.target.value.replace(/[^0-9]/g, ''))}
                className="w-16 bg-slate-800 border border-slate-600 rounded-lg px-2 py-1.5 text-sm text-slate-200 text-center focus:outline-none focus:border-cyan-500"
              />
              <button
                onClick={() => handleBuyAlloy('gold')}
                disabled={goldAlloyQtyNum <= 0 || ship.gold < 1200 * goldAlloyQtyNum}
                className={`flex-1 py-2 rounded-lg text-sm font-bold transition-colors ${
                  goldAlloyQtyNum > 0 && ship.gold >= 1200 * goldAlloyQtyNum
                    ? 'bg-yellow-600 hover:bg-yellow-500 text-white'
                    : 'bg-slate-700 text-slate-500 cursor-not-allowed'
                }`}
              >
                金币购买
              </button>
            </div>
            <div className="flex justify-between text-xs text-slate-500">
              <span>花费: {(1200 * goldAlloyQtyNum).toLocaleString()}金币</span>
              <span>获得: {goldAlloyQtyNum}合金</span>
            </div>
          </div>

          {/* 星尘购买 */}
          <div className="bg-slate-800/60 border border-purple-700/40 rounded-xl p-4">
            <div className="flex items-center justify-between mb-2">
              <span className="text-sm text-purple-400 font-bold">1星尘 → 5合金</span>
            </div>
            <div className="flex items-center gap-2 mb-2">
              <input
                type="text"
                inputMode="numeric"
                pattern="[0-9]*"
                value={stardustAlloyQty}
                onChange={(e) => setStardustAlloyQty(e.target.value.replace(/[^0-9]/g, ''))}
                className="w-16 bg-slate-800 border border-slate-600 rounded-lg px-2 py-1.5 text-sm text-slate-200 text-center focus:outline-none focus:border-cyan-500"
              />
              <button
                onClick={() => handleBuyAlloy('stardust')}
                disabled={stardustAlloyQtyNum <= 0 || ship.stardust < stardustAlloyQtyNum}
                className={`flex-1 py-2 rounded-lg text-sm font-bold transition-colors ${
                  stardustAlloyQtyNum > 0 && ship.stardust >= stardustAlloyQtyNum
                    ? 'bg-purple-600 hover:bg-purple-500 text-white'
                    : 'bg-slate-700 text-slate-500 cursor-not-allowed'
                }`}
              >
                星尘购买
              </button>
            </div>
            <div className="flex justify-between text-xs text-slate-500">
              <span>花费: {stardustAlloyQtyNum}星尘</span>
              <span>获得: {stardustAlloyQtyNum * 5}合金</span>
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
        <p className="text-xs md:text-sm text-slate-400 mb-3">用资源换取食物。</p>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-3 mb-3">
          {/* 金币购买 */}
          <div className="bg-slate-800/60 border border-slate-700 rounded-xl p-4">
            <div className="flex items-center justify-between mb-2">
              <span className="text-sm text-yellow-400 font-bold">800金币 → 1食物</span>
            </div>
            <div className="flex items-center gap-2 mb-2">
              <input
                type="text"
                inputMode="numeric"
                pattern="[0-9]*"
                value={goldFoodQty}
                onChange={(e) => setGoldFoodQty(e.target.value.replace(/[^0-9]/g, ''))}
                className="w-16 bg-slate-800 border border-slate-600 rounded-lg px-2 py-1.5 text-sm text-slate-200 text-center focus:outline-none focus:border-green-500"
              />
              <button
                onClick={() => handleBuyFood('gold')}
                disabled={goldFoodQtyNum <= 0 || ship.gold < 800 * goldFoodQtyNum}
                className={`flex-1 py-1.5 rounded-lg text-xs font-bold transition-colors ${
                  goldFoodQtyNum > 0 && ship.gold >= 800 * goldFoodQtyNum
                    ? 'bg-yellow-600 hover:bg-yellow-500 text-white'
                    : 'bg-slate-700 text-slate-500 cursor-not-allowed'
                }`}
              >
                金币购买
              </button>
            </div>
            <div className="flex justify-between text-xs text-slate-500">
              <span>花费: {(800 * goldFoodQtyNum).toLocaleString()}金币</span>
              <span>获得: {goldFoodQtyNum}食物</span>
            </div>
          </div>

          {/* 合金购买 */}
          <div className="bg-slate-800/60 border border-slate-700 rounded-xl p-4">
            <div className="flex items-center justify-between mb-2">
              <span className="text-sm text-slate-300 font-bold">1合金 → 2食物</span>
            </div>
            <div className="flex items-center gap-2 mb-2">
              <input
                type="text"
                inputMode="numeric"
                pattern="[0-9]*"
                value={alloyFoodQty}
                onChange={(e) => setAlloyFoodQty(e.target.value.replace(/[^0-9]/g, ''))}
                className="w-16 bg-slate-800 border border-slate-600 rounded-lg px-2 py-1.5 text-sm text-slate-200 text-center focus:outline-none focus:border-green-500"
              />
              <button
                onClick={() => handleBuyFood('alloy')}
                disabled={alloyFoodQtyNum <= 0 || ship.alloy < alloyFoodQtyNum}
                className={`flex-1 py-1.5 rounded-lg text-xs font-bold transition-colors ${
                  alloyFoodQtyNum > 0 && ship.alloy >= alloyFoodQtyNum
                    ? 'bg-slate-600 hover:bg-slate-500 text-white'
                    : 'bg-slate-700 text-slate-500 cursor-not-allowed'
                }`}
              >
                合金购买
              </button>
            </div>
            <div className="flex justify-between text-xs text-slate-500">
              <span>花费: {alloyFoodQtyNum}合金</span>
              <span>获得: {alloyFoodQtyNum * 2}食物</span>
            </div>
          </div>

          {/* 星尘购买 */}
          <div className="bg-slate-800/60 border border-purple-700/40 rounded-xl p-4">
            <div className="flex items-center justify-between mb-2">
              <span className="text-sm text-purple-400 font-bold">1星尘 → 20食物</span>
            </div>
            <div className="flex items-center gap-2 mb-2">
              <input
                type="text"
                inputMode="numeric"
                pattern="[0-9]*"
                value={stardustFoodQty}
                onChange={(e) => setStardustFoodQty(e.target.value.replace(/[^0-9]/g, ''))}
                className="w-16 bg-slate-800 border border-slate-600 rounded-lg px-2 py-1.5 text-sm text-slate-200 text-center focus:outline-none focus:border-green-500"
              />
              <button
                onClick={handleBuyFoodWithStardust}
                disabled={stardustFoodQtyNum <= 0 || ship.stardust < stardustFoodQtyNum}
                className={`flex-1 py-1.5 rounded-lg text-xs font-bold transition-colors ${
                  stardustFoodQtyNum > 0 && ship.stardust >= stardustFoodQtyNum
                    ? 'bg-purple-600 hover:bg-purple-500 text-white'
                    : 'bg-slate-700 text-slate-500 cursor-not-allowed'
                }`}
              >
                星尘兑换
              </button>
            </div>
            <div className="flex justify-between text-xs text-slate-500">
              <span>花费: {stardustFoodQtyNum}星尘</span>
              <span>获得: {stardustFoodQtyNum * 20}食物</span>
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

        {/* 星尘商店消息 */}
        {shopMessage && (
          <div className={`mb-3 p-3 rounded-lg text-sm text-center ${
            shopMsgType === 'success'
              ? 'bg-green-900/20 border border-green-700/50 text-green-400'
              : 'bg-red-900/20 border border-red-700/50 text-red-400'
          }`}>
            {shopMessage}
          </div>
        )}

        {/* 星尘加成商店 */}
        <div className="mb-4">
          <h4 className="text-sm font-bold text-purple-400 mb-2 flex items-center gap-2">
            <Zap size={14} /> 星尘加成
          </h4>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
            {/* 随机10原料 */}
            <button
              onClick={() => handleBonusClick('randomMats', handleBuyRandomMats)}
              disabled={ship.stardust < 4}
              className={`text-left rounded-lg border p-2.5 transition-all ${
                confirmBonus === 'randomMats'
                  ? 'bg-amber-900/50 border-amber-500 cursor-pointer'
                  : ship.stardust >= 4
                    ? 'bg-slate-800/60 border-slate-700 hover:border-amber-500 cursor-pointer'
                    : 'bg-slate-800/30 border-slate-800 opacity-50 cursor-not-allowed'
              }`}
            >
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Package size={14} className="text-amber-400" />
                  <span className="text-xs text-slate-200 font-bold">{confirmBonus === 'randomMats' ? '再次点击确认购买' : '随机10个原料'}</span>
                </div>
                <span className="text-xs text-purple-400 font-bold">4星尘</span>
              </div>
            </button>

            {/* 售价+10% 5回合 */}
            <button
              onClick={() => handleBonusClick('bonus10', () => handleBuySellBonus(5, 10, 8))}
              disabled={ship.stardust < 8}
              className={`text-left rounded-lg border p-2.5 transition-all ${
                confirmBonus === 'bonus10'
                  ? 'bg-green-900/50 border-green-500 cursor-pointer'
                  : ship.stardust >= 8
                    ? 'bg-slate-800/60 border-slate-700 hover:border-green-500 cursor-pointer'
                    : 'bg-slate-800/30 border-slate-800 opacity-50 cursor-not-allowed'
              }`}
            >
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <TrendingUp size={14} className="text-green-400" />
                  <span className="text-xs text-slate-200 font-bold">{confirmBonus === 'bonus10' ? '再次点击确认购买' : '产品售价+10%'}</span>
                  <span className="text-[10px] text-slate-500">(5回合)</span>
                </div>
                <span className="text-xs text-purple-400 font-bold">8星尘</span>
              </div>
            </button>

            {/* 售价+25% 5回合 */}
            <button
              onClick={() => handleBonusClick('bonus25', () => handleBuySellBonus(5, 25, 15))}
              disabled={ship.stardust < 15}
              className={`text-left rounded-lg border p-2.5 transition-all ${
                confirmBonus === 'bonus25'
                  ? 'bg-emerald-900/50 border-emerald-500 cursor-pointer'
                  : ship.stardust >= 15
                    ? 'bg-slate-800/60 border-slate-700 hover:border-emerald-500 cursor-pointer'
                    : 'bg-slate-800/30 border-slate-800 opacity-50 cursor-not-allowed'
              }`}
            >
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <TrendingUp size={14} className="text-emerald-400" />
                  <span className="text-xs text-slate-200 font-bold">{confirmBonus === 'bonus25' ? '再次点击确认购买' : '产品售价+25%'}</span>
                  <span className="text-[10px] text-slate-500">(5回合)</span>
                </div>
                <span className="text-xs text-purple-400 font-bold">15星尘</span>
              </div>
            </button>

            {/* 兑换5000金币 */}
            <button
              onClick={() => handleBonusClick('gold5000', handleBuyGoldWithStardust)}
              disabled={ship.stardust < 2}
              className={`text-left rounded-lg border p-2.5 transition-all ${
                confirmBonus === 'gold5000'
                  ? 'bg-yellow-900/50 border-yellow-500 cursor-pointer'
                  : ship.stardust >= 2
                    ? 'bg-slate-800/60 border-slate-700 hover:border-yellow-500 cursor-pointer'
                    : 'bg-slate-800/30 border-slate-800 opacity-50 cursor-not-allowed'
              }`}
            >
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Coins size={14} className="text-yellow-400" />
                  <span className="text-xs text-slate-200 font-bold">{confirmBonus === 'gold5000' ? '再次点击确认购买' : '兑换5000金币'}</span>
                </div>
                <span className="text-xs text-purple-400 font-bold">2星尘</span>
              </div>
            </button>

            {/* 强制刷新贸易政策 */}
            <button
              onClick={() => handleBonusClick('rerollPolicy', handleRerollPolicy)}
              disabled={ship.stardust < 15}
              className={`text-left rounded-lg border p-2.5 transition-all md:col-span-2 ${
                confirmBonus === 'rerollPolicy'
                  ? 'bg-blue-900/50 border-blue-500 cursor-pointer'
                  : ship.stardust >= 15
                    ? 'bg-slate-800/60 border-slate-700 hover:border-blue-500 cursor-pointer'
                    : 'bg-slate-800/30 border-slate-800 opacity-50 cursor-not-allowed'
              }`}
            >
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <RefreshCw size={14} className="text-blue-400" />
                  <span className="text-xs text-slate-200 font-bold">{confirmBonus === 'rerollPolicy' ? '再次点击确认购买' : '强制刷新贸易政策'}</span>
                  <span className="text-[10px] text-slate-500">(立即生效)</span>
                </div>
                <span className="text-xs text-purple-400 font-bold">15星尘</span>
              </div>
            </button>
          </div>
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


export default memo(ProductMarket);
