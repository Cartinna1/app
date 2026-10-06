// ============================================================================
// 舰队卡牌战斗 · 船坞与造舰（V1.5 §8「殖民地建筑与战舰生产」/ §9「战舰科技树」）
//   —— 纯函数，**不依赖 React / DOM**（与 lib/battle/hangar.ts 同性质）。
//
// 唯一真值纪律（AGENTS 第三节）：
//   · 造价：`稀有度基准 × 卡牌系数`，基准表与系数表都在本文件（`RARITY_BASELINE` /
//     `cardCoefficient`），**任何地方都不得再写一遍数字**。
//   · 建造门槛：稀有度 → 船坞等级（`RARITY_DOCK_LEVEL`）、系列 × 稀有度 → 科技
//     （`TECH_BY_SERIES`，前置链来自 §9：图解 → 精锐改装）。判定只有 `canBuild` 一份，
//     reducer 守卫、`canEnqueue` 与 UI 的禁用原因全部调它。
//   · 同时建造数：`MAX_CONCURRENT_BUILDS`（§11 #5「同时建造 2 艘 + 排队无限」，
//     §8.3「每座船坞同时可建造 2 艘」）——**只在这里出现一次**。
//   · 船坞等级：`dockLevel(state)` 读殖民地建筑列表，**不另存字段**。
//   · 卡库（`state.cardLibrary`）才是"玩家拥有什么"的真值；本文件只负责"造出来"。
//
// ⚠ 文档口径（V1.5 §8.2 / §8.3 / §9.1，逐条对照，勿凭常识补数）：
//   · 船坞 B32/B33/B34 电力 6 / 10 / 18（§11 #16 已定案）；
//   · 三级船坞分别产 白 / 蓝 / 紫+橙（§8.2），稀有度只作为建造门槛（§2）；
//   · 单舰造价 白 2000 金币+20 合金+5 硅片 / 蓝 6000+100+20 硅片 /
//     紫 15000+300+5 量子簇 / 橙 50000+800+10 暗物质+10 量子簇（§8.3）；
//   · 基础生产回合 白 1 / 蓝 2 / 紫 3 / 橙 4（§8.3）；
//   · 科技 T28–T36 共 9 个（§9.1 / §11 #17）：各系「蓝图解析」400 科研点 2 回合产蓝卡，
//     「精锐改装」1200 科研点 3 回合产紫橙、前置 = 本系蓝图解析；通用系只有蓝图解析。
//   · §8.3 的"基础生产回合"与"造船队列"都**不受星球建造回合修正影响**（那是建筑工期），
//     故本文件不引 lib/colony/costs，也没有任何星球/领袖倍率。
// ============================================================================

import type { GameState, Mothership } from '@/types/game';
import type { BattleRarity, ShipCardDef, ShipCardId } from '@/types/battle';
import { BATTLE_CARDS, BATTLE_CARD_IDS } from '@/data/battle/cards';
import { getBuildingDef } from '@/data/colony/buildings';
import { getTechById } from '@/data/colony/techs';
import { RESOURCE_LABELS } from '@/data/colony/expeditions';
import { firstMissing, flattenCost } from '@/lib/turn/resourceCost';
import { getThumbPath } from '@/lib/assetThumb';

/** ⚠ 本文件需要的类型从 types/* 导入；`GameState` 的 `buildQueue` 字段由 P8 新增（存档三处同步） */

// ---------------- 数值锚点（唯一真值；改数值只改这一段） ----------------

/** 同时建造数上限（§8.3「每座船坞同时可建造 2 艘」/ §11 #5） */
export const MAX_CONCURRENT_BUILDS = 2;

/** 可建造的三级船坞建筑 id（与 data/colony/buildings.ts 的 B32/B33/B34 一一对应） */
export const SHIPYARD_BUILDING_TIERS: readonly string[] = ['B32', 'B33', 'B34'];

/** 稀有度 → 需要的船坞等级（§8.2：一级产白、二级产蓝、三级产紫与橙） */
export const RARITY_DOCK_LEVEL: ReadonlyArray<{ rarity: BattleRarity; level: 1 | 2 | 3 }> = [
  { rarity: '白', level: 1 },
  { rarity: '蓝', level: 2 },
  { rarity: '紫', level: 3 },
  { rarity: '橙', level: 3 },
];

/** 船坞等级 → 该级船坞的可产稀有度文案。
 *  ⚠ 这是 `RARITY_DOCK_LEVEL` 的人话版；`data/colony/buildings.ts` 的 `getBuildingEffect` 因为
 *  不能反向 import 本文件（会成环）而自带一份同样的映射，**改这里要同步改那一份**。 */
export function dockRarityLabel(level: 1 | 2 | 3): string {
  if (level === 1) return '白';
  if (level === 2) return '蓝';
  return '紫、橙';
}

/** 稀有度基准造价（§8.3「单舰造价」，唯一真值） */
const RARITY_BASELINE: Record<BattleRarity, {
  gold: number;
  alloy: number;
  materials: Record<string, number>;
  turns: number;
}> = {
  白: { gold: 2000, alloy: 20, materials: { silicon: 5 }, turns: 1 },
  蓝: { gold: 6000, alloy: 100, materials: { silicon: 20 }, turns: 2 },
  紫: { gold: 15000, alloy: 300, materials: { quantum: 5 }, turns: 3 },
  橙: { gold: 50000, alloy: 800, materials: { dark_matter: 10, quantum: 10 }, turns: 4 },
};

/**
 * 卡牌系数：`稀有度基准 × 卡牌系数` 的那个系数（任务给定的造价公式，§8.3 的基准表是它的锚）。
 * ⚠ 文档没有给"卡牌系数"这一列（§8.3 只给了四档基准价），故系数由**卡牌自身的指挥度费用**
 *   线性派生，锚点取 3 费 = 1.00（低费便宜、高费贵），并四舍五入到 2 位小数、下限 0.7：
 *     系数 = max(0.7, round2(1 + (card.cost − 3) × 0.1))
 *   实测：1 费 → 0.8（白卡 1600 金币，基准 2000）；6 费 → 1.3（橙卡 65000 金币，基准 50000）。
 *   这是一个**有意登记为占位**的系数（AGENTS §10.3 的写法）：要改造价只动这一行。
 */
export function cardCoefficient(card: ShipCardDef): number {
  const raw = 1 + (card.cost - 3) * 0.1;
  return Math.max(0.7, Math.round(raw * 100) / 100);
}

/**
 * 系列 × 稀有度 → 解锁它的科技 id（§9.1 T28–T36）。
 * 白卡默认可造（§9「链式前置：白卡默认可造（一级船坞）」）→ 蓝图 = null；
 * 紫/橙卡由"精锐改装"解锁；通用系只有白与蓝，没有精锐改装（§9.1 末尾）。
 */
const TECH_BY_SERIES: Record<string, { blue: string | null; elite: string | null }> = {
  圣辉: { blue: 'T28', elite: 'T29' },
  铁血: { blue: 'T30', elite: 'T31' },
  灵能: { blue: 'T32', elite: 'T33' },
  财团: { blue: 'T34', elite: 'T35' },
  通用: { blue: 'T36', elite: null },
  海盗: { blue: null, elite: null }, // 海盗不可生产（§3：PvE 专属，不进入卡库）
};

/** 卡牌 → 需要的科技 id（不需要科技时 null）。稀有度→档位只在这里写一次。 */
export function requiredTechId(card: ShipCardDef): string | null {
  const map = TECH_BY_SERIES[card.series];
  if (!map) return null;
  return card.rarity === '蓝' ? map.blue : card.rarity === '紫' || card.rarity === '橙' ? map.elite : null;
}

/** 卡牌 → 需要的科技（返回科技定义；不需要科技时返回 null） */
function requiredTech(card: ShipCardDef): { id: string; name: string; costRP: number } | null {
  const id = requiredTechId(card);
  if (!id) return null;
  const tech = getTechById(id);
  return { id, name: tech ? tech.name : id, costRP: tech ? tech.costRP : 0 };
}

// ---------------- 建造队列形状 ----------------

/** 造船队列的一项。`active` = 已开工（占用同时建造位）；`turnsLeft` = 还剩几回合完工。
 *  `cost` 是**下单时实付**的造价（取消排队按它返还，避免"改了造价再取消"凭空生资源）。 */
export interface BuildQueueItem {
  cardId: ShipCardId;
  /** 已开工 = true（占同时建造位）；false = 还在排队 */
  active: boolean;
  /** 还剩几个游戏回合完工（active 才有意义；排队中保持初始值） */
  turnsLeft: number;
  /** 下单时实付的造价（取消排队时按它返还） */
  cost: { gold: number; alloy: number; materials: Record<string, number> };
}

/** 建造队列的整体视图（UI 直接渲染） */
export interface BuildQueueView {
  /** 已开工（最多 maxConcurrent 项）；tone = 'building' */
  building: BuildQueueRow[];
  /** 排队中（无限）；tone = 'waiting' */
  waiting: BuildQueueRow[];
  /** 同时建造数上限（= MAX_CONCURRENT_BUILDS） */
  maxConcurrent: number;
  /** 空闲的同时建造位（= maxConcurrent − building.length，负数收底为 0） */
  freeSlots: number;
  /** 是否已建成船坞（false → UI 给"先建船坞"的指引） */
  hasDock: boolean;
  /** 船坞等级（0 = 没建） */
  dockLevel: 0 | 1 | 2 | 3;
}

export interface BuildQueueRow {
  /** 在队列 `buildQueue` 里的下标（取消排队用它定位） */
  index: number;
  cardId: ShipCardId;
  name: string;
  series: string;
  rarity: string;
  /** 卡面图位（已走缩略图，AGENTS 第五节） */
  artSrc: string;
  turnsLeft: number;
  /** 本项的总工期（= buildTurns(cardId)），供进度显示 */
  totalTurns: number;
  tone: 'building' | 'waiting';
}

/**
 * 船坞里"还没解锁"的一档（同"需要几级船坞 + 需要哪些科技"归成一档）。
 * 数字与科技 id 全部从卡牌数据算出来，**没有任何硬编码**。
 */
export interface ShipyardLockedTier {
  /** 这一档对应几级船坞 */
  dockLevel: 1 | 2 | 3;
  /** 这一档里的稀有度（按 白 → 蓝 → 紫 → 橙 顺序），如 ['紫','橙'] */
  rarities: BattleRarity[];
  /** 这一档有几种卡（型数，不是张数） */
  cardCount: number;
  /** 这一档需要的科技 id（按数据顺序去重，如 ['T29','T31']）；白卡档为空数组 */
  techIds: string[];
  /** 要求的中文一行（**判定文案的唯一来源**）：`二级船坞 + T28/T30/T32/T34/T36` */
  requirement: string;
}

/** 未解锁卡的一行汇总（AGENTS 第九节：不许静默隐藏） */
export interface ShipyardLockedSummary {
  /** 未解锁共几种（型数） */
  total: number;
  /** 按"船坞等级 + 科技"分档（已解锁的档不出现） */
  tiers: ShipyardLockedTier[];
  /** 中文一行：`还有 22 种未解锁 · 蓝卡 7 种（需二级船坞 + T28/…）· 紫橙 15 种（需三级船坞 + …）` */
  text: string;
}

/** 船坞面板的整份渲染模型 */
export interface ShipyardView {
  /** 殖民地是否存在（不存在时整块给"先建立殖民地"的指引） */
  hasColony: boolean;
  /** 船坞等级（0 = 没建） */
  dockLevel: 0 | 1 | 2 | 3;
  /** 三级船坞各自"已建成几座"（0/1；上限 1 座） */
  built: Array<{ id: string; name: string; level: 1 | 2 | 3; count: number }>;
  /** **主列表**：只含已解锁的卡（白卡默认解锁；蓝/紫/橙要对应船坞 + 科技）。
   *  ⚠ 未解锁的卡不在这里，但绝**不静默隐藏** —— 见 `locked` 汇总行与 `allCards`。 */
  unlockedCards: ShipyardCardRow[];
  /** 全部可造卡（含未解锁的）：**遍历完整数组**，不 slice / 不 filter 静默截断。
   *  逐张给出 `unlocked` / `ok` / `reason` / `lockReason`；未解锁的卡不在主列表里，但总数与要求由 `locked` 汇总 */
  cards: ShipyardCardRow[];
  /** 未解锁卡的一行汇总（数量与要求都从数据算） */
  locked: ShipyardLockedSummary;
  /** 下一步解锁指引的一句中文（已全解锁 / 没有殖民地时为 null）——门槛文案只在 shipyard.ts 里写 */
  lockHint: string | null;
  /** 建造队列 */
  queue: BuildQueueView;
}

export interface ShipyardCardRow {
  id: ShipCardId;
  name: string;
  series: string;
  rarity: BattleRarity;
  /** 战斗内的指挥度费用（卡面徽章） */
  cost: number;
  atk: number;
  shield: number;
  structure: number;
  /** 技能全文（卡面不放技能；点选后在技能详情区显示） */
  text: string;
  /** 卡面图位（已走缩略图） */
  artSrc: string;
  /** 需要几级船坞 */
  dockLevel: 1 | 2 | 3;
  /** 需要的科技（不需要时 null） */
  techName: string | null;
  /** 造价（唯一真值 buildCost） */
  price: { gold: number; alloy: number; materials: Record<string, number> };
  /** 单艘建造回合数（唯一真值 buildTurns） */
  turns: number;
  /** 现在能不能造 */
  ok: boolean;
  /** 不能造的中文原因（能造则 undefined）——含"还没解锁"，也含"资源不足" */
  reason?: string;
  /** 是否已解锁（门槛 = 船坞等级 + 科技；**资源够不够不算解锁门槛**，买不起也要看得见） */
  unlocked: boolean;
  /** 还没解锁时的中文原因（已解锁则 undefined）；与 `reason` 同源（都是 lockGate 的那句话） */
  lockReason?: string;
}

// ---------------- 基础取值 ----------------

/** 卡牌定义；未知 id 返回 undefined（调用方兜底，不抛） */
function defOf(cardId: ShipCardId): ShipCardDef | undefined {
  return BATTLE_CARDS[cardId];
}

/** 玩家能不能造这张卡（海盗系 PvE 专属、衍生单位为 token —— 两者都不进卡库） */
function isBuildableCard(card: ShipCardDef): boolean {
  if (card.token) return false;
  if (card.series === '海盗') return false;
  return true;
}

/** 玩家的母舰（单舰队：恒取第一艘；没有则 undefined） */
function leadShip(state: GameState): Mothership | undefined {
  return state.ships[0];
}

/** 该卡需要几级船坞（白/蓝/紫/橙 → 一/二/三级，§8.2） */
export function requiredDockLevel(cardId: ShipCardId): 1 | 2 | 3 {
  const card = defOf(cardId);
  if (!card) return 1;
  const hit = RARITY_DOCK_LEVEL.find((r) => r.rarity === card.rarity);
  return hit ? hit.level : 1;
}

/** 单艘建造回合数（§8.3「基础生产回合」：白 1 / 蓝 2 / 紫 3 / 橙 4） */
export function buildTurns(cardId: ShipCardId): number {
  const card = defOf(cardId);
  if (!card) return 1;
  return RARITY_BASELINE[card.rarity]?.turns ?? 1;
}

/**
 * 造价（**唯一真值**：稀有度基准 × 卡牌系数，§8.3 的基准表 + 本文件的系数公式）。
 * 返回既有 cost 对象形状（`{ gold, alloy, materials }`），可直接交给
 * `flattenCost` / `canAfford` / `firstMissing` / `payCost`（与殖民地建造、远征支付同一套）。
 * 每项分别向上取整（不出现小数资源）。
 */
export function buildCost(cardId: ShipCardId): { gold: number; alloy: number; materials: Record<string, number> } {
  const card = defOf(cardId);
  if (!card) return { gold: 0, alloy: 0, materials: {} };
  const base = RARITY_BASELINE[card.rarity];
  if (!base) return { gold: 0, alloy: 0, materials: {} };
  const k = cardCoefficient(card);
  const materials: Record<string, number> = {};
  for (const [matId, amount] of Object.entries(base.materials)) {
    materials[matId] = Math.ceil(amount * k);
  }
  const cost: { gold: number; alloy: number; materials: Record<string, number> } = {
    gold: Math.ceil(base.gold * k),
    alloy: Math.ceil(base.alloy * k),
    materials,
  };
  cost.materials = materials;
  return cost;
}

/** 船坞等级（0 = 没建）。来源是殖民地建筑列表里**已建成**的 B32/B33/B34，**不另存字段**。
 *  同时建了两级船坞时取高者（等级不叠加：高级船坞也能产低级稀有度，§8.2）。 */
export function dockLevel(state: GameState): 0 | 1 | 2 | 3 {
  const colony = leadShip(state)?.colony;
  if (!colony || colony.phase !== 'active') return 0;
  let level: 0 | 1 | 2 | 3 = 0;
  for (const inst of colony.buildings) {
    if (!inst.active) continue;
    const def = getBuildingDef(inst.defId);
    if (!def || def.category !== 'shipyard') continue;
    const tier = (SHIPYARD_BUILDING_TIERS.indexOf(def.id) + 1) as 0 | 1 | 2 | 3;
    if (tier > level) level = tier;
  }
  return level;
}

/** 船坞是否已建成（= dockLevel > 0） */
export function hasDock(state: GameState): boolean {
  return dockLevel(state) > 0;
}

/** 当前已开工几艘（同时建造位占用数） */
export function activeBuildCount(queue: BuildQueueItem[]): number {
  let n = 0;
  for (const item of queue) if (item.active) n++;
  return n;
}

// ---------------- 能不能造 ----------------

/** 船坞等级的中文名（判定文案与 UI 共用） */
export function dockLevelText(level: 0 | 1 | 2 | 3): string {
  if (level === 1) return '一级船坞';
  if (level === 2) return '二级船坞';
  if (level === 3) return '三级船坞';
  return '未建造船坞';
}

/**
 * **解锁门槛的唯一判定**（船坞等级 + 科技），返回"能不能造"与"还差什么"的中文一句话。
 * 供 `canBuild`（再加资源一道）与 `shipyardView`（主列表 / 汇总行 / 下一档指引）共用，
 * UI 不许再写第二份等级/科技比较。
 *
 * ⚠ 口径（用户 2026-08 裁定）：**资源够不够不算解锁门槛** —— 买不起也要在列表里看得见，
 *   只是按钮禁用并给中文原因。故资源那道门只在 `canBuild` 里加，不在本函数里。
 */
export function lockGate(
  state: GameState,
  cardId: ShipCardId
): { unlocked: boolean; reason?: string; dockLevel: 1 | 2 | 3; techId: string | null } {
  const card = defOf(cardId);
  const dockNeed: 1 | 2 | 3 = card ? requiredDockLevel(cardId) : 1;
  const techId = card ? requiredTechId(card) : null;
  if (!card) return { unlocked: false, reason: '数据里找不到这张卡', dockLevel: dockNeed, techId };
  if (card.token) return { unlocked: false, reason: '衍生单位不能建造', dockLevel: dockNeed, techId };
  if (card.series === '海盗') {
    return {
      unlocked: false,
      reason: '海盗舰船是 PvE 专属，玩家不能建造（V1.5 §3）',
      dockLevel: dockNeed,
      techId,
    };
  }

  const ship = leadShip(state);
  const colony = ship?.colony;
  if (!ship || !colony || colony.phase !== 'active') {
    return {
      unlocked: false,
      reason: '还没有殖民地 —— 先在星图的星球上建立殖民地，再建造船坞（V1.5 §8）',
      dockLevel: dockNeed,
      techId,
    };
  }

  const level = dockLevel(state);
  const tech = requiredTech(card);
  if (level < dockNeed) {
    const techHint = tech ? `并研发科技「${tech.name}」（科研点 ${tech.costRP}）` : '';
    return {
      unlocked: false,
      reason: `需要${dockLevelText(dockNeed)}${techHint}（当前${level === 0 ? '还没有船坞' : `只有${dockLevelText(level)}`}）`,
      dockLevel: dockNeed,
      techId,
    };
  }
  if (tech && !(colony.techState?.researched || []).includes(tech.id)) {
    return {
      unlocked: false,
      reason: `需要科技「${tech.name}」（科研点 ${tech.costRP}，在殖民地页签研究）`,
      dockLevel: dockNeed,
      techId,
    };
  }
  return { unlocked: true, dockLevel: dockNeed, techId };
}

/** 某张卡是否**已解锁**（只判船坞等级 + 科技；资源不算门槛）。列表取舍与汇总行共用这一份。 */
export function cardUnlocked(state: GameState, cardId: ShipCardId): boolean {
  return lockGate(state, cardId).unlocked;
}

/**
 * 某张卡现在能不能造 + 不能造的中文原因。
 * 判定顺序：卡牌存在 → 可建造（非海盗/衍生） → 已建殖民地 → 船坞等级 → 科技 → 资源。
 * ⚠ 前三段与"船坞等级/科技"这两道门**全部来自 `lockGate`**（唯一真值），本函数只补最后一道资源门。
 * ⚠ "队列"这一条**故意不拦**：§11 #5「排队无限」，同时建造数只限制"开工"，见 advanceQueue。
 */
export function canBuild(state: GameState, cardId: ShipCardId): { ok: boolean; reason?: string } {
  const gate = lockGate(state, cardId);
  if (!gate.unlocked) return { ok: false, reason: gate.reason };

  const ship = leadShip(state);
  const colony = ship?.colony;
  if (!ship || !colony) return { ok: false, reason: '还没有殖民地 —— 先在星图的星球上建立殖民地，再建造船坞（V1.5 §8）' };
  const cost = flattenCost(buildCost(cardId));
  const missing = firstMissing(ship, colony, cost);
  if (missing) return { ok: false, reason: missing };
  return { ok: true };
}

/**
 * 能否把该卡加入造船队列。分工：
 *   · 门槛（**解锁**：船坞/科技 → `lockGate`；资源 → `firstMissing`）全部来自 `canBuild` ——
 *     本函数只加"下单"这一层，不重写门槛；
 *   · **队列长度不设上限**（§11 #5 排队无限），故这里不判队列；
 *   · `slots` 只用来决定新项是"开局即开工"还是"排队"。省略时按 state 现算。
 */
export function canEnqueue(state: GameState, cardId: ShipCardId): { ok: boolean; reason?: string } {
  return canBuild(state, cardId);
}

function enqueueStartsNow(_state: GameState, queue: BuildQueueItem[]): boolean {
  return activeBuildCount(queue) < MAX_CONCURRENT_BUILDS;
}

/**
 * 把一项加进队列（reducer 用）：已开工位有空则直接开工，否则排队。
 * 返回 { queue, started }（新数组，不改传入数组）。
 */
export function enqueueBuild(
  state: GameState,
  queue: BuildQueueItem[],
  cardId: ShipCardId,
): { queue: BuildQueueItem[]; started: boolean } {
  const cost = buildCost(cardId);
  const full = { gold: cost.gold || 0, alloy: cost.alloy || 0, materials: { ...(cost.materials || {}) } };
  const started = enqueueStartsNow(state, queue);
  const item: BuildQueueItem = {
    cardId,
    active: started,
    turnsLeft: buildTurns(cardId),
    cost: full,
  };
  return { queue: [...queue, item], started };
}

// ---------------- 取消 ----------------

const R_NO_ITEM = '这一项已经不在队列里了';
const R_ACTIVE = '已开工的战舰不能取消（V1.5 §8 没有中途终止生产的规则）';

/** 能否取消队列里某一项（**只有未开工的排队项可取消**；已开工的一律挡） */
export function canCancelBuild(queue: BuildQueueItem[], index: number): { ok: boolean; reason?: string } {
  if (index < 0 || index >= queue.length) return { ok: false, reason: R_NO_ITEM };
  if (queue[index].active) return { ok: false, reason: R_ACTIVE };
  return { ok: true };
}

/** 取消排队项 / 拆除建筑的返还比例（与殖民地建造一致：金币 ×0.4、合金与原料 ×0.7）。
 *  按**实付成本**算（`BuildQueueItem.cost`），返回既有 cost 对象形状，供 payCost 的反向入账用。 */
export const BUILD_REFUND_GOLD_RATIO = 0.4;
export const BUILD_REFUND_MATERIAL_RATIO = 0.7;

export function buildRefund(item: BuildQueueItem): { gold: number; alloy: number; materials: Record<string, number> } {
  const materials: Record<string, number> = {};
  for (const [matId, amount] of Object.entries(item.cost.materials || {})) {
    materials[matId] = Math.floor(amount * BUILD_REFUND_MATERIAL_RATIO);
  }
  return {
    gold: Math.floor((item.cost.gold || 0) * BUILD_REFUND_GOLD_RATIO),
    alloy: item.cost.alloy ? Math.floor(item.cost.alloy * BUILD_REFUND_MATERIAL_RATIO) : 0,
    materials,
  };
}

// ---------------- 队列推进 ----------------

/**
 * 队列推进一次（每个游戏回合调一次，由 useTurn 编排）。
 * 口径（§8.3 / §11 #5）：
 *   · 同时建造 **2 艘**（`MAX_CONCURRENT_BUILDS`）；排队项在同时位空出时**依次补位**；
 *   · 本回合新开工的那一项**不扣本回合的工期**（工期还没走），故只用 `turnsLeft - 1` 跑一遍：
 *     开工后的第一个回合末才减 1，`turnsLeft` 正好等于"还剩几回合"；
 *   · 完工项**从队列移除**，卡 id 收进 `completed`（由调用方写进 `cardLibrary` —— 卡库才是
 *     "玩家拥有什么"的唯一真值）；
 *   · `dockLv` 只用于"还能不能继续开工"的判定：0 级（拆了船坞 / 旧档）时**已开工的照常完工**，
 *     但**不再开新工**（否则可以拆掉船坞白嫖剩余产能）。
 */
export function advanceQueue(
  queue: BuildQueueItem[],
  dockLv: number,
): { queue: BuildQueueItem[]; completed: ShipCardId[] } {
  const completed: ShipCardId[] = [];
  const afterTick: BuildQueueItem[] = [];
  for (const item of queue) {
    if (!item.active) {
      afterTick.push(item);
      continue;
    }
    const turnsLeft = Math.max(0, item.turnsLeft - 1);
    if (turnsLeft <= 0) completed.push(item.cardId);
    else afterTick.push({ ...item, turnsLeft });
  }

  // 补位：同时位空出且船坞还在，就把最前面的排队项依次开工（本回合只开工、不走工期）
  const canStart = dockLv > 0;
  let slots = Math.max(0, MAX_CONCURRENT_BUILDS - activeBuildCount(afterTick));
  const next = afterTick.map((item) => {
    if (canStart && !item.active && slots > 0) {
      slots -= 1;
      return { ...item, active: true, turnsLeft: buildTurns(item.cardId) };
    }
    return item;
  });

  return { queue: next, completed };
}

// ---------------- 渲染模型 ----------------

function queueRow(item: BuildQueueItem, index: number): BuildQueueRow {
  const card = defOf(item.cardId);
  return {
    index,
    cardId: item.cardId,
    name: card ? card.name : item.cardId,
    series: card ? card.series : '未知',
    rarity: card ? card.rarity : '白',
    artSrc: cardArtSrc(item.cardId),
    turnsLeft: item.turnsLeft,
    totalTurns: buildTurns(item.cardId),
    tone: item.active ? 'building' : 'waiting',
  };
}

/** 卡面图位：复用战斗图位（lib/battle/view.unitArtSrc 已走 getThumbPath 缩略图）。
 *  ⚠ 这里**不 import view.ts**：view.ts 依赖 engine.ts（整台战斗引擎），船坞面板不该把它拖进来；
 *    路径规则与 `view.unitArtSrc` 逐字一致（同一份 getThumbPath），改路径规则要同时改两处。 */
export function cardArtSrc(cardId: ShipCardId): string {
  return getThumbPath(`/battle/units/${cardId}.webp`);
}

/** 建造队列视图（在建 2 格 + 排队列表） */
export function queueView(state: GameState): BuildQueueView {
  const queue = state.buildQueue;
  const building: BuildQueueRow[] = [];
  const waiting: BuildQueueRow[] = [];
  queue.forEach((item, index) => {
    const row = queueRow(item, index);
    if (item.active) building.push(row);
    else waiting.push(row);
  });
  const level = dockLevel(state);
  return {
    building,
    waiting,
    maxConcurrent: MAX_CONCURRENT_BUILDS,
    freeSlots: Math.max(0, MAX_CONCURRENT_BUILDS - building.length),
    hasDock: level > 0,
    dockLevel: level,
  };
}

/** 未解锁档的稀有度标签：「蓝卡」/「紫卡」/「紫橙卡」（与既有文案同一套说法） */
function lockedRarityLabel(rarities: BattleRarity[]): string {
  const rank: BattleRarity[] = ['白', '蓝', '紫', '橙'];
  const sorted = rank.filter((r) => rarities.includes(r));
  return `${sorted.join('')}卡`;
}

/**
 * 未解锁卡的一行汇总：**按「船坞等级 + 科技」分档**，各档的型数与要求全部从卡牌数据算出来
 * （不硬编码数字，也不硬编码科技 id）。
 * 例：`还有 22 种未解锁 · 蓝卡 7 种（需二级船坞 + T28/T30/T32/T34/T36）· 紫橙 15 种（需三级船坞 + …）`
 */
function lockedSummary(lockedRows: ShipyardCardRow[]): ShipyardLockedSummary {
  const byLevel = new Map<1 | 2 | 3, ShipyardCardRow[]>();
  for (const row of lockedRows) {
    const list = byLevel.get(row.dockLevel);
    if (list) list.push(row);
    else byLevel.set(row.dockLevel, [row]);
  }
  const order: Array<1 | 2 | 3> = [1, 2, 3];
  const tiers: ShipyardLockedTier[] = [];
  for (const dockNeed of order) {
    const rows = byLevel.get(dockNeed);
    if (!rows || rows.length === 0) continue;
    const rarities: BattleRarity[] = [];
    for (const r of ['白', '蓝', '紫', '橙'] as BattleRarity[]) {
      if (rows.some((row) => row.rarity === r)) rarities.push(r);
    }
    const techIds: string[] = [];
    for (const row of rows) {
      const rowCard = defOf(row.id);
      const id = rowCard ? requiredTechId(rowCard) : null;
      if (id && !techIds.includes(id)) techIds.push(id);
    }
    const requirement =
      `${dockLevelText(dockNeed)}${techIds.length > 0 ? ` + ${techIds.join('/')}` : ''}`;
    tiers.push({ dockLevel: dockNeed, rarities, cardCount: rows.length, techIds, requirement });
  }

  const parts = tiers.map((t) => `${lockedRarityLabel(t.rarities)} ${t.cardCount} 种（需${t.requirement}）`);
  const head = `还有 ${lockedRows.length} 种未解锁`;
  return { total: lockedRows.length, tiers, text: parts.length > 0 ? `${head} · ${parts.join(' · ')}` : head };
}

/** 下一步解锁指引的一句中文（已全部解锁 / 没有殖民地时 null）。
 *  ⚠ 门槛文案（几级船坞 + 哪些科技 + 哪些系列）只在 shipyard.ts 里生成，UI 不写第二份判断。 */
function lockHintText(view: {
  hasColony: boolean;
  locked: ShipyardLockedSummary;
  allCards: ShipyardCardRow[];
  dockLevel: 0 | 1 | 2 | 3;
}): string | null {
  if (!view.hasColony) return null;
  // 取**第一档还有没解锁卡的**档：不按"当前船坞等级 + 1"取 —— 三级船坞也可能还缺二级档的科技
  // （蓝卡要 T28/T30/T32/T34/T36），那时该提示的是那批科技，不是紫橙档。
  const next = view.locked.tiers[0];
  if (!next) return null;
  const names: string[] = [];
  for (const id of next.techIds) {
    const tech = getTechById(id);
    if (tech) names.push(`「${tech.name}」`);
  }
  // 本档涉及哪些系列（由卡牌数据反查，避免 UI 自己判断"哪个系列要哪个科技"）
  const series: string[] = [];
  for (const row of view.allCards) {
    if (row.dockLevel !== next.dockLevel) continue;
    const rowCard = defOf(row.id);
    const id = rowCard ? requiredTechId(rowCard) : null;
    if (id && next.techIds.includes(id) && !series.includes(row.series)) series.push(row.series);
  }
  const who = next.rarities.join('、');
  const ofSeries = series.length > 0 ? `，能造哪个系列由该系列的科技决定（对应 ${series.join(' / ')} 系）` : '';
  // 船坞已经够了（三级船坞还缺二级档的科技）时不要再让玩家"造一座他已有的船坞"
  const dockPart =
    view.dockLevel >= next.dockLevel
      ? `${dockLevelText(next.dockLevel)}已建成`
      : `先造「${dockLevelText(next.dockLevel)}」`;
  if (names.length > 0) {
    return `想造${who}卡：${dockPart}，再研发 ${names.join('、')}（V1.5 §9.1）${ofSeries}。`;
  }
  return `想造${who}卡：${dockPart}（这一档不需要科技）${ofSeries}。`;
}

/** 船坞面板的整份渲染模型（三级船坞状态 + **已解锁**可造卡列表 + 未解锁汇总 + 队列） */
export function shipyardView(state: GameState): ShipyardView {
  const ship = leadShip(state);
  const colony = ship?.colony;
  const level = dockLevel(state);
  const built = SHIPYARD_BUILDING_TIERS.map((id, i) => {
    const def = getBuildingDef(id);
    const count = colony ? colony.buildings.filter((b) => b.active && b.defId === id).length : 0;
    return {
      id,
      name: def ? def.name : id,
      level: (i + 1) as 1 | 2 | 3,
      count,
    };
  });

  // ⚠ **遍历完整数组**（BATTLE_CARD_IDS），逐张开出 unlocked / ok / reason，不 slice / 不 filter 静默截断
  //   （AGENTS 第九节）。海盗系与衍生单位不是"玩家能造的卡"，显示出来只会是永久禁用的噪音，
  //   故用 isBuildableCard 显式排除（这是**显式清单**，不是按能力过滤）。
  const cards: ShipyardCardRow[] = [];
  for (const id of BATTLE_CARD_IDS) {
    const card = defOf(id);
    if (!card || !isBuildableCard(card)) continue;
    // 门槛判定只有一份：解锁 = lockGate，能不能下单 = canBuild（= lockGate + 资源）
    const gate = lockGate(state, id);
    const check = canBuild(state, id);
    const tech = requiredTech(card);
    cards.push({
      id,
      name: card.name,
      series: card.series,
      rarity: card.rarity,
      cost: card.cost,
      atk: card.atk,
      shield: card.shield,
      structure: card.structure,
      text: card.text,
      artSrc: cardArtSrc(id),
      dockLevel: requiredDockLevel(id),
      techName: tech ? tech.name : null,
      price: buildCost(id),
      turns: buildTurns(id),
      ok: check.ok,
      reason: check.reason,
      unlocked: gate.unlocked,
      lockReason: gate.unlocked ? undefined : gate.reason,
    });
  }

  const unlockedCards = cards.filter((c) => c.unlocked);
  const lockedCards = cards.filter((c) => !c.unlocked);
  const locked = lockedSummary(lockedCards);
  const hasColony = !!colony && colony.phase === 'active';

  return {
    hasColony,
    dockLevel: level,
    built,
    unlockedCards,
    cards,
    locked,
    lockHint: lockHintText({ hasColony, locked, allCards: cards, dockLevel: level }),
    queue: queueView(state),
  };
}

/** 造价的中文一行（面板与日志共用）：`金币 2000 + 合金 20 + 硅片 5` */
export function formatBuildCost(cost: { gold?: number; alloy?: number; materials?: Record<string, number> }): string {
  const parts: string[] = [];
  if (cost.gold) parts.push(`${RESOURCE_LABELS.gold} ${cost.gold}`);
  if (cost.alloy) parts.push(`${RESOURCE_LABELS.alloy} ${cost.alloy}`);
  for (const [matId, amount] of Object.entries(cost.materials || {})) {
    parts.push(`${RESOURCE_LABELS[matId] || matId} ${amount}`);
  }
  return parts.join(' + ');
}

// ============================================================================
// ⚠ 下面这段注释是给"忘记同步存档"的人看的：
//   `buildQueue` 是 GameState 的持久化字段，加/改它必须照 AGENTS 第四节**四处同步**：
//     ① types/game.ts 声明  ② types/game.ts 的 SaveData Pick
//     ③ lib/save.ts buildSaveData  ④ lib/save.ts stateFromSave 兜底
//   + hooks/gameReducer.ts 的 createInitialGameState 初值必须与 ④ **逐字一致**（默认 []）。
// ============================================================================