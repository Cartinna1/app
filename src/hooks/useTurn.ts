import { useCallback, useRef } from 'react';
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
import { canEndGameTurn } from '@/lib/battle/expedition';
import { raidSquadCount, shouldStartRaid } from '@/lib/battle/raid';
import { advanceQueue, dockLevel } from '@/lib/battle/shipyard';
import { BATTLE_CARDS } from '@/data/battle/cards';
import { planBattleTurn } from './battleTurnPlan';

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
  gameState: GameState,
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

  // ⚠ 读状态一律走这个 ref（每次渲染刷新）：**这是本次故障的结构性修复**。
  //   2026-08 用户报"回合数字在加，出征/掠夺的倒计时却冻在『还有 1 回合抵达』、永远没有战斗"：
  //   `nextTurn` 是 `useCallback`，而它的依赖 `[dispatch, fluctuatePrices, autoSave]` 三个引用都稳定
  //   （dispatch 来自 useReducer；autoSave/fluctuatePrices 都是 `useCallback([dispatch])`），
  //   于是 useCallback 永不重建 —— 闭包里读到的**永远是首帧状态**（createInitialGameState：
  //   `expedition: null` / `cardLibrary: []`）：
  //     · `readyExpedition(投影)` 恒为 null → 出征倒计时归零那一回合**永远不开战**；
  //     · `shouldStartRaid(roll, …)` 恒为 false → **掠夺循环一次都没触发过**（同一根因的另一半）。
  //   而 `TICK_BATTLE_STATE` 本身不读状态、照常派发 → 倒计时照样减到 0 并停在那里（界面下限显示成 1），
  //   症状正是"回合在走、倒计时不动、战斗不出现"。
  //   用 ref 之后"读到最新状态"是**结构性保证**（AGENTS 第五节 useStableActions 同一套做法），
  //   不再依赖后人记得维护依赖数组；依赖数组里也保留 `gameState`，把"本函数依赖当前状态"写成显式契约。
  const stateRef = useRef(gameState);
  stateRef.current = gameState;

  // 回合推进
  const nextTurn = useCallback(() => {
    // ⚠ 本次调用用的状态 = 调用那一刻的最新状态（不是这次 useCallback 创建时的状态）。
    const cur = stateRef.current;
    if (!canEndGameTurn(cur)) return;

    // 出征倒计时：每个游戏回合先 TICK 一次（出征 / 掠夺倒计时各减 1，下限 0），
    // 归零则本回合就开战 —— TICK_BATTLE_STATE 的注释把「归零即开战」的判定留给调用方。
    // ⚠ `cur` 是调用那一刻的最新状态，也就是 **TICK 之前**的状态（dispatch 不同步回读），
    //   所以判定必须读"本次 TICK 之后"的状态。**做法是先投影、再判**，而不是传一个 afterTick=true
    //   让判据去"猜一位"：猜一位等于把"这一帧该不该开战"押在「TICK 与 START_BATTLE 必须同批、
    //   且真的被派发」上 —— 批边界一旦落在两者之间，状态就会停在 turnsRemaining: 0 而这一帧既不开战、
    //   界面也没有开战入口（P5 踩过）。先投影后判之后，判定与最终落库的状态**逐值同源**。
    // 这一整套判定抽成了 `battleTurnPlan.planBattleTurn`（纯函数、不吃随机数），
    // 好处是 check-battle-expedition.cjs 能用**真实 reducer** 原样回放这几次派发 —— 本函数只执行计划。
    // 这些 dispatch 都排在本函数返回前，与那条 FUNCTIONAL_UPDATE、fluctuatePrices
    // 同批处理，且都排在回合结算那条之前 —— 故掠夺扣掉的资源会被本回合结算读到（而非被覆盖）。
    // 同批的 action 各写各的键：TICK 写 expedition/raid；START_BATTLE（出征）写 battle；
    // START_RAID / ARRIVE_RAID 写 raid；APPLY_RAID_LOOT 写 ships/raid/eventLog。
    // ⚠ 掠夺**不再**在归零时派发 START_BATTLE（旧口径已作废）：它只转段或结算损失。
    dispatch({ type: 'TICK_BATTLE_STATE' });

    // 「本次 TICK 之后」该做什么（唯一真值 hooks/battleTurnPlan.planBattleTurn：
    //  出征自动开战 + 掠夺转段/结算，判定顺序与下面的派发顺序一一对应）
    const plan = planBattleTurn(cur);

    // 倒计时归零 → 自动开战（参战舰船 = 该舰队当前编制）。
    // seed 用 Date.now()：战斗**不进存档**（V1.5 §〇），读档会回到战斗前、可以重来，属既定口径。
    if (plan.startBattle) {
      dispatch({
        type: 'START_BATTLE',
        bossId: plan.startBattle.bossId,
        fleet: plan.startBattle.fleet,
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
    // ⚠ 转段的判据只看状态本身（`planBattleTurn` 内先投影 tickRaid、再 raidResolution），
    //   与"这次 ARRIVE_RAID 是否与 TICK 同批、是否真的被派发"无关 —— 读 TICK 前的状态再"猜一位"
    //   会让状态停在 inTurns: 0 而永远不进阶段 B（P7 踩过）。
    if (plan.raidStep === 'arrived') {
      // 阶段 A → 阶段 B（登记"已抵达 + 再 N 回合不迎战就自动失败"）
      dispatch({ type: 'ARRIVE_RAID' });
    } else if (plan.raidStep === 'looted') {
      // 阶段 B 超时仍未迎战 → 掠夺成功，直接结算资源损失（实扣值在 reducer 里按 raidLootLoss 走 resourceCost）
      dispatch({ type: 'APPLY_RAID_LOOT' });
    } else {
      // 本回合掷一次骰：**只有满足"卡库战舰 ≥10 艘 + 已建立殖民地 + 没有在途掠夺（阶段 A/B 都没有）
      // + 不在免疫期"才可能命中**（四个条件全在 lib/battle/raid.shouldStartRaid 里判，勿在这里重写）。
      // ⚠ 没有殖民地时永远不掷：V1.5 §10.2"掠夺以存在殖民地为前提"（用户已确认）。
      // ⚠ 这里传的必须是**当前状态 cur**：曾因闭包陈旧而恒传首帧状态（cardLibrary 为空）
      //   → `shouldStartRaid` 永远是 false，整条掠夺循环一次都没触发过（与出征不开战同一根因）。
      const roll = Math.random();
      if (shouldStartRaid(roll, cur)) {
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
    // ⚠ 依赖里同时保留 `gameState`：真正保证"读到最新状态"的是上面的 `stateRef`（结构性），
    //   而这一项把"本函数依赖当前状态"写成**显式契约** —— 万一有人把某处改回直接读参数，
    //   少了它就会重演 2026-08 那次"闭包停在首帧、倒计时归零却永不推进"的静默故障。
    //   本函数每次渲染都会重建，但对外暴露的引用仍由 useGameState 的 useStableActions 收敛成稳定引用，
    //   不会击穿面板组件的 React.memo（AGENTS 第五节）。
  }, [dispatch, fluctuatePrices, autoSave, gameState]);

  return { nextTurn, fluctuatePrices };
}
