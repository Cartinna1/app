// ==================== 星际贸易 ====================

import type { GalaxyState } from './galaxy';
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
  raid: BattleRaidState;                  // 掠夺状态
  battle: BattleState | null;             // 进行中的战斗。⚠ **不进存档**（读档一律为 null）
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
  | { type: 'BATTLE_ACTION'; action: BattleAction }
  | { type: 'END_BATTLE' }
  | { type: 'TICK_BATTLE_STATE' }
  // ⚠ 临时调试入口（P4）：把示例舰队填进卡库，好让战斗页签在 P8 船坞上线前能直接试玩。
  //    P8 船坞上线后**连同 BattleTab 里那个「测试用」按钮一起删除**。
  | { type: 'DEBUG_FILL_SAMPLE_LIBRARY' };

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
  | 'cardLibrary' | 'fleets' | 'expedition' | 'raid'
> & { saveVersion: number };
