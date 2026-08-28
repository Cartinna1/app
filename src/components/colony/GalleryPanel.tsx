// ==================== 远征图鉴（收集物回顾） ====================
// 每领袖展示：降落图（始终点亮）+ 12 个结局格（已收集亮图 / 未收集灰格）。
// 点击已收集图片可放大预览（结局附带标题与箴言）。数据只读 colony.expeditionEndings 与路线数据，无新状态。

import { useState, memo } from 'react';
import type { Colony } from '@/types/colony';
import { getLeaderExpedition } from '@/data/colony/expeditions';
import { getLeaderDef } from '@/data/colony/leaders';
import { Crown, Lock, ChevronDown, ChevronRight, Sparkles, ChevronUp } from 'lucide-react';

interface GalleryPanelProps {
  colony: Colony;
}

// 解锁隐藏收藏所需结局数（与远征终极技能解锁门槛一致：12/12）
const EXPEDITION_UNLOCK_COUNT = 12;

function GalleryPanel({ colony }: GalleryPanelProps) {
  const [selected, setSelected] = useState<{ leaderId: string; nodeId: string; kind: 'planet' | 'ending' | 'hidden' } | null>(null);
  // 每个领袖卡片默认收起，点击标题栏展开格子网格
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});
  // 隐藏收藏区（集齐 12 结局后开放）展开状态
  const [hiddenOpen, setHiddenOpen] = useState<Record<string, boolean>>({});
  const imgPath = (leaderId: string, name: string) => `/expeditions/${leaderId}/${name}`;
  const leadersWithRoute = colony.leaders.filter((l) => getLeaderExpedition(l.id));

  // 选中项大图预览
  const renderSelected = () => {
    if (!selected) return null;
    const route = getLeaderExpedition(selected.leaderId);
    if (!route) return null;
    if (selected.kind === 'planet') {
      return (
        <div className="bg-slate-900/60 border border-cyan-700/40 rounded-xl p-4 mb-4">
          <img
            src={imgPath(selected.leaderId, 'planet.webp')}
            alt={route.planetName}
            onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }}
            className="w-full aspect-video object-cover rounded-lg border border-slate-700"
          />
          <h4 className="font-bold text-slate-100 mt-2 mb-1">{route.planetName}</h4>
          <p className="text-xs text-slate-400 leading-relaxed whitespace-pre-line">{route.planetIntro}</p>
        </div>
      );
    }
    // 隐藏收藏大图（集齐 12 结局后开放）
    if (selected.kind === 'hidden') {
      const img = route.hiddenImages?.find((h) => h.id === selected.nodeId);
      if (!img) return null;
      return (
        <div className="bg-slate-900/60 border border-amber-700/40 rounded-xl p-4 mb-4">
          <img
            src={imgPath(selected.leaderId, `${img.id}.webp`)}
            alt={img.title}
            onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }}
            className="w-full max-w-2xl aspect-video object-cover mx-auto rounded-lg border border-amber-700/40"
          />
          <h4 className="font-bold text-amber-300 text-center mt-2 mb-1">隐藏收藏 {img.id} · {img.title}</h4>
          {img.desc && <p className="text-sm text-amber-200/80 text-center leading-relaxed">{img.desc}</p>}
        </div>
      );
    }
    const node = route.nodes[selected.nodeId];
    if (!node) return null;
    return (
      <div className="bg-slate-900/60 border border-purple-700/40 rounded-xl p-4 mb-4">
        <img
          src={imgPath(selected.leaderId, `${selected.nodeId}.webp`)}
          alt={node.title}
          onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }}
          className="w-full max-w-2xl aspect-video object-cover mx-auto rounded-lg border border-purple-700/40"
        />
        <h4 className="font-bold text-purple-300 text-center mt-2 mb-1">结局 {selected.nodeId} · {node.title}</h4>
        <p className="text-sm italic text-purple-200/90 text-center leading-relaxed">{node.motto}</p>
      </div>
    );
  };

  return (
    <div>
      <h2 className="text-xl md:text-2xl font-bold text-white mb-1 md:mb-2">图鉴</h2>
      <p className="text-xs md:text-sm text-slate-400 mb-4">远征中收集到的降落图与结局图，随时回顾。</p>

      {renderSelected()}

      {leadersWithRoute.length === 0 && (
        <p className="text-center text-sm text-slate-500 py-6">暂无远征图鉴。招募领袖并等待其远征内容开放后出现。</p>
      )}

      {leadersWithRoute.map((l) => {
        const route = getLeaderExpedition(l.id)!;
        const ld = getLeaderDef(l.id);
        const list = colony.expeditionEndings?.[l.id] || [];
        const cells: { id: string; title: string; collected: boolean }[] = [
          { id: 'planet', title: route.planetName, collected: true },
          ...Array.from({ length: 12 }, (_, i) => {
            const did = `D${i + 1}`;
            return { id: did, title: route.nodes[did]?.title || did, collected: list.includes(did) };
          }),
        ];
        const unlocked = list.length >= EXPEDITION_UNLOCK_COUNT;
        return (
          <div key={l.id} className="bg-slate-800/60 border border-slate-700 rounded-xl p-4 mb-4">
            <button
              onClick={() => setExpanded((prev) => ({ ...prev, [l.id]: !prev[l.id] }))}
              className="w-full flex items-center gap-1.5 mb-3 text-left group"
            >
              <Crown size={14} className="text-amber-400" />
              <span className="text-sm font-bold text-slate-200 group-hover:text-white">{l.name}</span>
              <span className="text-xs text-slate-500 font-normal">· {ld?.abilityName || ''} · 已收集 {list.length}/12</span>
              <span className="ml-auto text-slate-500 group-hover:text-slate-300">
                {expanded[l.id] ? <ChevronDown size={16} /> : <ChevronRight size={16} />}
              </span>
            </button>
            {expanded[l.id] && (
            <div className="grid grid-cols-3 md:grid-cols-4 gap-2">
              {cells.map((c) => (
                <button
                  key={c.id}
                  onClick={() => c.collected && setSelected({ leaderId: l.id, nodeId: c.id, kind: c.id === 'planet' ? 'planet' : 'ending' })}
                  className={`rounded-lg overflow-hidden border text-left ${c.collected ? 'cursor-pointer border-slate-700 hover:border-cyan-500' : 'cursor-default border-slate-800 bg-slate-900/40'}`}
                >
                  {c.collected ? (
                    <>
                      <img
                        src={imgPath(l.id, `${c.id}.webp`)}
                        alt={c.title}
                        onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }}
                        className="w-full aspect-video object-cover"
                      />
                      <p className="text-[10px] text-slate-400 px-1.5 py-1 truncate">
                        {c.id === 'planet' ? '降落' : c.id} · {c.title}
                      </p>
                    </>
                  ) : (
                    <div className="aspect-video flex flex-col items-center justify-center text-slate-700">
                      <Lock size={16} />
                      <span className="text-[10px] mt-1">{c.id}</span>
                    </div>
                  )}
                </button>
              ))}
              {/* 隐藏收藏入口（紧跟 D12；集齐 12 结局后解锁） */}
              <button
                onClick={() => { if (unlocked) setHiddenOpen((prev) => ({ ...prev, [l.id]: !prev[l.id] })); }}
                className={`rounded-lg border overflow-hidden aspect-video flex flex-col items-center justify-center gap-0.5 text-center ${unlocked ? 'cursor-pointer border-amber-500/60 bg-amber-900/20 text-amber-300 hover:border-amber-400' : 'cursor-default border-slate-800 bg-slate-900/40 text-slate-700'}`}
              >
                {unlocked ? (hiddenOpen[l.id] ? <ChevronUp size={16} /> : <Sparkles size={16} />) : <Lock size={16} />}
                <span className="text-[10px]">{unlocked ? `隐藏收藏 ${route.hiddenImages?.length || 0} 张` : '隐藏剧情'}</span>
                {!unlocked && <span className="text-[10px] text-slate-600">集齐12结局解锁</span>}
              </button>
            </div>
            )}
            {/* 隐藏收藏展开区（集齐 12 结局后开放） */}
            {hiddenOpen[l.id] && unlocked && (
              <div className="mt-3 pt-3 border-t border-slate-700/60">
                <p className="text-xs font-bold text-amber-300 mb-2 flex items-center gap-1.5">
                  <Sparkles size={12} />隐藏收藏（{route.hiddenImages?.length || 0} 张）
                </p>
                <div className="grid grid-cols-3 gap-2">
                  {(route.hiddenImages || []).map((h) => (
                    <button
                      key={h.id}
                      onClick={() => setSelected({ leaderId: l.id, nodeId: h.id, kind: 'hidden' })}
                      className="rounded-lg overflow-hidden border border-slate-700 cursor-pointer hover:border-amber-500 text-left"
                    >
                      <img
                        src={imgPath(l.id, `${h.id}.webp`)}
                        alt={h.title}
                        onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }}
                        className="w-full aspect-video object-cover"
                      />
                      <p className="text-[10px] text-amber-200/90 px-1.5 py-1 truncate">{h.id} · {h.title}</p>
                    </button>
                  ))}
                </div>
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

export default memo(GalleryPanel);
