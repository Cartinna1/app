import { useCallback } from 'react';
import type { GameState, Mothership } from '@/types/game';
import type { Colony, PlanetTypeId, BuildingInstance } from '@/types/colony';
import { ALL_PLANETS } from '@/data/colony/planets';
import { getBuildingDef } from '@/data/colony/buildings';
import { getTechById } from '@/data/colony/techs';
import { getLeaderDef, rollLeaders } from '@/data/colony/leaders';

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
        s.colony = { phase: 'scouting', scoutTurnsRemaining: 2, planetType: null, planetName: '', buildings: [], population: { total: 0, available: 0, cap: 5 }, leaders: [], leaderCap: 3 };
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
          techState: { researched: [], currentResearch: null, currentProgress: 0, researchPoints: 500, researchSeed: 0 },
          leaders: [],
          leaderCap: 3,
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
        // 数量限制校验（含领袖扩展）
        let effMaxCount = def.maxCount;
        if (defId === 'B9') {
          for (const l of s.colony!.leaders || []) {
            if (l.id === 'L12' && l.level >= 2) effMaxCount += 1;
          }
        }
        if (effMaxCount) {
          const count = s.colony.buildings.filter((b) => b.defId === defId).length;
          if (count >= effMaxCount) {
            result = { success: false, message: `「${def.name}」建造数量已达上限(${effMaxCount})` };
            return prev;
          }
        }
        // 星球BUFF
        const planetDef2 = s.colony!.planetType ? ALL_PLANETS.find((p) => p.id === s.colony!.planetType) : null;
        const planetCostMult = planetDef2?.buffs.buildCostMult || 1;
        // 领袖造价减免
        let leaderCostRedPct = 0;
        for (const l of s.colony!.leaders || []) {
          const ld = getLeaderDef(l.id);
          leaderCostRedPct += (ld?.levelExtras[l.level-1]?.buildCostReduction || 0);
          // L16 穹顶之父 B2专属减免
          if (l.id === 'L16' && defId === 'B2' && l.level >= 2) {
            leaderCostRedPct += (l.level === 2 ? 30 : 50);
          }
        }
        const costMult = Math.max(0.1, planetCostMult * (1 - leaderCostRedPct / 100));
        const turnDelta = planetDef2?.buffs.buildTurnDelta || 0;
        const actualGoldCost = Math.ceil(def.costGold * costMult);
        const actualBuildTurns = Math.max(1, def.buildTurns + turnDelta);

        // 资源校验
        if (s.gold < actualGoldCost) {
          result = { success: false, message: `金币不足（需要${actualGoldCost.toLocaleString()}金币）` };
          return prev;
        }
        if (def.costAlloy && s.alloy < Math.ceil(def.costAlloy * costMult)) {
          result = { success: false, message: '合金不足' }; return prev;
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
        s.goldLog = [{ turn: prev.turn, amount: -actualGoldCost, reason: `建造「${def.name}」`, balanceAfter: s.gold }, ...s.goldLog].slice(0, 200);
        if (def.costAlloy) s.alloy -= Math.ceil(def.costAlloy * costMult);
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
        // 领袖招募费用减免
        let recruitCostBonus = 0; let recruitCapBonus = 0;
        for (const l of s.colony!.leaders || []) {
          const ld = getLeaderDef(l.id);
          recruitCostBonus += (ld?.levelExtras[l.level-1]?.recruitCostBonus || 0);
          recruitCapBonus += (ld?.levelExtras[l.level-1]?.recruitCapPerTurn || 0);
        }
        const maxRecruit = 5 + recruitCapBonus;
        if (amount > maxRecruit) {
          result = { success: false, message: `每回合最多招募${maxRecruit}人口` };
          return prev;
        }
        const cost = Math.max(0, (baseCost + planetDelta + recruitCostBonus) * amount);
        if (s.gold < cost) {
          result = { success: false, message: `金币不足（需要${cost.toLocaleString()}金币）` };
          return prev;
        }
        if (s.colony.population.total + amount > s.colony.population.cap) {
          result = { success: false, message: `人口已达上限（${s.colony.population.cap}）` };
          return prev;
        }
        s.gold -= cost;
        s.goldLog = [{ turn: prev.turn, amount: -cost, reason: `招募${amount}人口`, balanceAfter: s.gold }, ...s.goldLog].slice(0, 200);
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

        // 计算领袖扩展后的最大入驻人口
        let effMax = def.maxPop;
        if (s.colony) {
          for (const l of s.colony.leaders) {
            const ld = getLeaderDef(l.id);
            const extras = ld?.levelExtras[l.level - 1];
            if (extras?.popCapBonus?.[inst.defId]) effMax = Math.max(effMax, extras.popCapBonus[inst.defId]);
          }
        }

        const delta = count - inst.assignedPop;
        if (delta > 0 && s.colony.population.available < delta) {
          result = { success: false, message: '空闲人口不足' };
          return prev;
        }
        if (count < 0 || count > effMax) {
          result = { success: false, message: `入驻人口需在0-${effMax}之间` };
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

  /** 开始研究科技 */
  const startResearch = useCallback((techId: string): { success: boolean; message: string } => {
    const tech = getTechById(techId);
    if (!tech) return { success: false, message: '科技不存在' };
    let result = { success: false, message: '' };
    dispatch({
      type: 'FUNCTIONAL_UPDATE',
      updater: (prev) => {
        const ships = [...prev.ships];
        const s = { ...ships[0] };
        if (!s.colony || s.colony.phase !== 'active') { result = { success: false, message: '殖民地未激活' }; return prev; }
        if (!s.colony.techState) { result = { success: false, message: '科技系统未就绪' }; return prev; }
        if (s.colony.techState.currentResearch) { result = { success: false, message: '已经在研究一项科技' }; return prev; }
        if (s.colony.techState.researched.includes(techId)) { result = { success: false, message: '该科技已研究完成' }; return prev; }
        if (s.colony.techState.researchPoints < tech.costRP) { result = { success: false, message: `科研点数不足（需要${tech.costRP}）` }; return prev; }
        s.colony.techState.researchPoints -= tech.costRP;
        s.colony.techState.currentResearch = techId;
        s.colony.techState.currentProgress = 0;
        result = { success: true, message: `开始研究「${tech.name}」（需要${tech.researchTurns}回合）` };
        ships[0] = s;
        return { ...prev, ships };
      },
    });
    return result;
  }, [dispatch]);

  /** 招募领袖（添加+清池合一） */
  const recruitLeader = useCallback((leaderId: string) => {
    dispatch({
      type: 'FUNCTIONAL_UPDATE',
      updater: (prev) => {
        const ships = [...prev.ships]; const s = { ...ships[0] };
        if (!s.colony || s.colony.phase !== 'active') return prev;
        const ld = getLeaderDef(leaderId);
        if (!ld) return prev;
        if (s.colony.leaders.some(l => l.id === leaderId)) return prev;
        if (s.colony.leaders.length >= s.colony.leaderCap) return prev;
        s.colony = {
          ...s.colony,
          leaders: [...s.colony.leaders, { id: ld.id, name: ld.name, rarity: ld.rarity, description: ld.description, abilityName: ld.abilityName, level: 1 }],
          recruitPool: undefined,
        };
        ships[0] = s; return { ...prev, ships };
      },
    });
  }, [dispatch]);

  /** 领袖升级 */
  const upgradeLeader = useCallback((leaderIndex: number): { success: boolean; message: string } => {
    const col = gameState.ships[0].colony;
    if (!col || col.phase !== 'active') return { success: false, message: '殖民地未激活' };
    const li = col.leaders[leaderIndex];
    if (!li) return { success: false, message: '领袖不存在' };
    if (li.level >= 3) return { success: false, message: '已达最高等级' };
    const cost = li.level === 1 ? 20 : 45;
    if (gameState.ships[0].stardust < cost) return { success: false, message: `星尘不足(需要${cost})` };
    dispatch({
      type: 'FUNCTIONAL_UPDATE',
      updater: (prev) => {
        const ships = [...prev.ships]; const s = { ...ships[0] };
        s.stardust -= cost;
        s.colony!.leaders = s.colony!.leaders.map((l, i) => i === leaderIndex ? { ...l, level: l.level + 1 } : l);
        ships[0] = s; return { ...prev, ships };
      },
    });
    return { success: true, message: `「${li.name}」升至Lv${li.level+1}` };
  }, [dispatch, gameState]);

  /** 领袖招募：扣星尘+生成选项存入 colony.recruitPool */
  const rollAndRecruit = useCallback(() => {
    dispatch({
      type: 'FUNCTIONAL_UPDATE',
      updater: (prev) => {
        const ships = [...prev.ships]; const s = { ...ships[0] };
        if (!s.colony) return prev;
        if (s.colony.leaders.length >= s.colony.leaderCap) return prev;
        let lCostReduction = 0;
        for (const l of s.colony.leaders) {
          lCostReduction += (getLeaderDef(l.id)?.levelExtras[l.level-1]?.leaderCostReduction || 0);
        }
        const rollCost = Math.max(1, 10 - lCostReduction);
        if (s.stardust < rollCost) return prev;
        s.stardust -= rollCost;
        s.colony = { ...s.colony, recruitPool: rollLeaders(3) };
        ships[0] = s; return { ...prev, ships };
      },
    });
  }, [dispatch]);

  /** 清空招募池 */
  const clearRecruitPool = useCallback(() => {
    dispatch({
      type: 'FUNCTIONAL_UPDATE',
      updater: (prev) => {
        if (!prev.ships[0].colony) return prev;
        const ships = [...prev.ships]; const s = { ...ships[0] };
        s.colony = { ...s.colony!, recruitPool: undefined };
        ships[0] = s; return { ...prev, ships };
      },
    });
  }, [dispatch]);

  return {
    unlockColony, selectPlanet, rescrollPlanets, generateScoutingPool,
    buildColonyBuilding, recruitPop, assignPop, startResearch,
    recruitLeader, upgradeLeader, rollAndRecruit, clearRecruitPool,
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
  // 计算领袖加成映射 (buildingId → bonus%)
  const leaderBonusMap: Record<string, number> = {};
  let lAllBonus = 0, lMatBonus = 0;
  for (const l of colony.leaders) {
    const ld = getLeaderDef(l.id);
    if (!ld) continue;
    const bonuses = ld.levelBonuses[l.level - 1] || {};
    for (const [bid, b] of Object.entries(bonuses)) {
      if (bid === 'ALL') lAllBonus += b;
      else if (bid === 'ALL_MATERIAL') lMatBonus += b;
      else leaderBonusMap[bid] = (leaderBonusMap[bid] || 0) + b;
    }
  }
  // 合并特殊加成到所有建筑
  for (const inst of colony.buildings) {
    if (lAllBonus > 0) leaderBonusMap[inst.defId] = (leaderBonusMap[inst.defId] || 0) + lAllBonus;
    const def = getBuildingDef(inst.defId);
    if (def?.category === 'material' && lMatBonus > 0) leaderBonusMap[inst.defId] = (leaderBonusMap[inst.defId] || 0) + lMatBonus;
  }

  let totalFood = 0, totalAlloy = 0, totalGold = 0, totalStardust = 0, totalRP = 0;

  for (const inst of colony.buildings) {
    if (!inst.active || inst.assignedPop <= 0) continue;
    const def = getBuildingDef(inst.defId);
    if (!def || !def.outputType) continue;

    // 领袖指定建筑人口槽位扩展
    let effMaxPop = def.maxPop;
    for (const l of colony.leaders) {
      const ld = getLeaderDef(l.id);
      const extras = ld?.levelExtras[l.level - 1];
      if (extras?.popCapBonus?.[inst.defId]) effMaxPop = Math.max(effMaxPop, extras.popCapBonus[inst.defId]);
    }
    const effPop = Math.min(inst.assignedPop, effMaxPop);

    const lb = (leaderBonusMap[inst.defId] || 0) / 100;
    let output = 0;
    if (def.outputType === 'food') {
      output = (def.baseOutput || 0) + (def.popFactor || 0) * effPop;
      if (planetDef?.buffs.foodMult) output = Math.ceil(output * planetDef.buffs.foodMult);
      output = Math.ceil(output * (1 + lb));
      totalFood += output;
    } else if (def.outputType === 'alloy') {
      output = (def.baseOutput || 0) + (def.popFactor || 0) * effPop;
      if (planetDef?.buffs.alloyMult) output = Math.ceil(output * planetDef.buffs.alloyMult);
      output = Math.ceil(output * (1 + lb));
      totalAlloy += output;
    } else if (def.outputType === 'stardust') {
      output = (def.baseOutput || 0) + (def.popFactor || 0) * effPop;
      if (planetDef?.buffs.stardustMult) output = Math.ceil(output * planetDef.buffs.stardustMult);
      output = Math.ceil(output * (1 + lb));
      totalStardust += output;
    } else if (def.outputType === 'gold') {
      output = Math.floor(Math.random() * ((def.goldOutputMax || 0) - (def.goldOutputMin || 0) + 1)) + (def.goldOutputMin || 0);
      output = Math.ceil(output * (1 + lb));
      totalGold += output;
    } else if (def.outputType === 'material' && def.outputMaterialId) {
      output = (def.popFactor || 0) * effPop;
      const matMult = planetDef?.buffs.materialMults?.[def.outputMaterialId] || 1;
      output = Math.ceil(output * matMult * (1 + lb));
      ship.materials = { ...(ship.materials || {}), [def.outputMaterialId]: ((ship.materials || {})[def.outputMaterialId] || 0) + output };
    } else if (def.outputType === 'research') {
      output = (def.popFactor || 0) * effPop;
      if (planetDef?.buffs.researchMult) output = Math.ceil(output * planetDef.buffs.researchMult);
      const hasB26 = colony.buildings.some((b) => b.active && b.defId === 'B26');
      // B26倍率（含领袖L11加成）
      let b26Mult = 1.5;
      for (const l of colony.leaders) {
        const ld = getLeaderDef(l.id);
        const bm = ld?.levelExtras[l.level - 1]?.b26Mult;
        if (bm && bm > b26Mult) b26Mult = bm;
      }
      if (hasB26) output = Math.ceil(output * b26Mult);
      output = Math.ceil(output * (1 + lb));
      totalRP += output;
    }
  }

  // 领袖特殊效果
  let lRP = 0, lDM = 0, lQ = 0, lSD = 0;
  const matIds = ['oil','gold_ore','carbon','dark_matter','quantum','silicon'];
  for (const l of colony.leaders) {
    const ld = getLeaderDef(l.id); const ex = ld?.levelExtras[l.level-1];
    if (ex?.researchPerTurn) lRP += Math.floor(Math.random()*(ex.researchPerTurn[1]-ex.researchPerTurn[0]+1))+ex.researchPerTurn[0];
    if (ex?.darkMatterPerTurn) lDM += ex.darkMatterPerTurn;
    if (ex?.quantumPerTurn) lQ += ex.quantumPerTurn;
    if (ex?.stardustPerTurn) lSD += ex.stardustPerTurn;
    if (ex?.randomMatsPerTurn) {
      for (let mi = 0; mi < ex.randomMatsPerTurn; mi++) {
        const mid = matIds[Math.floor(Math.random() * matIds.length)];
        ship.materials = { ...(ship.materials||{}), [mid]: ((ship.materials||{})[mid]||0)+1 };
      }
    }
  }
  totalRP += lRP; ship.stardust += lSD;
  if (lDM>0) ship.materials = { ...(ship.materials||{}), dark_matter: ((ship.materials||{}).dark_matter||0)+lDM };
  if (lQ>0) ship.materials = { ...(ship.materials||{}), quantum: ((ship.materials||{}).quantum||0)+lQ };

  ship.food += totalFood;
  ship.alloy += totalAlloy;
  ship.stardust += totalStardust;
  if (totalGold > 0) {
    ship.gold += totalGold;
    ship.goldLog = [{ turn: _turn, amount: totalGold, reason: `殖民地「${colony.planetName}」贸易收入`, balanceAfter: ship.gold }, ...(ship.goldLog || [])].slice(0, 200);
  }

  // B28 克隆中心：每2回合免费1人口
  const b28 = colony.buildings.find((b) => b.active && b.defId === 'B28' && b.assignedPop > 0);
  if (b28 && _turn % 2 === 0 && colony.population.total < colony.population.cap) {
    colony.population.total += 1;
    colony.population.available += 1;
  }

  // 人口食物消耗（含领袖食物减免）
  let foodPerPop = 3 + (planetDef?.buffs.foodConsumptionDelta || 0);
  for (const l of colony.leaders) {
    const ld = getLeaderDef(l.id); const ex = ld?.levelExtras[l.level-1];
    foodPerPop += (ex?.foodConsumptionDelta || 0);
  }
  foodPerPop = Math.max(1, foodPerPop);
  const totalFoodCost = colony.population.total * foodPerPop;
  ship.food -= totalFoodCost;

  // 人口上限重新计算（含领袖上限加成）
  colony.population.cap = calcPopCap(colony);

  // 领袖免费人口效果
  for (const l of colony.leaders) {
    const ld = getLeaderDef(l.id); const ex = ld?.levelExtras[l.level-1];
    if (ex?.freePopEveryTurns && _turn % ex.freePopEveryTurns === 0 && colony.population.total < colony.population.cap) {
      colony.population.total += 1; colony.population.available += 1;
    }
  }

  // 领袖上限：T23/T24 + 领袖自己加的上限
  colony.leaderCap = 3;
  if (colony.techState) {
    if (colony.techState.researched.includes('T23')) colony.leaderCap += 1;
    if (colony.techState.researched.includes('T24')) colony.leaderCap += 3;
  }
  for (const l of colony.leaders) {
    const ld = getLeaderDef(l.id); const ex = ld?.levelExtras[l.level-1];
    colony.leaderCap += (ex?.leaderCapBonus || 0);
  }

  // 科研处理
  if (colony.techState) {
    colony.techState.researchPoints += totalRP;
    colony.techState.researchSeed = (colony.techState.researchSeed || 0) + 1; // 每回合刷新可选科技
    if (colony.techState.currentResearch) {
      const polarBonus = (planetDef && planetDef.id === 'polar') ? 1 : 0;
      colony.techState.currentProgress += 1 + polarBonus;
      const tech = getTechById(colony.techState.currentResearch);
      if (tech && colony.techState.currentProgress >= tech.researchTurns) {
        colony.techState.researched = [...colony.techState.researched, colony.techState.currentResearch];
        colony.techState.currentResearch = null;
        colony.techState.currentProgress = 0;
      }
    }
  }
}

function calcPopCap(colony: Colony): number {
  let cap = 5;
  const planetDef = colony.planetType ? ALL_PLANETS.find((p) => p.id === colony.planetType) : null;
  if (planetDef?.buffs.initialPopCap) cap = planetDef.buffs.initialPopCap;
  for (const inst of colony.buildings) {
    if (!inst.active) continue;
    if (inst.defId === 'B1') cap += 5 + (colony.planetType === 'ruin' ? 3 : 0);
    if (inst.defId === 'B2') cap += 20;
  }
  // 领袖人口上限加成
  for (const l of colony.leaders) {
    const ld = getLeaderDef(l.id); const ex = ld?.levelExtras[l.level-1];
    cap += (ex?.populationCapBonus || 0);
    // L16 穹顶之父：居住建筑上限+
    if (l.id === 'L16') {
      const mult = [0.5, 1.0, 1.5][l.level-1] || 0;
      for (const inst of colony.buildings) {
        if (!inst.active || (inst.defId !== 'B1' && inst.defId !== 'B2')) continue;
        cap += Math.ceil((inst.defId === 'B1' ? 5 : 20) * mult);
      }
      if (l.level >= 3) {
        const b2Count = colony.buildings.filter((b) => b.active && b.defId === 'B2').length;
        cap += b2Count * 5;
      }
    }
  }
  return cap;
}
