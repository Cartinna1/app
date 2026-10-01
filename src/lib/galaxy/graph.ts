// ==================== 星图图论与距离（唯一真值） ====================
// 本模块负责：航道回合数、最短路（跃迁回合数）、可达性（封锁判定）、布局自检。
// ⚠ 贸易距离折价（data/factions.ts 的 getDistance）与跃迁回合数共用本模块，
//   改 TURN_UNIT / 布局 / 航道都会同时影响两者，改完必须重跑 validateGalaxy() 核对区间。

import type { GalaxyNode } from '@/types/galaxy';
import { GALAXY_NODES, GALAXY_NODE_MAP, getGalaxyNode } from '@/data/galaxy/nodes';
import { GALAXY_LANES } from '@/data/galaxy/lanes';

/** 每 80 坐标单位 = 1 回合（唯一真值；此值使势力间最短路均值 5.58 与原 DISTANCE_MATRIX 的 5.33 一致） */
export const TURN_UNIT = 80;
/** 单条航道回合数区间 */
export const MIN_LANE_TURNS = 1;
export const MAX_LANE_TURNS = 9;
/** 全程最短路回合数上限（与原 DISTANCE_MATRIX 的最大值 9 对齐，防止多跳把贸易折价推高） */
export const MAX_ROUTE_TURNS = 9;
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
  /** 跃迁回合数（已按 MAX_ROUTE_TURNS 钳制） */
  turns: number;
  /** 途经节点（含起点与终点） */
  path: string[];
  /** 是否为钳制后的值（真实最短和大于上限） */
  capped: boolean;
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
  if (from === to) return { turns: 0, path: [from], capped: false };
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
  return { turns: Math.min(raw, MAX_ROUTE_TURNS), path, capped: raw > MAX_ROUTE_TURNS };
}

/** 节点之间的跃迁回合数；不可达返回 null */
export function getGalaxyTurns(from: string, to: string, blocked?: Iterable<string>): number | null {
  const route = shortestRoute(from, to, blocked);
  return route ? route.turns : null;
}

/**
 * 贸易距离口径：与旧 DISTANCE_MATRIX 同量级（3~9）。
 * 未知 id 走 FALLBACK_DISTANCE；被封锁导致不可达时同样返回兜底值，避免买卖价崩坏。
 */
export function getTradeDistance(from: string, to: string, blocked?: Iterable<string>): number {
  const turns = getGalaxyTurns(from, to, blocked);
  return turns === null ? FALLBACK_DISTANCE : turns;
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
  if (factionIds.length > 1 && maxPairTurns > MAX_ROUTE_TURNS) {
    errors.push(`势力间距离越界（${minPairTurns}~${maxPairTurns}），上限 ${MAX_ROUTE_TURNS}`);
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
    },
  };
}
