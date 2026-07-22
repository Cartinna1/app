import { useState } from 'react';
import type { GoldLogEntry } from '@/types/game';
import { Coins, TrendingUp, TrendingDown, Filter, ChevronDown, ChevronUp } from 'lucide-react';

interface GoldLogViewerProps {
  goldLog: GoldLogEntry[];
  currentGold: number;
}

export default function GoldLogViewer({ goldLog, currentGold }: GoldLogViewerProps) {
  const [filter, setFilter] = useState<'all' | 'income' | 'expense'>('all');
  const [expanded, setExpanded] = useState(false);

  const filtered = goldLog.filter((entry) => {
    if (filter === 'income') return entry.amount > 0;
    if (filter === 'expense') return entry.amount < 0;
    return true;
  });

  const totalIncome = goldLog.filter((e) => e.amount > 0).reduce((s, e) => s + e.amount, 0);
  const totalExpense = goldLog.filter((e) => e.amount < 0).reduce((s, e) => s + e.amount, 0);

  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-2xl font-bold text-white mb-2 flex items-center gap-2">
          <Coins size={24} className="text-yellow-400" />
          金币日志
        </h2>
        <p className="text-sm text-slate-400">记录所有金币变动的原因和金额。</p>
      </div>

      {/* 统计 */}
      <div className="grid grid-cols-3 gap-3">
        <div className="bg-slate-900/60 border border-slate-700 rounded-xl p-3 text-center">
          <p className="text-xs text-slate-500 mb-1">当前金币</p>
          <p className="text-lg font-bold text-yellow-400">{currentGold.toLocaleString()}</p>
        </div>
        <div className="bg-slate-900/60 border border-green-700/30 rounded-xl p-3 text-center">
          <p className="text-xs text-green-400 mb-1">累计收入</p>
          <p className="text-lg font-bold text-green-400">+{totalIncome.toLocaleString()}</p>
        </div>
        <div className="bg-slate-900/60 border border-red-700/30 rounded-xl p-3 text-center">
          <p className="text-xs text-red-400 mb-1">累计支出</p>
          <p className="text-lg font-bold text-red-400">{totalExpense.toLocaleString()}</p>
        </div>
      </div>

      {/* 筛选 */}
      <div className="flex gap-2">
        <button onClick={() => setFilter('all')} className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold transition-all ${filter === 'all' ? 'bg-cyan-600 text-white' : 'bg-slate-800 text-slate-400 hover:bg-slate-700'}`}><Filter size={12} />全部</button>
        <button onClick={() => setFilter('income')} className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold transition-all ${filter === 'income' ? 'bg-green-600 text-white' : 'bg-slate-800 text-slate-400 hover:bg-slate-700'}`}><TrendingUp size={12} />收入</button>
        <button onClick={() => setFilter('expense')} className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold transition-all ${filter === 'expense' ? 'bg-red-600 text-white' : 'bg-slate-800 text-slate-400 hover:bg-slate-700'}`}><TrendingDown size={12} />支出</button>
        <span className="ml-auto text-xs text-slate-500 self-center">{filtered.length} 条记录</span>
      </div>

      {/* 日志列表 */}
      {filtered.length === 0 ? (
        <div className="text-center text-sm text-slate-500 py-12 bg-slate-900/40 rounded-xl">暂无金币变动记录</div>
      ) : (
        <div className="bg-slate-900/60 border border-slate-700 rounded-xl overflow-hidden">
          <div className="overflow-auto max-h-96">
            <table className="w-full text-sm">
              <thead className="bg-slate-800 sticky top-0 z-10">
                <tr>
                  <th className="px-3 py-2 text-left text-xs text-slate-500 font-semibold">回合</th>
                  <th className="px-3 py-2 text-left text-xs text-slate-500 font-semibold">变动</th>
                  <th className="px-3 py-2 text-left text-xs text-slate-500 font-semibold">原因</th>
                  <th className="px-3 py-2 text-right text-xs text-slate-500 font-semibold">余额</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800">
                {filtered.slice(0, expanded ? undefined : 20).map((entry, idx) => (
                  <tr key={idx} className="hover:bg-slate-800/40 transition-colors">
                    <td className="px-3 py-2 text-xs text-slate-500">{entry.turn}</td>
                    <td className={`px-3 py-2 text-xs font-bold ${entry.amount > 0 ? 'text-green-400' : entry.amount < 0 ? 'text-red-400' : 'text-slate-400'}`}>
                      {entry.amount > 0 ? '+' : ''}{entry.amount.toLocaleString()}
                    </td>
                    <td className="px-3 py-2 text-xs text-slate-300">{entry.reason}</td>
                    <td className="px-3 py-2 text-xs text-slate-400 text-right">{entry.balanceAfter.toLocaleString()}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {filtered.length > 20 && (
            <button onClick={() => setExpanded(!expanded)} className="w-full py-2 text-xs text-slate-500 hover:text-slate-300 bg-slate-800/40 hover:bg-slate-800/60 transition-colors flex items-center justify-center gap-1">
              {expanded ? <><ChevronUp size={14} />收起</> : <><ChevronDown size={14} />展开全部 ({filtered.length} 条)</>}
            </button>
          )}
        </div>
      )}
    </div>
  );
}
