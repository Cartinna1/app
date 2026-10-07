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
import { canEndGameTurn, readyExpedition, tickExpedition } from '@/lib/battle/expedition';
import { raidResolution, raidSquadCount, shouldStartRaid, tickRaid } from '@/lib/battle/raid';
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
    | Extract<GameAction, { type: 'ARRIVE_RAID' }>
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
    //   所以判定必须读"本次 TICK 之后"的状态。**做法是先投影、再判**（把 TICK 用到的两个纯函数
    //   tickExpedition / tickRaid 各跑一次），而不是传一个 afterTick=true 让判据去"猜一位"：
    //   猜一位等于把"这一帧该不该开战"押在「TICK 与 START_BATTLE 必须同批、且真的被派发」上 ——
    //   批边界一旦落在两者之间，状态就会停在 turnsRemaining: 0 而这一帧既不开战、界面也没有开战
    //   入口（用户 2026-08 报的出征卡死；掠夺那条 P7 已用同一套写法修过，这里补齐出征）。
    //   先投影后判之后，判定与最终落库的状态**逐值同源**，不存在 off-by-one 的窗口。
    // 这些 dispatch 都排在本函数返回前，与 nextTurn 那条 FUNCTIONAL_UPDATE、fluctuatePrices
    // 同批处理，且都排在回合结算那条之前 —— 故掠夺扣掉的资源会被本回合结算读到（而非被覆盖）。
    // 同批的 action 各写各的键：TICK 写 expedition/raid；START_BATTLE（出征）写 battle；
    // START_RAID / ARRIVE_RAID 写 raid；APPLY_RAID_LOOT 写 ships/raid/eventLog。
    // ⚠ 掠夺**不再**在归零时派发 START_BATTLE（旧口径已作废）：它只转段或结算损失。
    dispatch({ type: 'TICK_BATTLE_STATE' });

    // 「本次 TICK 之后」的状态投影（与 reducer 的 TICK_BATTLE_STATE **同一份算式**，各跑一次纯函数）
    const afterTick: GameState = {
      ..._gameState,
      expedition: tickExpedition(_gameState.expedition),
      raid: tickRaid(_gameState.raid),
    };

    // 倒计时归零 → 自动开战（参战舰船 = 该舰队当前编制）。
    // seed 用 Date.now()：战斗**不进存档**（V1.5 §〇），读档会回到战斗前、可以重来，属既定口径。
    const ready = readyExpedition(afterTick);
    if (ready) {
      dispatch({
        type: 'START_BATTLE',
        bossId: ready.bossId,
        fleet: ready.fleet,
        kind: 'expedition',
        seed: Date.now(),
      });
    }

    // ==================== 掠夺循环（V1.5 §10.2，两段窗口）====================
    // 顺序（TICK 已在上方，战斗守卫是 nextTurn 开头那条 canEndGameTurn）：
    //   ① 战斗进行中 → 什么都不做（canEndGameTurn 已挡住整个结束回合）
    //   ② 出征倒计时归零 → 自动开战（上方，已有：这是**自动**的那条路）
    //   ③ 掠夺阶段 A 倒计时归零 → **转入阶段 B**（arrived：海盗抵达、停在战斗页签等玩家点「开战」）
    //   ④ 掠夺阶段 B 倒计时归零（玩家一直没迎战）→ **自动失败 = 掠夺成功**（扣资源 + 20 回合免疫）
    //   ⑤ 本回合开始新的掠夺掷骰（仅当 shouldStartRaid 的四个条件都满足）
    // ⚠ **掠夺不自动作战**（用户 2026-08 裁定）：唯一由玩家点开的战斗入口是战斗页签的
    //   「开战」（那里 dispatch START_RAID_BATTLE），本 hook 只在阶段 B 超时后结算掠夺成功。
    // ⚠ 与出征同时归零时：TICK 与 START_BATTLE（出征）排在同一批里 —— 出征照旧自动开战；
    //   掠夺只转入阶段 B，等这场仗打完再让玩家决定要不要打掠夺（守家顺序不受影响）。
    // ⚠ **掠夺的判定要读"本次 TICK 之后"的掠夺状态**（唯一真值 tickRaid，与 reducer 的
    //   TICK_BATTLE_STATE 同一份算式，投影见上方 afterTick）。为什么不像旧出征那样传
    //   afterTick=true 让 raidResolution 去猜"减 1 之后会不会归零"：那种"读 TICK 前的状态 + 前瞻一位"
    //   的写法，把转段的正确性押在了"这次 ARRIVE_RAID 必须与 TICK 同批、且必须真的被派发"上 ——
    //   批边界一旦落在两者之间，状态就会停在 inTurns: 0 而永远不进阶段 B（界面卡在"还有 0 回合抵达"
    //   且没有开战按钮）。先把 tick 投影出来再判，判定与最终落库的状态就**逐值同源**。
    //   （出征那条 P5 的 off-by-one 已用完全相同的写法修掉，见上方 readyExpedition(afterTick)。）
    const raidNow = raidResolution(afterTick);
    if (raidNow === 'arrived') {
      // 阶段 A → 阶段 B（登记"已抵达 + 再 N 回合不迎战就自动失败"）
      dispatch({ type: 'ARRIVE_RAID' });
    } else if (raidNow === 'looted') {
      // 阶段 B 超时仍未迎战 → 掠夺成功，直接结算资源损失（实扣值在 reducer 里按 raidLootLoss 走 resourceCost）
      dispatch({ type: 'APPLY_RAID_LOOT' });
    } else {
      // 本回合掷一次骰：**只有满足"卡库战舰 ≥10 艘 + 已建立殖民地 + 没有在途掠夺（阶段 A/B 都没有）
      // + 不在免疫期"才可能命中**（四个条件全在 lib/battle/raid.shouldStartRaid 里判，勿在这里重写）。
      // ⚠ 没有殖民地时永远不掷：V1.5 §10.2"掠夺以存在殖民地为前提"（用户已确认）。
      const roll = Math.random();
      if (shouldStartRaid(roll, _gameState)) {
        // "1-2 支"按 50/50 掷（§10.2）；命中后登记 RAID_WARNING_TURNS 回合的预警（阶段 A）
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
