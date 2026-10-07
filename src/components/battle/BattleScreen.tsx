import { memo, useEffect, useState } from 'react';
import type { BattleAction, BattleState } from '@/types/battle';
import {
  boardView,
  bossView,
  canEndTurn,
  graveView,
  infoBarView,
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
  onAction: (action: BattleAction) => void;
  /** 结束这场战斗（END_BATTLE：结算永久损失、收起出征/掠夺状态） */
  onEnd: () => void;
}

function BattleScreenBase({ battle, seed, onAction, onEnd }: BattleScreenProps) {
  const [selCard, setSelCard] = useState<string | null>(null);
  const [selUnit, setSelUnit] = useState<string | null>(null);
  const [flash, setFlash] = useState('');
  const [auto, setAuto] = useState(false);
  const [busy, setBusy] = useState(false);
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

  // 动作分发：
  //   · userAction  = 玩家手动动作（先撤掉自动战斗的待发回合，免得手动点完又被自动打一手；再置 busy）
  //   · sysAction   = 自动行棋（BOSS 回合 / 自动战斗本身），不改 busy 的语义
  // 两者都是稳定引用（useStableActions），不击穿子组件 memo（AGENTS 第五节）。
  const { userAction, sysAction } = useStableActions({
    userAction: (action: BattleAction) => {
      setAutoArmed(false);
      setBusy(true);
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
      setBusy(false);
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
      setBusy(false);
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

  const onPoolClick = (cid: string) => {
    if (battle.over || busy || battle.active !== 'player') return;
    const card = cards.find((c) => c.id === cid);
    if (!card) return;
    if (!card.playable) {
      hint(card.cost > battle.player.cur
        ? `指挥度不够（需要 ${card.cost}，现有 ${battle.player.cur}）`
        : '场上没有空位了（上限 6 艘）');
      return;
    }
    setSelCard(selCard === cid ? null : cid);
    setSelUnit(null);
    setFlash('');
  };

  /** 待选择状态：点任意候选单位即完成一次选择；返回是否消费了这次点击 */
  const tryResolvePending = (uid: string): boolean => {
    if (!battle.pending) return false;
    setFlash('');
    userAction({ type: 'resolvePending', unitId: uid });
    return true;
  };

  const onPlayerSlot = (i: number) => {
    if (battle.over || battle.active !== 'player') return;
    const u = battle.player.board[i];
    if (u && tryResolvePending(u.uid)) return;
    if (battle.pending) { hint('请先点一艘可选的战舰作为目标（这个位置不在候选里）'); return; }
    if (selCard && !u) {
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
    if (battle.over || battle.active !== 'player') return;
    if (battle.pending) {
      // 待选择状态下：点敌方单位 = 指定目标（点本体无效，只会得到一句提示）
      if (ref !== 'body' && tryResolvePending(ref)) return;
      hint('请先在可选的战舰上点选目标（点本体无效）');
      return;
    }
    if (!selUnit) { hint('先点己方一艘可以攻击的战舰，再点目标'); return; }
    setSelUnit(null);
    setFlash('');
    userAction({ type: 'attack', attacker: selUnit, target: ref });
  };

  const endTurn = () => {
    if (!canEndTurn(battle) || busy) return;
    setSelCard(null);
    setSelUnit(null);
    userAction({ type: 'endTurn' });
  };

  const playerUnitCount = battle.player.board.filter(Boolean).length;
  const pPct = battle.player.bodyMax > 0
    ? `${Math.max(0, Math.round((Math.max(0, battle.player.body) / battle.player.bodyMax) * 100))}%`
    : '0%';

  const defaultHint = (() => {
    if (battle.over) return `战斗结束：${battle.reason}`;
    if (busy) return battle.active === 'player' ? '（自动战斗）正在替你行动…' : 'BOSS 行动中…';
    if (battle.pending) return '请在可选战舰上点选目标';
    if (battle.active !== 'player') return '等待 BOSS 行动…';
    if (selCard) return `已选卡牌（${cards.find((c) => c.id === selCard)?.cost ?? 0} 费）→ 点自己场上的空格部署`;
    if (selUnit) return '已选战舰 → 点敌方战舰或 BOSS 本体发起攻击';
    return '点「你的舰队」里的战舰 → 再点自己场上的空格部署；点己方战舰 → 再点敌方目标攻击。';
  })();

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
          disabled={!canEndTurn(battle) || busy}
          onClick={endTurn}
        >
          结束回合
        </button>
      </div>

      {/* ==================== BOSS 面板 ==================== */}
      <BossPanel
        boss={boss}
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

      {/* ==================== 舰队池 ==================== */}
      <div className="mb-2.5 rounded-[10px] border border-[#2b3550] bg-[#141b2e] px-2.5 py-2">
        <h2 className="mb-[7px] flex items-center gap-1.5 text-[13px] font-bold">
          你的舰队
          <span className="text-[11px] font-normal text-slate-500">
            部署池 —— 不抽牌，有指挥度就能上；被击毁即永久消失；<b className="text-slate-400">点卡看技能</b>
          </span>
        </h2>
        <FleetPool cards={cards} selCard={selCard} onPoolClick={onPoolClick} />
      </div>

      {/* ==================== 提示条 + 信息条 ==================== */}
      <BattleInfoBar info={info} flash={flash} defaultHint={defaultHint} />

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
