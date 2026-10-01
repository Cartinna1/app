// ==================== 考古面板（独立页签，不与星图共用） ====================
// 布局：顶部当前发掘进度（阶段图片位 + 进度条 + 抉择/稳妥/中止）→ 十处遗迹列表 → 考古图鉴。
// 数据来源：data/galaxy/archaeology.ts（阶段/投入/奖励）、ship.galaxy.archaeology（进度）。
// 移动端：单列纵向排列，按钮与下拉均使用大触控尺寸（min-h-[40px]）。

import { useState, memo } from 'react';
import type { Mothership } from '@/types/game';
import type { ArchaeologySite } from '@/types/galaxy';
import { ARCHAEOLOGY_SITES, ARCHAEOLOGY_SITE_COUNT, getArchaeologySite } from '@/data/galaxy/archaeology';
import { PERMA_BONUS_MAP } from '@/data/galaxy/permaBonuses';
import { getRelicById } from '@/data/relics';
import { excavationSuccessRate } from '@/lib/galaxy/archaeologyTurn';
import { flattenCost, formatCost } from '@/lib/turn/resourceCost';
import { getGalaxyNode } from '@/data/galaxy/nodes';
import { Landmark, Clock, Users, Trophy, AlertTriangle, Sparkles, ChevronRight } from 'lucide-react';

type ActionResult = { success: boolean; message: string };

interface ArchaeologyPanelProps {
  ship: Mothership;
  onStartExcavation: (siteId: string, leaderId: string) => ActionResult;
  onContinueExcavation: (siteId: string) => ActionResult;
  onResolveChoice: (siteId: string, kind: 'safe' | 'risky') => ActionResult;
  onSteadyExcavation: (siteId: string) => ActionResult;
  onChangeLeader: (siteId: string, leaderId: string) => ActionResult;
  onAbandonExcavation: (siteId: string) => ActionResult;
}

/** 奖励一句话（遗物 / 永久加成 / 资源 / 称号） */
function describeReward(site: ArchaeologySite): string {
  const parts: string[] = [];
  for (const id of site.reward.relics || []) parts.push(`遗物「${getRelicById(id)?.name || id}」`);
  for (const id of site.reward.permaBonuses || []) parts.push(`永久加成「${PERMA_BONUS_MAP[id]?.name || id}」`);
  if (site.reward.title) parts.push(`称号「${site.reward.title}」`);
  if (site.reward.gold) parts.push(`金币 ${site.reward.gold.toLocaleString()}`);
  if (site.reward.stardust) parts.push(`星尘 ${site.reward.stardust}`);
  if (site.reward.researchPoints) parts.push(`科研点 ${site.reward.researchPoints}`);
  if (site.reward.food) parts.push(`食物 ${site.reward.food}`);
  if (site.reward.alloy) parts.push(`合金 ${site.reward.alloy}`);
  if (site.reward.materials) {
    for (const [id, n] of Object.entries(site.reward.materials)) parts.push(`${id} ${n}`);
  }
  return parts.join(' + ') || '无';
}

function ArchaeologyPanel({
  ship,
  onStartExcavation,
  onContinueExcavation,
  onResolveChoice,
  onSteadyExcavation,
  onChangeLeader,
  onAbandonExcavation,
}: ArchaeologyPanelProps) {
  const [msg, setMsg] = useState('');
  const [msgType, setMsgType] = useState<'success' | 'error'>('success');
  const [selectedSiteId, setSelectedSiteId] = useState<string | null>(null);
  const [leaderPick, setLeaderPick] = useState<string>('');

  const galaxy = ship.galaxy;
  const archaeology = galaxy.archaeology || {};
  const leaders = ship.colony?.leaders || [];
  const currentSiteId = getGalaxyNode(galaxy.currentNodeId)?.siteId || null;

  const showMsg = (r: ActionResult) => {
    setMsg(r.message);
    setMsgType(r.success ? 'success' : 'error');
    setTimeout(() => setMsg(''), 4000);
  };

  const activeEntry = Object.entries(archaeology).find(([, st]) => st.status === 'digging' || (st.status === 'idle' && st.stageIndex > 0));
  const activeSite = activeEntry ? getArchaeologySite(activeEntry[0]) : undefined;
  const activeState = activeEntry ? activeEntry[1] : undefined;

  const completed = ARCHAEOLOGY_SITES.filter((s) => archaeology[s.id]?.status === 'done');

  /** 当前阶段的成功率（用于展示，公式唯一真值在 lib/galaxy/archaeologyTurn.ts） */
  const renderRate = (site: ArchaeologySite, stageIndex: number, leaderId: string | undefined) => {
    const stage = site.stages[stageIndex];
    if (!stage) return null;
    const level = leaders.find((l) => l.id === leaderId)?.level ?? 1;
    const rate = excavationSuccessRate(ship, stage, level, archaeology[site.id]?.choiceKind);
    return <span className="text-cyan-300 font-bold">{Math.round(rate * 100)}%</span>;
  };

  return (
    <div>
      <h2 className="text-xl md:text-2xl font-bold text-white mb-1 md:mb-2">考古</h2>
      <p className="text-xs md:text-sm text-slate-400 mb-3 md:mb-4">
        派一名领袖驻守遗迹逐阶段发掘。阶段有成败判定，失败不倒退进度但会拖延时间，连续失败两次可稳妥推进。
        同一时间只能发掘一处遗迹。
      </p>

      {msg && (
        <div className={`mb-3 px-3 py-2 rounded-lg text-xs md:text-sm border ${msgType === 'success' ? 'bg-emerald-900/30 border-emerald-700/50 text-emerald-300' : 'bg-red-900/30 border-red-700/50 text-red-300'}`}>
          {msg}
        </div>
      )}

      {/* ===== 进行中的发掘 ===== */}
      {activeSite && activeState && (() => {
        const stage = activeSite.stages[activeState.stageIndex];
        if (!stage) return null;
        const cost = flattenCost(stage.cost);
        const ratio = stage.turns > 0 ? Math.max(0, Math.min(1, 1 - activeState.turnsLeft / (stage.turns + 1))) : 0;
        const stationedLeader = leaders.find((l) => l.id === activeState.leaderId);
        return (
          <div className="mb-4 bg-slate-900/60 border border-purple-700/40 rounded-xl p-3 md:p-4">
            <div className="flex items-center gap-2 mb-3 flex-wrap">
              <Landmark size={18} className="text-purple-400" />
              <h3 className="font-bold text-purple-200">{activeSite.name}</h3>
              <span className="text-[10px] px-1.5 py-0.5 rounded bg-slate-800 text-slate-300 border border-slate-700">{activeSite.civilization}</span>
              <span className="text-[10px] px-1.5 py-0.5 rounded bg-purple-900/50 text-purple-200">
                第 {activeState.stageIndex + 1}/{activeSite.stages.length} 阶段
              </span>
              {activeState.status === 'idle' && <span className="text-[10px] text-amber-400">等待投入资源</span>}
              {activeState.pendingChoice && <span className="text-[10px] text-cyan-300">等待抉择</span>}
            </div>

            {/* 阶段图片位（缺图时显示占位框） */}
            <div className="relative w-full aspect-video rounded-lg border border-slate-700 bg-slate-800/40 overflow-hidden mb-3">
              <div className="absolute inset-0 flex items-center justify-center text-[10px] md:text-xs text-slate-600">
                阶段图片位（{stage.id}）
              </div>
              <img
                src={stage.image}
                alt={stage.title}
                onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }}
                className="relative w-full h-full object-cover"
              />
            </div>

            <h4 className="font-bold text-slate-100 mb-1">{stage.title}</h4>
            <p className="text-sm text-slate-300 leading-relaxed whitespace-pre-line mb-3">{stage.text}</p>

            <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-[11px] md:text-xs text-slate-400 mb-3">
              <span className="flex items-center gap-1"><Clock size={12} /> 剩余 {activeState.turnsLeft} 回合</span>
              <span>成功率 {renderRate(activeSite, activeState.stageIndex, activeState.leaderId)}</span>
              <span>阶段投入 {formatCost(cost)}</span>
              <span className="flex items-center gap-1"><Users size={12} /> 驻守：{stationedLeader ? `Lv${stationedLeader.level}` : '未知'}</span>
              {activeState.fails > 0 && <span className="text-red-400">连续失败 {activeState.fails} 次</span>}
            </div>

            {/* 进度条 */}
            <div className="w-full h-2 bg-slate-800 rounded-full overflow-hidden mb-3">
              <div className="h-full bg-purple-500 transition-all" style={{ width: `${Math.round(ratio * 100)}%` }} />
            </div>

            {/* 抉择 */}
            {activeState.pendingChoice && stage.choice && (
              <div className="mb-3 bg-slate-800/60 border border-cyan-700/40 rounded-lg p-3">
                <p className="text-xs md:text-sm text-cyan-200 mb-2 flex items-center gap-1">
                  <AlertTriangle size={13} /> {stage.choice.prompt}
                </p>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                  {stage.choice.options.map((opt) => (
                    <button
                      key={opt.kind}
                      onClick={() => showMsg(onResolveChoice(activeSite.id, opt.kind))}
                      className={`text-left px-3 py-2 rounded-lg border transition-colors min-h-[44px] ${opt.kind === 'risky' ? 'border-amber-700/50 bg-amber-900/20 hover:bg-amber-900/40' : 'border-cyan-700/50 bg-cyan-900/20 hover:bg-cyan-900/40'}`}
                    >
                      <span className="text-xs md:text-sm font-bold text-slate-100">{opt.label}</span>
                      <span className={`text-[10px] ml-2 ${opt.kind === 'risky' ? 'text-amber-400' : 'text-cyan-400'}`}>
                        {opt.kind === 'risky' ? '冒险' : '稳妥'}
                      </span>
                      <p className="text-[10px] md:text-xs text-slate-400 mt-0.5">{opt.description}</p>
                    </button>
                  ))}
                </div>
              </div>
            )}

            {/* 操作 */}
            <div className="flex flex-wrap gap-2">
              {activeState.status === 'idle' && (
                <button
                  onClick={() => showMsg(onContinueExcavation(activeSite.id))}
                  className="px-4 py-2 bg-purple-600 hover:bg-purple-500 rounded-lg font-bold text-white text-sm min-h-[40px]"
                >
                  继续发掘（投入 {formatCost(cost)}）
                </button>
              )}
              {activeState.status === 'digging' && activeState.fails >= 2 && !activeState.pendingChoice && (
                <button
                  onClick={() => showMsg(onSteadyExcavation(activeSite.id))}
                  className="px-4 py-2 bg-cyan-700 hover:bg-cyan-600 rounded-lg font-bold text-white text-sm min-h-[40px]"
                >
                  稳妥推进（必成功，奖励减半）
                </button>
              )}
              {activeState.status === 'digging' && !activeState.pendingChoice && (
                <button
                  onClick={() => showMsg(onAbandonExcavation(activeSite.id))}
                  className="px-4 py-2 bg-slate-700 hover:bg-slate-600 rounded-lg font-bold text-slate-200 text-sm min-h-[40px]"
                >
                  中止（进度保留）
                </button>
              )}
              {leaders.length > 1 && activeState.status !== 'done' && (
                <div className="flex items-center gap-2">
                  <select
                    value=""
                    onChange={(e) => { if (e.target.value) showMsg(onChangeLeader(activeSite.id, e.target.value)); }}
                    className="bg-slate-800 border border-slate-600 rounded-lg px-2 py-2 text-xs text-slate-200 min-h-[40px]"
                  >
                    <option value="">更换驻守领袖…</option>
                    {leaders.map((l) => (
                      <option key={l.id} value={l.id}>{l.id} Lv{l.level}</option>
                    ))}
                  </select>
                </div>
              )}
            </div>
          </div>
        );
      })()}

      {/* ===== 遗迹列表 ===== */}
      <div className="mb-4">
        <h3 className="text-xs text-purple-400 font-bold mb-2">遗迹列表（{completed.length}/{ARCHAEOLOGY_SITE_COUNT} 已完成）</h3>
        <div className="space-y-2">
          {ARCHAEOLOGY_SITES.map((site) => {
            const st = archaeology[site.id];
            const status = st?.status === 'done' ? '已完成' : st ? '进行中' : '未发掘';
            const isHere = currentSiteId === site.id;
            return (
              <div
                key={site.id}
                className={`rounded-lg border p-3 ${selectedSiteId === site.id ? 'border-purple-500 bg-purple-900/20' : 'border-slate-700 bg-slate-800/40'}`}
              >
                <button onClick={() => { setSelectedSiteId(site.id); setLeaderPick(''); }} className="w-full text-left min-h-[40px]">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="text-sm md:text-base font-bold text-slate-100">{site.name}</span>
                    <span className="text-[10px] px-1.5 py-0.5 rounded bg-slate-900 text-slate-400 border border-slate-700">{site.civilization}</span>
                    <span className={`text-[10px] px-1.5 py-0.5 rounded ${status === '已完成' ? 'bg-emerald-900/50 text-emerald-300' : status === '进行中' ? 'bg-amber-900/50 text-amber-300' : 'bg-slate-800 text-slate-400'}`}>{status}</span>
                    {isHere && <span className="text-[10px] px-1.5 py-0.5 rounded bg-cyan-600 text-white">母舰在此</span>}
                    <ChevronRight size={14} className="text-slate-500 ml-auto" />
                  </div>
                  <p className="text-[10px] md:text-xs text-slate-500 mt-1">
                    {site.stages.length} 阶段{site.minLeaderLevel > 0 ? ` · 需 Lv${site.minLeaderLevel} 领袖` : ''} · 奖励：{describeReward(site)}
                  </p>
                </button>

                {selectedSiteId === site.id && (
                  <div className="mt-2 pt-2 border-t border-slate-700/60">
                    <p className="text-xs text-slate-400 mb-2">{site.intro}</p>
                    {status === '已完成' ? (
                      <p className="text-xs text-emerald-400">已完成发掘，奖励见考古图鉴。</p>
                    ) : status === '进行中' ? (
                      <p className="text-xs text-amber-300">正在发掘中，进度见上方面板。</p>
                    ) : !isHere ? (
                      <p className="text-xs text-slate-400">母舰不在此遗迹星系，请先在「星图」跃迁抵达。</p>
                    ) : leaders.length === 0 ? (
                      <p className="text-xs text-slate-400">需要先建立殖民地并招募领袖，才能派出考古队。</p>
                    ) : (
                      <div className="flex flex-col md:flex-row md:items-center gap-2">
                        <select
                          value={leaderPick}
                          onChange={(e) => setLeaderPick(e.target.value)}
                          className="bg-slate-800 border border-slate-600 rounded-lg px-2 py-2 text-xs text-slate-200 min-h-[40px]"
                        >
                          <option value="">选择驻守领袖…</option>
                          {leaders.map((l) => (
                            <option key={l.id} value={l.id} disabled={site.minLeaderLevel > 0 && l.level < site.minLeaderLevel}>
                              {l.id} Lv{l.level}{site.minLeaderLevel > 0 && l.level < site.minLeaderLevel ? `（需 Lv${site.minLeaderLevel}）` : ''}
                            </option>
                          ))}
                        </select>
                        <button
                          disabled={!leaderPick}
                          onClick={() => showMsg(onStartExcavation(site.id, leaderPick))}
                          className={`px-4 py-2 rounded-lg font-bold text-sm min-h-[40px] ${leaderPick ? 'bg-purple-600 hover:bg-purple-500 text-white' : 'bg-slate-700 text-slate-500 cursor-not-allowed'}`}
                        >
                          开始发掘（投入 {formatCost(flattenCost(site.stages[0].cost))}）
                        </button>
                      </div>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>

      {/* ===== 考古图鉴 ===== */}
      <div className="bg-slate-900/60 border border-slate-700 rounded-xl p-3 md:p-4">
        <h3 className="text-xs text-amber-400 font-bold mb-3 flex items-center gap-2">
          <Trophy size={14} className="text-amber-400" /> 考古图鉴（{completed.length}/{ARCHAEOLOGY_SITE_COUNT}）
        </h3>
        {completed.length === 0 ? (
          <p className="text-xs text-slate-500">完成任意遗迹发掘后，这里会收录它的封面图与奖励记录。</p>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            {completed.map((site) => (
              <div key={site.id} className="bg-slate-800/50 border border-amber-700/30 rounded-lg overflow-hidden">
                <div className="relative w-full aspect-video bg-slate-800/60">
                  <div className="absolute inset-0 flex items-center justify-center text-[10px] text-slate-600">图鉴封面位</div>
                  <img
                    src={site.galleryImage}
                    alt={site.name}
                    onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }}
                    className="relative w-full h-full object-cover"
                  />
                </div>
                <div className="p-3">
                  <div className="flex items-center gap-2 flex-wrap mb-1">
                    <span className="text-sm font-bold text-amber-200">{site.name}</span>
                    <span className="text-[10px] text-slate-500">{site.civilization}</span>
                  </div>
                  <p className="text-[10px] md:text-xs text-slate-400">奖励：{describeReward(site)}</p>
                </div>
              </div>
            ))}
          </div>
        )}
        {(galaxy.titles || []).length > 0 && (
          <p className="text-[11px] text-amber-300 mt-3 flex items-center gap-1">
            <Sparkles size={12} /> 已获称号：{galaxy.titles.join('、')}
          </p>
        )}
      </div>
    </div>
  );
}

export default memo(ArchaeologyPanel);
