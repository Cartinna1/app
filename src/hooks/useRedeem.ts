import { useCallback } from 'react';
import type { GameState } from '@/types/game';
import { REDEEM_CODES } from '@/data/gameData';
import { pushGoldLog } from '@/lib/turn/goldLog';

export function useRedeem(
  gameState: GameState,
  dispatch: React.Dispatch<{ type: 'FUNCTIONAL_UPDATE'; updater: (state: GameState) => GameState }>
) {
  const redeemCode = useCallback(
    (shipIndex: number, code: string): { success: boolean; message: string } => {
      const ship = gameState.ships[shipIndex];
      if (!ship) return { success: false, message: '舰队不存在' };

      const goldReward = REDEEM_CODES[code];
      if (goldReward === undefined) return { success: false, message: '无效的兑换码' };
      if (gameState.redeemedCodes.includes(code)) {
        return { success: false, message: '该兑换码已在本局游戏中使用过' };
      }

      dispatch({
        type: 'FUNCTIONAL_UPDATE',
        updater: (prev) => {
          const ships = [...prev.ships];
          const s = { ...ships[shipIndex] };
          s.gold += goldReward;
          pushGoldLog(s, prev.turn, goldReward, `兑换码兑换`);
          if (s.bankrupt && s.gold > 0) s.bankrupt = false;
          ships[shipIndex] = s;
          return { ...prev, ships, redeemedCodes: [...prev.redeemedCodes, code] };
        },
      });
      return { success: true, message: `兑换成功！获得 ${goldReward} 金币` };
    },
    [gameState.ships, gameState.redeemedCodes, dispatch]
  );

  return { redeemCode };
}
