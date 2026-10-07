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
import {
  EMPTY_RAID_LOOT_DETAIL,
  grantBattleRewards,
  grantRaidReward,
  raidLootView,
  raidRewardView,
  rollRaidReward,
} from '@/lib/battle/rewards';
import type { RaidReward, RaidSettlement } from '@/lib/battle/rewards';
import {
  RAID_ARRIVED_TURNS,
  RAID_IMMUNE_TURNS,
  RAID_WARNING_TURNS,
  idleRaidState,
  raidBattleFleet,
  raidDefensePool,
  raidLootLoss,
  raidLootText,
  raidPhase,
  readyRaidBattle,
  recordDefeatedLair,
  tickRaid,
} from '@/lib/battle/raid';
import type { RaidLootLoss } from '@/lib/battle/raid';
import { flattenCost, payCost } from '@/lib/turn/resourceCost';
import { pushGoldLog } from '@/lib/turn/goldLog';
import { readyExpedition, tickExpedition } from '@/lib/battle/expedition';
import { canAddShip, canDeleteFleet, canRemoveShip, canRenameFleet, canToggleDefending, isFleetOnExpedition } from '@/lib/battle/hangar';
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
    // 掠夺初值 = lib/battle/raid.idleRaidState()（**唯一真值**，存档兜底 / 各处收尾都从它派生）：
    // 阶段 A 倒计时 null、阶段 B 倒计时 0、无免疫、无掠夺队
    raid: idleRaidState(),
    // 已打败的老巢账本（用户 2026-08 裁定，v6 新增）：新开局一个老巢都没打败。
    // ⚠ 只影响掠夺队的**显示名**（全打败 → 「海盗残兵」），**不影响掠夺触发**（永远存在）。
    defeatedLairs: [],
    // 掠夺收尾快照（用户 2026-08 裁定「把奖励显著地显示出来」＋「失败也要显示丢了啥」，
    // v7 引入、v8 改成"赢/输同一形状"）：新开局没有可显示的掠夺结算。
    // ⚠ 写入 / 清空时机都在本文件（`END_BATTLE` 与 `APPLY_RAID_LOOT` 写、`START_RAID` 清），
    //   见 types/game.ts 的字段注释。
    lastRaidSettlement: null,
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
 * 返回新的 ships、一条事件日志明细，**以及"最近一次掠夺收尾"快照**。
 * 扣减走 lib/turn/resourceCost 的 flattenCost + payCost（AGENTS 第三节：勿在 reducer 里自己写一份扣资源），
 * 实扣值（每项以当前持有量为上限）由 raid.ts 的 raidLootLoss 给（唯一真值）。
 * ⚠ **实扣明细由调用方算好传进来**（不再在函数内部算一份）：同一份 `loss` 既交给 payCost/pushGoldLog 去扣，
 *   也进 `raidLootView(loss)` 当显示值 —— 这样**显示值 = 实扣值**（用户 2026-08：「失败也要显示丢了啥」，
 *   且"日志写明实际扣了什么"是 AGENTS 第九节的硬要求）。若让显示层在扣完之后再调一次 raidLootLoss，
 *   读到的就是已经扣完的状态，两边必然对不上。
 */
function settleRaidLoot(
  state: GameState,
  loss: RaidLootLoss,
): { ships: Mothership[]; detail: string; settlement: RaidSettlement } {
  const lead = state.ships[0];
  if (!lead) return { ships: state.ships, detail: '', settlement: raidLootView(EMPTY_RAID_LOOT_DETAIL) };
  const next: Mothership = { ...lead, materials: { ...(lead.materials || {}) } };
  payCost(next, lead.colony, flattenCost(loss));
  // 金币流水：**必须先改完金币再记账**（pushGoldLog 读当前金币当 balanceAfter，AGENTS-附录.md 10.2）
  if (loss.gold > 0) pushGoldLog(next, state.turn, -loss.gold, '殖民地被掠夺');
  return { ships: [next, ...state.ships.slice(1)], detail: raidLootText(loss), settlement: raidLootView(loss) };
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
      // 改名同属"编成/操作"：出征中的舰队不许动。
      // ⚠ 判据用 canRenameFleet（**不是** canDeleteFleet）—— 它是"能不能改名"的唯一真值，
      //   与机库 UI 上「改名」按钮的禁用判据（FleetRow.canRename）同源；两处共用一份判定，
      //   才不会出现"按钮能点、reducer 却静默拒绝（名字不变）"这种查不出来的断链。
      if (!canRenameFleet(state, action.fleetId).ok) return state;
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
      // ⚠ 本 action 的派发方：`useTurn`（出征倒计时归零自动开战）。玩家主动开的掠夺战走
      //   `START_RAID_BATTLE`（阶段 B 的「开战」按钮，见下面那个 case）。
      const created = createBattle({ seed: action.seed, bossId: action.bossId });
      const battle: BattleState = { ...created, player: { ...created.player, pool: action.fleet.slice() } };
      // 防守战（kind='defense'，目标恒为掠夺队 'raid'）开打即"阶段 B 已处理"：把待战倒计时收掉
      // （END_BATTLE 还会再收一次，两处幂等）。出征战不动 raid 字段。
      const raid = action.kind === 'defense' ? { ...state.raid, arrivedTurns: 0, arrived: true } : state.raid;
      return { ...state, battle, raid };
    }

    case 'START_EXPEDITION_BATTLE': {
      // **出征「开战」**（用户 2026-08 裁定，与掠夺阶段 B 的 `START_RAID_BATTLE` 同款口径）：
      //   倒计时归零那一回合仍由 useTurn **自动**开战（START_BATTLE，上面那个 case）；但 `battle` **不进存档**，
      //   于是读档 / 从老存档继续时"已抵达 + 没有战斗"这一帧**没有任何出路**（用户 2026-08 报的卡死）。
      //   能不能开战由 lib/battle/expedition.readyExpedition 判（必须在已抵达、战斗未进行、出征舰队非空），
      //   与自动那条**同一份判据**，故幂等；参战编制 = 该舰队的当前编制（seed 照旧 Date.now()，战斗不进存档）。
      //   ⚠ 建场直接**复用 START_BATTLE 分支**（递归派发）：不在这里另写一份 createBattle 装配，
      //     两条路的战斗形状（玩家卡池 = 出征编制）永远一致。
      const ready = readyExpedition(state);
      if (!ready) return state;
      return gameReducer(state, {
        type: 'START_BATTLE',
        bossId: ready.bossId,
        fleet: ready.fleet,
        kind: 'expedition',
        seed: Date.now(),
      });
    }

    case 'START_RAID_BATTLE': {
      // **阶段 B 的「开战」**（用户 2026-08 裁定的流程）：这是**全场唯一由玩家主动点开的战斗入口**。
      // 能不能开战由 lib/battle/raid.readyRaidBattle 判（必须在阶段 B、战斗未进行、防守池非空），
      // 参战池 = raidDefensePool（合并池，与 §10.2 / END_BATTLE 的第二场同源）——reducer 不重写判定。
      const ready = readyRaidBattle(state);
      if (!ready) return state;
      const created = createBattle({ seed: Date.now(), bossId: 'raid' });
      const battle: BattleState = { ...created, player: { ...created.player, pool: ready.fleet.slice() } };
      // 开战即离开待战窗口（免疫期在 END_BATTLE 收尾时给：打赢 / 打输 / 自动失败三条路都一样）
      return { ...state, battle, raid: { ...state.raid, arrivedTurns: 0, arrived: true } };
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
        // 掠夺结束（打赢 / 打输 / 掠夺成功）：§10.2 之后 20 回合内不再被掠夺。
        // 两段窗口一起收（阶段 A 的 inTurns 与阶段 B 的 arrivedTurns），并把 arrived 标记复位。
        const raidOver = { ...idleRaidState(), immuneTurns: RAID_IMMUNE_TURNS };

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
              raid: { ...idleRaidState(), raiders: state.raid.raiders - 1 },
            };
          }
        }

        // ② 掠夺损失：**防守战打输** 与 **没有防守舰队** 走同一条路（§10.2 原话"完全一样"）。
        //    还有一种同形的情形：第一场赢了、但幸存舰为 0（全灭在场上）→ 第二支掠夺队无人可挡，
        //    按"没有防守舰队"处理（不能因为赢了第一场就发奖励，那等于用空池白拿战利品）。
        const noDefenderLeft = raidWin && state.raid.raiders > 1;
        if (!raidWin || noDefenderLeft) {
          // **实扣明细在这里算一次**（raid.ts 的 raidLootLoss 是唯一真值），同时交给 settleRaidLoot 去扣
          // 与 raidLootView 去当显示值 → **界面显示的数字就是账上真扣的数字**（用户 2026-08：「失败也要显示丢了啥」）。
          const loss = raidLootLoss(base);
          const { ships, detail, settlement } = settleRaidLoot(base, loss);
          const prefix = noDefenderLeft ? '第一场打赢了，但没有幸存舰拦第二支掠夺队：' : '防守战失利，';
          return {
            ...base,
            ships,
            // **失败也要显著显示**（用户 2026-08 追加裁定）：与打赢共用同一份状态、同一个出口，
            // 用 `outcome: 'lost'` 区分。清空时机与打赢一致 = START_RAID（下一波掠夺开打时）。
            lastRaidSettlement: settlement,
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
          // **掠夺收尾快照（用户 2026-08 裁定：把奖励显著地显示出来）**：只有走到这一条
          // （= 掠夺打赢**且再没有下一支掠夺队**）才算"这一波掠夺的战果"。中途那场在第一场赢下
          // 就 return 了（上面的 ①），不会走到这里 → 快照天然只在最后一支打完后写。
          // 文案逐字取自奖励路径（reward.text，唯一产出口），UI 只渲染 —— 不许 UI 自己算奖励。
          // 打输那两条路（上面 ② / APPLY_RAID_LOOT）写的是**同一个字段、同一个形状**，只是 outcome='lost'。
          // 清空时机 = START_RAID（下一场掠夺事件开打时）。
          lastRaidSettlement: raidRewardView(reward),
          battle: null,
          raid: raidOver,
          eventLog: [
            // ⚠ `event` 必须是**中性词**、不许与 `detail` 重复前缀：`reward.text` 自带「击退海盗：」
            //   （它是奖励文案的**唯一产出口**，一个字都不许改），而 EventPanel 是
            //   `第N回合 <event> <detail>` 并排渲染 —— 早先 event 也写「击退海盗」，玩家读到的是
            //   「击退海盗：击退海盗：缴获 10 星尘」（用户 2026-08 报"没奖励"时读的正是这一行）。
            { id: createUid('raid'), turn: state.turn, event: '掠夺战果', detail: reward.text },
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
      // 老巢账本（**唯一写入点**，用户 2026-08 裁定）：打赢才算打败 —— 判据就是既有的
      // `battle.winner === 'player'`（与上面那条发奖路径同一次胜负判定：battleRewards 对打输恒 0/0），
      // **不新造一套胜负判断**。写入幂等（lib/battle/raid.recordDefeatedLair：已在账本里就原样返回）。
      // 效果：5 个老巢全被打败后掠夺队改名「海盗残兵」；掠夺本身**永远存在**，不受它影响。
      const defeatedLairs = battle.winner === 'player'
        ? recordDefeatedLair(state.defeatedLairs, battle.bossId)
        : state.defeatedLairs;
      return {
        ...base,
        ships,
        battle: null,
        expedition: null,
        defeatedLairs,
      };
    }

    case 'START_RAID': {
      // 掠夺触发（§10.2）：登记**阶段 A**"RAID_WARNING_TURNS 回合后抵达" + 本次来了几支掠夺队
      // （1-2 支按 50/50 掷，随机数由调用方 useTurn 取；判定在 lib/battle/raid.shouldStartRaid）。
      // 幂等：已有在途掠夺（阶段 A 或阶段 B）时原样返回，不覆盖正在走的倒计时。
      if (raidPhase(state.raid) !== 'idle') return state;
      return {
        ...state,
        raid: { ...idleRaidState(), inTurns: RAID_WARNING_TURNS, raiders: action.raiders },
        // **清空上一次的掠夺收尾快照**（用户 2026-08 裁定的时机：下一场掠夺开打时）——
        // 否则上一波那句"缴获 …"或"殖民地被掠夺：…"会在这一波的第一场战斗结算画面上
        // 被当成"这一波的战果/损失"显示出来。
        lastRaidSettlement: null,
      };
    }

    case 'ARRIVE_RAID': {
      // 阶段 A 归零 → **转入阶段 B**（不自动开战）：海盗抵达、停在战斗页签等玩家点「开战」，
      // 同时开始 RAID_ARRIVED_TURNS 回合的"不打就自动失败"倒计时。
      // ⚠ 幂等判据 = **已经在阶段 B**（`arrivedTurns > 0`），**不是** `inTurns === null`：
      //   阶段 A 的倒计时被 tickRaid 钳在 0，所以"归零"会先以 `inTurns: 0` 的形态存在；
      //   旧判据 `inTurns === null` 在那一刻是 false（还能转），看似没问题 —— 但它把"能不能转"
      //   押在"ARRIVE_RAID 必须落在 TICK 之后、且必须真的被派发"这个隐含时序上。一旦这次派发
      //   被批边界/丢帧吞掉，状态就永久停在 `inTurns: 0 + arrivedTurns: 0`（阶段仍是 warning）：
      //   界面显示"还有 0 回合抵达"、开战按钮又只在阶段 B 渲染 → 玩家卡在一个**空窗口**里
      //   （用户 2026-08 截图实证，与 P5 出征踩过的 off-by-one 同类）。
      //   改为按"是否已抵达"判幂等后，转段只取决于状态本身，与派发时序无关。
      if (state.raid.arrivedTurns > 0) return state;
      return {
        ...state,
        raid: { ...state.raid, inTurns: null, arrivedTurns: RAID_ARRIVED_TURNS, arrived: true },
      };
    }

    case 'APPLY_RAID_LOOT': {
      // 掠夺成功（**自动失败**：阶段 B 的倒计时耗尽仍未迎战；或没有防守舰队时的既有路径）：
      // 结算资源损失并进入免疫期（§10.2）。
      // 损失 = 金币 20% + 原料各自 1/3，各项以当前持有量为上限（实扣值来自 raid.raidLootLoss，唯一真值）；
      // 与"防守战打输"共用 settleRaidLoot，两条路的损失口径必须完全一致（§10.2 原话）。
      // ⚠ **玩家什么都没做就被抢，这条尤其必须让他看见**（用户 2026-08 追加裁定）→ 写同一份收尾快照。
      const loss = raidLootLoss(state);
      const { ships, detail, settlement } = settleRaidLoot(state, loss);
      return {
        ...state,
        ships,
        lastRaidSettlement: settlement,
        raid: { ...idleRaidState(), immuneTurns: RAID_IMMUNE_TURNS },
        eventLog: [
          { id: createUid('raid'), turn: state.turn, event: '殖民地被掠夺', detail },
          ...state.eventLog,
        ].slice(0, EVENT_LOG_LIMIT),
      };
    }

    case 'TICK_BATTLE_STATE': {
      // 每个游戏回合调用一次（useTurn）：出征倒计时与掠夺倒计时各减 1，下限 0（到 0 就停在 0）。
      // 「归零即开战 / 归零即掠夺」的判定留给调用方：开战需要 seed / 参战舰队等只有调用方才知道的信息。
      // ⚠ 两段倒计时的算式**都只在这里各有一份**（出征 = lib/battle/expedition.tickExpedition，
      //   掠夺 = lib/battle/raid.tickRaid）：useTurn 判"本次 TICK 后是否归零"读的也是它们，
      //   若在这里就地再写一遍，显示与结算就会分叉（P5/P7 都踩过）。
      const expedition = tickExpedition(state.expedition);
      return { ...state, expedition, raid: tickRaid(state.raid) };
    }

    // ==================== 船坞与造舰（V1.5 §8.2 / §8.3） ====================
    // ⚠ 队列推进（完工写进卡库）**不在这里**：由 useTurn 每回合调 advanceQueue 编排
    //   （与 colonyTurn / 考古推进同一个位置），故没有"完工"相关的 action。

    case 'ENQUEUE_BUILD': {
      const ship = state.ships[0];
      if (!ship) return state;
      // ① 门槛（船坞等级 / 科技 / **船坞入驻** / 资源）的唯一真值 = lib/battle/shipyard.canEnqueue
      //    （内部即 canBuild；入驻判据是 lockGate 里的 dockStaffGate，UI 不许自己写）。
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
      // ⚠ pushGoldLog 必须在金币改完之后调（它读当前金币当 balanceAfter，AGENTS-附录.md 10.2）
      if (refund.gold) pushGoldLog(next, state.turn, refund.gold, '取消造舰返还');
      return { ...state, ships: [next, ...state.ships.slice(1)], buildQueue };
    }

    default:
      // 未处理的 action **不许静默消失**（用户 2026-08 排查"派了 action 却什么都没发生"，
      // 一度怀疑是某个包装层把 TICK 丢掉了 —— 结论是没有，但这类"派了没人接"必须留下痕迹）。
      // 只在 DEV 打一行警告：正常路径（type 已被上面的 case 穷尽）走不到这里；
      // 走到这里 = 新增 action 忘了写 case，或者调用方拼错了 type。
      if (import.meta.env.DEV) {
        console.warn('[gameReducer] 未处理的 action（状态原样返回）：', (action as { type?: string }).type);
      }
      return state;
  }
}
