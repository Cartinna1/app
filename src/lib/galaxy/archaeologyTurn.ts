// ==================== 考古回合推进（纯逻辑） ====================
// 由 useTurn 在每回合结算时调用（编排器权威），直接改写传入的 ship 草稿（调用方已克隆）。
// 阶段花费由玩家动作支付（hooks/useGalaxy.ts 的 startExcavation / continueExcavation），
// 本模块只负责：倒计时、成功率判定、阶段推进、危险结算、奖励发放。
//
// 状态语义（ArchaeologyState.status）：
//   idle    等待玩家支付并开始/继续某一阶段（含"上一阶段刚完成、下一阶段待投入"）
//   digging 该阶段正在倒计时（pendingChoice 非空时暂停，等玩家抉择）
//   done    全部阶段完成

import type { Mothership } from '@/types/game';
import type { ArchaeologyReward, ArchaeologySite, ArchaeologyStage } from '@/types/galaxy';
import { getArchaeologySite } from '@/data/galaxy/archaeology';
import { getRelicById, RELIC_SEVENTH_LAYER } from '@/data/relics';
import { flattenCost, deductResource } from '@/lib/turn/resourceCost';

/** 基础成功率 / 每级领袖加成 / 每点难度惩罚 / 稳妥抉择加成 / 遗物加成 */
export const BASE_SUCCESS_RATE = 0.80;
export const LEADER_LEVEL_BONUS = 0.05;
export const DIFFICULTY_PENALTY = 0.12;
export const SAFE_CHOICE_BONUS = 0.10;
export const RELIC_SUCCESS_BONUS = 0.10;
export const MIN_SUCCESS_RATE = 0.15;
export const MAX_SUCCESS_RATE = 0.95;
/** 阶段成功时掷出「发现」小奖励的概率 */
export const DISCOVERY_CHANCE = 0.3;
/** 失败时额外耗时（回合） */
export const FAIL_EXTRA_TURNS = 1;
/** 危险结算：额外损失该阶段投入的比例 */
export const DANGER_LOSS_RATIO = 0.5;
/** 科研点奖励在无殖民地时的折算率（1 科研点 = 10 金币），避免奖励凭空消失 */
export const RESEARCH_TO_GOLD = 10;

/** 当前阶段成功率（唯一公式） */
export function excavationSuccessRate(
  ship: Mothership,
  stage: ArchaeologyStage,
  leaderLevel: number,
  choiceKind: 'safe' | 'risky' | null | undefined
): number {
  let rate = BASE_SUCCESS_RATE + LEADER_LEVEL_BONUS * Math.max(1, leaderLevel) - DIFFICULTY_PENALTY * stage.difficulty;
  if (choiceKind === 'safe') rate += SAFE_CHOICE_BONUS;
  if (ship.relics.some((r) => r.id === RELIC_SEVENTH_LAYER)) rate += RELIC_SUCCESS_BONUS;
  return Math.max(MIN_SUCCESS_RATE, Math.min(MAX_SUCCESS_RATE, rate));
}

/** 发放奖励（mult 用于稳妥推进/安全抉择的折扣；直接改写 ship 草稿） */
export function grantReward(
  ship: Mothership,
  reward: ArchaeologyReward | undefined,
  mult = 1,
  logs?: string[]
): void {
  if (!reward) return;
  const g = { ...ship.galaxy };
  const scale = (n: number) => Math.max(0, Math.round(n * mult));

  if (reward.gold) ship.gold += scale(reward.gold);
  if (reward.stardust) ship.stardust += scale(reward.stardust);
  if (reward.alloy) ship.alloy += scale(reward.alloy);
  if (reward.food) ship.food += scale(reward.food);
  if (reward.materials) {
    ship.materials = { ...ship.materials };
    for (const [id, amount] of Object.entries(reward.materials)) {
      ship.materials[id] = (ship.materials[id] || 0) + scale(amount);
    }
  }
  if (reward.researchPoints) {
    const rp = scale(reward.researchPoints);
    if (ship.colony?.techState) {
      ship.colony = { ...ship.colony, techState: { ...ship.colony.techState, researchPoints: ship.colony.techState.researchPoints + rp } };
    } else {
      ship.gold += rp * RESEARCH_TO_GOLD; // 无殖民地时折算成金币
    }
  }
  if (reward.relics) {
    const owned = new Set(ship.relics.map((r) => r.id));
    for (const id of reward.relics) {
      if (owned.has(id)) continue;
      const def = getRelicById(id);
      if (def) {
        ship.relics = [...ship.relics, def];
        owned.add(id);
        logs?.push(`获得遗物「${def.name}」`);
      }
    }
  }
  if (reward.permaBonuses) {
    const next = [...g.permaBonuses];
    for (const id of reward.permaBonuses) {
      if (!next.includes(id)) {
        next.push(id);
        logs?.push(`获得永久加成「${id}」`);
      }
    }
    g.permaBonuses = next;
  }
  if (reward.title) {
    if (!g.titles.includes(reward.title)) {
      g.titles = [...g.titles, reward.title];
      logs?.push(`获得称号「${reward.title}」`);
    }
  }
  ship.galaxy = g;
}

/** 危险结算：额外损失该阶段投入的一半（返回提示文案） */
function applyDanger(ship: Mothership, site: ArchaeologySite, stage: ArchaeologyStage): string {
  const cost = flattenCost(stage.cost);
  ship.materials = { ...ship.materials };
  for (const [key, amount] of Object.entries(cost)) {
    deductResource(ship, ship.colony, key, Math.round(amount * DANGER_LOSS_RATIO));
  }
  return `${site.name}·${stage.title} 发生意外，额外损失资源`;
}

/**
 * 阶段判定完成：成功则推进到下一阶段（或结束），失败则耗时 +1 并可能触发危险。
 * forced=true 用于「稳妥推进」保底（必成功、阶段小奖励减半）。
 */
export function resolveStage(
  ship: Mothership,
  site: ArchaeologySite,
  stageIndex: number,
  opts: { forced?: boolean; bonusMult?: number } = {}
): { success: boolean; siteDone: boolean; logs: string[] } {
  const logs: string[] = [];
  const g = { ...ship.galaxy };
  const archaeology = { ...g.archaeology };
  const st = archaeology[site.id];
  if (!st) return { success: false, siteDone: false, logs };
  const stage = site.stages[stageIndex];
  if (!stage) return { success: false, siteDone: false, logs };

  const leader = ship.colony?.leaders.find((l) => l.id === st.leaderId);
  const rate = excavationSuccessRate(ship, stage, leader?.level ?? 1, st.choiceKind);
  const ok = opts.forced || Math.random() < rate;

  if (!ok) {
    archaeology[site.id] = { ...st, fails: st.fails + 1, turnsLeft: stage.turns + FAIL_EXTRA_TURNS };
    ship.galaxy = { ...g, archaeology };
    logs.push(`${site.name}·${stage.title} 发掘受挫，需再花 ${stage.turns + FAIL_EXTRA_TURNS} 回合`);
    const dangerHit = st.choiceKind === 'risky' ? true : Math.random() < site.dangerRate;
    if (dangerHit) logs.push(applyDanger(ship, site, stage));
    return { success: false, siteDone: false, logs };
  }

  // 成功：先掷「发现」小奖励（稳妥推进减半）
  const bonusMult = opts.bonusMult ?? 1;
  if (stage.bonus && Math.random() < DISCOVERY_CHANCE) {
    grantReward(ship, stage.bonus, bonusMult, logs);
  }
  const next = stageIndex + 1;
  if (next >= site.stages.length) {
    archaeology[site.id] = { ...st, status: 'done', stageIndex: next, turnsLeft: 0, pendingChoice: null, choiceKind: null };
    ship.galaxy = { ...g, archaeology };
    logs.push(`${site.name} 全部阶段完成`);
    grantReward(ship, site.reward, 1, logs);
    return { success: true, siteDone: true, logs };
  }
  archaeology[site.id] = { ...st, status: 'idle', stageIndex: next, turnsLeft: site.stages[next].turns, fails: 0, pendingChoice: null, choiceKind: null };
  ship.galaxy = { ...g, archaeology };
  logs.push(`${site.name} 第 ${next} 阶段就绪，投入资源后可继续发掘`);
  return { success: true, siteDone: false, logs };
}

/** 每回合推进所有正在发掘的遗迹；返回本回合的日志（由 useTurn 写入 eventLog） */
export function processArchaeologyTurn(ship: Mothership): string[] {
  const logs: string[] = [];
  if (!ship.galaxy) return logs;
  const g = { ...ship.galaxy };

  for (const [siteId, state] of Object.entries(g.archaeology)) {
    if (state.status !== 'digging' || state.pendingChoice) continue;
    const site = getArchaeologySite(siteId);
    if (!site) continue;
    const turnsLeft = state.turnsLeft - 1;
    if (turnsLeft > 0) {
      ship.galaxy = { ...ship.galaxy, archaeology: { ...ship.galaxy.archaeology, [siteId]: { ...state, turnsLeft } } };
      continue;
    }
    logs.push(...resolveStage(ship, site, state.stageIndex).logs);
  }
  return logs;
}

/** 便捷校验：某遗迹当前是否可开始/继续发掘（返回错误文案或 null）
 *  「同一时间只能发掘一处」的规则由 useGalaxy.startExcavation 调用本函数强制执行。 */
export function canOpenExcavation(ship: Mothership, siteId: string): string | null {
  const site = getArchaeologySite(siteId);
  if (!site) return '遗迹数据缺失';
  const st = ship.galaxy?.archaeology?.[siteId];
  if (st?.status === 'done') return '此处遗迹已完成发掘';
  const active = Object.entries(ship.galaxy?.archaeology || {}).find(([id, s]) => id !== siteId && s.status === 'digging');
  if (active) return '同一时间只能发掘一处遗迹，请先完成或中止当前发掘';
  return null;
}
