// ==================== 殖民地建立初始化（唯一真值） ====================
// 由殖民面板的「建立殖民地」动作（hooks/colony/useColonyBase.foundColony）**立即调用**：母舰已停泊在该星球，无建设等待期。
// colonyTurn 的 scouting 分支只在旧存档（曾是 2 回合建设期）里走到，用 Object.assign 应用本函数。
// 旧的「面板 3 选 1 选星球」流程已随《星图更新》删除，勿再引回随机星球池。

import type { Colony, PlanetTypeId, BuildingInstance } from '@/types/colony';
import { ALL_PLANETS } from '@/data/colony/planets';
import { LEADER_CAP_BASE } from '@/data/colony/leaders';

/**
 * 把 colony 草稿补成"已建成"状态（含遗落星球赠送的 B7/B20/B21）。
 * 返回新对象，调用方负责写回（hook 里直接赋值，colonyTurn 里用 Object.assign 就地更新）。
 */
export function applyColonyFounding(colony: Colony, planetId: PlanetTypeId, name: string): Colony {
  const planetDef = ALL_PLANETS.find((p) => p.id === planetId);
  const initialCap = planetDef?.buffs.initialPopCap || 5;
  const initialPop = planetDef?.buffs.initialPop || 0;
  // 遗落星球赠送 B7/B20/B21
  const buildings: BuildingInstance[] = [];
  if (planetId === 'ruin') {
    buildings.push(
      { defId: 'B7', uid: 'B7_ruin_1', assignedPop: 0, buildProgress: 3, active: true },
      { defId: 'B20', uid: 'B20_ruin_1', assignedPop: 0, buildProgress: 3, active: true },
      { defId: 'B21', uid: 'B21_ruin_1', assignedPop: 0, buildProgress: 4, active: true },
    );
  }
  return {
    ...colony,
    phase: 'active',
    planetType: planetId,
    planetName: name,
    buildings,
    population: { total: initialPop, available: initialPop, cap: initialCap },
    techState: { researched: [], currentResearch: null, currentProgress: 0, researchPoints: 500, researchSeed: 0, repeatableLevels: {} },
    leaders: [],
    leaderCap: LEADER_CAP_BASE,
    energy: 0,
    blackoutGuardTurns: 0,
  };
}
