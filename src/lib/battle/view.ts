// ============================================================================
// 舰队卡牌战斗 · 展示逻辑（纯函数，无 DOM / React 依赖）
// 逐条搬移自 carddemo/ui.js 的可判定展示逻辑（视觉与交互的唯一规格是那个 DEMO）：
//   · unitHtml   → unitView / attackLabel
//   · boardHtml  → boardView
//   · poolHtml   → poolView
//   · infoHtml   → infoBarView（手机端看技能的唯一出口：卡牌 / 战舰 / 待选择 / 最近战况）
//   · boss 面板  → bossView
//   · graveHtml  → graveView
//   · defaultHint 的按钮可用性 → canEndTurn
//   · defaultHint / 输入闸门"谁在操作" → manualActionView（唯一真值，见其注释）
// 本文件**只判展示**，不改任何战斗状态、不消费随机数（引擎的唯一真值仍是 lib/battle/engine.ts）。
// ============================================================================

import { getThumbPath } from '@/lib/assetThumb';
import type {
  BattleSide,
  BattleState,
  BattleUnit,
  PendingChoice,
  ShipCardDef,
} from '@/types/battle';
import {
  BOARD_SIZE,
  BOSSES,
  CARDS,
  PENDING_HINT,
  PENDING_LABEL,
  attackReason,
  canAttack,
  canDeploy,
  costOf,
  effAtk,
  findUnit,
  legalTargets,
  unitFlags,
} from './engine';

// ---------------- 渲染模型 ----------------

/** 场上单位的一张卡（DEMO 的 .unit） */
export interface UnitView {
  uid: string;
  name: string;
  series: string;
  artSrc: string;
  atk: number;
  shield: number;
  maxShield: number;
  structure: number;
  maxStructure: number;
  /** 关键词一行（DEMO 的 kwLine），无关键词为 '' */
  keywords: string;
  badges: { text: string; kind: 'taunt' | 'frozen' | 'sick' | 'subm' }[];
  /** ready 可攻击 / used 已攻击 / blocked 被阻挡 / idle 不是这一方的回合（不显示状态） */
  attackState: 'ready' | 'used' | 'blocked' | 'idle';
  /** '可攻击' / '已攻击' / '冻结' / '召唤失调' / '不能攻击' / '' */
  attackStateLabel: string;
  /** 卡面 title：名称｜攻/盾/体｜技能全文（+⚠ 不能攻击的原因） */
  tooltip: string;
}

/** 一个槽位（DEMO 的 .slot） */
export interface SlotView {
  i: number;
  unit: UnitView | null;
  /**
   * 这一格**点得动**（点了会有事发生）。
   * ⚠ 它是组件唯一的点击闸门（`BoardSide` 的 onClick 第一行就是 `if (!s.clickable) return;`），
   *   所以「玩家此刻能做的每一种点击」都必须在这里为 true —— 少一种就是「点了没反应」。
   *   与 `tone` 无关：tone 只是视觉（DEMO 的 .slot.act / .can / .tgt）。
   */
  clickable: boolean;
  /** tgt 待选择候选/合法攻击目标 · act 己方可攻击 · can 已选卡牌的空位 · none 无 */
  tone: 'tgt' | 'act' | 'can' | 'none';
}

/** 舰队池里的一张卡（DEMO 的 .card） */
export interface CardView {
  id: string;
  name: string;
  /** 当前实际费用（含费用减免与动态费用） */
  cost: number;
  /**
   * **能不能出它**：指挥度 / 空位 / 池子里还有（= `canDeploy`）。
   * ⚠ 与 `selectable` 是**两个概念**，绝不许合成一个值（2026-08 用户报障）：
   *   「能不能读它」≠「能不能出它」。把两者合成一个，灰卡的技能在手机上就**无处可看**
   *   （`FleetPool` 的 `title` 是桌面专属的悬浮提示，手机没有 hover —— 铁律①说信息条才是唯一出口）。
   */
  playable: boolean;
  /**
   * **能不能读它**：手牌里的每一张都必须能点选（点开 → 信息条给技能全文）。
   * 唯一的前提是"现在轮到玩家手动操作"（`manualActionView`），与指挥度 / 空位无关。
   */
  selectable: boolean;
  /** 池中同型的份数 */
  count: number;
  series: string;
  rarity: string;
  atk: number;
  shield: number;
  structure: number;
  text: string;
  artSrc: string;
}

/** 信息条（DEMO 的 #info） */
export interface InfoBarView {
  kind: 'pending' | 'card' | 'unit' | 'event';
  title: string;
  body: string;
  hint: string;
  /** 如 '攻3 盾4 体1' / '攻3 盾4/4 体1/2' */
  stats: string;
}

export interface BossView {
  name: string;
  skill: string;
  hp: number;
  hpMax: number;
  hpPct: number;
  artSrc: string;
}

export interface GraveView {
  total: number;
  chips: { id: string; name: string; count: number; pickable: boolean }[];
}

/**
 * 「此刻谁在操作」的**唯一真值**（手动输入闸门 + 底部文案共用一份判定）。
 *
 * 为什么要有它（2026-08 用户报「上了一艘战舰后指挥度还剩 2，却再也上不了任何卡」）：
 * 迁移到正式游戏时，DEMO 里**没有对应物**的两块被引进来了 ——
 *   ① 组件级的 `busy`（"这一跳已经派发出去、等状态回来"的节奏位）；
 *   ② 「自动战斗」开关（`auto`）。
 * 原先 `busy` 被同时当成三种东西用：输入闸门（`if (busy) return`）、底部文案的分支条件、
 * 「结束回合」的禁用条件。而 `setBusy(false)` **只写在两条自动推进的 effect 里**（BOSS 回合结束、
 * 自动战斗出手）→ 玩家在自己回合手动部署一次就把 `busy` 置为 true，之后轮到玩家时**没有任何代码
 * 会把它清掉**：点击被 `busy` 静默吞掉（点谁都没反应），底部又因为它渲染成
 * 「（自动战斗）正在替你行动…」—— 而按钮读的 `auto` 明明还是"未开自动"。
 * 这就是"同一个值派生了多份、彼此分叉"的同一形状（和 boardView.clickable 恒假、机库改名读 canEdit
 * 是同一类：**判定散在组件里、每处各判一次**）。
 *
 * 口径（DEMO 的 `disabled = over || (active!==me && active!==other) || busy`）：
 *   · 手动能不能点 = 「战斗没结束」+「轮到玩家」+「没有待选择」+「没开自动」；
 *   · `auto` 打开时手动确实应当屏蔽（这是对的）—— 错的是它此前由 `busy` 代判；
 *   · 不能操作时**必须给出中文原因**（铁律②：可攻击/已攻击/不能攻击+原因，出牌同理）。
 */
export interface ManualView {
  /** 现在能不能手动出牌 / 攻击 / 结束回合 */
  canAct: boolean;
  /** canAct 为 true 时是操作提示；为 false 时是**点不动的原因**（绝不许为空） */
  reason: string;
  /** 由自动战斗接管时的那句话；未开自动时恒为空串（"没开自动就不许说正在替你行动"） */
  autoHint: string;
}

/** 「此刻谁在操作」的唯一真值：手动输入闸门、底部文案、自动提示三处都读它 */
export function manualActionView(st: BattleState, auto: boolean): ManualView {
  if (st.over) return { canAct: false, reason: `战斗已结束：${st.reason}`, autoHint: '' };
  if (auto) {
    return {
      canAct: false,
      reason: '已开启自动战斗，正在替双方行动',
      autoHint: '（自动战斗）正在替你行动…',
    };
  }
  if (st.pending) return { canAct: false, reason: '请在可选战舰上点选目标', autoHint: '' };
  if (st.active !== 'player') return { canAct: false, reason: 'BOSS 行动中，请稍候', autoHint: '' };
  return {
    canAct: true,
    reason: '点「你的舰队」里的战舰 → 再点自己场上的空格部署；点己方战舰 → 再点敌方目标攻击。',
    autoHint: '',
  };
}

// ---------------- 图位路径（缺图由组件的 onError 回落占位块） ----------------

/** 场上单位的竖条图：`/battle/units/<cardId>.webp` */
export function unitArtSrc(cardId: string): string {
  // 舰船图在战斗里的出口是「卡面 320×190」与「场上横条 370×144」，属列表/网格图 →
  // 按 AGENTS 第五节统一走缩略图（解码内存 = 宽×高×4 字节，与文件大小无关；同屏最多 12 格 + 9 张卡）。
  return getThumbPath(`/battle/units/${cardId}.webp`);
}

/** BOSS 头像：`/battle/bosses/<bossId>.webp`（56×56，小图直接用原图） */
export function bossArtSrc(bossId: string): string {
  return `/battle/bosses/${bossId}.webp`;
}

function defOf(cardId: string): ShipCardDef {
  return CARDS[cardId] as ShipCardDef;
}

// ---------------- 关键词一行（DEMO 的 kwLine，逐条照抄） ----------------

export function kwLine(u: BattleUnit): string {
  const k: string[] = [];
  if (u.kw.taunt) k.push('锁链');
  if (u.kw.pierce) k.push('贯穿');
  if (u.kw.rush) k.push('伏击');
  if (u.kw.subm) k.push('潜航');
  if (u.kw.brk) k.push('破甲');
  if (u.kw.berserk) k.push('狂怒+' + u.kw.berserk);
  if (u.kw.desper) k.push('亡命+' + u.kw.desper);
  if (u.kw.plunder) k.push('掠夺' + u.kw.plunder);
  if (u.kw.overload) k.push('过载' + u.kw.overload);
  if (u.kw.bloodlust) k.push('嗜血');
  if (u.kw.recoil) k.push('反噬' + u.kw.recoil);
  return k.join(' · ');
}

// ---------------- 攻击状态三重区分（DEMO 的 unitHtml） ----------------

/** 本回合已攻击：`attacksUsed >= 1 + extra` */
function isUsed(u: BattleUnit): boolean {
  return u.attacksUsed >= 1 + u.extra;
}

/** 被阻挡：冻结（skip / frozen）· 召唤失调（sick 且无伏击）· 攻击力 0 */
function isBlocked(u: BattleUnit): boolean {
  return u.skip || u.frozen > 0 || (u.sick && !u.kw.rush) || effAtk(u) <= 0;
}

/**
 * 攻击状态。**不是这一方的回合就不给状态**（idle）——
 * 否则上一回合残留的「已攻击」会被误读成现在不能打。
 * ⚠ demo 还有第三条 `!st.pending`：有待选择效果时 `canAttack` 必然为 false，
 * 若沿用 DEMO 会让整场都显示「不能攻击」，信息条也永远显示不出「可以攻击」（DEMO 自身的 bug）。
 * 这里只去掉 `!st.pending`，其余判定逐字一致。
 */
function attackState(st: BattleState, u: BattleUnit, side: BattleSide): UnitView['attackState'] {
  // ⚠ 与 DEMO 一致：**有待选择时不显示攻击状态**。引擎的 canAttack/attackReason 都**不检查 pending**，
  //   若去掉这个 `!st.pending`，待选状态下的战舰会显示「可攻击」但点下去被引擎拒绝 = 界面说谎。
  const myTurn = !st.over && !st.pending && st.active === side;
  if (!myTurn) return 'idle';
  if (isUsed(u)) return 'used';
  if (isBlocked(u)) return 'blocked';
  return 'ready';
}

/** 底部状态字 */
function attackLabel(st: BattleState, u: BattleUnit, side: BattleSide): string {
  const state = attackState(st, u, side);
  if (state === 'ready') return '可攻击';
  if (state === 'used') return '已攻击';
  if (state === 'blocked') {
    if (u.skip || u.frozen > 0) return '冻结';
    if (u.sick && !u.kw.rush) return '召唤失调';
    return '不能攻击';
  }
  return '';
}

// ---------------- 单位 ----------------

/**
 * 场上单位 → 渲染模型。
 * `selected` 只影响卡的选中框，不参与任何判定。
 * `side` 用调用方传进来的那一侧（与 DEMO 的 unitHtml(u, side) 一致）。
 */
export function unitView(st: BattleState, u: BattleUnit, side: BattleSide, _selected: boolean): UnitView {
  const state = attackState(st, u, side);
  const canAtk = state === 'ready';
  const flags = unitFlags(u);
  const badges: UnitView['badges'] = [];
  if (flags.indexOf('taunt') >= 0) badges.push({ text: '锁链', kind: 'taunt' });
  if (flags.indexOf('frozen') >= 0) badges.push({ text: '冻结', kind: 'frozen' });
  if (flags.indexOf('sick') >= 0) badges.push({ text: '失调', kind: 'sick' });
  if (flags.indexOf('subm') >= 0) badges.push({ text: '潜航', kind: 'subm' });
  const why = side === st.active && !canAtk ? attackReason(st, side, u) : '';
  const tooltip =
    `${u.name}｜${effAtk(u)}/${u.maxShield}/${u.maxStructure}｜${u.text}` + (why ? ` ⚠ ${why}` : '');
  return {
    uid: u.uid,
    name: u.name,
    series: u.series,
    artSrc: unitArtSrc(u.cardId),
    atk: effAtk(u),
    shield: u.shield,
    maxShield: u.maxShield,
    structure: Math.max(0, u.structure),
    maxStructure: u.maxStructure,
    keywords: kwLine(u),
    badges,
    attackState: state,
    attackStateLabel: attackLabel(st, u, side),
    tooltip,
  };
}

// ---------------- 棋盘 ----------------

/**
 * 一侧的 6 个槽位。
 * 视觉分类（tone）判定顺序逐字照抄 DEMO 的 boardHtml：
 *   待选择候选（tgt）→ BOSS 侧且已选己方攻击者时合法目标（tgt）→ 己方且可攻击（act）→ 己方空位且有选牌（can）
 * ⚠ 关键：`st.pending` 存在时**只有 `pending.cands` 里的格子可点**（点本体无效）。
 *
 * ⚠ `clickable` 是**组件的点击闸门**，不是 DEMO 的视觉分类 —— DEMO 的事件绑定挂在整块棋盘上
 *   （`boardPlayer` 的委托对每一格都调 `onPlayerSlot`），移植时 `BoardSide` 改成了
 *   `if (!s.clickable) return;`，于是这里少标一种就整条手动路径失效：
 *     · 点己方战舰（能攻击的 / 不能攻击的都要能点，不能攻击时信息条要写明原因）→ 必须 true
 *     · 点自己场上的空格部署（已选卡牌时）→ 必须 true
 *   2026-08 用户报「自动战斗能跑、手动啥也操作不了」的根因就是这里只标了
 *   「待选择候选」与「BOSS 侧合法目标」两种（= 手动链路的第一跳永远被拦在组件里，
 *   reducer / 引擎 / action 派发全是好的）。
 *   注意 pending 下的**己方格子恒不可点**（铁律③：待选择时只有候选可点），别为了"能选船"把这条破坏掉。
 *
 * `selCard` 与规格里的参数表相比是**可选的第 4 个参数**（默认 null）：它只决定"选中卡牌时空位高亮"这一处
 * 视觉（DEMO 的 `slot.can`）。按规格的两个参数调用即可，行为与 DEMO 一致。
 */
export function boardView(
  st: BattleState,
  side: BattleSide,
  selUnit: string | null,
  selCard: string | null = null,
): SlotView[] {
  const board = st[side].board;
  const pending: PendingChoice | null = st.pending;
  // 玩家能操作的时机：轮到玩家且战斗没结束。**pending 不算**（待选择时只有候选可点）。
  const myTurn = !st.over && st.active === 'player';
  /** 己方战舰可点选：轮到自己、没有待选择（点了会切"已选战舰"，信息条给技能与能否攻击） */
  const canPickMyUnit = side === 'player' && myTurn && !pending;
  /** 点自己场上的空格部署：已选卡牌且没有待选择（引擎与组件都会再校验一次，这里只保证点得动） */
  const canDeployHere = side === 'player' && myTurn && !!selCard && !pending;
  const legalUids: string[] =
    side === 'boss' && selUnit ? legalTargets(st, 'player').map((x) => x.uid) : [];
  const out: SlotView[] = [];
  for (let i = 0; i < BOARD_SIZE; i++) {
    const u = board[i];
    let clickable = false;
    let tone: SlotView['tone'] = 'none';
    if (u) {
      if (pending && pending.cands.indexOf(u.uid) >= 0) {
        clickable = true; tone = 'tgt';
      } else if (side === 'boss' && legalUids.indexOf(u.uid) >= 0) {
        clickable = true; tone = 'tgt';
      } else if (side === 'player' && canAttack(st, 'player', u)) {
        if (canPickMyUnit) clickable = true;
        tone = 'act';
      } else if (canPickMyUnit) {
        // 己方战舰一律可点选（哪怕本回合不能攻击）—— 信息条要能说明"为什么不能攻击"（铁律②）
        clickable = true;
      }
    } else if (canDeployHere) {
      // DEMO 这里看的是 selCard（已选待部署的卡）—— 选中卡牌时空位亮成"可部署"
      clickable = true; tone = 'can';
    }
    out.push({
      i,
      unit: u ? unitView(st, u, side, selUnit === u.uid) : null,
      clickable,
      tone,
    });
  }
  return out;
}

// ---------------- 舰队池 ----------------

/** 部署池：同型合并计数、按费用升序（同费用按 id），只放「名字 / 系列·稀有度 / 攻·盾·体」+ 费用徽章。
 *  `playable`（能不能出）与 `selectable`（能不能读）分开给 —— 参见 CardView 的注释。 */
export function poolView(st: BattleState): CardView[] {
  const counts: Record<string, number> = {};
  for (const cid of st.player.pool) counts[cid] = (counts[cid] || 0) + 1;
  const ids = Object.keys(counts).sort((a, b) => {
    const ca = costOf(st, 'player', a);
    const cb = costOf(st, 'player', b);
    if (ca !== cb) return ca - cb;
    return a < b ? -1 : a > b ? 1 : 0;
  });
  // 「能不能读」只看"此刻是不是玩家在手动操作"：战斗已结束 / 不是玩家回合时点开也没意义
  // （那时信息条正在说明"为什么点不动"）。**与指挥度、空位无关**。
  const selectable = !st.over && st.active === 'player';
  return ids.map((cid) => {
    const c = defOf(cid);
    return {
      id: cid,
      name: c.name,
      cost: costOf(st, 'player', cid),
      playable: canDeploy(st, 'player', cid),
      selectable,
      count: counts[cid],
      series: c.series,
      rarity: c.rarity,
      atk: c.atk,
      shield: c.shield,
      structure: c.structure,
      text: c.text,
      artSrc: unitArtSrc(cid),
    };
  });
}

// ---------------- 信息条（手机端看技能的唯一出口） ----------------

function cardStats(c: ShipCardDef): string {
  return `攻${c.atk} 盾${c.shield} 体${c.structure}`;
}

function unitStats(u: BattleUnit): string {
  return `攻${effAtk(u)} 盾${u.shield}/${u.maxShield} 体${Math.max(0, u.structure)}/${u.maxStructure}`;
}

/** 选中的战舰：技能全文 + 关键词 + 能不能攻击（不能则写明原因） */
function unitInfo(st: BattleState, u: BattleUnit): InfoBarView {
  const okAtk = canAttack(st, st.active, u);
  const note = okAtk ? '可以攻击' : attackReason(st, st.active, u);
  const kw = kwLine(u);
  return {
    kind: 'unit',
    title: u.name,
    body: u.text,
    hint: `${kw ? `关键词：${kw}　` : ''}${note}`,
    stats: unitStats(u),
  };
}

/**
 * 信息条。优先级与 DEMO 的 infoHtml 完全一致：
 * ① 选中的卡牌（技能全文 + 费用 + 数值 + "点自己场上的空格即可部署"）
 * ② 选中的己方战舰（技能全文 + 关键词 + 能否攻击）
 * ③ 待选择（PENDING_LABEL / PENDING_HINT + "还需 N 艘（已选 M/N）"）
 * ④ 平时显示**最近一条战况**（st.log 最后一条）
 */
export function infoBarView(st: BattleState, selCard: string | null, selUnit: string | null): InfoBarView {
  if (selCard) {
    const c = defOf(selCard);
    return {
      kind: 'card',
      title: c.name,
      body: c.text,
      hint: '点自己场上的空格即可部署',
      stats: `（${c.series} · ${c.rarity}） ${costOf(st, 'player', selCard)} 费　${cardStats(c)}`,
    };
  }
  if (selUnit) {
    const u = findUnit(st, selUnit);
    if (u) return unitInfo(st, u);
  }
  if (st.pending) {
    const p = st.pending;
    const left = p.need - p.picked.length;
    return {
      kind: 'pending',
      title: `【${PENDING_LABEL[p.kind] || '选择'}】`,
      body: p.kind === 'revive' ? '从下方墓地条里点选要召回的友舰。' : '请在可选战舰上点选目标（点本体无效）。',
      hint: `请点目标（${PENDING_HINT[p.kind] || ''}）　还需 ${left} 艘${p.need > 1 ? `（已选 ${p.picked.length}/${p.need}）` : ''}`,
      stats: '',
    };
  }
  const last = st.log.length ? st.log[st.log.length - 1] : '（暂无战况）';
  return { kind: 'event', title: '', body: last, hint: '', stats: '' };
}

// ---------------- BOSS 面板 ----------------

export function bossView(st: BattleState): BossView {
  const b = BOSSES[st.bossId];
  const hpMax = st.boss.bodyMax;
  const hp = Math.max(0, st.boss.body);
  return {
    name: b ? b.name : st.bossId,
    skill: b ? b.skill : '',
    hp,
    hpMax,
    hpPct: hpMax > 0 ? Math.round((hp / hpMax) * 100) : 0,
    artSrc: bossArtSrc(st.bossId),
  };
}

// ---------------- 墓地条 ----------------

/** 墓地条：平时只读；「召回」待选择时该卡可点（候选是卡 id，不是 uid） */
export function graveView(st: BattleState): GraveView {
  const grave = st.player.grave || [];
  const canPick: string[] | null =
    st.pending && st.pending.kind === 'revive' ? st.pending.cands : null;
  const uniq: string[] = [];
  const counts: Record<string, number> = {};
  for (const id of grave) {
    if (counts[id] === undefined) uniq.push(id);
    counts[id] = (counts[id] || 0) + 1;
  }
  return {
    total: grave.length,
    chips: uniq.map((id) => ({
      id,
      name: defOf(id).name,
      count: counts[id],
      pickable: !!canPick && canPick.indexOf(id) >= 0,
    })),
  };
}

// ---------------- 结束回合按钮 ----------------

/**
 * 「结束回合」是否可用。
 * false 的三种情况：战斗已结束 / 不是玩家回合 / 有待选择（必须先选完）。
 * （DEMO 的 disabled 还叠加了 busy = BOSS 思考中 / 自动演示中，那部分由组件自己管。）
 */
export function canEndTurn(st: BattleState): boolean {
  if (st.over) return false;
  if (st.pending) return false;
  return st.active === 'player';
}
