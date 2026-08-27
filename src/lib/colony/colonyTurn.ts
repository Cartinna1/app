// ==================== 殖民地回合推进（纯逻辑，从 useColony 抽离） ====================
// 由 useTurn 在每回合结算时调用；直接改写传入的 ship 草稿（调用方已克隆）。

import type { Mothership } from '@/types/game';
import type { Colony, PlanetTypeId } from '@/types/colony';
import { ALL_PLANETS } from '@/data/colony/planets';
import { getBuildingDef } from '@/data/colony/buildings';
import { getTechById, REPEATABLE_TECHS } from '@/data/colony/techs';
import { getLeaderDef, LEADER_AFTERGLOW_PULSE } from '@/data/colony/leaders';
import { computeColonyEconomy, computeColonyPower } from './economy';
import { processWonderTurn } from './wonderTurn';
import { processExpeditionTurn } from './expeditionTurn';

/** 处理殖民地每个回合的推进（在 useTurn 中调用） */
export function processColonyTurn(ship: Mothership, _turn: number): void {
  const colony = ship.colony;
  if (!colony || colony.phase === 'inactive') return;

  // 探索倒计时
  if (colony.phase === 'scouting') {
    colony.scoutTurnsRemaining -= 1;
    if (colony.scoutTurnsRemaining <= 0) {
      colony.phase = 'selecting';
      // 生成星球池并存入状态，避免切 Tab 丢失
      const pool = [...ALL_PLANETS];
      const result: PlanetTypeId[] = [];
      for (let i = 0; i < 3; i++) {
        const idx = Math.floor(Math.random() * pool.length);
        result.push(pool[idx].id);
        pool.splice(idx, 1);
      }
      colony.scoutingPool = result;
    }
    return;
  }

  if (colony.phase !== 'active') return;

  // 重置本回合招募累计（每回合招募上限）
  colony.recruitedThisTurn = 0;

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

  // ===== 电能计算（在产出计算之前） =====
  if (colony.energy === undefined) colony.energy = 0;
  const power = computeColonyPower(colony);
  // 余晖脉冲 Lv3——停电保护
  const hasL22Lv3 = colony.leaders.some(l => l.id === LEADER_AFTERGLOW_PULSE && l.level >= 3);
  // 电能累积（容量上限 50，防止无限堆）
  const prevEnergy = typeof colony.energy === 'number' ? colony.energy : 0;
  const newEnergy = Math.max(-1, Math.min(50, prevEnergy + power.net));
  colony.energy = newEnergy;
  const blackout = newEnergy < 0 && !hasL22Lv3;

  // ===== 建筑产出 + 领袖每回合特效（统一走 economy 模块） =====
  const eco = computeColonyEconomy(colony, { blackout, random: true, relics: ship.relics });
  const totalRP = eco.research;

  for (const [mid, n] of Object.entries(eco.materials)) {
    if (n > 0) ship.materials = { ...(ship.materials || {}), [mid]: ((ship.materials || {})[mid] || 0) + n };
  }
  ship.food += eco.food;
  ship.alloy += eco.alloy;
  ship.stardust += eco.stardust;
  if (eco.gold > 0) {
    ship.gold += eco.gold;
    ship.goldLog = [{ turn: _turn, amount: eco.gold, reason: `殖民地「${colony.planetName}」贸易收入`, balanceAfter: ship.gold }, ...(ship.goldLog || [])].slice(0, 200);
  }

  // B28 克隆中心：每2回合免费1人口
  const b28 = colony.buildings.find((b) => b.active && b.defId === 'B28' && b.assignedPop > 0);
  if (b28 && _turn % 2 === 0 && colony.population.total < colony.population.cap) {
    colony.population.total += 1;
    colony.population.available += 1;
  }

  // 人口食物消耗（含领袖食物减免）
  ship.food -= eco.foodCost;

  // 人口上限重新计算（含领袖上限加成）
  colony.population.cap = calcPopCap(colony);

  // 领袖免费人口效果
  for (const l of colony.leaders) {
    const ld = getLeaderDef(l.id); const ex = ld?.levelExtras[l.level-1];
    if (ex?.freePopEveryTurns && _turn % ex.freePopEveryTurns === 0 && colony.population.total < colony.population.cap) {
      colony.population.total += 1; colony.population.available += 1;
    }
  }

  // 科研处理
  if (colony.techState) {
    colony.techState.researchPoints += totalRP;
    colony.techState.researchSeed = (colony.techState.researchSeed || 0) + 1;
    if (colony.techState.currentResearch) {
      const isPolar = planetDef && planetDef.id === 'polar';
      colony.techState.currentProgress += 1;
      const tid = colony.techState.currentResearch;
      const tech = getTechById(tid);
      const rpt = REPEATABLE_TECHS.find(rt => rt.id === tid);
      let targetTurns = tech ? tech.researchTurns : rpt ? rpt.researchTurns : 99;
      if (isPolar) targetTurns = Math.max(1, targetTurns - 1); // 极地：科研回合 -1（低温超导）
      if (colony.techState.currentProgress >= targetTurns) {
        if (rpt) {
          // 循环科技：叠加次数
          colony.techState.repeatableLevels = { ...(colony.techState.repeatableLevels || {}) };
          colony.techState.repeatableLevels[tid] = (colony.techState.repeatableLevels[tid] || 0) + 1;
        } else {
          colony.techState.researched = [...colony.techState.researched, tid];
        }
        colony.techState.currentResearch = null;
        colony.techState.currentProgress = 0;
      }
    }
  }

  // 领袖上限（科技+领袖，放在科研处理之后确保新研究的科技生效）
  colony.leaderCap = 3;
  if (colony.techState) {
    if (colony.techState.researched.includes('T23')) colony.leaderCap += 1;
    if (colony.techState.researched.includes('T24')) colony.leaderCap += 3;
  }
  for (const l of colony.leaders) {
    const ld = getLeaderDef(l.id); const ex = ld?.levelExtras[l.level-1];
    colony.leaderCap += (ex?.leaderCapBonus || 0);
  }

  // 奇观回合结算
  processWonderTurn(ship, _turn);

  // 远征回合推进（领袖剧情树）
  processExpeditionTurn(colony);
}

/** 每回合招募人口上限（基础5 + 领袖 recruitCapPerTurn）——单一真值，UI 与逻辑共用 */
export function getRecruitCapPerTurn(colony: Colony): number {
  let cap = 5;
  for (const l of colony.leaders || []) {
    const ld = getLeaderDef(l.id);
    cap += (ld?.levelExtras[l.level - 1]?.recruitCapPerTurn || 0);
  }
  return cap;
}

/** 人口上限计算（含星球初始上限、居住建筑、领袖加成） */
export function calcPopCap(colony: Colony): number {
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
