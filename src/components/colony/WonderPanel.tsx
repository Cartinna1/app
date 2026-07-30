import { useState } from 'react';
import { ALL_WONDERS, getWonderDef, WONDER_EVENTS } from '@/data/colony/wonders';
import type { Colony } from '@/types/colony';

interface Props {
  colony: Colony;
  researchedCount: number;
  hasT25: boolean;
  conditionsMet: boolean;
  shipGold: number;
  shipAlloy: number;
  shipStardust: number;
  shipFood: number;
  shipMaterials: Record<string, number>;
  onSelectWonder: (id: string) => { success: boolean; message: string };
  onSubmitResources: () => { success: boolean; message: string };
  onHandleEvent: (choice: 'A' | 'B') => { success: boolean; message: string };
  onCompleteWonder: () => { success: boolean; message: string };
  onShowMsg: (msg: string, type: 'success' | 'error') => void;
}

export default function WonderPanel({
  colony, researchedCount, hasT25, conditionsMet,
  shipGold, shipAlloy, shipStardust, shipFood, shipMaterials,
  onSelectWonder, onSubmitResources, onHandleEvent, onCompleteWonder, onShowMsg,
}: Props) {
  const ws = colony.wonder;
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [showConfirm, setShowConfirm] = useState(false);

  // ===== 模式 1：未满足条件或未初始化 =====
  if ((!ws || ws.phase === 'inactive') && !conditionsMet) {
    return (
      <div className="space-y-4">
        <div className="bg-slate-900/60 border border-slate-700 rounded-xl p-5">
          <h2 className="text-2xl font-bold text-cyan-400 mb-3">🏗 奇观建设</h2>
          <p className="text-sm text-slate-400 mb-4">
            奇观是终极胜利条件。建成任意一座奇观即可赢得游戏。建设需要消耗巨量资源，历经多个阶段完成。
          </p>
          <div className="bg-slate-800/80 border border-slate-700 rounded-lg p-4">
            <h3 className="text-lg font-bold text-amber-400 mb-3">开启条件</h3>
            <div className="space-y-2">
              <div className="flex items-center gap-2">
                <span className={researchedCount >= 10 ? 'text-green-400' : 'text-red-400'}>{researchedCount >= 10 ? '✔' : '✘'}</span>
                <span className="text-sm text-slate-300">科技研究 ≥ 10 项（当前 {researchedCount}）</span>
              </div>
              <div className="flex items-center gap-2">
                <span className={hasT25 ? 'text-green-400' : 'text-red-400'}>{hasT25 ? '✔' : '✘'}</span>
                <span className="text-sm text-slate-300">已研发「星河奇迹」科技</span>
              </div>
              <div className="flex items-center gap-2">
                <span className={colony.population.total >= 20 ? 'text-green-400' : 'text-red-400'}>{colony.population.total >= 20 ? '✔' : '✘'}</span>
                <span className="text-sm text-slate-300">殖民地人口 ≥ 20（当前 {colony.population.total}）</span>
              </div>
            </div>
            {!conditionsMet && (
              <div className="mt-3 p-3 bg-red-900/20 border border-red-700/30 rounded-lg">
                <p className="text-sm text-red-400">暂未满足条件，满足后将自动解锁奇观建设。</p>
              </div>
            )}
          </div>
        </div>
      </div>
    );
  }

  // ===== 模式 2：条件满足，选择奇观 =====
  if (!ws || ws.phase === 'selecting' || !ws.selectedWonderId) {
    return (
      <div className="space-y-4">
        <div className="bg-slate-900/60 border border-slate-700 rounded-xl p-5">
          <h2 className="text-2xl font-bold text-cyan-400 mb-2">🏗 选择奇观</h2>
          <p className="text-sm text-slate-400 mb-1">条件已满足！选择一座奇观开始建设。一旦选定，其他奇观将永久锁定。</p>
          <p className="text-sm text-amber-400 mb-4">⚠ 任何一座奇观建成即可赢得游戏胜利。</p>
          <div className="space-y-4">
            {ALL_WONDERS.map((w) => (
              <div key={w.id}
                className={`bg-slate-800/60 border rounded-xl p-4 cursor-pointer transition-all hover:border-cyan-500/60 ${selectedId === w.id ? 'border-cyan-500 bg-slate-800/80' : 'border-slate-700'}`}
                onClick={() => setSelectedId(w.id)}
              >
                <div className="flex justify-between items-start mb-2">
                  <div>
                    <h3 className="text-lg font-bold text-slate-200">{w.name}</h3>
                    <p className="text-sm text-amber-400">{w.subtitle}</p>
                  </div>
                  <span className="text-xs text-slate-500">偏好星球：{w.preferredPlanets}</span>
                </div>
                <p className="text-sm text-slate-400 mb-3 leading-relaxed">{w.description}</p>
                <div className="flex flex-wrap gap-2">
                  {w.totalLines.map((line, i) => (
                    <span key={i} className="px-2 py-1 bg-slate-900/80 border border-slate-600 rounded text-xs text-slate-300">{line}</span>
                  ))}
                </div>
              </div>
            ))}
          </div>
          <button
            disabled={!selectedId}
            onClick={() => {
              if (!selectedId) return;
              const r = onSelectWonder(selectedId);
              onShowMsg(r.message, r.success ? 'success' : 'error');
            }}
            className="mt-4 w-full px-6 py-3 bg-cyan-600 hover:bg-cyan-500 disabled:bg-slate-700 disabled:text-slate-500 rounded-xl text-lg font-bold text-white transition-colors"
          >
            {selectedId ? `确认选择「${ALL_WONDERS.find(w => w.id === selectedId)?.name}」` : '请先选择一座奇观'}
          </button>
        </div>
      </div>
    );
  }

  // ===== 模式 3：建设中 =====
  const wonder = getWonderDef(ws.selectedWonderId!);
  if (!wonder) return <div className="text-red-400">奇观数据错误</div>;

  const stage = wonder.stages[ws.currentStage];
  const isComplete = ws.currentStage >= wonder.stages.length;

  if (isComplete) {
    return (
      <div className="space-y-4">
        <div className="bg-slate-900/60 border border-amber-700/40 rounded-xl p-6 text-center">
          <h2 className="text-3xl font-bold text-amber-400 mb-4">🏆 奇观已竣工</h2>
          <p className="text-xl text-slate-200 mb-2">「{wonder.name}」已经矗立在群星之间。</p>
          <p className="text-sm text-red-400 mb-6">⚠ 确认建成后将结束本局游戏，无法继续。</p>

          {showConfirm ? (
            <div className="bg-red-900/20 border border-red-700/40 rounded-lg p-4 mb-4">
              <p className="text-sm text-red-300 mb-3">确定要建成「{wonder.name}」并结束游戏吗？</p>
              <div className="flex gap-3 justify-center">
                <button
                  onClick={() => {
                    const r = onCompleteWonder();
                    onShowMsg(r.message, r.success ? 'success' : 'error');
                  }}
                  className="px-8 py-3 bg-amber-600 hover:bg-amber-500 rounded-lg text-lg font-bold text-white transition-colors"
                >
                  确认建成
                </button>
                <button
                  onClick={() => setShowConfirm(false)}
                  className="px-8 py-3 bg-slate-700 hover:bg-slate-600 rounded-lg text-lg font-bold text-slate-200 transition-colors"
                >
                  取消
                </button>
              </div>
            </div>
          ) : (
            <button
              onClick={() => setShowConfirm(true)}
              className="px-10 py-4 bg-amber-600 hover:bg-amber-500 rounded-xl text-2xl font-bold text-white transition-colors shadow-lg shadow-amber-900/30"
            >
              🏆 建成奇观
            </button>
          )}

          <div className="bg-slate-800/60 rounded-lg p-4 text-left max-w-lg mx-auto mt-6">
            <p className="text-sm text-amber-400 font-bold mb-2">建设历程</p>
            {ws.eventHistory.map((h, i) => (
              <p key={i} className="text-xs text-slate-400 leading-relaxed">{h}</p>
            ))}
          </div>
        </div>
      </div>
    );
  }

  // Resource check helper
  const checkRes = (need: number, have: number, name: string) => {
    if (need <= 0) return null;
    const ok = have >= need;
    return (
      <span key={name} className={`text-xs px-1.5 py-0.5 rounded ${ok ? 'bg-green-900/30 text-green-400' : 'bg-red-900/30 text-red-400'}`}>
        {name}：{have.toLocaleString()}/{need.toLocaleString()}
      </span>
    );
  };

  const checkBool = (need: number, have: number) => need <= 0 || have >= need;

  const resourceFlags = {
    gold: checkBool(stage.gold, shipGold),
    alloy: checkBool(stage.alloy, shipAlloy),
    silicon: checkBool(stage.silicon, shipMaterials.silicon || 0),
    quantum: checkBool(stage.quantum, shipMaterials.quantum || 0),
    dark_matter: checkBool(stage.dark_matter, shipMaterials.dark_matter || 0),
    stardust: checkBool(stage.stardust, shipStardust),
    food: checkBool(stage.food, shipFood),
    carbon: checkBool(stage.carbon, shipMaterials.carbon || 0),
    oil: checkBool(stage.oil, shipMaterials.oil || 0),
    gold_ore: checkBool(stage.gold_ore, shipMaterials.gold_ore || 0),
    research: checkBool(stage.research, colony.techState?.researchPoints || 0),
  };
  const allPassed = Object.values(resourceFlags).every(Boolean);

  const allChecks = [
    checkRes(stage.gold, shipGold, '金币'),
    checkRes(stage.alloy, shipAlloy, '合金'),
    checkRes(stage.silicon, shipMaterials.silicon || 0, '硅片'),
    checkRes(stage.quantum, shipMaterials.quantum || 0, '量子'),
    checkRes(stage.dark_matter, shipMaterials.dark_matter || 0, '暗物质'),
    checkRes(stage.stardust, shipStardust, '星尘'),
    checkRes(stage.food, shipFood, '食物'),
    checkRes(stage.carbon, shipMaterials.carbon || 0, '碳块'),
    checkRes(stage.oil, shipMaterials.oil || 0, '石油'),
    checkRes(stage.gold_ore, shipMaterials.gold_ore || 0, '金矿'),
    checkRes(stage.research, colony.techState?.researchPoints || 0, '科研点'),
  ].filter(Boolean);

  const eventDef = ws.eventPending ? WONDER_EVENTS.find(e => e.id === ws.eventPending) : null;

  return (
    <div className="space-y-4">
      {/* 奇观顶部信息 */}
      <div className="bg-slate-900/60 border border-slate-700 rounded-xl p-5">
        <div className="flex justify-between items-start mb-3">
          <div>
            <h2 className="text-2xl font-bold text-cyan-400">🏗 {wonder.name}</h2>
            <p className="text-sm text-amber-400">{wonder.subtitle}</p>
          </div>
          <div className="text-right">
            <p className="text-xs text-slate-500">总回合</p>
            <p className="text-lg font-bold text-slate-200">{ws.totalTurnsSpent}</p>
          </div>
        </div>
        {/* 阶段进度条 */}
        <div className="mb-3">
          <p className="text-sm text-slate-400 mb-2">
            阶段 {ws.currentStage + 1}/8 — {stage.name}（{ws.stageProgress}/{stage.turns} 回合）
          </p>
          <div className="w-full bg-slate-800 rounded-full h-4 overflow-hidden">
            {wonder.stages.map((st, i) => {
              const width = (st.turns / wonder.stages.reduce((a, s) => a + s.turns, 0)) * 100;
              let color = 'bg-slate-700';
              if (i < ws.currentStage) color = 'bg-green-600';
              else if (i === ws.currentStage) color = 'bg-cyan-500';
              return (
                <div key={i} className="inline-block h-full" style={{ width: `${width}%`, position: 'relative' }}>
                  <div className={`h-full ${color}`} />
                </div>
              );
            })}
          </div>
        </div>
        {/* 本回合需求 */}
        <div className="bg-slate-800/60 border border-slate-700 rounded-lg p-3 mb-3">
          <p className="text-xs text-slate-400 mb-2">本回合需缴纳资源（每游戏回合限交 1 次）</p>
          <div className="flex flex-wrap gap-1 mb-3">{allChecks}</div>
          {ws.submittedThisTurn ? (
            <div className="w-full px-4 py-3 rounded-lg text-lg font-bold text-center bg-green-900/40 border border-green-700/50 text-green-400">
              ✓ 已提交 — 请结束游戏回合以推进建设
            </div>
          ) : (
            <button
              disabled={ws.eventPending !== null}
              onClick={() => {
                if (!allPassed) { onShowMsg('资源不足，无法缴纳', 'error'); return; }
                const r = onSubmitResources();
                onShowMsg(r.message, r.success ? 'success' : 'error');
              }}
              className={`w-full px-4 py-3 rounded-lg text-lg font-bold transition-colors ${
                ws.eventPending !== null
                  ? 'bg-slate-700 text-slate-500 cursor-not-allowed'
                  : allPassed
                  ? 'bg-cyan-600 hover:bg-cyan-500 text-white'
                  : 'bg-slate-700 text-slate-500 cursor-not-allowed'
              }`}
            >
              {ws.eventPending !== null ? '⚠ 请先处理事件' : allPassed ? `提交资源 · 推进「${stage.name}」` : '资源不足，无法提交'}
            </button>
          )}
        </div>
      </div>

      {/* 事件处理 */}
      {eventDef && (
        <div className="bg-red-900/20 border border-red-700/40 rounded-xl p-5">
          <h3 className="text-lg font-bold text-red-400 mb-2">⚠ 事件：{eventDef.name}</h3>
          <p className="text-sm text-slate-300 mb-4 leading-relaxed">{eventDef.description}</p>
          <div className="flex gap-3">
            <button
              onClick={() => {
                const r = onHandleEvent('A');
                onShowMsg(r.message, r.success ? 'success' : 'error');
              }}
              className="flex-1 px-4 py-3 bg-cyan-700 hover:bg-cyan-600 rounded-lg text-sm font-bold text-white transition-colors"
            >
              【方案A】{eventDef.optionA.label} → {eventDef.optionA.effect}
            </button>
            <button
              onClick={() => {
                const r = onHandleEvent('B');
                onShowMsg(r.message, r.success ? 'success' : 'error');
              }}
              className="flex-1 px-4 py-3 bg-slate-700 hover:bg-slate-600 rounded-lg text-sm font-bold text-slate-200 transition-colors"
            >
              【方案B】{eventDef.optionB.label} → {eventDef.optionB.effect}
            </button>
          </div>
        </div>
      )}

      {/* 建设日志 */}
      <div className="bg-slate-900/60 border border-slate-700 rounded-xl p-4">
        <h4 className="text-sm font-bold text-slate-400 mb-2">建设日志</h4>
        <div className="max-h-40 overflow-y-auto space-y-1">
          {ws.eventHistory.slice(-15).map((h, i) => (
            <p key={i} className="text-xs text-slate-500">{h}</p>
          ))}
        </div>
      </div>
    </div>
  );
}
