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
import { getShipTravel } from '@/lib/galaxy/travel';
import type { ShipTravelPlan } from '@/lib/galaxy/travel';

/** 无选中节点时的空方案（模块级常量，避免每次渲染新建对象击穿 memo） */
const EMPTY_TRAVEL: ShipTravelPlan = { route: null, turns: 0, tollRoute: null, tollTurns: 0, hostileVia: [], tollGold: 0 };
import { getBlockedNodeIds, canEnterNode, HOSTILE_TOLL_GOLD } from '@/lib/galaxy/access';
import { getKnownFactionIds, getKnownRelation, getNodeDisplayName, isNodeDiscovered } from '@/lib/galaxy/knowledge';
import { getNodeLandscapeImage } from '@/lib/galaxy/nodeImage';
import {
  LAIR_FILL,
  LAIR_LABEL,
  LAIR_STROKE,
  NODE_FILL,
  NODE_RADIUS,
  NODE_STROKE,
  TYPE_LABEL,
  nodeStyle,
  nodeTypeLabel,
} from '@/lib/galaxy/nodeStyle';
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

/**
 * 图例（星图下方那排小圆点）：**从 lib/galaxy/nodeStyle 的配色表派生**，不另抄一份颜色。
 * `empty` 那一行取 `TYPE_LABEL.empty`（「空星系」），老巢单独占一行 —— 红色节点没有图例
 * 玩家不会知道它是什么（文案与信息卡的类型标签同源，都是「海盗老巢」）。
 * ⚠ 图例只讲**节点分类**、不讲位置：它不泄露任何一个具体节点的身份，也不受迷雾影响。
 */
const LEGEND_ITEMS: ReadonlyArray<{ key: string; label: string; fill: string; stroke: string }> = [
  { key: 'faction', label: TYPE_LABEL.faction, fill: NODE_FILL.faction, stroke: NODE_STROKE.faction },
  { key: 'colony', label: TYPE_LABEL.colony, fill: NODE_FILL.colony, stroke: NODE_STROKE.colony },
  { key: 'ruin', label: TYPE_LABEL.ruin, fill: NODE_FILL.ruin, stroke: NODE_STROKE.ruin },
  { key: 'empty', label: TYPE_LABEL.empty, fill: NODE_FILL.empty, stroke: NODE_STROKE.empty },
  { key: 'lair', label: LAIR_LABEL, fill: LAIR_FILL, stroke: LAIR_STROKE },
];

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
  /** 已探明节点集合 —— **迷雾的唯一判据** `lib/galaxy/knowledge.isNodeDiscovered`（AGENTS 第九节：
   *  规则要落到函数上）；本面板的节点上色、名称文字、信息卡分支与点击容错都读它，
   *  不再就地写 `visitedNodes.includes` / `new Set(visitedNodes)`。 */
  const discoveredIds = useMemo(
    () => new Set(GALAXY_NODES.filter((node) => isNodeDiscovered(ship, node.id)).map((node) => node.id)),
    [ship]
  );
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
  /** 加载失败的配图地址（按 URL 记录：缺图时整块收掉，且切换到有图的节点能正常显示。
   *  不用 DOM style 是因为同一 <img> 会被 React 复用，手工隐藏会残留到下一个节点） */
  const [failedImg, setFailedImg] = useState<string | null>(null);

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
      // 已探明节点下方还有名称文字（含已探明的海盗老巢），点文字同样算命中
      const nearLabel = discoveredIds.has(node.id) && (node.type !== 'empty' || !!node.pirateLair)
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

  /** 迷雾下的显示名：未探测过的星系不暴露名称（唯一真值 lib/galaxy/knowledge.getNodeDisplayName，
   *  贸易面板与「下一回合预告」同源，勿在此另写判断） */
  const displayNameOf = (id: string | null | undefined): string => getNodeDisplayName(ship, id);

  // 选中节点的跃迁方案（实际回合数 + 无免费路线时的宿敌过路费）。
  // 唯一真值 lib/galaxy/travel.getShipTravel —— 与实际跃迁（useTrade）同源，避免"显示 5 回合、实走 4 回合"。
  const travel = useMemo(
    () => (selectedId ? getShipTravel(ship, selectedId, blocked) : EMPTY_TRAVEL),
    [ship, selectedId, blocked]
  );
  /** 当前生效的路线：免费优先，否则付费途经宿敌的那条（路线高亮与"途经"行都用它） */
  const route = travel.route ?? travel.tollRoute;
  const isTollRoute = !travel.route && !!travel.tollRoute;

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
          className={`px-4 py-2 rounded-lg font-bold text-white text-sm transition-colors flex items-center gap-2 min-h-[40px] ${isTollRoute ? 'bg-amber-600 hover:bg-amber-500' : 'bg-cyan-600 hover:bg-cyan-500'}`}
        >
          <Rocket size={14} /> {isTollRoute
            ? `付费途经（${travel.tollTurns} 回合 · 过路费 ${travel.tollGold.toLocaleString()} 金币）`
            : `跃迁（${travel.turns} 回合）`}
        </button>
        {/* 付费途经：说清"付什么、路过谁、进不去" */}
        {isTollRoute && (
          <p className="text-[10px] md:text-xs text-amber-400/90 mt-2">
            免费航线被宿敌割断，可付过路费途经 {travel.hostileVia.map((id) => displayNameOf(id)).join('、')}（每处 {HOSTILE_TOLL_GOLD.toLocaleString()} 金币）；宿敌星系本身仍不可进入、不可交易，付费会使其声望 +1。
          </p>
        )}
        {route.path.length > 2 && (
          <p className="text-[10px] text-slate-500 mt-2">
            途经：{route.path.slice(1, -1).map((id) => displayNameOf(id)).join(' → ')}
          </p>
        )}
      </div>
    );
  };

  /** 信息卡内容（按节点类型分派） */
  const renderInfoCard = (node: GalaxyNode) => {
    const isVisited = discoveredIds.has(node.id);
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
          <span className="text-[10px] px-1.5 py-0.5 rounded bg-slate-800 text-slate-300 border border-slate-700">{nodeTypeLabel(node)}</span>
          {isCurrent && <span className="text-[10px] px-1.5 py-0.5 rounded bg-cyan-600 text-white">母舰所在</span>}
        </div>

        {node.type === 'faction' && (() => {
          const faction = FACTIONS.find((f) => f.id === node.factionId);
          const rep = factionReputation[node.factionId || ''] || 0;
          return (
            <div className="flex items-center gap-3 mb-3">
              <img
                key={node.factionId}
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

        {node.type === 'faction' && (() => {
          // 势力简介：读静态表（data/factions 的 intro），不读存档快照——存档里的 factions 是旧快照，
          // 新增静态字段在里面不存在；价格等运行时数据本来就在 factionPrices/factionSellMultipliers。
          const intro = FACTIONS.find((f) => f.id === node.factionId)?.intro;
          if (!intro) return null;
          return (
            <p className="text-[11px] md:text-xs text-slate-400 mt-2 leading-relaxed">
              {intro}
            </p>
          );
        })()}

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

        {/* 节点配图：可殖民星球用星球地貌图、遗迹用其图鉴封面、势力用势力景观图、海盗老巢用老巢图
            （缺图自动隐藏；未探测节点由 getNodeLandscapeImage 的迷雾守卫拦住 → 也不出图）。
            配图**宽度跟卡片走、按 16:9 完整显示**：w-full + aspect-video → 高度 = 宽度 × 9/16，
            既不会被裁，也不会缩成一小块（手机 ≈342×192、桌面 1440px ≈1360×765）。
            ⚠ 图片按 URL 记失败：缺图时整块（含外边距）收起，不留空白带；切到有图的节点正常显示。 */}
        {(() => {
          const img = getNodeLandscapeImage(node, ship);
          if (!img || failedImg === img) return null;
          return (
            <div className="mt-3">
              <img
                src={img}
                alt={node.name}
                loading="lazy"
                onError={() => setFailedImg(img)}
                className="block w-full aspect-video object-cover rounded-lg border border-slate-700 bg-slate-800/40"
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
              const isDiscovered = discoveredIds.has(node.id);
              const isCurrent = node.id === galaxy.currentNodeId;
              const isSelected = selectedId === node.id;
              const isTarget = galaxy.targetNodeId === node.id;
              // 配色与半径的唯一入口：未探明 → 灰底虚线 + ?（老巢也不例外，见 nodeStyle）
              const { r, fill, stroke } = nodeStyle(node, isDiscovered);
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
                    fill={fill}
                    stroke={stroke}
                    strokeWidth={2}
                    strokeDasharray={isDiscovered ? undefined : '5 4'}
                  />
                  {!isDiscovered && (
                    <text x={node.x} y={node.y + 7} textAnchor="middle" fontSize={20} fill="#94a3b8">?</text>
                  )}
                  {isDiscovered && (node.type !== 'empty' || !!node.pirateLair) && (
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

        {/* 图例：红点（海盗老巢）只有在这里才解释得清是什么 —— 只讲分类，不讲位置（不泄露迷雾） */}
        <div className="flex flex-wrap items-center justify-center gap-x-3 gap-y-1 mt-2">
          {LEGEND_ITEMS.map((item) => (
            <span key={item.key} className="flex items-center gap-1 text-[10px] md:text-xs text-slate-400">
              <span
                className="inline-block w-2.5 h-2.5 rounded-full border-2 flex-none"
                style={{ backgroundColor: item.fill, borderColor: item.stroke }}
              />
              {item.label}
            </span>
          ))}
        </div>

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
