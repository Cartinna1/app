import { useState } from 'react';
import type { Mothership } from '@/types/game';
import { MODULE_DEFINITIONS, canAffordModule, isModuleInstalled } from '@/data/modules';
import { Wrench, Check, X, Clock, Zap, Sparkles } from 'lucide-react';

interface ModulePanelProps {
  ship: Mothership;
  onInstallModule: (moduleId: string) => { success: boolean; message: string };
  onUseManualModule: (moduleId: string) => { success: boolean; message: string };
}

export default function ModulePanel({ ship, onInstallModule, onUseManualModule }: ModulePanelProps) {
  const [message, setMessage] = useState('');
  const [messageType, setMessageType] = useState<'success' | 'error'>('success');

  const handleInstall = (moduleId: string) => {
    const result = onInstallModule(moduleId);
    setMessage(result.message);
    setMessageType(result.success ? 'success' : 'error');
    setTimeout(() => setMessage(''), 5000);
  };

  const handleUse = (moduleId: string) => {
    try {
      const result = onUseManualModule(moduleId);
      if (!result) {
        setMessage('操作失败：无返回结果');
        setMessageType('error');
        return;
      }
      setMessage(result.message || '操作完成');
      setMessageType(result.success ? 'success' : 'error');
    } catch (err) {
      const msg = err instanceof Error ? err.message : '未知错误';
      setMessage(`操作失败: ${msg}`);
      setMessageType('error');
    }
    setTimeout(() => setMessage(''), 5000);
  };

  const getEffectIcon = (type: string) => {
    switch (type) {
      case 'per_turn': return <Zap size={14} className="text-yellow-400" />;
      case 'passive': return <Sparkles size={14} className="text-cyan-400" />;
      case 'manual': return <Clock size={14} className="text-orange-400" />;
      default: return null;
    }
  };

  const getEffectLabel = (type: string) => {
    switch (type) {
      case 'per_turn': return '每回合';
      case 'passive': return '被动';
      case 'manual': return '操作';
      default: return '';
    }
  };

  return (
    <div>
      <h2 className="text-xl md:text-2xl font-bold text-white mb-3 md:mb-4 flex items-center gap-2">
        <Wrench size={22} className="text-cyan-400" />
        母舰改造
      </h2>
      <p className="text-xs md:text-sm text-slate-400 mb-3 md:mb-4">
        花费资源安装装置来强化你的母舰。每种装置只能安装一次。
      </p>

      {/* 资源显示 */}
      <div className="grid grid-cols-3 gap-2 md:gap-4 mb-4 md:mb-6">
        <div className="bg-slate-900/60 border border-amber-700/30 rounded-xl p-3 text-center">
          <p className="text-[10px] text-amber-400 mb-1">食物</p>
          <p className="text-lg md:text-xl font-bold text-amber-300">{ship.food}</p>
        </div>
        <div className="bg-slate-900/60 border border-slate-600/30 rounded-xl p-3 text-center">
          <p className="text-[10px] text-slate-400 mb-1">合金</p>
          <p className="text-lg md:text-xl font-bold text-slate-300">{ship.alloy}</p>
        </div>
        <div className="bg-slate-900/60 border border-purple-700/30 rounded-xl p-3 text-center">
          <p className="text-[10px] text-purple-400 mb-1">星尘</p>
          <p className="text-lg md:text-xl font-bold text-purple-300">{ship.stardust}</p>
        </div>
      </div>

      {/* 已安装装置 */}
      {ship.modules.length > 0 && (
        <div className="mb-4 md:mb-6">
          <h3 className="text-sm font-bold text-slate-300 mb-2">已安装 ({ship.modules.length}/12)</h3>
          <div className="space-y-2">
            {ship.modules.map((mod) => {
              const def = MODULE_DEFINITIONS.find((d) => d.id === mod.id);
              if (!def) return null;
              const onCooldown = mod.cooldown > 0;
              return (
                <div key={mod.id} className="bg-slate-800/60 border border-green-700/30 rounded-lg p-3 flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    {getEffectIcon(def.effectType)}
                    <div>
                      <span className="text-sm font-bold text-slate-200">{def.name}</span>
                      <span className="text-[10px] text-green-400 ml-2">已安装</span>
                      <p className="text-[10px] text-slate-400">{def.effectDescription}</p>
                    </div>
                  </div>
                  {def.effectType === 'manual' && (
                    (() => {
                      // 检查资源是否足够
                      let canUse = !onCooldown;
                      let reason = '';
                      if (canUse) {
                        const mats = ship.materials || {};
                        if (mod.id === 'alloy_furnace') {
                          const totalMats = Object.values(mats).reduce((sum, v) => sum + (v || 0), 0);
                          if (totalMats < 5) { canUse = false; reason = '原料不足(需5)'; }
                        } else if (mod.id === 'micro_alloy_furnace') {
                          if ((mats.carbon || 0) < 2 || (mats.oil || 0) < 2) { canUse = false; reason = '需2碳+2油'; }
                        } else if (mod.id === 'mega_alloy_furnace') {
                          const totalMats = Object.values(mats).reduce((sum, v) => sum + (v || 0), 0);
                          if (totalMats < 10) { canUse = false; reason = '原料不足(需10)'; }
                        } else if (mod.id === 'stardust_pool') {
                          if (ship.alloy < 60) { canUse = false; reason = '合金不足'; }
                        } else if (mod.id === 'quantum_reactor') {
                          if (ship.food < 300) { canUse = false; reason = '食物不足(需300)'; }
                        } else if (mod.id === 'void_replicator') {
                          if (ship.stardust < 30) { canUse = false; reason = '星尘不足'; }
                        }
                      }
                      return (
                        <button
                          onClick={() => canUse && handleUse(mod.id)}
                          disabled={!canUse}
                          className={`px-3 py-1.5 rounded text-xs font-bold transition-colors ${
                            onCooldown
                              ? 'bg-slate-700 text-slate-500 cursor-not-allowed'
                              : canUse
                                ? 'bg-orange-600 hover:bg-orange-500 text-white'
                                : 'bg-red-900/40 text-red-400 cursor-not-allowed'
                          }`}
                        >
                          {onCooldown ? `冷却 ${mod.cooldown} 回合` : canUse ? '使用' : reason || '资源不足'}
                        </button>
                      );
                    })()
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* 可用装置列表 */}
      <h3 className="text-sm font-bold text-slate-300 mb-2">可用装置</h3>
      <div className="space-y-2 md:space-y-3">
        {MODULE_DEFINITIONS
          .filter((def) => !isModuleInstalled(ship, def.id))
          .sort((a, b) => {
            const affordA = canAffordModule(ship, a);
            const affordB = canAffordModule(ship, b);
            if (affordA && !affordB) return -1;
            if (!affordA && affordB) return 1;
            return 0;
          })
          .map((def) => {
          const affordable = canAffordModule(ship, def);

          return (
            <div key={def.id} className={`bg-slate-900/60 border rounded-xl p-3 md:p-4 ${affordable ? 'border-slate-700' : 'border-slate-800 opacity-50'}`}>
              <div className="flex items-start justify-between mb-2">
                <div className="flex items-center gap-2">
                  {getEffectIcon(def.effectType)}
                  <h4 className="font-bold text-slate-100 text-sm md:text-base">{def.name}</h4>
                  <span className="text-[10px] px-1.5 py-0.5 rounded bg-slate-800 text-slate-400">{getEffectLabel(def.effectType)}</span>
                </div>
              </div>
              <p className="text-xs text-slate-400 mb-2">{def.description}</p>

              {/* 消耗 */}
              <div className="flex flex-wrap gap-2 mb-3">
                {def.costFood > 0 && <span className="text-[10px] bg-amber-900/30 text-amber-400 px-2 py-0.5 rounded">食物 {def.costFood}</span>}
                {def.costAlloy > 0 && <span className="text-[10px] bg-slate-700/50 text-slate-300 px-2 py-0.5 rounded">合金 {def.costAlloy}</span>}
                {def.costStardust > 0 && <span className="text-[10px] bg-purple-900/30 text-purple-400 px-2 py-0.5 rounded">星尘 {def.costStardust}</span>}
                {def.costGold && def.costGold > 0 && <span className="text-[10px] bg-yellow-900/30 text-yellow-400 px-2 py-0.5 rounded">金币 {def.costGold}</span>}
                {def.costMaterials && Object.entries(def.costMaterials).map(([matId, cost]) => (
                  <span key={matId} className="text-[10px] bg-blue-900/30 text-blue-400 px-2 py-0.5 rounded">
                    {matId === 'dark_matter' ? '暗物质' : matId === 'carbon' ? '碳块' : matId === 'gold_ore' ? '黄金矿石' : matId === 'oil' ? '石油' : matId === 'silicon' ? '硅晶体' : matId === 'quantum' ? '量子晶体' : matId} {cost}
                  </span>
                ))}
              </div>

              <button
                onClick={() => handleInstall(def.id)}
                disabled={!affordable}
                className={`w-full py-2 rounded-lg text-sm font-bold transition-colors flex items-center justify-center gap-1 ${
                  affordable
                    ? 'bg-cyan-600 hover:bg-cyan-500 text-white'
                    : 'bg-slate-800 text-slate-500 cursor-not-allowed'
                }`}
              >
                {affordable ? (
                  <><Check size={14} /> 安装</>
                ) : (
                  <><X size={14} /> 资源不足</>
                )}
              </button>
            </div>
          );
        })}
      </div>

      {message && (
        <div className={`mt-4 p-3 rounded-lg text-sm text-center ${messageType === 'success' ? 'bg-green-900/20 text-green-400' : 'bg-red-900/20 text-red-400'}`}>
          {message}
        </div>
      )}
    </div>
  );
}
