// ==================== 考古面板（独立页签，不与星图共用） ====================
// 布局：顶部当前发掘进度（阶段图片位 + 进度条 + 抉择/稳妥/中止）→ 十处遗迹列表 → 考古图鉴。
// 数据来源：data/galaxy/archaeology.ts（阶段/投入/奖励）、ship.galaxy.archaeology（进度）。
// 移动端：单列纵向排列，按钮与下拉均使用大触控尺寸（min-h-[40px]）。

import { useState, memo } from 'react';
import type { Mothership } from '@/types/game';
import type { ArchaeologySite, ArchaeologyReward } from '@/types/galaxy';
import { ARCHAEOLOGY_SITES, ARCHAEOLOGY_SITE_COUNT, getArchaeologySite } from '@/data/galaxy/archaeology';
import { PERMA_BONUS_MAP } from '@/data/galaxy/permaBonuses';
import { getRelicById } from '@/data/relics';
import { getMaterialName } from '@/data/materialNames';
import { excavationSuccessRate, findStationedSite, DISCOVERY_CHANCE } from '@/lib/galaxy/archaeologyTurn';
import { flattenCost, formatCost } from '@/lib/turn/resourceCost';
import { getGalaxyNode } from '@/data/galaxy/nodes';
import { getLeaderDef } from '@/data/colony/leaders';
import { Landmark, Clock, Users, Trophy, AlertTriangle, Sparkles, ChevronRight, ChevronDown } from 'lucide-react';

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

/** 奖励一句话（遗物 / 永久加成 / 资源 / 称号）——**最终奖励与阶段小奖励共用同一形状**，故同一函数。
 *  ⚠ 必须带**效果**：只写名字（如"永久加成「农业遗产」"）玩家不知道它干什么；
 *    效果文案的唯一来源是数据（遗物 `effect` / 永久加成 `description`），别在这里手写第二份。 */
function describeRewardValue(reward: ArchaeologyReward | undefined): string {
  if (!reward) return '无';
  const parts: string[] = [];
  for (const id of reward.relics || []) {
    const r = getRelicById(id);
    parts.push(`遗物「${r?.name || id}」${r?.effect ? `（${r.effect}）` : ''}`);
  }
  for (const id of reward.permaBonuses || []) {
    const p = PERMA_BONUS_MAP[id];
    parts.push(`永久加成「${p?.name || id}」${p?.description ? `（${p.description}）` : ''}`);
  }
  if (reward.title) parts.push(`称号「${reward.title}」`);
  if (reward.gold) parts.push(`金币 ${reward.gold.toLocaleString()}`);
  if (reward.stardust) parts.push(`星尘 ${reward.stardust}`);
  if (reward.researchPoints) parts.push(`科研点 ${reward.researchPoints}`);
  if (reward.food) parts.push(`食物 ${reward.food}`);
  if (reward.alloy) parts.push(`合金 ${reward.alloy}`);
  if (reward.materials) {
    // 原料译名一律走 getMaterialName（勿直接渲染 gold_ore / quantum 这类 id）
    for (const [id, n] of Object.entries(reward.materials)) parts.push(`${getMaterialName(id)} ${n}`);
  }
  return parts.join(' + ') || '无';
}

/** 遗迹的最终奖励（启动/列表行用） */
function describeReward(site: ArchaeologySite): string {
  return describeRewardValue(site.reward);
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
  /** 图鉴折叠态（对齐远征图鉴：默认收起；已有完成项时默认展开）。面板常驻挂载，用户手动开合后保持 */
  const [galleryOpen, setGalleryOpen] = useState<boolean>(() =>
    Object.values(ship.galaxy.archaeology || {}).some((st) => st.status === 'done')
  );
  /** 封面加载失败的遗迹（按 siteId 记）。列表缩略图缺图时**整块不渲染**，避免每行留个空洞；
   *  用 state 而不是改 DOM style：同一 <img> 会被 React 复用，手工隐藏会残留到别的遗迹 */
  const [failedCovers, setFailedCovers] = useState<Set<string>>(() => new Set());
  const markCoverFailed = (siteId: string) =>
    setFailedCovers((prev) => (prev.has(siteId) ? prev : new Set(prev).add(siteId)));

  const galaxy = ship.galaxy;
  const archaeology = galaxy.archaeology || {};
  const leaders = ship.colony?.leaders || [];
  const currentSiteId = getGalaxyNode(galaxy.currentNodeId)?.siteId || null;

  const showMsg = (r: ActionResult) => {
    setMsg(r.message);
    setMsgType(r.success ? 'success' : 'error');
    setTimeout(() => setMsg(''), 4000);
  };

  // 「已中止（idle）」也要进这块卡片，否则中止后进度面板不再出现、无法重启发掘
  const activeEntry = Object.entries(archaeology).find(([, st]) => st.status === 'digging' || st.status === 'idle');
  const activeSite = activeEntry ? getArchaeologySite(activeEntry[0]) : undefined;
  const activeState = activeEntry ? activeEntry[1] : undefined;

  /** 领袖显示名（LeaderInstance.id 是内部编号如 L14，UI 一律显示 data/colony/leaders.ts 里的名字） */
  const leaderNameOf = (id: string) => getLeaderDef(id)?.name || id;

  /** 可更换的领袖：排除当前驻守者（换成本人无意义，动作层也会拦下） */
  const replaceableLeaders = (currentLeaderId: string | undefined) => leaders.filter((l) => l.id !== currentLeaderId);

  /** 某领袖此刻不能派驻到 site 的原因（'' = 可派驻）：远征中 / 已在别处驻守 / 等级不够。
   *  仅用于下拉里的禁用提示；真正的拦截在动作层（useGalaxy.checkDigContext），两处同源：
   *  "是否在驻守"读 findStationedSite，"是否在远征"读 colony.expedition。 */
  const leaderBlockReason = (leader: { id: string; level: number }, site: { id: string; minLeaderLevel: number }): string => {
    if (ship.colony?.expedition?.leaderId === leader.id) return '远征中';
    const stationed = findStationedSite(archaeology, leader.id);
    if (stationed && stationed !== site.id) return `驻守「${getArchaeologySite(stationed)?.name || stationed}」`;
    if (site.minLeaderLevel > 0 && leader.level < site.minLeaderLevel) return `需 Lv${site.minLeaderLevel}`;
    return '';
  };

  const completed = ARCHAEOLOGY_SITES.filter((s) => archaeology[s.id]?.status === 'done');
  /** 发掘被迫中止（自然失败按 HALT_CHANCE 触发）的遗迹：永久无法继续，列表显示中止剧情与配图 */
  const collapsed = ARCHAEOLOGY_SITES.filter((s) => archaeology[s.id]?.status === 'collapsed');

  // 发现机制：只有"到访过该遗迹星系"（或已有发掘进度）的遗迹才会出现在列表与图鉴里
  const discoveredSiteIds = new Set(
    galaxy.visitedNodes
      .map((id) => getGalaxyNode(id)?.siteId)
      .filter((sid): sid is string => !!sid)
  );
  const discoveredSites = ARCHAEOLOGY_SITES.filter((s) => discoveredSiteIds.has(s.id) || !!archaeology[s.id]);
  const undiscoveredCount = ARCHAEOLOGY_SITE_COUNT - discoveredSites.length;

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
        同一时间只能发掘一处遗迹。遗迹需要先在「星图」上跃迁抵达，抵达后才会出现在下方列表里。
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
              {activeState.status === 'idle' && <span className="text-[10px] text-amber-400">等待投入资源继续（进度保留）</span>}
              {activeState.pendingChoice && <span className="text-[10px] text-cyan-300">等待抉择</span>}
            </div>

            {/* 阶段图片位（缺图时显示占位框） */}
            <div className="relative w-full aspect-video rounded-lg border border-slate-700 bg-slate-800/40 overflow-hidden mb-3">
              <div className="absolute inset-0 flex items-center justify-center text-[10px] md:text-xs text-slate-600">
                阶段图片位（{stage.id}）
              </div>
              <img
                key={stage.image}
                src={stage.image}
                alt={stage.title}
                onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }}
                className="relative w-full h-full object-cover"
              />
            </div>

            <h4 className="font-bold text-slate-100 mb-1">{stage.title}</h4>
            <p className="text-sm text-slate-300 leading-relaxed whitespace-pre-line mb-3">{stage.text}</p>

            <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-[11px] md:text-xs text-slate-400 mb-1">
              <span className="flex items-center gap-1"><Clock size={12} /> 剩余 {activeState.turnsLeft} 回合</span>
              <span>成功率 {renderRate(activeSite, activeState.stageIndex, activeState.leaderId)}</span>
              <span className={activeSite.dangerRate >= 0.5 ? 'text-amber-400' : ''}>危险率 {Math.round(activeSite.dangerRate * 100)}%</span>
              <span>阶段投入 {formatCost(cost)}</span>
              <span className="flex items-center gap-1"><Users size={12} /> 驻守：{stationedLeader ? `${leaderNameOf(stationedLeader.id)} Lv${stationedLeader.level}` : '未知'}</span>
              {activeState.fails > 0 && <span className="text-red-400">连续失败 {activeState.fails} 次</span>}
              {/* 阶段小奖励：**成功时只有 DISCOVERY_CHANCE 概率触发**，且抉择/稳妥会改数值——
                  不写出来的话，玩家只会看到抉择里的"小奖励翻倍/减半"却不知道那是什么、有没有、多少 */}
              {stage.bonus && (
                <span className="text-cyan-300">
                  阶段奖励 {describeRewardValue(stage.bonus)}
                  <span className="text-slate-500">（成功时 {Math.round(DISCOVERY_CHANCE * 100)}% 概率触发，抉择或稳妥推进会改变数值）</span>
                </span>
              )}
            </div>
            {/* 危险规则说明：失败后按危险率判定「意外」，再扣一份与投入相同的资源（一半） */}
            <p className="text-[10px] md:text-xs text-slate-500 mb-3">
              阶段失败时按危险率判定意外：触发则额外损失本阶段投入的 <span className="text-amber-400/90">一半</span>（与投入相同的资源组合）；冒险抉择失败必定触发。
            </p>

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
                      <p className={`text-[10px] mt-0.5 ${opt.kind === 'risky' ? 'text-amber-300/90' : 'text-cyan-300/90'}`}>
                        {opt.kind === 'risky' ? '阶段小奖励翻倍 · 失败必触发意外' : '成功率 +10% · 阶段小奖励减半'}
                      </p>
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
              {/* 换领袖只在"人在那儿"的状态下有意义（已完成/已封闭的遗迹没有驻守领袖可换） */}
              {(activeState.status === 'digging' || activeState.status === 'idle') && replaceableLeaders(activeState.leaderId).length > 0 && (
                <div className="flex items-center gap-2">
                  <select
                    value=""
                    onChange={(e) => { if (e.target.value) showMsg(onChangeLeader(activeSite.id, e.target.value)); }}
                    className="bg-slate-800 border border-slate-600 rounded-lg px-2 py-2 text-xs text-slate-200 min-h-[40px]"
                  >
                    <option value="">更换驻守领袖…</option>
                    {replaceableLeaders(activeState.leaderId).map((l) => {
                      const reason = leaderBlockReason(l, activeSite);
                      return (
                        <option key={l.id} value={l.id} disabled={!!reason}>
                          {leaderNameOf(l.id)} Lv{l.level}{reason ? `（${reason}）` : ''}
                        </option>
                      );
                    })}
                  </select>
                </div>
              )}
            </div>
          </div>
        );
      })()}

      {/* ===== 遗迹列表（仅列出已发现的遗迹）===== */}
      <div className="mb-4">
        <h3 className="text-xs text-purple-400 font-bold mb-2">
          已发现遗迹（{discoveredSites.length}/{ARCHAEOLOGY_SITE_COUNT}）· 已完成 {completed.length}
          {collapsed.length > 0 && <span className="text-red-400"> · 已封闭 {collapsed.length}</span>}
        </h3>
        {discoveredSites.length === 0 ? (
          <div className="bg-slate-900/50 border border-slate-700/60 rounded-lg p-4 text-center text-xs text-slate-500">
            还没有发现任何遗迹。在「星图」上跃迁抵达遗迹星系，遗迹才会出现在这里。
          </div>
        ) : (
        <div className="space-y-2">
          {discoveredSites.map((site) => {
            const st = archaeology[site.id];
            // 四态分开：已封闭（collapsed，永久无法继续）≠ 已完成 ≠ 进行中（digging）≠ 已中止（idle）
            const status = st?.status === 'done' ? '已完成'
              : st?.status === 'collapsed' ? '已封闭'
              : st?.status === 'digging' ? '进行中'
              : st ? '已中止' : '未发掘';
            const isHere = currentSiteId === site.id;
            const currentStage = st ? site.stages[st.stageIndex] : site.stages[0];
            return (
              <div
                key={site.id}
                className={`rounded-lg border p-3 ${selectedSiteId === site.id ? 'border-purple-500 bg-purple-900/20' : 'border-slate-700 bg-slate-800/40'}`}
              >
                <button
                  onClick={() => {
                    // 开合开关：再点同一行要收起（曾写成只 setSelectedSiteId(site.id) → 点开后永远收不回去）
                    setSelectedSiteId((prev) => (prev === site.id ? null : site.id));
                    setLeaderPick('');
                  }}
                  aria-expanded={selectedSiteId === site.id}
                  className="w-full text-left min-h-[40px] flex items-start gap-2 md:gap-3"
                >
                  {/* 遗迹封面缩略图（16:9；移动端 64px、桌面 96px 宽）。缺图时整块不渲染，不留空洞 */}
                  {!failedCovers.has(site.id) && (
                    <img
                      src={site.galleryImage}
                      alt={site.name}
                      loading="lazy"
                      onError={() => markCoverFailed(site.id)}
                      className="w-16 md:w-24 aspect-video object-cover rounded border border-slate-700 flex-shrink-0 bg-slate-800/40"
                    />
                  )}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="text-sm md:text-base font-bold text-slate-100">{site.name}</span>
                      <span className="text-[10px] px-1.5 py-0.5 rounded bg-slate-900 text-slate-400 border border-slate-700">{site.civilization}</span>
                      <span className={`text-[10px] px-1.5 py-0.5 rounded ${status === '已完成' ? 'bg-emerald-900/50 text-emerald-300' : status === '已封闭' ? 'bg-red-900/40 text-red-300 border border-red-800' : status === '进行中' ? 'bg-amber-900/50 text-amber-300' : status === '已中止' ? 'bg-slate-800 text-slate-300 border border-slate-600' : 'bg-slate-800 text-slate-400'}`}>{status}</span>
                      {isHere && <span className="text-[10px] px-1.5 py-0.5 rounded bg-cyan-600 text-white">母舰在此</span>}
                      {selectedSiteId === site.id
                        ? <ChevronDown size={14} className="text-purple-400 ml-auto" />
                        : <ChevronRight size={14} className="text-slate-500 ml-auto" />}
                    </div>
                    <p className="text-[10px] md:text-xs text-slate-500 mt-1">
                      {site.stages.length} 阶段{site.minLeaderLevel > 0 ? ` · 需 Lv${site.minLeaderLevel} 领袖` : ''} ·{' '}
                      <span className={site.dangerRate >= 0.5 ? 'text-amber-400' : ''}>危险率 {Math.round(site.dangerRate * 100)}%</span>
                      {' · '}奖励：{describeReward(site)}
                    </p>
                  </div>
                </button>

                {selectedSiteId === site.id && (
                  <div className="mt-2 pt-2 border-t border-slate-700/60">
                    {/* 遗迹封面大图（与阶段图/halt 图同一套占位约定：缺图露出占位框） */}
                    <div className="relative w-full aspect-video max-h-[140px] md:max-h-[220px] rounded-lg border border-purple-900/50 bg-slate-800/40 overflow-hidden mb-2">
                      <div className="absolute inset-0 flex items-center justify-center text-[10px] md:text-xs text-slate-600">
                        遗迹封面（{site.id}/cover）
                      </div>
                      <img
                        key={site.galleryImage}
                        src={site.galleryImage}
                        alt={site.name}
                        onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }}
                        className="relative w-full h-full object-cover"
                      />
                    </div>
                    <p className="text-xs text-slate-400 mb-2">{site.intro}</p>
                    {status === '已封闭' ? (
                      <div className="space-y-2">
                        {/* 中止剧情配图（缺图时占位框，onError 隐藏） */}
                        <div className="relative w-full aspect-video rounded-lg border border-red-900/50 bg-slate-800/40 overflow-hidden">
                          <div className="absolute inset-0 flex items-center justify-center text-[10px] md:text-xs text-slate-600">
                            中止剧情配图（{site.id}/halt）
                          </div>
                          <img
                            key={site.haltImage}
                            src={site.haltImage}
                            alt={`${site.name} 发掘中止`}
                            onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }}
                            className="relative w-full h-full object-cover"
                          />
                        </div>
                        <p className="text-xs md:text-sm text-red-200 leading-relaxed">{site.haltText}</p>
                        <p className="text-[10px] md:text-xs text-slate-500">
                          此处遗迹已封闭，发掘无法继续（已完成的阶段奖励与已获资源保留）。
                        </p>
                      </div>
                    ) : status === '已完成' ? (
                      <p className="text-xs text-emerald-400">已完成发掘，奖励见考古图鉴。</p>
                    ) : status === '进行中' ? (
                      <p className="text-xs text-amber-300">正在发掘中，进度见上方面板。</p>
                    ) : status === '已中止' ? (
                      <div className="space-y-2">
                        <p className="text-xs text-amber-300">
                          发掘已中止，进度保留在第 {st!.stageIndex + 1} 阶段
                          {st!.leaderId ? `（驻守：${leaderNameOf(st!.leaderId)}）` : ''}。
                        </p>
                        <div className="flex flex-col md:flex-row md:items-center gap-2">
                          <button
                            onClick={() => showMsg(onContinueExcavation(site.id))}
                            className="px-4 py-2 bg-purple-600 hover:bg-purple-500 rounded-lg font-bold text-white text-sm min-h-[40px]"
                          >
                            继续发掘（投入 {formatCost(flattenCost(currentStage.cost))}）
                          </button>
                          {replaceableLeaders(st!.leaderId).length > 0 && (
                            <div className="flex items-center gap-2">
                              <select
                                value=""
                                onChange={(e) => { if (e.target.value) showMsg(onChangeLeader(site.id, e.target.value)); }}
                                className="bg-slate-800 border border-slate-600 rounded-lg px-2 py-2 text-xs text-slate-200 min-h-[40px]"
                              >
                                <option value="">更换驻守领袖…</option>
                                {replaceableLeaders(st!.leaderId).map((l) => {
                                  const reason = leaderBlockReason(l, site);
                                  return (
                                    <option key={l.id} value={l.id} disabled={!!reason}>
                                      {leaderNameOf(l.id)} Lv{l.level}{reason ? `（${reason}）` : ''}
                                    </option>
                                  );
                                })}
                              </select>
                            </div>
                          )}
                        </div>
                      </div>
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
                          {leaders.map((l) => {
                            const reason = leaderBlockReason(l, site);
                            return (
                              <option key={l.id} value={l.id} disabled={!!reason}>
                                {leaderNameOf(l.id)} Lv{l.level}{reason ? `（${reason}）` : ''}
                              </option>
                            );
                          })}
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
        )}
        {undiscoveredCount > 0 && (
          <p className="text-[10px] md:text-xs text-slate-500 mt-2">
            还有 {undiscoveredCount} 处遗迹尚未被发现（到访对应星系后才会出现）。
          </p>
        )}
      </div>

      {/* ===== 考古图鉴（可折叠；交互对齐远征图鉴：默认收起，已有完成项才默认展开）===== */}
      <div className="bg-slate-900/60 border border-slate-700 rounded-xl overflow-hidden">
        <button
          onClick={() => setGalleryOpen((v) => !v)}
          aria-expanded={galleryOpen}
          className="w-full flex items-center gap-2 px-3 md:px-4 py-3 text-left hover:bg-slate-800/40 transition-colors min-h-[44px]"
        >
          <Trophy size={14} className="text-amber-400 flex-shrink-0" />
          <span className="text-xs text-amber-400 font-bold">考古图鉴（{completed.length}/{ARCHAEOLOGY_SITE_COUNT}）</span>
          {!galleryOpen && completed.length > 0 && (
            <span className="text-[10px] md:text-xs text-slate-500 truncate">
              {completed.map((s) => s.name).join('、')}
            </span>
          )}
          {!galleryOpen && completed.length === 0 && (
            <span className="text-[10px] md:text-xs text-slate-600">完成遗迹发掘后收录</span>
          )}
          <span className="ml-auto text-slate-400 flex-shrink-0">
            {galleryOpen ? <ChevronDown size={16} /> : <ChevronRight size={16} />}
          </span>
        </button>

        {galleryOpen && (
        <div className="px-3 md:px-4 pb-3 md:pb-4">
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
        )}
      </div>
    </div>
  );
}

export default memo(ArchaeologyPanel);
