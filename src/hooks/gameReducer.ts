import type { GameState, GameAction, Mothership } from '@/types/game';
import type { BattleAction, BattleFleet, BattleState, ShipCardId } from '@/types/battle';
import { FACTIONS, POLICY_EFFECTS, refreshFactionPrices, calculateSellMultipliers } from '@/data/factions';
import { createMotherships, createStocks, createMaterials, createProducts, EVENT_LOG_LIMIT } from '@/data/gameData';
import { BLACK_MARKET_DEFAULT } from '@/data/exchangeRates';
import { rollMarketBuyStock, rollMarketSellDemand } from '@/lib/turn/factionTurn';
import { createUid } from '@/lib/id';
import { migrateSave } from '@/lib/save';
import { getCurrentFactionId } from '@/lib/galaxy/access';
import { createBattle, cloneBattleState, deploy, attack, endTurn, resolvePending, aiTurn } from '@/lib/battle/engine';
import { grantBattleRewards, grantRaidReward, rollRaidReward } from '@/lib/battle/rewards';
import type { RaidReward } from '@/lib/battle/rewards';
import {
  RAID_IMMUNE_TURNS,
  RAID_WARNING_TURNS,
  raidBattleFleet,
  raidDefensePool,
  raidLootLoss,
  raidLootText,
  tickRaid,
} from '@/lib/battle/raid';
import { flattenCost, payCost } from '@/lib/turn/resourceCost';
import { pushGoldLog } from '@/lib/turn/goldLog';
import { canAddShip, canDeleteFleet, canRemoveShip, canToggleDefending, isFleetOnExpedition } from '@/lib/battle/hangar';
import { buildRefund, buildCost, canCancelBuild, canEnqueue, enqueueBuild } from '@/lib/battle/shipyard';

// ==================== 初始状态（单一真值：新开局/重置/选船共用，勿另抄一份） ====================

export function createInitialGameState(): GameState {
  return {
    phase: 'select',
    turn: 1,
    currentShipIndex: 0,
    ships: [],
    stocks: [],
    materials: [],
    products: [],
    eventLog: [],
    redeemedCodes: [],
    factions: FACTIONS,
    factionPrices: {},
    factionSellMultipliers: {},
    blackMarketMultiplier: BLACK_MARKET_DEFAULT,
    buyStocks: {},
    buyStockMax: {},
    sellDemands: {},
    sellDemandMax: {},
    buyTriggered: {},
    sellTriggered: {},
    buyBuffs: {},
    sellBuffs: {},
    factionPolicy: { type: 'normal', effect: POLICY_EFFECTS['normal'] },
    policyRemainingTurns: 0,
    stardustMarket: { currentRelicId: null, soldRelicIds: [] },
    gameWon: false,
    wonWonderName: '',
    factionReputation: {},
    factionRepLog: {},
    factionContracts: [],
    // ===== 舰船卡牌战斗（V1.5 §10.1 机库/编队/防守标签/出征、§10.2 掠夺）=====
    // ⚠ 这 5 个初值必须与 lib/save.ts 的 stateFromSave 默认值**逐一一致**（尤其 battle: null）；
    //    卡库初始为空、**不赠送战舰**（战舰只能靠船坞建造，V1.5 §8）。
    cardLibrary: [],
    fleets: [],
    expedition: null,
    raid: { inTurns: null, immuneTurns: 0, raiders: 0 },
    battle: null,
    // 船坞与科技（V1.5 §8.2 / §8.3）：造船队列初始为空。
    // ⚠ 这个初值必须与 lib/save.ts 的 stateFromSave 兜底**逐一一致**（都是 []）。
    buildQueue: [],
  };
}

// ==================== 卡牌战斗（V1.5 §10）：工具 ====================

/** 「卡库里有几份这张卡」与「所有舰队一共编入了几份」的唯一实现都在 lib/battle/hangar.ts
 *  （reducer 的编成守卫 canAddShip / canRemoveShip 与机库 UI 共用同一份判定），这里不再种第二份拷贝。 */

/** 只替换目标舰队的编成：其余舰队原样返回，被改的那支新建对象（不 mutate prev） */
function withFleetShipIds(fleets: BattleFleet[], fleetId: string, shipIds: ShipCardId[]): BattleFleet[] {
  return fleets.map((f) => (f.id === fleetId ? { ...f, shipIds } : f));
}

/**
 * 把永久损失的舰从卡库与所有舰队移除（返回新数组，不改传入的数组/对象）。
 * 引擎的 `lost` 是**按艘**的列表：同型舰被击毁几艘就出现几次，故这里一次只移除**一份**
 * （卡库移除一份、舰队里也移除一份）——同型多艘时"损失几艘就少几艘"。
 * 未被击毁的舰一律留在卡库与舰队里（V1.5 §1.1 / §11 第 6 条：全数带回）。
 */
function removeLostShips(
  cardLibrary: ShipCardId[],
  fleets: BattleFleet[],
  lost: ShipCardId[],
): { cardLibrary: ShipCardId[]; fleets: BattleFleet[] } {
  const lib = cardLibrary.slice();
  const next = fleets.map((f) => ({ ...f, shipIds: f.shipIds.slice() }));
  for (const id of lost) {
    const li = lib.indexOf(id);
    if (li >= 0) lib.splice(li, 1);
    for (const f of next) {
      const fi = f.shipIds.indexOf(id);
      if (fi >= 0) { f.shipIds.splice(fi, 1); break; }
    }
  }
  return { cardLibrary: lib, fleets: next };
}

/** 把玩家的一个战斗动作应用到场上的战斗。
 *  ⚠ 引擎函数**全是原地修改**传入的 state，故调用方（BATTLE_ACTION）必须先 cloneBattleState 再调用。 */
function applyBattleAction(battle: BattleState, action: BattleAction): void {
  switch (action.type) {
    case 'deploy': deploy(battle, 'player', action.cardId, action.slot); break;
    case 'attack': attack(battle, action.attacker, action.target); break;
    case 'endTurn': endTurn(battle); break;
    case 'resolvePending': resolvePending(battle, action.unitId); break;
    // 自动战斗：让 AI 替**当前行动方**打一个完整回合（未结束则内部会 endTurn）；
    // DEMO 的「一键打完」= 循环调用它直到 over（见 P4 的战斗界面）。定位是临时功能，勿让存档/其它系统依赖。
    case 'autoTurn': aiTurn(battle, battle.active); break;
  }
}

// ==================== 掠夺循环（V1.5 §10.2）：写回工具 ====================
// ⚠ 判定与算式都在 lib/battle/raid.ts（唯一真值）；这里只负责"按结算结果写回状态"。

/**
 * 掠夺损失结算：**没有防守舰队（掠夺成功）** 与 **防守战打输** 走**同一条**路径
 * （§10.2 原话"防守战打输了 = 与'没有防守舰队'完全一样"）。
 * 返回新的 ships 与一条事件日志明细。
 * 扣减走 lib/turn/resourceCost 的 flattenCost + payCost（AGENTS 第三节：勿在 reducer 里自己写一份扣资源），
 * 实扣值（每项以当前持有量为上限）由 raid.ts 的 raidLootLoss 给（唯一真值）。
 */
function settleRaidLoot(state: GameState): { ships: Mothership[]; detail: string } {
  const lead = state.ships[0];
  if (!lead) return { ships: state.ships, detail: '' };
  const loss = raidLootLoss(state);
  const next: Mothership = { ...lead, materials: { ...(lead.materials || {}) } };
  payCost(next, lead.colony, flattenCost(loss));
  // 金币流水：**必须先改完金币再记账**（pushGoldLog 读当前金币当 balanceAfter，AGENTS 第十节）
  if (loss.gold > 0) pushGoldLog(next, state.turn, -loss.gold, '殖民地被掠夺');
  return { ships: [next, ...state.ships.slice(1)], detail: raidLootText(loss) };
}

/**
 * 掠夺胜利的随机奖励写回（§10.2「打败海盗后：随机获得星尘 / 原料 / 金币 / 某势力声望」）。
 * 金币 / 星尘 / 原料在 lib/battle/rewards.grantRaidReward（过 famineHalveGold 与 pushGoldLog）；
 * 声望是 GameState 字段（Mothership 上没有）→ 在这里写回，上限 ±100 与 useTrade.applyRepChange 同口径。
 */
function applyRaidReward(
  state: GameState,
  reward: RaidReward,
): { ships: Mothership[]; factionReputation: Record<string, number> } {
  const lead = state.ships[0];
  if (!lead) return { ships: state.ships, factionReputation: state.factionReputation };
  const rewarded = grantRaidReward(lead, reward, state.turn);
  const ships = rewarded !== lead ? [rewarded, ...state.ships.slice(1)] : state.ships;
  if (!reward.factionId || reward.reputation <= 0) return { ships, factionReputation: state.factionReputation };
  const factionId = reward.factionId;
  const current = state.factionReputation[factionId] || 0;
  const clamped = Math.max(-100, Math.min(100, current + reward.reputation));
  return { ships, factionReputation: { ...state.factionReputation, [factionId]: clamped } };
}

// ==================== Reducer ====================

export function gameReducer(state: GameState, action: GameAction): GameState {
  switch (action.type) {
    case 'SELECT_SHIP': {
      const allShips = createMotherships();
      const myShip = allShips.find((s) => s.id === action.shipId);
      if (!myShip) return state;
      const stocks = createStocks();
      const materials = createMaterials();
      const products = createProducts();
      // 初始化市场库存/需求（第1回合即可交易）
      // 区间与每回合刷新**共用同一套**（唯一真值：factionTurn.rollMarketBuyStock/rollMarketSellDemand）。
      // 历史上开局写的是 800~1200 / 900~1500、每回合是 500~800 / 500~700 两套区间（已确认为遗留）。
      const buyStocks: Record<string, number> = {};
      const buyStockMax: Record<string, number> = {};
      const sellDemands: Record<string, number> = {};
      const sellDemandMax: Record<string, number> = {};
      for (const f of FACTIONS) {
        const bs = rollMarketBuyStock();
        const sd = rollMarketSellDemand();
        buyStocks[f.id] = bs;
        buyStockMax[f.id] = bs;
        sellDemands[f.id] = sd;
        sellDemandMax[f.id] = sd;
      }
      return {
        ...createInitialGameState(),
        phase: 'playing',
        ships: [myShip],
        stocks,
        materials,
        products,
        factionPrices: refreshFactionPrices(),
        factionSellMultipliers: calculateSellMultipliers(
          getCurrentFactionId(myShip) || FACTIONS[0].id,
          { type: 'normal', effect: POLICY_EFFECTS['normal'] },
        ),
        buyStocks,
        buyStockMax,
        sellDemands,
        sellDemandMax,
      };
    }

    case 'FUNCTIONAL_UPDATE': {
      const newState = action.updater(state);
      return newState === state ? state : newState;
    }

    case 'LOAD_SAVE':
      // 旧存档兼容补丁集中在 lib/save.ts 的 migrateSave
      return migrateSave(action.state);

    case 'RESET_GAME':
      return createInitialGameState();

    case 'ADD_EVENT_LOG': {
      // 为每条日志注入稳定唯一 id（写入时统一生成），供列表渲染作 key，
      // 避免 eventLog 从头部 unshift 时用 index 作 key 导致的错位复用。
      const entry = action.entry.id
        ? action.entry
        : { ...action.entry, id: createUid('log') };
      return { ...state, eventLog: [entry, ...state.eventLog].slice(0, EVENT_LOG_LIMIT) };
    }

    // ==================== 舰船卡牌战斗（V1.5 §10） ====================
    // 约定：所有分支都不 mutate prev（嵌套对象一律展开新建）；校验不通过时**原样返回 state**。

    case 'CREATE_BATTLE_FLEET': {
      // 舰队数量不限；名字缺省按现有数量派生（舰队 1、舰队 2…，V1.5 §10.1）
      const name = action.name || `舰队 ${state.fleets.length + 1}`;
      const fleet: BattleFleet = { id: createUid('fleet'), name, shipIds: [], defending: false };
      return { ...state, fleets: [...state.fleets, fleet] };
    }

    case 'DELETE_BATTLE_FLEET':
      // 出征中的舰队不能删：删了会让这次出征指向一支不存在的舰队，倒计时停在 0 回合永不开战（P3 遗留的空档）。
      // 判定与机库 UI 的禁用提示共用同一个纯函数（lib/battle/hangar.canDeleteFleet），不在这里再写一份。
      if (!canDeleteFleet(state, action.fleetId).ok) return state;
      return { ...state, fleets: state.fleets.filter((f) => f.id !== action.fleetId) };

    case 'RENAME_BATTLE_FLEET':
      // 改名同属"编成/操作"：出征中的舰队不许动（判据同 canDeleteFleet = 出征中即 false）
      if (!canDeleteFleet(state, action.fleetId).ok) return state;
      return {
        ...state,
        fleets: state.fleets.map((f) => (f.id === action.fleetId ? { ...f, name: action.name } : f)),
      };

    case 'ADD_SHIP_TO_FLEET': {
      const { fleetId, shipId } = action;
      const fleet = state.fleets.find((f) => f.id === fleetId);
      if (!fleet) return state;
      // ① 出征中的舰队不能编成
      // ② 编入的**份数**不能超过卡库持有份数 —— 这一条同时精确表达了 §10.1「一艘战舰同一时间只能编入一个舰队」：
      //    卡库只有 1 份时，编进 A 队后再编 B 队会因"已编 1 ≥ 持有 1"被拒；卡库有 2 份时，则可以拆成"一队一份"
      //    （同型多艘本来就是常态，编制示例里 h1×2 / c1×2 都是）。
      //    早先还额外按"卡 id 跨舰队"整类查重，那会让同型 2 份永远无法拆到两队 —— 比 §10.1 更严，已去掉。
      // ③ 每队编制上限 30 艘（唯一数值来源 data/battle/tuning.ts 的 fleetSize）
      // 三条都走同一份纯函数（机库 UI 的禁用提示读的就是它），reducer 不重写判定。
      if (!canAddShip(state, fleetId, shipId).ok) return state;
      return { ...state, fleets: withFleetShipIds(state.fleets, fleetId, [...fleet.shipIds, shipId]) };
    }

    case 'REMOVE_SHIP_FROM_FLEET': {
      const fleet = state.fleets.find((f) => f.id === action.fleetId);
      if (!fleet) return state;
      // 出征中的舰队不能编成（卸下也算改编制）
      if (!canRemoveShip(state, action.fleetId, action.shipId).ok) return state;
      const idx = fleet.shipIds.indexOf(action.shipId);
      if (idx < 0) return state;
      const shipIds = fleet.shipIds.slice();
      shipIds.splice(idx, 1);   // 只卸一艘（同型多艘时按份数移除）
      return { ...state, fleets: withFleetShipIds(state.fleets, action.fleetId, shipIds) };
    }

    case 'TOGGLE_FLEET_DEFENDING': {
      const fleet = state.fleets.find((f) => f.id === action.fleetId);
      if (!fleet) return state;
      // 出征中的舰队在外头，不允许打防守标签（V1.5 §10.1）。
      // 反向由 START_EXPEDITION 挡住（带防守标签的舰队不能出征）——互斥规则两个方向都写。
      if (!canToggleDefending(state, action.fleetId).ok) return state;
      return {
        ...state,
        fleets: state.fleets.map((f) => (f.id === action.fleetId ? { ...f, defending: !f.defending } : f)),
      };
    }

    case 'START_EXPEDITION': {
      const { bossId, fleetId, turns } = action;
      if (state.expedition) return state;                       // 同时只能出征 1 个老巢（V1.5 §10.1）
      const fleet = state.fleets.find((f) => f.id === fleetId);
      if (!fleet) return state;
      if (fleet.defending) return state;                        // 带防守标签的舰队留守，不能出征
      // 出征舰队必须是"可编辑"的（= 不在出征中）：与机库 UI 的 canEdit 同一判据（lib/battle/hangar.isFleetOnExpedition）。
      // 互斥规则两个方向都要挡（AGENTS 第九节）：这一条挡"出征中的舰队再出征"，TOGGLE_FLEET_DEFENDING 挡"出征中打标签"。
      if (isFleetOnExpedition(state, fleetId)) return state;
      if (fleet.shipIds.length === 0) return state;             // 空舰队没有可出征的战舰
      return { ...state, expedition: { bossId, fleetId, turnsRemaining: turns } };
    }

    case 'CANCEL_EXPEDITION':
      return state.expedition ? { ...state, expedition: null } : state;

    case 'START_BATTLE': {
      // `createBattle` 的编制入参只支持内置的 'starter' / 'all'（见 types/battle.ts 的 CreateBattleOptions），
      // 而参战舰船由主游戏决定（出征 = 该舰队；防守 = 所有防守舰队的合并池）→ 建场后替换玩家侧卡池。
      // 除此之外（掷骰先后手 / 指挥度 / BOSS 与头目技能 / 日志）与 createBattle 逐字一致，引擎逻辑零改动。
      const created = createBattle({ seed: action.seed, bossId: action.bossId });
      const battle: BattleState = { ...created, player: { ...created.player, pool: action.fleet.slice() } };
      // 防守战（kind='defense'，目标恒为掠夺队 'raid'）开打即"掠夺已经到场"：把倒计时收掉
      // （END_BATTLE 还会再收一次，两处幂等）。出征战不动 raid 字段。
      const raid = action.kind === 'defense' ? { ...state.raid, inTurns: null } : state.raid;
      return { ...state, battle, raid };
    }

    case 'BATTLE_ACTION': {
      if (!state.battle) return state;
      // ⚠ 引擎是**原地修改**传入 state 的（deploy/attack/cleanup… 全是就地写），而 reducer 不许 mutate prev
      // → 必须先深拷贝一份再交给引擎（cloneBattleState 保留 rnd 原引用，随机数流不打断）。
      const battle = cloneBattleState(state.battle);
      applyBattleAction(battle, action.action);
      return { ...state, battle };
    }

    case 'END_BATTLE': {
      const battle = state.battle;
      if (!battle) return state;
      // 掠夺战（防守，敌方恒为 'raid' 海盗旗舰）与出征战（打老巢 b1~b5）的收尾**不一样**：
      //   · 出征战结束 → 这场出征结束（打赢可再次出征；输了未被击毁的舰带回），**不动掠夺状态**
      //   · 掠夺战结束 → 收掉掠夺倒计时并给免疫（打赢还给随机奖励），**不动在途的出征**
      //     （V1.5 §10.1：出征期间殖民地被掠夺，只能靠留守的防守舰队接战）
      const isRaid = battle.bossId === 'raid';
      const raidWin = isRaid && battle.winner === 'player';
      // 第一场的参战编制：**必须在移除永久损失之前**取 —— 2 支掠夺队连打第二场时用它筛出幸存舰
      const raidPoolBefore = raidWin ? raidDefensePool(state) : [];
      // 永久损失写回：**无论胜负**，被击毁的舰都从卡库与所有舰队一并移除；未被击毁的一律带回
      // （V1.5 §1.1 / §11 第 6 条）。
      const { cardLibrary, fleets } = removeLostShips(state.cardLibrary, state.fleets, battle.player.lost);
      const base: GameState = { ...state, cardLibrary, fleets };

      // ---------------- 掠夺战收尾（V1.5 §10.2） ----------------
      if (isRaid) {
        // 掠夺结束（打赢 / 打输 / 掠夺成功）：§10.2 之后 20 回合内不再被掠夺
        const raidOver = { ...state.raid, inTurns: null, raiders: 0, immuneTurns: RAID_IMMUNE_TURNS };

        // ① 2 支掠夺队 = **连续打两场**：赢下第一场后**立刻**进入第二场，第一场未被击毁的舰带进第二场。
        // ⚠ 本体"一条血，不重置"（§10.2）→ 第二场的玩家本体血量直接抄第一场结束时的
        //   `battle.player.body`，**绝不回满 15**；文档明说"1 号旗舰被打败就换 2 号旗舰、血量回满"
        //   的旧机制**已取消**，别实现它。
        // ⚠ seed 用 Date.now()：与 START_BATTLE 的口径一致（战斗不进存档，读档回到战斗前）。
        if (raidWin && state.raid.raiders > 1) {
          const nextFleet = raidBattleFleet(base, raidPoolBefore);
          if (nextFleet.length > 0) {
            const created = createBattle({ seed: Date.now(), bossId: 'raid' });
            const nextBattle: BattleState = {
              ...created,
              player: { ...created.player, pool: nextFleet, body: battle.player.body },
            };
            return {
              ...base,
              battle: nextBattle,
              raid: { ...state.raid, inTurns: null, raiders: state.raid.raiders - 1 },
            };
          }
        }

        // ② 掠夺损失：**防守战打输** 与 **没有防守舰队** 走同一条路（§10.2 原话"完全一样"）。
        //    还有一种同形的情形：第一场赢了、但幸存舰为 0（全灭在场上）→ 第二支掠夺队无人可挡，
        //    按"没有防守舰队"处理（不能因为赢了第一场就发奖励，那等于用空池白拿战利品）。
        const noDefenderLeft = raidWin && state.raid.raiders > 1;
        if (!raidWin || noDefenderLeft) {
          const { ships, detail } = settleRaidLoot(base);
          const prefix = noDefenderLeft ? '第一场打赢了，但没有幸存舰拦第二支掠夺队：' : '防守战失利，';
          return {
            ...base,
            ships,
            battle: null,
            raid: raidOver,
            eventLog: [
              { id: createUid('raid'), turn: state.turn, event: '殖民地被掠夺', detail: `${prefix}${detail}` },
              ...state.eventLog,
            ].slice(0, EVENT_LOG_LIMIT),
          };
        }

        // ③ 打赢（单支，或 2 支都打完）→ §10.2「打败海盗后：随机获得星尘 / 原料 / 金币 / 某势力声望」
        //    随机数由这里取（与 SELECT_SHIP 的 rollMarketBuyStock 同一口径：reducer 内取随机数）
        const lead = base.ships[0];
        if (!lead) return { ...base, battle: null, raid: raidOver };
        const reward = rollRaidReward(lead, Math.random(), Math.random());
        const { ships, factionReputation } = applyRaidReward(base, reward);
        return {
          ...base,
          ships,
          factionReputation,
          battle: null,
          raid: raidOver,
          eventLog: [
            { id: createUid('raid'), turn: state.turn, event: '击退海盗', detail: reward.text },
            ...state.eventLog,
          ].slice(0, EVENT_LOG_LIMIT),
        };
      }

      // ---------------- 出征战收尾（V1.5 §10.1） ----------------
      // 战利品：唯一真值 lib/battle/rewards.ts。出征战打赢老巢 → 金币 100000 + 星尘 40（V1.5 §〇 / §10.2）；
      // 金币过 famineHalveGold（饥荒减半）并按 AGENTS 第三节写 pushGoldLog（rewards 内部先改金币再记账）。
      // 掠夺战（bossId 'raid'）的随机奖励走上面那一段（rollRaidReward），battleRewards 对 raid 恒 0/0。
      // 打输一律无奖励（永久损失照上面的 removeLostShips 写回，仍按 P3 规则）。
      // 写回仓位的口径：**只影响首个母舰**（金币/星尘/流水都挂在 ships[0]，单舰队）；
      // 奖励为 0 时 ships 原样返回（不打了一场空仗也照样换对象）。
      const lead = state.ships[0];
      const rewarded = lead ? grantBattleRewards(lead, battle, state.turn) : null;
      const ships = rewarded && rewarded !== lead ? [rewarded, ...state.ships.slice(1)] : state.ships;
      return {
        ...base,
        ships,
        battle: null,
        expedition: null,
      };
    }

    case 'START_RAID': {
      // 掠夺触发（§10.2）：登记"RAID_WARNING_TURNS 回合后到场" + 本次来了几支掠夺队
      // （1-2 支按 50/50 掷，随机数由调用方 useTurn 取；判定在 lib/battle/raid.shouldStartRaid）。
      // 幂等：已有在途掠夺时原样返回，不覆盖正在走的倒计时。
      if (state.raid.inTurns !== null) return state;
      return { ...state, raid: { ...state.raid, inTurns: RAID_WARNING_TURNS, raiders: action.raiders } };
    }

    case 'APPLY_RAID_LOOT': {
      // 掠夺成功（倒计时归零且**没有防守舰队**）：结算资源损失并进入免疫期（§10.2）。
      // 损失 = 金币 + 原料 + 星尘，各项以当前持有量为上限（实扣值来自 raid.raidLootLoss，唯一真值）；
      // 与"防守战打输"共用 settleRaidLoot，两条路的损失口径必须完全一致（§10.2 原话）。
      const { ships, detail } = settleRaidLoot(state);
      return {
        ...state,
        ships,
        raid: { ...state.raid, inTurns: null, raiders: 0, immuneTurns: RAID_IMMUNE_TURNS },
        eventLog: [
          { id: createUid('raid'), turn: state.turn, event: '殖民地被掠夺', detail },
          ...state.eventLog,
        ].slice(0, EVENT_LOG_LIMIT),
      };
    }

    case 'TICK_BATTLE_STATE': {
      // 每个游戏回合调用一次（useTurn）：出征倒计时与掠夺倒计时各减 1，下限 0（到 0 就停在 0）。
      // 「归零即开战 / 归零即掠夺」的判定留给调用方：开战需要 seed / 参战舰队等只有调用方才知道的信息。
      // 掠夺那一段的算式是 lib/battle/raid.tickRaid（唯一真值：useTurn 判"本次 TICK 后是否归零"
      // 也读它，若在这里就地再写一遍会出现显示与结算分叉）。
      const expedition = state.expedition
        ? { ...state.expedition, turnsRemaining: Math.max(0, state.expedition.turnsRemaining - 1) }
        : null;
      return { ...state, expedition, raid: tickRaid(state.raid) };
    }

    // ==================== 船坞与造舰（V1.5 §8.2 / §8.3） ====================
    // ⚠ 队列推进（完工写进卡库）**不在这里**：由 useTurn 每回合调 advanceQueue 编排
    //   （与 colonyTurn / 考古推进同一个位置），故没有"完工"相关的 action。

    case 'ENQUEUE_BUILD': {
      const ship = state.ships[0];
      if (!ship) return state;
      // ① 门槛（船坞等级 / 科技 / 资源）的唯一真值 = lib/battle/shipyard.canEnqueue（内部即 canBuild）。
      //    ⚠ 队列长度**不在它里面**：§11 #5「排队无限」，同时建造数只限制"开工"（见 advanceQueue）。
      if (!canEnqueue(state, action.cardId).ok) return state;
      // ② 扣费走 lib/turn/resourceCost 那一套（clone 母舰 → payCost → pushGoldLog），
      //    **不在 reducer 里自己写扣资源**（AGENTS 第三节）。
      const next: Mothership = { ...ship, materials: { ...(ship.materials || {}) } };
      const cost = flattenCost(buildCost(action.cardId));
      payCost(next, ship.colony, cost);
      if (cost.gold) pushGoldLog(next, state.turn, -cost.gold, `建造战舰（${action.cardId}）`);
      // ③ 入队：同时建造位有空则直接开工，否则排队（enqueueBuild 决定，判定不在这里重算）
      const { queue } = enqueueBuild(state, state.buildQueue, action.cardId);
      return { ...state, ships: [next, ...state.ships.slice(1)], buildQueue: queue };
    }

    case 'CANCEL_BUILD': {
      // 取消**未开工**的排队项；已开工的一律挡（V1.5 §8 没有中途终止生产的规则）。
      // 判据的唯一真值是 lib/battle/shipyard.canCancelBuild（面板的禁用原因读的也是它）。
      if (!canCancelBuild(state.buildQueue, action.index).ok) return state;
      const item = state.buildQueue[action.index];
      const refund = buildRefund(item);
      const buildQueue = state.buildQueue.filter((_x, i) => i !== action.index);
      const ship = state.ships[0];
      if (!ship) return { ...state, buildQueue };
      // 返还按**实付成本**（item.cost）算：金币 ×0.4、合金与原料 ×0.7，与殖民地取消建造同口径
      const next: Mothership = { ...ship, materials: { ...(ship.materials || {}) } };
      for (const [matId, amount] of Object.entries(refund.materials)) {
        next.materials[matId] = (next.materials[matId] || 0) + amount;
      }
      next.alloy += refund.alloy;
      next.gold += refund.gold;
      // ⚠ pushGoldLog 必须在金币改完之后调（它读当前金币当 balanceAfter，AGENTS 第十节）
      if (refund.gold) pushGoldLog(next, state.turn, refund.gold, '取消造舰返还');
      return { ...state, ships: [next, ...state.ships.slice(1)], buildQueue };
    }

    default:
      return state;
  }
}
