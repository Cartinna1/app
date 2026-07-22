import { useState } from 'react';
import type { Mothership, Loan } from '@/types/game';
import { Banknote, AlertTriangle, Clock, Coins, Check, ShieldAlert } from 'lucide-react';

interface LoanPanelProps {
  ship: Mothership;
  onTakeLoan: (principal: number, plan: { turns: number; rate: number }) => { success: boolean; message: string };
  onRepayLoan: (loanId: string) => { success: boolean; message: string };
}

// 贷款方案：总利率（useLoan.ts 中直接 principal * rate 计算总利息）
const LOAN_PLANS = [
  { turns: 5, rate: 0.4, label: '5回合', rateLabel: '到期总利率40%' },
  { turns: 10, rate: 0.6, label: '10回合', rateLabel: '到期总利率60%' },
  { turns: 15, rate: 0.9, label: '15回合', rateLabel: '到期总利率90%' },
];

export default function LoanPanel({ ship, onTakeLoan, onRepayLoan }: LoanPanelProps) {
  const [amount, setAmount] = useState('');
  const [selectedPlan, setSelectedPlan] = useState(0);
  const [message, setMessage] = useState('');
  const [msgType, setMsgType] = useState<'success' | 'error'>('success');

  const totalLoans = ship.loans.reduce((sum, l) => sum + l.principal, 0);
  const remainingCapacity = Math.max(0, 50000 - totalLoans);

  const handleBorrow = () => {
    const principal = parseInt(amount);
    if (isNaN(principal) || principal <= 0) {
      setMessage('请输入有效的贷款金额');
      setMsgType('error');
      return;
    }
    if (principal > remainingCapacity) {
      setMessage(`最多还能贷款${remainingCapacity}金币`);
      setMsgType('error');
      return;
    }
    const plan = LOAN_PLANS[selectedPlan];
    const res = onTakeLoan(principal, plan);
    setMessage(res.message);
    setMsgType(res.success ? 'success' : 'error');
    if (res.success) setAmount('');
    setTimeout(() => setMessage(''), 5000);
  };

  const handleRepay = (loanId: string) => {
    const res = onRepayLoan(loanId);
    setMessage(res.message);
    setMsgType(res.success ? 'success' : 'error');
    setTimeout(() => setMessage(''), 5000);
  };

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-bold text-white mb-2 flex items-center gap-2">
          <Banknote size={24} className="text-yellow-400" />
          星际银行贷款
        </h2>
        <p className="text-sm text-slate-400">
          最多贷款 50,000 金币。按时还款保持良好信用，违约将宣布破产！
        </p>
      </div>

      {/* 破产警告 */}
      {ship.bankrupt && (
        <div className="bg-red-900/30 border border-red-600 rounded-xl p-4 flex items-center gap-3">
          <ShieldAlert size={22} className="text-red-400 flex-shrink-0" />
          <div>
            <p className="text-red-400 font-bold text-sm">已宣布破产</p>
            <p className="text-red-300/70 text-xs">无法买入股票和原料，可以卖出资产和抽取事件。还清所有债务后自动恢复。</p>
          </div>
        </div>
      )}

      {/* 贷款额度 */}
      <div className="grid grid-cols-3 gap-2 md:gap-4">
        <div className="bg-slate-900/60 border border-slate-700 rounded-xl p-3 md:p-4">
          <p className="text-[10px] md:text-xs text-slate-500 mb-1">已贷款总额</p>
          <p className={`text-base md:text-xl font-bold ${totalLoans > 0 ? 'text-yellow-400' : 'text-slate-400'}`}>{totalLoans.toLocaleString()}</p>
        </div>
        <div className="bg-slate-900/60 border border-slate-700 rounded-xl p-3 md:p-4">
          <p className="text-[10px] md:text-xs text-slate-500 mb-1">剩余额度</p>
          <p className="text-base md:text-xl font-bold text-green-400">{remainingCapacity.toLocaleString()}</p>
        </div>
        <div className="bg-slate-900/60 border border-slate-700 rounded-xl p-3 md:p-4">
          <p className="text-[10px] md:text-xs text-slate-500 mb-1">当前金币</p>
          <p className="text-base md:text-xl font-bold text-cyan-400">{ship.gold.toLocaleString()}</p>
        </div>
      </div>

      {/* 申请贷款 */}
      {remainingCapacity > 0 && (
        <div className="bg-slate-900/60 border border-slate-700 rounded-xl p-5">
          <h3 className="text-lg font-bold text-slate-200 mb-4 flex items-center gap-2">
            <Coins size={18} className="text-yellow-400" />
            申请贷款
          </h3>

          <div className="mb-4">
            <label className="text-xs text-slate-400 mb-1 block">贷款金额</label>
            <input
              type="number"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              placeholder={`1 - ${remainingCapacity}`}
              className="w-full bg-slate-800 border border-slate-600 rounded-lg px-4 py-2 text-sm text-slate-200 placeholder-slate-600 focus:outline-none focus:border-yellow-500"
            />
          </div>

          <div className="mb-4">
            <label className="text-xs text-slate-400 mb-2 block">还款方案</label>
            <div className="grid grid-cols-3 gap-2">
              {LOAN_PLANS.map((plan, idx) => {
                const principal = parseInt(amount) || 0;
                const totalInterest = Math.round(principal * plan.rate);
                const totalRepay = principal + totalInterest;
                return (
                  <button
                    key={idx}
                    onClick={() => setSelectedPlan(idx)}
                    className={`rounded-lg border p-2 md:p-3 text-left transition-all min-h-[64px] ${
                      selectedPlan === idx
                        ? 'border-yellow-500 bg-yellow-900/20'
                        : 'border-slate-700 bg-slate-800/60 hover:border-slate-500'
                    }`}
                  >
                    <p className="text-xs md:text-sm font-bold text-slate-200">{plan.label}</p>
                    <p className="text-[10px] md:text-xs text-slate-500">{plan.rateLabel}</p>
                    {principal > 0 && (
                      <p className="text-[10px] md:text-xs text-yellow-400 mt-1">到期还 {totalRepay.toLocaleString()}</p>
                    )}
                  </button>
                );
              })}
            </div>
          </div>

          {(() => {
            const principal = parseInt(amount) || 0;
            const plan = LOAN_PLANS[selectedPlan];
            const totalInterest = Math.round(principal * plan.rate);
            return principal > 0 ? (
              <div className="text-xs text-slate-500 mb-4 bg-slate-800/60 rounded-lg p-3 space-y-1">
                <div className="flex justify-between"><span>本金</span><span className="text-slate-300">{principal.toLocaleString()}</span></div>
                <div className="flex justify-between"><span>到期利息</span><span className="text-slate-300">{totalInterest.toLocaleString()}</span></div>
                <div className="flex justify-between"><span>到期应还总额</span><span className="text-yellow-400 font-bold">{(principal + totalInterest).toLocaleString()}</span></div>
                <div className="flex justify-between"><span>还款期限</span><span className="text-cyan-400">{plan.label}</span></div>
              </div>
            ) : null;
          })()}

          <button
            onClick={handleBorrow}
            disabled={!amount || parseInt(amount) <= 0}
            className="w-full py-2.5 bg-gradient-to-r from-yellow-600 to-amber-600 hover:from-yellow-500 hover:to-amber-500 disabled:from-slate-700 disabled:to-slate-700 rounded-lg font-bold text-white transition-all"
          >
            确认贷款
          </button>
        </div>
      )}

      {/* 当前贷款列表 */}
      {ship.loans.length > 0 && (
        <div className="bg-slate-900/60 border border-slate-700 rounded-xl p-5">
          <h3 className="text-lg font-bold text-slate-200 mb-4 flex items-center gap-2">
            <Clock size={18} className="text-cyan-400" />
            我的贷款 ({ship.loans.length}笔)
          </h3>
          <div className="space-y-3">
            {ship.loans.map((loan) => (
              <LoanCard key={loan.id} loan={loan} onRepay={handleRepay} shipGold={ship.gold} />
            ))}
          </div>
        </div>
      )}

      {ship.loans.length === 0 && (
        <div className="bg-slate-900/40 border border-slate-800 rounded-xl p-6 text-center text-slate-500 text-sm">
          暂无贷款记录
        </div>
      )}

      {message && (
        <div className={`p-3 rounded-lg text-sm text-center ${msgType === 'success' ? 'bg-green-900/20 border border-green-700/50 text-green-400' : 'bg-red-900/20 border border-red-700/50 text-red-400'}`}>
          {message}
        </div>
      )}
    </div>
  );
}

function LoanCard({ loan, onRepay, shipGold }: { loan: Loan; onRepay: (id: string) => void; shipGold: number }) {
  const remaining = loan.totalRepay - loan.repaid;
  const overdue = loan.remainingTurns <= 0 && remaining > 0;
  const progress = loan.totalTurns > 0 ? ((loan.totalTurns - loan.remainingTurns) / loan.totalTurns) * 100 : 0;

  return (
    <div className={`rounded-lg border p-3 md:p-4 ${overdue ? 'border-red-600 bg-red-950/20' : 'border-slate-700 bg-slate-800/40'}`}>
      <div className="flex items-center justify-between mb-2">
        <div className="flex items-center gap-2">
          <Banknote size={14} className={overdue ? 'text-red-400' : 'text-yellow-400'} />
          <span className={`text-xs md:text-sm font-bold ${overdue ? 'text-red-400' : 'text-slate-200'}`}>
            {loan.principal.toLocaleString()} 金币
          </span>
          {overdue && (
            <span className="text-[10px] bg-red-600 text-white px-1.5 py-0.5 rounded font-bold flex items-center gap-1">
              <AlertTriangle size={10} />
              已逾期
            </span>
          )}
        </div>
        <span className="text-[10px] md:text-xs text-slate-500">第{loan.borrowTurn}回合借入</span>
      </div>

      <div className="w-full bg-slate-700 rounded-full h-1.5 mb-2">
        <div
          className={`h-1.5 rounded-full transition-all ${overdue ? 'bg-red-500' : 'bg-cyan-500'}`}
          style={{ width: `${Math.min(100, progress)}%` }}
        />
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-1 md:gap-2 text-[10px] md:text-xs mb-3">
        <div>
          <p className="text-slate-500">到期利息</p>
          <p className="text-slate-300">{(loan.interestRate * 100).toFixed(0)}% × {loan.totalTurns} = {Math.round(loan.totalRepay - loan.principal).toLocaleString()}</p>
        </div>
        <div>
          <p className="text-slate-500">{overdue ? '已逾期！' : `剩余 ${loan.remainingTurns} 回合`}</p>
          <p className="text-slate-300">到期应还 {loan.totalRepay.toLocaleString()}</p>
        </div>
        <div>
          <p className="text-slate-500">已借款</p>
          <p className="text-slate-300">第{loan.borrowTurn}回合</p>
        </div>
      </div>

      <button
        onClick={() => onRepay(loan.id)}
        disabled={shipGold < remaining}
        className="w-full py-2 md:py-1.5 bg-green-700 hover:bg-green-600 disabled:bg-slate-700 disabled:text-slate-500 rounded text-sm font-bold text-white transition-colors flex items-center justify-center gap-1 min-h-[40px]"
      >
        <Check size={14} />
        {shipGold >= remaining ? `提前还清 (${remaining.toLocaleString()})` : `金币不足 (${shipGold.toLocaleString()}/${remaining.toLocaleString()})`}
      </button>
    </div>
  );
}
