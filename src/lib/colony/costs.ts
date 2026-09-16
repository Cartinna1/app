// ==================== 殖民地建造/招募「实际成本与上限」（唯一真值） ====================
// 本模块集中"实际成本 / 实际上限"的计算，供 hook（结算）与 UI（显示）共用。
// 历史坑：面板只按星球倍率显示造价与招募单价，而 hook 实扣还含领袖减免，
// 导致"显示 15000 实扣 7500""金币足够却被判不足"这类 UI/hook 分叉——不要再就地重算。

import type { BuildingDef, Colony } from '@/types/colony';
import { getBuildingDef } from '@/data/colony/buildings';
import { getLeaderDef } from '@/data/colony/leaders';
import { ALL_PLANETS } from '@/data/colony/planets';

/** 招募人口基础单价（唯一锚点，勿在 UI/hook 就地硬编码） */
export const RECRUIT_BASE_COST = 2000;

/** 建筑实际可建造数量上限（含领袖扩展，如 L12 共鸣·菲尼克斯 Lv2 给星尘捕获网 +1）；无上限返回 undefined */
export function getEffectiveMaxCount(def: BuildingDef, colony: Colony): number | undefined {
  let max = def.maxCount;
  // 数据驱动：levelExtras.buildingMaxCountBonus（如 L6/L9 的原料建筑 +1、L12 的 B9 +1）
  for (const l of colony.leaders || []) {
    const bonus = getLeaderDef(l.id)?.levelExtras[l.level - 1]?.buildingMaxCountBonus?.[def.id] || 0;
    if (bonus) max = (max ?? 0) + bonus;
  }
  return max;
}

/** 建筑实际人口上限（含领袖 levelExtras.popCapBonus 槽位覆盖，多领袖取最高；缺省为基础 maxPop） */
export function getEffectiveMaxPop(defId: string, colony: Colony): number {
  const def = getBuildingDef(defId);
  let effMax = def?.maxPop ?? 0;
  for (const l of colony.leaders || []) {
    const extras = getLeaderDef(l.id)?.levelExtras[l.level - 1];
    if (extras?.popCapBonus?.[defId]) effMax = Math.max(effMax, extras.popCapBonus[defId]);
  }
  return effMax;
}

/** 建筑实际造价倍率（星球造价倍率 × 领袖减免；下限 0.1，与结算一致） */
export function getBuildingCostMult(defId: string, colony: Colony): number {
  const planet = colony.planetType ? ALL_PLANETS.find((p) => p.id === colony.planetType) : null;
  const planetCostMult = planet?.buffs.buildCostMult || 1;
  let leaderCostRedPct = 0;
  for (const l of colony.leaders || []) {
    const ex = getLeaderDef(l.id)?.levelExtras[l.level - 1];
    // 通用造价减免（buildCostReduction，如 L18 盖亚）
    leaderCostRedPct += (ex?.buildCostReduction || 0);
    // 穹顶都市（B2）专属减免（b2CostReduction，如 L16 穹顶之父）
    if (defId === 'B2') leaderCostRedPct += (ex?.b2CostReduction || 0);
  }
  return Math.max(0.1, planetCostMult * (1 - leaderCostRedPct / 100));
}

/** 建筑实际造价与工期（金币/合金/原料按实际倍率 ceil；工期含星球回合修正） */
export function getBuildingCostProfile(def: BuildingDef, colony: Colony): {
  gold: number;
  alloy: number;
  materials: Record<string, number>;
  turns: number;
  costMult: number;
} {
  const costMult = getBuildingCostMult(def.id, colony);
  const planet = colony.planetType ? ALL_PLANETS.find((p) => p.id === colony.planetType) : null;
  const turnDelta = planet?.buffs.buildTurnDelta || 0;
  const materials: Record<string, number> = {};
  for (const [matId, amt] of Object.entries(def.costMaterials || {})) {
    materials[matId] = Math.ceil(amt * costMult);
  }
  return {
    gold: Math.ceil(def.costGold * costMult),
    alloy: def.costAlloy ? Math.ceil(def.costAlloy * costMult) : 0,
    materials,
    turns: Math.max(1, def.buildTurns + turnDelta),
    costMult,
  };
}

/** 招募每人实际费用（基础 2000 + 星球修正 + 领袖减免，下限 0） */
export function getRecruitCostPerPop(colony: Colony): number {
  const planet = colony.planetType ? ALL_PLANETS.find((p) => p.id === colony.planetType) : null;
  let delta = planet?.buffs.recruitCostDelta || 0;
  for (const l of colony.leaders || []) {
    delta += (getLeaderDef(l.id)?.levelExtras[l.level - 1]?.recruitCostBonus || 0);
  }
  return Math.max(0, RECRUIT_BASE_COST + delta);
}
