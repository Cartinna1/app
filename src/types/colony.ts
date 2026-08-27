// ==================== 星球类型 ====================

export type PlanetTypeId =
  | 'desert' | 'ocean' | 'polar' | 'arid'
  | 'terran' | 'alpine' | 'savannah' | 'tropical'
  | 'tundra' | 'ruin';

export interface PlanetBuff {
  description?: string;
  /** 建筑产量倍率 (buildingId → multiplier)，1.0=无变化 */
  buildingOutputMults?: Record<string, number>;
  /** 食物建筑产量倍率（快捷方式，自动匹配B3/B4/B5） */
  foodMult?: number;
  /** 合金建筑产量倍率（B6/B7/B8） */
  alloyMult?: number;
  /** 星尘建筑产量倍率（B9/B10） */
  stardustMult?: number;
  /** 建筑造价倍率，1.0=无变化 */
  buildCostMult?: number;
  /** 建造回合变动（正数=增加，负数=减少） */
  buildTurnDelta?: number;
  /** 人口食物消耗变动（正数=增加） */
  foodConsumptionDelta?: number;
  /** 人口初始上限（覆盖基础值5） */
  initialPopCap?: number;
  /** 初始赠送人口 */
  initialPop?: number;
  /** 科研点数产量倍率 */
  researchMult?: number;
  /** 指定原料产量倍率 (materialId → multiplier) */
  materialMults?: Record<string, number>;
  /** 招募人口费用变动（正数=增加） */
  recruitCostDelta?: number;
  /** 领袖招募费用变动（正数=增加） */
  leaderCostDelta?: number;
  /** 电力建筑产量倍率（太阳能阵列/聚变电站/反物质反应堆） */
  powerGenMult?: number;
  /** 建筑电能消耗倍率 */
  powerUseMult?: number;
  /** 贸易建筑金币收入倍率（B11/B12） */
  tradeMult?: number;
  /** 特殊建筑或效果描述 */
  specialEffects?: string[];
}

export interface PlanetDef {
  id: PlanetTypeId;
  name: string;
  description: string;
  buffs: PlanetBuff;
}

// ==================== 建筑 ====================

export type BuildingCategory =
  | 'housing'    // 居住类
  | 'food'       // 食物生产
  | 'alloy'      // 合金生产
  | 'stardust'   // 星尘生产
  | 'trade'      // 贸易/金币
  | 'material'   // 原料生产
  | 'functional' // 功能类
  | 'power';     // 电能生产

export interface BuildingDef {
  id: string;                // B1, B3, B6 等
  name: string;
  description: string;
  category: BuildingCategory;
  costGold: number;
  costAlloy?: number;          // 合金成本
  costMaterials?: Record<string, number>;  // 原料成本
  buildTurns: number;
  maxCount?: number;         // 建造数量上限（undefined=无限制）
  minPop: number;            // 最少入驻人口（居住类=0）
  maxPop: number;            // 最多入驻人口
  /** 产出类型与公式 */
  outputType?: 'food' | 'alloy' | 'stardust' | 'gold' | 'research' | 'material' | 'power';
  outputMaterialId?: string; // 原料类产出对应的 materialId
  /** 产出基准值，产出=(baseOutput + popFactor×入驻人口) */  
  baseOutput?: number;
  popFactor?: number;
  /** 贸易类产出区间 */
  goldOutputMin?: number;
  goldOutputMax?: number;
  requiresTech?: string;     // 需要的前置科技ID（Phase 2）
  powerConsumption?: number;  // 每回合电能消耗
}

// ==================== 建筑实例 ====================

export interface BuildingInstance {
  defId: string;             // 建筑定义ID
  uid: string;               // 唯一ID（用于区分同类建筑的多个实例）
  assignedPop: number;       // 当前入驻人口
  buildProgress: number;     // 已完成的建造回合（达到 buildTurns 即完成）
  active: boolean;           // 是否已建造完成并激活
}

// ==================== 人口 ====================

export interface Population {
  total: number;             // 总人口
  available: number;         // 未分配人口（= total - sum(assignedPop)）
  cap: number;               // 人口上限
}

// ==================== 科技 ====================

export interface ResearchTech {
  id: string;
  name: string;
  description: string;
  costRP: number;
  researchTurns: number;
  prerequisites: string[];
  /** 最少已研究科技数（T25需要≥10） */
  minResearchedCount?: number;
  unlocksBuilding?: string;
  leaderCapBonus?: number;
}

export interface TechState {
  researched: string[];
  currentResearch: string | null;
  currentProgress: number;
  researchPoints: number;
  researchSeed: number;
  repeatableLevels: Record<string, number>; // 循环科技ID → 已叠加次数
}

export interface ColonyLeader {
  id: string;
  name: string;
  rarity: 'R' | 'SR' | 'SSR';
  description: string;
  abilityName: string;
  level: number; // 1-3
}

// ==================== 殖民地 ====================

export type ColonyPhase =
  | 'inactive'               // 未解锁
  | 'scouting'               // 探索中（等待2回合）
  | 'selecting'              // 选择星球
  | 'active';                // 殖民地运行中

export interface Colony {
  phase: ColonyPhase;
  scoutTurnsRemaining: number;  // 探索剩余回合
  planetType: PlanetTypeId | null;
  planetName: string;           // 玩家命名的星球名
  buildings: BuildingInstance[];
  population: Population;
  /** 本回合已招募人口数（用于「每回合最多招募 N 人」累计校验，回合推进时清零） */
  recruitedThisTurn: number;
  techState?: TechState;           // 科技状态（Phase 2）
  leaders: ColonyLeader[];           // 已招募的领袖
  leaderCap: number;                 // 领袖上限（基础3）
  scoutingPool?: PlanetTypeId[];     // 可选择的星球池（3个）
  recruitPool?: any[];               // 招募池（领袖选项，暂存）
  wonder?: WonderState;              // 奇观建设状态
  energy: number;                    // 当前净电能（-1以下=停电）
  expedition?: ExpeditionState;                 // 远征状态（领袖剧情树）
  expeditionEndings?: Record<string, string[]>; // 领袖 → 已触发结局 id（去重，12/12 解锁终极技能）
  expeditionUnlocks?: string[];                 // 已解锁终极技能的领袖 id
}

// ==================== 奇观 ====================

export type WonderId = 'dyson' | 'gate' | 'engine' | 'archive' | 'beacon';

export interface WonderStageDef {
  name: string;
  turns: number;
  gold: number;
  alloy: number;
  silicon: number;
  quantum: number;
  dark_matter: number;
  stardust: number;
  food: number;
  carbon: number;
  oil: number;
  gold_ore: number;
  research: number;
}

export interface WonderDef {
  id: WonderId;
  name: string;
  subtitle: string;
  description: string;
  stages: WonderStageDef[];
  preferredPlanets: string;
  totalLines: string[];
}

export type WonderPhase =
  | 'inactive'      // 未满足条件
  | 'selecting'     // 可选择奇观
  | 'building';     // 建设中





export interface WonderState {
  phase: WonderPhase;
  selectedWonderId: WonderId | null;
  currentStage: number;         // 0-based, 当前阶段索引
  stageProgress: number;        // 当前阶段已完成回合数
  totalTurnsSpent: number;      // 已花费的回合总数
  eventHistory: string[];       // 事件历史文本
  submittedThisTurn: boolean;   // 本回合是否已提交资源
}

// ==================== 远征（领袖剧情树） ====================

/** 远征节点：A（免费）→ B/C（消耗）→ D（结局，消耗+箴言） */
export interface ExpeditionNodeDef {
  id: string;                    // A1 / B4 / C7 / D7
  title: string;                 // 节点标题（不含层级前缀）
  text: string;                  // 正文
  /** 资源消耗（缺省=免费）。key：gold/food/alloy/stardust/原料id(silicon等)/researchPoints */
  cost?: Record<string, number>;
  /** 随机后继节点 id（A→2个B，B→2个C，C→1个D） */
  children?: string[];
  /** 结局节点（D） */
  isEnding?: boolean;
  /** 结局箴言（箴言回合显示） */
  motto?: string;
}

/** 单个领袖的远征路线（22 领袖同构，内容独立） */
export interface LeaderExpedition {
  leaderId: string;
  planetName: string;            // 第2回合 星球名
  planetIntro: string;           // 星球介绍
  landing: string;               // 降落正文
  nodes: Record<string, ExpeditionNodeDef>;
}

/** 远征运行状态（挂在 colony.expedition） */
export interface ExpeditionState {
  leaderId: string;
  /** 0准备 1降落 2A 3B 4C 5D 6箴言/记录 */
  stage: number;
  currentNodeId: string | null;  // 当前节点（B/C/D 需支付）
  /** 本回合是否已支付当前节点（回合结算重置） */
  paidThisTurn: boolean;
  startedTurn: number;
  /** 已抵达的结局节点 id（stage 6 时写入 expeditionEndings） */
  endingId: string | null;
}

// ==================== 帮助函数 ====================
// 人口上限的唯一真值是 lib/colony/colonyTurn.ts 的 calcPopCap（每回合写回 colony.population.cap），
// UI 只读取 population.cap，不再单独计算。原 getColonyPopCap 已废弃删除。
