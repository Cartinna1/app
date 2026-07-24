import { useState, useMemo } from 'react';
import type { Mothership, RawMaterial } from '@/types/game';
import { RECIPES } from '@/data/gameData';
import { Factory, Check, AlertCircle, Clock, Wheat } from 'lucide-react';

interface ProductionPanelProps {
  ship: Mothership;
  shipIndex: number;
  materials: RawMaterial[];
  onStartProduction: (shipIndex: number, recipeId: string) => string | null;
}

export default function ProductionPanel({ ship, shipIndex, materials: _materials, onStartProduction }: ProductionPanelProps) {
  void _materials;
  const [messages, setMessages] = useState<Record<string, string>>({});
  const [filterTurn, setFilterTurn] = useState<number>(1);

  const matNames: Record<string, string> = {
    carbon: '碳块',
    gold_ore: '黄金',
    oil: '石油',
    dark_matter: '暗物质',
    silicon: '硅片',
    quantum: '量子簇',
  };

  const canProduce = (recipe: typeof RECIPES[0]) => {
    return recipe.inputs.every((input) => {
      const have = ship.materials[input.materialId] || 0;
      return have >= input.amount;
    });
  };

  // 按回合筛选 + 可生产性排序
  const filteredRecipes = useMemo(() => {
    let list = [...RECIPES];
    list = list.filter((r) => r.productionTurns === filterTurn);
    list.sort((a, b) => {
      const aOk = canProduce(a);
      const bOk = canProduce(b);
      if (aOk && !bOk) return -1;
      if (!aOk && bOk) return 1;
      return 0;
    });
    return list;
  }, [filterTurn]);

  const turnTabs = [
    { value: 1 as const, label: '1回合' },
    { value: 2 as const, label: '2回合' },
    { value: 3 as const, label: '3回合' },
  ];

  const handleProduce = (recipe: typeof RECIPES[0]) => {
    const result = onStartProduction(shipIndex, recipe.id);
    if (result) {
      setMessages({ ...messages, [recipe.id]: result });
    } else {
      setMessages({ ...messages, [recipe.id]: `开始生产 ${recipe.productName}` });
    }
    setTimeout(() => {
      setMessages((prev) => ({ ...prev, [recipe.id]: '' }));
    }, 3000);
  };

  const turns = (recipe: typeof RECIPES[0]) => {
    return Math.max(0, recipe.productionTurns - ship.productionSpeedBonus);
  };

  return (
    <div>
      <h2 className="text-xl md:text-2xl font-bold text-white mb-3 md:mb-4">生产中心</h2>
      <p className="text-xs md:text-sm text-slate-400 mb-2">使用原料生产高价值产品，在星际集会出售赚取金币。</p>
      <div className="flex items-center gap-2 md:gap-4 mb-3 md:mb-4 text-sm">
        <div className="text-sm">
          <span className="text-slate-400">本回合生产: </span>
          <span className={`font-bold ${ship.productionsThisTurn >= ship.maxProductionsPerTurn ? 'text-red-400' : 'text-cyan-400'}`}>
            {ship.productionsThisTurn} / {ship.maxProductionsPerTurn}
          </span>
          <span className="text-slate-500 ml-1">次</span>
        </div>
        {((ship.sellBonuses || []).length > 0 || (ship.sellPriceBonus || 0) > 0) && (
          <div className="text-sm flex flex-wrap gap-2">
            <span className="text-slate-400">产品售价加成:</span>
            {(ship.sellPriceBonus || 0) > 0 && (
              <span className="font-bold text-cyan-400">
                +{Math.round(ship.sellPriceBonus * 100)}%<span className="text-slate-500 font-normal">(技能)</span>
              </span>
            )}
            {(ship.sellBonuses || []).map((b, i) => (
              <span key={i} className={`font-bold ${b.bonus > 0 ? 'text-green-400' : 'text-red-400'}`}>
                {b.bonus > 0 ? '+' : ''}{b.bonus}%<span className="text-slate-500 font-normal">({b.remainingTurns}回)</span>
              </span>
            ))}
          </div>
        )}
        {ship.productionSpeedBonus > 0 && (
          <span className="text-sm text-purple-400">跃迁者: 生产回合-{ship.productionSpeedBonus}</span>
        )}
      </div>
      {ship.productionsThisTurn >= ship.maxProductionsPerTurn && (
        <p className="text-sm text-red-400 mb-4">⚠ 本回合生产次数已用完，结束回合后可继续生产</p>
      )}

      {/* 生产队列 */}
      {ship.productionQueue.length > 0 && (
        <div className="mb-6">
          <h3 className="text-lg font-bold text-slate-200 mb-3">
            <Factory size={18} className="inline mr-2" />
            生产队列 ({ship.productionQueue.length}项)
          </h3>
          <div className="space-y-2">
            {ship.productionQueue.map((task) => {
              const recipe = RECIPES.find((r) => r.id === task.productId);
              if (!recipe) return null;
              return (
                <div key={task.id} className="bg-slate-900/60 border border-slate-700 rounded-lg px-4 py-3 flex items-center justify-between">
                  <div>
                    <span className="font-bold text-slate-200">{recipe.productName}</span>
                    <span className="text-slate-500 text-sm ml-2">{recipe.description}</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <Clock size={14} className="text-yellow-400" />
                    <span className="text-yellow-400 font-bold">{task.remainingTurns} 回合</span>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* 配方列表 */}
      <h3 className="text-lg font-bold text-slate-200 mb-3">
        <Check size={18} className="inline mr-2" />
        生产配方
        <span className="text-sm text-slate-500 font-normal ml-2">(原料充足的显示在前面)</span>
      </h3>

      {/* 回合筛选标签 */}
      <div className="flex gap-1.5 mb-4">
        {turnTabs.map((tab) => (
          <button
            key={String(tab.value)}
            onClick={() => setFilterTurn(tab.value)}
            className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all ${
              filterTurn === tab.value
                ? 'bg-cyan-600 text-white'
                : 'bg-slate-800/60 text-slate-400 hover:bg-slate-700 hover:text-slate-200'
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-3 md:gap-4">
        {filteredRecipes.map((recipe) => {
          const ok = canProduce(recipe);
          const msg = messages[recipe.id] || '';
          const t = turns(recipe);
          const isFood = !!recipe.foodYield;

          return (
            <div
              key={recipe.id}
              className={`bg-slate-900/60 border rounded-xl p-3 md:p-4 transition-all ${
                isFood
                  ? ok ? 'border-amber-700/50' : 'border-slate-800 opacity-60'
                  : ok ? 'border-green-700/40' : 'border-slate-800 opacity-60'
              }`}
            >
              <div className="flex items-center justify-between mb-2">
                <div className="flex items-center gap-2">
                  {isFood && <Wheat size={16} className="text-amber-400" />}
                  <h4 className={`font-bold ${isFood ? 'text-amber-300' : 'text-slate-100'}`}>{recipe.productName}</h4>
                  {ok && (
                    <span className={`text-[10px] px-1.5 py-0.5 rounded border ${
                      isFood ? 'bg-amber-900/30 text-amber-400 border-amber-700/30' : 'bg-green-900/30 text-green-400 border-green-700/30'
                    }`}>
                      可生产
                    </span>
                  )}
                  <span className={`text-[10px] px-1.5 py-0.5 rounded font-bold ${
                    recipe.productionTurns === 1 ? 'bg-green-900/30 text-green-400' :
                    recipe.productionTurns === 2 ? 'bg-yellow-900/30 text-yellow-400' :
                    'bg-red-900/30 text-red-400'
                  }`}>
                    {recipe.productionTurns}回合
                  </span>
                </div>
                <div className="flex items-center gap-1 text-sm text-slate-400">
                  <Clock size={14} />
                  <span>{t <= 0 ? '立即' : `${t}回合`}</span>
                  {ship.productionSpeedBonus > 0 && recipe.productionTurns > 1 && (
                    <span className="text-[10px] text-purple-400">(原{recipe.productionTurns})</span>
                  )}
                </div>
              </div>
              <p className="text-xs text-slate-500 mb-3">{recipe.description}</p>

              {isFood && (
                <div className="mb-3">
                  <span className="text-xs text-amber-400 font-bold bg-amber-900/20 border border-amber-700/30 rounded px-2 py-1">
                    <Wheat size={12} className="inline mr-1" />产出: {recipe.foodYield} 食物
                  </span>
                </div>
              )}

              <div className="mb-3">
                <p className="text-xs text-slate-500 mb-1">所需原料:</p>
                <div className="flex flex-wrap gap-2">
                  {recipe.inputs.map((input) => {
                    const have = ship.materials[input.materialId] || 0;
                    const enough = have >= input.amount;
                    return (
                      <span
                        key={input.materialId}
                        className={`text-xs px-2 py-1 rounded ${
                          enough ? 'bg-green-900/30 text-green-400' : 'bg-red-900/30 text-red-400'
                        }`}
                      >
                        {matNames[input.materialId]} x{input.amount}
                        <span className="text-slate-500 ml-1">(有{have})</span>
                      </span>
                    );
                  })}
                </div>
              </div>

              {!ok && (
                <div className="flex items-center gap-1 text-xs text-red-400 mb-2">
                  <AlertCircle size={12} />
                  <span>原料不足</span>
                </div>
              )}

              <button
                onClick={() => handleProduce(recipe)}
                disabled={!ok}
                className={`w-full py-2 rounded-lg font-bold text-white text-sm transition-colors ${
                  isFood
                    ? 'bg-amber-700 hover:bg-amber-600 disabled:bg-slate-700 disabled:text-slate-500'
                    : 'bg-indigo-600 hover:bg-indigo-500 disabled:bg-slate-700 disabled:text-slate-500'
                }`}
              >
                {t <= 0 ? '立即生产' : '开始生产'}
              </button>

              {msg && (
                <p className={`mt-2 text-xs text-center ${msg.includes('开始') || msg.includes('立即') ? 'text-cyan-400' : 'text-red-400'}`}>
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
