// ==================== 出征（V1.5 §10.1 / §10.2）纯逻辑 ====================
// 主游戏侧的「出征可行性 / 出征耗时 / 老巢探明 / 战斗期间能否结束回合」唯一真值。
// 规则出处：《舰队卡牌游戏设计方案 V1.5》§7.1（五个老巢的星图位置）、§10.1（出征）、§10.2（掠夺）。
// ⚠ 这里**不重算任何距离**：耗时一律走 lib/galaxy/graph.ts 的 getGalaxyTurns（星图距离唯一真值，
//   与跃迁回合数、贸易折价同源），被封锁的宿敌节点与贸易同口径（getBlockedNodeIds）。
// ⚠ 不依赖 React/DOM，可独立测试；本文件不做任何副作用。

import type { GameState } from '@/types/game';
import type { BattleExpedition, PirateBossId, ShipCardId } from '@/types/battle';
import { GALAXY_NODES, getGalaxyNode } from '@/data/galaxy/nodes';
import { PIRATE_BOSSES } from '@/data/battle/pirates';
import { getGalaxyTurns } from '@/lib/galaxy/graph';
import { getBlockedNodeIds } from '@/lib/galaxy/access';

// ==================== 节点查询（数据层只列一次，勿在别处再扫一遍 GALAXY_NODES） ====================

/** 老巢 BOSS id → 星图节点 id（V1.5 §7.1；标记写在 data/galaxy/nodes.ts 的 `pirateLair` 上） */
const LAIR_NODE_BY_BOSS: Record<string, string> = Object.fromEntries(
  GALAXY_NODES.filter((n) => n.pirateLair).map((n) => [n.pirateLair as string, n.id])
);

/** 殖民地星球类型 → 节点 id（10 个殖民地节点的 planetId 唯一，与 data/galaxy/nodes.ts 一一对应） */
const COLONY_NODE_BY_PLANET: Record<string, string> = Object.fromEntries(
  GALAXY_NODES.filter((n) => n.type === 'colony' && n.planetId).map((n) => [n.planetId as string, n.id])
);

/** 老巢所在的星图节点（未标记 / 未知 bossId 时返回 null） */
export function lairNodeId(bossId: PirateBossId): string | null {
  return LAIR_NODE_BY_BOSS[bossId] ?? null;
}

/** 老巢的展示名（就是所在星系的节点名，如「海盗老巢·玛拉」；查不到时空串） */
function lairNodeName(bossId: PirateBossId): string {
  return getGalaxyNode(lairNodeId(bossId))?.name ?? '';
}

/**
 * 老巢展示名（**UI 唯一出口**：出征卡片里的节点位）。
 * 老巢节点的 `name` 就是玩家可见的展示名（data/galaxy/nodes.ts 写成「海盗老巢·<BOSS 简称>」），
 * 这里给出玩家可读的兜底 —— UI 不许自己写 '未知星系' 或去猜节点名（`discoveredLairs` 也读它，两处同源）。
 * 迷雾不受影响：未探明的老巢节点一律不被 discoveredLairs 列出，其可见名走
 * lib/galaxy/knowledge.getNodeDisplayName（→「未探测星系」），本函数不参与那条路径。
 */
export function lairDisplayName(bossId: PirateBossId): string {
  return lairNodeName(bossId) || '未知海盗老巢';
}

/**
 * 「航行 N 回合」文案（**未出发**时的预览口径，唯一真值）。
 * ⚠ 只有出征列表（舰队还没出发）用它；在途时读 `state.expedition.turnsRemaining`，见 expeditionEtaText。
 * 耗时走 expeditionTurns（= getGalaxyTurns，与跃迁/贸易同源，含 MAX_ROUTE_TURNS 钳制），UI 不许自己算。
 * 没有殖民地 / 航线被封锁（turns 为 null）时返回「航线不通」。
 */
export function travelTurnsText(state: GameState, bossId: PirateBossId): string {
  const turns = expeditionTurns(state, bossId);
  return turns === null ? '航线不通' : `航行 ${turns} 回合`;
}

/**
 * 「还有 N 回合抵达」文案（**在途**时，唯一真值）。
 * `turnsRemaining` 来自 `state.expedition.turnsRemaining`（TICK_BATTLE_STATE 推进，见 hooks/gameReducer），
 * 调用方把 `expedition.turnsRemaining` 原样传进来，别在 UI 里自己算 ——
 * 未出发时**不要**用本函数（那时写「还有 N 回合抵达」是错的：舰队还在港里，见 travelTurnsText）。
 * ⚠ **显示下限 1**（与掠夺 `raidStatus.turnsToArrival` 同口径）：归零的那一帧起出征已经"到了"
 *   （见 expeditionArrived），界面绝不能再渲染出「还有 0 回合抵达」—— 那正是用户 2026-08 截图里
 *   那个"既没倒计时可走、也没有开战入口"的死界面。所以下限与在途判定一起收在 expeditionView 里。
 */
export function expeditionEtaText(turnsRemaining: number): string {
  return `还有 ${Math.max(1, turnsRemaining)} 回合抵达`;
}

/** 殖民地是否已建立（`scouting` 是旧存档的建设期，母舰已在场，也算已建立） */
function hasColony(state: GameState): boolean {
  const colony = state.ships[0]?.colony;
  if (!colony) return false;
  // ColonyPhase 只有 'inactive' | 'scouting' | 'active'（'selecting' 是**奇观**阶段，不是殖民地的）：
  // 非 inactive 即已建立（'scouting' 仅旧存档会处于，建立后立即建成）。
  return colony.phase !== 'inactive';
}

/**
 * 殖民地所在节点。
 * 口径：殖民地的 `planetType` 是**建殖民地时按母舰所在节点**定的（useColonyBase.foundColony），
 * 而 10 个殖民地节点的 planetId 唯一 → 反查即可，**不需要新字段**。
 * 还没建殖民地（含没有 planetType、没有对应节点）时返回 null → 出征不可用（§10.2 掠夺以存在殖民地为前提）。
 */
export function colonyNodeId(state: GameState): string | null {
  const colony = state.ships[0]?.colony;
  if (!colony || !hasColony(state)) return null;
  if (!colony.planetType) return null;
  return COLONY_NODE_BY_PLANET[colony.planetType] ?? null;
}

/**
 * 出征耗时 = 殖民地节点 → 老巢节点的星图跃迁回合数（复用 getGalaxyTurns，被封锁势力影响，与贸易同源）。
 * 没有殖民地 / 该 bossId 不是老巢 / 路线不可达（宿敌封锁）时返回 null（调用方据此禁用出征）。
 *
 * ⚠ 口径已定（2026-08）：出征耗时就用 `getGalaxyTurns` 的**钳制后**值（上限 `MAX_ROUTE_TURNS=9`），
 *   与跃迁回合数、贸易距离折价同源 —— 出征本来就是一次真实跃迁，不另开一套不封顶的算法。
 *   实测（10 个殖民地取平均）：b4 6.6 / b3 6.9 / b1 6.8 / b5 8.2 / b2 8.2 回合。
 *   注意 V1.5 §7.1 那张表登记的 7.4 / 8.0 / 9.0 / 11.4 / 11.6 是**未钳制的原始最短路**均值
 *   （已用独立算法逐位复现）：b5/b2 有 8/10 个殖民地到老巢的原始距离 > 9，钳成 9 之后
 *   文档那两个 11.x 在游戏里不会出现。**这是有意的**（否则会出现"星图说 9 回合、出征说 16 回合"），
 *   不要再为了对齐文档去改这张图或 `MAX_ROUTE_TURNS`。
 */
export function expeditionTurns(state: GameState, bossId: PirateBossId): number | null {
  const from = colonyNodeId(state);
  const to = lairNodeId(bossId);
  if (!from || !to) return null;
  return getGalaxyTurns(from, to, getBlockedNodeIds(state.factionReputation));
}

/**
 * 老巢是否已探明（= 该节点在 `visitedNodes` 里，沿用星图迷雾口径：到达即探明）。
 * 未探明不给出征列表（V1.5 §10.1），且**不做占位提示** —— 星图里自己探索出来。
 */
export function isLairDiscovered(state: GameState, bossId: PirateBossId): boolean {
  const nodeId = lairNodeId(bossId);
  if (!nodeId) return false;
  return (state.ships[0]?.galaxy?.visitedNodes ?? []).includes(nodeId);
}

/** 已探明的老巢列表（供战斗页签展示：目标 BOSS、老巢节点名 lairDisplayName、未出发的航行回合数） */
export function discoveredLairs(
  state: GameState
): { bossId: PirateBossId; nodeId: string; name: string; turns: number }[] {
  const visited = new Set(state.ships[0]?.galaxy?.visitedNodes ?? []);
  const out: { bossId: PirateBossId; nodeId: string; name: string; turns: number }[] = [];
  for (const node of GALAXY_NODES) {
    if (!node.pirateLair) continue;          // 只列 5 个老巢，其它空星系不参与
    if (!visited.has(node.id)) continue;      // 未探明的一律不出现（不占位）
    const bossId = node.pirateLair;
    const turns = expeditionTurns(state, bossId);
    if (turns === null) continue;             // 没有殖民地 / 路线被封锁 → 这次出不征
    out.push({ bossId, nodeId: node.id, name: lairDisplayName(bossId), turns });
  }
  return out;
}

/**
 * 能否出征：**同步可判的拦截全部在这里**（UI 置灰提示与 useTurn 都读它，避免各写一份）。
 * 不满足时 `reason` 是给玩家看的一句话。
 */
export function canStartExpedition(
  state: GameState,
  bossId: PirateBossId,
  fleetId: string
): { ok: boolean; reason?: string } {
  const nodeId = lairNodeId(bossId);
  if (!nodeId) return { ok: false, reason: '目标不是海盗老巢' };
  if (!colonyNodeId(state)) return { ok: false, reason: '还没有殖民地 —— 先建立殖民地才能出征（V1.5 §10.2）' };
  if (!isLairDiscovered(state, bossId)) return { ok: false, reason: '这个老巢还没探明 —— 先去星图探索' };
  if (state.expedition) return { ok: false, reason: '已有出征在途，同时只能出征 1 个老巢（V1.5 §10.1）' };
  if (state.battle) return { ok: false, reason: '战斗进行中，无法发起新的出征' };
  const fleet = state.fleets.find((f) => f.id === fleetId);
  if (!fleet) return { ok: false, reason: '请先选择出征舰队' };
  if (fleet.defending) return { ok: false, reason: '带「防守」标签的舰队留守，不能出征' };
  if (fleet.shipIds.length === 0) return { ok: false, reason: '这支舰队没有战舰，出征不能空手（V1.5 §10.1）' };
  if (expeditionTurns(state, bossId) === null) return { ok: false, reason: '通往该老巢的航线被封锁，无法出征' };
  return { ok: true };
}

/**
 * 战斗期间不允许结束游戏回合（V1.5 §〇「战斗中不能保存」、§1.1）。
 * 只判 `state.battle`：出征倒计时在途（还没开战）时仍可正常结束回合。
 */
export function canEndGameTurn(state: GameState): boolean {
  return !state.battle;
}

// ==================== TICK 与抵达判定（唯一真值；与派发时序无关） ====================

/**
 * 出征倒计时的一次推进（每游戏回合一次）：`turnsRemaining` 减 1，**下限 0**（到 0 就停在 0）。
 * **唯一真值**：reducer 的 `TICK_BATTLE_STATE` 与 `useTurn` 的"本次 TICK 之后"投影共用这一份
 * （useTurn 读到的是 dispatch 之前的状态，判定必须走这里，不能就地再减一次）。
 * 归零之后由调用方按 `expeditionArrived` / `readyExpedition` 决定要不要开战 —— 本函数只推进倒计时。
 */
export function tickExpedition(expedition: BattleExpedition | null): BattleExpedition | null {
  if (!expedition) return null;
  return { ...expedition, turnsRemaining: Math.max(0, expedition.turnsRemaining - 1) };
}

/**
 * 舰队已经抵达（倒计时归零）—— 「该不该开战」的**第一性判据**，只看状态本身。
 * 为什么需要它：`tickExpedition` 把倒计时钳在 0，所以"抵达"会**先**以 `turnsRemaining: 0` 的形态
 * 落在状态里；而界面里那一帧没有任何"可走的倒计时"，也（在旧写法里）没有开战入口。
 * ⚠ 判据**不许**再写成"读 TICK 前的状态 + 猜一位"（旧 `readyExpedition(state, afterTick=true)`）：
 *   那等于把"这一帧到底该不该开战"押在「TICK 与 START_BATTLE 必须同批、且真的被派发」这个隐含时序上
 *   —— 批边界一旦落在两者之间，玩家就会看到"回合结束后既没开战、也没有开战入口"（用户 2026-08 报的
 *   出征卡死；与 P7 掠夺 `raidWarningElapsed` 是**同一类根因、同一套写法**）。
 *   现在：谁读都只读状态，与派发时序无关。
 */
export function expeditionArrived(expedition: BattleExpedition | null): boolean {
  return !!expedition && expedition.turnsRemaining <= 0;
}

/**
 * 「本回合结束前该自动开战吗」—— 舰队已抵达的出征 + 该出征的参战舰船。
 * ⚠ **入参必须是 TICK 之后的状态**（调用方先 `tickExpedition` 投影、或 reducer 已落库）；
 *   没有任何 off-by-one 的选项可传 —— 这正是修掉"猜一位"的地方（旧签名 `afterTick` 已删除）。
 * 返回 null = 什么都不做（没有出征 / 还在路上 / 战斗已在进行 / 出征舰队已不存在）。
 * 注意：**开战的随机种子不在这里**（种子由调用方按现有口径取 Date.now()，战斗不进存档）。
 */
export function readyExpedition(
  state: GameState
): { bossId: PirateBossId; fleetId: string; fleet: ShipCardId[] } | null {
  if (state.battle) return null;                       // 战斗期间一切照旧（不推进、不开新战）
  const ex = state.expedition;
  if (!ex) return null;                                // 没有出征
  if (!expeditionArrived(ex)) return null;             // 还在路上（turnsRemaining > 0）
  const fleet = state.fleets.find((f) => f.id === ex.fleetId);
  if (!fleet || fleet.shipIds.length === 0) return null; // 舰队被删/被掏空 → 不开战（不崩）
  return { bossId: ex.bossId, fleetId: ex.fleetId, fleet: fleet.shipIds.slice() };
}

// ==================== 出征卡片的渲染模型（界面唯一出口） ====================

/**
 * 出征卡片 / 机库状态行要渲染的**内容**（判定与文案口径都在 lib，组件只负责摆上去）。
 * 抽出来的理由与 `raid.raidCardView` 完全相同：这些是**派生逻辑**而不是排版细节 ——
 * 抽出来才能被 `check-battle-expedition.cjs` 的纯函数验收覆盖，也才能保证"还有 0 回合抵达"
 * 这类死界面文案在全库**只有一个出口**（AGENTS 第三节：同一计算只许存在一份）。
 * ⚠ `turnsRemaining` 是**显示值**（下限 1，与掠夺 `raidStatus.turnsToArrival` 同口径）：
 *   界面不要再去读 `state.expedition.turnsRemaining` 原值（那是 0，会渲染出死界面文案）。
 * ⚠ 这里**不判** "该不该开战"：那是 `readyExpedition` 的事，本模型只描述"界面现在长什么样"。
 */
export interface ExpeditionView {
  /** 是否有出征在途（等价 `!!state.expedition`） */
  onExpedition: boolean;
  /** 出征的 BOSS id（没有出征时为 null） */
  bossId: PirateBossId | null;
  /** 目标展示名（= PIRATE_BOSSES 名字；没有出征时空串） */
  bossLabel: string;
  /** 老巢所在星系名（= lairDisplayName；没有出征时空串） */
  lairName: string;
  /** 出征舰队的名字（舰队已不存在时为空串） */
  fleetName: string;
  /** 剩余回合的**显示值**：下限 1，绝不出现 0 */
  turnsRemaining: number;
  /** 「还有 N 回合抵达」文案（唯一出口，turnsRemaining >= 1） */
  etaText: string;
  /** 是否已抵达（= expeditionArrived；抵达后界面就该等开战，而不是写"还有 0 回合"） */
  arrived: boolean;
}

/** 出征卡片的整份渲染模型（唯一真值；BattleTab / 机库只渲染，不自己拼文案） */
export function expeditionView(state: GameState): ExpeditionView {
  const ex = state.expedition;
  if (!ex) {
    return {
      onExpedition: false,
      bossId: null,
      bossLabel: '',
      lairName: '',
      fleetName: '',
      turnsRemaining: 0,
      etaText: '',
      arrived: false,
    };
  }
  // 显示下限 1：倒计时归零的那一帧起出征已经"到了"，界面不许写「还有 0 回合抵达」
  const turnsRemaining = Math.max(1, ex.turnsRemaining);
  return {
    onExpedition: true,
    bossId: ex.bossId,
    bossLabel: PIRATE_BOSSES[ex.bossId]?.name ?? '未知老巢',
    lairName: lairDisplayName(ex.bossId),
    fleetName: state.fleets.find((f) => f.id === ex.fleetId)?.name ?? '',
    turnsRemaining,
    etaText: expeditionEtaText(turnsRemaining),
    arrived: expeditionArrived(ex),
  };
}

// 说明：PIRATE_BOSSES 的导入还用于「老巢 BOSS 必须存在」的数据自检（避免 nodes 标了不存在的 boss）。
// 展示侧：expeditionView 的 bossLabel 也读它（目标名的唯一出口，UI 不再自己去查表）。
if (import.meta.env.DEV) {
  for (const [bossId, nodeId] of Object.entries(LAIR_NODE_BY_BOSS)) {
    if (!PIRATE_BOSSES[bossId]) console.warn(`[expedition] 老巢 ${nodeId} 指向不存在的 BOSS：${bossId}`);
  }
}