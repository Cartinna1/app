import { useCallback } from 'react';
import type { GameState, Mothership } from '@/types/game';
import type { Colony, PlanetTypeId, BuildingInstance } from '@/types/colony';
import { ALL_PLANETS } from '@/data/colony/planets';
import { getBuildingDef } from '@/data/colony/buildings';

const UNLOCK_COST = 30000;

export function useColony(
  gameState: GameState,
  dispatch: React.Dispatch<{ type: 'FUNCTIONAL_UPDATE'; updater: (state: GameState) => GameState }>
) {
  const ship = gameState.ships[0];

  /** 解锁殖民功能 */
  const unlockColony = useCallback((): { success: boolean; message: string } => {
    if (!ship) return { success: false, message: '舰队不存在' };
    if (ship.colony) return { success: false, message: '殖民地已解锁' };
    if (ship.gold < UNLOCK_COST) return { success: false, message: `金币不足（需要${UNLOCK_COST.toLocaleString()}金币）` };
    dispatch({
      type: 'FUNCTIONAL_UPDATE',
      updater: (prev) => {
        const ships = [...prev.ships];
        const s = { ...ships[0] };
        s.gold -= UNLOCK_COST;
        s.goldLog = [{ turn: prev.turn, amount: -UNLOCK_COST, reason: '组建远征军探索殖民', balanceAfter: s.gold }, ...s.goldLog].slice(0, 200);
        s.colony = { phase: 'scouting', scoutTurnsRemaining: 2, planetType: null, planetName: '', buildings: [], population: { total: 0, available: 0, cap: 5 } };
        ships[0] = s;
        return { ...prev, ships };
      },
    });
    return { success: true, message: '远征军已出发！预计2回合后抵达目标星系。' };
  }, [ship, dispatch]);

  /** 选择星球 */
  const selectPlanet = useCallback((planetId: PlanetTypeId, name: string): { success: boolean; message: string } => {
    const planet = ALL_PLANETS.find((p) => p.id === planetId);
    if (!planet) return { success: false, message: '星球不存在' };
    if (name.length < 3 || name.length > 16) return { success: false, message: '星球名称需3-16个字符' };
    let result = { success: false, message: '' };
    dispatch({
      type: 'FUNCTIONAL_UPDATE',
      updater: (prev) => {
        const ships = [...prev.ships];
        const s = { ...ships[0] };
        if (!s.colony || s.colony.phase !== 'selecting') {
          result = { success: false, message: '当前无法选择星球' };
          return prev;
        }
        const planetDef = ALL_PLANETS.find((p) => p.id === planetId);
        if (!planetDef) {
          result = { success: false, message: '星球不存在' };
          return prev;
        }
        const initialCap = planetDef.buffs.initialPopCap || 5;
        const initialPop = planetDef.buffs.initialPop || 0;
        // 遗落星球赠送 B7
        const buildings: BuildingInstance[] = [];
        if (planetId === 'ruin') {
          buildings.push({
            defId: 'B7', uid: 'B7_ruin_1', assignedPop: 0,
            buildProgress: 3, active: true,
          });
        }
        s.colony = {
          ...s.colony,
          phase: 'active',
          planetType: planetId,
          planetName: name,
          buildings,
          population: { total: initialPop, available: initialPop, cap: initialCap },
        };
        ships[0] = s;
        result = { success: true, message: `成功在「${planetDef.name}」建立殖民地「${name}」！` };
        return { ...prev, ships };
      },
    });
    return result;
  }, [dispatch]);

  /** 重新探索星球 */
  const rescrollPlanets = useCallback((): { success: boolean; message: string } => {
    if (!ship) return { success: false, message: '舰队不存在' };
    if (ship.gold < UNLOCK_COST) return { success: false, message: `金币不足（需要${UNLOCK_COST.toLocaleString()}金币）` };
    dispatch({
      type: 'FUNCTIONAL_UPDATE',
      updater: (prev) => {
        const ships = [...prev.ships];
        const s = { ...ships[0] };
        s.gold -= UNLOCK_COST;
        if (s.colony && s.colony.phase === 'selecting') {
          s.colony = { ...s.colony, scoutingPool: undefined };
        }
        ships[0] = s;
        return { ...prev, ships };
      },
    });
    return { success: true, message: '已重新派出远征军探索新星系。' };
  }, [ship, dispatch]);

  /** 生成可选的星球池（3个随机） */
  const generateScoutingPool = useCallback((): PlanetTypeId[] => {
    const pool = [...ALL_PLANETS];
    const result: PlanetTypeId[] = [];
    for (let i = 0; i < 3; i++) {
      const idx = Math.floor(Math.random() * pool.length);
      result.push(pool[idx].id);
      pool.splice(idx, 1);
    }
    return result;
  }, []);

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
        // 数量限制校验
        if (def.maxCount) {
          const count = s.colony.buildings.filter((b) => b.defId === defId).length;
          if (count >= def.maxCount) {
            result = { success: false, message: `「${def.name}」建造数量已达上限(${def.maxCount})` };
            return prev;
          }
        }
        // 星球BUFF
        const planetDef2 = s.colony.planetType ? ALL_PLANETS.find((p) => p.id === s.colony.planetType) : null;
        const costMult = planetDef2?.buffs.buildCostMult || 1;
        const turnDelta = planetDef2?.buffs.buildTurnDelta || 0;
        const actualGoldCost = Math.ceil(def.costGold * costMult);
        const actualBuildTurns = Math.max(1, def.buildTurns + turnDelta);

        // 资源校验
        if (s.gold < actualGoldCost) {
          result = { success: false, message: `金币不足（需要${actualGoldCost.toLocaleString()}金��）` };
          return prev;
        }
        if (def.costMaterials) {
          for (const [matId, amt] of Object.entries(def.costMaterials)) {
            const actualMatAmt = Math.ceil(amt * costMult);
            if ((s.materials[matId] || 0) < actualMatAmt) {
              result = { success: false, message: `原料不足（需要${actualMatAmt}个${matId}）` };
              return prev;
            }
          }
        }
        s.gold -= actualGoldCost;
        if (def.costMaterials) {
          s.materials = { ...s.materials };
          for (const [matId, amt] of Object.entries(def.costMaterials)) {
            s.materials[matId] = (s.materials[matId] || 0) - Math.ceil(amt * costMult);
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

  /** 招募人口 */
  const recruitPop = useCallback((amount: number): { success: boolean; message: string } => {
    if (amount <= 0) return { success: false, message: '数量必须大于0' };
    if (amount > 5) return { success: false, message: '每回合最多招募5人口' };
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
        const baseCost = 2000;
        const planetDelta = (() => {
          if (!s.colony?.planetType) return 0;
          const pd = ALL_PLANETS.find((p) => p.id === s.colony!.planetType);
          return pd?.buffs.recruitCostDelta || 0;
        })();
        const cost = (baseCost + planetDelta) * amount;
        if (s.gold < cost) {
          result = { success: false, message: `金币不足（需要${cost.toLocaleString()}金币）` };
          return prev;
        }
        if (s.colony.population.total + amount > s.colony.population.cap) {
          result = { success: false, message: `人口已达上限（${s.colony.population.cap}）` };
          return prev;
        }
        s.gold -= cost;
        s.colony = {
          ...s.colony,
          population: {
            ...s.colony.population,
            total: s.colony.population.total + amount,
            available: s.colony.population.available + amount,
          },
        };
        result = { success: true, message: `招募了${amount}人口` };
        ships[0] = s;
        return { ...prev, ships };
      },
    });
    return result;
  }, [dispatch]);

  /** 分配人口到建筑 */
  const assignPop = useCallback((buildingUid: string, count: number): { success: boolean; message: string } => {
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
        const idx = s.colony.buildings.findIndex((b) => b.uid === buildingUid);
        if (idx === -1) { result = { success: false, message: '建筑不存在' }; return prev; }
        const inst = s.colony.buildings[idx];
        if (!inst.active) { result = { success: false, message: '建筑尚未建成' }; return prev; }
        const def = getBuildingDef(inst.defId);
        if (!def) { result = { success: false, message: '建筑定义不存在' }; return prev; }

        const delta = count - inst.assignedPop;
        if (delta > 0 && s.colony.population.available < delta) {
          result = { success: false, message: '空闲人口不足' };
          return prev;
        }
        if (count < def.minPop || count > def.maxPop) {
          result = { success: false, message: `入驻人口需在${def.minPop}-${def.maxPop}之间` };
          return prev;
        }
        s.colony = {
          ...s.colony,
          population: {
            ...s.colony.population,
            available: s.colony.population.available - delta,
          },
          buildings: s.colony.buildings.map((b, i) =>
            i === idx ? { ...b, assignedPop: count } : b
          ),
        };
        result = { success: true, message: `已分配${count}人口到「${def.name}」` };
        ships[0] = s;
        return { ...prev, ships };
      },
    });
    return result;
  }, [dispatch]);

  return {
    unlockColony, selectPlanet, rescrollPlanets, generateScoutingPool,
    buildColonyBuilding, recruitPop, assignPop,
  };
}

// ==================== 回合处理辅助函数 ====================

/** 处理殖民地每个回合的推进（在 useTurn 中调用） */
export function processColonyTurn(ship: Mothership, _turn: number): void {
  const colony = ship.colony;
  if (!colony || colony.phase === 'inactive') return;

  // 探索倒计时
  if (colony.phase === 'scouting') {
    colony.scoutTurnsRemaining -= 1;
    if (colony.scoutTurnsRemaining <= 0) {
      colony.phase = 'selecting';
    }
    return;
  }

  if (colony.phase !== 'active') return;

  // 建筑建造进度推进
  const planetDef = colony.planetType ? ALL_PLANETS.find((p) => p.id === colony.planetType) : null;
  const turnDelta = planetDef?.buffs.buildTurnDelta || 0;
  let buildingChanged = false;
  for (const inst of colony.buildings) {
    if (inst.active) continue;
    const def = getBuildingDef(inst.defId);
    if (!def) continue;
    inst.buildProgress += 1;
    if (inst.buildProgress >= def.buildTurns + turnDelta) {
      inst.active = true;
    }
    buildingChanged = true;
  }
  // 强制刷新数组引用（确保 UI 能检测到 active 变化）
  if (buildingChanged) {
    colony.buildings = [...colony.buildings];
  }

  // 建筑产出计算
  const planetDef = colony.planetType ? ALL_PLANETS.find((p) => p.id === colony.planetType) : null;
  let totalFood = 0;
  let totalAlloy = 0;
  let totalGold = 0;

  for (const inst of colony.buildings) {
    if (!inst.active || inst.assignedPop <= 0) continue;
    const def = getBuildingDef(inst.defId);
    if (!def || !def.outputType) continue;

    let output = 0;
    if (def.outputType === 'food') {
      output = (def.baseOutput || 0) + (def.popFactor || 0) * inst.assignedPop;
      if (planetDef?.buffs.foodMult) output = Math.ceil(output * planetDef.buffs.foodMult);
      totalFood += output;
    } else if (def.outputType === 'alloy') {
      output = (def.baseOutput || 0) + (def.popFactor || 0) * inst.assignedPop;
      if (planetDef?.buffs.alloyMult) output = Math.ceil(output * planetDef.buffs.alloyMult);
      totalAlloy += output;
    } else if (def.outputType === 'gold') {
      const mn = def.goldOutputMin || 0;
      const mx = def.goldOutputMax || 0;
      output = Math.floor(Math.random() * (mx - mn + 1)) + mn;
      totalGold += output;
    }
  }

  ship.food += totalFood;
  ship.alloy += totalAlloy;
  if (totalGold > 0) {
    ship.gold += totalGold;
    ship.goldLog = [{ turn: _turn, amount: totalGold, reason: `殖民地「${colony.planetName}」贸易收入`, balanceAfter: ship.gold }, ...(ship.goldLog || [])].slice(0, 200);
  }

  // 人口食物消耗
  const foodPerPop = 3 + (planetDef?.buffs.foodConsumptionDelta || 0);
  const totalFoodCost = colony.population.total * foodPerPop;
  ship.food -= totalFoodCost;

  // 人口上限重新计算
  colony.population.cap = calcPopCap(colony);
}

function calcPopCap(colony: Colony): number {
  let cap = 5;
  const planetDef = colony.planetType ? ALL_PLANETS.find((p) => p.id === colony.planetType) : null;
  if (planetDef?.buffs.initialPopCap) cap = planetDef.buffs.initialPopCap;
  for (const inst of colony.buildings) {
    if (!inst.active) continue;
    if (inst.defId === 'B1') cap += 5;
  }
  return cap;
}
