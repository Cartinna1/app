// ==================== 银河雇佣兵协会 · 纯逻辑（数据查询 / 批次生成 / 冷却 / 期限 / 文案） ====================
// 本文件是雇佣兵协会**唯一**的纯函数层：不依赖 React/DOM、不 dispatch、不 mutate、不吃 Math.random。
// ⚠ 数据只有一份：`data/mercenary/bounties.ts`（14 条静态定义）与 `data/mercenary/bosses.ts`（敌人）。
//   组件与 hook 一律经本文件查询，**不许直接 import 那两个数据文件**。
// ⚠ 悬赏不涉及星图：没有目的地、没有耗时、"已探明"这类判定在这里不存在。
// ⚠ 悬赏不涉及声望：完成不加、失败与超时不扣；`expireBounties` 只删超期项，不做别的。
//
// 三个计时概念（别混）：
//   · BOUNTY_REFRESH_TURNS —— **整张榜单**几天换一次（批次刷新）；
//   · BOSS_COOLDOWN_TURNS  —— **单个头目**被打赢后几天不再出现（`bounties.bossCooldown`）；
//   · 老巢冷却             —— 既有系统，记在 `state.lairClearedTurn`，**不在本文件**（它挡的是出征入口）。

import type { BountyDef, BountyKind, BountyProgress, BountyState, GameState, Mothership } from '@/types/game';
import type { PirateBossId } from '@/types/battle';
import { BOUNTY_DEFS } from '@/data/mercenary/bounties';
import { MERCENARY_BOSSES } from '@/data/mercenary/bosses';
import { PIRATE_BOSSES } from '@/data/battle/pirates';
import { getGalaxyNode } from '@/data/galaxy/nodes';
import { ALL_MATERIAL_IDS, getMaterialName } from '@/data/materialNames';
import { famineHalveGold } from '@/lib/turn/shipTurn';
import { pushGoldLog } from '@/lib/turn/goldLog';
import { isFleetOnExpedition, libraryShipCount } from '@/lib/battle/hangar';
import { getTurnsUntil } from './expiry';

// ---------------- 常量（唯一真值；改数值只改这一段）----------------

/** 整张榜单的刷新周期：每 10 回合换一批 */
export const BOUNTY_REFRESH_TURNS = 10;

/** 单个头目被打赢后的冷却回合数：10 回合内不进候选池 */
export const BOSS_COOLDOWN_TURNS = 10;

/** 每批的构成：清剿 1 条 + 截击 1 条 + 头目 1 条（头目不足时见 buildBountyBatch 的兜底） */
export const BOUNTY_BATCH_QUOTA: Readonly<Record<BountyKind, number>> = {
  pirate: 1,
  raid: 1,
  elite: 1,
};

/** 四支头目都在冷却时的那句提示（本批只有 2 条） */
export const BOUNTY_ALL_COOLING_NOTICE = '四支敌对势力都在冷却，下一批再来';

/** 三类各自的随机盐（让同一批里三个档次的抽样互不相关；改它会改变既有批次的抽法） */
const KIND_SALT: Readonly<Record<BountyKind, number>> = {
  pirate: 0x9e3779b9,
  raid: 0x85ebca6b,
  elite: 0xc2b2ae35,
};

// ---------------- 查询口（唯一）----------------

/** id → 定义（惰性建一次；静态数据不会变） */
const BOUNTY_BY_ID: ReadonlyMap<string, BountyDef> = new Map(BOUNTY_DEFS.map((d) => [d.id, d]));

/** 全部悬赏定义（顺序 = 展示顺序，也是抽取时的候选顺序） */
export function allBountyDefs(): readonly BountyDef[] {
  return BOUNTY_DEFS;
}

/** 按 id 取定义；未知 id 返回 undefined（调用方兜底，不抛） */
export function getBountyDef(id: string): BountyDef | undefined {
  return BOUNTY_BY_ID.get(id);
}

// ---------------- 头目冷却 ----------------

/**
 * 该头目还剩几回合冷却（0 = 不在冷却，可进候选池）。
 * 判据 = `BOSS_COOLDOWN_TURNS - (turn - 最近一次打赢的回合)`，下限 0。
 * 没有记录（`bossCooldown` 缺该键 / 整个缺省）= 从未打赢过 = 0。
 */
export function bossCooldownRemaining(
  bossId: string,
  cooldown: Record<string, number> | undefined,
  turn: number
): number {
  const clearedAt = cooldown ? cooldown[bossId] : undefined;
  if (clearedAt === undefined) return 0;
  return Math.max(0, BOSS_COOLDOWN_TURNS - (turn - clearedAt));
}

// ---------------- 确定性伪随机（不新增依赖、不吃 Math.random）----------------

/**
 * mulberry32：32 位状态的确定性 PRNG，纯函数式用法（同 seed → 同序列）。
 * 为什么不直接用 `Math.random()`：批次必须**可复现**——同一存档读两次、或同一个 (turn, batchTurn)
 * 算两次，都必须拿到同一批悬赏，否则玩家刷新一次界面就换榜（AGENTS：批次生成是纯函数）。
 */
function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return (): number => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** 从池里确定性抽一个（空池返回 null）。seed 只由 (批次序号, 档次盐) 决定 */
function pickOne<T>(pool: readonly T[], batchIndex: number, salt: number): T | null {
  if (pool.length === 0) return null;
  const rnd = mulberry32(Math.imul(batchIndex + 1, 0x27d4eb2d) ^ salt);
  const idx = Math.min(pool.length - 1, Math.floor(rnd() * pool.length));
  return pool[idx];
}

// ---------------- 批次生成 ----------------

/** 批次视图：`notice` 给 UI 用（本批为什么少一条），**不存进 BountyState**（存档形状已定稿） */
export interface BountyBatch {
  /** 本批的生成回合（= 该刷新时的当前回合；不刷新时沿用旧值） */
  batchTurn: number;
  /** 本批可接的悬赏 id（2~3 条；头目全冷却时只有 2 条） */
  offered: string[];
  /** 需要给玩家看的一句提示（正常批次为空串） */
  notice: string;
}

/** 该不该换批：还没生成过（batchTurn ≤ 0）或已经过了 BOUNTY_REFRESH_TURNS 回合 */
export function shouldRefreshBounties(bounties: BountyState, turn: number): boolean {
  return bounties.batchTurn <= 0 || turn - bounties.batchTurn >= BOUNTY_REFRESH_TURNS;
}

/**
 * 算出**当前状态下应该摆在榜上的那一批**（纯函数：同 state → 完全相同的结果）。
 *
 * 规则：
 * 1. 不到刷新点 → 原样返回 `bounties.offered`（榜单一旦生成就不再变，避免"刷新界面换榜"）；
 * 2. 到刷新点 → 以**当前回合**为 `batchTurn`，按 `batchIndex = floor(turn / BOUNTY_REFRESH_TURNS)`
 *    派生确定性随机：清剿抽 1 条、截击抽 1 条、头目在**未冷却**的候选里抽 1 条；
 * 3. 头目全在冷却 → 本批只有 2 条，`notice` = 「四支敌对势力都在冷却，下一批再来」。
 */
export function buildBountyBatch(state: GameState): BountyBatch {
  const { bounties } = state;
  const turn = state.turn;
  if (!shouldRefreshBounties(bounties, turn)) {
    return { batchTurn: bounties.batchTurn, offered: bounties.offered.slice(), notice: '' };
  }
  const batchIndex = Math.floor(turn / BOUNTY_REFRESH_TURNS);
  const offered: string[] = [];
  // 清剿 / 截击：固定配额，不参与冷却
  const fixedKinds: readonly BountyKind[] = ['pirate', 'raid'];
  for (const kind of fixedKinds) {
    const pool = BOUNTY_DEFS.filter((d) => d.kind === kind);
    const quota = BOUNTY_BATCH_QUOTA[kind];
    for (let i = 0; i < quota; i += 1) {
      const hit = pickOne(pool, batchIndex + i, KIND_SALT[kind]);
      if (hit) offered.push(hit.id);
    }
  }
  // 头目：先按冷却过滤（冷却 > 0 的一律不进候选池）
  const elitePool = BOUNTY_DEFS.filter(
    (d) => d.kind === 'elite' && bossCooldownRemaining(d.enemyId, bounties.bossCooldown, turn) === 0
  );
  const elite = pickOne(elitePool, batchIndex, KIND_SALT.elite);
  if (elite) offered.push(elite.id);
  return { batchTurn: turn, offered, notice: elite ? '' : BOUNTY_ALL_COOLING_NOTICE };
}

/**
 * 把「该刷新就刷新」应用成**新的 BountyState**（纯函数：不 dispatch、不 mutate）。
 * 不到刷新点时**原样返回传入的 `bounties`**（同一引用 = 调用方可据此判断"没变"，不必写新对象）。
 * ⚠ `notice` 不落库：存档形状里没有它，需要提示的 UI 自己调 `buildBountyBatch(state).notice`。
 */
export function ensureBountyBatch(state: GameState): BountyState {
  if (!shouldRefreshBounties(state.bounties, state.turn)) return state.bounties;
  const batch = buildBountyBatch(state);
  return { ...state.bounties, batchTurn: batch.batchTurn, offered: batch.offered };
}

// ---------------- 期限 ----------------

/**
 * 是否已过期。口径与 `lib/turn/expiry.getTurnsUntil` 一致：**到期回合当天仍然有效**
 * （`expiresTurn === turn` → 剩 0 回合但仍可交付），只有 `expiresTurn < turn` 才算过期。
 */
export function isBountyExpired(progress: BountyProgress, turn: number): boolean {
  return progress.expiresTurn < turn;
}

/**
 * 删掉超期的进行中条目（纯函数）。**不发奖励、不扣声望、不扣资源**（文档 §1.4）。
 * 没有任何条目过期时原样返回传入的 `state`（同一引用）。
 */
export function expireBounties(state: GameState): GameState {
  const before = state.bounties.active;
  const alive = before.filter((p) => !isBountyExpired(p, state.turn));
  if (alive.length === before.length) return state;
  return { ...state, bounties: { ...state.bounties, active: alive } };
}

// ---------------- 文案 ----------------

/** 千分位（10000 → 10,000）；只用于展示，不参与任何计算 */
function groupThousands(value: number): string {
  return String(Math.trunc(value)).replace(/\B(?=(\d{3})+(?!\d))/g, ',');
}

/**
 * 报酬一行文案（唯一产出口）：`10,000 金币 + 5 星尘` / `18,000 金币 + 8 星尘 + 随机原料 ×30`。
 * ⚠ 原料译名一律走 `getMaterialName`（AGENTS 第八节），不许就地硬编码译名。
 */
export function bountyRewardText(def: BountyDef): string {
  const parts: string[] = [`${groupThousands(def.rewardGold)} 金币`, `${def.rewardStardust} 星尘`];
  const material = def.rewardMaterial;
  if (material) {
    const name = material.mode === 'fixed' && material.materialId
      ? getMaterialName(material.materialId)
      : '随机原料';
    parts.push(`${name} ×${material.amount}`);
  }
  return parts.join(' + ');
}

/**
 * 剩余回合文案（唯一产出口）：**必须复用 `getTurnsUntil`**，不要自己写 `expiresTurn - turn`。
 * 显示下限 1：`expiresTurn === turn` 是「本回合仍可交」的最后一天，文案要写「剩 1 回合」而不是 0
 * （与出征 `expeditionEtaText` / 掠夺 `raidStatus` 的同款下限口径一致）。
 * 已过期（`expiresTurn < turn`）返回「已过期」，不再给数字。
 */
export function bountyExpiryText(progress: BountyProgress, turn: number): string {
  if (isBountyExpired(progress, turn)) return '已过期';
  return `剩 ${Math.max(1, getTurnsUntil(turn, progress.expiresTurn))} 回合`;
}

// ==================== 阶段 1：接单 / 出击 / 结算（判据唯一真值） ====================
// ⚠ **铁律：结算唯一**。完成 / 失败的判定只在 `END_BATTLE` 的非掠夺分支里发生；
//   本文件只提供"能不能接 / 能不能出击"的判据与"发奖"的算术，**不判胜负**。
// ⚠ reducer 与 UI 共用本文件的 `canAcceptBounty` / `canStartBountyBattle`：UI 不许自己判一遍，
//   reducer 不许另写一份 —— 否则"按钮能点、点了被静默拒绝"这类断链又会回来。

/** 同时最多接几条（文档 §1.3「同时最多 3 条」） */
export const BOUNTY_MAX_ACTIVE = 3;

/**
 * **占位敌人（兜底，不再是头目档的默认值）**：`m01`~`m04` 的敌人数据已就位（`data/mercenary/bosses.ts`），
 * 头目档现在直接打 `def.enemyId`。这个常量只在"数据引用了未定义的敌人"时兜底（见 `bountyEnemyId`）。
 * TODO(可删)：等 `bounties.ts` 的 14 条数据全部指向已定义的敌人、且 `check-mercenary.cjs` 的
 *   「四支势力各自建场」断言稳定后，这个常量与 `bountyEnemyId` 的回落分支可以一起删掉。
 * ⚠ 不许在别处直接写字面量 `'raid'` 来表达"头目档的敌人"。
 */
export const ELITE_PLACEHOLDER_BOSS: PirateBossId = 'raid';

/** 判据结果（`reason` 是给玩家看的中文一句话；ok 时为空串） */
export interface BountyCheck {
  ok: boolean;
  reason: string;
}

const CHECK_OK: BountyCheck = { ok: true, reason: '' };

function deny(reason: string): BountyCheck {
  return { ok: false, reason };
}

/** 这一版唯一真值：本场战斗实际要打的敌方 id。
 *  `m01`~`m05` 的数据已就位 → 正常直接返回 `def.enemyId`；
 *  只有"数据里引用了尚未定义的敌人"这一种情况才回落到占位常量（`ELITE_PLACEHOLDER_BOSS`）。 */
export function bountyEnemyId(def: BountyDef): PirateBossId {
  if (MERCENARY_BOSSES[def.enemyId] || PIRATE_BOSSES[def.enemyId]) return def.enemyId;
  return ELITE_PLACEHOLDER_BOSS;
}

/** 该星图节点是不是雇佣兵协会（判据 = 节点类型 `'guild'`，**全图恰好一个**，见 validateGalaxy）。
 *  ⚠ 不许用节点 id 硬编码（旧写法是 `GUILD_NODE_ID = 'e13'`，已删除）：类型落地后协会换位置也不用改代码。 */
export function isGuildNode(nodeId: string | null | undefined): boolean {
  if (!nodeId) return false;
  return getGalaxyNode(nodeId)?.type === 'guild';
}

/** 母舰是否停在协会节点（`ships[0].galaxy.currentNodeId` 指向 `guild` 节点）。 */
export function isAtGuildNode(ship: Mothership | undefined): boolean {
  return isGuildNode(ship?.galaxy?.currentNodeId);
}

/** 当前榜上应该有的悬赏 id（= buildBountyBatch 的 offered；含"该刷新就刷新"的派生） */
export function bountyBatchOffered(state: GameState): string[] {
  return buildBountyBatch(state).offered;
}

/** 接取门槛（`BountyDef.requireCardCount`）的**唯一判据**：够不够、缺多少。
 *  ⚠ 艘数走 `hangar.libraryShipCount`（卡库总艘数的唯一真值），不许在这里写 `cardLibrary.length`；
 *  ⚠ 数字全部实时算（不写死 20/18），原因文案里两个数都要给出来。
 *  返回空串 = 达标。 */
function cardGateReason(state: GameState, def: BountyDef): string {
  const need = def.requireCardCount;
  if (!need) return '';
  const have = libraryShipCount(state.cardLibrary);
  if (have >= need) return '';
  return `卡库至少需要 ${need} 艘战舰才能接取这条悬赏（当前 ${have} 艘）`;
}

/**
 * 能不能接这条悬赏（**UI 与 reducer 共用**）。判据顺序 = 玩家最容易撞上的先判：
 * ① 不在协会节点 ② 战斗中 ③ 不在本批榜单（等价于"已过接取窗口"，这一版两者同一判据）
 * ④ 已接 ⑤ 已接满 3 条 ⑥ **卡库门槛** ⑦ 头目在冷却。
 */
export function canAcceptBounty(state: GameState, defId: string): BountyCheck {
  const def = getBountyDef(defId);
  if (!def) return deny('这条悬赏不存在');
  if (!isAtGuildNode(state.ships[0])) return deny('需停靠在银河雇佣兵协会才能接悬赏');
  if (state.battle) return deny('战斗还没打完');
  // ③ 不在本批榜单：榜单每 10 回合整批换，def 一旦被换下去就不在 offered 里 ——
  //    这同时就是"已过接取窗口"，本版不再单列一条判据（文档 §1.3 的"这一批已经换榜了"）。
  if (!bountyBatchOffered(state).includes(defId)) return deny('这一批已经换榜了，这条悬赏不在了');
  if (state.bounties.active.some((p) => p.defId === defId)) return deny('这条已经接了');
  if (state.bounties.active.length >= BOUNTY_MAX_ACTIVE) {
    return deny('同时最多接 3 条悬赏，先完成一条，或者等一条过期');
  }
  // ⑥ 卡库门槛（`requireCardCount`）：**接单与出击共用这一份判据**（`cardGateReason`），
  //    早先它只进了数据与 UI 文案，守卫没读 → 18 艘也能接、也能打（用户 2026-08 报的漏实装）。
  const gate = cardGateReason(state, def);
  if (gate) return deny(gate);
  const remain = bossCooldownRemaining(def.enemyId, state.bounties.bossCooldown, state.turn);
  if (remain > 0) return deny(`该头目正在冷却，剩 ${remain} 回合`);
  return CHECK_OK;
}

/**
 * 能不能出击（**UI 与 reducer 共用**）：这条得已接、未过期、没在打；舰队得存在、非空、
 * 不带防守标签、不在出征途中（后两条复用既有唯一真值：`fleet.defending` 与
 * `lib/battle/hangar.isFleetOnExpedition`，不在这里另写一份）。
 */
export function canStartBountyBattle(state: GameState, defId: string, fleetId: string): BountyCheck {
  const def = getBountyDef(defId);
  if (!def) return deny('这条悬赏不存在');
  const progress = state.bounties.active.find((p) => p.defId === defId);
  if (!progress) return deny('这条还没接，先接单再来');
  if (isBountyExpired(progress, state.turn)) return deny('这条悬赏已经过期了');
  if (state.battle) return deny('战斗还没打完');
  if (state.bountyBattleId) return deny('这条悬赏的战斗还没结束');
  // 卡库门槛与接单**同一份判据**（`cardGateReason`）：接单后被击毁到不足 20 艘，出击也要拦。
  const gate = cardGateReason(state, def);
  if (gate) return deny(gate);
  const fleet = state.fleets.find((f) => f.id === fleetId);
  if (!fleet) return deny('先选一支有战舰的舰队');
  if (fleet.shipIds.length === 0) return deny('这支舰队没有战舰，出击不能空手');
  if (fleet.defending) return deny('带防守标签的舰队留守，不能出击');
  if (isFleetOnExpedition(state, fleet.id)) return deny('这支舰队正在出征途中，不能出击');
  return CHECK_OK;
}

// ---------------- 状态写回（纯函数，reducer 只组装）----------------

/** 接单时生成的进行态：`expiresTurn = 接取回合 + 该条的期限` */
export function newBountyProgress(def: BountyDef, turn: number): BountyProgress {
  return { defId: def.id, acceptedTurn: turn, expiresTurn: turn + def.deadlineTurns };
}

/** 把一条进行态加进 active（调用方必须先用 canAcceptBounty 过一遍） */
export function withActiveBounty(bounties: BountyState, progress: BountyProgress): BountyState {
  return { ...bounties, active: [...bounties.active, progress] };
}

/** 从 active 移除一条（完成 / 失败 / 放弃 / 超期共用）；不在里面时原样返回同一引用 */
export function withoutActiveBounty(bounties: BountyState, defId: string): BountyState {
  const kept = bounties.active.filter((p) => p.defId !== defId);
  if (kept.length === bounties.active.length) return bounties;
  return { ...bounties, active: kept };
}

/** 写入某头目的冷却起点（打赢时调；键是**该条的敌方 id**，不是 `raid` 占位） */
export function withBossCooldown(bounties: BountyState, bossId: string, turn: number): BountyState {
  return { ...bounties, bossCooldown: { ...(bounties.bossCooldown || {}), [bossId]: turn } };
}

// ---------------- 发奖（金币必须过饥荒减半 + 写流水）----------------

export interface BountyRewardResult {
  /** 新的母舰（不改传入对象） */
  ship: Mothership;
  /** 事件记录里的一行（含报酬明细；饥荒时写明实收） */
  text: string;
}

/**
 * 发放一条悬赏的报酬：金币（**必过 `famineHalveGold`** + `pushGoldLog`，与
 * `rewards.grantBattleRewards` 同款写法）、星尘、材料（fixed 用指定 id；random 用调用方给的
 * `materialRoll ∈ [0,1)` 从全部原料里挑一个 —— 本文件**不吃 `Math.random`**）。
 */
export function grantBountyRewards(
  ship: Mothership,
  def: BountyDef,
  turn: number,
  materialRoll: number
): BountyRewardResult {
  const next: Mothership = { ...ship, materials: { ...(ship.materials || {}) } };
  const gold = famineHalveGold(ship.food, def.rewardGold);
  if (gold > 0) {
    next.gold += gold;                                   // 一、先改金币（pushGoldLog 读改完后的余额）
    pushGoldLog(next, turn, gold, `悬赏完成：${def.title}`);  // 二、再记流水（唯一真值 lib/turn/goldLog.ts）
  }
  if (def.rewardStardust > 0) next.stardust += def.rewardStardust;
  const material = def.rewardMaterial;
  if (material && material.amount > 0) {
    const materialId = material.mode === 'fixed' && material.materialId
      ? material.materialId
      : ALL_MATERIAL_IDS[
          Math.min(ALL_MATERIAL_IDS.length - 1, Math.floor(clamp01(materialRoll) * ALL_MATERIAL_IDS.length))
        ];
    next.materials = { ...(next.materials || {}), [materialId]: ((next.materials || {})[materialId] || 0) + material.amount };
  }
  const parts: string[] = [bountyRewardText(def)];
  if (gold < def.rewardGold && def.rewardGold > 0) {
    parts.push(`（饥荒减半，实收 ${groupThousands(gold)} 金币）`);
  }
  return { ship: next, text: parts.join(' ') };
}

/** 把任意数夹到 [0, 0.999999]（随机抽取用；避免 roll === 1 时越界） */
function clamp01(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.max(0, Math.min(0.999999, value));
}
