import type { GameState, GameAction } from '@/types/game';
import type { BattleAction, BattleFleet, BattleState, ShipCardId } from '@/types/battle';
import { FACTIONS, POLICY_EFFECTS, refreshFactionPrices, calculateSellMultipliers } from '@/data/factions';
import { createMotherships, createStocks, createMaterials, createProducts, EVENT_LOG_LIMIT } from '@/data/gameData';
import { BLACK_MARKET_DEFAULT } from '@/data/exchangeRates';
import { BATTLE_TUNING } from '@/data/battle/tuning';
import { rollMarketBuyStock, rollMarketSellDemand } from '@/lib/turn/factionTurn';
import { createUid } from '@/lib/id';
import { migrateSave } from '@/lib/save';
import { getCurrentFactionId } from '@/lib/galaxy/access';
import { createBattle, cloneBattleState, deploy, attack, endTurn, resolvePending, aiTurn } from '@/lib/battle/engine';
import { grantBattleRewards } from '@/lib/battle/rewards';
import { FLEET_STARTER } from '@/data/battle/fleets';

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
  };
}

// ==================== 卡牌战斗（V1.5 §10）：工具 ====================

/** 掠夺打赢后的免疫回合数（V1.5 §10.2：打败海盗后 20 回合内不再被掠夺）。
 *  战斗数值锚点统一在 data/battle/tuning.ts，但该文件由脚本导出（勿手改），
 *  故这条**主游戏侧的冷却**放在这里（后续接入掠夺循环时从这里取，勿另写 20）。 */
const RAID_IMMUNE_TURNS = 20;

/** 卡库里有几份这张卡（卡库可含同型多艘，故一律按**份数**比较，不按"存在与否"） */
function countInCardLibrary(cardLibrary: ShipCardId[], shipId: ShipCardId): number {
  return cardLibrary.filter((id) => id === shipId).length;
}

/** 所有舰队一共编入了几份这张卡（用于校验"编入的份数不能超过卡库持有份数"） */
function countInFleets(fleets: BattleFleet[], shipId: ShipCardId): number {
  return fleets.reduce((n, f) => n + f.shipIds.filter((id) => id === shipId).length, 0);
}

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
      return { ...state, fleets: state.fleets.filter((f) => f.id !== action.fleetId) };

    case 'RENAME_BATTLE_FLEET':
      return {
        ...state,
        fleets: state.fleets.map((f) => (f.id === action.fleetId ? { ...f, name: action.name } : f)),
      };

    case 'ADD_SHIP_TO_FLEET': {
      const { fleetId, shipId } = action;
      const fleet = state.fleets.find((f) => f.id === fleetId);
      if (!fleet) return state;
      // ① 编入的**份数**不能超过卡库持有份数。这一条同时精确表达了 §10.1「一艘战舰同一时间只能编入一个舰队」：
      //    卡库只有 1 份时，编进 A 队后再编 B 队会因"已编 1 ≥ 持有 1"被拒；卡库有 2 份时，则可以拆成"一队一份"
      //    （同型多艘本来就是常态，编制示例里 h1×2 / c1×2 都是）。
      //    早先还额外按"卡 id 跨舰队"整类查重，那会让同型 2 份永远无法拆到两队 —— 比 §10.1 更严，已去掉。
      if (countInCardLibrary(state.cardLibrary, shipId) <= countInFleets(state.fleets, shipId)) return state;
      // ② 每队编制上限 30 艘（唯一数值来源 data/battle/tuning.ts 的 fleetSize）
      if (fleet.shipIds.length >= BATTLE_TUNING.fleetSize) return state;
      return { ...state, fleets: withFleetShipIds(state.fleets, fleetId, [...fleet.shipIds, shipId]) };
    }

    case 'REMOVE_SHIP_FROM_FLEET': {
      const fleet = state.fleets.find((f) => f.id === action.fleetId);
      if (!fleet) return state;
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
      if (state.expedition && state.expedition.fleetId === action.fleetId) return state;
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
      //   · 掠夺战结束 → 收掉掠夺倒计时并给免疫，**不动在途的出征**
      //     （V1.5 §10.1：出征期间殖民地被掠夺，只能靠留守的防守舰队接战）
      const isRaid = battle.bossId === 'raid';
      // 永久损失写回：**无论胜负**，被击毁的舰都从卡库与所有舰队一并移除；未被击毁的一律带回
      // （V1.5 §1.1 / §11 第 6 条）。
      const { cardLibrary, fleets } = removeLostShips(state.cardLibrary, state.fleets, battle.player.lost);
      // 战利品（**P5 落地**）：唯一真值 lib/battle/rewards.ts。
      //   · 出征战打赢老巢 → 金币 100000 + 星尘 40（V1.5 §〇 / §10.2）；金币过 famineHalveGold（饥荒减半）
      //     并按 AGENTS 第三节写 pushGoldLog（rewards 内部先改金币再记账）。
      //   · 掠夺战（bossId 'raid'）本阶段不发奖励 —— §10.2 的随机奖励属 P7，接入点在 rewards.battleRewards。
      //   · 打输一律无奖励（永久损失照上面的 removeLostShips 写回，仍按 P3 规则）。
      // 写回仓位的口径：**只影响首个母舰**（金币/星尘/流水都挂在 ships[0]，单舰队）；
      // 奖励为 0 时 ships 原样返回（不打了一场空仗也照样换对象）。
      const lead = state.ships[0];
      const rewarded = lead ? grantBattleRewards(lead, battle, state.turn) : null;
      const ships = rewarded && rewarded !== lead ? [rewarded, ...state.ships.slice(1)] : state.ships;
      return {
        ...state,
        ships,
        cardLibrary,
        fleets,
        battle: null,
        expedition: isRaid ? state.expedition : null,
        // §10.2：掠夺结束（无论打赢还是打输）之后 20 回合内不再被掠夺；
        // 而"没防守、5 回合后被掠夺成功"那条路（不进战斗）的免疫由 P7 的掠夺循环负责。
        raid: isRaid
          ? { ...state.raid, inTurns: null, immuneTurns: RAID_IMMUNE_TURNS }
          : state.raid,
      };
    }

    case 'TICK_BATTLE_STATE': {
      // 每个游戏回合调用一次（useTurn）：出征倒计时与掠夺倒计时各减 1，下限 0（到 0 就停在 0）。
      // 「归零即开战」的判定留给调用方：开战需要 seed / 参战舰队等只有调用方才知道的信息。
      const expedition = state.expedition
        ? { ...state.expedition, turnsRemaining: Math.max(0, state.expedition.turnsRemaining - 1) }
        : null;
      const raid = {
        ...state.raid,
        immuneTurns: Math.max(0, state.raid.immuneTurns - 1),
        inTurns: state.raid.inTurns === null ? null : Math.max(0, state.raid.inTurns - 1),
      };
      return { ...state, expedition, raid };
    }

    case 'DEBUG_FILL_SAMPLE_LIBRARY': {
      // ⚠ P4 临时调试入口（P8 船坞上线后**连同 types/game.ts 的这个 action 一起删除**）：
      // 卡库初始为空（战舰只能靠船坞建造，V1.5 §8），而船坞是 P8 —— 没有这条就没法试玩战斗。
      // 语义：把 FLEET_STARTER（26 艘）填成「已经编好队」的样子 —— **先满足各舰队已有的编制，
      // 剩下的进卡库**。这样 ADD_SHIP_TO_FLEET 的「编入份数 ≤ 卡库持有份数」不会被误拦
      // （例：某队已编 10 艘但卡库只有 10 艘，再补 16 艘进卡库才能把剩下 16 艘编进去）。
        const need: Record<string, number> = {};
        for (const f of state.fleets) for (const id of f.shipIds) need[id] = (need[id] || 0) + 1;
        const shortfall: string[] = [];
        for (const id of FLEET_STARTER) {
          const n = need[id] || 0;
          if (n > 0) { need[id] = n - 1; continue; }
          shortfall.push(id);
        }
        const cardLibrary = [...state.cardLibrary, ...shortfall];
        // 没有舰队就顺手建一支并编满（最多 30 艘）—— 否则玩家点完仍然"没有可出征的舰队"，试玩不了。
        if (state.fleets.length > 0) return { ...state, cardLibrary };
        return {
          ...state,
          cardLibrary,
          fleets: [{
            id: createUid('fleet'),
            name: '示例舰队',
            shipIds: FLEET_STARTER.slice(0, BATTLE_TUNING.fleetSize),
            defending: false,
          }],
        };
    }

    default:
      return state;
  }
}
