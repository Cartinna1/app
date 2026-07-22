import { useCallback } from 'react';
import type { GameState, Loan } from '@/types/game';

const MAX_LOAN = 50000;

// 贷款利率表：5回合40%，10回合60%，15回合90%
export const LOAN_PLANS = [
  { turns: 5, rate: 0.4, label: '5回合', totalRate: '40%' },
  { turns: 10, rate: 0.6, label: '10回合', totalRate: '60%' },
  { turns: 15, rate: 0.9, label: '15回合', totalRate: '90%' },
];

export function useLoan(
  gameState: GameState,
  dispatch: React.Dispatch<{ type: 'FUNCTIONAL_UPDATE'; updater: (state: GameState) => GameState }>
) {
  const takeLoan = useCallback(
    (shipIndex: number, principal: number, plan: { turns: number; rate: number }): { success: boolean; message: string } => {
      const ship = gameState.ships[shipIndex];
      if (ship?.bankrupt) return { success: false, message: '破产期间无法进行贷款！请先恢复资产为正数。' };
      if (principal <= 0) return { success: false, message: '贷款金额必须大于0' };
      if (principal > MAX_LOAN) return { success: false, message: `最多贷款${MAX_LOAN}金币` };

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
    [gameState.turn, dispatch]
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
