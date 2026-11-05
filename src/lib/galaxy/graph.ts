// ==================== 星图图论与距离（唯一真值） ====================
// 本模块负责：航道回合数、最短路（跃迁回合数）、可达性（封锁判定）、布局自检。
// ⚠ 贸易距离折价（data/factions.ts 的 getDistance）与跃迁回合数共用本模块，
//   改 TURN_UNIT / 布局 / 航道都会同时影响两者，改完必须重跑 validateGalaxy() 核对区间。

import type { GalaxyNode } from '@/types/galaxy';
import { GALAXY_NODES, GALAXY_NODE_MAP, getGalaxyNode } from '@/data/galaxy/nodes';
import { GALAXY_LANES } from '@/data/galaxy/lanes';

/** 每 80 坐标单位 = 1 回合（唯一真值；量级对齐已删除的旧 DISTANCE_MATRIX）
 *  ⚠ 势力间**真实**最短路现在是 2~11、均值 ≈5.9（2026-11 起跃迁距离不再钳制）；
 *     文档/旧表里写的「2~9、均值 5.87」是**贸易锚口径**（见 `TRADE_DISTANCE_ANCHOR`）。 */
export const TURN_UNIT = 80;
/** 单条航道回合数区间 */
export const MIN_LANE_TURNS = 1;
export const MAX_LANE_TURNS = 9;
/** 贸易折价的距离锚：特产价格体系按「最远 9」标定，**只用于贸易**，与走路距离解耦（2026-11 用户裁定） */
export const TRADE_DISTANCE_ANCHOR = 9;
/** 防呆阈值（**不是**钳制上限）：任何两个势力之间的真实最短路超过它才算配置错误。
 *  走路距离不再有上限 —— 用户 2026-11 裁定「距离要真实，走太远是玩家自己的选择」。 */
export const SANITY_MAX_ROUTE_TURNS = 20;
/** 未知节点 id 的兜底距离（与原 getDistance 的兜底值一致） */
export const FALLBACK_DISTANCE = 5;

export interface GalaxyEdge {
  to: string;
  turns: number;
}

/** 两点几何距离推导出的航道回合数 */
export function laneTurns(a: GalaxyNode, b: GalaxyNode): number {
  const d = Math.hypot(a.x - b.x, a.y - b.y);
  return Math.max(MIN_LANE_TURNS, Math.min(MAX_LANE_TURNS, Math.round(d / TURN_UNIT)));
}

/** 邻接表（模块加载时构建一次） */
const ADJACENCY: Record<string, GalaxyEdge[]> = (() => {
  const adj: Record<string, GalaxyEdge[]> = {};
  for (const n of GALAXY_NODES) adj[n.id] = [];
  for (const lane of GALAXY_LANES) {
    const a = getGalaxyNode(lane.a);
    const b = getGalaxyNode(lane.b);
    if (!a || !b) continue; // 悬空航道由 validateGalaxy 报告
    const turns = laneTurns(a, b);
    adj[a.id].push({ to: b.id, turns });
    adj[b.id].push({ to: a.id, turns });
  }
  return adj;
})();

export interface GalaxyRoute {
  /** 跃迁回合数（**真实距离，无上限**；贸易折价另有 `TRADE_DISTANCE_ANCHOR`） */
  turns: number;
  /** 途经节点（含起点与终点） */
  path: string[];
}

function normalizeBlocked(blocked?: Iterable<string>): Set<string> {
  return blocked ? new Set(blocked) : new Set<string>();
}

/**
 * 最短路（Dijkstra，节点数 50，O(n²) 足够）。
 * blocked 中的节点不可经过（用于边境封锁）。不可达返回 null。
 */
export function shortestRoute(from: string, to: string, blocked?: Iterable<string>): GalaxyRoute | null {
  if (!ADJACENCY[from] || !ADJACENCY[to]) return null;
  if (from === to) return { turns: 0, path: [from] };
  const banned = normalizeBlocked(blocked);
  if (banned.has(to)) return null;

  const dist: Record<string, number> = {};
  const prev: Record<string, string | null> = {};
  const visited = new Set<string>();
  for (const id of Object.keys(ADJACENCY)) {
    dist[id] = Infinity;
    prev[id] = null;
  }
  dist[from] = 0;

  for (;;) {
    let current: string | null = null;
    let best = Infinity;
    for (const id of Object.keys(ADJACENCY)) {
      if (visited.has(id)) continue;
      if (dist[id] < best) { best = dist[id]; current = id; }
    }
    if (current === null) break;
    if (current === to) break;
    visited.add(current);
    for (const edge of ADJACENCY[current]) {
      if (visited.has(edge.to) || banned.has(edge.to)) continue;
      const next = dist[current] + edge.turns;
      if (next < dist[edge.to]) {
        dist[edge.to] = next;
        prev[edge.to] = current;
      }
    }
  }

  if (!Number.isFinite(dist[to])) return null;
  const raw = dist[to];
  const path: string[] = [];
  let cursor: string | null = to;
  while (cursor) {
    path.unshift(cursor);
    cursor = prev[cursor] ?? null;
  }
  // 真实距离，不钳制（用户 2026-11：走太远是玩家自己的选择；贸易折价另有 TRADE_DISTANCE_ANCHOR）
  return { turns: raw, path };
}

/** 节点之间的跃迁回合数；不可达返回 null */
export function getGalaxyTurns(from: string, to: string, blocked?: Iterable<string>): number | null {
  const route = shortestRoute(from, to, blocked);
  return route ? route.turns : null;
}

/**
 * 贸易距离口径：与旧 DISTANCE_MATRIX 同量级（3~9），按 `TRADE_DISTANCE_ANCHOR` 钳到 9
 * —— **只用于特产价格体系**，与跃迁/出征的**真实**距离解耦（2026-11 用户裁定：
 * 贸易仍按 9 的函数算，玩家感知不到；走路距离不再被压扁）。
 * 未知 id 走 FALLBACK_DISTANCE；被封锁导致不可达时同样返回兜底值，避免买卖价崩坏。
 */
export function getTradeDistance(from: string, to: string, blocked?: Iterable<string>): number {
  const turns = getGalaxyTurns(from, to, blocked);
  return turns === null ? FALLBACK_DISTANCE : Math.min(turns, TRADE_DISTANCE_ANCHOR);
}

// ==================== 布局自检 ====================

export interface GalaxyValidationResult {
  ok: boolean;
  errors: string[];
  stats: {
    nodeCount: number;
    laneCount: number;
    minDegree: number;
    maxDegree: number;
    isolated: string[];
    unreachable: number;
    minPairTurns: number;
    maxPairTurns: number;
    /** 超过贸易锚（`TRADE_DISTANCE_ANCHOR`）的势力对数量（有向对） */
    overTradeAnchorPairs: number;
    /** 全图任意两点对的最大真实回合数 */
    maxAnyTurns: number;
    /** 上面那个最大值的所属节点对 */
    maxAnyPair: [string, string];
  };
}

/** 自检：悬空航道、孤立节点、全图连通性、回合数区间（开发期防手误） */
export function validateGalaxy(): GalaxyValidationResult {
  const errors: string[] = [];
  const ids = GALAXY_NODES.map((n) => n.id);

  const dupes = ids.filter((id, i) => ids.indexOf(id) !== i);
  if (dupes.length) errors.push(`节点 id 重复：${dupes.join('、')}`);

  for (const lane of GALAXY_LANES) {
    if (!GALAXY_NODE_MAP[lane.a]) errors.push(`航道指向不存在的节点：${lane.a}`);
    if (!GALAXY_NODE_MAP[lane.b]) errors.push(`航道指向不存在的节点：${lane.b}`);
    if (lane.a === lane.b) errors.push(`航道两端相同：${lane.a}`);
  }

  // 节点类型与 `pirateLair` 标记必须自洽（**`type` 是"这是什么"的唯一权威**，`pirateLair` 只承载 BOSS id）：
  //   ① 5 个海盗老巢必须是 `pirateLair` 类型并挂着 BOSS id（信息卡 / 配图 / 出征都靠它）；
  //   ② 反过来，非老巢类型不许挂 BOSS id（否则会落回「空星系」文案与灰点配色）。
  // 注意这里**不断言各类节点的数量**（分类数量随玩法调整，写死 15/5 只会变成绊脚石）——
  // 真正要守的是"老巢不再借用 empty、标记与类型不分叉"这条口径。
  for (const node of GALAXY_NODES) {
    if (node.type === 'pirateLair' && !node.pirateLair) {
      errors.push(`海盗老巢节点缺少 pirateLair BOSS id：${node.id}`);
    }
    if (node.type !== 'pirateLair' && node.pirateLair) {
      errors.push(`非 pirateLair 类型却挂了 pirateLair 标记：${node.id}（类型=${node.type}）`);
    }
  }

  // 银河雇佣兵协会（`guild`）：**全图有且只有一个**，且与海盗老巢互斥 ——
  //   ① 恰好 1 个：`lib/turn/bounties.isAtGuildNode` 只看类型，"有一堆协会节点"会让"接单要去哪"变得含糊；
  //   ② 不得带 `pirateLair`：两者是互斥的功能节点（协会发委托、老巢是出征目标），
  //      且 `nodeImage` 的 guild 分支排在老巢分支之前 —— 一个节点同时带两者等于让配图规则打架。
  const guildNodes = GALAXY_NODES.filter((n) => n.type === 'guild');
  if (guildNodes.length !== 1) {
    errors.push(`guild（雇佣兵协会）节点必须恰好 1 个，实际 ${guildNodes.length} 个：${guildNodes.map((n) => n.id).join('、') || '无'}`);
  }
  for (const node of guildNodes) {
    if (node.pirateLair) {
      errors.push(`guild 节点不得同时挂 pirateLair 标记（互斥）：${node.id}`);
    }
  }

  const isolated = ids.filter((id) => (ADJACENCY[id] || []).length === 0);
  if (isolated.length) errors.push(`孤立节点（无任何航道）：${isolated.join('、')}`);

  // 以第一个节点为根做连通性检查
  const seen = new Set<string>();
  const stack = [ids[0]];
  while (stack.length) {
    const id = stack.pop()!;
    if (seen.has(id)) continue;
    seen.add(id);
    for (const e of ADJACENCY[id] || []) stack.push(e.to);
  }
  const unreachable = ids.filter((id) => !seen.has(id));
  if (unreachable.length) errors.push(`无法从起点到达：${unreachable.join('、')}`);

  // 势力节点之间必须两两可达
  const factionIds = GALAXY_NODES.filter((n) => n.type === 'faction').map((n) => n.id);
  let minPairTurns = Infinity;
  let maxPairTurns = 0;
  for (const a of factionIds) {
    for (const b of factionIds) {
      if (a === b) continue;
      const turns = getGalaxyTurns(a, b);
      if (turns === null) { errors.push(`势力节点不可达：${a} → ${b}`); continue; }
      minPairTurns = Math.min(minPairTurns, turns);
      maxPairTurns = Math.max(maxPairTurns, turns);
    }
  }
  if (factionIds.length > 1 && maxPairTurns > SANITY_MAX_ROUTE_TURNS) {
    errors.push(`势力间距离越界（${minPairTurns}~${maxPairTurns}），防呆上限 ${SANITY_MAX_ROUTE_TURNS}`);
  }

  // 观测（不报错）：超过贸易锚的**势力对**（无序，i<j）、全图最大真实回合数及其所属的一对
  let overTradeAnchorPairs = 0;
  for (let i = 0; i < factionIds.length; i += 1) {
    for (let j = i + 1; j < factionIds.length; j += 1) {
      const turns = getGalaxyTurns(factionIds[i], factionIds[j]);
      if (turns !== null && turns > TRADE_DISTANCE_ANCHOR) overTradeAnchorPairs += 1;
    }
  }
  let maxAnyTurns = 0;
  let maxAnyPair: [string, string] = ['', ''];
  for (const a of ids) {
    for (const b of ids) {
      if (a === b) continue;
      const turns = getGalaxyTurns(a, b);
      if (turns === null) continue;
      if (turns > maxAnyTurns) { maxAnyTurns = turns; maxAnyPair = [a, b]; }
    }
  }

  const degrees = ids.map((id) => (ADJACENCY[id] || []).length);
  return {
    ok: errors.length === 0,
    errors,
    stats: {
      nodeCount: ids.length,
      laneCount: GALAXY_LANES.length,
      minDegree: degrees.length ? Math.min(...degrees) : 0,
      maxDegree: degrees.length ? Math.max(...degrees) : 0,
      isolated,
      unreachable: unreachable.length,
      minPairTurns: Number.isFinite(minPairTurns) ? minPairTurns : 0,
      maxPairTurns,
      /** 超过贸易锚（9）的**势力对**数量（有向对，同原始遍历口径） */
      overTradeAnchorPairs,
      /** 全图任意两点对的最大真实回合数，及那一对 */
      maxAnyTurns,
      maxAnyPair,
    },
  };
}

// 开发期自检（生产构建不执行）：改节点坐标 / 航道后立即在控制台暴露悬空航道、孤立节点、
// 不连通与势力间距越界，避免"改了坐标忘了重跑 validateGalaxy"（AGENTS.md 第七节的人工流程改为自动兜底）。
if (import.meta.env.DEV) {
  const result = validateGalaxy();
  if (!result.ok) {
    console.warn('[galaxy] 星图校验未通过：', result.errors);
  }
}
