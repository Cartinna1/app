// ==================== 星图与考古类型 ====================
// 星图：50 个固定节点（10 势力 / 10 殖民地 / 10 遗迹 / 20 空星系），布局固定，仅开局停泊点随机。
// 考古：10 处遗迹，每处 3~5 个阶段，需 1 名领袖驻守；阶段与奖励数据在 data/galaxy/archaeology.ts。

import type { PlanetTypeId } from './colony';

export type GalaxyNodeType = 'faction' | 'colony' | 'ruin' | 'empty';

/** 星图节点（固定布局；坐标为 SVG viewBox 1000×700 内的位置） */
export interface GalaxyNode {
  id: string;
  type: GalaxyNodeType;
  /** 节点名（未访问时对玩家隐藏，显示为「未知星系」） */
  name: string;
  x: number;
  y: number;
  /** type='faction' 时为势力 id */
  factionId?: string;
  /** type='colony' 时为星球类型（未到达前隐藏） */
  planetId?: PlanetTypeId;
  /** type='ruin' 时为遗迹 id（→ data/galaxy/archaeology.ts） */
  siteId?: string;
}

/** 航道（无向）；跃迁回合数由两端坐标距离推导，见 lib/galaxy/graph.ts 的 TURN_UNIT */
export interface GalaxyLane {
  a: string;
  b: string;
}

// ==================== 考古 ====================

/** 阶段投入（与 ResourcesChange 无关，扣减口径同远征：金币/食物/合金/星尘/原料扣母舰，科研点扣殖民地） */
export interface ArchaeologyCost {
  gold?: number;
  food?: number;
  alloy?: number;
  stardust?: number;
  researchPoints?: number;
  /** 原料 id → 数量（carbon/oil/silicon/quantum/dark_matter/gold_ore） */
  materials?: Record<string, number>;
}

/** 阶段抉择：二选一，只影响该阶段奖励与成功率，不影响能否推进 */
export interface ArchaeologyChoiceOption {
  label: string;
  description: string;
  /** 'safe' 安全低收益 / 'risky' 高风险高收益 */
  kind: 'safe' | 'risky';
}
export interface ArchaeologyChoice {
  prompt: string;
  options: ArchaeologyChoiceOption[];
}

/** 考古奖励（阶段小奖励与最终奖励共用同一形状） */
export interface ArchaeologyReward {
  /** 遗物 id（data/relics.ts） */
  relics?: string[];
  /** 永久加成 id（data/galaxy/permaBonuses.ts） */
  permaBonuses?: string[];
  gold?: number;
  stardust?: number;
  researchPoints?: number;
  food?: number;
  alloy?: number;
  materials?: Record<string, number>;
  /** 称号（结算/图鉴展示用） */
  title?: string;
}

/** 遗迹阶段 */
export interface ArchaeologyStage {
  /** 阶段 id：S1、S2… */
  id: string;
  title: string;
  /** 该阶段基础耗时（回合） */
  turns: number;
  /** 难度 0~3 → 成功率 −0.18×难度（唯一真值 lib/galaxy/archaeologyTurn.ts 的 DIFFICULTY_PENALTY） */
  difficulty: number;
  cost: ArchaeologyCost;
  /** 阶段叙事（中文，正常标点，不用破折号） */
  text: string;
  /** 预留阶段图片位：/archaeology/<siteId>/<stageId>.webp */
  image: string;
  /** 可选抉择 */
  choice?: ArchaeologyChoice;
  /** 阶段小奖励（成功时的「发现」也走这里） */
  bonus?: ArchaeologyReward;
}

/** 遗迹（10 处） */
export interface ArchaeologySite {
  id: string;
  name: string;
  /** 所属远古文明 */
  civilization: string;
  /** 驻守领袖等级门槛：0=无要求，2=Lv2+，3=Lv3 */
  minLeaderLevel: number;
  /** 危险触发概率（默认 0.35；碳壳巢 0.5） */
  dangerRate: number;
  /** 信息卡简介 */
  intro: string;
  /** 图鉴大图：/archaeology/<siteId>/cover.webp */
  galleryImage: string;
  /** 发掘被迫中止的剧情文案（每次自然失败按 `HALT_CHANCE` 掷一次，触发后该遗迹永久无法继续；由 resolveStage 写入事件日志与面板） */
  haltText: string;
  /** 中止剧情配图：/archaeology/<siteId>/halt.webp */
  haltImage: string;
  stages: ArchaeologyStage[];
  /** 全部阶段完成后的最终奖励 */
  reward: ArchaeologyReward;
}

// ==================== 运行状态 ====================

/** 单处遗迹的发掘状态（进度永久保留，可随时回来继续） */
export interface ArchaeologyState {
  /** 驻守领袖 id（来自 colony.leaders） */
  leaderId: string;
  /** 当前阶段下标（0 起） */
  stageIndex: number;
  /** 当前阶段剩余回合 */
  turnsLeft: number;
  /** 当前阶段连续失败次数（≥2 可「稳妥推进」） */
  fails: number;
  status: 'idle' | 'digging' | 'done' | 'collapsed';
  /** 待抉择的阶段 id（非空时 UI 必须先选，推进暂停） */
  pendingChoice: string | null;
  /** 该阶段的抉择取向：safe=成功率+10%、阶段小奖励减半；risky=成功率不变、阶段小奖励翻倍且失败必触发危险 */
  choiceKind?: 'safe' | 'risky' | null;
}

/** 星图运行状态（挂在 ships[0].galaxy） */
export interface GalaxyState {
  /** 母舰当前所在节点 */
  currentNodeId: string;
  /** 跃迁目标节点（跃迁中非空） */
  targetNodeId: string | null;
  /** 剩余跃迁回合数 */
  travelTurnsRemaining: number;
  /** 已到达过的节点（信息卡与势力关系探明的唯一依据） */
  visitedNodes: string[];
  /** 已建立殖民地的节点（全局限一颗） */
  colonizedNodeId: string | null;
  /** 各遗迹发掘状态（siteId → 状态） */
  archaeology: Record<string, ArchaeologyState>;
  /** 考古获得的永久加成 id（跃迁相关在此；殖民地相关由 economy 通过同一数组读取） */
  permaBonuses: string[];
  /** 考古获得的称号（图鉴展示用） */
  titles: string[];
}
