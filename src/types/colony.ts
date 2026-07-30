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
  | 'functional'; // 功能类

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
  outputType?: 'food' | 'alloy' | 'stardust' | 'gold' | 'research' | 'material';
  outputMaterialId?: string; // 原料类产出对应的 materialId
  /** 产出基准值，产出=(baseOutput + popFactor×入驻人口) */  
  baseOutput?: number;
  popFactor?: number;
  /** 贸易类产出区间 */
  goldOutputMin?: number;
  goldOutputMax?: number;
  requiresTech?: string;     // 需要的前置科技ID（Phase 2）
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
  techState?: TechState;           // 科技状态（Phase 2）
  leaders: ColonyLeader[];           // 已招募的领袖
  leaderCap: number;                 // 领袖上限（基础3）
  scoutingPool?: PlanetTypeId[];     // 可选择的星球池（3个）
  recruitPool?: any[];               // 招募池（领袖选项，暂存）
  wonder?: WonderState;              // 奇观建设状态
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

export type WonderEventType =
  | 'tech_breakthrough'
  | 'construction_accident'
  | 'faction_intervention'
  | 'unexpected_discovery'
  | 'plague_outbreak'
  | 'sabotage'
  | 'leader_sacrifice';

export interface WonderEventDef {
  id: WonderEventType;
  name: string;
  description: string;
  optionA: { label: string; effect: string };
  optionB: { label: string; effect: string };
}

export interface WonderState {
  phase: WonderPhase;
  selectedWonderId: WonderId | null;
  currentStage: number;         // 0-based, 当前阶段索引
  stageProgress: number;        // 当前阶段已完成回合数
  eventPending: WonderEventType | null;  // 当前待处理事件
  totalTurnsSpent: number;      // 已花费的回合总数
  eventHistory: string[];       // 事件历史文本
}

// ==================== 帮助函数 ====================

export function getColonyPopCap(colony: Colony, buildingDefs: BuildingDef[]): number {
  let cap = 5; // 基础5
  if (colony.planetType) {
    // 星球环境可能自带初始上限
  }
  for (const inst of colony.buildings) {
    if (!inst.active) continue;
    const def = buildingDefs.find((d) => d.id === inst.defId);
    if (!def || def.category !== 'housing') continue;
    if (def.id === 'B1') cap += 5;
  }
  return cap;
}
