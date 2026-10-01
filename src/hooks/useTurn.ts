import { useCallback } from 'react';
import type { GameState } from '@/types/game';
import { FACTIONS } from '@/data/factions';
import { processColonyTurn } from '@/lib/colony/colonyTurn';
import { computePriceFluctuation } from '@/lib/turn/priceFluctuation';
import { processShipTurn, getGameOverReason } from '@/lib/turn/shipTurn';
import { computeFactionTurn, applyPassiveIncome } from '@/lib/turn/factionTurn';
import { generateContracts } from '@/lib/turn/contracts';
import { getCurrentFactionId } from '@/lib/galaxy/access';
import { processArchaeologyTurn } from '@/lib/galaxy/archaeologyTurn';

/**
 * 回合推进 hook（编排器）。
 * 具体结算逻辑已按领域抽到 lib/turn/ 与 lib/colony/colonyTurn.ts，
 * 这里只保留 dispatch 编排和调用顺序。
 */
export function useTurn(
  _gameState: GameState,
  dispatch: React.Dispatch<
    { type: 'FUNCTIONAL_UPDATE'; updater: (state: GameState) => GameState }
  >,
  autoSave: () => void
) {
  // 价格波动 —— 四因子模型 + 情报兑现
  const fluctuatePrices = useCallback(() => {
    dispatch({ type: 'FUNCTIONAL_UPDATE', updater: computePriceFluctuation });
  }, [dispatch]);

  // 回合推进
  const nextTurn = useCallback(() => {
    dispatch({
      type: 'FUNCTIONAL_UPDATE',
      updater: (prev) => {
        const stocks = prev.stocks;
        const mats = prev.materials;
        const prods = prev.products;

        // 每艘母舰的回合推进（装置/食物/破产饥荒/生产/跃迁/投资/贷款）
        const ships = prev.ships.map((ship) => processShipTurn(ship, prev.turn, stocks, mats, prods));

        // 殖民地回合处理（先克隆 colony，避免共享引用原地 mutate 击穿 memo 面板的重渲染）
        const archaeologyLogs: string[] = [];
        ships.forEach((s) => {
          if (s.colony) s.colony = { ...s.colony };
          processColonyTurn(s, prev.turn + 1);
          // 考古推进（阶段倒计时、成功率判定、阶段完成/危险结算）
          archaeologyLogs.push(...processArchaeologyTurn(s));
          if (s.food >= 0 && s.famineTimer > 0 && !s.isRebellion) s.famineTimer = 0;
        });

        // 贸易政策 / 势力价格 / 市场库存需求 / buff 清理 / 星尘集市
        const currentFid = getCurrentFactionId(ships[0]) || FACTIONS[0].id;
        const market = computeFactionTurn(prev, currentFid);

        // 游戏结束检测
        const gameOverReason = getGameOverReason(ships[0]);
        if (gameOverReason) {
          return { ...prev, ships, phase: 'ended' as const, eventLog: [{ id: `${prev.turn}-gameover-${Date.now()}`, turn: prev.turn, event: '游戏结束', detail: gameOverReason }, ...prev.eventLog] };
        }

        // 合同生成
        const factionContracts = generateContracts(prev);

        // 被动收入结算
        applyPassiveIncome(prev, ships);

        return {
          ...prev,
          ships,
          turn: prev.turn + 1,
          factionRepLog: {},
          factionContracts,
          ...market,
          buyTriggered: {},
          sellTriggered: {},
          // 考古日志（每回合最多几条，挂到事件日志尾部）
          eventLog: archaeologyLogs.length > 0
            ? [...archaeologyLogs.map((detail, i) => ({ id: `${prev.turn}-arch-${i}-${Date.now()}`, turn: prev.turn, event: '考古', detail })), ...prev.eventLog]
            : prev.eventLog,
        };
      },
    });

    fluctuatePrices();
    setTimeout(() => autoSave(), 100);
  }, [dispatch, fluctuatePrices, autoSave]);

  return { nextTurn, fluctuatePrices };
}
