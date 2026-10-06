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
import { raidDefensePool, raidResolution, raidSquadCount, shouldStartRaid } from '@/lib/battle/raid';
import { advanceQueue, dockLevel } from '@/lib/battle/shipyard';
import { BATTLE_CARDS } from '@/data/battle/cards';

/** 造舰完工日志用的卡名（数据里找不到就退回 id，不抛） */
function shipBuildName(cardId: string): string {
  const card = BATTLE_CARDS[cardId];
  return card ? card.name : cardId;
}

/**
 * 回合推进 hook（编排器）。
 * 具体结算逻辑已按领域抽到 lib/turn/ 与 lib/colony/colonyTurn.ts，
 * 这里只保留 dispatch 编排和调用顺序。
 */
export function useTurn(
  _gameState: GameState,
  // dispatch 的类型只列本 hook 允许派发的 action（窄联合是一种设计守卫）。
  // 卡牌战斗 / 掠夺的 action 用 Extract 从 GameAction 派生，避免把载荷类型再抄一份（AGENTS 第三节）。
  dispatch: React.Dispatch<
    | { type: 'FUNCTIONAL_UPDATE'; updater: (state: GameState) => GameState }
    | Extract<GameAction, { type: 'TICK_BATTLE_STATE' }>
    | Extract<GameAction, { type: 'START_BATTLE' }>
    | Extract<GameAction, { type: 'START_RAID' }>
    | Extract<GameAction, { type: 'APPLY_RAID_LOOT' }>
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
    // 这些 dispatch 都排在本函数返回前，与 nextTurn 那条 FUNCTIONAL_UPDATE、fluctuatePrices
    // 同批处理，键互不重叠（TICK 写 expedition/raid，START_BATTLE 写 battle/raid，
    // START_RAID 写 raid，APPLY_RAID_LOOT 写 ships/raid/eventLog）——且都排在回合结算那条之前，
    // 故掠夺扣掉的资源会被本回合结算读到（而非被覆盖）。
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

    // ==================== 掠夺循环（V1.5 §10.2）：插在 TICK 与出征开战之后，回合结算之前 ====================
    // 顺序（TICK 已在上方，战斗守卫是 nextTurn 开头那条 canEndGameTurn）：
    //   ① 战斗进行中 → 什么都不做（canEndGameTurn 已挡住整个结束回合）
    //   ② 出征倒计时归零 → 开战（上方，已有）
    //   ③ 掠夺倒计时归零 → raidResolution：有防守舰队开防守战 / 没有防守则掠夺成功
    //   ④ 本回合开始新的掠夺掷骰（仅当 shouldStartRaid 的四个条件都满足）
    // ⚠ 与出征同时归零时：两次 START_BATTLE 排在同一批里，**后派发的（防守战）胜出**，
    //   出征倒计时停在 0 不清空 → 那场防守战打完后的下一回合由 readyExpedition 再开。这是有意的：
    //   殖民地被打时先守家（§10.1：出征舰队在外，只能靠留守舰队接战）。
    const raidNow = raidResolution(_gameState, true);
    if (raidNow === 'defense') {
      // 参战编制 = 所有带防守标签舰队的合并池（唯一真值 lib/battle/raid.raidDefensePool）
      dispatch({
        type: 'START_BATTLE',
        bossId: 'raid',
        fleet: raidDefensePool(_gameState),
        kind: 'defense',
        seed: Date.now(),
      });
    } else if (raidNow === 'looted') {
      // 没有防守舰队 → 掠夺成功，直接结算资源损失（实扣值在 reducer 里按 raidLootLoss 走 resourceCost）
      dispatch({ type: 'APPLY_RAID_LOOT' });
    } else {
      // 本回合掷一次骰：**只有满足"卡库战舰 ≥10 艘 + 已建立殖民地 + 没有在途掠夺 + 不在免疫期"
      // 才可能命中**（四个条件全在 lib/battle/raid.shouldStartRaid 里判，勿在这里重写）。
      // ⚠ 没有殖民地时永远不掷：V1.5 §10.2"掠夺以存在殖民地为前提"（用户已确认）。
      const roll = Math.random();
      if (shouldStartRaid(roll, _gameState)) {
        // "1-2 支"按 50/50 掷（§10.2）；命中后登记 RAID_WARNING_TURNS 回合后到场
        dispatch({ type: 'START_RAID', raiders: raidSquadCount(Math.random()) });
      }
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

        // ==================== 造船队列推进（V1.5 §8.3；插在殖民地推进之后、市场结算之前）====================
        // 位置为什么在这里：船坞本身是殖民地建筑（processColonyTurn 在上面刚推进完它的建造进度），
        // 而 `dockLevel` 只认**已建成**的船坞 —— 放在它后面才能吃到"本回合刚建成船坞"这一个状态。
        // 用结算后的 ships（不是 prev）算等级，保证与面板显示同源。
        const afterColony: GameState = { ...prev, ships };
        const shipyardResult = advanceQueue(afterColony.buildQueue, dockLevel(afterColony));
        // 完工的卡进 `cardLibrary` —— 卡库才是"玩家拥有什么"的唯一真值（不另存"已造列表"）。
        const cardLibrary = shipyardResult.completed.length > 0
          ? [...afterColony.cardLibrary, ...shipyardResult.completed]
          : afterColony.cardLibrary;

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
          // 造船队列（本回合推进后的队列 + 完工入库的卡库）
          buildQueue: shipyardResult.queue,
          cardLibrary,
          // 考古日志 + 造舰完工日志（每回合最多几条，挂到事件日志尾部）；与 ADD_EVENT_LOG 共用同一上限
          eventLog: (archaeologyLogs.length > 0 || shipyardResult.completed.length > 0)
            ? [
                ...shipyardResult.completed.map((cardId) => ({
                  id: createUid('build'),
                  turn: prev.turn,
                  event: '造舰完工',
                  detail: `战舰「${shipBuildName(cardId)}」建造完成，已进入卡库`,
                })),
                ...archaeologyLogs.map((detail) => ({ id: createUid('arch'), turn: prev.turn, event: '考古', detail })),
                ...prev.eventLog,
              ].slice(0, EVENT_LOG_LIMIT)
            : prev.eventLog,
        };
      },
    });

    fluctuatePrices();
    setTimeout(() => autoSave(), 100);
  }, [dispatch, fluctuatePrices, autoSave]);

  return { nextTurn, fluctuatePrices };
}
