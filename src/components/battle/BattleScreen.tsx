import { memo, useEffect, useState } from 'react';
import type { BattleAction, BattleState } from '@/types/battle';
import type { CardView } from '@/lib/battle/view';
import {
  boardView,
  bossView,
  canEndTurn,
  graveView,
  infoBarView,
  manualActionView,
  poolView,
} from '@/lib/battle/view';
import { TURN_LIMIT } from '@/lib/battle/engine';
import { useStableActions } from '@/hooks/useGameState';
import BoardSide from './BoardSide';
import BossPanel from './BossPanel';
import FleetPool from './FleetPool';
import GraveBar from './GraveBar';
import BattleInfoBar from './BattleInfoBar';

// ============================================================================
// 整屏战斗编排（DEMO 的顶栏 + BOSS 面板 + 玩家面板 + 舰队池 + 信息条）
// 五段布局与 carddemo/index.html 对齐；所有可判定的展示来自 lib/battle/view.ts（纯函数）。
//
// 时序（对齐 DEMO 的 scheduleBoss）：
//   · 轮到 BOSS → 自动延时 500ms 调 `autoTurn`（BOSS 的回合不需要玩家点任何东西）
//   · 「自动战斗」打开 → 轮到玩家时也延时 420ms 调 `autoTurn`（让引擎自己打完这一方）
//   引擎动作全部经 onAction 交给 reducer（reducer 内部先 clone 再改，绝不 mutate 主状态）。
// ============================================================================

/** BOSS 思考节奏（DEMO 是 auto ? 260 : 500） */
const BOSS_DELAY_MS = 500;
/** 自动战斗时玩家侧的节奏 */
const AUTO_DELAY_MS = 420;
/** 临时提示显示时长（DEMO 的 2600ms） */
const FLASH_MS = 2600;

interface BattleScreenProps {
  battle: BattleState;
  /** 本场战斗的随机种子（主游戏传入）。**换一场就变**，用来把上一场的选择态清掉 */
  seed: number;
  /** BOSS 面板要显示的**敌人名**（唯一真值 = lib/battle/raid.raidEnemyName，由 BattleTab 从
   *  `raidCardView.enemyName` 下发；空串 = 用数据里的静态 BOSS 名）。
   *  ⚠ 为什么由父组件下发而不是在这里推导：名字规则只许有一份（老巢打光后掠夺队叫「海盗残兵」），
   *    而 `lib/battle/view.ts` 的 bossView 是冻结区（语义不许改）→ 组件只做"显示哪个名字"的渲染。 */
  enemyName: string;
  /** 与**掠夺队**战斗时的战果旁注（唯一真值 = lib/battle/raid.raidCardView，含"还有下一支"那句）。
   *  不在掠夺战里（打老巢）时为空串/0，结算画面与平时完全一样。
   *  ⚠ 掠夺的**奖励 / 被抢了什么**不在这里显示：用户 2026-08 最终口径把那个出口定为
   *    **事件记录**（「直接放事件记录好了哇，打赢也一样」）→ 本组件不再收那类 prop。 */
  context: BattleScreenContext;
  onAction: (action: BattleAction) => void;
  /** 结束这场战斗（END_BATTLE：结算永久损失、收起出征/掠夺状态） */
  onEnd: () => void;
}

/** 与掠夺队战斗时由 lib 下发的一行战果说明（组件不推导任何内容） */
export interface BattleScreenContext {
  /** 这一波还剩几支掠夺队（含当前这场；不在掠夺战里为 0） */
  squadsLeft: number;
  /** 顶栏那句"还剩 N 支掠夺队"（空串 = 不渲染） */
  squadsLeftText: string;
  /** 结算画面那句（空串 = 不渲染） */
  outcomeText: string;
}

function BattleScreenBase({ battle, seed, enemyName, context, onAction, onEnd }: BattleScreenProps) {
  const [selCard, setSelCard] = useState<string | null>(null);
  const [selUnit, setSelUnit] = useState<string | null>(null);
  const [flash, setFlash] = useState('');
  const [auto, setAuto] = useState(false);
  /** 自动战斗：一个回合只排一次（打完这一方后重新武装） */
  const [autoArmed, setAutoArmed] = useState(false);
  /** 已经为哪一场（seed）初始化过选择态 */
  const [initSeed, setInitSeed] = useState(seed);

  // 新开一场：把上一场的「已选卡 / 已选舰 / 临时提示 / 自动战斗」清掉，
  // 等价 DEMO newBattle 里的 selCard = selUnit = flash = null。
  // ⚠ 判据是 seed，**不能**改成"battle 对象身份变了"：每次 BATTLE_ACTION 都会克隆出新对象，
  //   那样会把玩家每次操作的选择态都清掉。2 支掠夺队"连打两场"的第二场由父组件换个 key 重挂载
  //   （见 BattleTab 的 battleSeq），所以这里不需要再认 battle。
  if (initSeed !== seed) {
    setInitSeed(seed);
    if (selCard !== null) setSelCard(null);
    if (selUnit !== null) setSelUnit(null);
    if (flash !== '') setFlash('');
    if (auto) setAuto(false);
    if (autoArmed) setAutoArmed(false);
  }

  // ---------------- 渲染模型（纯函数，全部来自 view.ts） ----------------
  const boss = bossView(battle);
  const bossSlots = boardView(battle, 'boss', selUnit);
  const playerSlots = boardView(battle, 'player', selUnit, selCard);
  const cards = poolView(battle);
  const info = infoBarView(battle, selCard, selUnit);
  const grave = graveView(battle);
  /**
   * 「此刻谁在操作」的**唯一真值**（lib/battle/view.ts → manualActionView）。
   * ⚠ 输入闸门（下面 4 个点击处理器）与底部文案**都读这一份**，不许再各判一次。
   *   2026-08 的卡死正是"各判一次"的后果：闸门读组件级的 `busy`，而 `busy` 只在两条自动推进的
   *   effect 里被清 → 玩家在自己回合手动部署后 `busy` 永假为真，点谁都没反应，底部还写着
   *   「（自动战斗）正在替你行动…」（而按钮读的 `auto` 明明是"未开自动"）。
   *   组件因此**不再持有任何"谁在行动"的状态**（`busy` 已删除）。
   */
  const manual = manualActionView(battle, auto);
  /** 输入被拦时给出的那句话（点了没反应是最坏的结果：铁律②同理） */
  const gateHint = manual.reason;

  // 动作分发：
  //   · userAction  = 玩家手动动作（先撤掉自动战斗的待发回合，免得手动点完又被自动打一手）
  //   · sysAction   = 自动行棋（BOSS 回合 / 自动战斗本身）
  // 两者都是稳定引用（useStableActions），不击穿子组件 memo（AGENTS 第五节）。
  // ⚠ 这里**不再有 busy**（已删除）：它原先既是输入闸门、又是文案分支、又是「结束回合」的禁用条件，
  //   而清除它的代码只活在两条自动推进的 effect 里 → 玩家手动出手一次就永久卡死。
  //   "谁在操作"改由 lib/battle/view.manualActionView 单一判定；双击的重复动作由引擎
  //   （canDeploy / canAttack 会再校验一次）与 reducer 兜底，不再靠组件闸门。
  const { userAction, sysAction } = useStableActions({
    userAction: (action: BattleAction) => {
      setAutoArmed(false);
      onAction(action);
    },
    sysAction: (action: BattleAction) => {
      onAction(action);
    },
  });

  // 轮到 BOSS：自动跑它的回合（玩家不需要也不会被要求点「结束回合」）
  useEffect(() => {
    if (battle.over || battle.active !== 'boss') return;
    const t = setTimeout(() => {
      sysAction({ type: 'autoTurn' });
    }, BOSS_DELAY_MS);
    return () => clearTimeout(t);
  }, [battle.over, battle.active, battle.round, sysAction]);

  // 自动战斗：轮到玩家且已武装 → 交给引擎打这一方
  useEffect(() => {
    if (!auto || !autoArmed) return;
    if (battle.over || battle.active !== 'player') return;
    const t = setTimeout(() => {
      setAutoArmed(false);
      sysAction({ type: 'autoTurn' });
    }, AUTO_DELAY_MS);
    return () => clearTimeout(t);
  }, [auto, autoArmed, battle.over, battle.active, battle.round, sysAction]);

  // 轮次发生变化后重新武装自动战斗
  useEffect(() => {
    if (auto) setAutoArmed(true);
  }, [auto, battle.over, battle.round, battle.active]);

  // 临时提示 2.6 秒后消失
  useEffect(() => {
    if (!flash) return;
    const t = setTimeout(() => setFlash(''), FLASH_MS);
    return () => clearTimeout(t);
  }, [flash]);

  const hint = (msg: string) => setFlash(msg);

  // ---------------- 输入（逐条对齐 DEMO 的 onPoolClick / onPlayerSlot / onBossTarget） ----------------

  /** 部署被拦时的原因（唯一真值 = view.CardView.playable / cost）——「能不能读」与「能不能出」分开 */
  const deployBlockReason = (card: CardView): string =>
    card.cost > battle.player.cur
      ? `指挥度不够（需要 ${card.cost}，现有 ${battle.player.cur}）`
      : '场上没有空位了（上限 6 艘）';

  const onPoolClick = (cid: string) => {
    // 唯一的输入闸门：读 lib 的 manualActionView（未开自动 + 轮到玩家 + 无待选择）。被拦时说出原因。
    if (!manual.canAct) { hint(gateHint); return; }
    const card = cards.find((c) => c.id === cid);
    if (!card) return;
    // ⚠ 「能不能读它」≠「能不能出它」：**灰卡照样能选中**（点开看技能全文，信息条是手机端唯一出口，铁律①），
    //   出不出得去等点空格部署时再判（`deployBlockReason` 给原因）。把两者合成一个值的后果就是
    //   用户 2026-08 报的"灰卡的技能在手机上无处可看"（卡面 title 是桌面专属的悬浮提示）。
    setSelCard(selCard === cid ? null : cid);
    setSelUnit(null);
    setFlash(card.playable ? '' : deployBlockReason(card));
  };

  /** 待选择状态：点任意候选单位即完成一次选择；返回是否消费了这次点击 */
  const tryResolvePending = (uid: string): boolean => {
    // 待选择**也是手动操作**：自动模式接管时不许手动选（判定同 manualActionView，一处不写第二份）
    if (!battle.pending || !manual.canAct) return false;
    setFlash('');
    userAction({ type: 'resolvePending', unitId: uid });
    return true;
  };

  const onPlayerSlot = (i: number) => {
    if (!manual.canAct) { hint(gateHint); return; }
    const u = battle.player.board[i];
    if (u && tryResolvePending(u.uid)) return;
    if (battle.pending) { hint('请先点一艘可选的战舰作为目标（这个位置不在候选里）'); return; }
    if (selCard && !u) {
      // 部署这一步才判"能不能出"：指挥度不足 / 场上满 → **明确写出原因**，不派发（铁律②同理）。
      const card = cards.find((c) => c.id === selCard);
      if (card && !card.playable) { hint(deployBlockReason(card)); return; }
      setSelCard(null);
      setFlash('');
      userAction({ type: 'deploy', cardId: selCard, slot: i });
      return;
    }
    if (u) {
      setSelUnit(selUnit === u.uid ? null : u.uid);
      setSelCard(null);
      setFlash('');
      return;
    }
    hint('这个位置是空的 —— 先从下方「你的舰队」里选一艘战舰');
  };

  const onBossTarget = (ref: string) => {
    // 待选择时点候选**是合法操作**，故闸门放在"该不该做这件事"的判断之后，但先给一句原因。
    if (battle.over) return;
    if (battle.pending) {
      // 待选择状态下：点敌方单位 = 指定目标（点本体无效，只会得到一句提示）
      if (ref !== 'body' && tryResolvePending(ref)) return;
      hint('请先在可选的战舰上点选目标（点本体无效）');
      return;
    }
    if (!manual.canAct) { hint(gateHint); return; }
    if (!selUnit) { hint('先点己方一艘可以攻击的战舰，再点目标'); return; }
    setSelUnit(null);
    setFlash('');
    userAction({ type: 'attack', attacker: selUnit, target: ref });
  };

  const endTurn = () => {
    if (!manual.canAct || !canEndTurn(battle)) { hint(gateHint); return; }
    setSelCard(null);
    setSelUnit(null);
    userAction({ type: 'endTurn' });
  };

  const playerUnitCount = battle.player.board.filter(Boolean).length;
  const pPct = battle.player.bodyMax > 0
    ? `${Math.max(0, Math.round((Math.max(0, battle.player.body) / battle.player.bodyMax) * 100))}%`
    : '0%';

  /**
   * 底部默认文案 = lib/battle/view.manualActionView 的那句话（**唯一真值**）。
   * ⚠ 删掉的是组件自己的分支链（`busy ? '（自动战斗）正在替你行动…' : …`）：
   *   「谁在操作」只许有一份判定，否则又会出现"按钮说手动、底部说自动"的分叉。
   *   只有 `manual.canAct`（= 玩家真的能操作）时才把"已选卡牌 / 已选战舰"这两句操作提示叠上去 ——
   *   否则一律原文渲染 `reason`，`autoHint` 未开自动时恒为空串（渲染串不许撒谎）。
   */
  const defaultHint = manual.autoHint
    || (manual.canAct
      ? (selCard
        ? `已选卡牌（${cards.find((c) => c.id === selCard)?.cost ?? 0} 费）→ 点自己场上的空格部署`
        : selUnit
          ? '已选战舰 → 点敌方战舰或 BOSS 本体发起攻击'
          : manual.reason)
      : manual.reason);

  const turnText = `${battle.round > TURN_LIMIT ? TURN_LIMIT : battle.round}/${TURN_LIMIT}`;
  const manaText = `${battle.player.cur}/${battle.player.cap}` +
    (battle.player.capBonus ? `（含永久 +${battle.player.capBonus}）` : '');
  const whoText = battle.over ? '已结束' : battle.active === 'player' ? '玩家' : 'BOSS';

  const btn =
    'rounded-[7px] border border-[#39507d] bg-[#22304d] px-2.5 py-1 text-[12px] text-slate-200 hover:enabled:bg-[#2c3d61] disabled:opacity-40 disabled:cursor-not-allowed';
  const it = 'flex items-center gap-1 text-[12px] text-slate-400';

  return (
    <div>
      {/* ==================== 顶栏（DEMO 的 .bar） ==================== */}
      <div className="mb-2 flex flex-wrap items-center gap-2 rounded-[10px] border border-[#2b3550] bg-[#141b2e] px-2.5 py-2">
        <div className={it}>回合 <b className="text-slate-100">{turnText}</b></div>
        <div className={it}>指挥度 <span className="font-bold text-sky-400">{manaText}</span></div>
        <div className={it}>行动方 <b className={battle.active === 'player' ? 'text-emerald-400' : 'text-red-400'}>{whoText}</b></div>
        <div className={it}>你的池 <b className="text-slate-100">{battle.player.pool.length}</b> 艘 · 已损失 <b className="text-slate-100">{battle.player.lost.length}</b></div>
        <div className={it}>BOSS 池 <b className="text-slate-100">{battle.boss.pool.length}</b> 艘 · 已损失 <b className="text-slate-100">{battle.boss.lost.length}</b></div>
        {context.squadsLeftText ? (
          <div className={it}>
            <b className="text-amber-300">{context.squadsLeftText}</b>
          </div>
        ) : null}
        <span className="flex-1" />
        <button
          type="button"
          className={`${btn} ${auto ? 'border-green-500 bg-green-700 hover:enabled:bg-green-600' : ''}`}
          onClick={() => {
            const next = !auto;
            setAuto(next);
            setAutoArmed(next);
          }}
        >
          {auto ? '停止自动战斗' : '自动战斗'}
        </button>
        <button
          type="button"
          className="rounded-[7px] border border-blue-500 bg-blue-700 px-2.5 py-1 text-[12px] text-white hover:enabled:bg-blue-600 disabled:cursor-not-allowed disabled:opacity-40"
          disabled={!canEndTurn(battle)}
          onClick={endTurn}
        >
          结束回合
        </button>
      </div>

      {/* ==================== BOSS 面板 ==================== */}
      <BossPanel
        boss={boss}
        nameOverride={enemyName}
        bodyClickable={!battle.over && !battle.pending && battle.active === 'player' && !!selUnit}
        onBodyClick={() => onBossTarget('body')}
      >
        <BoardSide
          side="boss"
          slots={bossSlots}
          selUnit={selUnit}
          onPlayerSlot={onPlayerSlot}
          onBossTarget={onBossTarget}
        />
      </BossPanel>

      {/* ==================== 玩家面板 ==================== */}
      <div className="mb-2.5 rounded-[10px] border border-[#2b3550] bg-[#141b2e] px-2.5 py-2">
        <h2 className="mb-[7px] flex items-center gap-1.5 text-[13px] font-bold">
          玩家（你）
        </h2>
        <div className="mb-[7px] flex items-center gap-2">
          <span className="text-[13px] font-bold">本体</span>
          <div className="relative h-3.5 flex-1 overflow-hidden rounded-[7px] border border-[#2b3550] bg-[#0d1424]">
            <i
              className="block h-full bg-gradient-to-r from-green-700 to-green-500 transition-[width] duration-300"
              style={{ width: pPct }}
            />
            <span className="absolute inset-0 text-center text-[10px] leading-[12px] text-white [text-shadow:0_1px_2px_#000]">
              {Math.max(0, battle.player.body)} / {battle.player.bodyMax}
            </span>
          </div>
          <div className="text-[11px] text-slate-500">场上 {playerUnitCount}/6</div>
        </div>
        <BoardSide
          side="player"
          slots={playerSlots}
          selUnit={selUnit}
          onPlayerSlot={onPlayerSlot}
          onBossTarget={onBossTarget}
        />
        <GraveBar
          grave={grave}
          onPick={(cardId) => { setFlash(''); userAction({ type: 'resolvePending', unitId: cardId }); }}
        />
      </div>

      {/* ==================== 舰队池（标题 → 信息条 → 卡片列表） ==================== */}
      <div className="mb-2.5 rounded-[10px] border border-[#2b3550] bg-[#141b2e] px-2.5 py-2">
        <h2 className="mb-[7px] flex items-center gap-1.5 text-[13px] font-bold">
          你的舰队
          <span className="text-[11px] font-normal text-slate-500">
            部署池 —— 不抽牌，有指挥度就能上；被击毁即永久消失；<b className="text-slate-400">点卡看技能</b>
          </span>
        </h2>
        {/* ⚠ **信息条 = 提示条 + 技能详情/待选择/最近战况，整块放在卡片列表之前**（用户 2026-08 口径：
            「不然 30 个满编的，还得拉到最下面看技能」）。它在部署池**滚动窗的上方**常驻 ——
            池子再长也不用滚（FleetPool 自己的 `max-h-[400px] overflow-auto` 只管卡片）。
            这里是**手机端看技能的唯一出口**（铁律①）：四态（点卡 / 点己方战舰 / 待选择 / 最近战况）
            都由 `BattleInfoBar` 内部按 `info.kind` 渲染，**全屏只此一份**（上移是移动，不是再渲染一份）。 */}
        <BattleInfoBar info={info} flash={flash} defaultHint={defaultHint} />
        <FleetPool cards={cards} selCard={selCard} onPoolClick={onPoolClick} />
      </div>

      {/* ==================== 结算 ==================== */}
      {battle.over && (
        <div
          className={`mt-2 rounded-lg border px-2.5 py-2 text-[12.5px] leading-relaxed ${
            battle.winner === 'player'
              ? 'border-[#1f7a4d] bg-[#0f2a1c]'
              : 'border-[#7a1f2f] bg-[#2a0f14]'
          }`}
        >
          <b>{battle.winner === 'player' ? '你赢了' : '你败了'}</b> —— {battle.reason}
          <br />
          你：本体 {Math.max(0, battle.player.body)}/{battle.player.bodyMax}，被击毁 {battle.player.lost.length} 艘（永久损失），池内剩 {battle.player.pool.length} 艘
          <br />
          BOSS：本体 {Math.max(0, battle.boss.body)}/{battle.boss.bodyMax}，被击毁 {battle.boss.lost.length} 艘
          {/* ⚠ 结算画面上**没有**"掠夺战利品 / 被抢了什么"那一块：用户 2026-08 最终口径把那个出口
              定为**事件记录**（「直接放事件记录好了哇，打赢也一样」）—— 打赢 =「掠夺战果｜击退海盗：缴获 …」，
              打输/被抢 =「殖民地被掠夺｜损失 金币 20000、硅片 100…」，都在事件面板底部的「事件记录」里。
              这里只留 lib 给的战果旁注（"还有下一支" / "这场没顶住…"）。 */}
          {context.outcomeText ? (
            <p className="mt-1.5 text-[12px] font-bold text-amber-300">{context.outcomeText}</p>
          ) : null}
          <div className="mt-2">
            <button
              type="button"
              className="rounded-[7px] border border-blue-500 bg-blue-700 px-3 py-1 text-[12px] text-white hover:bg-blue-600"
              onClick={onEnd}
            >
              结算并返回
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

export default memo(BattleScreenBase);
