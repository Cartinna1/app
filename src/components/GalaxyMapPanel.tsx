// ==================== 星图面板（固定布局 50 节点） ====================
// 职责：SVG 画出节点与航道、迷雾（未探测节点不泄露类型）、母舰位置、选中路线高亮；
//      下方信息卡按节点类型给出操作：势力→内嵌贸易面板、殖民地→建立殖民地、遗迹→考古入口、空星系→待更新。
// 位置与跃迁的唯一真值是 ship.galaxy（见 lib/galaxy/access.ts），本文件只读不写。

import { memo, useMemo, useState } from 'react';
import type { Mothership } from '@/types/game';
import type { GalaxyNode } from '@/types/galaxy';
import { GALAXY_NODES, getGalaxyNode } from '@/data/galaxy/nodes';
import { GALAXY_LANES } from '@/data/galaxy/lanes';
import { shortestRoute } from '@/lib/galaxy/graph';
import { getBlockedNodeIds, canEnterNode } from '@/lib/galaxy/access';
import { RELATION_MATRIX, FACTIONS } from '@/data/factions';
import { getArchaeologySite } from '@/data/galaxy/archaeology';
import { ALL_PLANETS } from '@/data/colony/planets';
import TradePanel, { type TradePanelProps } from './TradePanel';
import { Rocket, Lock, HelpCircle, Sparkles, MapPin } from 'lucide-react';

interface GalaxyMapPanelProps {
  ship: Mothership;
  factionReputation: Record<string, number>;
  onTravelToNode: (targetNodeId: string) => { success: boolean; message: string };
  onFoundColony: (nodeId: string, name: string) => { success: boolean; message: string };
  /** 内嵌势力信息卡所需的贸易面板数据（由 GameScreen 用 useMemo 组装，避免击穿 memo） */
  tradeProps: Omit<TradePanelProps, 'hideTravelSection'>;
}

/** 无向航道的唯一键（排序后拼接，保证 a|b 与 b|a 同键） */
function laneKey(a: string, b: string): string {
  return a < b ? `${a}|${b}` : `${b}|${a}`;
}

const NODE_RADIUS: Record<GalaxyNode['type'], number> = { faction: 20, colony: 17, ruin: 17, empty: 12 };
const NODE_FILL: Record<GalaxyNode['type'], string> = {
  faction: '#0e7490',
  colony: '#047857',
  ruin: '#6d28d9',
  empty: '#334155',
};
const NODE_STROKE: Record<GalaxyNode['type'], string> = {
  faction: '#22d3ee',
  colony: '#34d399',
  ruin: '#a78bfa',
  empty: '#64748b',
};
const TYPE_LABEL: Record<GalaxyNode['type'], string> = {
  faction: '势力星系',
  colony: '可殖民星球',
  ruin: '遗迹星系',
  empty: '空星系',
};

function GalaxyMapPanel({ ship, factionReputation, onTravelToNode, onFoundColony, tradeProps }: GalaxyMapPanelProps) {
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [colonyName, setColonyName] = useState('');
  const [msg, setMsg] = useState('');
  const [msgType, setMsgType] = useState<'success' | 'error'>('success');
  const galaxy = ship.galaxy;
  const currentNode = getGalaxyNode(galaxy.currentNodeId);
  const travelTargetNode = getGalaxyNode(galaxy.targetNodeId);
  const traveling = galaxy.travelTurnsRemaining > 0;

  const blocked = useMemo(() => getBlockedNodeIds(factionReputation), [factionReputation]);
  const visited = useMemo(() => new Set(galaxy.visitedNodes), [galaxy.visitedNodes]);

  // 选中节点的最短路（用于回合数、途经提示与路线高亮）
  const route = useMemo(() => {
    if (!selectedId || selectedId === galaxy.currentNodeId) return null;
    return shortestRoute(galaxy.currentNodeId, selectedId, blocked);
  }, [selectedId, galaxy.currentNodeId, blocked]);

  const routeLaneKeys = useMemo(() => {
    const keys = new Set<string>();
    if (route) {
      for (let i = 0; i + 1 < route.path.length; i++) keys.add(laneKey(route.path[i], route.path[i + 1]));
    }
    return keys;
  }, [route]);

  const selectedNode = getGalaxyNode(selectedId);

  const handleTravel = (nodeId: string) => {
    onTravelToNode(nodeId);
  };

  /** 信息卡内容（按节点类型分派） */
  const renderInfoCard = (node: GalaxyNode) => {
    const isVisited = visited.has(node.id);
    const isCurrent = node.id === galaxy.currentNodeId;

    if (!isVisited) {
      // ===== 迷雾：不泄露类型与名称 =====
      const enterable = canEnterNode(node.id, factionReputation);
      return (
        <div>
          <div className="flex items-center gap-2 mb-2">
            <HelpCircle size={16} className="text-slate-400" />
            <h3 className="font-bold text-slate-200">未探测星系</h3>
            <span className="text-[10px] px-1.5 py-0.5 rounded bg-slate-800 text-slate-400 border border-slate-700">迷雾</span>
          </div>
          <p className="text-xs text-slate-400 mb-3">
            这里没有任何已知信息。跃迁抵达后才会显示该星系的名称、类型与可用操作。
          </p>
          {isCurrent ? (
            <p className="text-xs text-cyan-400">母舰当前就在此处。</p>
          ) : traveling ? (
            <p className="text-xs text-yellow-400">跃迁中：剩余 {galaxy.travelTurnsRemaining} 回合抵达「{travelTargetNode?.name || '未知'}」。</p>
          ) : !enterable ? (
            <p className="text-xs text-red-400 flex items-center gap-1">
              <Lock size={12} /> 该势力边境已对你封锁，无法进入（提升该势力声望可解除）。
            </p>
          ) : !route ? (
            <p className="text-xs text-red-400">无法抵达：航线被封锁的势力割断，可先提升相关势力声望或选择其他路线。</p>
          ) : (
            <div>
              <button
                onClick={() => handleTravel(node.id)}
                className="px-4 py-2 bg-cyan-600 hover:bg-cyan-500 rounded-lg font-bold text-white text-sm transition-colors flex items-center gap-2"
              >
                <Rocket size={14} /> 跃迁（{route.turns} 回合）
              </button>
              {route.path.length > 2 && (
                <p className="text-[10px] text-slate-500 mt-2">
                  途经：{route.path.slice(1, -1).map((id) => (visited.has(id) ? getGalaxyNode(id)?.name : '未探测星系')).join(' → ')}
                </p>
              )}
            </div>
          )}
        </div>
      );
    }

    // ===== 已探测：按类型给操作 =====
    return (
      <div>
        <div className="flex items-center gap-2 mb-2 flex-wrap">
          <MapPin size={16} className="text-cyan-400" />
          <h3 className="font-bold text-slate-100">{node.name}</h3>
          <span className="text-[10px] px-1.5 py-0.5 rounded bg-slate-800 text-slate-300 border border-slate-700">{TYPE_LABEL[node.type]}</span>
          {isCurrent && <span className="text-[10px] px-1.5 py-0.5 rounded bg-cyan-600 text-white">母舰所在</span>}
        </div>

        {node.type === 'faction' && (() => {
          // 关系探明规则：只显示"我已到访过"的相关势力（例：必须去过泰拉钢铁王座，才知道人类联邦与它敌对）
          const rel = RELATION_MATRIX[node.factionId || ''] || { allies: [], enemies: [] };
          const visitedFactionIds = new Set(
            galaxy.visitedNodes.filter((id) => getGalaxyNode(id)?.type === 'faction')
          );
          const nameOf = (id: string) => FACTIONS.find((f) => f.id === id)?.name || id;
          const knownAllies = rel.allies.filter((id) => visitedFactionIds.has(id));
          const knownEnemies = rel.enemies.filter((id) => visitedFactionIds.has(id));
          const hiddenCount = (rel.allies.length - knownAllies.length) + (rel.enemies.length - knownEnemies.length);
          return (
            <div className="mb-3 flex flex-wrap items-center gap-2">
              {knownAllies.map((id) => (
                <span key={`a-${id}`} className="text-[10px] md:text-xs px-1.5 py-0.5 rounded bg-emerald-900/40 text-emerald-300 border border-emerald-700/50">
                  友：{nameOf(id)}
                </span>
              ))}
              {knownEnemies.map((id) => (
                <span key={`e-${id}`} className="text-[10px] md:text-xs px-1.5 py-0.5 rounded bg-red-900/40 text-red-300 border border-red-700/50">
                  敌：{nameOf(id)}
                </span>
              ))}
              {hiddenCount > 0 && (
                <span className="text-[10px] md:text-xs text-slate-500">
                  {hiddenCount} 条外交关系未知（需到访相关势力才能探明）
                </span>
              )}
              {hiddenCount === 0 && knownAllies.length === 0 && knownEnemies.length === 0 && (
                <span className="text-[10px] md:text-xs text-slate-500">暂无已知的盟友或敌对势力</span>
              )}
            </div>
          );
        })()}

        {node.type === 'faction' && (
          <div className="mt-2">
            <TradePanel {...tradeProps} hideTravelSection />
          </div>
        )}

        {node.type === 'colony' && (() => {
          const planet = ALL_PLANETS.find((p) => p.id === node.planetId);
          const colonized = galaxy.colonizedNodeId === node.id;
          return (
            <div>
              <p className="text-sm text-slate-300 mb-1">
                星球类型：<span className="text-emerald-400 font-bold">{planet?.name || node.planetId}</span>
              </p>
              <p className="text-xs text-slate-400 mb-3">{planet?.description}</p>
              {colonized ? (
                <p className="text-xs text-emerald-400">你已在此星球建立殖民地，殖民玩法在「殖民」页签中继续。</p>
              ) : galaxy.colonizedNodeId ? (
                <p className="text-xs text-slate-400">你已经在另一颗星球建立了殖民地，全局只能殖民一颗。</p>
              ) : (
                <div className="space-y-2">
                  <p className="text-xs text-amber-400 flex items-center gap-1">
                    <Sparkles size={12} /> 可在此建立殖民地（需 30,000 金币，全局只能殖民一颗）
                  </p>
                  <div className="flex flex-col md:flex-row gap-2">
                    <input
                      value={colonyName}
                      onChange={(e) => setColonyName(e.target.value)}
                      placeholder="给殖民地起个名字（3-16 字）"
                      maxLength={16}
                      className="flex-1 bg-slate-800 border border-slate-600 rounded-lg px-3 py-2 text-sm text-slate-200 placeholder-slate-500 min-h-[40px]"
                    />
                    <button
                      onClick={() => {
                        const r = onFoundColony(node.id, colonyName);
                        setMsg(r.message);
                        setMsgType(r.success ? 'success' : 'error');
                      }}
                      className="px-4 py-2 bg-emerald-600 hover:bg-emerald-500 rounded-lg font-bold text-white text-sm min-h-[40px]"
                    >
                      建立殖民地（30,000 金币）
                    </button>
                  </div>
                </div>
              )}
            </div>
          );
        })()}

        {node.type === 'ruin' && (() => {
          const site = getArchaeologySite(node.siteId);
          if (!site) return <p className="text-xs text-slate-400">遗址数据缺失。</p>;
          return (
            <div>
              <p className="text-sm text-slate-300 mb-1">
                遗迹：<span className="text-purple-300 font-bold">{site.name}</span>
                <span className="text-[10px] text-slate-500 ml-2">{site.civilization}</span>
              </p>
              <p className="text-xs text-slate-400 mb-2">{site.intro}</p>
              <p className="text-xs text-slate-400">
                共 {site.stages.length} 个阶段
                {site.minLeaderLevel > 0 && `，需驻守领袖达到 Lv${site.minLeaderLevel}`}
                。发掘操作在「考古」页签中进行。
              </p>
            </div>
          );
        })()}

        {node.type === 'empty' && (
          <p className="text-xs text-slate-400">此地暂未发现任何内容，后续更新。</p>
        )}
      </div>
    );
  };

  return (
    <div>
      <h2 className="text-xl md:text-2xl font-bold text-white mb-1 md:mb-2">星图</h2>
      <p className="text-xs md:text-sm text-slate-400 mb-3 md:mb-4">
        点击星系节点查看信息与操作。未探测的星系需要先跃迁抵达，航道长度决定跃迁所需的回合数。
      </p>

      {msg && (
        <div className={`mb-3 px-3 py-2 rounded-lg text-xs md:text-sm border ${msgType === 'success' ? 'bg-emerald-900/30 border-emerald-700/50 text-emerald-300' : 'bg-red-900/30 border-red-700/50 text-red-300'}`}>
          {msg}
        </div>
      )}

      {traveling && travelTargetNode && (
        <div className="mb-3 bg-yellow-900/20 border border-yellow-700/40 rounded-lg px-3 py-2 flex items-center gap-2 text-yellow-300 text-sm">
          <Rocket size={16} />
          <span>跃迁中：前往「{travelTargetNode.name}」，剩余 {galaxy.travelTurnsRemaining} 回合</span>
        </div>
      )}

      {/* ===== 星图本体 ===== */}
      <div className="bg-slate-950/70 border border-slate-700 rounded-xl p-2 md:p-3 mb-3 md:mb-4">
        <svg viewBox="0 0 1000 700" className="w-full h-auto select-none">
          {/* 航道 */}
          {GALAXY_LANES.map((lane) => {
            const a = getGalaxyNode(lane.a);
            const b = getGalaxyNode(lane.b);
            if (!a || !b) return null;
            const onRoute = routeLaneKeys.has(laneKey(lane.a, lane.b));
            return (
              <line
                key={`${lane.a}-${lane.b}`}
                x1={a.x}
                y1={a.y}
                x2={b.x}
                y2={b.y}
                stroke={onRoute ? '#22d3ee' : '#334155'}
                strokeWidth={onRoute ? 3 : 1.5}
                strokeDasharray={onRoute ? undefined : '6 6'}
              />
            );
          })}

          {/* 节点 */}
          {GALAXY_NODES.map((node) => {
            const isVisited = visited.has(node.id);
            const isCurrent = node.id === galaxy.currentNodeId;
            const isSelected = selectedId === node.id;
            const isTarget = galaxy.targetNodeId === node.id;
            const r = NODE_RADIUS[node.type];
            return (
              <g key={node.id} onClick={() => setSelectedId(node.id)} style={{ cursor: 'pointer' }}>
                {(isCurrent || isSelected || isTarget) && (
                  <circle
                    cx={node.x}
                    cy={node.y}
                    r={r + (isCurrent ? 9 : 5)}
                    fill="none"
                    stroke={isCurrent ? '#22d3ee' : isSelected ? '#f59e0b' : '#fbbf24'}
                    strokeWidth={isCurrent ? 4 : 3}
                    strokeDasharray={isTarget && !isCurrent ? '8 5' : undefined}
                  />
                )}
                <circle
                  cx={node.x}
                  cy={node.y}
                  r={r}
                  fill={isVisited ? NODE_FILL[node.type] : '#1e293b'}
                  stroke={isVisited ? NODE_STROKE[node.type] : '#475569'}
                  strokeWidth={2}
                  strokeDasharray={isVisited ? undefined : '5 4'}
                />
                {!isVisited && (
                  <text x={node.x} y={node.y + 6} textAnchor="middle" fontSize={18} fill="#94a3b8">?</text>
                )}
                {isVisited && node.type !== 'empty' && (
                  <text x={node.x} y={node.y + r + 20} textAnchor="middle" fontSize={19} fill="#cbd5e1">
                    {node.name}
                  </text>
                )}
              </g>
            );
          })}

          {/* 母舰标识 */}
          {currentNode && (
            <g transform={`translate(${currentNode.x}, ${currentNode.y})`} style={{ pointerEvents: 'none' }}>
              <path d="M0,-34 L11,-14 L-11,-14 Z" fill="#22d3ee" />
              <text x={0} y={-40} textAnchor="middle" fontSize={17} fill="#22d3ee">母舰</text>
            </g>
          )}
        </svg>
      </div>

      {/* ===== 信息卡 ===== */}
      {selectedNode ? (
        <div className="bg-slate-900/60 border border-slate-700 rounded-xl p-3 md:p-4">{renderInfoCard(selectedNode)}</div>
      ) : (
        <div className="bg-slate-900/40 border border-slate-700/60 rounded-xl p-4 text-center text-xs text-slate-500">
          点击上方任意星系节点查看详情。
        </div>
      )}
    </div>
  );
}

export default memo(GalaxyMapPanel);
