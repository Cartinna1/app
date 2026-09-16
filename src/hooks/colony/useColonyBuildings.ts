import { useCallback } from 'react';
import type { GameState } from '@/types/game';
import { getBuildingDef } from '@/data/colony/buildings';
import { getEffectiveMaxCount, getBuildingCostProfile } from '@/lib/colony/costs';

/** 殖民地建筑建造 / 取消 / 拆除（从 useColony 拆出） */
export function useColonyBuildings(
  dispatch: React.Dispatch<{ type: 'FUNCTIONAL_UPDATE'; updater: (state: GameState) => GameState }>
) {
  /** 建造建筑 */
  const buildColonyBuilding = useCallback((defId: string): { success: boolean; message: string } => {
    const def = getBuildingDef(defId);
    if (!def) return { success: false, message: '建筑不存在' };
    let result = { success: false, message: '' };
    dispatch({
      type: 'FUNCTIONAL_UPDATE',
      updater: (prev) => {
        const ships = [...prev.ships];
        const s = { ...ships[0] };
        if (!s.colony || s.colony.phase !== 'active') {
          result = { success: false, message: '殖民地未激活' };
          return prev;
        }
        // 数量限制校验（含领袖扩展；唯一真值 getEffectiveMaxCount，UI 同源）
        const effMaxCount = getEffectiveMaxCount(def, s.colony!);
        if (effMaxCount != null) {
          const count = s.colony.buildings.filter((b) => b.defId === defId).length;
          if (count >= effMaxCount) {
            result = { success: false, message: `「${def.name}」建造数量已达上限(${effMaxCount})` };
            return prev;
          }
        }
        // 实际造价与工期（唯一真值 getBuildingCostProfile：含星球倍率 + 领袖减免，UI 同源）
        const costProfile = getBuildingCostProfile(def, s.colony!);
        const actualGoldCost = costProfile.gold;
        const actualBuildTurns = costProfile.turns;

        // 资源校验
        if (s.gold < actualGoldCost) {
          result = { success: false, message: `金币不足（需要${actualGoldCost.toLocaleString()}金币）` };
          return prev;
        }
        if (def.costAlloy && s.alloy < costProfile.alloy) {
          result = { success: false, message: '合金不足' }; return prev;
        }
        if (def.costMaterials) {
          for (const matId of Object.keys(def.costMaterials)) {
            const actualMatAmt = costProfile.materials[matId];
            if ((s.materials[matId] || 0) < actualMatAmt) {
              result = { success: false, message: `原料不足（需要${actualMatAmt}个${matId}）` };
              return prev;
            }
          }
        }
        s.gold -= actualGoldCost;
        s.goldLog = [{ turn: prev.turn, amount: -actualGoldCost, reason: `建造「${def.name}」`, balanceAfter: s.gold }, ...s.goldLog].slice(0, 200);
        if (def.costAlloy) s.alloy -= costProfile.alloy;
        if (def.costMaterials) {
          s.materials = { ...s.materials };
          for (const matId of Object.keys(def.costMaterials)) {
            s.materials[matId] = (s.materials[matId] || 0) - costProfile.materials[matId];
          }
        }
        const uid = `${defId}_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
        s.colony.buildings = [...s.colony.buildings, {
          defId, uid, assignedPop: 0,
          buildProgress: 0, active: false,
        }];
        result = { success: true, message: `开始建造「${def.name}」（${actualBuildTurns}回合）` };
        ships[0] = s;
        return { ...prev, ships };
      },
    });
    return result;
  }, [dispatch]);

  /** 取消建造 */
  const cancelBuilding = useCallback((uid: string) => {
    dispatch({
      type: 'FUNCTIONAL_UPDATE',
      updater: (prev) => {
        const ships = [...prev.ships]; const s = { ...ships[0] };
        if (!s.colony) return prev;
        const inst = s.colony.buildings.find((b: any) => b.uid === uid);
        // 退还 40% 金币和 70% 原料
        if (inst && inst.defId) {
          const def = getBuildingDef(inst.defId);
          if (def) {
            const refundGold = Math.floor(def.costGold * 0.4);
            s.gold += refundGold;
            s.goldLog = [{ turn: prev.turn, amount: refundGold, reason: '取消建造返还', balanceAfter: s.gold }, ...s.goldLog].slice(0, 200);
            if (def.costAlloy) s.alloy += Math.floor(def.costAlloy * 0.7);
            s.materials = { ...s.materials };
            if (def.costMaterials) {
              for (const [matId, amt] of Object.entries(def.costMaterials)) {
                s.materials[matId] = (s.materials[matId] || 0) + Math.floor(amt * 0.7);
              }
            }
          }
        }
        s.colony = { ...s.colony, buildings: s.colony.buildings.filter((b: any) => b.uid !== uid) };
        ships[0] = s; return { ...prev, ships };
      },
    });
  }, [dispatch]);

  /** 拆除已建成建筑 */
  const demolishBuilding = useCallback((uid: string): { success: boolean; message: string } => {
    let result = { success: false, message: '' };
    dispatch({
      type: 'FUNCTIONAL_UPDATE',
      updater: (prev) => {
        const ships = [...prev.ships]; const s = { ...ships[0] };
        if (!s.colony) { result = { success: false, message: '殖民地未激活' }; return prev; }
        const inst = s.colony.buildings.find((b: any) => b.uid === uid);
        if (!inst) { result = { success: false, message: '建筑不存在' }; return prev; }
        if (!inst.active) { result = { success: false, message: '只能拆除已建成的建筑' }; return prev; }
        // 居住类建筑不可拆除
        const def = getBuildingDef(inst.defId);
        if (def && (def.id === 'B1' || def.id === 'B2')) {
          result = { success: false, message: `${def.name}是居住类基础建筑，不可拆除` };
          return prev;
        }
        // 退还 40% 金币和 70% 原料
        if (def) {
          const refundGold = Math.floor(def.costGold * 0.4);
          s.gold += refundGold;
          s.goldLog = [{ turn: prev.turn, amount: refundGold, reason: '拆除建筑返还', balanceAfter: s.gold }, ...s.goldLog].slice(0, 200);
          if (def.costAlloy) s.alloy += Math.floor(def.costAlloy * 0.7);
          s.materials = { ...s.materials };
          if (def.costMaterials) {
            for (const [matId, amt] of Object.entries(def.costMaterials)) {
              s.materials[matId] = (s.materials[matId] || 0) + Math.floor(amt * 0.7);
            }
          }
        }
        s.colony = { ...s.colony, buildings: s.colony.buildings.filter((b: any) => b.uid !== uid), population: { ...s.colony.population, available: s.colony.population.available + (inst.assignedPop || 0) } };
        ships[0] = s; result = { success: true, message: '已拆除' }; return { ...prev, ships };
      },
    });
    return result;
  }, [dispatch]);

  return { buildColonyBuilding, cancelBuilding, demolishBuilding };
}
