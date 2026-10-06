// ==================== 舰船卡牌战斗 · 类型 ====================
// 数值与规则的权威是《舰队卡牌游戏设计方案 V1.5》；
// 卡牌 / 海盗 / 编制的数据由 scripts/export-battle-data.cjs 从 carddemo/engine.js 导出，**勿手改数据文件**。
// 本文件只放类型与接口，不放数值（数值锚点唯一位置：data/battle/tuning.ts）。

import type { Rng } from '@/lib/battle/rng';

// ---------------- 静态数据 ----------------

/** 系列（5 个玩家系列 + 海盗；海盗为 PvE 专属，玩家永远不可获得） */
export type BattleSeries = '圣辉' | '铁血' | '灵能' | '财团' | '通用' | '海盗';

/** 稀有度：只作为建造门槛（一级/二级/三级船坞 + 对应科技）与视觉标识。
 *  衍生单位（token）永不建造，其 rarity 由导出脚本统一写成 '白'，语义用 `token: true` 表达 */
export type BattleRarity = '白' | '蓝' | '紫' | '橙';

/** 卡牌 id（引擎内部 id，如 'h3' = 审判巡洋舰） */
export type ShipCardId = string;

export interface ShipCardDef {
  id: ShipCardId;
  name: string;
  cost: number;
  atk: number;
  /** 护盾（被打伤且未击毁时，下回合起每回合 +1，不超此值） */
  shield: number;
  /** 结构值（永不回复；与护盾同时 ≤0 才下场） */
  structure: number;
  series: BattleSeries;
  rarity: BattleRarity;
  text: string;
  /** 衍生单位（召唤物）：不进卡库、被击毁不计入"永久损失" */
  token?: boolean;
}

/** 敌人 id：5 个老巢 BOSS + 掠夺队（无头目技能、20 血） */
export type PirateBossId = 'b1' | 'b2' | 'b3' | 'b4' | 'b5' | 'raid';

export interface PirateBossDef {
  id: PirateBossId;
  name: string;
  /** 敌方本体结构值（玩家本体固定 15） */
  hp: number;
  /** 头目技能文案（掠夺队为空技能） */
  skill: string;
}

// ---------------- 数值锚点（实现在 data/battle/tuning.ts） ----------------

export interface BattleTuning {
  /** 玩家本体结构值（= 玩家本人，不会消失，每场战斗后回满） */
  bodyHp: number;
  /** 先手第 1 回合指挥度 */
  firstCap: number;
  /** 后手第 1 回合指挥度 */
  secondCap: number;
  /** 指挥度上限（铸币工厂舰的 capBonus 可把它抬到 10 以上） */
  manaCap: number;
  /** 每方场上限 */
  boardSize: number;
  /** 战斗回合上限（到时比本体结构值，相同判防守方胜） */
  turnLimit: number;
  /** 舰队编制上限 */
  fleetSize: number;
  /** 狂暴/亡命判定的"半血"用向下取整 */
  halfHpFloor: true;
  /** 无头目技能的掠夺队本体血量 */
  raidHp: number;
}

// ---------------- 主游戏 ↔ 战斗层的唯一接口 ----------------

/** 进入战斗（主游戏 → 战斗层） */
export interface StartBattleInput {
  bossId: PirateBossId;
  /** 参战舰船：出征 = 该舰队；防守 = 所有防守舰队合并后的池 */
  fleet: ShipCardId[];
  kind: 'expedition' | 'defense';
  /** 不传则由主游戏按「游戏回合 + 目标 + 参战舰队」确定性推导（决定论见 V1.5 §1.1 保存行） */
  seed?: number;
}

/** 战斗结算（战斗层 → 主游戏）；战斗层不读金币/原料/星尘/声望/殖民地 */
export interface BattleOutcome {
  winner: 'player' | 'boss';
  rounds: number;
  reason: string;
  /** 永久消失的舰船（从卡库与所有舰队一并移除） */
  lostShips: ShipCardId[];
  enemyLost: number;
  bodyLeft: number;
  bossBodyLeft: number;
}

/** 战斗内的玩家动作（全部是纯函数调用） */
export type BattleAction =
  | { type: 'deploy'; cardId: ShipCardId; slot: number }
  | { type: 'attack'; attacker: string; target: string | 'body' }
  | { type: 'endTurn' }
  | { type: 'resolvePending'; unitId: string }
  | { type: 'autoTurn' };

/** 需要玩家指定目标的入场效果（悬停/点选提示用） */
export type PendingKind = 'copy' | 'smite' | 'freeze' | 'revive' | 'steal';

// ---------------- 运行期（战斗引擎 lib/battle/engine.ts 用） ----------------
// 只描述 DEMO 运行期实际用到的形状；数值与文案仍由 data/battle/*.ts 提供。

/** 卡牌关键词载荷（值即数值：狂怒 +2 → 2；亡命 +2 → 2；过载 2 → 2） */
export interface CardKeywords {
  /** 锁链：对方必须先攻击它 */
  taunt?: boolean;
  /** 贯穿：击毁目标时溢出伤害打到本体 */
  pierce?: boolean;
  /** 破甲：攻击无视护盾 */
  brk?: boolean;
  /** 潜航：不能被选为目标、不参与锁链判定 */
  subm?: boolean;
  /** 伏击：部署当回合即可攻击 */
  rush?: boolean;
  /** 狂怒 N：半血时攻击 +N */
  berserk?: number;
  /** 亡命 N：半血时补 N 护盾并在受击后攻击 +N */
  desper?: number;
  /** 过载 N：下回合指挥度 -N */
  overload?: number;
  /** 掠夺 N：命中本体时本回合指挥度 +N */
  plunder?: number;
  /** 攻击后自身受到 N 点反噬 */
  recoil?: number;
  /** 嗜血：击毁目标后可再攻击一次（每回合一次） */
  bloodlust?: boolean;
  /** 动态费用下限可为 0（否则最低 1） */
  minCostZero?: boolean;
}

/** 关键词的取值：布尔关键词为 true，数值关键词为数字 */
export type KeywordValue = boolean | number;

/** 一方阵营（玩家 / BOSS） */
export type BattleSide = 'player' | 'boss';

/** 战斗中的单位（场上的一艘战舰） */
export interface BattleUnit {
  uid: string;
  cardId: ShipCardId;
  side: BattleSide;
  name: string;
  series: BattleSeries;
  rarity: BattleRarity;
  text: string;
  /** 当前攻击力（含临时加成） */
  atk: number;
  goldAtk?: number;
  /** 出生攻击力（预留） */
  baseAtk: number;
  /** 本回合临时攻击加成（回合结束时撤销） */
  tempAtk: number;
  /** 当前护盾 */
  shield: number;
  /** 当前护盾上限（圣龛/加固会抬高它） */
  maxShield: number;
  /** 出生护盾（黑寡妇加固上限的基准） */
  baseShield: number;
  /** 当前结构值 */
  structure: number;
  maxStructure: number;
  /** 关键词（spawnUnit 时从卡牌复制一份，可被效果修改） */
  kw: CardKeywords;
  /** 召唤失调：刚部署，本回合不能攻击 */
  sick: boolean;
  /** 潜航状态（回合开始解除） */
  subm: boolean;
  /** 剩余冻结回合数 */
  frozen: number;
  /** 被冻结而跳过攻击 */
  skip: boolean;
  /** 本回合已攻击次数 */
  attacksUsed: number;
  /** 本回合额外攻击次数（嗜血） */
  extra: number;
  /** 亡命已触发 */
  desperDone: boolean;
  /** 衍生单位（不计入永久损失） */
  token: boolean;
  /** 场上位置（placeUnit 写入） */
  slot?: number;
  deathrattleDone?: boolean;
}

/** 一方阵营的盘面状态 */
export interface BattleSideState {
  id: BattleSide;
  isBoss: boolean;
  bossId: PirateBossId | null;
  /** 本体结构值 */
  body: number;
  /** 本体结构值上限（回血上限） */
  bodyMax: number;
  /** 未部署的舰船（部署后移出；被击毁则永久消失） */
  pool: ShipCardId[];
  /** 已永久损失的舰船 */
  lost: ShipCardId[];
  /** 墓地（供「召回」使用） */
  grave: ShipCardId[];
  /** 场上（固定 boardSize 个槽位） */
  board: (BattleUnit | null)[];
  /** 本回合指挥度上限 */
  cap: number;
  /** 本回合剩余指挥度 */
  cur: number;
  /** 永久上限加成 */
  capBonus: number;
  /** 费用减免 */
  costReduce: number;
  /** 下回合指挥度扣减（过载） */
  overloadNext: number;
  /** 该方已行动过的回合数 */
  ownTurns: number;
  /** 已部署艘数 */
  deployed: number;
  /** 已击毁敌舰数 */
  kills: number;
}

/** 待玩家（或 AI 兜底）指定的选择 */
export interface PendingChoice {
  side: BattleSide;
  kind: PendingKind;
  /** 候选：单位 uid（revive 是墓地里的卡 id） */
  cands: string[];
  need: number;
  picked: string[];
}

/** 单场战斗的累计统计（战报用） */
export interface BattleSideStat {
  heal: number;
  dmg: number;
  healEvents: number;
}

/** 一场战斗的完整状态 */
export interface BattleState {
  rnd: Rng;
  bossId: PirateBossId;
  round: number;
  active: BattleSide;
  firstSide: BattleSide;
  over: boolean;
  winner: 'player' | 'boss' | null;
  reason: string;
  log: string[];
  pending: PendingChoice | null;
  stat: Record<BattleSide, BattleSideStat>;
  player: BattleSideState;
  boss: BattleSideState;
}

/** 调用方的动作结果（统一形状，UI 直接读 ok/msg） */
export interface BattleResult {
  ok: boolean;
  msg?: string;
  more?: boolean;
  unit?: BattleUnit;
}

/** 「待选择」的作用范围：只限敌方 / 双方场上都可以 */
export type PendingScope = 'enemy' | 'any';

/** 卡牌效果函数取到的引擎 API（按当前行动方构造） */
export interface BattleApi {
  st: BattleState;
  side: BattleSide;
  foe: BattleSide;
  /** 当前剩余指挥度 */
  mana: () => number;
  /** 己方场上艘数 */
  friendlyCount: () => number;
  /** 除 u 之外的己方单位 */
  allies: (u?: BattleUnit | null) => BattleUnit[];
  /** 敌方场上单位 */
  enemies: (u?: BattleUnit | null) => BattleUnit[];
  /** 左右相邻的己方单位 */
  adjacent: (u: BattleUnit) => BattleUnit[];
  /** 攻击力最高的敌方单位（没有则 null） */
  strongestEnemy: () => BattleUnit | null;
  /** 攻击力最高的前 n 个敌方单位 */
  topEnemies: (n: number) => BattleUnit[];
  /** 随机一个敌方单位（消耗一次随机数） */
  randomEnemy: () => BattleUnit | null;
  /** 随机一个己方单位（消耗一次随机数） */
  randomAlly: () => BattleUnit | null;
  /** 对单位造成伤害（ignoreShield = 破甲） */
  damage: (u: BattleUnit | null, n: number, ignoreShield?: boolean) => void;
  /** 对敌方本体造成伤害 */
  damageBody: (n: number) => void;
  /** 对己方本体造成伤害 */
  damageOwnBody: (n: number) => void;
  /** 回复己方本体结构值（不超上限） */
  healBody: (n: number) => void;
  /** 永久攻击加成（最低 0） */
  buffAtk: (u: BattleUnit | null, n: number) => void;
  /** 本回合攻击加成（回合结束撤销） */
  buffAtkTemp: (u: BattleUnit | null, n: number) => void;
  /** 护盾加成（正数同时抬高护盾上限） */
  buffShield: (u: BattleUnit | null, n: number) => void;
  /** 修复护盾（不超护盾上限） */
  repair: (u: BattleUnit | null, n: number) => void;
  /** 冻结 n 回合 */
  freeze: (u: BattleUnit | null, n: number) => void;
  /** 本回合指挥度 +n */
  gainMana: (n: number) => void;
  /** 对方本回合指挥度 +n */
  gainManaFoe: (n: number) => void;
  /** 本局指挥度上限永久 +n */
  capUp: (n: number) => void;
  /** 己方费用永久 -n */
  costReduce: (n: number) => void;
  /** 召唤一个衍生单位（场上满则失败返回 null） */
  summon: (cardId: ShipCardId) => BattleUnit | null;
  /** 召回：候选 = 墓地里 ≤maxCost 费的友舰 */
  beginRevive: (maxCost: number) => PendingChoice | null;
  /** 挂起一个需要玩家指定目标的入场效果 */
  beginChoose: (kind: PendingKind, need: number, scope: PendingScope) => PendingChoice | null;
  /** 控制：候选 = 攻击 ≤maxAtk 的敌舰 */
  beginSteal: (maxAtk: number) => PendingChoice | null;
}

/** 卡牌运行期行为（数据在 data/battle/*.ts，行为在本文件描述的接口上） */
export interface CardBehavior {
  /** 关键词载荷（无关键词的卡为空对象） */
  kw: CardKeywords;
  /** 钩子：入场 / 亡语 / 回合开始 / 回合结束 */
  fx?: {
    play?: (u: BattleUnit, api: BattleApi) => void;
    death?: (u: BattleUnit, api: BattleApi) => void;
    turnStart?: (u: BattleUnit, api: BattleApi) => void;
    turnEnd?: (u: BattleUnit, api: BattleApi) => void;
  };
  /** 动态费用（返回增量，负数为减免）；费用下限见 kw.minCostZero */
  dynamicCost?: (u: BattleUnit | null, api: BattleApi) => number;
}

/**
 * 运行期卡牌：数据层（费/攻/盾/体/系列/稀有度/文案）+ 本层的 kw/fx/dynamicCost。
 * token 卡没有 fx/dynamicCost（与 DEMO 一致）。
 */
export type CardRuntime = ShipCardDef & CardBehavior;

/** 卡牌 id → 运行期卡牌（引擎的 CARDS） */
export type CardTable = Record<string, CardRuntime>;

/** 敌方 id → 数据（引擎的 BOSSES） */
export type PirateBossTable = Record<string, PirateBossDef>;

/** createBattle 的入参 */
export interface CreateBattleOptions {
  /** 不传则用 Date.now()（与 DEMO 一致） */
  seed?: number;
  /** 不传则 'b1'（与 DEMO 一致） */
  bossId?: PirateBossId;
  /** 不传 / 'starter' → FLEET_STARTER；'all' → FLEET_ALL */
  fleet?: 'starter' | 'all';
  /** 不传则掷骰（消耗一次随机数）；传了则直接采用 */
  playerFirst?: boolean;
}

/** damageUnit 的返回（击毁与溢出伤害） */
export interface DamageResult {
  dealt: number;
  overflow: number;
  destroyed: boolean;
}

// ---------------- 主游戏侧的卡牌战斗状态（V1.5 §10.1 / §10.2） ----------------
// 存档字段：`BattleFleet` / `BattleExpedition` / `BattleRaidState` 进存档（见 GameState 与 lib/save.ts）；
// `BattleState`（进行中的战斗）**不进存档**（V1.5 §〇「战斗中不能保存」），读档一律重置为 null。

/** 一支舰队（= 一套卡组）。一船同一时间只能属于一支舰队；每队编制上限 = tuning.fleetSize(30) 【V1.5 §10.1】 */
export interface BattleFleet {
  /** 唯一 id（lib/id.ts 的 createUid('fleet')），UI 作 key 与查找 */
  id: string;
  /** 舰队名，缺省按现有数量派生（舰队 1、舰队 2…）【V1.5 §10.1】 */
  name: string;
  /** 编入本队的战舰（可重复：同型舰多艘各占一项）；一艘不能同时出现在两支舰队 */
  shipIds: ShipCardId[];
  /** 防守标签：带标签的舰队在殖民地被掠夺时合并进同一个部署池【V1.5 §10.2】 */
  defending: boolean;
}

/** 出征（同时只能 1 个）；turnsRemaining 归零即开战【V1.5 §10.1】 */
export interface BattleExpedition {
  /** 目标老巢（b1~b5；'raid' 只用于掠夺战，不会出现在出征里） */
  bossId: PirateBossId;
  /** 出征的舰队（该舰队不能带防守标签，且出征期间不能改标签） */
  fleetId: string;
  /** 距开战还剩几个游戏回合（归零后由调用方开战，reducer 只减不判） */
  turnsRemaining: number;
}

/**
 * 掠夺状态（V1.5 §10.2 ＋ 用户 2026-08 裁定的两段窗口）。
 * · **阶段 A（warning）**：预警倒计时 `inTurns` 从 5 倒数 —— 玩家可以趁这段编/改防守队；
 * · **阶段 B（arrived）**：`inTurns` 归零后**不自动开战** —— 掠夺舰队停在战斗页签等玩家点「开战」，
 *   同时再给 `arrivedTurns`（5 回合）的倒计时，到时仍未迎战即**自动失败 = 掠夺成功**（扣资源 + 免疫）。
 * `raidPhase(raid)` / `raidStatus(state)` / `raidResolution()`（lib/battle/raid.ts）是
 * "现在处在哪一段、接下来该做什么"的唯一判定入口，UI 与 useTurn 都只调它们。
 */
export interface BattleRaidState {
  /** 阶段 A：距海盗抵达还剩几个游戏回合；null = 当前没有掠夺在途（= 阶段 B 或 idle，看法见 arrivedTurns） */
  inTurns: number | null;
  /** 阶段 B：海盗已抵达、正在等玩家迎战 —— 距"自动失败（掠夺成功）"还剩几个游戏回合；0 = 不在阶段 B */
  arrivedTurns: number;
  /** 免疫期剩余回合数（打赢 / 打输 / 被掠夺成功后置 20）【V1.5 §10.2】 */
  immuneTurns: number;
  /** 本次掠夺来了几支掠夺队：1 或 2（2 = 赢下第一场后立刻连打第二场）【V1.5 §10.2】 */
  raiders: number;
  /** 阶段 B 是否已经有**结算过**（自动失败 / 手动开战 / 打赢连打的第二场）：写入端保留，判定一律读 `arrivedTurns`。
   *  ⚠ 目前没有任何判定读它（阶段 B 的判据是 `arrivedTurns > 0`）；它是给 UI/日志做"这一波是否已处理过"的显式标记。 */
  arrived: boolean;
}
