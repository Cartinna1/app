// ==================== 殖民地被掠夺（V1.5 §10.2）纯逻辑 ====================
// 主游戏侧「掠夺循环」的**唯一真值**：触发前提与概率 / 两段窗口（预警 CD → 已抵达待战）/
// 免疫期 / 防守合并池 / 掠夺损失 / 掠夺战参战编制 / 可预告文案。useTurn、gameReducer、UI 都只调本文件，
// **不许在别处再写一份判定**（AGENTS 第三节单一真值）。
//
// 规则逐条出自《舰队卡牌游戏设计方案 V1.5》§10.2（§11 定案 #7 / #20 复核），
// 流程由**用户 2026-08 裁定**（两段窗口，取代"归零即自动开战"）：
//   · 触发条件（两条缺一不可）：**卡库拥有的战舰总数 ≥10 艘**后开始 ＋ **以存在殖民地为前提**
//   · 判定顺序：**先判殖民地、再掷骰**（没有殖民地时一次骰子都不掷）
//   · 每回合 **8%** 概率被 1-2 支海盗掠夺；"1-2 支"按 **50/50** 掷；2 支 = **连续打两场**
//   · **阶段 A（预警 CD）**：`RAID_WARNING_TURNS`(5) 回合倒计时，文案"海盗还有 N 回合抵达"，
//     这段只让玩家编/改防守队，**不给开战入口**
//   · **阶段 B（已抵达 · 待战）**：阶段 A 归零后**不自动开战** —— 掠夺舰队停在战斗页签等玩家点「开战」，
//     同时再给 `RAID_ARRIVED_TURNS`(5) 回合：到时仍未迎战即**自动失败 = 掠夺成功**（扣资源 + 免疫）
//   · 有防守舰队：所有防守舰队的舰船**合并进同一个部署池**接战；本体是玩家本人（**一条血，不重置**）
//   · 没有防守舰队（= 防守战打输，两者文档明说"完全一样"）：掠夺成功，
//     只损失**金币 + 原料**（星尘按用户裁定不动），各项**以当前持有量为上限**
//   · 掠夺结束后 **20 回合**内不再被掠夺（打赢 / 打输 / 被掠夺成功都免疫）
//   · 必须可预告（§10.2【补完·实现要求】）→ raidHintLines / tickRaid 出来的两个倒计时
//
// ⚠ 文档**没有**给的两处（不许"凭常识补数"，在此集中标注，详见交付报告）：
//   ① 损失**比例**：§10.2 只写"各项以当前持有量为上限" → 用户裁定：金币 20%、原料各自 1/3、不动星尘。
//   ② 掠夺队的卡池来源：§10.2 写"从尚未被打败的海盗星系里取"，但当前 GameState **没有**
//      "已打败的老巢"账本 → 暂与老巢共用 data/battle/pirates.ts 的 PIRATE_POOL（待办，勿在
//      engine.ts 里硬做）。
//
// ⚠ 本文件**不吃随机数**：所有掷骰由调用方取好随机数后传进来（便于测试），这里只做纯判定。
// ⚠ 不依赖 React/DOM，不做任何副作用。

import type { GameState } from '@/types/game';
import type { BattleRaidState, ShipCardId } from '@/types/battle';
import { BATTLE_TUNING } from '@/data/battle/tuning';
import { getMaterialName } from '@/data/materialNames';
import { colonyNodeId } from './expedition';

// ---------------- 数值锚点（V1.5 §10.2 + 用户 2026-08 裁定） ----------------

/** 每回合被掠夺的概率（§10.2 / §11 定案 #20：8%） */
export const RAID_CHANCE = 0.08;

/** 阶段 A：预警窗口（"海盗还有 N 回合抵达"）。START_RAID 用它置 raid.inTurns */
export const RAID_WARNING_TURNS = 5;

/** 阶段 B：海盗抵达后留给玩家的迎战窗口（再 N 回合不点「开战」就自动失败 = 掠夺成功）。
 *  用户 2026-08 裁定：阶段 A / B 各 5 回合，全程最长 10 回合。 */
export const RAID_ARRIVED_TURNS = 5;

/** 掠夺结束后的免疫回合数（§10.2：之后 20 回合内不再被掠夺）。
 *  **唯一真值**：reducer 从这里 import（原先写在 gameReducer.ts 里，已迁走，勿留第二份）。 */
export const RAID_IMMUNE_TURNS = 20;

/** 触发门槛：卡库拥有的战舰总数 ≥10 艘（§10.2 / §11 定案 #7） */
export const RAID_MIN_SHIPS = 10;

/** "1-2 支"按 50/50 掷（§10.2）：roll < 该值 → 1 支，否则 2 支（2 支 = 连打两场） */
export const RAID_SQUAD_SPLIT = 0.5;

/** ⚠ **用户裁定（2026-08），优先于 §10.2 原文**的损失口径：
 *  §10.2 写的是"只损失金币 + 原料 + 星尘"；用户改为：**不动星尘**，只扣金币与原料。 */
export const RAID_LOOT_GOLD_RATIO = 0.2;          // 金币 = 持有量的 20%
export const RAID_LOOT_MATERIAL_RATIO = 1 / 3;    // 原料 = 各自持有的 1/3（四舍五入）
//   ※ 星尘不参与损失：见下方 raidLootLoss 的 stardust 字段（恒 0）

/** 防守合并池上限（= §10.1 的舰队编制上限 30，唯一来源 BATTLE_TUNING.fleetSize，勿写死 30）。
 *  ⚠ §10.2 本身**没有**给合并池上限：§10.1 风险清单建议"给合并池设上限（例如 30，与编制上限一致）"，
 *  这里就取这个与编制同源的锚点。 */
export const RAID_POOL_CAP = BATTLE_TUNING.fleetSize;

/** 掠夺成功的**实扣**值（每项以当前持有量为上限） */
export interface RaidLootLoss {
  gold: number;
  /** §10.2 只列了"金币 + 原料 + 星尘"（原文"**只**损失…"），食物与合金不在列 → 恒为 0。
   *  字段保留是为了扣减与 UI 走同一形状（见 reducer 的 flattenCost / payCost）。 */
  food: number;
  alloy: number;
  stardust: number;
  /** 原料 id → 实扣数量（只列实扣 > 0 的） */
  materials: Record<string, number>;
}

/** 掠夺提示行（分级与 lib/turn/nextTurnHints 的 NextTurnHint 同形，供它直接并进预告） */
export interface RaidHintLine {
  id: string;
  severity: 'danger' | 'warn' | 'info';
  text: string;
}/** 掠夺当前处在哪一段（UI / useTurn 都只读它，不自己判 inTurns 与 arrivedTurns） */
export type RaidPhase = 'idle' | 'warning' | 'arrived';

/** 掠夺窗口的完整视图（战斗页签与"下一回合预告"共用同一份判定结果） */
export interface RaidStatusView {
  phase: RaidPhase;
  /** 阶段 A 还剩几回合抵达（其它阶段为 0） */
  turnsToArrival: number;
  /** 阶段 B 还剩几回合不迎战就自动失败（其它阶段为 0） */
  turnsToAutoLoot: number;
  /** 本次来了几支掠夺队（1 或 2；idle 时为 0） */
  raiders: number;
  /** 防守合并池的舰船数（阶段 A/B 都用它写文案；= lib/battle/raid.raidDefensePool 的长度） */
  defenseCount: number;
  /** 免疫期剩余回合数 */
  immuneTurns: number;
  /** 阶段 B 能不能点「开战」：有防守池才允许（空池点开战 = 白看一场必输战，用户裁定禁用） */
  canFight: boolean;
}

/** 掠夺状态的第一性模板（idle）：**唯一真值**，reducer 初值 / 存档兜底 / 各处收尾都从这里派生 */
export function idleRaidState(): BattleRaidState {
  return { inTurns: null, arrivedTurns: 0, immuneTurns: 0, raiders: 0, arrived: false };
}

/**
 * 阶段 A 的倒计时**只剩 0 回合**（= 海盗已经到了，只差把状态改成阶段 B）。
 * ⚠ 唯一真值：`raidStatus` 与 `raidResolution` 都读它，**UI 不许自己写 `inTurns === 0`**。
 * 为什么需要它：`tickRaid` 把阶段 A 的倒计时钳在 0，于是"本次 TICK 后归零"会**先**以
 * `inTurns: 0` 的形态落在状态里（阶段仍是 warning），必须等编排方派发 ARRIVE_RAID 才换段。
 * 这段时间里若界面显示"还有 0 回合抵达"、而开战入口又只在阶段 B 渲染，玩家就会看到
 * 一个**既没倒计时可走、也没有开战按钮**的死界面（用户 2026-08 截图实证）。
 * 所以把"归零"收敛成一个判据，让显示与转段都基于它。
 */
export function raidWarningElapsed(raid: BattleRaidState): boolean {
  return raid.inTurns !== null && raid.inTurns <= 0;
}

// ---------------- 阶段判定（两段窗口的唯一真值） ----------------

/** 现在处在哪一段：idle（没掠夺）/ warning（阶段 A 预警中）/ arrived（阶段 B 已抵达待战） */
export function raidPhase(raid: BattleRaidState): RaidPhase {
  if (raid.inTurns !== null) return 'warning';
  if (raid.arrivedTurns > 0) return 'arrived';
  return 'idle';
}

/** 掠夺窗口的完整视图（战斗页签与预告共用；判定与文案口径都在这里，UI 不重算） */
export function raidStatus(state: GameState): RaidStatusView {
  const raid = state.raid;
  const phase = raidPhase(raid);
  const defenseCount = raidDefensePool(state).length;
  return {
    phase,
    // ⚠ 阶段 A 的剩余回合**最少显示 1**：inTurns 归零的那一帧起 `raidResolution` 已经会给 'arrived'，
    //   界面绝不能再渲染出"还有 0 回合抵达"（那正是用户截图里那个死界面 —— 没倒计时可走、也没开战按钮）。
    turnsToArrival: phase === 'warning' ? Math.max(1, raid.inTurns as number) : 0,
    turnsToAutoLoot: phase === 'arrived' ? raid.arrivedTurns : 0,
    raiders: phase === 'idle' ? 0 : raid.raiders,
    defenseCount,
    immuneTurns: raid.immuneTurns,
    canFight: phase === 'arrived' && defenseCount > 0,
  };
}

// ---------------- 战斗页签「殖民地掠夺」卡片的整份渲染模型 ----------------

/**
 * 「殖民地掠夺」卡片要渲染的**全部内容**（判定、文案、开战按钮的可用性都在这里定死）。
 * 为什么抽到 lib：卡片里"现在该显示哪一段、开战按钮长什么样"是**派生逻辑**而不是排版细节，
 * 抽出来才能被 check-battle 的纯函数验收覆盖 —— `components/battle/BattleTab` 只负责把字段摆上去，
 * **不许自己判 inTurns / arrivedTurns，也不许自己写"还有 0 回合抵达"这类文案**。
 * ⚠ `showCard` 与 `showFightButton` 是**两个不同**的条件：前者 idle+免疫期也要显示（报免疫倒计时），
 *   后者只在阶段 B 出现（阶段 A 不给开战入口，用户 2026-08 裁定）。
 */
export interface RaidCardView {
  phase: RaidPhase;
  /** 整张卡是否渲染（没在途掠夺且不在免疫期时不出现，避免噪音） */
  showCard: boolean;
  /** 卡片左边框配色档（warning = 琥珀 / arrived = 红 / idle = 中性） */
  tone: 'warning' | 'arrived' | 'idle';
  /** 标题行右侧那句说明（唯一真值：概率与两个窗口常数） */
  subtitle: string;
  /** 主标题行（阶段 A 写"海盗还有 N 回合抵达"、阶段 B 写"海盗已抵达，还有 N 回合"、idle 写"海盗已退"） */
  headline: string;
  /** 阶段 A / B 都有的"本次几支掠夺队"后缀（1 支时为空串） */
  squadNote: string;
  /** 正文一句话（有/没有防守池两套口径，都由这里给出） */
  detail: string;
  /** 是否渲染「开战」按钮（**只在阶段 B**） */
  showFightButton: boolean;
  /** 开战按钮能不能点（= 阶段 B 且防守池非空） */
  canFight: boolean;
  /** 开战按钮旁边那行说明（手机端没有 hover，永远有一句话） */
  fightHint: string;
  /** 底部"海盗已退"那句（仅 idle + 免疫期） */
  idleText: string;
  /** 原始视图（数字徽章 / 防守池条数等仍可读它，UI 不重算） */
  status: RaidStatusView;
}

/** 掠夺卡的整份渲染模型（唯一真值；BattleTab 只渲染） */
export function raidCardView(state: GameState): RaidCardView {
  const status = raidStatus(state);
  const squads = status.raiders > 1
    ? `（本次 ${status.raiders} 支，赢下第一场要连打第二场）`
    : '';
  const subtitle = `每回合 ${RAID_CHANCE * 100}% 触发，${RAID_WARNING_TURNS} 回合预警，结束免疫 ${RAID_IMMUNE_TURNS} 回合`;

  if (status.phase === 'warning') {
    return {
      phase: status.phase,
      showCard: true,
      tone: 'warning',
      subtitle,
      headline: `海盗还有 ${status.turnsToArrival} 回合抵达`,
      squadNote: squads,
      detail: status.defenseCount > 0
        ? `现在有 ${status.defenseCount} 艘带「防守」标签的舰队会在抵达时合并成一个部署池（到那时再点「开战」）。`
        : '现在还没有带「防守」标签的舰队 —— 去机库给留守舰队打上防守标签（到达后不打会被掠夺成功）。',
      showFightButton: false,
      canFight: false,
      fightHint: '',
      idleText: '',
      status,
    };
  }

  if (status.phase === 'arrived') {
    return {
      phase: status.phase,
      showCard: true,
      tone: 'arrived',
      subtitle,
      headline: `海盗已抵达，还有 ${status.turnsToAutoLoot} 回合`,
      squadNote: squads,
      detail: status.defenseCount > 0
        ? `留守的 ${status.defenseCount} 艘带「防守」标签的舰队会合并成一个部署池接战；这 ${status.turnsToAutoLoot} 回合里还可以去机库调整编成与防守标签。`
        : '还没有挂防守标签的舰队 —— 现在去机库给留守舰队打上防守标签，再回来点「开战」；不打就会在倒计时归零时被掠夺成功。',
      showFightButton: true,
      canFight: status.canFight,
      fightHint: status.canFight
        ? `可以迎战：${status.defenseCount} 艘防守舰队合并接战`
        : '还没有挂防守标签的舰队',
      idleText: '',
      status,
    };
  }

  return {
    phase: status.phase,
    showCard: status.immuneTurns > 0,
    tone: 'idle',
    subtitle,
    headline: '',
    squadNote: '',
    detail: '',
    showFightButton: false,
    canFight: false,
    fightHint: '',
    idleText: `海盗已退（击退或已结算），${status.immuneTurns} 回合内不会再被掠夺。`,
    status,
  };
}

// ---------------- 倒计时（TICK 的唯一真值） ----------------

/**
 * 掠夺倒计时的一次推进（每游戏回合一次）：
 *   · 免疫期减 1（下限 0）；
 *   · **阶段 A**：`inTurns` 减 1（下限 0，到 0 就停在这里，由调用方按 `raidResolution` 转入阶段 B）；
 *   · **阶段 B**：`arrivedTurns` 减 1（下限 0，到 0 仍不迎战 → 调用方结算"掠夺成功"）。
 * **唯一真值**：reducer 的 TICK_BATTLE_STATE 与 useTurn 的"本次 TICK 之后"投影共用同一份算式
 * （useTurn 读到的是 dispatch 之前的状态，判定归零必须走这里，不能就地再减一次）。
 */
export function tickRaid(raid: BattleRaidState): BattleRaidState {
  const arrivedTurns = raid.arrivedTurns > 0 ? raid.arrivedTurns - 1 : 0;
  return {
    ...raid,
    immuneTurns: Math.max(0, raid.immuneTurns - 1),
    inTurns: raid.inTurns === null ? null : Math.max(0, raid.inTurns - 1),
    arrivedTurns,
  };
}

// ---------------- 触发判定 ----------------

/**
 * 掠夺的两条前提（§10.2）：**存在殖民地** ＋ **卡库战舰总数 ≥10 艘**。缺一不可。
 * 殖民地判据复用 lib/battle/expedition.colonyNodeId（与出征可用性同一个真值：
 * `colony.phase !== 'inactive'` 且星球类型能落到殖民地节点），**没有殖民地时永远不掷**。
 */
function canRaid(state: GameState): boolean {
  if (state.cardLibrary.length < RAID_MIN_SHIPS) return false;
  return colonyNodeId(state) !== null;
}

/**
 * 本回合是否触发掠夺（§10.2）。
 * 只吃一个 [0,1) 随机数（调用方负责取随机数），其余条件全在这里判：
 *   · 卡库战舰总数 ≥10 艘（§10.2 触发门槛）  · 存在殖民地（§10.2 前提）
 *   · 当前没有掠夺在途（阶段 A 与阶段 B 都不再掷）  · 不在免疫期（immuneTurns === 0）
 *   · 战斗进行中不掷（战斗期间本来也不允许结束游戏回合，这里是兜底）
 */
export function shouldStartRaid(roll: number, state: GameState): boolean {
  if (state.battle) return false;
  if (raidPhase(state.raid) !== 'idle') return false;
  if (state.raid.immuneTurns > 0) return false;
  if (!canRaid(state)) return false;
  return roll < RAID_CHANCE;
}

/** 本次来了几支掠夺队（§10.2：1-2 支按 50/50 掷；2 支 = 连打两场）。只吃一个 [0,1) 随机数。 */
export function raidSquadCount(roll: number): number {
  return roll < RAID_SQUAD_SPLIT ? 1 : 2;
}

// ---------------- 到场的走向 ----------------

/**
 * 防守舰队合并池（§10.2）：所有带 `defending` 标签的舰队，其战舰**合并**进同一个部署池，
 * 顺序 = 舰队顺序 → 队内顺序（合并顺序会影响部署时的卡序，故必须确定）。
 * 出征在外的舰队不会有防守标签（互斥由 lib/battle/hangar.canToggleDefending 与
 * expedition.canStartExpedition 两个方向挡着），故这里不额外判出征。
 * 池子按 RAID_POOL_CAP 截断（见该常量的说明）。
 */
export function raidDefensePool(state: GameState): ShipCardId[] {
  const pool: ShipCardId[] = [];
  for (const fleet of state.fleets) {
    if (!fleet.defending) continue;
    for (const id of fleet.shipIds) pool.push(id);
  }
  return pool.length > RAID_POOL_CAP ? pool.slice(0, RAID_POOL_CAP) : pool;
}

/**
 * 这一回合结束时掠夺该走哪条路（**两段窗口**，用户 2026-08 裁定）：
 *   'none'      无事（没有在途掠夺 / 阶段 A 还在倒数 / 阶段 B 还在等 / 战斗进行中）
 *   'arrived'   阶段 A 的倒计时归零 → **转入阶段 B**（海盗抵达、停在战斗页签等玩家开战，
 *               同时开始 `RAID_ARRIVED_TURNS` 的自动失败倒计时）——**不自动开战**
 *   'looted'    阶段 B 的倒计时归零（玩家一直没迎战）→ 自动失败 = 掠夺成功，结算资源损失
 *
 * ⚠ 参战/开战**不在这里**：玩家点「开战」才走 `readyRaidBattle`（唯一由玩家主动点开的战斗入口）。
 *
 * `afterTick` 是**兼容选项**（true = 调用方读到的是 TICK 之前的状态，"本次 TICK 后归零"等价于
 * `倒计时 <= 1`）。⚠ 它只是给一次性调用方的兜底：**useTurn 已经不传它了** —— 编排方改成先 `tickRaid`
 * 投影、再读投影后的状态（与出征 `readyExpedition` 现在的写法一致：那边连这个参数都删掉了）。
 * 转段的真正判据是 `raidWarningElapsed`（只看状态本身），与派发时序无关。
 */
export function raidResolution(state: GameState, afterTick = false): 'none' | 'arrived' | 'looted' {
  if (state.battle) return 'none';
  const phase = raidPhase(state.raid);
  if (phase === 'idle') return 'none';
  const threshold = afterTick ? 1 : 0;
  if (phase === 'warning') {
    // ⚠ 两个判据缺一不可：
    //   ① `raidWarningElapsed`（inTurns 已归零）—— 让"归零"本身就成为**与派发时序无关**的转段信号。
    //      少了它，转段就完全依赖"TICK 与新状态必须同批"这个隐含前提，一旦批边界落在两者之间、
    //      或这次 ARRIVE_RAID 被重放/丢弃，状态就会永久停在 `inTurns: 0 + arrivedTurns: 0`，
    //      界面卡在"还有 0 回合抵达"且永远没有开战按钮（P5 出征踩过的同一类 off-by-one）。
    //   ② `threshold`（afterTick 的前瞻）—— 保留原有的"本回合就该到"语义，不动既有行为。
    return raidWarningElapsed(state.raid) || (state.raid.inTurns as number) <= threshold ? 'arrived' : 'none';
  }
  // 阶段 B：倒计时归零仍未迎战 → 掠夺成功
  return state.raid.arrivedTurns <= threshold ? 'looted' : 'none';
}

/**
 * 阶段 B 的「开战」：玩家点了按钮才走这里 —— **这是全场唯一由玩家主动点开的战斗入口**。
 * 返回 null = 现在不能开战（不在阶段 B / 战斗进行中 / 没有防守舰队）。
 * 返回的编制即 `raidDefensePool`（合并池，与 §10.2 和 reducer 的参战池同源）。
 */
export function readyRaidBattle(state: GameState): { fleet: ShipCardId[] } | null {
  if (state.battle) return null;
  if (raidPhase(state.raid) !== 'arrived') return null;
  const fleet = raidDefensePool(state);
  if (fleet.length === 0) return null;   // 空池开战 = 白看一场必输战（UI 也把按钮禁用并写明原因）
  return { fleet };
}

/**
 * 掠夺战的参战编制（§10.2）。
 *   · 第一场：调用方传 raidDefensePool(state) 的合并池 → 无损失，原样返回（只按池上限截断）。
 *   · 第二场（2 支掠夺队连打两场）：调用方传**第一场的参战编制**。此时第一场被击毁的舰
 *     已从卡库与所有舰队移除（reducer 的 removeLostShips），故"与当前防守池取交集"
 *     即得**第一场未被击毁的舰**，顺序沿用第一场（§10.2：第一场未被击毁的舰带进第二场）。
 * ⚠ 本体血量不在这里：§10.2"本体就是玩家本人（一条血，不重置）"由 START 第二场的那一处
 *   直接抄第一场结束时的 `battle.player.body`（见 gameReducer 的 END_BATTLE），本函数只管编制。
 */
export function raidBattleFleet(state: GameState, pool: ShipCardId[]): ShipCardId[] {
  const left = new Map<ShipCardId, number>();
  for (const id of raidDefensePool(state)) left.set(id, (left.get(id) || 0) + 1);
  const out: ShipCardId[] = [];
  for (const id of pool) {
    const n = left.get(id) || 0;
    if (n <= 0) continue;               // 这一份已经在第一场被击毁（或已被玩家移出防守舰队）
    left.set(id, n - 1);
    out.push(id);
  }
  return out.length > RAID_POOL_CAP ? out.slice(0, RAID_POOL_CAP) : out;
}

// ---------------- 掠夺损失 ----------------

/** 单项实扣：按比例算"想拿多少"，再以当前持有量为上限收底（AGENTS 第九节：扣减每项以持有量为上限） */
function lootAmount(held: number, ratio: number): number {
  const want = Math.round(Math.max(0, held) * ratio);
  return Math.min(want, Math.max(0, held));
}

/**
 * 掠夺成功的资源损失（§10.2 ＋ 用户裁定）：**只**损失金币 + 原料，各项以当前持有量为上限。
 * 返回的是**实扣**值（调用方直接按它扣减，走 lib/turn/resourceCost 的 flattenCost / payCost）。
 * 金币例外（AGENTS 第九节）：已是负数的金币（破产中）不会被掠夺"抹平"，原样交给破产机制。
 */
export function raidLootLoss(state: GameState): RaidLootLoss {
  const ship = state.ships[0];
  if (!ship) return { gold: 0, food: 0, alloy: 0, stardust: 0, materials: {} };
  const materials: Record<string, number> = {};
  for (const [id, held] of Object.entries(ship.materials || {})) {
    const amount = lootAmount(held, RAID_LOOT_MATERIAL_RATIO);
    if (amount > 0) materials[id] = amount;
  }
  return {
    gold: lootAmount(ship.gold, RAID_LOOT_GOLD_RATIO),
    food: 0,      // §10.2 未列食物
    alloy: 0,     // §10.2 未列合金
    stardust: 0,  // **用户裁定：掠夺不动星尘**（§10.2 原文含星尘，已被覆盖）
    materials,
  };
}

/** 掠夺损失的中文说明（事件日志与结算文案共用；只写**实际扣到**的东西，AGENTS 第九节） */
export function raidLootText(loss: RaidLootLoss): string {
  const parts: string[] = [];
  if (loss.gold > 0) parts.push(`金币 ${loss.gold}`);
  if (loss.stardust > 0) parts.push(`星尘 ${loss.stardust}`);
  for (const [id, amount] of Object.entries(loss.materials)) {
    if (amount > 0) parts.push(`${getMaterialName(id)} ${amount}`);
  }
  if (parts.length === 0) return '殖民地里已经没什么可抢的了（金币与原料都已见底）';
  return `损失 ${parts.join('、')}（各项以当前持有量为上限）`;
}

// ---------------- 可预告（§10.2【补完·实现要求】） ----------------

/**
 * 掠夺的预告行（供 lib/turn/nextTurnHints 直接并进"下一回合预告"；战斗页签也读同一份文案口径）。
 * 分级沿用既有三档：**会掉资源** = danger；**要接战 / 已抵达待决策** = warn；免疫期 = info。
 * **阶段 A 与阶段 B 的文案必须能区分**（还没到 vs 到了但你不打就会自动失败）；
 * 没有在途掠夺且不在免疫期时不产生任何行（不加噪音）。
 */
export function raidHintLines(state: GameState): RaidHintLine[] {
  const out: RaidHintLine[] = [];
  const view = raidStatus(state);
  if (view.phase === 'warning') {
    const when = view.turnsToArrival <= 1 ? '下回合' : `${view.turnsToArrival} 回合后`;
    const squads = view.raiders > 1 ? `（本次 ${view.raiders} 支掠夺队，赢下第一场要连打第二场）` : '';
    if (view.defenseCount > 0) {
      out.push({
        id: 'raid_incoming',
        severity: 'warn',
        text: `海盗${when}抵达${squads}：留守的 ${view.defenseCount} 艘防守舰队会接战；防守战打输与没有防守一样会被掠夺`,
      });
    } else {
      out.push({
        id: 'raid_incoming',
        severity: 'danger',
        text: `海盗${when}抵达${squads}：没有带「防守」标签的舰队 —— 到时候不打就等着被掠夺（损失金币与原料）`,
      });
    }
  } else if (view.phase === 'arrived') {
    const squads = view.raiders > 1 ? `（本次 ${view.raiders} 支掠夺队，赢下第一场要连打第二场）` : '';
    if (view.defenseCount > 0) {
      out.push({
        id: 'raid_arrived',
        severity: 'warn',
        text: `海盗已抵达${squads}，还有 ${view.turnsToAutoLoot} 回合不迎战就会被掠夺成功 —— 去战斗页签点「开战」（留守的 ${view.defenseCount} 艘会合并接战）`,
      });
    } else {
      out.push({
        id: 'raid_arrived',
        severity: 'danger',
        text: `海盗已抵达${squads}，还有 ${view.turnsToAutoLoot} 回合：没有带「防守」标签的舰队 —— 到时会被掠夺成功，损失金币与原料（先给留守舰队打上防守标签）`,
      });
    }
  }
  if (state.raid.immuneTurns > 0) {
    out.push({
      id: 'raid_immune',
      severity: 'info',
      text: `海盗退去：${state.raid.immuneTurns} 回合内不会再被掠夺`,
    });
  }
  return out;
}