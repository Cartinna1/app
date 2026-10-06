// ============================================================================
// 《航空生涯之旅》舰队卡牌 · 规则引擎
// 逐字搬移自 carddemo/engine.js（依据《舰队卡牌游戏设计方案 V1.5 定案版》）。
// 只调整了两件事：① import / 类型注解；② 数据与逻辑分离——
//   费/攻/盾/体/系列/稀有度/文案在 data/battle/cards.ts，编制在 data/battle/fleets.ts，
//   敌人数据在 data/battle/pirates.ts，数值锚点在 data/battle/tuning.ts。
//   本文件只保留「按卡 id 索引的行为表」（kw / fx / dynamicCost）与全部规则逻辑。
// ⚠ 判定顺序、数值、随机数消耗次数必须与 DEMO 完全一致；不要"顺手优化"。
// ============================================================================

import { BATTLE_CARDS } from '@/data/battle/cards';
import { FLEET_ALL, FLEET_STARTER } from '@/data/battle/fleets';
import { PIRATE_BOSSES, PIRATE_POOL } from '@/data/battle/pirates';
import { BATTLE_TUNING } from '@/data/battle/tuning';
import type {
  BattleApi,
  BattleResult,
  BattleSide,
  BattleSideState,
  BattleState,
  BattleUnit,
  CardBehavior,
  CardKeywords,
  CardTable,
  CreateBattleOptions,
  DamageResult,
  KeywordValue,
  PirateBossId,
  PirateBossTable,
  ShipCardId,
} from '@/types/battle';
import { makeRng } from './rng';
import type { Rng } from './rng';

// 随机数发生器同样从引擎出口暴露（对拍脚本会按这个名字取）
export { makeRng };

// ---------------- 数值锚点（唯一位置：data/battle/tuning.ts） ----------------
export const TURN_LIMIT: number = BATTLE_TUNING.turnLimit;   // 回合上限
export const BOARD_SIZE: number = BATTLE_TUNING.boardSize;  // 场上限
export const BODY_HP: number = BATTLE_TUNING.bodyHp;        // 玩家本体
export const MANA_CAP: number = BATTLE_TUNING.manaCap;      // 指挥度上限

// ---------------- 数据层再导出（与 DEMO 的导出面一致） ----------------
export { FLEET_ALL, FLEET_STARTER, PIRATE_BOSSES, PIRATE_POOL };

// ============================================================================
// 卡牌行为表（kw / fx / dynamicCost）
// 数据（费/攻/盾/体/系列/稀有度/文案）来自 BATTLE_CARDS，此处只补行为，
// 与 DEMO 的 def({...}) 一一对应：缺 kw 的卡写空对象，缺 fx 的卡不写 fx。
// ============================================================================
const BEHAVIOR: Record<string, CardBehavior> = {
  // —— 圣辉圣堂 ——
  h1: { kw: {}, fx: { turnEnd(u, api) { api.adjacent(u).forEach(a => api.repair(a, 1)); } } },
  h2: { kw: {}, fx: { play(_u, api) { api.healBody(1); } } },
  h3: { kw: {}, fx: { play(_u, api) { api.beginChoose('smite', 1, 'enemy'); } } },
  h4: { kw: { taunt: true }, fx: { turnEnd(u, api) { api.allies(u).forEach(a => api.buffShield(a, 1)); } } },
  h5: { kw: {}, fx: { play(_u, api) { api.summon('t_monk'); api.summon('t_monk'); } } },
  h6: { kw: {}, fx: { play(_u, api) { api.beginRevive(3); } } },
  h7: {
    kw: {},
    fx: {
      turnStart(u, api) { api.healBody(2); api.allies(u).forEach(a => api.repair(a, 2)); },
      death(_u, api) { api.healBody(5); },
    },
  },
  // —— 铁血军阀 ——
  i1: { kw: {}, fx: { death(_u, api) { const a = api.randomAlly(); if (a) api.buffAtk(a, 1); } } },
  i2: { kw: { berserk: 2 } },
  i3: { kw: {}, fx: { play(_u, api) { api.damageBody(2); } } },
  i4: { kw: { taunt: true }, fx: { death(_u, api) { api.summon('t_wing'); api.summon('t_wing'); } } },
  i5: { kw: {}, fx: { play(u, api) { api.allies(u).forEach(a => api.buffAtkTemp(a, 2)); } } },
  i6: { kw: {}, fx: { death(u, api) { api.enemies(u).forEach(e => api.damage(e, 2)); } } },
  i7: { kw: { pierce: true, recoil: 2 } },
  // —— 灵能舰队 ——
  p1: { kw: {}, fx: { play(_u, api) { api.beginChoose('freeze', 1, 'enemy'); } } },
  p2: { kw: {}, fx: { play(_u, api) { api.beginChoose('freeze', 2, 'enemy'); } } },
  p3: { kw: { subm: true }, fx: { death(_u, api) { api.summon('t_mirage'); } } },
  p4: { kw: {}, fx: { turnEnd(_u, api) { const e = api.randomEnemy(); if (e) api.buffAtk(e, -2); } } },
  p5: { kw: {}, fx: { play(_u, api) { api.beginChoose('copy', 1, 'any'); } } },
  p6: { kw: {}, fx: { play(u, api) { api.allies(u).forEach(a => { api.buffAtk(a, 2); api.buffShield(a, 2); }); } } },
  p7: { kw: {}, fx: { play(_u, api) { api.beginSteal(3); } } },
  // —— 黄金财团 ——
  g1: { kw: {}, fx: { death(_u, api) { api.gainMana(1); } } },
  g2: { kw: {}, fx: { play(u, api) { if (api.mana() >= 4) api.buffAtk(u, 1); } } },
  g3: { kw: {}, fx: { turnEnd(_u, api) { api.gainMana(1); api.damageOwnBody(1); } } },
  g4: { kw: {}, fx: { play(_u, api) { api.capUp(1); } } },
  g5: { kw: {}, fx: { play(_u, api) { api.costReduce(1); } } },
  g6: {
    kw: { overload: 2, minCostZero: true },
    dynamicCost(_u, api) { return -api.friendlyCount(); },
  },
  // —— 通用舰 ——
  c1: { kw: {} },
  c2: { kw: { taunt: true } },
  c3: { kw: {} },
  c4: { kw: {}, fx: { turnEnd(u, api) { api.adjacent(u).forEach(a => api.repair(a, 2)); } } },
  c5: { kw: {} },
  c6: { kw: {}, fx: { play(_u, api) { const e = api.randomEnemy(); if (e) api.damage(e, 3); } } },
  // —— 海盗（PvE 专属）——
  r1: { kw: {} },
  r2: { kw: {} },
  r3: { kw: {}, fx: { play(u, api) { api.adjacent(u).forEach(a => { a.sick = false; }); } } },
  r4: { kw: {}, fx: { play(u, _api) { u.kw.rush = true; } } },
  r5: { kw: {}, fx: { play(_u, api) { api.gainMana(1); api.gainManaFoe(1); } } },
  r6: { kw: { brk: true } },
  r7: { kw: { plunder: 2 } },
  r8: { kw: {}, fx: { play(_u, api) { api.summon('t_claw'); api.summon('t_claw'); } } },
  r9: { kw: { desper: 2, bloodlust: true } },
  r10: { kw: { taunt: true, pierce: true }, fx: { play(_u, api) { api.summon('t_cannon'); api.summon('t_cannon'); } } },
  // —— 衍生单位（不进卡池）——
  t_monk: { kw: {} },
  t_wing: { kw: {} },
  t_mirage: { kw: {} },
  t_claw: { kw: {} },
  t_cannon: { kw: {} },
  t_wreck: { kw: {} },
  t_grunt: { kw: {} },
};

/** 空关键词（数据层没有 kw，运行期按空对象处理——与 DEMO def() 的默认值一致） */
const EMPTY_KW: CardKeywords = {};

/** 卡牌表：数据层 + 行为表（DEMO 的 CARDS） */
export const CARDS: CardTable = (() => {
  const out: CardTable = {};
  const ids = Object.keys(BATTLE_CARDS);
  for (const id of ids) {
    const base = BATTLE_CARDS[id];
    if (!base) continue;
    const behavior = BEHAVIOR[id];
    out[id] = {
      ...base,
      kw: behavior ? behavior.kw : EMPTY_KW,
      ...(behavior && behavior.fx ? { fx: behavior.fx } : {}),
      ...(behavior && behavior.dynamicCost ? { dynamicCost: behavior.dynamicCost } : {}),
    };
  }
  return out;
})();

/** 敌方表（DEMO 的 BOSSES） */
export const BOSSES: PirateBossTable = PIRATE_BOSSES;

// ---------------- 战斗状态 ----------------
let __uid = 0;

// ---------------- 内部类型谓词 / 工具 ----------------
/** board 上空槽为 null；filter(Boolean) 不收窄类型，用类型谓词收窄 */
const alive = (b: (BattleUnit | null)[]): BattleUnit[] => b.filter((x): x is BattleUnit => !!x);
/** 关键词取值是否为真（布尔关键词为 true、数值关键词为非 0 数） */
const kwOn = (v: KeywordValue | undefined): boolean => (typeof v === 'number' ? v !== 0 : !!v);

function other(s: BattleSide): BattleSide { return s === 'player' ? 'boss' : 'player'; }
function log(st: BattleState, text: string): void { st.log.push(text); if (st.log.length > 4000) st.log.shift(); }
function S(st: BattleState, side: BattleSide): BattleSideState { return st[side]; }

// DEMO 的 Engine 里带着 other / log（内部工具），这里同样具名导出以保持导出面一致
export { log, other };

function makeSide(id: BattleSide, pool: readonly ShipCardId[], bodyHp: number, startCap: number, isBoss: boolean, bossId?: PirateBossId): BattleSideState {
  return {
    id, isBoss, bossId: bossId || null,
    body: bodyHp, bodyMax: bodyHp,
    pool: pool.slice(),          // 未部署的舰船（部署后移出；被击毁则永久消失）
    lost: [],                    // 已永久损失的舰船
    grave: [],                   // 墓地（供「召回」使用）
    board: new Array(BOARD_SIZE).fill(null),
    cap: startCap, cur: 0, capBonus: 0, costReduce: 0, overloadNext: 0,
    ownTurns: 0, deployed: 0, kills: 0,
  };
}

export function createBattle(opts?: CreateBattleOptions): BattleState {
  const o = opts || {};
  const rnd: Rng = makeRng(o.seed == null ? Date.now() : o.seed);
  const playerFirst = o.playerFirst == null ? rnd() < 0.5 : !!o.playerFirst;
  const bossId: PirateBossId = o.bossId || 'b1';
  const fleet: readonly ShipCardId[] = o.fleet === 'all' ? FLEET_ALL : FLEET_STARTER;
  const st: BattleState = {
    rnd,
    bossId,
    round: 1,
    active: playerFirst ? 'player' : 'boss',
    firstSide: playerFirst ? 'player' : 'boss',
    over: false, winner: null, reason: '',
    log: [],
    pending: null,   // 待玩家选择的交互（如「记忆掠夺者」选复制目标）
    stat: { player: { heal: 0, dmg: 0, healEvents: 0 }, boss: { heal: 0, dmg: 0, healEvents: 0 } },
    player: makeSide('player', fleet, BODY_HP, playerFirst ? BATTLE_TUNING.firstCap : BATTLE_TUNING.secondCap, false),
    boss: makeSide('boss', PIRATE_POOL, BOSSES[bossId].hp, playerFirst ? BATTLE_TUNING.secondCap : BATTLE_TUNING.firstCap, true, bossId),
  };
  // 掷骰先后手
  log(st, `掷骰结果：${playerFirst ? '玩家' : 'BOSS'} 先手（先手 3 指挥度、后手 4 指挥度）`);
  log(st, `BOSS：${BOSSES[bossId].name}（本体 ${BOSSES[bossId].hp} 血）—— ${BOSSES[bossId].skill}`);
  // 红胡子开场自带 1 艘杂兵
  if (bossId === 'b1') {
    const u = spawnUnit(st, 'boss', 't_grunt');
    placeUnit(st, 'boss', u, firstEmpty(st.boss.board));
    log(st, `【头目技能】红胡子开场自带 1 艘海盗杂兵 1/2/0`);
  }
  startTurn(st, st.active);
  return st;
}

export function spawnUnit(_st: BattleState, side: BattleSide, cardId: ShipCardId): BattleUnit {
  const c = CARDS[cardId];
  return {
    uid: 'u' + (++__uid), cardId, side,
    name: c.name, series: c.series, rarity: c.rarity, text: c.text,
    atk: c.atk, baseAtk: c.atk, tempAtk: 0,
    shield: c.shield, maxShield: c.shield, baseShield: c.shield,
    structure: c.structure, maxStructure: c.structure,
    kw: Object.assign({}, c.kw),
    sick: true, subm: !!c.kw.subm, frozen: 0, skip: false,
    attacksUsed: 0, extra: 0, desperDone: false, token: !!c.token,
  };
}

export function firstEmpty(board: (BattleUnit | null)[]): number {
  for (let i = 0; i < BOARD_SIZE; i++) if (!board[i]) return i;
  return -1;
}
export function placeUnit(st: BattleState, side: BattleSide, u: BattleUnit, slot: number): boolean {
  if (slot < 0 || slot >= BOARD_SIZE || S(st, side).board[slot]) return false;
  S(st, side).board[slot] = u; u.slot = slot; return true;
}
export function findUnit(st: BattleState, uid: string): BattleUnit | null {
  for (const side of ['player', 'boss'] as const) {
    for (const u of S(st, side).board) if (u && u.uid === uid) return u;
  }
  return null;
}
export function unitsOf(st: BattleState, side: BattleSide): BattleUnit[] { return alive(S(st, side).board); }
export function enemiesOf(st: BattleState, side: BattleSide): BattleUnit[] { return unitsOf(st, other(side)); }
export function effAtk(u: BattleUnit): number {
  let a = u.atk;
  if (kwOn(u.kw.berserk) && u.structure <= u.maxStructure / 2 && u.maxStructure > 0) a += u.kw.berserk as number;
  if (kwOn(u.kw.desper) && u.structure <= u.maxStructure / 2 && u.maxStructure > 0) a += u.kw.desper as number;
  return Math.max(0, a);
}

/** 单位状态标记（界面徽章与引擎判定共用同一份，避免两处分叉） */
export function unitFlags(u: BattleUnit): string[] {
  const f: string[] = [];
  if (kwOn(u.kw.taunt)) f.push('taunt');
  if (u.skip || u.frozen > 0) f.push('frozen');   // ⚠ 冻结的「跳过攻击」标记必须能显示，否则玩家看不出原因
  if (u.sick && !kwOn(u.kw.rush)) f.push('sick');
  if (u.subm) f.push('subm');
  return f;
}

/** 为什么这艘不能攻击（把原因说清楚，别只回一句"不能攻击"） */
export function attackReason(st: BattleState, side: BattleSide, u: BattleUnit | null | undefined): string {
  if (!u) return '找不到这艘战舰';
  if (u.side !== side) return '那不是你的战舰';
  if (st.active !== side) return '现在不是你的回合';
  if (u.skip) return '该舰被「冻结」，本回合跳过攻击';
  if (u.frozen > 0) return '该舰被「冻结」，本回合不能攻击';
  if (u.sick && !kwOn(u.kw.rush)) return '该舰刚部署（召唤失调），本回合不能攻击';
  if (u.attacksUsed >= 1 + u.extra) return '该舰本回合已经攻击过了';
  if (effAtk(u) <= 0) return '该舰攻击力为 0，无法攻击';
  return '该舰本回合不能攻击';
}

// ---------------- 伤害 ----------------
export function damageUnit(_st: BattleState, u: BattleUnit, amount: number, ignoreShield?: boolean): DamageResult {
  if (amount <= 0) return { dealt: 0, overflow: 0, destroyed: false };
  // 【边界规则】无视护盾（破甲 / 神罚）打「零结构值」的舰 → 直接击毁：
  // 这类舰唯一的承伤层就是护盾，护盾被无视了就没有东西能吸收。
  // 否则会出现「无视了你的护盾、但你毫发无伤」的怪结果（它们结构值恒为 0，扣不动）。
  if (ignoreShield && (u.maxStructure || 0) <= 0) {
    u.structure = -1; u.shield = 0;
    return { dealt: amount, overflow: 0, destroyed: true };
  }
  let left = amount, dealt = 0;
  if (!ignoreShield) { const s = Math.min(u.shield, left); u.shield -= s; left -= s; dealt += s; }
  if (left > 0) { const p = Math.min(u.structure, left); u.structure -= p; left -= p; dealt += p; }
  // 亡命：掉到半血时一次性补护盾
  if (kwOn(u.kw.desper) && !u.desperDone && u.maxStructure > 0 && u.structure > 0 && u.structure <= u.maxStructure / 2) {
    u.desperDone = true; u.shield += u.kw.desper as number; u.maxShield += u.kw.desper as number;
  }
  // 下场判据：结构值 ≤0 **且** 护盾 ≤0。
  // 海盗全体是「零结构值」设计（结构值 0）——护盾一破即下场，这正是「攻击力 > 护盾即下场」。
  return { dealt, overflow: left, destroyed: u.structure <= 0 && u.shield <= 0 };
}
export function damageBody(st: BattleState, side: BattleSide, amount: number): number {
  if (amount <= 0) return 0;
  const s = S(st, side);
  s.body -= amount;
  if (st.stat) st.stat[side].dmg += amount;
  return amount;
}

// ---------------- 部署 ----------------
export function costOf(st: BattleState, side: BattleSide, cardId: ShipCardId): number {
  const c = CARDS[cardId];
  const s = S(st, side);
  let cost = c.cost - s.costReduce;
  if (c.dynamicCost) cost += c.dynamicCost(null, api(st, side));
  const min = kwOn(c.kw.minCostZero) ? 0 : 1;
  return Math.max(min, cost);
}
export function canDeploy(st: BattleState, side: BattleSide, cardId: ShipCardId): boolean {
  if (st.over || st.active !== side) return false;
  if (st.pending) return false;   // 有待选择的效果时先完成选择
  const s = S(st, side);
  return costOf(st, side, cardId) <= s.cur && firstEmpty(s.board) >= 0 && s.pool.indexOf(cardId) >= 0;
}
export function deploy(st: BattleState, side: BattleSide, cardId: ShipCardId, slot?: number | null): BattleResult {
  if (!canDeploy(st, side, cardId)) return { ok: false, msg: '不能部署（指挥度/场上/池子不足）' };
  if (slot == null || slot < 0) slot = firstEmpty(S(st, side).board);
  if (S(st, side).board[slot]) return { ok: false, msg: '该位置已有战舰' };
  const c = CARDS[cardId];
  const cost = costOf(st, side, cardId);
  const s = S(st, side);
  const idx = s.pool.indexOf(cardId); s.pool.splice(idx, 1);
  s.cur -= cost; s.deployed++;
  const u = spawnUnit(st, side, cardId);
  placeUnit(st, side, u, slot);
  log(st, `${label(side)} 部署 ${u.name}（${cost} 费，${u.atk}/${u.maxShield}/${u.maxStructure}）`);
  if (c.fx && c.fx.play) c.fx.play(u, api(st, side));
  cleanup(st);
  return { ok: true, unit: u };
}

// ---------------- 攻击 ----------------
export function canAttack(st: BattleState, side: BattleSide, u: BattleUnit | null | undefined): boolean {
  if (!u || u.side !== side || st.over || st.active !== side) return false;
  if (u.frozen > 0 || u.skip) return false;
  if (u.sick && !kwOn(u.kw.rush)) return false;
  if (u.attacksUsed >= 1 + u.extra) return false;
  return effAtk(u) > 0;   // 0 攻的舰不能攻击（同主流卡牌游戏）
}
export function legalTargets(st: BattleState, side: BattleSide): BattleUnit[] {
  const foes = enemiesOf(st, side).filter(u => !u.subm);
  if (foes.some(u => kwOn(u.kw.taunt))) return foes.filter(u => kwOn(u.kw.taunt));
  return foes;
}
export function attack(st: BattleState, attackerUid: string, targetRef: string): BattleResult {
  const side = st.active;
  const u = findUnit(st, attackerUid);
  if (st.pending) return { ok: false, msg: '先完成当前选择（请点一艘要复制的战舰）' };
  if (!canAttack(st, side, u)) return { ok: false, msg: attackReason(st, side, u) };
  const attacker = u as BattleUnit;
  let target: BattleUnit | null = null;
  let isBody = false;
  if (targetRef === 'body') isBody = true;
  else { target = findUnit(st, targetRef); if (!target) return { ok: false, msg: '目标不存在' }; }
  const legal = legalTargets(st, side);
  // 只有「场上存在锁链」才禁止打本体；对方只是有普通战舰时，本体照样可以打
  const tauntOnBoard = enemiesOf(st, side).some(x => kwOn(x.kw.taunt) && !x.subm);
  if (!isBody) {
    if (!legal.some(x => x.uid === (target ? target.uid : ''))) return { ok: false, msg: '必须优先攻击带「锁链」的战舰' };
  } else if (tauntOnBoard) {
    return { ok: false, msg: '对方有带「锁链」的战舰，必须先打它' };
  }
  const power = effAtk(attacker);
  const retal = target ? effAtk(target) : 0;
  attacker.attacksUsed++;
  const targetName = isBody ? label(other(side)) + '本体' : (target ? target.name : '');
  log(st, `${label(side)} ${attacker.name}(${power} 攻) → ${targetName}${kwOn(attacker.kw.brk) ? '【破甲】' : ''}`);
  let res: DamageResult = { dealt: 0, destroyed: false, overflow: 0 };
  if (isBody) {
    damageBody(st, other(side), power);
    if (kwOn(attacker.kw.plunder)) { S(st, side).cur += attacker.kw.plunder as number; log(st, `  掠夺 ${attacker.kw.plunder}：本回合指挥度 +${attacker.kw.plunder}`); }
  } else if (target) {
    res = damageUnit(st, target, power, !!attacker.kw.brk);
    if (kwOn(attacker.kw.pierce) && res.destroyed && res.overflow > 0) {
      damageBody(st, other(side), res.overflow);
      log(st, `  贯穿：溢出 ${res.overflow} 点打到本体`);
    }
  }
  if (retal > 0) {
    const r2 = damageUnit(st, attacker, retal);
    log(st, `  互伤：${attacker.name} 承受 ${retal} 点${r2.destroyed ? '（被击毁）' : ''}`);
  }
  if (kwOn(attacker.kw.recoil)) { damageUnit(st, attacker, attacker.kw.recoil as number); log(st, `  反噬：${attacker.name} 自伤 ${attacker.kw.recoil}`); }
  if (kwOn(attacker.kw.bloodlust) && res.destroyed && attacker.extra < 1) { attacker.extra = 1; log(st, `  嗜血：击毁目标，本回合可再攻击一次`); }
  cleanup(st);
  checkOver(st);
  return { ok: true };
}

// ---------------- 死亡结算 ----------------
export function cleanup(st: BattleState): void {
  for (let pass = 0; pass < 12; pass++) {
    let found: BattleUnit | null = null;
    for (const side of ['player', 'boss'] as const) {
      for (const u of S(st, side).board) if (u && u.structure <= 0 && u.shield <= 0) { found = u; break; }
      if (found) break;
    }
    if (!found) return;
    const side = found.side, s = S(st, side);
    s.board[found.slot as number] = null;
    s.grave.push(found.cardId);
    if (!found.token) { s.lost.push(found.cardId); }  // 永久损失（衍生单位不算）
    log(st, `${label(side)} ${found.name} 被击毁${found.token ? '（衍生）' : '，永久损失'}`);
    const c = CARDS[found.cardId];
    if (c.fx && c.fx.death) c.fx.death(found, api(st, side));
    // 卡尔戈：玩家每损失 1 艘，召唤 1 艘锈蚀残骸
    if (st.bossId === 'b4' && side === 'player') {
      const b = S(st, 'boss');
      const slot = firstEmpty(b.board);
      if (slot >= 0) { const w = spawnUnit(st, 'boss', 't_wreck'); placeUnit(st, 'boss', w, slot); log(st, `  【头目技能】锈钩召唤 1 艘锈蚀残骸`); }
    }
  }
}

// ---------------- 回合 ----------------
export function startTurn(st: BattleState, side: BattleSide): void {
  if (st.over) return;
  st.active = side;
  const s = S(st, side);
  s.ownTurns++;
  const base = (side === st.firstSide ? BATTLE_TUNING.firstCap : BATTLE_TUNING.secondCap) + (s.ownTurns - 1);
  s.cap = Math.min(MANA_CAP, base) + s.capBonus - s.overloadNext;
  s.overloadNext = 0;
  if (s.cap < 0) s.cap = 0;
  s.cur = s.cap;
  log(st, `—— 第 ${st.round} 回合 · ${label(side)}行动（指挥度 ${s.cur}/${s.cap}） ——`);
  // 护盾回充（V1.5：受伤未击毁的舰，下回合起每回合回 1，不超原始护盾值；无护盾的舰不回）
  for (const u of s.board) {
    if (!u) continue;
    if (u.maxShield > 0 && u.shield < u.maxShield) u.shield = Math.min(u.maxShield, u.shield + 1);
  }
  // 召唤失调解除 / 潜航解除 / 冻结结算
  for (const u of s.board) {
    if (!u) continue;
    u.sick = false; u.subm = false; u.attacksUsed = 0; u.extra = 0;
    if (u.frozen > 0) { u.frozen--; u.skip = true; log(st, `  ${u.name} 被冻结，跳过本次攻击`); }
    else u.skip = false;
  }
  // 回合开始钩子
  for (const u of s.board.slice()) {
    if (!u) continue;
    const fx = CARDS[u.cardId].fx;
    if (fx && fx.turnStart) fx.turnStart(u, api(st, side));
  }
  // 头目技能
  bossTurnStart(st, side);
  cleanup(st); checkOver(st);
}
function bossTurnStart(st: BattleState, side: BattleSide): void {
  if (side !== 'boss') return;
  if (st.bossId === 'b1') {
    const n = st.rnd() < 0.5 ? 1 : 2;
    const t = api(st, 'boss').topEnemies(n);
    t.forEach(u => api(st, 'boss').freeze(u, 1));
    if (t.length) log(st, `  【头目技能】红胡子冻结 ${t.map(u => u.name).join('、')}`);
  }
  if (st.bossId === 'b3' && S(st, 'boss').body <= 15) {
    damageBody(st, 'player', 1);
    log(st, `  【头目技能】深海威压：玩家本体 -1（当前 ${S(st, 'player').body}）`);
  }
}
export function endTurn(st: BattleState): void {
  if (st.over) return;
  // 防卡死：有待选择的效果而玩家没选，就自动选满
  if (st.pending) { log(st, '  （未做选择，自动取身材最强的目标）'); autoResolvePending(st); }
  const side = st.active, s = S(st, side);
  // 回合结束钩子
  for (const u of s.board.slice()) {
    if (!u) continue;
    const fx = CARDS[u.cardId].fx;
    if (fx && fx.turnEnd) fx.turnEnd(u, api(st, side));
  }
  // 撤销「本回合」类临时加成（战帅旗舰等）
  for (const u of s.board) if (u && u.tempAtk) { u.atk = Math.max(0, u.atk - u.tempAtk); u.tempAtk = 0; }
  // 头目回合结束技能
  if (side === 'boss') {
    if (st.bossId === 'b2') {
      // 【定稿·方案⑪】回合结束：若场上不足 3 艘则补到 3 艘（钩爪登陆艇）；然后全体己方 +1 护盾（每艘最多比原始高 2）
      // 为什么是这两条：原案「召唤 1 艘」实测是自伤（1/2/0 每回合占位，挡住她自己的强卡），
      // 单纯加数量完全无效（补到 3 艘实测玩家胜率仍是 100%）；真正有效的是让她的场站得住。
      const need = Math.max(0, 3 - s.board.filter(Boolean).length);
      for (let i = 0; i < need; i++) {
        const slot = firstEmpty(s.board);
        if (slot < 0) break;
        const c = spawnUnit(st, 'boss', 't_claw');
        placeUnit(st, 'boss', c, slot);
      }
      if (need > 0) log(st, `  【头目技能】黑寡妇：补 ${need} 艘钩爪登陆艇（补到 3 艘）`);
      let armorN = 0;
      s.board.forEach(x => {
        if (!x) return;
        if (x.maxShield >= (x.baseShield || 0) + 2) return;   // 加固上限：比原始护盾最多高 2（不做无限累加）
        x.shield += 1; x.maxShield += 1; armorN++;
      });
      log(st, `  【头目技能】黑寡妇：全体 +1 护盾（最多比原始高 2；本次 ${armorN} 艘）`);
    }
    if (st.bossId === 'b5' || st.bossId === 'b3') { /* 塞壬在下面统一处理 */ }
    if (st.bossId === 'b5') {
      // 【定稿·方案 A】回合结束：对随机一艘玩家战舰造成 1 点伤害（不打本体；玩家场上没有战舰时落空）
      // 为什么：原案「3 点随机分配（含旗舰）」实测玩家胜率仅 1~2%（3 点里约一半打本体，且对弱编制是免费清场），
      // 且没有任何反制手段；改成 1 点只打战舰后回到 50%（新手）/ 50%（全卡池）。
      const targets = unitsOf(st, 'player').slice();
      if (!targets.length) {
        log(st, '  【头目技能】苍白歌者：玩家场上没有战舰，伤害落空');
      } else {
        const t = targets[Math.floor(st.rnd() * targets.length)];
        damageUnit(st, t, 1);
        log(st, `  【头目技能】苍白歌者：${t.name} 受 1 点伤害`);
      }
    }
  }
  cleanup(st); checkOver(st);
  if (st.over) return;
  const nxt = other(side);
  if (nxt === st.firstSide) {
    st.round++;
    if (st.round > TURN_LIMIT) { settleByTurnLimit(st); return; }
  }
  startTurn(st, nxt);
}
function settleByTurnLimit(st: BattleState): void {
  st.over = true;
  const p = S(st, 'player').body, b = S(st, 'boss').body;
  if (p > b) { st.winner = 'player'; st.reason = `到达 ${TURN_LIMIT} 回合上限，本体 ${p} > ${b}`; }
  else if (b > p) { st.winner = 'boss'; st.reason = `到达 ${TURN_LIMIT} 回合上限，本体 ${b} > ${p}`; }
  else { st.winner = 'boss'; st.reason = `到达 ${TURN_LIMIT} 回合上限，本体同为 ${p}，判防守方（BOSS）胜`; }
  log(st, `【结束】${st.reason}`);
}
export function checkOver(st: BattleState): void {
  if (st.over) return;
  if (S(st, 'player').body <= 0) { st.over = true; st.winner = 'boss'; st.reason = '玩家本体结构值 ≤ 0'; log(st, `【结束】${st.reason}`); }
  else if (S(st, 'boss').body <= 0) { st.over = true; st.winner = 'player'; st.reason = 'BOSS 本体结构值 ≤ 0'; log(st, `【结束】${st.reason}`); }
}
function label(side: BattleSide): string { return side === 'player' ? '玩家' : 'BOSS'; }

// ---------------- 效果 API ----------------
export function api(st: BattleState, side: BattleSide): BattleApi {
  const foe = other(side);
  const self: BattleApi = {
    st, side, foe,
    mana: () => S(st, side).cur,
    friendlyCount: () => unitsOf(st, side).length,
    allies: (u) => unitsOf(st, side).filter(x => x.uid !== (u && u.uid)),
    enemies: (_u) => unitsOf(st, foe),
    adjacent(u) {
      const b = S(st, side).board, out: BattleUnit[] = [];
      const i = u.slot as number;
      if (b[i - 1]) out.push(b[i - 1] as BattleUnit);
      if (b[i + 1]) out.push(b[i + 1] as BattleUnit);
      return out;
    },
    strongestEnemy() { const e = unitsOf(st, foe); if (!e.length) return null; return e.slice().sort((a, b) => effAtk(b) - effAtk(a))[0]; },
    topEnemies(n) { const e = unitsOf(st, foe).slice().sort((a, b) => effAtk(b) - effAtk(a)); return e.slice(0, n); },
    randomEnemy() { const e = unitsOf(st, foe); return e.length ? e[Math.floor(st.rnd() * e.length)] : null; },
    randomAlly() { const a = unitsOf(st, side); return a.length ? a[Math.floor(st.rnd() * a.length)] : null; },
    damage(u, n, ignoreShield) { if (u) damageUnit(st, u, n, !!ignoreShield); },
    damageBody(n) { damageBody(st, foe, n); },
    damageOwnBody(n) { damageBody(st, side, n); },
    healBody(n) {
      const s = S(st, side); const before = s.body;
      s.body = Math.min(s.bodyMax, s.body + n);   // 上限 = 原始本体血量，回血不能超过它
      const got = s.body - before;
      if (st.stat && got > 0) { st.stat[side].heal += got; st.stat[side].healEvents++; }
    },
    buffAtk(u, n) { if (u) { u.atk = Math.max(0, u.atk + n); } },
    // 「本回合」类加成：记在 tempAtk 上，回合结束时撤销
    buffAtkTemp(u, n) { if (u) { u.atk = Math.max(0, u.atk + n); u.tempAtk = (u.tempAtk || 0) + n; } },
    buffShield(u, n) { if (u) { u.shield = Math.max(0, u.shield + n); if (n > 0) u.maxShield += n; } },
    repair(u, n) { if (u && u.maxShield > 0) u.shield = Math.min(u.maxShield, u.shield + n); else if (u) u.shield += n; },
    freeze(u, n) { if (u) u.frozen = Math.max(u.frozen, n); },
    gainMana(n) { S(st, side).cur += n; },
    gainManaFoe(n) { S(st, foe).cur += n; },
    capUp(n) { S(st, side).capBonus += n; },
    costReduce(n) { S(st, side).costReduce += n; },
    summon(cardId) {
      const b = S(st, side).board, slot = firstEmpty(b);
      if (slot < 0) { log(st, `  （场上已满，召唤 ${CARDS[cardId].name} 失败）`); return null; }
      const u = spawnUnit(st, side, cardId);
      placeUnit(st, side, u, slot);
      log(st, `  召唤 ${u.name}（${u.atk}/${u.maxShield}/${u.maxStructure}）`);
      return u;
    },
    // 召回：把「选哪一艘」交给玩家（候选 = 墓地里 ≤maxCost 费的友舰）
    beginRevive(maxCost) {
      const g = S(st, side).grave.filter(id => CARDS[id].cost <= maxCost && CARDS[id].cost > 0);
      const uniq = [...new Set(g)];
      if (!uniq.length) { log(st, `  （墓地没有 ≤${maxCost} 费的友舰可召回）`); return null; }
      st.pending = { side, kind: 'revive', cands: uniq, need: 1, picked: [] };
      log(st, `  【召回】等待选择要召回的友舰（${uniq.length} 艘，墓地）…`);
      return st.pending;
    },
    // 需要玩家指定目标的入场效果：挂一个「待选择」，交给玩家点（AI 与「未选就结束回合」都有兜底）
    beginChoose(kind, need, scope) {
      const pool = scope === 'enemy' ? unitsOf(st, foe) : unitsOf(st, 'player').concat(unitsOf(st, 'boss'));
      if (!pool.length) { log(st, `  【${PENDING_LABEL[kind]}】没有可选目标，效果落空`); return null; }
      const n = Math.min(need, pool.length);
      st.pending = { side, kind, cands: pool.map(x => x.uid), need: n, picked: [] };
      log(st, `  【${PENDING_LABEL[kind]}】等待选择目标（${n} 艘，${PENDING_HINT[kind]}）…`);
      return st.pending;
    },
    // 控制：把「抢哪一艘」交给玩家（候选 = 攻击 ≤maxAtk 的敌舰）
    beginSteal(maxAtk) {
      const cands = unitsOf(st, foe).filter(u => effAtk(u) <= maxAtk);
      if (!cands.length) { log(st, `  （对方没有攻击 ≤${maxAtk} 的战舰可控制）`); return null; }
      st.pending = { side, kind: 'steal', cands: cands.map(x => x.uid), need: 1, picked: [] };
      log(st, `  【控制】等待选择要夺取的敌方战舰（${cands.length} 艘）…`);
      return st.pending;
    },
  };
  return self;
}

// ---------------- 待选择效果（玩家指定目标） ----------------
export const PENDING_LABEL: Record<string, string> = { copy: '记忆掠夺者', smite: '神罚', freeze: '冻结', revive: '召回', steal: '控制' };
export const PENDING_HINT: Record<string, string> = { copy: '双方场上都可以', smite: '敌方场上', freeze: '敌方场上', revive: '点下方墓地里的友舰', steal: '敌方场上' };

/** 完成「待选择」的一次点击：need>1 时要收满才结算 */
export function resolvePending(st: BattleState, uid: string): BattleResult {
  const p = st.pending;
  if (!p) return { ok: false, msg: '当前没有待选择的效果' };
  if (p.cands.indexOf(uid) < 0) return { ok: false, msg: '这艘不是可选的目标' };
  if (p.picked.indexOf(uid) >= 0) return { ok: false, msg: '这艘已经选过了' };
  p.picked.push(uid);
  if (p.picked.length < p.need) {
    log(st, `  【${PENDING_LABEL[p.kind]}】已选 ${p.picked.length}/${p.need}`);
    return { ok: true, more: true };
  }
  const picks = p.picked.slice();
  const kind = p.kind, side = p.side;
  st.pending = null;
  if (kind === 'smite') {
    const t = findUnit(st, picks[0]);
    if (t) { damageUnit(st, t, 2, true); log(st, `  【神罚】${t.name} 受到 2 点伤害（无视护盾）`); }
  } else if (kind === 'freeze') {
    picks.forEach(id => {
      const t = findUnit(st, id);
      if (t) { t.frozen = Math.max(t.frozen, 1); log(st, `  【冻结】${t.name}`); }
    });
  } else if (kind === 'revive') {
    const cardId = picks[0];
    const slot = firstEmpty(S(st, side).board);
    if (slot < 0) log(st, '  （场上已满，召回失败）');
    else {
      const u = spawnUnit(st, side, cardId);
      placeUnit(st, side, u, slot);
      const gi = S(st, side).grave.lastIndexOf(cardId); if (gi >= 0) S(st, side).grave.splice(gi, 1);
      const li = S(st, side).lost.indexOf(cardId); if (li >= 0) S(st, side).lost.splice(li, 1);
      log(st, `  【召回】${u.name} 重新部署`);
    }
  } else if (kind === 'steal') {
    const t = findUnit(st, picks[0]);
    if (!t) log(st, '  （目标已不在场上）');
    else if (firstEmpty(S(st, side).board) < 0) log(st, '  （自方场上已满，控制失败）');
    else {
      const slot = firstEmpty(S(st, side).board);
      S(st, other(side)).board[t.slot as number] = null;
      t.side = side; placeUnit(st, side, t, slot); t.sick = true;
      log(st, `  【控制】夺取了 ${t.name}（带召唤失调）`);
    }
  } else {   // copy
    const t = findUnit(st, picks[0]);
    if (!t) log(st, '  （目标已不在场上）');
    else {
      const slot = firstEmpty(S(st, side).board);
      if (slot < 0) log(st, '  （场上已满，复制失败）');
      else {
        const u = spawnUnit(st, side, t.cardId);
        u.token = true; u.name = t.name + '（复制）';
        placeUnit(st, side, u, slot);
        log(st, `  【记忆掠夺者】复制 ${t.name}（${u.atk}/${u.maxShield}/${u.maxStructure}，含关键词）`);
      }
    }
  }
  cleanup(st); checkOver(st);
  return { ok: true };
}
/** 未做选择时的兜底：取身材总和最大的一艘（已选过的跳过） */
export function autoPickPending(st: BattleState): string | null {
  const p = st.pending;
  if (!p) return null;
  if (p.kind === 'revive') {   // 候选是墓地里的卡 id（不在场上），兜底取费用最高的
    const rest = p.cands.filter(id => p.picked.indexOf(id) < 0);
    if (!rest.length) { st.pending = null; return null; }
    return rest.slice().sort((a, b) => CARDS[b].cost - CARDS[a].cost)[0];
  }
  const cands = p.cands.map(id => findUnit(st, id)).filter((u): u is BattleUnit => !!u && p.picked.indexOf(u.uid) < 0);
  if (!cands.length) { st.pending = null; return null; }
  const best = cands.slice().sort((x, y) =>
    (y.atk + y.maxShield + y.maxStructure) - (x.atk + x.maxShield + x.maxStructure))[0];
  return best.uid;
}
/** 选满（AI 与「未选就结束回合」共用） */
export function autoResolvePending(st: BattleState): void {
  let g = 0;
  while (st.pending && g++ < 8) {
    const uid = autoPickPending(st);
    if (!uid) break;
    resolvePending(st, uid);
  }
}

// ---------------- AI ----------------
export function aiTurn(st: BattleState, side: BattleSide): void {
  let guard = 0;
  // 1) 部署：优先补锁链，其次按费用从高到低
  while (guard++ < 30) {
    const s = S(st, side);
    const opts = s.pool.filter(id => costOf(st, side, id) <= s.cur && firstEmpty(s.board) >= 0);
    if (!opts.length) break;
    const foes = enemiesOf(st, side);
    const needTaunt = foes.length > 0 && !unitsOf(st, side).some(u => kwOn(u.kw.taunt));
    let choice: ShipCardId | undefined;
    if (needTaunt) {
      const taunts = opts.filter(id => kwOn(CARDS[id].kw.taunt));
      if (taunts.length) choice = taunts.sort((a, b) => CARDS[b].cost - CARDS[a].cost)[0];
    }
    if (!choice) choice = opts.sort((a, b) => costOf(st, side, b) - costOf(st, side, a))[0];
    const r = deploy(st, side, choice, firstEmpty(s.board));
    if (!r.ok) break;
    if (st.over) return;
    // 部署可能挂起「待选择」（神罚/冻结/复制/召回/控制）——AI 立刻自己选满再继续，
    // 否则 canDeploy/canAttack 会一直被 pending 拦住，导致 AI 的回合被截断
    autoResolvePending(st);
  }
  // 1b) 待选择（玩家指定目标类）：AI 自动选满
  autoResolvePending(st);
  // 2) 攻击
  guard = 0;
  while (guard++ < 30) {
    const mine = unitsOf(st, side).filter(u => canAttack(st, side, u));
    if (!mine.length) break;
    let acted = false;
    for (const u of mine) {
      if (st.over) return;
      if (!canAttack(st, side, u)) continue;
      const cands = legalTargets(st, side);
      const taunts = cands.filter(t => kwOn(t.kw.taunt));
      const power = effAtk(u);
      let tgt: BattleUnit | null = null;
      if (taunts.length) {
        // 有锁链必须先打锁链：优先能击毁的
        tgt = taunts.filter(t => power >= t.shield + t.structure).sort((a, b) => b.atk - a.atk)[0] || taunts[0];
      } else if (cands.length) {
        const killable = cands.filter(t => power >= t.shield + t.structure);
        if (killable.length) {
          tgt = killable.sort((a, b) => b.atk - a.atk)[0];
        } else {
          // 打不死：若对方反伤能把我打死，就不做这笔亏本交换，直接打本体
          const best = cands.slice().sort((a, b) => effAtk(b) - effAtk(a))[0];
          const lethalFace = power >= S(st, other(side)).body;
          if (lethalFace || effAtk(best) < u.shield + u.structure) tgt = best;
        }
      }
      if (tgt) {
        attack(st, u.uid, tgt.uid);
      } else {
        const lethal = power >= S(st, other(side)).body;
        attack(st, u.uid, 'body');
        if (lethal) return;
      }
      acted = true;
    }
    if (!acted) break;
  }
  if (!st.over) endTurn(st);
}

// ---------------- 自动整场（测试用） ----------------
export function autoBattle(opts?: CreateBattleOptions): BattleState {
  const st = createBattle(opts);
  let guard = 0;
  while (!st.over && guard++ < 200) aiTurn(st, st.active);
  return st;
}

// ---------------- 导出（与 DEMO 的 Engine 对象一致） ----------------
const Engine = {
  CARDS, BOSSES, FLEET_STARTER, FLEET_ALL, PIRATE_POOL,
  TURN_LIMIT, BOARD_SIZE, BODY_HP, MANA_CAP,
  createBattle, deploy, attack, endTurn, aiTurn, autoBattle, startTurn, resolvePending,
  canDeploy, canAttack, legalTargets, costOf, unitsOf, enemiesOf, effAtk,
  unitFlags, attackReason, PENDING_LABEL, PENDING_HINT,
  findUnit, firstEmpty, other, log,
  // 仅供测试使用的内部句柄（界面不用）
  _t: { damageUnit, spawnUnit, placeUnit, side: S, cleanup, effAtk, BOSSES_KEYS: Object.keys(BOSSES) },
};
export default Engine;

/** 与 DEMO 的 `_t` 等价的测试句柄（导出的具名别名，便于对拍脚本 import） */
export const _t: {
  damageUnit: typeof damageUnit;
  spawnUnit: typeof spawnUnit;
  placeUnit: typeof placeUnit;
  side: typeof S;
  cleanup: typeof cleanup;
  effAtk: typeof effAtk;
  BOSSES_KEYS: string[];
} = Engine._t;

// ---------------- 深拷贝（主游戏接入用；不改 DEMO 的任何既有逻辑） ----------------
/** 拷贝一艘战舰：全部标量 + kw（关键词载荷是扁平的布尔/数字，浅拷即深拷） */
function cloneBattleUnit(u: BattleUnit): BattleUnit {
  return { ...u, kw: { ...u.kw } };
}

/** 拷贝一方阵营：pool / lost / grave 与 board（含每个单位对象）都必须是新数组、新对象 */
function cloneBattleSide(s: BattleSideState): BattleSideState {
  return {
    ...s,
    pool: s.pool.slice(),
    lost: s.lost.slice(),
    grave: s.grave.slice(),
    board: s.board.map((u) => (u ? cloneBattleUnit(u) : null)),
  };
}

/**
 * 深拷贝一场战斗。
 * 为什么必须有它：引擎**原地修改**传入的 state（deploy/attack/cleanup… 全是就地写），
 * 而主游戏的 reducer 不许 mutate prev —— dispatch BATTLE_ACTION 时必须先克隆一份再交给引擎。
 * 拷贝范围：一切可变结构（两侧 pool/lost/grave/board（含单位对象）/标量、pending（含 cands/picked）、
 * log、stat、over/winner/reason/round/active）；**`rnd` 是函数，保留原引用**（拷贝随机数流会让两场战斗分叉）。
 */
export function cloneBattleState(st: BattleState): BattleState {
  return {
    ...st,
    log: st.log.slice(),
    pending: st.pending
      ? { ...st.pending, cands: st.pending.cands.slice(), picked: st.pending.picked.slice() }
      : null,
    stat: { player: { ...st.stat.player }, boss: { ...st.stat.boss } },
    player: cloneBattleSide(st.player),
    boss: cloneBattleSide(st.boss),
  };
}