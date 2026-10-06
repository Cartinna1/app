import { useCallback } from 'react';
import type { GameAction, GameState } from '@/types/game';
import { FACTIONS } from '@/data/factions';
import { processColonyTurn } from '@/lib/colony/colonyTurn';
import { computePriceFluctuation } from '@/lib/turn/priceFluctuation';
import { processShipTurn, getGameOverReason } from '@/lib/turn/shipTurn';
import { computeFactionTurn, applyPassiveIncome } from '@/lib/turn/factionTurn';
import { generateContracts } from '@/lib/turn/contracts';
import { getCurrentFactionId } from '@/lib/galaxy/access';
import { processArchaeologyTurn } from '@/lib/galaxy/archaeologyTurn';
import { EVENT_LOG_LIMIT } from '@/data/gameData';
import { createUid } from '@/lib/id';
import { canEndGameTurn, readyExpedition } from '@/lib/battle/expedition';

/**
 * 回合推进 hook（编排器）。
 * 具体结算逻辑已按领域抽到 lib/turn/ 与 lib/colony/colonyTurn.ts，
 * 这里只保留 dispatch 编排和调用顺序。
 */
export function useTurn(
  _gameState: GameState,
  // dispatch 的类型只列本 hook 允许派发的 action（窄联合是一种设计守卫）。
  // 卡牌战斗的两个 action 用 Extract 从 GameAction 派生，避免把载荷类型再抄一份（AGENTS 第三节）。
  dispatch: React.Dispatch<
    | { type: 'FUNCTIONAL_UPDATE'; updater: (state: GameState) => GameState }
    | Extract<GameAction, { type: 'TICK_BATTLE_STATE' }>
    | Extract<GameAction, { type: 'START_BATTLE' }>
  >,
  autoSave: () => void
) {
  // 价格波动 —— 四因子模型 + 情报兑现
  const fluctuatePrices = useCallback(() => {
    dispatch({ type: 'FUNCTIONAL_UPDATE', updater: computePriceFluctuation });
  }, [dispatch]);

  // 回合推进
  const nextTurn = useCallback(() => {
    // ⚠ 战斗期间不允许结束游戏回合（V1.5 §〇「战斗中不能保存」、§1.1）。
    //   同步可判的拦截必须放在 dispatch **之前**（AGENTS 第九节），判据的唯一真值在
    //   lib/battle/expedition.canEndGameTurn（只判 state.battle；出征倒计时在途时仍可正常结束回合）。
    //   战斗页签同时占满整屏，所以这条守卫是兜底而不是玩家的常规路径。
    if (!canEndGameTurn(_gameState)) return;

    // 出征倒计时：每个游戏回合先 TICK 一次（出征 / 掠夺倒计时各减 1，下限 0），
    // 归零则本回合就开战 —— TICK_BATTLE_STATE 的注释把「归零即开战」的判定留给调用方。
    // ⚠ `_gameState` 是这次渲染的最新状态，也就是 **TICK 之前**的状态（dispatch 不同步回读），
    //   所以判定必须传 afterTick=true（等价于 turnsRemaining <= 1）；否则会 off-by-one：
    //   玩家要多点一次结束回合才开战，中间那回合界面还显示「还有 0 回合」。
    // 两次 dispatch 都排在本函数返回前，与 nextTurn 那条 FUNCTIONAL_UPDATE、fluctuatePrices
    // 同批处理，键互不重叠（TICK 写 expedition/raid，START_BATTLE 写 battle/raid）。
    dispatch({ type: 'TICK_BATTLE_STATE' });

    // 倒计时归零 → 自动开战（参战舰船 = 该舰队当前编制）。
    // seed 用 Date.now()：战斗**不进存档**（V1.5 §〇），读档会回到战斗前、可以重来，属既定口径。
    const ready = readyExpedition(_gameState, true);
    if (ready) {
      dispatch({
        type: 'START_BATTLE',
        bossId: ready.bossId,
        fleet: ready.fleet,
        kind: 'expedition',
        seed: Date.now(),
      });
    }

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
          return { ...prev, ships, phase: 'ended' as const, eventLog: [{ id: createUid('gameover'), turn: prev.turn, event: '游戏结束', detail: gameOverReason }, ...prev.eventLog].slice(0, EVENT_LOG_LIMIT) };
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
          // 考古日志（每回合最多几条，挂到事件日志尾部）；与 ADD_EVENT_LOG 共用同一上限
          eventLog: archaeologyLogs.length > 0
            ? [...archaeologyLogs.map((detail) => ({ id: createUid('arch'), turn: prev.turn, event: '考古', detail })), ...prev.eventLog].slice(0, EVENT_LOG_LIMIT)
            : prev.eventLog,
        };
      },
    });

    fluctuatePrices();
    setTimeout(() => autoSave(), 100);
  }, [dispatch, fluctuatePrices, autoSave]);

  return { nextTurn, fluctuatePrices };
}
