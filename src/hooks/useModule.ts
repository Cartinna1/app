import { useCallback } from 'react';
import type { GameState } from '@/types/game';
import { getModuleDef, isModuleInstalled, canAffordModule, MODULE_STARDUST_POOL, MODULE_QUANTUM_REACTOR, MODULE_VOID_REPLICATOR } from '@/data/modules';
import { GOLD_LOG_LIMIT } from '@/data/gameData';
import { firstMissing, payCost } from '@/lib/turn/resourceCost';
import { famineHalveGold } from '@/lib/turn/shipTurn';

export function useModule(
  dispatch: React.Dispatch<{ type: 'FUNCTIONAL_UPDATE'; updater: (state: GameState) => GameState }>
) {
  // 安装装置
  const installModule = useCallback(
    (shipIndex: number, moduleId: string): { success: boolean; message: string } => {
      let result: { success: boolean; message: string } = { success: false, message: '' };
      dispatch({
        type: 'FUNCTIONAL_UPDATE',
        updater: (prev) => {
          const ships = [...prev.ships];
          const s = { ...ships[shipIndex] };
          const def = getModuleDef(moduleId);
          if (!def) { result = { success: false, message: '装置不存在' }; return prev; }
          if (isModuleInstalled(s, moduleId)) { result = { success: false, message: '该装置已安装' }; return prev; }
          if (!canAffordModule(s, def)) { result = { success: false, message: '资源不足' }; return prev; }

          s.food -= def.costFood;
          s.alloy -= def.costAlloy;
          s.stardust -= def.costStardust;
          if (def.costGold) s.gold -= def.costGold;
          if (def.costMaterials) {
            s.materials = { ...s.materials };
            for (const [matId, cost] of Object.entries(def.costMaterials)) {
              s.materials[matId] = (s.materials[matId] || 0) - cost;
            }
          }
          s.modules = [...s.modules, { id: moduleId, name: def.name, installedTurn: prev.turn, cooldown: 0, active: true }];
          s.installedModuleIds = [...s.installedModuleIds, moduleId];

          result = { success: true, message: `「${def.name}」安装成功！${def.effectDescription}` };
          ships[shipIndex] = s;
          return { ...prev, ships };
        },
      });
      return result;
    },
    [dispatch]
  );

  // 使用手动操作型装置
  const useManualModule = useCallback(
    (shipIndex: number, moduleId: string): { success: boolean; message: string } => {
      let result: { success: boolean; message: string } = { success: false, message: '' };
      dispatch({
        type: 'FUNCTIONAL_UPDATE',
        updater: (prev) => {
          try {
            const ships = [...prev.ships];
            if (!ships[shipIndex]) { result = { success: false, message: '飞船不存在' }; return prev; }
            const s = { ...ships[shipIndex] };
            // 防御性初始化：确保 materials 和 relics 存在
            if (!s.materials) s.materials = {};
            if (!s.relics) s.relics = [];
            if (!s.modules) s.modules = [];

            const moduleIdx = s.modules.findIndex((m) => m.id === moduleId);
            if (moduleIdx === -1) { result = { success: false, message: '装置未安装' }; return prev; }
            const mod = { ...s.modules[moduleIdx] };
            if (mod.cooldown > 0) { result = { success: false, message: `冷却中，还剩 ${mod.cooldown} 回合` }; return prev; }

            const def = getModuleDef(moduleId);
            if (!def) { result = { success: false, message: '装置定义不存在' }; return prev; }

          // 手动装置的消耗/产出都读装置数据（ModuleDefinition.manualCost / manualGain，唯一真值），
          // 校验与扣减复用 lib/turn/resourceCost（与远征、考古同口径）。历史上 500/50/30/30000 在
          // hook、ModulePanel 与 effectDescription 各写一份 → 改价时三处不同步。
          const manualCost = def.manualCost || {};
          const missing = firstMissing(s, s.colony, manualCost);
          if (missing) { result = { success: false, message: missing }; return prev; }
          payCost(s, s.colony, manualCost);

          // 处理各手动装置的专有效果
          switch (moduleId) {
            case MODULE_STARDUST_POOL: {
              const gain = def.manualGain?.stardust || 0;
              s.stardust += gain;
              mod.cooldown = def.cooldown;
              result = { success: true, message: `消耗 ${manualCost.alloy} 合金，转化为 ${gain} 星尘` };
              break;
            }
            case MODULE_QUANTUM_REACTOR: {
              const raw = def.manualGain?.gold || 0;
              // 与其它金币收益同口径：饥荒（食物<0）时减半（历史上这里漏了 famineHalveGold）
              const gain = famineHalveGold(s.food, raw);
              s.gold += gain;
              if (s.bankrupt && s.gold > 0) s.bankrupt = false;
              s.goldLog = [{ turn: prev.turn, amount: gain, reason: '量子生物反应器转化', balanceAfter: s.gold }, ...s.goldLog].slice(0, GOLD_LOG_LIMIT);
              mod.cooldown = def.cooldown;
              result = { success: true, message: gain < raw ? `消耗 ${manualCost.food} 食物，转化为 ${gain} 金币（饥荒减半）` : `消耗 ${manualCost.food} 食物，转化为 ${gain} 金币！` };
              break;
            }
            case MODULE_VOID_REPLICATOR: {
              const newMaterials: Record<string, number> = {};
              Object.entries(s.materials).forEach(([k, v]) => { if (v > 0) newMaterials[k] = v * 2; });
              s.materials = newMaterials;
              s.products = [...s.products, ...s.products.map((p) => ({ ...p, expiresAt: p.expiresAt + 1 }))];
              mod.cooldown = def.cooldown;
              result = { success: true, message: '虚空复制器启动！所有产品和原料数量翻倍' };
              break;
            }
            default:
              result = { success: false, message: '该装置不需要手动操作' };
              return prev;
          }

          s.modules = [...s.modules];
          s.modules[moduleIdx] = mod;
          ships[shipIndex] = s;
          return { ...prev, ships };
          } catch (err) {
            const errorMsg = err instanceof Error ? err.message : '未知错误';
            result = { success: false, message: `操作失败: ${errorMsg}` };
            return prev;
          }
        },
      });
      return result;
    },
    [dispatch]
  );

  return { installModule, useManualModule };
}
