// ==================== 星际贸易 ====================

export interface Faction {
  id: string;
  name: string;
  specialtyName: string;
  specialtyDescription: string;
  basePrice: number; // 特产基础购买价
}

export interface FactionState {
  factionId: string;
  invested: number; // 已投资金额（上限50000）
  investmentTier: number; // 0-5，对应投资档位
}

export interface TradeStatus {
  currentFactionId: string; // 当前停靠的势力
  targetFactionId: string | null; // 跃迁目标
  travelTurnsRemaining: number; // 剩余跃迁回合数
  inventory: Record<string, number>; // 特产库存（factionId -> 数量）
  factionStates: Record<string, FactionState>; // 各势力投资状态
  exploredThisTurn: boolean; // 本回合是否已探索过
  intelGatheredInFaction: string | null; // 在哪个势力打探过消息（抵达新势力后重置）
  lastExploreResult?: string; // 本回合探索结果（显示用，回合结束清除）
  lastIntelResult?: { message: string; goldChange: number }; // 本回合打探结果（显示用，回合结束清除）
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
}

export interface Product {
  id: string;
  name: string;
  description: string;
  baseSellPrice: number;
  sellPrices: number[];
  currentSellPrice: number;
  productionTurns: number; // 生产所需回合数（1-3）
  priceMaxUp: number;      // 相对基准价，最多涨多少（如0.2=20%）
  priceMaxDown: number;    // 相对基准价，最多跌多少（如0.15=15%）
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
  usedCodes: string[];
  loans: Loan[];
  // 破产/饥荒/叛乱状态
  bankrupt: boolean;       // 金币<0时触发
  bankruptTimer: number;   // 破产倒计时（回合数），从10开始
  famineTimer: number;     // 饥荒倒计时（回合数），食物<0时触发，从10开始
  isRebellion: boolean;    // 饥荒升级为叛乱状态（10回合未回正）
  relics: Relic[];
  nextTurnStockTip?: string;
  nextTurnMatTip?: string;
  stockTipThisTurn?: string;
  matTipThisTurn?: string;
  // 产品售价加成列表（每个加成独立计算回合数，过期自动移除）
  sellBonuses?: { bonus: number; remainingTurns: number; source: string }[];
  allianceRounds?: number;
  eventTriggeredThisTurn?: boolean;
  eventProcessedThisTurn?: boolean;
  tradeStatus: TradeStatus;
  goldLog: GoldLogEntry[];
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
  stockFreeze?: boolean;
  grantTip?: 'stock' | 'material';
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

export interface GameState {
  phase: 'select' | 'playing' | 'ended';
  turn: number;
  currentShipIndex: number;
  seed: string;
  ships: Mothership[];
  stocks: Stock[];
  materials: RawMaterial[];
  products: Product[];
  eventLog: { turn: number; event: string; detail: string }[];
  redeemedCodes: string[];
  factions: Faction[]; // 10个星际势力
  factionPrices: Record<string, number>; // 每回合各势力特产的实际价格（浮动）
  factionSellMultipliers: Record<string, number>; // 每回合各势力特产的固定卖出乘数（同回合内不变）
  factionPolicy: { type: TradePolicy; effect: PolicyEffect }; // 当前全星系贸易政策
  policyRemainingTurns: number; // 当前政策剩余持续回合数
  stardustMarket: StardustMarket; // 星尘集市
}

export type GameAction =
  | { type: 'SELECT_SHIP'; shipId: number }
  | { type: 'FUNCTIONAL_UPDATE'; updater: (state: GameState) => GameState }
  | { type: 'FLUCTUATE_PRICES'; stocks: Stock[]; materials: RawMaterial[]; products: Product[] }
  | { type: 'LOAD_SAVE'; state: GameState }
  | { type: 'RESET_GAME' }
  | { type: 'ADD_EVENT_LOG'; entry: { turn: number; event: string; detail: string } };

export interface SaveData {
  ships: Mothership[];
  stocks: Stock[];
  materials: RawMaterial[];
  products: Product[];
  turn: number;
  currentShipIndex: number;
  seed: string;
  eventLog: { turn: number; event: string; detail: string }[];
  redeemedCodes: string[];
}
