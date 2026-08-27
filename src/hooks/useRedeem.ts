import { useCallback } from 'react';
import type { GameState } from '@/types/game';
import { REDEEM_CODES, REDEEM_STARDUST_CODES } from '@/data/gameData';

export function useRedeem(
  gameState: GameState,
  dispatch: React.Dispatch<{ type: 'FUNCTIONAL_UPDATE'; updater: (state: GameState) => GameState }>
) {
  const redeemCode = useCallback(
    (shipIndex: number, code: string): { success: boolean; message: string } => {
      const ship = gameState.ships[shipIndex];
      if (!ship) return { success: false, message: '舰队不存在' };

      // 金币兑换码 / 星尘兑换码（星尘为临时测试用）
      const goldReward = REDEEM_CODES[code];
      const stardustReward = REDEEM_STARDUST_CODES[code];
      if (goldReward === undefined && stardustReward === undefined) return { success: false, message: '无效的兑换码' };
      if (gameState.redeemedCodes.includes(code)) {
        return { success: false, message: '该兑换码已在本局游戏中使用过' };
      }

      dispatch({
        type: 'FUNCTIONAL_UPDATE',
        updater: (prev) => {
          const ships = [...prev.ships];
          const s = { ...ships[shipIndex] };
          if (goldReward !== undefined) {
            s.gold += goldReward;
            s.goldLog = [{ turn: prev.turn, amount: goldReward, reason: `兑换码兑换`, balanceAfter: s.gold }, ...s.goldLog].slice(0, 200);
            if (s.bankrupt && s.gold > 0) s.bankrupt = false;
          }
          if (stardustReward !== undefined) s.stardust += stardustReward;
          ships[shipIndex] = s;
          return { ...prev, ships, redeemedCodes: [...prev.redeemedCodes, code] };
        },
      });
      return {
        success: true,
        message: goldReward !== undefined ? `兑换成功！获得 ${goldReward} 金币` : `兑换成功！获得 ${stardustReward} 星尘`,
      };
    },
    [gameState.ships, gameState.redeemedCodes, dispatch]
  );

  return { redeemCode };
}
