// ==================== 远征面板（领袖剧情树） ====================
// 展示远征进行中的回合推进（准备/降落/A/B/C/D/箴言）、已招募领袖的结局收集进度与终极技能解锁。
// 资源消耗明细与提示均从节点数据（cost）渲染，不硬编码数字。

import { useState, memo } from 'react';
import type { Colony } from '@/types/colony';
import { EXPEDITION_COST, RESOURCE_LABELS, getLeaderExpedition } from '@/data/colony/expeditions';
import { getLeaderDef } from '@/data/colony/leaders';
import { Rocket, Sparkles, Crown, Lock } from 'lucide-react';

interface ExpeditionPanelProps {
  colony: Colony;
  onStartExpedition: (leaderId: string) => { success: boolean; message: string };
  onPayExpeditionNode: () => { success: boolean; message: string };
  onUnlockUltimate: (leaderId: string) => { success: boolean; message: string };
}

/** 消耗明细文案（数据驱动） */
function renderCost(cost?: Record<string, number>): string {
  if (!cost || Object.keys(cost).length === 0) return '';
  return Object.entries(cost).map(([k, v]) => `${RESOURCE_LABELS[k] || k}×${v}`).join(' + ');
}

function ExpeditionPanel({ colony, onStartExpedition, onPayExpeditionNode, onUnlockUltimate }: ExpeditionPanelProps) {
  const [msg, setMsg] = useState('');
  const [msgType, setMsgType] = useState<'success' | 'error'>('success');
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
      {msg && (
        <div className={`mb-3 p-3 rounded-lg text-sm text-center ${msgType === 'success' ? 'bg-green-900/20 border border-green-700/50 text-green-400' : 'bg-red-900/20 border border-red-700/50 text-red-400'}`}>
          {msg}
        </div>
      )}

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
                src={imgPath(ex.leaderId, 'planet.png')}
                alt={route.planetName}
                onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }}
                className="w-full h-40 md:h-52 object-cover rounded-lg border border-slate-700 mb-3"
              />
              <h4 className="font-bold text-slate-100 mb-2">{route.planetName}</h4>
              <p className="text-xs text-slate-400 whitespace-pre-line mb-3 leading-relaxed">{route.planetIntro}</p>
              <p className="text-sm text-slate-300 leading-relaxed whitespace-pre-line">{route.landing}</p>
            </div>
          )}

          {ex.stage === 2 && node && (
            <div>
              <p className="text-[10px] text-slate-500 mb-1">节点 {node.id}</p>
              <h4 className="font-bold text-slate-100 mb-2">{node.title}</h4>
              <p className="text-sm text-slate-300 leading-relaxed whitespace-pre-line">{node.text}</p>
            </div>
          )}

          {(ex.stage === 3 || ex.stage === 4 || ex.stage === 5) && node && (
            <div>
              <p className="text-[10px] text-slate-500 mb-1">节点 {node.id}</p>
              <h4 className="font-bold text-slate-100 mb-2">{node.title}</h4>
              {ex.paidThisTurn ? (
                <>
                  <p className="text-sm text-slate-300 leading-relaxed whitespace-pre-line mb-2">{node.text}</p>
                  <p className="text-xs text-cyan-500/80">已支付，结束回合后进入下一节点。</p>
                </>
              ) : (
                <div>
                  <p className="text-xs text-slate-500 mb-3">支付资源后显示正文（每回合一次，支付后结束回合进入下一节点）</p>
                  <div className="flex items-center gap-3">
                    <button
                      onClick={handlePay}
                      className="px-4 py-2 bg-cyan-600 hover:bg-cyan-500 rounded-lg font-bold text-white text-sm transition-colors"
                    >
                      支付 {renderCost(node.cost)}
                    </button>
                  </div>
                </div>
              )}
            </div>
          )}

          {ex.stage === 6 && node && node.isEnding && (
            <div className="text-center">
              <img
                src={imgPath(ex.leaderId, `${node.id}.png`)}
                alt={node.title}
                onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }}
                className="w-full max-w-sm mx-auto rounded-lg border border-purple-700/40 mb-3"
              />
              <p className="text-[10px] text-slate-500 mb-1">结局 {node.id} · 已记录</p>
              <h4 className="font-bold text-purple-300 mb-2">{node.title}</h4>
              <p className="text-sm italic text-purple-200/90 leading-relaxed mb-2 whitespace-pre-line">{node.motto}</p>
              <p className="text-xs text-slate-400">
                {node.text.length > 200 ? `${node.text.slice(0, 200)}…` : node.text}
              </p>
              <p className="text-xs text-slate-400 mt-2">该结局已记入图鉴（{endingsCount(ex.leaderId)}/12），可再次发起远征收集其他结局</p>
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
          return (
            <div key={l.id} className="bg-slate-800/60 border border-slate-700 rounded-lg p-3 flex items-center justify-between gap-3">
              <div className="min-w-0">
                <p className="text-sm font-bold text-slate-200 flex items-center gap-1.5">
                  <Crown size={14} className="text-amber-400" />
                  {l.name}
                  <span className="text-[10px] text-slate-500 font-normal">Lv{l.level}</span>
                </p>
                <p className="text-[10px] text-slate-500 mt-0.5">
                  已触发结局 {count}/12
                  {unlocked && ld?.ultimateSkill ? ` · 终极技能已解锁「${ld.ultimateSkill.name}」` : ''}
                </p>
              </div>
              <div className="flex-shrink-0 flex gap-2">
                {!unlocked && count >= 12 && ld?.ultimateSkill && (
                  <button
                    onClick={() => handleUnlock(l.id)}
                    className="px-3 py-1.5 bg-purple-600 hover:bg-purple-500 rounded-lg text-xs font-bold text-white transition-colors flex items-center gap-1"
                  >
                    <Lock size={12} /> 解锁终极技能
                  </button>
                )}
                <button
                  onClick={() => handleStart(l.id)}
                  disabled={!!ex}
                  className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-colors ${hasRoute ? 'bg-cyan-600 hover:bg-cyan-500 text-white' : 'bg-slate-700 text-slate-400'} ${ex ? 'opacity-50 cursor-not-allowed' : ''}`}
                >
                  远征（{EXPEDITION_COST}星尘）
                </button>
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
