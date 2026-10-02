// ==================== 星图面板（固定布局 50 节点） ====================
// 职责边界（重要）：星图**只负责跃迁**——画节点与航道、迷雾、母舰位置、选中路线高亮、点节点看信息、跃迁。
// 其它操作一律留在各自页签：交易/合同/黑市→「贸易」，建立殖民地→「殖民」，发掘→「考古」。
// 新增功能不要再往本面板里塞操作入口（信息展示可以）。
// 位置与跃迁的唯一真值是 ship.galaxy（见 lib/galaxy/access.ts），本文件只读不写。

import { memo, useEffect, useMemo, useRef, useState } from 'react';
import type { Mothership } from '@/types/game';
import type { GalaxyNode } from '@/types/galaxy';
import { GALAXY_NODES, getGalaxyNode } from '@/data/galaxy/nodes';
import { GALAXY_LANES } from '@/data/galaxy/lanes';
import { shortestRoute } from '@/lib/galaxy/graph';
import { getBlockedNodeIds, canEnterNode } from '@/lib/galaxy/access';
import { getKnownFactionIds, getKnownRelation } from '@/lib/galaxy/knowledge';
import { getNodeLandscapeImage } from '@/lib/galaxy/nodeImage';
import { FACTIONS } from '@/data/factions';
import { getArchaeologySite } from '@/data/galaxy/archaeology';
import { ALL_PLANETS } from '@/data/colony/planets';
import { Rocket, Lock, HelpCircle, MapPin } from 'lucide-react';

interface GalaxyMapPanelProps {
  ship: Mothership;
  factionReputation: Record<string, number>;
  onTravelToNode: (targetNodeId: string) => { success: boolean; message: string };
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

/** 缩放范围与平移边界（viewBox 为 1000×700） */
const MIN_SCALE = 0.6;
const MAX_SCALE = 4;
const MAX_PAN_X = 1500;
const MAX_PAN_Y = 1050;

interface ViewState { scale: number; x: number; y: number }

function GalaxyMapPanel({ ship, factionReputation, onTravelToNode }: GalaxyMapPanelProps) {
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [msg, setMsg] = useState('');
  const [msgType, setMsgType] = useState<'success' | 'error'>('success');
  const galaxy = ship.galaxy;
  const currentNode = getGalaxyNode(galaxy.currentNodeId);
  const travelTargetNode = getGalaxyNode(galaxy.targetNodeId);
  const traveling = galaxy.travelTurnsRemaining > 0;

  const blocked = useMemo(() => getBlockedNodeIds(factionReputation), [factionReputation]);
  const visited = useMemo(() => new Set(galaxy.visitedNodes), [galaxy.visitedNodes]);
  /** 已探明势力（迷雾判定唯一真值） */
  const knownFactionIds = useMemo(() => getKnownFactionIds(ship), [ship]);

  // ==================== 视图（缩放 / 平移）====================
  // 手机端整张星图过小：默认放大并居中，支持双指捏合、鼠标滚轮、拖拽平移与按钮缩放。
  const initialView = useMemo<ViewState>(() => {
    const narrow = typeof window !== 'undefined' && window.innerWidth < 768;
    const scale = narrow ? 1.5 : 1;
    return { scale, x: -500 * (scale - 1), y: -350 * (scale - 1) };
  }, []);
  const [view, setView] = useState<ViewState>(initialView);
  const svgRef = useRef<SVGSVGElement | null>(null);
  const pointersRef = useRef(new Map<number, { x: number; y: number }>());
  const pinchRef = useRef<{ dist: number; scale: number } | null>(null);
  const dragRef = useRef<{ x: number; y: number; moved: boolean; panning: boolean } | null>(null);
  /** 信息卡容器：选中节点后滚进视野（手机端卡片在星图下方，点完不看会以为没反应） */
  const cardRef = useRef<HTMLDivElement | null>(null);

  const clampView = (v: ViewState): ViewState => ({
    scale: Math.max(MIN_SCALE, Math.min(MAX_SCALE, v.scale)),
    x: Math.max(-MAX_PAN_X, Math.min(MAX_PAN_X, v.x)),
    y: Math.max(-MAX_PAN_Y, Math.min(MAX_PAN_Y, v.y)),
  });

  /** 客户端坐标 → viewBox 坐标（以某个屏幕点为锚点缩放时用） */
  const clientToViewBox = (clientX: number, clientY: number) => {
    const rect = svgRef.current?.getBoundingClientRect();
    if (!rect || rect.width === 0 || rect.height === 0) return { x: 500, y: 350 };
    return { x: ((clientX - rect.left) / rect.width) * 1000, y: ((clientY - rect.top) / rect.height) * 700 };
  };

  /** 以 viewBox 锚点缩放：锚点在屏幕上的位置保持不动 */
  const zoomAt = (nextScale: number, anchor: { x: number; y: number }) => {
    setView((v) => {
      const scale = Math.max(MIN_SCALE, Math.min(MAX_SCALE, nextScale));
      const ratio = scale / v.scale;
      return clampView({ scale, x: anchor.x - (anchor.x - v.x) * ratio, y: anchor.y - (anchor.y - v.y) * ratio });
    });
  };

  const zoomBy = (factor: number) => zoomAt(view.scale * factor, { x: 500, y: 350 });
  const resetView = () => setView(initialView);

  // 桌面端滚轮缩放（React 的 onWheel 监听是 passive，无法 preventDefault，故手动绑定）
  useEffect(() => {
    const el = svgRef.current?.parentElement;
    if (!el) return;
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      const anchor = clientToViewBox(e.clientX, e.clientY);
      setView((v) => {
        const scale = Math.max(MIN_SCALE, Math.min(MAX_SCALE, v.scale * (e.deltaY < 0 ? 1.12 : 1 / 1.12)));
        const ratio = scale / v.scale;
        return clampView({ scale, x: anchor.x - (anchor.x - v.x) * ratio, y: anchor.y - (anchor.y - v.y) * ratio });
      });
    };
    el.addEventListener('wheel', onWheel, { passive: false });
    return () => el.removeEventListener('wheel', onWheel);
  }, []);

  // 指针事件（鼠标与触摸统一）：单指拖拽平移（放大后），双指捏合缩放
  const handlePointerDown = (e: React.PointerEvent<SVGSVGElement>) => {
    e.currentTarget.setPointerCapture?.(e.pointerId);
    pointersRef.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (pointersRef.current.size >= 2) {
      const [p1, p2] = [...pointersRef.current.values()];
      pinchRef.current = { dist: Math.max(1, Math.hypot(p1.x - p2.x, p1.y - p2.y)), scale: view.scale };
      dragRef.current = null;
    } else {
      dragRef.current = { x: e.clientX, y: e.clientY, moved: false, panning: view.scale > 1 };
    }
  };

  const handlePointerMove = (e: React.PointerEvent<SVGSVGElement>) => {
    if (!pointersRef.current.has(e.pointerId)) return;
    pointersRef.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    const rect = svgRef.current?.getBoundingClientRect();
    if (!rect) return;

    // 双指捏合
    if (pointersRef.current.size >= 2 && pinchRef.current) {
      const [p1, p2] = [...pointersRef.current.values()];
      const dist = Math.hypot(p1.x - p2.x, p1.y - p2.y);
      zoomAt(pinchRef.current.scale * (dist / pinchRef.current.dist), clientToViewBox((p1.x + p2.x) / 2, (p1.y + p2.y) / 2));
      return;
    }

    const drag = dragRef.current;
    if (!drag) return;
    const dx = e.clientX - drag.x;
    const dy = e.clientY - drag.y;
    if (Math.hypot(dx, dy) > 6) drag.moved = true;
    if (!drag.panning || Math.hypot(dx, dy) < 2) return;
    drag.x = e.clientX;
    drag.y = e.clientY;
    setView((v) => clampView({ scale: v.scale, x: v.x + (dx / rect.width) * 1000, y: v.y + (dy / rect.height) * 700 }));
  };

  /**
   * 点选命中检测。
   * ⚠ 不能用节点的 onClick：setPointerCapture 之后 pointerup 落在 <svg> 上，
   *   浏览器把 click 派发给最近公共祖先（svg），子元素上的 onClick 永远不会触发。
   */
  const selectNodeAt = (clientX: number, clientY: number) => {
    const rect = svgRef.current?.getBoundingClientRect();
    if (!rect || rect.width === 0) return;
    const vb = clientToViewBox(clientX, clientY);
    const mx = (vb.x - view.x) / view.scale;
    const my = (vb.y - view.y) / view.scale;
    const pad = ((10 / rect.width) * 1000) / view.scale; // 10 CSS px 的触控容错
    let hitNode: GalaxyNode | null = null;
    let hitDist = Infinity;
    for (const node of GALAXY_NODES) {
      const r = NODE_RADIUS[node.type];
      const d = Math.hypot(node.x - mx, node.y - my);
      const nearMarker = d <= r + pad;
      // 已探明节点下方还有名称文字，点文字同样算命中
      const nearLabel = visited.has(node.id) && node.type !== 'empty'
        && Math.abs(mx - node.x) <= 90 && my >= node.y + r - 4 && my <= node.y + r + 34;
      if ((nearMarker || nearLabel) && d < hitDist) { hitNode = node; hitDist = d; }
    }
    if (hitNode) setSelectedId(hitNode.id);
  };

  const handlePointerEnd = (e: React.PointerEvent<SVGSVGElement>) => {
    pointersRef.current.delete(e.pointerId);
    if (pointersRef.current.size < 2) pinchRef.current = null;
    if (pointersRef.current.size > 0) return;

    const drag = dragRef.current;
    dragRef.current = null;
    if (drag?.moved) return; // 这次是拖拽平移，不是点选
    // 浏览器接管了手势（页面滚动/系统缩放）时会派发 pointercancel，这种不算点选
    if (e.type === 'pointercancel') return;
    selectNodeAt(e.clientX, e.clientY);
  };

  // 选中后把信息卡滚进视野（block: 'nearest' 只在必要时滚动，桌面端几乎不动）
  useEffect(() => {
    if (selectedId && cardRef.current?.scrollIntoView) {
      cardRef.current.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
    }
  }, [selectedId]);

  /** 迷雾下的显示名：未探测过的星系不暴露名称（跃迁途中也不泄露目的地内容） */
  const displayNameOf = (id: string | null | undefined): string => {
    const node = getGalaxyNode(id);
    if (!node) return '未知星系';
    return visited.has(node.id) ? node.name : '未探测星系';
  };

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

  /** 跃迁：结果（成功提示/被封锁/不可达）显示在星图上方的提示条里 */
  const handleTravel = (nodeId: string) => {
    const r = onTravelToNode(nodeId);
    setMsg(r.message);
    setMsgType(r.success ? 'success' : 'error');
  };

  /**
   * 跃迁操作区：**未探测与已探测节点共用**。
   * ⚠ 星图的唯一操作就是跃迁，两类卡片都必须给出入口——曾因只写在迷雾分支，
   *   导致已探明的节点点开只有信息、没有跃迁按钮（无法去已去过的地方）。
   */
  const renderTravelAction = (node: GalaxyNode) => {
    if (node.id === galaxy.currentNodeId) {
      return <p className="text-xs text-cyan-400">母舰当前就在此处。</p>;
    }
    if (traveling) {
      return <p className="text-xs text-yellow-400">跃迁中：剩余 {galaxy.travelTurnsRemaining} 回合抵达「{displayNameOf(galaxy.targetNodeId)}」。</p>;
    }
    if (!canEnterNode(node.id, factionReputation)) {
      return (
        <p className="text-xs text-red-400 flex items-center gap-1">
          <Lock size={12} /> 该势力边境已对你封锁，无法进入（提升该势力声望可解除）。
        </p>
      );
    }
    if (!route) {
      return <p className="text-xs text-red-400">无法抵达：航线被封锁的势力割断，可先提升相关势力声望或选择其他路线。</p>;
    }
    return (
      <div>
        <button
          onClick={() => handleTravel(node.id)}
          className="px-4 py-2 bg-cyan-600 hover:bg-cyan-500 rounded-lg font-bold text-white text-sm transition-colors flex items-center gap-2 min-h-[40px]"
        >
          <Rocket size={14} /> 跃迁（{route.turns} 回合）
        </button>
        {route.path.length > 2 && (
          <p className="text-[10px] text-slate-500 mt-2">
            途经：{route.path.slice(1, -1).map((id) => (visited.has(id) ? getGalaxyNode(id)?.name : '未探测星系')).join(' → ')}
          </p>
        )}
      </div>
    );
  };

  /** 信息卡内容（按节点类型分派） */
  const renderInfoCard = (node: GalaxyNode) => {
    const isVisited = visited.has(node.id);
    const isCurrent = node.id === galaxy.currentNodeId;

    if (!isVisited) {
      // ===== 迷雾：不泄露类型与名称 =====
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
          {renderTravelAction(node)}
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
          const faction = FACTIONS.find((f) => f.id === node.factionId);
          const rep = factionReputation[node.factionId || ''] || 0;
          return (
            <div className="flex items-center gap-3 mb-3">
              <img
                src={`/factions/${node.factionId}.png`}
                alt={node.name}
                onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }}
                className="w-[64px] h-[64px] md:w-[96px] md:h-[96px] rounded-lg object-cover border border-slate-700 flex-shrink-0"
              />
              <div className="min-w-0">
                <p className="text-xs text-slate-400">特产：<span className="text-slate-200">{faction?.specialtyName || '未知'}</span></p>
                <p className="text-xs text-slate-400 mt-1">声望：<span className={rep < 0 ? 'text-red-400' : rep > 0 ? 'text-emerald-300' : 'text-slate-300'}>{rep}</span></p>
              </div>
            </div>
          );
        })()}

        {node.type === 'faction' && (() => {
          // 关系探明规则唯一真值：lib/galaxy/knowledge.ts（贸易面板的势力分布共用同一口径）
          const rel = getKnownRelation(node.factionId || '', knownFactionIds);
          const nameOf = (id: string) => FACTIONS.find((f) => f.id === id)?.name || id;
          return (
            <div className="mb-3 flex flex-wrap items-center gap-2">
              {rel.allies.map((id) => (
                <span key={`a-${id}`} className="text-[10px] md:text-xs px-1.5 py-0.5 rounded bg-emerald-900/40 text-emerald-300 border border-emerald-700/50">
                  友：{nameOf(id)}
                </span>
              ))}
              {rel.enemies.map((id) => (
                <span key={`e-${id}`} className="text-[10px] md:text-xs px-1.5 py-0.5 rounded bg-red-900/40 text-red-300 border border-red-700/50">
                  敌：{nameOf(id)}
                </span>
              ))}
              {rel.hiddenCount > 0 && (
                <span className="text-[10px] md:text-xs text-slate-500">
                  {rel.hiddenCount} 条外交关系未知（需到访相关势力才能探明）
                </span>
              )}
              {rel.hiddenCount === 0 && rel.allies.length === 0 && rel.enemies.length === 0 && (
                <span className="text-[10px] md:text-xs text-slate-500">暂无已知的盟友或敌对势力</span>
              )}
            </div>
          );
        })()}

        {node.type === 'faction' && (
          <p className="text-[11px] md:text-xs text-slate-500 mt-1">
            交易、合同、黑市、打探、投资等操作都在「贸易」页签中进行（需母舰停泊在此势力）。
          </p>
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
                <p className="text-[11px] md:text-xs text-amber-400">
                  可在此建立殖民地。建立操作在「殖民」页签中进行（需 30,000 金币，全局只能殖民一颗）。
                </p>
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

        {/* 节点配图：可殖民星球用星球地貌图、遗迹用其图鉴封面、势力用势力景观图（待补，缺图自动隐藏）。
            移动端限高，避免占满屏幕；未开发节点与未探测节点不显示图片。 */}
        {(() => {
          const img = getNodeLandscapeImage(node);
          if (!img) return null;
          return (
            <div className="mt-3">
              <img
                src={img}
                alt={node.name}
                loading="lazy"
                onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }}
                className="w-full max-h-[150px] md:max-h-[260px] object-cover rounded-lg border border-slate-700 bg-slate-800/40"
              />
            </div>
          );
        })()}

        {/* 跃迁操作区：已探测节点同样必须有（去已去过的地方是最常见的操作） */}
        <div className="mt-3 pt-3 border-t border-slate-700/60">
          {renderTravelAction(node)}
        </div>
      </div>
    );
  };

  return (
    <div>
      <h2 className="text-xl md:text-2xl font-bold text-white mb-1 md:mb-2">星图</h2>
      <p className="text-xs md:text-sm text-slate-400 mb-3 md:mb-4">
        点击星系节点查看信息并跃迁。未探测的星系需要先跃迁抵达，航道长度决定跃迁所需的回合数。
        贸易、殖民、考古等操作分别在各自的页签中进行。
      </p>

      {msg && (
        <div className={`mb-3 px-3 py-2 rounded-lg text-xs md:text-sm border ${msgType === 'success' ? 'bg-emerald-900/30 border-emerald-700/50 text-emerald-300' : 'bg-red-900/30 border-red-700/50 text-red-300'}`}>
          {msg}
        </div>
      )}

      {traveling && travelTargetNode && (
        <div className="mb-3 bg-yellow-900/20 border border-yellow-700/40 rounded-lg px-3 py-2 flex items-center gap-2 text-yellow-300 text-sm">
          <Rocket size={16} />
          <span>跃迁中：前往「{displayNameOf(galaxy.targetNodeId)}」，剩余 {galaxy.travelTurnsRemaining} 回合</span>
        </div>
      )}

      {/* ===== 星图本体（支持捏合/滚轮/按钮缩放与拖拽平移） ===== */}
      <div className="bg-slate-950/70 border border-slate-700 rounded-xl p-2 md:p-3 mb-3 md:mb-4">
        <svg
          ref={svgRef}
          viewBox="0 0 1000 700"
          className="w-full h-auto select-none"
          style={{ touchAction: view.scale > 1 ? 'none' : 'pan-y', cursor: view.scale > 1 ? 'grab' : 'pointer' }}
          onPointerDown={handlePointerDown}
          onPointerMove={handlePointerMove}
          onPointerUp={handlePointerEnd}
          onPointerCancel={handlePointerEnd}
          onClick={(e) => selectNodeAt(e.clientX, e.clientY)}
        >
          <g transform={`translate(${view.x} ${view.y}) scale(${view.scale})`}>
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
                <g key={node.id} style={{ cursor: 'pointer' }}>
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
                    <text x={node.x} y={node.y + 7} textAnchor="middle" fontSize={20} fill="#94a3b8">?</text>
                  )}
                  {isVisited && node.type !== 'empty' && (
                    <text x={node.x} y={node.y + r + 22} textAnchor="middle" fontSize={21} fill="#cbd5e1">
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
          </g>
        </svg>

        {/* 缩放控件（移动端也有 40px 触控尺寸） */}
        <div className="flex items-center justify-between gap-2 mt-2">
          <p className="text-[10px] md:text-xs text-slate-500">
            双指捏合或滚轮缩放，放大后可拖动平移　当前 {Math.round(view.scale * 100)}%
          </p>
          <div className="flex items-center gap-1 flex-shrink-0">
            <button
              onClick={() => zoomBy(1 / 1.25)}
              aria-label="缩小"
              className="w-10 h-10 flex items-center justify-center bg-slate-800 hover:bg-slate-700 border border-slate-600 rounded-lg text-slate-200 text-lg font-bold"
            >−</button>
            <button
              onClick={() => zoomBy(1.25)}
              aria-label="放大"
              className="w-10 h-10 flex items-center justify-center bg-slate-800 hover:bg-slate-700 border border-slate-600 rounded-lg text-slate-200 text-lg font-bold"
            >＋</button>
            <button
              onClick={resetView}
              className="h-10 px-3 flex items-center justify-center bg-slate-800 hover:bg-slate-700 border border-slate-600 rounded-lg text-slate-200 text-xs font-bold"
            >重置</button>
          </div>
        </div>
      </div>

      {/* ===== 信息卡 ===== */}
      {selectedNode ? (
        <div ref={cardRef} className="bg-slate-900/60 border border-slate-700 rounded-xl p-3 md:p-4">{renderInfoCard(selectedNode)}</div>
      ) : (
        <div className="bg-slate-900/40 border border-slate-700/60 rounded-xl p-4 text-center text-xs text-slate-500">
          点击上方任意星系节点查看详情。
        </div>
      )}
    </div>
  );
}

export default memo(GalaxyMapPanel);
