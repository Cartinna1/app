// ============================================================================
// 舰队卡牌战斗 · 机库（卡库 / 舰队 / 编成）渲染模型与可用性判定
//   —— 纯函数，**不依赖 React / DOM**（与 lib/battle/view.ts 同性质）。
//
// 唯一真值纪律（AGENTS 第三节）：
//   · 编成按「份数」：某 cardId 的**已编入份数 ≤ 卡库持有份数**（同型多艘 = 常态，编制示例里 h1×2 / c1×2 都是）。
//     卡库只有 1 份时编进 A 队后不能再编进 B 队；有 2 份时可以一队一份。
//   · 每队编制上限 = BATTLE_TUNING.fleetSize(30)，**唯一来源**，本文件与 reducer 都只读它。
//   · 「舰队是否正在出征」的唯一判据 = expedition.fleetId === 该队 id。
//   · **判定只有这一份**：reducer 的守卫与组件里的禁用提示都调本文件的 canXxx，不许再写第二份。
//
// 互斥规则两个方向都要挡（AGENTS 第九节「只挡一边等于没挡」）：
//   ① 出征中的舰队不能编成 / 改名 / 打防守标签 / 删除（onExpedition → canEdit=false）
//   ② 带防守标签的舰队不能出征（见 lib/battle/expedition.canStartExpedition）
// ============================================================================

import type { GameState } from '@/types/game';
import type { ShipCardId, ShipCardDef } from '@/types/battle';
import { BATTLE_CARDS, BATTLE_CARD_IDS } from '@/data/battle/cards';
import { BATTLE_TUNING } from '@/data/battle/tuning';
// 舰船图在战斗里的出口是「卡面 320×190」与「场上横条 370×144」，机库沿用同一套图位，
// 故复用 view.ts 的 unitArtSrc（内部已走 getThumbPath 缩略图，AGENTS 第五节：不许再写第二套命名）。
import { unitArtSrc } from './view';
// 机库「总览」标签要报船坞概况（几级 / 在建几艘 / 队列几项）：等级与中文名都只有 shipyard.ts 一份真值，
// 不在这里另写一遍判定（AGENTS 第三节）。⚠ 依赖是单向的：shipyard.ts 不 import 本文件，故不成环。
import { dockLevel, dockLevelText } from './shipyard';

/** 编成上下限提示用的余量：还能再编 5 份以上就只说"卡库还有 N 份"，不再报个位数 */
const AVAILABILITY_NOTE_MARGIN = 5;

/** 理由文案（判定与 UI 共用同一份字符串，避免两边各写一套） */
const R_EXPEDITION = '这支队正在出征途中，抵达开战前不能编成、改名、打标签或删除';
const R_NO_FLEET = '找不到这支队（可能已被删除）';
const R_NO_ENTRY = '这支队里没有这型战舰';
const R_FULL = (n: number): string => `这支队已编满 ${n} 艘`;
const R_NONE_LEFT = '卡库只剩 0 份可编入';
const R_PARTIAL = (n: number): string => `卡库只剩 ${n} 份可编入`;

// ---------------- 渲染模型 ----------------

/** 卡库里的一张卡（按 cardId 聚合） */
export interface LibraryRow {
  id: ShipCardId;
  name: string;
  series: string;
  rarity: string;
  cost: number;
  atk: number;
  shield: number;
  structure: number;
  /** 技能全文（卡面不放技能；机库固定区域的技能详情读它） */
  text: string;
  /** 卡面图位（已走缩略图） */
  artSrc: string;
  /** 卡库持有份数 */
  owned: number;
  /** 所有舰队一共编入份数 */
  assigned: number;
  /** = owned - assigned（还能编入几份） */
  available: number;
}

/** 舰队里的一员（按型聚合） */
export interface FleetMemberRow {
  id: ShipCardId;
  name: string;
  count: number;
  artSrc: string;
}

export interface FleetRow {
  id: string;
  name: string;
  defending: boolean;
  /** 该队已编入总数 */
  total: number;
  /** 上限（BATTLE_TUNING.fleetSize） */
  capacity: number;
  capacityLeft: number;
  /** 是否正在出征（= expedition.fleetId === 该队 id） */
  onExpedition: boolean;
  /** 能否编成/打标签/删除（出征中 = false） */
  canEdit: boolean;
  /** 能否**改名**（唯一真值 = canRenameFleet；目前与 canEdit 同值，但**必须分开表达**：
   *  UI 的「改名」按钮只许读它 —— 早先按钮读的是 canEdit，等于把"能不能改名"寄托在
   *  另一个语义的字段上，哪天两者分叉就会出现"按钮能点但点了没用"或反之） */
  canRename: boolean;
  /** 不能改名的中文原因（能改名时为空串；给按钮的 title 用） */
  renameReason: string;
  /** 按型聚合，保持首次出现顺序 */
  members: FleetMemberRow[];
}

/** 编成界面里的一行（逐型 `− 本队已编 Y / 卡库 Z +` 的完整取值） */
export interface FleetEditorRow {
  id: ShipCardId;
  name: string;
  series: string;
  rarity: string;
  cost: number;
  artSrc: string;
  /** 卡库持有份数 */
  owned: number;
  /** 本队已编入份数 */
  inFleet: number;
  /** 本队还能再编入几份（= 持有 − 各舰队已编总数，已按 0 收底；见 canAddShip） */
  canStillAdd: number;
  /** 能不能再编入本队一份 */
  canAdd: boolean;
  /** 不能再编入的原因（能编则 undefined） */
  addReason?: string;
  /** 能不能从本队卸下一份 */
  canRemove: boolean;
  /** 不能卸下的原因（能卸则 undefined） */
  removeReason?: string;
}

/** 顶部的机库总览 */
export interface HangarSummary {
  /** 卡库里的型数（不重复计数） */
  cardTypes: number;
  /** 卡库总艘数（含同型多份） */
  totalShips: number;
  fleetCount: number;
  /** 所有舰队一共编入的艘数 */
  assignedShips: number;
}

/** 判定结果（reason 是给 UI 直接显示的中文原因；能则 undefined） */
export interface HangarCheck {
  ok: boolean;
  reason?: string;
}

// ---------------- 基础取值 ----------------

/** 卡牌定义；未知 id 返回 undefined（调用方兜底，不抛） */
function defOf(cardId: ShipCardId): ShipCardDef | undefined {
  return BATTLE_CARDS[cardId];
}

/** 卡库里有几份这张卡（按份数比较，不按"存在与否"） */
export function countInCardLibrary(cardLibrary: ShipCardId[], cardId: ShipCardId): number {
  let n = 0;
  for (const id of cardLibrary) if (id === cardId) n++;
  return n;
}

/** 所有舰队一共编入了几份这张卡 */
export function countInFleets(fleets: GameState['fleets'], cardId: ShipCardId): number {
  let n = 0;
  for (const f of fleets) {
    for (const id of f.shipIds) if (id === cardId) n++;
  }
  return n;
}

/** 一支舰队是否正在出征（唯一判据） */
export function isFleetOnExpedition(state: GameState, fleetId: string): boolean {
  return state.expedition !== null && state.expedition.fleetId === fleetId;
}

/** 某卡在卡库里还能编入几份（= 持有 − 已编入，负数按 0 处理） */
function availableOf(state: GameState, cardId: ShipCardId): number {
  const left = countInCardLibrary(state.cardLibrary, cardId) - countInFleets(state.fleets, cardId);
  return left > 0 ? left : 0;
}

/** 卡面图位：复用战斗图位（统一走缩略图） */
export function cardArtSrc(cardId: ShipCardId): string {
  return unitArtSrc(cardId);
}

// ---------------- 排序 ----------------

/** id 升序比较（卡 id 是 'h1' / 'c4' 这种短标识，直接按代码单元比即可） */
function compareId(a: string, b: string): number {
  return a < b ? -1 : a > b ? 1 : 0;
}

// ---------------- 卡库 ----------------

/**
 * 卡库行（按 系列 → 费用 → id 稳定排序）。
 * 覆盖范围 = 卡库里的每一种卡 **并上** 已编入舰队的每一种卡：
 *  · 只有卡库 `cardLibrary` 才是"玩家拥有什么"的真值（战舰全靠船坞建造，卡库初始为空）；
 *  · 但若存档里出现"编入了但卡库没有"的型（旧档 / 数据变动），也要能在界面上看见并卸下，
 *    否则那份编制会变成一个看不见、卸不掉的幽灵（份数校验只保证"编入 ≤ 持有"，不保证逆向）。
 *  · 海盗卡 / 衍生单位（token）正常进不了卡库；万一进了也照样显示，不做静默过滤。
 */
export function libraryRows(state: GameState): LibraryRow[] {
  const owned = new Map<ShipCardId, number>();
  for (const id of state.cardLibrary) owned.set(id, (owned.get(id) || 0) + 1);
  const assigned = new Map<ShipCardId, number>();
  for (const f of state.fleets) {
    for (const id of f.shipIds) assigned.set(id, (assigned.get(id) || 0) + 1);
  }
  const ids: ShipCardId[] = [];
  for (const id of BATTLE_CARD_IDS) if (owned.has(id) || assigned.has(id)) ids.push(id);

  const rows = ids.map((id) => {
    const d = defOf(id);
    const o = owned.get(id) || 0;
    const a = assigned.get(id) || 0;
    return {
      id,
      name: d ? d.name : id,
      series: d ? d.series : '未知',
      rarity: d ? d.rarity : '白',
      cost: d ? d.cost : 0,
      atk: d ? d.atk : 0,
      shield: d ? d.shield : 0,
      structure: d ? d.structure : 0,
      text: d ? d.text : '（未知卡型：数据里找不到这张卡）',
      artSrc: cardArtSrc(id),
      owned: o,
      assigned: a,
      available: o - a > 0 ? o - a : 0,
    };
  });

  rows.sort((x, y) => {
    // 系列按字符串升序（中文按代码单元，是**稳定且与调用顺序无关**的固定次序）；
    // 同系列再按费用升序，同费用按 id 升序 —— 三级键保证排序结果唯一且稳定。
    const sx = compareId(x.series, y.series);
    if (sx !== 0) return sx;
    if (x.cost !== y.cost) return x.cost - y.cost;
    return compareId(x.id, y.id);
  });
  return rows;
}

// ---------------- 舰队 ----------------

export function fleetRows(state: GameState): FleetRow[] {
  return state.fleets.map((f) => {
    // 编制上限的唯一来源：data/battle/tuning.ts 的 fleetSize
    const total = f.shipIds.length;
    const capacityLeft = BATTLE_TUNING.fleetSize - total;
    const order: ShipCardId[] = [];
    const counts = new Map<ShipCardId, number>();
    for (const id of f.shipIds) {
      if (!counts.has(id)) order.push(id);
      counts.set(id, (counts.get(id) || 0) + 1);
    }
    const onExpedition = isFleetOnExpedition(state, f.id);
    // 改名可用性只认 canRenameFleet（唯一真值），**不在 UI 里另判一次**。
    // ⚠ canRenameFleet / canDeleteFleet 声明在本函数下方 —— 函数声明提升，调用合法；
    //   保持"判定区"集中在一处，比为了阅读顺序把它们前移更不容易改错。
    const rename = canRenameFleet(state, f.id);
    return {
      id: f.id,
      name: f.name,
      defending: f.defending,
      total,
      capacity: BATTLE_TUNING.fleetSize,
      capacityLeft: capacityLeft > 0 ? capacityLeft : 0,
      onExpedition,
      canEdit: !onExpedition,
      canRename: rename.ok,
      renameReason: rename.reason || '',
      members: order.map((id) => {
        const d = defOf(id);
        return { id, name: d ? d.name : id, count: counts.get(id) || 0, artSrc: cardArtSrc(id) };
      }),
    };
  });
}

// ---------------- 能不能做 ----------------

/**
 * 能否把该型再编入该队一份。
 * 判定顺序：舰队存在 → 不在出征 → 编制未满 → 卡库还有份数。
 * 「编入份数 ≤ 卡库持有份数」这一条同时精确表达了 V1.5 §10.1「一艘战舰同一时间只能编入一个舰队」
 * （卡库 1 份 → 编进 A 队后 B 队被拒；卡库 2 份 → 一队一份）。
 */
export function canAddShip(state: GameState, fleetId: string, cardId: ShipCardId): HangarCheck {
  const fleet = state.fleets.find((f) => f.id === fleetId);
  if (!fleet) return { ok: false, reason: R_NO_FLEET };
  if (isFleetOnExpedition(state, fleetId)) return { ok: false, reason: R_EXPEDITION };
  if (fleet.shipIds.length >= BATTLE_TUNING.fleetSize) return { ok: false, reason: R_FULL(BATTLE_TUNING.fleetSize) };
  const left = availableOf(state, cardId);
  if (left <= 0) return { ok: false, reason: R_NONE_LEFT };
  if (left < AVAILABILITY_NOTE_MARGIN) return { ok: true, reason: R_PARTIAL(left) };
  return { ok: true };
}

/** 能否从该队卸下一份该型 */
export function canRemoveShip(state: GameState, fleetId: string, cardId: ShipCardId): HangarCheck {
  const fleet = state.fleets.find((f) => f.id === fleetId);
  if (!fleet) return { ok: false, reason: R_NO_FLEET };
  if (isFleetOnExpedition(state, fleetId)) return { ok: false, reason: R_EXPEDITION };
  if (fleet.shipIds.indexOf(cardId) < 0) return { ok: false, reason: R_NO_ENTRY };
  return { ok: true };
}

/** 能否删除该队（出征中不能删：删了出征会停在 0 回合永不开战） */
export function canDeleteFleet(state: GameState, fleetId: string): HangarCheck {
  const fleet = state.fleets.find((f) => f.id === fleetId);
  if (!fleet) return { ok: false, reason: R_NO_FLEET };
  if (isFleetOnExpedition(state, fleetId)) return { ok: false, reason: R_EXPEDITION };
  return { ok: true };
}

/** 能否切换该队的防守标签（出征中不能打标签；反向由 canStartExpedition 挡） */
export function canToggleDefending(state: GameState, fleetId: string): HangarCheck {
  const fleet = state.fleets.find((f) => f.id === fleetId);
  if (!fleet) return { ok: false, reason: R_NO_FLEET };
  if (isFleetOnExpedition(state, fleetId)) return { ok: false, reason: R_EXPEDITION };
  return { ok: true };
}

/** 能否改名（改名也归"编成/操作"，出征中一律不许动） */
export function canRenameFleet(state: GameState, fleetId: string): HangarCheck {
  return canDeleteFleet(state, fleetId);
}

/**
 * 编成界面逐型的取值（`− 本队已编 Y / 卡库 Z +`）。
 * 覆盖范围 = 卡库里的每一种卡（遍历完整数组，不截断）。
 * 只列**卡库持有**的型：卡库是"能编什么"的唯一真值，本队已编的型必然也在卡库里
 * （份数校验只保证"编入 ≤ 持有"）。
 * canAdd / canRemove 直接来自 canAddShip / canRemoveShip，**判定不在这里重算**。
 */
export function fleetEditorRows(state: GameState, fleetId: string): FleetEditorRow[] {
  const fleet = state.fleets.find((f) => f.id === fleetId);
  if (!fleet) return [];
  const ids: ShipCardId[] = [];
  const seen = new Set<ShipCardId>();
  for (const id of state.cardLibrary) {
    if (!seen.has(id)) {
      seen.add(id);
      ids.push(id);
    }
  }

  const rows = ids.map((id) => {
    const d = defOf(id);
    const add = canAddShip(state, fleetId, id);
    const remove = canRemoveShip(state, fleetId, id);
    let inFleet = 0;
    for (const cid of fleet.shipIds) if (cid === id) inFleet++;
    return {
      id,
      name: d ? d.name : id,
      series: d ? d.series : '未知',
      rarity: d ? d.rarity : '白',
      cost: d ? d.cost : 0,
      artSrc: cardArtSrc(id),
      owned: countInCardLibrary(state.cardLibrary, id),
      inFleet,
      canStillAdd: availableOf(state, id),
      canAdd: add.ok,
      addReason: add.reason,
      canRemove: remove.ok,
      removeReason: remove.reason,
    };
  });

  rows.sort((x, y) => {
    const sx = compareId(x.series, y.series);
    if (sx !== 0) return sx;
    if (x.cost !== y.cost) return x.cost - y.cost;
    return compareId(x.id, y.id);
  });
  return rows;
}

// ---------------- 顶部总览 ----------------

export function hangarSummary(state: GameState): HangarSummary {
  const types = new Set<ShipCardId>();
  for (const id of state.cardLibrary) types.add(id);
  let assignedShips = 0;
  for (const f of state.fleets) assignedShips += f.shipIds.length;
  return {
    cardTypes: types.size,
    totalShips: state.cardLibrary.length,
    fleetCount: state.fleets.length,
    assignedShips,
  };
}

// ============================================================================
// 机库内部四个标签（总览 / 卡库 / 船坞 / 编队）
//   ⚠ 标签 id 放在 lib 而不是组件里：**"下一步该去哪"的引导要给出目标标签**
//     （卡库为空 → 去船坞；有船没编队 → 去编队），这句引导是派生逻辑不是渲染细节，
//     放这里才能被 check-battle 的纯函数验收覆盖。
// ============================================================================

/** 机库内部的四个标签（与 components/hangar/HangarTab 的标签栏一一对应） */
export type HangarTabId = 'overview' | 'library' | 'shipyard' | 'fleet';

/** 标签 id → 中文名（**唯一真值**：标签栏与引导文案都读它，不许两边各写一份） */
export const HANGAR_TAB_LABEL: Record<HangarTabId, string> = {
  overview: '总览',
  library: '卡库',
  shipyard: '船坞',
  fleet: '编队',
};

/** 引导里"去哪"的三个去向（= 需要玩家动作的标签；`overview` 不会是引导目标） */
export type HangarGuideTab = 'library' | 'shipyard' | 'fleet';

/**
 * 「下一步该去哪」的引导（机库总览标签的那一句）。
 * 判据只有两条，按"挡路程度"排先后：
 *   ① 卡库一艘都没有 → 造舰是**唯一**能推进的事，指向船坞；
 *      （卡库为空时一定是 `no_dock` 或 `need_dock` 两种情况 —— 有船坞就会显示"造船台是空的"）
 *   ② 卡库有船、但一支舰队都没编入 → 兵在手上却没上阵，指向编队；
 *   ③ 都做完了（或"已有编制、只是还能再多编几艘"）→ 给一句中性状态。
 * ⚠ 不新增任何判定口径：全都读 `hangarSummary`（卡库/舰队/已编的唯一真值）。
 */
export interface HangarGuide {
  /** 这一步指向哪个标签（只用 `HANGAR_TAB_LABEL` 能取到中文名的三个之一） */
  tab: HangarGuideTab;
  /** 目标标签的中文名（= HANGAR_TAB_LABEL[tab]，UI 直接渲染，不用自己查表） */
  label: string;
  /** 引导正文（UI 直接显示） */
  text: string;
  /** 这一步属于哪一类（`need_dock` = 连船坞都没有，UI 想加重语气时用它） */
  kind: 'no_dock' | 'need_dock' | 'need_assign' | 'ready';
}

export function hangarGuide(state: GameState): HangarGuide {
  const summary = hangarSummary(state);
  if (summary.totalShips === 0) {
    const dock = dockLevel(state);
    if (dock === 0) {
      return {
        tab: 'shipyard',
        label: HANGAR_TAB_LABEL.shipyard,
        kind: 'no_dock',
        text: '下一步：卡库是空的，而且还没有船坞。去「船坞」标签看三级船坞的造价与解锁条件，先把一级船坞建起来，再下单造第一批战舰。',
      };
    }
    return {
      tab: 'shipyard',
      label: HANGAR_TAB_LABEL.shipyard,
      kind: 'need_dock',
      text: `下一步：卡库是空的，去「船坞」标签下单造舰（当前${dockLevelText(dock)}，同时可造 2 艘，完工的当回合自动进卡库）。`,
    };
  }
  if (summary.assignedShips === 0) {
    return {
      tab: 'fleet',
      label: HANGAR_TAB_LABEL.fleet,
      kind: 'need_assign',
      text: `下一步：卡库有 ${summary.totalShips} 艘战舰，但一支舰队都还没编入。去「编队」标签新建一支舰队，或先点选一张卡再用上面的「编入当前舰队」。`,
    };
  }
  return {
    tab: 'fleet',
    label: HANGAR_TAB_LABEL.fleet,
    kind: 'ready',
    text: `已有 ${summary.assignedShips} 艘编入舰队（共 ${summary.fleetCount} 支）。可以继续在「编队」标签调整编制、打防守标签，或去「战斗」页签安排出征。`,
  };
}

/** 机库总览标签里的"船坞概况"一行（当前几级 / 在建几艘 / 队列几项） */
export interface HangarOverview {
  /** 卡库与舰队的四个数字（= hangarSummary，原样透出，避免 UI 再算一遍） */
  summary: HangarSummary;
  /** 船坞等级（0 = 没建） */
  dockLevel: 0 | 1 | 2 | 3;
  /** 船坞等级的中文名（`未建造船坞` 等，唯一真值在 shipyard.dockLevelText） */
  dockText: string;
  /** 已开工几艘（占同时建造位；上限 = shipyard.MAX_CONCURRENT_BUILDS） */
  building: number;
  /** 正在开工的第一艘（队列里第一个 active 项的**卡名**；没有已开工项时为 null） */
  currentCardName: string | null;
  /** 队列总项数（在建 + 排队；排队无限，§11 #5） */
  queueTotal: number;
  /** 「下一步该去哪」的引导 */
  guide: HangarGuide;
}

/**
 * 机库总览标签的整份渲染模型。
 * ⚠ **遍历完整队列**（不 slice）：在建数与总数都是数出来的，`currentCardName` 取第一个已开工项。
 */
export function hangarOverview(state: GameState): HangarOverview {
  const queue = state.buildQueue;
  let building = 0;
  let firstActive: ShipCardId | null = null;
  for (const item of queue) {
    if (!item.active) continue;
    building++;
    if (firstActive === null) firstActive = item.cardId;
  }
  const d = firstActive !== null ? defOf(firstActive) : undefined;
  const level = dockLevel(state);
  return {
    summary: hangarSummary(state),
    dockLevel: level,
    dockText: dockLevelText(level),
    building,
    currentCardName: firstActive !== null ? (d ? d.name : firstActive) : null,
    queueTotal: queue.length,
    guide: hangarGuide(state),
  };
}
