import { useState } from 'react';
import type { ChoiceEvent, EventOption, ResourceChange, EventSubChoice } from '@/types/game';
import type { ChooseResult, EventResult, DodgeReason } from '@/hooks/useEvent';
import {
  Swords, Star, AlertTriangle, Users, HelpCircle,
  Briefcase, ChevronRight, Lock, Clock, Sparkles,
  CheckCircle, Zap, ArrowLeft, Layers,
  Coins, Wheat, Cog, Sparkle, Shield,
  TrendingUp, Package,
} from 'lucide-react';

interface EventPanelProps {
  activeEvent: ChoiceEvent | null;
  eventDodged: DodgeReason;
  eventProcessedThisTurn: boolean;
  stockTipThisTurn?: string;
  matTipThisTurn?: string;
  eventLog: { turn: number; event: string; detail: string }[];
  currentTurn: number;
  eventTriggeredThisTurn: boolean;
  onDrawEvent: (shipIndex: number) => ChoiceEvent | null;
  onChooseOption: (shipIndex: number, option: EventOption, accumulator: ResourceChange) => ChooseResult | null;
  onApplyResources: (shipIndex: number, res: ResourceChange, reason: string) => void;
  onClearActiveEvent: () => void;
  onClearDodged: () => void;
}

const categoryConfig = {
  combat: { label: '战斗', color: 'text-red-400', border: 'border-red-700/40', bg: 'bg-red-950/30', icon: Swords },
  opportunity: { label: '机遇', color: 'text-cyan-400', border: 'border-cyan-700/40', bg: 'bg-cyan-950/30', icon: Star },
  disaster: { label: '灾难', color: 'text-orange-400', border: 'border-orange-700/40', bg: 'bg-orange-950/30', icon: AlertTriangle },
  social: { label: '社交', color: 'text-purple-400', border: 'border-purple-700/40', bg: 'bg-purple-950/30', icon: Users },
  mystery: { label: '神秘', color: 'text-indigo-400', border: 'border-indigo-700/40', bg: 'bg-indigo-950/30', icon: HelpCircle },
  business: { label: '商业', color: 'text-yellow-400', border: 'border-yellow-700/40', bg: 'bg-yellow-950/30', icon: Briefcase },
};

export default function EventPanel({
  activeEvent, eventDodged, eventProcessedThisTurn, stockTipThisTurn, matTipThisTurn, eventLog, currentTurn,
  eventTriggeredThisTurn, onDrawEvent, onChooseOption, onApplyResources, onClearActiveEvent, onClearDodged,
}: EventPanelProps) {
  // 最终结果展示
  const [result, setResult] = useState<EventResult | null>(null);
  // 子选择栈：当前正在进行的多层选择
  const [choiceStack, setChoiceStack] = useState<EventSubChoice[]>([]);
  // 累积的资源变动
  const [pendingResources, setPendingResources] = useState<ResourceChange>({});
  // 选择路径记录（用于日志）
  const [choicePath, setChoicePath] = useState<string[]>([]);

  const currentLevel = choiceStack.length;
  const currentChoice = currentLevel > 0 ? choiceStack[currentLevel - 1] : null;

  // 获取当前要显示的选项
  const getCurrentOptions = (): { source: 'event' | 'subChoice'; options: EventOption[]; title: string; description: string; category?: string } => {
    if (currentChoice) {
      return { source: 'subChoice', options: currentChoice.options, title: currentChoice.title, description: currentChoice.description };
    }
    if (activeEvent) {
      return { source: 'event', options: activeEvent.options, title: activeEvent.name, description: activeEvent.description, category: activeEvent.category };
    }
    return { source: 'event', options: [], title: '', description: '' };
  };

  const current = getCurrentOptions();

  const handleChoose = (option: EventOption) => {
    const res = onChooseOption(0, option, pendingResources);
    if (!res) return;

    // 记录选择路径
    setChoicePath((prev) => [...prev, option.label]);

    if (res.type === 'subChoice') {
      // 进入二级选择
      setChoiceStack((prev) => [...prev, res.subChoice]);
      setPendingResources(res.accumulator);
    } else {
      // 最终结果：应用累积资源，显示结果
      onApplyResources(0, res.accumulator, '事件处理');
      setResult(res.result);
      setChoiceStack([]);
      setPendingResources({});
    }
  };

  const handleBack = () => {
    if (currentLevel > 0) {
      setChoiceStack((prev) => prev.slice(0, -1));
      setChoicePath((prev) => prev.slice(0, -1));
    }
  };

  const handleContinue = () => {
    setResult(null);
    setChoicePath([]);
    onClearActiveEvent();
  };

  const checkRequirement = (_option: EventOption) => {
    return { ok: true, reason: '' };
  };

  return (
    <div className="space-y-4 md:space-y-6">
      <div>
        <h2 className="text-xl md:text-2xl font-bold text-white mb-2 flex items-center gap-2">
          <Sparkles size={22} className="text-purple-400" />
          星际事件
        </h2>
        <p className="text-xs md:text-sm text-slate-400">
          遭遇星际间的各种事件，做出选择影响你的命运。部分事件包含多重选择，走向不同结局。
        </p>
      </div>

      {/* 情报提示 */}
      {(stockTipThisTurn || matTipThisTurn) && (
        <div className="space-y-2">
          {stockTipThisTurn && (
            <div className="flex items-center gap-2 bg-purple-900/30 border border-purple-700/40 rounded-lg px-3 py-2 md:px-4 md:py-2.5">
              <TrendingUp size={16} className="text-purple-400 flex-shrink-0" />
              <div>
                <span className="text-[10px] md:text-xs text-purple-400 font-semibold">股票情报</span>
                <p className="text-xs md:text-sm text-slate-200">{stockTipThisTurn}</p>
              </div>
            </div>
          )}
          {matTipThisTurn && (
            <div className="flex items-center gap-2 bg-green-900/30 border border-green-700/40 rounded-lg px-3 py-2 md:px-4 md:py-2.5">
              <Package size={16} className="text-green-400 flex-shrink-0" />
              <div>
                <span className="text-[10px] md:text-xs text-green-400 font-semibold">原料情报</span>
                <p className="text-xs md:text-sm text-slate-200">{matTipThisTurn}</p>
              </div>
            </div>
          )}
        </div>
      )}

      {/* 结果展示 */}
      {result && (
        <div className="bg-slate-900/60 border border-slate-700 rounded-xl p-4 md:p-5">
          <div className="flex items-center gap-2 mb-3">
            <CheckCircle size={18} className="text-green-400" />
            <h3 className="font-bold text-green-400">事件结果</h3>
          </div>
          <p className="text-sm text-slate-300 mb-3 leading-relaxed">{result.description}</p>
          <div className="bg-slate-800/60 rounded-lg p-3 mb-3">
            <p className="text-sm text-slate-200 font-medium">{result.message}</p>
          </div>
          {result.subMessage && (
            <div className="bg-purple-900/20 border border-purple-700/30 rounded-lg p-3 mb-3">
              <div className="flex items-center gap-2 mb-1">
                <Zap size={14} className="text-purple-400" />
                <span className="text-xs text-purple-400 font-semibold">后续发展</span>
              </div>
              <p className="text-sm text-purple-200">{result.subMessage}</p>
            </div>
          )}
          {/* 资源变动总结 */}
          <div className="flex flex-wrap gap-2 mb-3">
            {result.goldChange !== 0 && (
              <span className={`text-xs font-bold px-2 py-1 rounded ${result.goldChange > 0 ? 'bg-yellow-900/30 text-yellow-400' : 'bg-red-900/30 text-red-400'}`}>
                <Coins size={10} className="inline mr-1" />{result.goldChange > 0 ? '+' : ''}{result.goldChange.toLocaleString()} 金币
              </span>
            )}
            {result.foodChange !== 0 && (
              <span className={`text-xs font-bold px-2 py-1 rounded ${result.foodChange > 0 ? 'bg-amber-900/30 text-amber-400' : 'bg-red-900/30 text-red-400'}`}>
                <Wheat size={10} className="inline mr-1" />{result.foodChange > 0 ? '+' : ''}{result.foodChange} 食物
              </span>
            )}
            {result.alloyChange !== 0 && (
              <span className={`text-xs font-bold px-2 py-1 rounded ${result.alloyChange > 0 ? 'bg-slate-700/50 text-slate-300' : 'bg-red-900/30 text-red-400'}`}>
                <Cog size={10} className="inline mr-1" />{result.alloyChange > 0 ? '+' : ''}{result.alloyChange} 合金
              </span>
            )}
            {result.stardustChange !== 0 && (
              <span className={`text-xs font-bold px-2 py-1 rounded ${result.stardustChange > 0 ? 'bg-purple-900/30 text-purple-400' : 'bg-red-900/30 text-red-400'}`}>
                <Sparkle size={10} className="inline mr-1" />{result.stardustChange > 0 ? '+' : ''}{result.stardustChange} 星尘
              </span>
            )}
          </div>
          <button
            onClick={handleContinue}
            className="w-full py-2 bg-slate-700 hover:bg-slate-600 rounded-lg text-sm font-bold text-slate-200 transition-colors flex items-center justify-center gap-2"
          >
            <ArrowLeft size={14} /> 继续
          </button>
        </div>
      )}

      {/* 活跃事件 / 子选择界面 */}
      {(activeEvent || currentChoice) && !result && (
        <div className={`rounded-xl border p-4 md:p-6 ${activeEvent ? categoryConfig[activeEvent.category].border : 'border-cyan-700/40'} ${activeEvent ? categoryConfig[activeEvent.category].bg : 'bg-cyan-950/30'}`}>
          {/* 层级指示器 */}
          {currentLevel > 0 && (
            <div className="flex items-center gap-2 mb-3 text-xs text-slate-500">
              <Layers size={14} className="text-cyan-400" />
              <span>第 {currentLevel + 1} 层选择</span>
              {choicePath.length > 0 && (
                <span className="text-slate-600">({choicePath.join(' → ')})</span>
              )}
            </div>
          )}

          {/* 事件/子选择头部 */}
          <div className="flex items-center gap-2 md:gap-3 mb-3 md:mb-4">
            {activeEvent && current.source === 'event' ? (() => {
              const CatIcon = categoryConfig[activeEvent.category].icon;
              return (
                <div className={`p-1.5 md:p-2 rounded-lg bg-slate-800/80 ${categoryConfig[activeEvent.category].color}`}>
                  <CatIcon size={20} />
                </div>
              );
            })() : (
              <div className="p-1.5 md:p-2 rounded-lg bg-slate-800/80 text-cyan-400">
                <Zap size={20} />
              </div>
            )}
            <div className="flex-1">
              <h3 className={`text-lg md:text-xl font-bold ${activeEvent && current.source === 'event' ? categoryConfig[activeEvent.category].color : 'text-cyan-400'}`}>
                {current.title}
              </h3>
              {activeEvent && current.source === 'event' && (
                <span className="text-[10px] md:text-xs text-slate-500">
                  {categoryConfig[activeEvent.category].label} · 第{currentTurn}回合
                </span>
              )}
            </div>
            {currentLevel > 0 && (
              <button
                onClick={handleBack}
                className="px-3 py-1.5 bg-slate-700 hover:bg-slate-600 rounded-lg text-xs text-slate-300 transition-colors"
              >
                返回
              </button>
            )}
          </div>

          {/* 描述 */}
          <p className="text-slate-300 text-xs md:text-sm leading-relaxed mb-4 md:mb-6 bg-slate-900/40 rounded-lg p-3 md:p-4">
            {current.description}
          </p>

          {/* 事件已处理（切换标签页后result丢失，但gameState标记了已处理） */}
          {eventProcessedThisTurn && !result && (
            <div className="bg-yellow-900/20 border border-yellow-700/40 rounded-lg p-4 md:p-5 mb-4">
              <div className="flex items-center gap-2 mb-2">
                <CheckCircle size={18} className="text-yellow-400" />
                <h3 className="font-bold text-yellow-400">事件已处理</h3>
              </div>
              <p className="text-sm text-slate-300 mb-3">你已在本回合处理过该事件，资源变动已生效。</p>
              <button
                onClick={handleContinue}
                className="px-4 py-2 bg-cyan-700 hover:bg-cyan-600 text-white rounded-lg text-sm font-bold transition-colors"
              >
                继续
              </button>
            </div>
          )}

          {/* 选项列表 */}
          <div className="space-y-2 md:space-y-3">
            <p className="text-[10px] md:text-xs text-slate-500 font-semibold uppercase tracking-wider mb-1 md:mb-2">
              {currentLevel > 0 ? '做出你的下一步选择' : '做出你的选择'}
            </p>
            {!eventProcessedThisTurn && current.options.map((option, idx) => {
              const reqCheck = checkRequirement(option);
              return (
                <button
                  key={`${currentLevel}-${idx}`}
                  onClick={() => reqCheck.ok && handleChoose(option)}
                  disabled={!reqCheck.ok}
                  className={`w-full text-left rounded-lg border p-3 md:p-4 transition-all min-h-[48px] ${
                    reqCheck.ok
                      ? 'border-slate-600 bg-slate-800/60 hover:border-cyan-500 hover:bg-slate-800 cursor-pointer group active:bg-slate-700'
                      : 'border-slate-700/50 bg-slate-800/30 opacity-50 cursor-not-allowed'
                  }`}
                >
                  <div className="flex items-center justify-between mb-1">
                    <div className="flex items-center gap-2">
                      <span className="text-[10px] md:text-xs text-slate-500 font-mono">{String.fromCharCode(65 + idx)}</span>
                      <span className="font-bold text-slate-200 text-sm md:text-base group-hover:text-cyan-400 transition-colors">
                        {option.label}
                      </span>
                      {!reqCheck.ok && (
                        <span className="flex items-center gap-1 text-[10px] md:text-xs text-red-400">
                          <Lock size={12} /> {reqCheck.reason}
                        </span>
                      )}
                    </div>
                    <ChevronRight size={16} className="text-slate-600 group-hover:text-cyan-400 transition-colors" />
                  </div>
                  <p className="text-[10px] md:text-xs text-slate-400 ml-4 md:ml-5">{option.description}</p>
                </button>
              );
            })}
          </div>
        </div>
      )}

      {/* 触发事件按钮 */}
      {!activeEvent && !result && !currentChoice && !eventTriggeredThisTurn && (
        <button
          onClick={() => onDrawEvent(0)}
          className="w-full py-3 md:py-4 bg-purple-700 hover:bg-purple-600 rounded-xl font-bold text-white transition-all shadow-lg shadow-purple-900/30 flex items-center justify-center gap-2"
        >
          <Sparkles size={18} />
          遭遇随机事件
        </button>
      )}

      {/* 事件躲避提示 */}
      {eventDodged && !activeEvent && !result && !currentChoice && (
        <div className={`rounded-xl p-4 md:p-5 text-center border ${
          eventDodged === 'jumper'
            ? 'bg-blue-900/30 border-blue-700/40'
            : 'bg-emerald-900/30 border-emerald-700/40'
        }`}>
          <Shield size={24} className={`mx-auto mb-2 ${
            eventDodged === 'jumper' ? 'text-blue-400' : 'text-emerald-400'
          }`} />
          <p className={`font-bold text-sm md:text-base mb-1 ${
            eventDodged === 'jumper' ? 'text-blue-300' : 'text-emerald-300'
          }`}>
            {eventDodged === 'jumper' ? '跃迁者直觉生效！' : '危机预知生效！'}
          </p>
          <p className={`text-xs md:text-sm mb-3 ${
            eventDodged === 'jumper' ? 'text-blue-400/70' : 'text-emerald-400/70'
          }`}>
            {eventDodged === 'jumper'
              ? '跃迁者号的预知能力帮你规避了一个危险事件。'
              : '你的直觉/技能帮你提前规避了一个危险事件。'}
          </p>
          <button
            onClick={onClearDodged}
            className={`px-4 py-1.5 rounded-lg text-xs transition-colors ${
              eventDodged === 'jumper'
                ? 'bg-blue-800/60 hover:bg-blue-700/60 text-blue-200'
                : 'bg-emerald-800/60 hover:bg-emerald-700/60 text-emerald-200'
            }`}
          >
            继续
          </button>
        </div>
      )}

      {eventTriggeredThisTurn && !activeEvent && !result && !currentChoice && !eventDodged && (
        <div className="text-center text-sm text-slate-500 bg-slate-800/40 rounded-xl py-4 md:py-6">
          <Clock size={20} className="mx-auto mb-2 text-slate-600" />
          本回合已处理过事件
        </div>
      )}

      {/* 事件日志 */}
      {eventLog.length > 0 && (
        <div>
          <h3 className="text-base md:text-lg font-bold text-slate-200 mb-2 md:mb-3">事件记录</h3>
          <div className="bg-slate-900/60 border border-slate-700 rounded-xl p-3 md:p-4 max-h-48 md:max-h-60 overflow-auto">
            {eventLog.slice(0, 30).map((log, idx) => (
              <div key={idx} className="text-xs md:text-sm border-b border-slate-800 pb-2 mb-2 last:border-0 last:pb-0 last:mb-0">
                <span className="text-slate-500">第{log.turn}回合</span>
                <span className="text-purple-400 mx-1 md:mx-2">{log.event}</span>
                <span className="text-slate-400">{log.detail}</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
