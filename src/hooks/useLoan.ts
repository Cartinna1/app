import { useCallback } from 'react';
import type { GameState, Loan } from '@/types/game';

// 贷款利率表：5回合40%，10回合60%，15回合90%
export const LOAN_PLANS = [
  { turns: 5, rate: 0.4, label: '5回合', totalRate: '40%' },
  { turns: 10, rate: 0.6, label: '10回合', totalRate: '60%' },
  { turns: 15, rate: 0.9, label: '15回合', totalRate: '90%' },
];

// 贷款额度分档（随游戏进度解锁）
// 青铜 5万（初始） → 白银 20万（解锁殖民地） → 黄金 50万（人口≥50） → 白金 100万（任一势力声望=100）
export interface LoanTier {
  name: string;
  limit: number;
  nextName: string | null;
  nextLimit: number | null;
  nextCondition: string | null;
}

export function getLoanLimit(gameState: GameState): number {
  const ship = gameState.ships[0];
  if (!ship?.colony) return 50000; // 青铜
  const pop = ship.colony.population?.total || 0;
  const anyMax = Object.values(gameState.factionReputation || {}).some((r) => r >= 100);
  if (anyMax) return 1000000; // 白金：满声望
  if (pop >= 50) return 500000; // 黄金：50 人口
  return 200000; // 白银
}

export function getLoanTierInfo(gameState: GameState): LoanTier {
  const ship = gameState.ships[0];
  if (!ship?.colony) {
    return { name: '青铜', limit: 50000, nextName: '白银', nextLimit: 200000, nextCondition: '解锁殖民地' };
  }
  const pop = ship.colony.population?.total || 0;
  const anyMax = Object.values(gameState.factionReputation || {}).some((r) => r >= 100);
  if (anyMax) {
    return { name: '白金', limit: 1000000, nextName: null, nextLimit: null, nextCondition: null };
  }
  if (pop >= 50) {
    return { name: '黄金', limit: 500000, nextName: '白金', nextLimit: 1000000, nextCondition: '任一势力声望达到 100' };
  }
  return { name: '白银', limit: 200000, nextName: '黄金', nextLimit: 500000, nextCondition: '殖民地人口达到 50' };
}

export function useLoan(
  gameState: GameState,
  dispatch: React.Dispatch<{ type: 'FUNCTIONAL_UPDATE'; updater: (state: GameState) => GameState }>
) {
  const takeLoan = useCallback(
    (shipIndex: number, principal: number, plan: { turns: number; rate: number }): { success: boolean; message: string } => {
      const ship = gameState.ships[shipIndex];
      if (ship?.bankrupt) return { success: false, message: '破产期间无法进行贷款！请先恢复资产为正数。' };
      if (principal <= 0) return { success: false, message: '贷款金额必须大于0' };
      const loanLimit = getLoanLimit(gameState);
      const totalLoans = ship.loans.reduce((sum, l) => sum + l.principal, 0);
      const remainingCapacity = loanLimit - totalLoans;
      if (principal > remainingCapacity) return { success: false, message: `最多还能贷款${remainingCapacity}金币` };

      const totalInterest = Math.round(principal * plan.rate);
      const totalRepay = principal + totalInterest;
      const perTurnPayment = Math.round(totalRepay / plan.turns);
      const loan: Loan = {
        id: `loan_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
        principal,
        interestRate: plan.rate,
        totalTurns: plan.turns,
        remainingTurns: plan.turns,
        totalRepay,
        repaid: 0,
        perTurnPayment,
        borrowTurn: gameState.turn,
      };

      dispatch({
        type: 'FUNCTIONAL_UPDATE',
        updater: (prev) => {
          const ships = [...prev.ships];
          const s = { ...ships[shipIndex] };
          s.loans = [...s.loans, loan];
          s.gold += principal;
          if (s.bankrupt && s.gold > 0) s.bankrupt = false;
          s.goldLog = [{ turn: prev.turn, amount: principal, reason: `星际银行贷款${principal}金币`, balanceAfter: s.gold }, ...s.goldLog].slice(0, 200);
          ships[shipIndex] = s;
          return { ...prev, ships };
        },
      });
      return { success: true, message: `贷款${principal}金币成功！${plan.turns}回合后到期，到期应还${totalRepay}金币` };
    },
    [gameState, dispatch]
  );

  const repayLoan = useCallback(
    (shipIndex: number, loanId: string): { success: boolean; message: string } => {
      let result: { success: boolean; message: string } = { success: false, message: '' };
      dispatch({
        type: 'FUNCTIONAL_UPDATE',
        updater: (prev) => {
          const ships = [...prev.ships];
          const s = { ...ships[shipIndex] };
          const loanIdx = s.loans.findIndex((l) => l.id === loanId);
          if (loanIdx === -1) { result = { success: false, message: '贷款不存在' }; return prev; }
          const loan = s.loans[loanIdx];
          const remaining = loan.totalRepay - loan.repaid;
          if (s.gold < remaining) { result = { success: false, message: `金币不足，还需${remaining}金币` }; return prev; }
          s.gold -= remaining;
          s.goldLog = [{ turn: prev.turn, amount: -remaining, reason: `提前还清贷款`, balanceAfter: s.gold }, ...s.goldLog].slice(0, 200);
          s.loans = s.loans.filter((_, i) => i !== loanIdx);
          result = { success: true, message: `提前还清贷款！支付${remaining}金币` };
          ships[shipIndex] = s;
          return { ...prev, ships };
        },
      });
      return result;
    },
    [dispatch]
  );

  return { takeLoan, repayLoan };
}
