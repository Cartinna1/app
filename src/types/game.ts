// ==================== 星际贸易 ====================

import type { GalaxyState } from './galaxy';
import type { BuildQueueItem } from '@/lib/battle/shipyard';
import type {
  BattleAction,
  BattleExpedition,
  BattleFleet,
  BattleRaidState,
  BattleState,
  PirateBossId,
  ShipCardId,
} from './battle';

export interface Faction {
  id: string;
  name: string;
  specialtyName: string;
  specialtyDescription: string;
  basePrice: number; // 特产基础购买价
  /** 势力简介（星图信息卡展示）。静态数据：UI 一律读 data/factions 的静态表，不读存档快照 */
  intro: string;
}

export interface FactionState {
  factionId: string;
  invested: number; // 旧投资系统的累计投资额（**当前无写入点**，仅旧存档迁移读取）；新投资走「固定 8000 金币 +1 声望」模型
  investmentTier: number; // 0-5，对应投资档位
}

export interface TradeStatus {
  // ⚠ 位置与跃迁状态已迁往 ship.galaxy（星图，单一真值）：currentNodeId / targetNodeId / travelTurnsRemaining
  inventory: Record<string, number>; // 特产库存（factionId -> 数量）
  factionStates: Record<string, FactionState>; // 各势力投资状态（待 Phase3 迁移）
  exploredThisTurn: boolean; // 本回合是否已探索过
  intelGatheredInFaction: string | null; // 在哪个势力打探过消息（抵达新势力后重置）
  lastExploreResult?: string; // 本回合探索结果（显示用，回合结束清除）
  lastIntelResult?: { message: string; goldChange: number }; // 本回合打探结果（显示用，回合结束清除）
}

// ==================== 势力声望与合同 ====================

/** 贸易合同 */
export interface FactionContract {
  id: string;              // 唯一标识
  factionId: string;       // 发布势力
  type: 'procurement' | 'smuggling';
  accepted: boolean;       // 是否已接取
  targetItemId: string;    // 目标物品ID
  targetQty: number;       // 需求数量
  rewardGold: number;      // 金币奖励（走私为0）
  rewardRep: number;       // 声望奖励
  expiresTurn: number;     // 过期回合
  blackMarketUsed: boolean; // 走私是否通过黑市采购
}

// 贸易政策类型
export type TradePolicy = 'embargo' | 'black_market' | 'tariff_wall' | 'trade_dispute' | 'normal' | 'regional_mutual' | 'free_trade' | 'trade_frenzy' | 'golden_age' | 'stellar_boom';

export interface PolicyEffect {
  name: string;
  description: string;
  multiplier: number;
}

// ==================== 基础类型 ====================

export interface Stock {
  id: string;
  name: string;
  description: string;
  sector: string;
  basePrice: number;
  volatility: number;
  prices: number[];
  currentPrice: number;
  /** 已退市：价格冻结、不可交易；退市当回合按最后价 10% 清算给持仓者（见 priceFluctuation.ts） */
  delisted?: boolean;
  /** 已重整再上市的次数（上限 5，见 priceFluctuation 的 STOCK_DELIST.MAX_RESTRUCTURES）；缺失 = 从未重整过 */
  restructures?: number;
  /** 彻底关闭：重整次数用尽后仍退市，永不再上市（原位置已由 data/stockRefills.ts 的全新公司补位） */
  permanentlyClosed?: boolean;
}

export interface RawMaterial {
  id: string;
  name: string;
  basePrice: number;
  prices: number[];
  currentPrice: number;
}

export interface Recipe {
  id: string;
  productName: string;
  description: string;
  inputs: { materialId: string; amount: number }[];
  productionTurns: number;
  foodYield?: number; // 食物配方：完成后直接获得食物而非产品
}

export interface Product {
  id: string;
  name: string;
  description: string;
  baseSellPrice: number;
  sellPrices: number[];
  currentSellPrice: number;
  productionTurns: number; // 生产所需回合数（1-6，含重型配方4-6回合）
}

export interface ProductionTask {
  id: string;
  productId: string;
  remainingTurns: number;
  createTurn: number;
}

export interface MothershipSkill {
  name: string;
  description: string;
}

export interface Loan {
  id: string;
  principal: number;       // 本金
  interestRate: number;    // 每期利率（如0.02 = 2%）
  totalTurns: number;      // 总还款回合数
  remainingTurns: number;  // 剩余还款回合数
  totalRepay: number;      // 应还总额（本金+利息）
  repaid: number;          // 已还金额
  perTurnPayment: number;  // 每期还款额
  borrowTurn: number;      // 借款回合
}

// 母舰装置（已安装实例）
export interface ShipModule {
  id: string;           // 装置定义ID
  name: string;         // 名称
  installedTurn: number; // 安装回合
  cooldown: number;     // 当前冷却回合（0=可用）
  active: boolean;      // 是否启用
}

// 装置定义
export interface ModuleDefinition {
  id: string;
  name: string;
  description: string;
  costFood: number;
  costAlloy: number;
  costStardust: number;
  costGold?: number;                 // 可选：消耗金币
  costMaterials?: Record<string, number>; // 可选：消耗原料
  effectType: 'per_turn' | 'passive' | 'manual';
  cooldown: number;     // 冷却回合（manual类型）
  effectDescription: string;
  /** 手动装置的消耗（资源 key → 数量；结算与面板置灰判定同读，勿再在 hook/UI 各写一份数字） */
  manualCost?: Record<string, number>;
  /** 手动装置的产出（资源 key → 数量，如 gold: 30000 / stardust: 10） */
  manualGain?: Record<string, number>;
}

export interface Relic {
  id: string;
  name: string;
  description: string;
  effect: string;          // 效果描述
  stardustCost: number;    // 星尘集市售价
}

export interface GoldLogEntry {
  turn: number;
  amount: number;        // 正数=增加，负数=减少
  reason: string;        // 变动原因描述
  balanceAfter: number;  // 变动后的金币余额
}

export interface Mothership {
  id: number;
  name: string;
  description: string;
  skill: MothershipSkill;
  tradeFeeDiscount: number;
  productionSpeedBonus: number;
  eventDodgeChance: number;
  materialPriceDiscount: number;
  sellPriceBonus: number;
  initialCapitalMultiplier: number;
  gold: number;
  // 新资源系统
  food: number;        // 食物
  alloy: number;       // 合金
  stardust: number;    // 星尘
  modules: ShipModule[]; // 已安装的装置
  installedModuleIds: string[]; // 已安装装置ID（防重复）
  // 卖出记录（本回合，用于供需影响计算）
  stockHoldings: Record<string, number>;
  stockCosts: Record<string, number>;
  stockBuyTurn: Record<string, number>;
  stockSellThisTurn?: Record<string, number>;
  stockSellQtyThisTurn?: Record<string, number>;
  materials: Record<string, number>;
  products: { productId: string; expiresAt: number; materialCost: number }[];
  productionQueue: ProductionTask[];
  productionsThisTurn: number;
  maxProductionsPerTurn: number;
  loans: Loan[];
  // 破产/饥荒/叛乱状态
  bankrupt: boolean;       // 金币<0时触发
  bankruptTimer: number;   // 破产倒计时（回合数），从10开始
  famineTimer: number;     // 饥荒倒计时（回合数），食物<0时触发，从10开始
  isRebellion: boolean;    // 饥荒升级为叛乱状态（10回合未回正）
  relics: Relic[];
  // 产品售价加成列表（每个加成独立计算回合数，过期自动移除）
  sellBonuses?: { bonus: number; remainingTurns: number; source: string }[];
  allianceRounds?: number;
  eventTriggeredThisTurn?: boolean;
  eventProcessedThisTurn?: boolean;
  tradeStatus: TradeStatus;
  galaxy: GalaxyState;           // 星图状态（位置 / 跃迁 / 迷雾 / 考古），见 types/galaxy.ts
  goldLog: GoldLogEntry[];
  colony?: import('./colony').Colony; // 星际殖民（Phase 1）
}

// ==================== 选择分支事件系统（三级嵌套） ====================

/** 资源变动打包（用于统一应用） */
export interface ResourceChange {
  goldChange?: number;
  foodChange?: number;
  alloyChange?: number;
  stardustChange?: number;
  materialDrops?: { materialId: string; min: number; max: number }[];
  materialCost?: { materialId: string; amount: number }[];
  materialBuys?: { materialId: string; amount: number; discount: number }[];
  productLoss?: number;
  setBonus?: { bonus: number; turns: number; source: string };
  allianceRounds?: number;
}

/** 子结果（随机后续发展）—— 无玩家选择，随机触发 */
export interface EventSubOutcome {
  probability: number;
  description: string;
  message: string;
  resources: ResourceChange;
}

/** 子选择（二级/三级选择界面）—— 玩家可以继续做选择 */
export interface EventSubChoice {
  title: string;        // 子选择标题
  description: string;  // 子选择剧情描述
  options: EventOption[]; // 可复用 EventOption 结构（无限嵌套）
}

/** 一级结果（选项的直接结果） */
export interface EventOutcome {
  probability: number;
  description: string;
  message: string;
  resources: ResourceChange;
  subOutcomes?: EventSubOutcome[]; // 随机后续（二选一）
  subChoice?: EventSubChoice;      // 二级选择（二选一）
}

export interface EventOption {
  label: string;
  description: string;
  requirement?: {
    goldMin?: number;
    goldMax?: number;
    materials?: { materialId: string; amount: number }[];
    products?: number;
    hasMaterial?: string;
    foodMin?: number;
    alloyMin?: number;
    stardustMin?: number;
  };
  outcomes: EventOutcome[];
}

export interface ChoiceEvent {
  id: string;
  name: string;
  description: string;
  category: 'combat' | 'opportunity' | 'disaster' | 'social' | 'mystery' | 'business';
  options: EventOption[];
}

/** 星尘集市状态 */
export interface StardustMarket {
  currentRelicId: string | null; // 当前出售的遗物ID
  soldRelicIds: string[];        // 已在本局购买过的遗物ID（防止重复购买同一遗物）
}

/** 事件日志条目。id 为稳定唯一标识，供列表渲染作 key；旧存档无 id 时按内容兜底。 */
export interface EventLogEntry {
  id?: string;
  turn: number;
  event: string;
  detail: string;
}

// ==================== 银河雇佣兵协会（悬赏） ====================
// ⚠ 这一段是**存档地基**（saveVersion 8 → 9）：字段先存在、暂时没有任何读写方
//   （业务逻辑在后续步骤接入）。形状以 `docs/03-雇佣兵协会.md` §2.1 / §2.6 为准。

/** 三类悬赏（与 UI 分组、报酬档位一一对应）。`BountyDef.kind` 用它；定义表在数据层，不进存档。 */
export type BountyKind = 'pirate' | 'raid' | 'elite';

/** 材料报酬：随机一份普通原料，或指定某种原料 */
export interface BountyMaterialReward {
  mode: 'random' | 'fixed';
  /** `mode === 'fixed'` 时必填（gold_ore / quantum / silicon / carbon / oil / dark_matter） */
  materialId?: string;
  amount: number;
}

/** 一条悬赏的**静态定义**（数据层 `data/mercenary/bounties.ts`，**不进存档**）。
 *  ⚠ 不含声望字段（完成不发声望、失败与超时也不扣）；不含任何星图字段（接单后当场开战）。 */
export interface BountyDef {
  /** 全表唯一（`bty_p1` 之类） */
  id: string;
  kind: BountyKind;
  /** 标题，玩家看到的第一行 */
  title: string;
  /** 目标描述，2~3 句，带味道但不写数值 */
  desc: string;
  /** 难度 1~4：只用于展示与徽章配色，**不参与任何结算** */
  difficulty: 1 | 2 | 3 | 4;
  /** 战斗目标（`PirateBossId`）。清剿 = 'm05'，截击 = 'raid'，头目 = 'm01'~'m04' */
  enemyId: PirateBossId;
  /** 接取之后的完成期限（回合数），8~15 */
  deadlineTurns: number;
  rewardGold: number;
  rewardStardust: number;
  rewardMaterial: BountyMaterialReward | null;
  /** 接取门槛：卡库至少这么多艘（可空；头目档用 20） */
  requireCardCount?: number;
}

/** 一条悬赏的进行态（存档字段）。两个回合数都是**绝对回合**，不是剩余回合。 */
export interface BountyProgress {
  /** 指向静态定义的 id（`BountyDef.id`，定义表在数据层，不进存档） */
  defId: string;
  /** 接取时的游戏回合 */
  acceptedTurn: number;
  /** 到期回合（含）；剩余回合一律走 `lib/turn/expiry.getTurnsUntil`（下限 0） */
  expiresTurn: number;
}

/** 悬赏板状态（存档字段）。旧档缺失时由 `lib/save.stateFromSave` 兜底成空板。 */
export interface BountyState {
  /** 本批悬赏的生成回合（= 0 / 10 / 20 …）；0 = 还没生成过第一批 */
  batchTurn: number;
  /** 本批可接的悬赏 id（数组顺序即展示顺序） */
  offered: string[];
  /** 进行中（"同时最多 3 条"由业务层保证，类型不表达上限） */
  active: BountyProgress[];
  /** 每个头目最近一次被打赢的回合（bossId → turn），用于 10 回合冷却；缺失 = 从未打赢过。
   *  ⚠ 它是 `bounties` 的**子字段**，不是独立的存档字段（存档清单仍只有 bounties / lairClearedTurn 两项）。 */
  /** 全局休息的结束回合（0 = 不在休息）：**打赢任意一条悬赏**后 = 当前回合 + BOUNTY_REST_TURNS（6）。
   *  ⚠ 旧的每头目冷却 `bossCooldown` 已整体退役（两个计时器并存必然打架，用户 2026-10 裁定）。
   *    旧 v9 档里残留的 `bossCooldown` 在 stateFromSave 里**被忽略**；缺本字段时兜底 0；
   *    **存档版本号仍是 9**（v9 内的形状调整，不加迁移分支）。 */
  restUntilTurn: number;
}

export interface GameState {
  phase: 'select' | 'playing' | 'ended';
  turn: number;
  currentShipIndex: number;
  ships: Mothership[];
  stocks: Stock[];
  materials: RawMaterial[];
  products: Product[];
  eventLog: EventLogEntry[];
  redeemedCodes: string[];
  factions: Faction[]; // 10个星际势力
  factionPrices: Record<string, number>; // 每回合各势力特产的实际价格（浮动）
  factionSellMultipliers: Record<string, number>; // 每回合各势力特产的固定卖出乘数（同回合内不变）
  blackMarketMultiplier: number; // 黑市采购倍率（每回合随机 3.2~4.5，1位小数）
  // ===== 贸易市场库存/需求/价格buff =====
  buyStocks: Record<string, number>;        // 每势力本回合剩余可购买库存
  buyStockMax: Record<string, number>;      // 每势力本回合初始库存（80%涨价判定基准）
  sellDemands: Record<string, number>;      // 每势力本回合剩余卖出需求
  sellDemandMax: Record<string, number>;    // 每势力本回合初始需求（70%降价判定基准）
  buyTriggered: Record<string, boolean>;    // 本回合该势力是否已触发涨价
  sellTriggered: Record<string, boolean>;   // 本回合该势力是否已触发降价
  buyBuffs: Record<string, { multiplier: number; expiresTurn: number }[]>; // 涨价buff（可叠加）
  sellBuffs: Record<string, { multiplier: number; expiresTurn: number }[]>; // 降价buff（可叠加）
  factionPolicy: { type: TradePolicy; effect: PolicyEffect }; // 当前全星系贸易政策
  policyRemainingTurns: number; // 当前政策剩余持续回合数
  stardustMarket: StardustMarket; // 星尘集市
  gameWon: boolean;
  wonWonderName: string;
  // ===== 势力声望与合同 =====
  factionReputation: Record<string, number>; // 各势力声望(-100~100)
  factionRepLog: Record<string, number>;     // 本回合各势力声望变化（用于上限管控，回合结算清空）
  factionContracts: FactionContract[];       // 活跃合同列表
  // ===== 舰船卡牌战斗（V1.5 §10.1 机库/编队/防守标签/出征、§10.2 掠夺）=====
  cardLibrary: ShipCardId[];              // 卡库：拥有的战舰（无上限；被击毁即永久移除）。初始为空（战舰全靠玩家在船坞建造）
  fleets: BattleFleet[];                  // 舰队：数量不限；一船只能编入一队；每队 ≤ 30 艘
  expedition: BattleExpedition | null;    // 进行中的出征（同时只能 1 个）
  raid: BattleRaidState;                  // 掠夺状态（两段窗口：预警 CD → 已抵达待战；见 types/battle.ts）
  /** **已打败的老巢账本**（用户 2026-08 裁定）：打赢老巢时记下 bossId（幂等），
   *  5 个老巢全被打败后掠夺队的显示名改成「海盗残兵」（唯一真值 lib/battle/raid.raidEnemyName）。
   *  ⚠ **不影响掠夺的触发**：掠夺队永远存在（用户 2026-08 裁定，覆盖 §10.2「全部打败后不再有掠夺」）。
   *  存档字段（v6 引入，旧档兜底 = 空数组 = 一个都没打败）。 */
  defeatedLairs: PirateBossId[];
  // ⚠ 掠夺结算的显示出口 = **事件记录**（`eventLog`，用户 2026-08 最终口径："直接放事件记录好了哇，
  //   打赢也一样"）—— 原先那个"最近一次掠夺收尾"快照字段 `lastRaidSettlement` **已整个删除**：
  //   事件记录本身就是持久化的那条结算展示（打赢 = 「掠夺战果｜击退海盗：缴获 10 星尘」，
  //   打输/被抢 = 「殖民地被掠夺｜损失 金币 20000、硅片 100…」），另存一份快照纯属重复。
  battle: BattleState | null;             // 进行中的战斗。⚠ **不进存档**（读档一律为 null）
  // ===== 船坞与科技（V1.5 §8.2 造船建筑 / §8.3 生产规则 / §9 科技树）=====
  /** 造船队列（同时建造 2 艘 + 排队无限，§11 #5）。完工由 useTurn 每回合调
   *  lib/battle/shipyard.advanceQueue 推进，卡 id 写进 `cardLibrary`（"拥有什么"的唯一真值）。
   *  ⚠ 存档字段（v4 引入；当前存档版本号见 lib/save.ts 的 SAVE_VERSION —— v9 是雇佣兵协会的
   *  `bounties` / `lairClearedTurn`），加/改它照 AGENTS 第四节四处同步。 */
  buildQueue: BuildQueueItem[];
  // ===== 银河雇佣兵协会（saveVersion 9，与本段一起升级；本版只是字段地基）=====
  /** 悬赏板状态（本批榜单 + 进行中 + 头目冷却）。
   *  旧档兜底 = 空板 `{ batchTurn: 0, offered: [], active: [], restUntilTurn: 0 }`（lib/save.stateFromSave）。 */
  bounties: BountyState;
  /** 每个老巢**最近一次被清剿**的回合（bossId → turn），用于"同一老巢 10 回合冷却"。
   *  ⚠ 与 `defeatedLairs` **语义不同、不许混用**：后者是"打赢过没有"的账本（只增不减，
   *  决定掠夺队是否改名）；本字段是计时器（会被后一次清剿覆盖，只决定能不能再打）。
   *  旧档兜底 = `{}`。 */
  lairClearedTurn: Record<string, number>;
  /** **运行期字段**：当前这场战斗是为哪条悬赏打的（null / 缺省 = 普通战斗或没有）。
   *  ⚠ 与 `battle` 同生命周期，**不进存档**（`SaveData` 的 Pick 里没有它，读档一律 `null`）；
   *  ⚠ 不许拿它当"有没有战斗"的判据 —— 那是 `battle`（`battleBoard(state)`）的事。 */
  bountyBattleId?: string | null;
}

export type GameAction =
  | { type: 'SELECT_SHIP'; shipId: number }
  | { type: 'FUNCTIONAL_UPDATE'; updater: (state: GameState) => GameState }
  | { type: 'LOAD_SAVE'; state: GameState }
  | { type: 'RESET_GAME' }
  | { type: 'ADD_EVENT_LOG'; entry: EventLogEntry }
  // ===== 舰船卡牌战斗（V1.5 §10）=====
  | { type: 'CREATE_BATTLE_FLEET'; name?: string }
  | { type: 'DELETE_BATTLE_FLEET'; fleetId: string }
  | { type: 'RENAME_BATTLE_FLEET'; fleetId: string; name: string }
  | { type: 'ADD_SHIP_TO_FLEET'; fleetId: string; shipId: ShipCardId }
  | { type: 'REMOVE_SHIP_FROM_FLEET'; fleetId: string; shipId: ShipCardId }
  | { type: 'TOGGLE_FLEET_DEFENDING'; fleetId: string }
  | { type: 'START_EXPEDITION'; bossId: PirateBossId; fleetId: string; turns: number }
  | { type: 'CANCEL_EXPEDITION' }
  | { type: 'START_BATTLE'; bossId: PirateBossId; fleet: ShipCardId[]; kind: 'expedition' | 'defense'; seed: number }
  // **出征「开战」**（用户 2026-08 裁定，与掠夺阶段 B 同款口径）：倒计时归零那一回合仍由 useTurn **自动**开战
  //   （上面的 START_BATTLE）；但 `battle` 不进存档，读档/从老存档继续时"已抵达 + 没有战斗"是**死状态** ——
  //   这个 action 给玩家一个入口（战斗页签的「开战」按钮），载荷由 useStableActions 侧组装成无参回调：
  //   bossId / 编制 / seed 全在 reducer 里由 lib/battle/expedition.readyExpedition 组装
  //   （与自动那条**同一份判据**，幂等：战斗进行中 / 没有出征 / 还在路上 / 舰队被删或被掏空都不开战）。
  | { type: 'START_EXPEDITION_BATTLE' }
  | { type: 'BATTLE_ACTION'; action: BattleAction }
  | { type: 'END_BATTLE' }
  | { type: 'TICK_BATTLE_STATE' }
  // 掠夺循环（V1.5 §10.2）：触发时登记倒计时与掠夺队支数；掠夺成功时按实扣值结算资源损失。
  //   · START_RAID / ARRIVE_RAID / APPLY_RAID_LOOT 的派发方只有 useTurn（每回合编排），UI 不直接派发；
  //   · **由玩家主动点开的战斗入口只有两个**，都是无参 action（阶段 B 的掠夺「开战」= START_RAID_BATTLE，
  //     已抵达的出征「开战」= 上面的 START_EXPEDITION_BATTLE）：
  //     载荷由 useStableActions 侧组装（bossId / 编制 / seed），UI 不持有"随便开一场战斗"的能力。
  | { type: 'START_RAID'; raiders: number }
  | { type: 'ARRIVE_RAID' }
  | { type: 'APPLY_RAID_LOOT' }
  | { type: 'START_RAID_BATTLE' }
  // ===== 船坞与造舰（V1.5 §8.2 / §8.3：同时建造 2 艘 + 排队无限）=====
  // 校验走 lib/battle/shipyard.canEnqueue（内部即 canBuild），扣费走 lib/turn/resourceCost.payCost。
  // 完工由 useTurn 每回合调 advanceQueue 写进 cardLibrary，**没有 REMOVE_BUILT 这类 action**。
  | { type: 'ENQUEUE_BUILD'; cardId: ShipCardId }
  | { type: 'CANCEL_BUILD'; index: number }
  // ===== 银河雇佣兵协会（阶段 1：接单 / 放弃 / 当场出击）=====
  // ⚠ 三个 action 的守卫全部在 `lib/turn/bounties.ts`（`canAcceptBounty` / `canStartBountyBattle`），
  //   reducer 与 UI 共用同一份判据；被拒时 reducer **原样返回 state + 一条事件记录**，不静默失败。
  // ⚠ 完成 / 失败判定**不在** action 层，只在 `END_BATTLE` 的非掠夺分支（结算唯一入口）。
  | { type: 'ACCEPT_BOUNTY'; defId: string }
  | { type: 'ABANDON_BOUNTY'; defId: string }
  | { type: 'START_BOUNTY_BATTLE'; defId: string; fleetId: string };

/**
 * 存档数据形状：与 GameState 持久化字段保持一致（Pick 自 GameState，字段增减自动同步类型）。
 * 序列化/反序列化逻辑见 lib/save.ts 的 buildSaveData / stateFromSave。
 */
export type SaveData = Pick<
  GameState,
  | 'ships' | 'stocks' | 'materials' | 'products' | 'turn' | 'currentShipIndex'
  | 'eventLog' | 'redeemedCodes' | 'factions' | 'factionPrices' | 'factionSellMultipliers'
  | 'blackMarketMultiplier' | 'buyStocks' | 'buyStockMax' | 'sellDemands' | 'sellDemandMax'
  | 'buyTriggered' | 'sellTriggered' | 'buyBuffs' | 'sellBuffs'
  | 'factionPolicy' | 'policyRemainingTurns' | 'stardustMarket' | 'gameWon' | 'wonWonderName'
  | 'factionReputation' | 'factionContracts'
  // 卡牌战斗：battle（进行中的战斗）**故意不进存档**
  // ⚠ 掠夺结算不再有独立存档字段：显示出口 = `eventLog`（它本来就在存档清单里）
  | 'cardLibrary' | 'fleets' | 'expedition' | 'raid' | 'defeatedLairs'
  // 船坞与科技：造船队列（v4 新增）
  | 'buildQueue'
  // 银河雇佣兵协会（v9 新增）：悬赏板 + 老巢清剿计时器
  // ⚠ `bountyBattleId`（运行期字段）**故意不进存档**（与 `battle` 同一条规则）
  | 'bounties' | 'lairClearedTurn'
> & { saveVersion: number };
