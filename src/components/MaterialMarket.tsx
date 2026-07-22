import { useState } from 'react';
import type { RawMaterial, Mothership } from '@/types/game';
import { Package, TrendingUp, TrendingDown, Warehouse } from 'lucide-react';

interface MaterialMarketProps {
  materials: RawMaterial[];
  ship: Mothership;
  shipIndex: number;
  onBuy: (shipIndex: number, matId: string, qty: number) => string | null;
}

export default function MaterialMarket({ materials, ship, shipIndex, onBuy }: MaterialMarketProps) {
  const [quantities, setQuantities] = useState<Record<string, number>>({});
  const [messages, setMessages] = useState<Record<string, string>>({});

  const getQty = (matId: string) => quantities[matId] || 1;

  const handleBuy = (mat: RawMaterial) => {
    const qty = getQty(mat.id);
    const result = onBuy(shipIndex, mat.id, qty);
    if (result) {
      setMessages({ ...messages, [mat.id]: result });
    } else {
      const discount = ship.materialPriceDiscount + (ship.relics.some((r) => r.id === '100004' || r.id === 'r_004') ? 0.1 : 0);
      const cost = Math.round(mat.currentPrice * qty * (1 - discount));
      setMessages({ ...messages, [mat.id]: `成功购买 ${qty} 单位${mat.name}，花费 ${cost} 金币` });
    }
    setTimeout(() => {
      setMessages((prev) => ({ ...prev, [mat.id]: '' }));
    }, 3000);
  };

  const totalInventory = Object.values(ship.materials).reduce((a, b) => a + b, 0);

  return (
    <div>
      <h2 className="text-2xl font-bold text-white mb-4">星际原料市场</h2>
      <p className="text-sm text-slate-400 mb-2">购买原料用于生产高价值产品。每回合价格波动，注意时机。</p>
      {(() => {
        const totalDiscount = ship.materialPriceDiscount + (ship.relics.some((r) => r.id === '100004' || r.id === 'r_004') ? 0.1 : 0);
        return totalDiscount > 0 ? (
          <div className="mb-4 bg-cyan-900/20 border border-cyan-700/50 rounded-lg px-4 py-2 text-sm text-cyan-400">
            原料购买折扣: {Math.round(totalDiscount * 100)}%
            {ship.materialPriceDiscount > 0 && ' (技能)'}
            {ship.relics.some((r) => r.id === '100004' || r.id === 'r_004') && ' + 星际罗盘10%'}
          </div>
        ) : null;
      })()}

      {/* ===== 自有原料库存模块 ===== */}
      <div className="mb-4 md:mb-6 bg-slate-900/60 border border-slate-700 rounded-xl p-3 md:p-4">
        <h3 className="text-sm font-bold text-slate-300 mb-2 md:mb-3 flex items-center gap-2">
          <Warehouse size={16} className="text-amber-400" />
          我的原料仓库
          <span className="text-slate-500 font-normal">（共 {totalInventory} 单位）</span>
        </h3>
        <div className="grid grid-cols-3 md:grid-cols-6 gap-2 md:gap-3">
          {materials.map((mat) => {
            const qty = ship.materials[mat.id] || 0;
            return (
              <div
                key={mat.id}
                className={`rounded-lg p-2.5 text-center border ${
                  qty > 0
                    ? 'bg-slate-800 border-slate-600'
                    : 'bg-slate-900/40 border-slate-800 opacity-50'
                }`}
              >
                <div className="text-xs text-slate-400 mb-1">{mat.name}</div>
                <div className={`text-lg font-bold ${qty > 0 ? 'text-yellow-400' : 'text-slate-600'}`}>
                  {qty}
                </div>
                <div className="text-[10px] text-slate-500">{mat.currentPrice}金币/单位</div>
              </div>
            );
          })}
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 md:gap-4">
        {materials.map((mat) => {
          // 涨跌百分比对比基准价（每回合价格独立，上一回合无参考意义）
          const change = ((mat.currentPrice - mat.basePrice) / mat.basePrice) * 100;
          const inventory = ship.materials[mat.id] || 0;
          const discount = ship.materialPriceDiscount + (ship.relics.some((r) => r.id === '100004' || r.id === 'r_004') ? 0.1 : 0);
          const unitCost = Math.round(mat.currentPrice * (1 - discount));
          const totalCost = unitCost * getQty(mat.id);
          const msg = messages[mat.id] || '';

          return (
            <div key={mat.id} className="bg-slate-900/60 border border-slate-700 rounded-xl p-3 md:p-4">
              <div className="flex items-center justify-between mb-2 md:mb-3">
                <div className="flex items-center gap-2">
                  <Package size={16} className="text-cyan-400" />
                  <h3 className="font-bold text-slate-100 text-sm md:text-base">{mat.name}</h3>
                </div>
                <div className={`flex items-center gap-1 text-xs md:text-sm ${change >= 0 ? 'text-cyan-400' : 'text-red-400'}`}>
                  {change >= 0 ? <TrendingUp size={14} /> : <TrendingDown size={14} />}
                  {change >= 0 ? '+' : ''}
                  {change.toFixed(1)}%
                </div>
              </div>

              <div className="text-xl md:text-2xl font-bold text-cyan-400 mb-1">
                {mat.currentPrice} <span className="text-xs md:text-sm text-slate-500">金币/单位</span>
              </div>
              {discount > 0 && (
                <div className="text-xs text-green-400 mb-2">折扣价: {unitCost} 金币/单位</div>
              )}

              <div className="text-sm text-slate-400 mb-2">
                库存: <span className="text-yellow-400 font-bold">{inventory}</span> 单位
              </div>

              <div className="flex items-center gap-2 mb-3">
                <input
                  type="text"
                  inputMode="numeric"
                  pattern="[0-9]*"
                  value={getQty(mat.id) || ''}
                  onChange={(e) => {
                    const v = e.target.value.replace(/[^0-9]/g, '');
                    setQuantities({ ...quantities, [mat.id]: v === '' ? 0 : parseInt(v) });
                  }}
                  className="flex-1 bg-slate-800 border border-slate-600 rounded-lg px-3 py-2 text-sm text-slate-200 focus:outline-none focus:border-cyan-500"
                />
                <button
                  onClick={() => handleBuy(mat)}
                  disabled={ship.gold < totalCost}
                  className="px-4 py-2 bg-cyan-600 hover:bg-cyan-500 disabled:bg-slate-700 disabled:text-slate-500 rounded-lg font-bold text-white text-sm transition-colors"
                >
                  购买
                </button>
              </div>

              <div className="text-xs text-slate-500">
                合计: {totalCost.toLocaleString()} 金币
              </div>

              {msg && (
                <p className={`mt-2 text-xs text-center ${msg.includes('成功') ? 'text-cyan-400' : 'text-red-400'}`}>
                  {msg}
                </p>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
