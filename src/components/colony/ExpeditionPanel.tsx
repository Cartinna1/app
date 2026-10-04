// ==================== 远征面板（领袖剧情树） ====================
// 展示远征进行中的回合推进（准备/降落/A/B/C/D+结局箴言）、已招募领袖的结局收集进度与终极技能解锁。
// 资源消耗明细与提示均从节点数据（cost）渲染，不硬编码数字。

import { useState, memo } from 'react';
import type { Colony, ExpeditionNodeDef } from '@/types/colony';
import type { ArchaeologyState } from '@/types/galaxy';
import { EXPEDITION_COST, EXPEDITION_UNLOCK_COUNT, getLeaderExpedition } from '@/data/colony/expeditions';
import { getLeaderDef } from '@/data/colony/leaders';
import { getArchaeologySite } from '@/data/galaxy/archaeology';
import { findStationedSite } from '@/lib/galaxy/archaeologyTurn';
import { Rocket, Sparkles, Crown, Lock } from 'lucide-react';
import { formatCost } from '@/lib/turn/resourceCost';
import FeedbackMessage from '../FeedbackMessage';

interface ExpeditionPanelProps {
  colony: Colony;
  /** 考古进度（ship.galaxy.archaeology）：用于显示"该领袖正在某处驻守"并禁用出征按钮。
   *  与动作层守卫同源（findStationedSite），UI 只做提示，不替代校验。 */
  archaeology?: Record<string, ArchaeologyState>;
  onStartExpedition: (leaderId: string) => { success: boolean; message: string };
  onPayExpeditionNode: () => { success: boolean; message: string };
  onUnlockUltimate: (leaderId: string) => { success: boolean; message: string };
}

/** 消耗明细文案（数据驱动）。格式与唯一真值 lib/turn/resourceCost.formatCost 完全一致 → 直接委托，勿再写一份 */
function renderCost(cost?: Record<string, number>): string {
  return cost ? formatCost(cost) : '';
}

function ExpeditionPanel({ colony, archaeology, onStartExpedition, onPayExpeditionNode, onUnlockUltimate }: ExpeditionPanelProps) {
  const [msg, setMsg] = useState('');
  const [msgType, setMsgType] = useState<'success' | 'error'>('success');
  const [showHistory, setShowHistory] = useState(false);
  const showMsg = (m: string, type: 'success' | 'error') => {
    setMsg(m);
    setMsgType(type);
    setTimeout(() => setMsg(''), 4000);
  };

  const ex = colony.expedition;
  const route = ex ? getLeaderExpedition(ex.leaderId) : undefined;
  const node = ex && route && ex.currentNodeId ? route.nodes[ex.currentNodeId] : undefined;
  const endingsCount = (leaderId: string) => colony.expeditionEndings?.[leaderId]?.length || 0;
  const imgPath = (leaderId: string, name: string) => `/expeditions/${leaderId}/${name}`;

  /** 结局屏（D 节点支付后与旧存档 stage 6 共用同一段 UI，勿写两份） */
  const renderEndingBlock = (leaderId: string, endingNode: ExpeditionNodeDef) => (
    <div className="mt-4 pt-3 border-t border-purple-700/30 text-center">
      <p className="text-[10px] text-slate-500 mb-1">结局 {endingNode.id} · 已记录（{endingsCount(leaderId)}/{EXPEDITION_UNLOCK_COUNT}）</p>
      <h4 className="font-bold text-purple-300 mb-2">{endingNode.title}</h4>
      <p className="text-sm italic text-purple-200/90 leading-relaxed whitespace-pre-line">{endingNode.motto}</p>
      <p className="text-xs text-slate-500 mt-3">远征结束，结束回合后返回选领袖界面。</p>
    </div>
  );

  const handleStart = (leaderId: string) => {
    const r = onStartExpedition(leaderId);
    showMsg(r.message, r.success ? 'success' : 'error');
  };
  const handlePay = () => {
    const r = onPayExpeditionNode();
    showMsg(r.message, r.success ? 'success' : 'error');
  };
  const handleUnlock = (leaderId: string) => {
    const r = onUnlockUltimate(leaderId);
    showMsg(r.message, r.success ? 'success' : 'error');
  };

  return (
    <div>
      <h2 className="text-xl md:text-2xl font-bold text-white mb-1 md:mb-2">远征</h2>
      <p className="text-xs md:text-sm text-slate-400 mb-4">
        选择远征的领袖伙伴，深入未知星球收集属于他的传说。集齐 12 个结局可解锁领袖的终极技能。
      </p>

      {/* 操作反馈 */}
      <FeedbackMessage message={msg} type={msgType} />

      {/* ===== 远征进行中 ===== */}
      {ex && route && (
        <div className="bg-slate-900/60 border border-cyan-700/40 rounded-xl p-4 md:p-5 mb-4">
          <div className="flex items-center gap-2 mb-3">
            <Rocket size={18} className="text-cyan-400" />
            <h3 className="font-bold text-cyan-300">{route.planetName} · 远征进行中</h3>
          </div>

          {ex.stage === 0 && (
            <div className="text-center py-8 text-slate-400">
              <Sparkles size={28} className="mx-auto mb-2 text-cyan-500/60" />
              <p className="font-bold text-slate-200">准备远征…</p>
              <p className="text-xs mt-1">结束回合后登陆 {route.planetName}</p>
            </div>
          )}

          {ex.stage === 1 && (
            <div>
              <img
                key={imgPath(ex.leaderId, 'planet.webp')}
                src={imgPath(ex.leaderId, 'planet.webp')}
                alt={route.planetName}
                onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }}
                className="w-full aspect-video object-cover rounded-lg border border-slate-700 mb-3"
              />
              <h4 className="font-bold text-slate-100 mb-2">{route.planetName}</h4>
              <p className="text-xs text-slate-400 whitespace-pre-line mb-3 leading-relaxed">{route.planetIntro}</p>
              <p className="text-sm text-slate-300 leading-relaxed whitespace-pre-line">{route.landing}</p>
            </div>
          )}

          {ex.stage === 2 && node && (
            <div>
              <p className="text-[10px] text-slate-500 mb-1">节点 {node.id}</p>
              {/* 阶段节点图（按节点编号命名：/expeditions/<领袖id>/<节点id>.webp）；结局节点的图在下方分支单独展示 */}
              {!node.isEnding && (
                <img
                  key={imgPath(ex.leaderId, `${node.id}.webp`)}
                  src={imgPath(ex.leaderId, `${node.id}.webp`)}
                  alt={node.title}
                  onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }}
                  className="w-full aspect-video object-cover rounded-lg border border-slate-700 mb-3"
                />
              )}
              <h4 className="font-bold text-slate-100 mb-2">{node.title}</h4>
              <p className="text-sm text-slate-300 leading-relaxed whitespace-pre-line">{node.text}</p>
            </div>
          )}

          {(ex.stage === 3 || ex.stage === 4 || ex.stage === 5) && node && (
            <div>
              <p className="text-[10px] text-slate-500 mb-1">节点 {node.id}</p>
              {/* 阶段配图：**支付本层资源之后**才显示（未支付时只给节点编号与支付按钮，
                  避免"钱还没付先看到下一层的画"）。节点文字与支付按钮照常显示，供玩家决策。 */}
              {!node.isEnding && ex.paidThisTurn && (
                <img
                  key={imgPath(ex.leaderId, `${node.id}.webp`)}
                  src={imgPath(ex.leaderId, `${node.id}.webp`)}
                  alt={node.title}
                  onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }}
                  className="w-full aspect-video object-cover rounded-lg border border-slate-700 mb-3"
                />
              )}
              <h4 className="font-bold text-slate-100 mb-2">{node.title}</h4>
              {ex.paidThisTurn ? (
                <div>
                  {/* D 层结局节点：支付后同屏显示结局图 + 箴言（本回合即终局，结束回合后返回选领袖界面） */}
                  {ex.stage === 5 && node.isEnding && (
                    <img
                      key={imgPath(ex.leaderId, `${node.id}.webp`)}
                      src={imgPath(ex.leaderId, `${node.id}.webp`)}
                      alt={node.title}
                      onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }}
                      className="w-full aspect-video object-cover rounded-lg border border-purple-700/40 mb-3"
                    />
                  )}
                  <p className="text-sm text-slate-300 leading-relaxed whitespace-pre-line">{node.text}</p>
                  {ex.stage === 5 && node.isEnding && renderEndingBlock(ex.leaderId, node)}
                </div>
              ) : (
                <div>
                  <button
                    onClick={handlePay}
                    className="px-4 py-2 bg-cyan-600 hover:bg-cyan-500 rounded-lg font-bold text-white text-sm transition-colors"
                  >
                    支付 {renderCost(node.cost)}
                  </button>
                </div>
              )}
            </div>
          )}

          {/* stage 6：旧存档在途远征的箴言屏（新流程在 stage 5 支付后即收尾，不再进入 6） */}
          {ex.stage === 6 && node && node.isEnding && (
            <div>
              <img
                key={imgPath(ex.leaderId, `${node.id}.webp`)}
                src={imgPath(ex.leaderId, `${node.id}.webp`)}
                alt={node.title}
                onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }}
                className="w-full aspect-video object-cover rounded-lg border border-purple-700/40 mb-3"
              />
              {renderEndingBlock(ex.leaderId, node)}
            </div>
          )}

          {/* 回顾剧情 */}
          {ex.history && ex.history.length > 0 && (
            <div className="mt-4 border-t border-slate-700/50 pt-3">
              <button
                onClick={() => setShowHistory(!showHistory)}
                className="text-xs text-cyan-400 hover:text-cyan-300 font-bold"
              >
                {showHistory ? '收起剧情回顾' : `回顾剧情（${ex.history.length}）`}
              </button>
              {showHistory && (
                <div className="mt-2 space-y-2">
                  {ex.history.map((nid) => {
                    const n = route.nodes[nid];
                    if (!n) return null;
                    return (
                      <div key={nid} className="bg-slate-800/50 rounded-lg p-2">
                        <p className="text-xs font-bold text-slate-300">{n.id} · {n.title}</p>
                        <p className="text-[11px] text-slate-400 mt-1 leading-relaxed whitespace-pre-line">{n.text}</p>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {/* ===== 领袖列表 ===== */}
      <div className="space-y-2">
        {colony.leaders.map((l) => {
          const ld = getLeaderDef(l.id);
          const count = endingsCount(l.id);
          const unlocked = colony.expeditionUnlocks?.includes(l.id) || false;
          const hasRoute = !!getLeaderExpedition(l.id);
          // 驻守↔远征互斥：正在考古遗迹驻守的领袖不能出征（唯一真值 findStationedSite；动作层也会拦）
          const stationedSiteId = findStationedSite(archaeology, l.id);
          const stationedName = stationedSiteId ? (getArchaeologySite(stationedSiteId)?.name || stationedSiteId) : '';
          return (
            <div key={l.id} className="bg-slate-800/60 border border-slate-700 rounded-lg p-3 flex gap-3 items-start">
              <img
                src={`/leaders/${l.id}.jpg`}
                alt={l.name}
                onError={(e) => { (e.target as HTMLImageElement).style.display='none'; }}
                className={`w-[80px] h-[80px] md:w-[250px] md:h-[250px] rounded-lg object-cover flex-shrink-0 border-2 ${l.rarity==='SSR'?'border-amber-400 shadow-[0_0_10px_rgba(251,191,36,0.6)]':l.rarity==='SR'?'border-purple-400':'border-blue-400'}`}
              />
              <div className="flex-1 min-w-0">
                <p className="text-base md:text-lg font-bold text-slate-200 flex items-center gap-1.5 flex-wrap">
                  <Crown size={16} className="text-amber-400" />
                  {l.name}
                  <span className="text-xs text-slate-500 font-normal">{l.rarity} Lv{l.level}</span>
                </p>
                <p className="text-sm text-slate-500 mt-1">
                  已触发结局 {count}/{EXPEDITION_UNLOCK_COUNT}
                  {stationedSiteId ? ` · 正在「${stationedName}」驻守考古遗迹（驻守与远征不可同时进行）` : ''}
                  {unlocked && ld?.ultimateSkill ? ` · 终极技能已解锁「${ld.ultimateSkill.name}」` : ''}
                </p>
                <div className="mt-2 flex flex-wrap gap-2">
                  {!unlocked && count >= EXPEDITION_UNLOCK_COUNT && ld?.ultimateSkill && l.level >= 3 && (
                    <button
                      onClick={() => handleUnlock(l.id)}
                      className="px-3 py-1.5 bg-purple-600 hover:bg-purple-500 rounded-lg text-sm font-bold text-white transition-colors flex items-center gap-1"
                    >
                      <Lock size={14} /> 解锁终极技能
                    </button>
                  )}
                  {!unlocked && count >= EXPEDITION_UNLOCK_COUNT && ld?.ultimateSkill && l.level < 3 && (
                    <span className="text-xs text-slate-500">结局已集齐，需将该领袖升至 Lv3 才能解锁终极技能</span>
                  )}
                  <button
                    onClick={() => handleStart(l.id)}
                    disabled={!!ex || !!stationedSiteId}
                    className={`px-3 py-1.5 rounded-lg text-sm font-bold transition-colors ${hasRoute ? 'bg-cyan-600 hover:bg-cyan-500 text-white' : 'bg-slate-700 text-slate-400'} ${ex || stationedSiteId ? 'opacity-50 cursor-not-allowed' : ''}`}
                  >
                    远征（{formatCost(EXPEDITION_COST)}）
                  </button>
                </div>
              </div>
            </div>
          );
        })}
        {colony.leaders.length === 0 && (
          <p className="text-center text-sm text-slate-500 py-6">先招募一位领袖，才能开启远征。</p>
        )}
      </div>
    </div>
  );
}

export default memo(ExpeditionPanel);
