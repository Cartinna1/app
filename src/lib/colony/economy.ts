// ==================== 殖民地经济结算（唯一真值） ====================
// 本模块是殖民地每回合产出/消耗的唯一计算来源。
// - useColony.processColonyTurn 回合结算使用（random: true，金币/领袖科研为随机掷骰）
// - GameScreen / ColonyPanel 的界面预览使用（默认取中间值做确定性估算）
// 修改产出规则时只需改这里，UI 与结算不会再分叉。

import type { BuildingDef, Colony } from '@/types/colony';
import { getBuildingDef, BUILDING_QUANTUM_LAB, BUILDING_SOLAR_ARRAY, BUILDING_FUSION_PLANT } from '@/data/colony/buildings';
import { getLeaderDef, LEADER_LOAD_BALANCE, LEADER_AFTERGLOW_PULSE } from '@/data/colony/leaders';
import { getPlanetById } from '@/data/colony/planets';
import { RELIC_ALLOY_MANUAL } from '@/data/relics';

/** 电能结算结果 */
export interface ColonyPowerInfo {
  /** 总发电（逐建筑 floor，含 余晖脉冲/星球/领袖全员加成） */
  gen: number;
  /** 总耗电（含 负载平衡折扣与星球倍率，ceil） */
  use: number;
  /** 净电能 gen - use */
  net: number;
  /** 负载平衡折扣率（0 / 0.10 / 0.15 / 0.25） */
  l21Pct: number;
  planetGenMult: number;
  planetUseMult: number;
}

/** 单个建筑实例的产出明细（供 UI 展示分解） */
export interface BuildingEconomyEntry {
  uid: string;
  defId: string;
  outputType: NonNullable<BuildingDef['outputType']>;
  /** 有效入驻人口（含领袖槽位扩展） */
  effPop: number;
  /** 基础产出（加成前） */
  base: number;
  /** 星球加成（小数，如 0.5 表示 +50%） */
  planetPct: number;
  /** 领袖加成（小数） */
  leaderPct: number;
  /** 循环科技加成（小数） */
  repeatPct: number;
  /** 量子实验室加成（小数，仅科研） */
  b26Pct: number;
  /** 最终产出（gold 在估算模式下取区间中值） */
  value: number;
  /** outputType === 'material' 时的原料 ID */
  materialId?: string;
}

export interface ColonyEconomy {
  food: number;
  alloy: number;
  stardust: number;
  gold: number;
  research: number;
  materials: Record<string, number>;
  /** 每人每回合食物消耗（含星球/领袖修正，最低 1） */
  foodPerPop: number;
  /** 人口食物总消耗 */
  foodCost: number;
  /** 正在产出的非电能建筑明细 */
  buildings: BuildingEconomyEntry[];
  power: ColonyPowerInfo;
}

export interface ColonyEconomyOptions {
  /** 停电中（跳过一切非电能产出）。回合结算时按结算后的电能状态传入 */
  blackout?: boolean;
  /** true = 实际结算（金币区间、领袖科研区间、随机原料均掷骰）；false/缺省 = 确定性估算（取中值） */
  random?: boolean;
  /** 母舰遗物（结算与显示共用的遗物加成，如 r_008 合金精炼手册）。
   *  必填：漏传会让遗物加成静默失效（显示与结算分叉），故由 TS 强制所有调用点传值。 */
  relics: { id: string }[];
}

/** 领袖全员加成（levelBonuses 中 'ALL' 键的合计，% 值） */
function sumAllLeaderBonus(colony: Colony): number {
  let all = 0;
  for (const l of colony.leaders) {
    const ld = getLeaderDef(l.id);
    if (!ld) continue;
    const bonuses = ld.levelBonuses[l.level - 1] || {};
    for (const [bid, b] of Object.entries(bonuses)) {
      if (bid === 'ALL') all += b;
    }
  }
  return all;
}

/** 电能结算：发电、耗电、净电能 */
export function computeColonyPower(colony: Colony): ColonyPowerInfo {
  const planet = colony.planetType ? getPlanetById(colony.planetType) : undefined;
  const lAllBonus = sumAllLeaderBonus(colony);

  // 发电
  const powerGenPlanetMult = planet?.buffs.powerGenMult || 1;
  let gen = 0;
  for (const inst of colony.buildings) {
    if (!inst.active) continue;
    const def = getBuildingDef(inst.defId);
    if (!def || def.outputType !== 'power') continue;
    if (inst.assignedPop < def.minPop) continue;
    let base = (def.baseOutput || 0) + (def.popFactor || 0) * inst.assignedPop;
    // 余晖脉冲加成
    for (const l of colony.leaders) {
      const ld = getLeaderDef(l.id);
      if (ld?.id === LEADER_AFTERGLOW_PULSE) {
        if ((def.id === BUILDING_SOLAR_ARRAY && l.level >= 1) || (def.id === BUILDING_FUSION_PLANT && l.level >= 2)) base *= 1.30;
      }
    }
    // 星球修正（仅太阳能阵列）
    if (def.id === BUILDING_SOLAR_ARRAY && powerGenPlanetMult !== 1) base *= powerGenPlanetMult;
    // 领袖全员加成
    if (lAllBonus > 0) base *= (1 + lAllBonus / 100);
    gen += Math.floor(base);
  }

  // 耗电
  let totalUse = 0;
  for (const inst of colony.buildings) {
    if (!inst.active) continue;
    const def = getBuildingDef(inst.defId);
    if (!def || def.outputType === 'power') continue; // 电力建筑自身不耗电
    totalUse += def.powerConsumption || 0;
  }
  // 负载平衡（总消耗 × 折扣，ceil 取整）
  let l21Pct = 0;
  for (const l of colony.leaders) {
    const ld = getLeaderDef(l.id);
    if (ld?.id === LEADER_LOAD_BALANCE) { l21Pct = [0.10, 0.15, 0.25][l.level - 1] || 0; }
  }
  const effectiveUse = l21Pct > 0 ? Math.ceil(totalUse * (1 - l21Pct)) : totalUse;
  // 星球电能消耗修正
  const planetUseMult = planet?.buffs.powerUseMult || 1;
  const use = Math.ceil(effectiveUse * planetUseMult);

  return { gen, use, net: gen - use, l21Pct, planetGenMult: powerGenPlanetMult, planetUseMult };
}

/** 人口食物消耗（含星球与领袖修正，最低每人 1） */
export function computeColonyFoodCost(colony: Colony): { foodPerPop: number; foodCost: number } {
  const planet = colony.planetType ? getPlanetById(colony.planetType) : undefined;
  let foodPerPop = 3 + (planet?.buffs.foodConsumptionDelta || 0);
  for (const l of colony.leaders) {
    const ex = getLeaderDef(l.id)?.levelExtras[l.level - 1];
    foodPerPop += (ex?.foodConsumptionDelta || 0);
  }
  foodPerPop = Math.max(1, foodPerPop);
  return { foodPerPop, foodCost: colony.population.total * foodPerPop };
}

const RANDOM_MAT_IDS = ['oil', 'gold_ore', 'carbon', 'dark_matter', 'quantum', 'silicon'];

/** 殖民地每回合经济结算（产出 + 食物消耗 + 电能） */
export function computeColonyEconomy(colony: Colony, opts: ColonyEconomyOptions): ColonyEconomy {
  const random = opts.random === true;
  const blackout = opts.blackout === true;
  const hasAlloyManual = opts.relics.some((r) => r.id === RELIC_ALLOY_MANUAL);
  const planet = colony.planetType ? getPlanetById(colony.planetType) : undefined;
  const buffs = planet?.buffs;

  // ===== 领袖加成映射 (buildingId → bonus%) =====
  const leaderBonusMap: Record<string, number> = {};
  let lAll = 0, lMat = 0;
  for (const l of colony.leaders) {
    const ld = getLeaderDef(l.id);
    if (!ld) continue;
    const bonuses = ld.levelBonuses[l.level - 1] || {};
    for (const [bid, b] of Object.entries(bonuses)) {
      if (bid === 'ALL') lAll += b;
      else if (bid === 'ALL_MATERIAL') lMat += b;
      else leaderBonusMap[bid] = (leaderBonusMap[bid] || 0) + b;
    }
    // 终极技能：远征 12/12 解锁后，在 Lv3 产出加成基础上再叠加 bonus（数据驱动，无新机制）
    if (colony.expeditionUnlocks?.includes(l.id) && ld.ultimateSkill) {
      const lv3 = ld.levelBonuses[ld.levelBonuses.length - 1] || {};
      for (const bid of Object.keys(lv3)) {
        if (bid === 'ALL' || bid === 'ALL_MATERIAL') continue;
        leaderBonusMap[bid] = (leaderBonusMap[bid] || 0) + ld.ultimateSkill.bonus;
      }
    }
  }

  // ===== 循环科技加成 =====
  const rl = colony.techState?.repeatableLevels || {};

  // ===== 量子实验室：科研产出加成 =====
  let b26Bonus = 0;
  if (colony.buildings.some((b) => b.active && b.defId === BUILDING_QUANTUM_LAB)) {
    b26Bonus = 0.5;
    for (const l of colony.leaders) {
      const bm = getLeaderDef(l.id)?.levelExtras[l.level - 1]?.b26Mult;
      if (bm) b26Bonus = Math.max(b26Bonus, bm - 1);
    }
  }

  const result: ColonyEconomy = {
    food: 0, alloy: 0, stardust: 0, gold: 0, research: 0,
    materials: {},
    ...computeColonyFoodCost(colony),
    buildings: [],
    power: computeColonyPower(colony),
  };

  // ===== 建筑产出 =====
  for (const inst of colony.buildings) {
    const def = getBuildingDef(inst.defId);
    if (!def || !def.outputType || def.outputType === 'power') continue;
    if (!inst.active || inst.assignedPop < def.minPop) continue;
    // 停电：跳过非电力产出
    if (blackout) continue;

    // 领袖指定建筑人口槽位扩展
    let effMaxPop = def.maxPop;
    for (const l of colony.leaders) {
      const extras = getLeaderDef(l.id)?.levelExtras[l.level - 1];
      if (extras?.popCapBonus?.[inst.defId]) effMaxPop = Math.max(effMaxPop, extras.popCapBonus[inst.defId]);
    }
    const effPop = Math.min(inst.assignedPop, effMaxPop);

    const leaderPct = ((leaderBonusMap[inst.defId] || 0) + lAll + (def.category === 'material' ? lMat : 0)) / 100;
    let repeatPct = 0;
    if (def.outputType === 'food') repeatPct = (rl.RP_FOOD || 0) * 0.05;
    else if (def.outputType === 'alloy') repeatPct = (rl.RP_ALLOY || 0) * 0.05;
    else if (def.outputType === 'stardust') repeatPct = (rl.RP_STARDUST || 0) * 0.05;
    else if (def.outputType === 'gold') repeatPct = (rl.RP_TRADE || 0) * 0.05;
    else if (def.outputType === 'material') repeatPct = (rl.RP_MATERIAL || 0) * 0.05;
    else if (def.outputType === 'research') repeatPct = (rl.RP_RESEARCH || 0) * 0.10;

    const entry: BuildingEconomyEntry = {
      uid: inst.uid, defId: inst.defId, outputType: def.outputType,
      effPop, base: 0, planetPct: 0, leaderPct, repeatPct, b26Pct: 0, value: 0,
    };

    if (def.outputType === 'gold') {
      const min = def.goldOutputMin || 0, max = def.goldOutputMax || 0;
      const roll = random
        ? Math.floor(Math.random() * (max - min + 1)) + min
        : Math.floor((min + max) / 2);
      const tm = buffs?.tradeMult ? (buffs.tradeMult - 1) : 0;
      entry.planetPct = tm;
      entry.value = Math.ceil(roll * (1 + leaderPct + repeatPct + tm));
      result.gold += entry.value;
    } else if (def.outputType === 'material' && def.outputMaterialId) {
      const base = (def.popFactor || 0) * effPop;
      const matMult = buffs?.materialMults?.[def.outputMaterialId];
      const pm = matMult ? (matMult - 1) : 0;
      entry.base = base; entry.planetPct = pm; entry.materialId = def.outputMaterialId;
      entry.value = Math.ceil(base * (1 + pm + leaderPct + repeatPct));
      result.materials[def.outputMaterialId] = (result.materials[def.outputMaterialId] || 0) + entry.value;
    } else if (def.outputType === 'research') {
      const base = (def.popFactor || 0) * effPop;
      const pm = buffs?.researchMult ? (buffs.researchMult - 1) : 0;
      entry.base = base; entry.planetPct = pm; entry.b26Pct = b26Bonus;
      entry.value = Math.ceil(base * (1 + pm + leaderPct + b26Bonus + repeatPct));
      result.research += entry.value;
    } else {
      // food / alloy / stardust：baseOutput + popFactor × 人口
      const base = (def.baseOutput || 0) + (def.popFactor || 0) * effPop;
      const mult = def.outputType === 'food' ? buffs?.foodMult
        : def.outputType === 'alloy' ? buffs?.alloyMult
        : buffs?.stardustMult;
      const pm = mult ? (mult - 1) : 0;
      entry.base = base; entry.planetPct = pm;
      entry.value = Math.ceil(base * (1 + pm + leaderPct + repeatPct));
      // 合金精炼手册 r_008：每座在产合金建筑 +1 合金（结算与显示共用）
      if (def.outputType === 'alloy' && hasAlloyManual) entry.value += 1;
      if (def.outputType === 'food') result.food += entry.value;
      else if (def.outputType === 'alloy') result.alloy += entry.value;
      else result.stardust += entry.value;
    }

    if (entry.value > 0) result.buildings.push(entry);
  }

  // ===== 领袖每回合特效 =====
  for (const l of colony.leaders) {
    const ex = getLeaderDef(l.id)?.levelExtras[l.level - 1];
    if (!ex) continue;
    if (ex.researchPerTurn) {
      const [lo, hi] = ex.researchPerTurn;
      result.research += random
        ? Math.floor(Math.random() * (hi - lo + 1)) + lo
        : Math.floor((lo + hi) / 2);
    }
    if (ex.stardustPerTurn) result.stardust += ex.stardustPerTurn;
    if (ex.darkMatterPerTurn) result.materials['dark_matter'] = (result.materials['dark_matter'] || 0) + ex.darkMatterPerTurn;
    if (ex.quantumPerTurn) result.materials['quantum'] = (result.materials['quantum'] || 0) + ex.quantumPerTurn;
    // 随机原料无法估算，仅在实际结算时掷骰
    if (random && ex.randomMatsPerTurn) {
      for (let i = 0; i < ex.randomMatsPerTurn; i++) {
        const mid = RANDOM_MAT_IDS[Math.floor(Math.random() * RANDOM_MAT_IDS.length)];
        result.materials[mid] = (result.materials[mid] || 0) + 1;
      }
    }
  }

  return result;
}
