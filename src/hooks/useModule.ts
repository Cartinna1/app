import { useCallback } from 'react';
import type { GameState } from '@/types/game';
import { getModuleDef, isModuleInstalled, canAffordModule } from '@/data/modules';

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

          // 处理各手动装置的具体逻辑
          switch (moduleId) {
            case 'stardust_pool': {
              if (s.alloy < 500) { result = { success: false, message: '需要 500 合金' }; return prev; }
              s.alloy -= 500;
              s.stardust += 10;
              mod.cooldown = def.cooldown;
              result = { success: true, message: '消耗 500 合金，转化为 10 星尘' };
              break;
            }
            case 'quantum_reactor': {
              if (s.food < 50) { result = { success: false, message: '需要 50 食物' }; return prev; }
              s.food -= 50;
              s.gold += 30000;
              if (s.bankrupt && s.gold > 0) s.bankrupt = false;
              s.goldLog = [{ turn: prev.turn, amount: 30000, reason: '量子生物反应器转化', balanceAfter: s.gold }, ...s.goldLog].slice(0, 200);
              mod.cooldown = def.cooldown;
              result = { success: true, message: '消耗 50 食物，转化为 30000 金币！' };
              break;
            }
            case 'void_replicator': {
              if (s.stardust < 30) { result = { success: false, message: '需要 30 星尘' }; return prev; }
              s.stardust -= 30;
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
