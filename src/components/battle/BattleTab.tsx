import { memo, useCallback, useMemo, useState } from 'react';
import type { GameState } from '@/types/game';
import type { BattleAction, BattleExpedition, BattleFleet, BattleRaidState, BattleState, PirateBossId, ShipCardId } from '@/types/battle';
import { BATTLE_TUNING } from '@/data/battle/tuning';
import { LAIR_BOSS_IDS, PIRATE_BOSSES } from '@/data/battle/pirates';
import { getThumbPath } from '@/lib/assetThumb';
import { bossArtSrc } from '@/lib/battle/view';
import { canStartExpedition, discoveredLairs, lairNodeId } from '@/lib/battle/expedition';
import { LAIR_REWARD_GOLD, LAIR_REWARD_STARDUST } from '@/lib/battle/rewards';
import BattleScreen from './BattleScreen';
import { BossAvatar } from './parts';

// ============================================================================
// 战斗页签
//   没有进行中的战斗 → 出征入口（已探明的老巢 + 出征舰队 → START_EXPEDITION）
//                      + 直接开战（打老巢即出征、打 raid 即防守，P4 保留）
//   有战斗             → BattleScreen（整屏编排）
// 敌人选择与「怎么凑出参战舰队」是主游戏侧的规则（V1.5 §10.1 出征 / §10.2 掠夺防守），
// 战斗内部的一切判定都在引擎与 lib/battle/view.ts，本文件不重算任何战斗规则。
// 出征可用性 / 耗时 / 老巢探明 / 战利品预期金额一律读 lib/battle/expedition 与 lib/battle/rewards（唯一真值）。
// ============================================================================

interface BattleTabProps {
  battle: BattleState | null;
  /** 进行中的出征（V1.5 §10.1） */
  expedition: BattleExpedition | null;
  /** 掠夺状态（V1.5 §10.2） */
  raid: BattleRaidState;
  fleets: BattleFleet[];
  cardLibrary: ShipCardId[];
  /** 整份存档状态：出征的可用性 / 耗时 / 探明判定都由 lib/battle/expedition 从它推导 */
  state: GameState;
  /** 本场战斗的随机种子（不传则开战时取 Date.now()） */
  seed?: number;
  onStartBattle: (bossId: PirateBossId, fleet: ShipCardId[], kind: 'expedition' | 'defense', seed: number) => void;
  /** 发起出征（START_EXPEDITION：登记目标老巢 + 出征舰队 + 耗时回合数） */
  onStartExpedition: (bossId: PirateBossId, fleetId: string, turns: number) => void;
  /** 取消在途的出征 */
  onCancelExpedition: () => void;
  onAction: (action: BattleAction) => void;
  onEndBattle: () => void;
  onCreateFleet: (name?: string) => void;
  onDebugFillSampleLibrary: () => void;
}

function isLair(id: string): boolean {
  return LAIR_BOSS_IDS.indexOf(id) >= 0;
}

/** 参战舰队的摘要：同型合并计数，按池内出现顺序 */
function summarize(shipIds: ShipCardId[]): { id: string; n: number }[] {
  const counts: Record<string, number> = {};
  const order: string[] = [];
  for (const id of shipIds) {
    if (counts[id] === undefined) order.push(id);
    counts[id] = (counts[id] || 0) + 1;
  }
  return order.map((id) => ({ id, n: counts[id] }));
}

/** 选敌人用的 6 个选项（b1~b5 老巢 + raid 掠夺队），顺序与 DEMO 下拉一致 */
const ENEMY_IDS: PirateBossId[] = ['b1', 'raid', 'b2', 'b3', 'b4', 'b5'];

function BattleTabBase({
  battle,
  expedition,
  raid,
  fleets,
  cardLibrary,
  state,
  seed,
  onStartBattle,
  onStartExpedition,
  onCancelExpedition,
  onAction,
  onEndBattle,
  onCreateFleet,
  onDebugFillSampleLibrary,
}: BattleTabProps) {
  const [bossId, setBossId] = useState<PirateBossId>('b1');
  const [fleetId, setFleetId] = useState<string>('');
  /** 出征选中的老巢（null = 用列表第一个已探明的老巢，见 lairBossId） */
  const [lairBossId, setLairBossId] = useState<PirateBossId | null>(null);
  /** 本场战斗实际使用的 seed：开战时定下来，交给 BattleScreen 做「新开一场」的判据 */
  const [battleSeed, setBattleSeed] = useState(0);

  /** 已探明的老巢（未探明的一律不出现，也不做占位提示；没有殖民地时列表为空 —— V1.5 §10.1） */
  const lairs = useMemo(() => discoveredLairs(state), [state]);
  /** 生效的老巢：玩家点过的优先，否则回落到列表第一个 */
  const activeLair = lairs.find((l) => l.bossId === lairBossId) ?? lairs[0] ?? null;
  /** 出征不可用的原因（同步可判的拦截全在 lib/battle/expedition.canStartExpedition，UI 只负责显示） */
  const expeditionCheck = useMemo(
    () => (activeLair ? canStartExpedition(state, activeLair.bossId, fleetId) : null),
    [state, activeLair, fleetId]
  );
  /** 已建立殖民地？（出征的前提，V1.5 §10.2；`scouting` 是旧存档的建设期，也算已建立） */
  const colonyPhase = state.ships[0]?.colony?.phase ?? 'inactive';
  // ColonyPhase = 'inactive' | 'scouting' | 'active'（'selecting' 属奇观阶段，勿混）
  const hasColony = colonyPhase !== 'inactive';

  /** 带防守标签的舰队合并池（V1.5 §10.2：掠夺战 = 所有防守舰队一起接战） */
  const defenders = useMemo(() => fleets.filter((f) => f.defending), [fleets]);
  const kind: 'expedition' | 'defense' = bossId === 'raid' ? 'defense' : 'expedition';
  const selected = fleets.find((f) => f.id === fleetId) || null;
  const participants: ShipCardId[] = kind === 'defense'
    ? defenders.flatMap((f) => f.shipIds)
    : (selected ? selected.shipIds : []);
  const missing = kind === 'defense' ? defenders.length === 0 : !selected;
  const canStart = participants.length > 0;

  const start = useCallback(() => {
    if (battle) return;
    if (participants.length === 0) return;
    const s = seed == null ? Date.now() : seed;
    setBattleSeed(s);
    onStartBattle(bossId, participants.slice(), kind, s);
  }, [battle, participants, seed, onStartBattle, bossId, kind]);

  // 稳定引用：两个按钮共用同一个处理器（onCreateFleet / onDebugFillSampleLibrary 已是稳定引用）
  const newFleet = useCallback(() => {
    onCreateFleet();
  }, [onCreateFleet]);
  const fillSample = useCallback(() => {
    onDebugFillSampleLibrary();
  }, [onDebugFillSampleLibrary]);

  /** 发起出征：拦截至此为止的唯一真值是 canStartExpedition（已在进行中 / 没有舰队 / 舰队空手都会被拦） */
  const startExpedition = useCallback(() => {
    if (!activeLair) return;
    if (!expeditionCheck || !expeditionCheck.ok) return;
    onStartExpedition(activeLair.bossId, fleetId, activeLair.turns);
  }, [activeLair, expeditionCheck, onStartExpedition, fleetId]);

  const cancelExpedition = useCallback(() => {
    onCancelExpedition();
  }, [onCancelExpedition]);

  // ---------------- 有战斗：整屏战斗界面 ----------------
  if (battle) {
    return <BattleScreen battle={battle} seed={battleSeed} onAction={onAction} onEnd={onEndBattle} />;
  }

  // ---------------- 没有战斗：选择敌人 + 选择参战舰队 ----------------
  const optionBase =
    'flex w-full items-center gap-2 rounded-lg border px-2.5 py-2 text-left transition-colors';
  const cardBase = 'mb-2.5 rounded-[10px] border border-[#2b3550] bg-[#141b2e] px-2.5 py-2.5';

  return (
    <div className="mx-auto max-w-4xl">
      <h2 className="mb-1 text-lg font-bold text-slate-100">出征 / 防守</h2>
      <p className="mb-3 text-xs leading-relaxed text-slate-400">
        选一个敌人，再选参战舰队，然后开战。战斗界面照搬舰队卡牌 DEMO：
        点卡牌看技能 → 点自己场上的空格部署 → 点己方战舰再点敌方目标攻击。
      </p>

      {/* ==================== 出征（V1.5 §10.1：正式入口） ====================
           只列**已探明**的老巢（未探明不占位、不提示），耗时与可用性全部来自 lib/battle/expedition。 */}
      <div className={`${cardBase} border-cyan-800/60`}>
        <h3 className="mb-2 flex items-center gap-2 text-[13px] font-bold text-slate-200">
          出征
          <span className="text-[11px] font-normal text-slate-500">
            探明老巢后派 1 支舰队出征，抵达即自动开战（V1.5 §10.1）
          </span>
        </h3>

        {expedition ? (
          <div>
            <p className="text-[12.5px] font-bold text-amber-300">
              还有 {expedition.turnsRemaining} 回合抵达{PIRATE_BOSSES[expedition.bossId]?.name || expedition.bossId}
              <span className="ml-1 text-[11px] font-normal text-slate-500">
                （目标 {lairNodeId(expedition.bossId) ?? '未知'}）
              </span>
            </p>
            <p className="mt-1 text-[11px] text-slate-500">
              出征期间不能改这支舰队的防守标签；抵达后自动开战，战斗结束时这场出征收尾。
            </p>
            <button
              type="button"
              onClick={cancelExpedition}
              className="mt-2 rounded-[7px] border border-[#39507d] bg-[#22304d] px-3 py-1.5 text-[12px] text-slate-200 hover:bg-[#2c3d61]"
            >
              取消出征
            </button>
          </div>
        ) : lairs.length === 0 ? (
          <p className="text-xs leading-relaxed text-amber-400">
            还没有探明任何海盗老巢 —— 去星图里探索吧（只有到访过的星系才算探明）。
            {hasColony ? '' : ' 出征还以「已建立殖民地」为前提，先去殖民页签建一颗星球。'}
          </p>
        ) : (
          <div>
            <div className="grid gap-1.5 md:grid-cols-2">
              {lairs.map((l) => {
                const on = activeLair?.bossId === l.bossId;
                return (
                  <button
                    key={l.bossId}
                    type="button"
                    onClick={() => setLairBossId(l.bossId)}
                    className={`${optionBase} ${
                      on ? 'border-cyan-500 bg-cyan-900/20' : 'border-[#2b3550] bg-[#1b2438] hover:border-[#3a4767]'
                    }`}
                  >
                    <BossAvatar src={getThumbPath(bossArtSrc(l.bossId))} />
                    <span className="min-w-0 flex-1">
                      <span className="block text-[12.5px] font-bold text-slate-100">
                        {PIRATE_BOSSES[l.bossId]?.name || l.bossId}
                        <span className="ml-1 text-[11px] font-normal text-slate-500">
                          {l.name} · {PIRATE_BOSSES[l.bossId]?.hp ?? '?'} 血
                        </span>
                      </span>
                      <span className="mt-0.5 block text-[11px] leading-snug text-slate-500">
                        还有 {l.turns} 回合抵达 · 战利品 {LAIR_REWARD_GOLD} 金币 + {LAIR_REWARD_STARDUST} 星尘
                      </span>
                    </span>
                  </button>
                );
              })}
            </div>
            {expeditionCheck && !expeditionCheck.ok && (
              <p className="mt-2 text-[11px] leading-relaxed text-amber-400">{expeditionCheck.reason}</p>
            )}
            <button
              type="button"
              onClick={startExpedition}
              disabled={!expeditionCheck || !expeditionCheck.ok}
              className="mt-2 rounded-[7px] border border-cyan-500 bg-cyan-700 px-3 py-1.5 text-[12.5px] font-bold text-white hover:enabled:bg-cyan-600 disabled:cursor-not-allowed disabled:opacity-40"
            >
              出征
            </button>
            <p className="mt-1 text-[11px] text-slate-500">
              出征舰队用下面「选择参战舰队」里选中的那支。
            </p>
          </div>
        )}
      </div>

      {/* ==================== ① 选择敌人（6 个：b1~b5 + 掠夺队） ==================== */}
      <div className={cardBase}>
        <h3 className="mb-2 flex items-center gap-2 text-[13px] font-bold text-slate-200">
          选择敌人
          <span className="text-[11px] font-normal text-slate-500">
            老巢 5 个（出征）+ 掠夺队（防守）；掠夺队 20 血、无头目技能
          </span>
        </h3>
        <div className="grid gap-1.5 md:grid-cols-2">
          {ENEMY_IDS.map((id) => {
            const def = PIRATE_BOSSES[id];
            const on = bossId === id;
            return (
              <button
                key={id}
                type="button"
                onClick={() => setBossId(id)}
                className={`${optionBase} ${
                  on
                    ? 'border-cyan-500 bg-cyan-900/20'
                    : 'border-[#2b3550] bg-[#1b2438] hover:border-[#3a4767]'
                }`}
              >
                <BossAvatar src={getThumbPath(bossArtSrc(id))} />
                <span className="min-w-0 flex-1">
                  <span className="block text-[12.5px] font-bold text-slate-100">
                    {def.name}
                    <span className="ml-1 text-[11px] font-normal text-slate-500">{def.hp} 血</span>
                  </span>
                  <span className="mt-0.5 block text-[11px] leading-snug text-slate-500">{def.skill}</span>
                </span>
                <span className={`text-[10px] font-bold ${isLair(id) ? 'text-amber-400' : 'text-sky-400'}`}>
                  {isLair(id) ? '出征' : '防守'}
                </span>
              </button>
            );
          })}
        </div>
      </div>

      {/* ==================== ② 选择参战舰队 ==================== */}
      <div className={cardBase}>
        <h3 className="mb-2 flex items-center gap-2 text-[13px] font-bold text-slate-200">
          选择参战舰队
          <span className="text-[11px] font-normal text-slate-500">
            {kind === 'defense'
              ? '防守战：所有带「防守」标签的舰队合并成一个部署池（V1.5 §10.2）'
              : '出征战：1 支舰队出征，带防守标签的舰队不能出征（V1.5 §10.1）'}
          </span>
        </h3>
        {kind === 'defense' ? (
          defenders.length === 0 ? (
            <p className="text-xs leading-relaxed text-amber-400">
              还没有带「防守」标签的舰队 —— 先创建舰队并给它打上防守标签（舰队编成在 P8 船坞里做）。
            </p>
          ) : (
            <div className="flex flex-wrap gap-2">
              {defenders.map((f) => (
                <span
                  key={f.id}
                  className="rounded-md border border-cyan-600/50 bg-cyan-900/20 px-2 py-1 text-[12px] text-cyan-200"
                >
                  {f.name} · {f.shipIds.length} 艘
                </span>
              ))}
            </div>
          )
        ) : fleets.length === 0 ? (
          <div>
            <p className="mb-2 text-xs leading-relaxed text-amber-400">
              还没有舰队 —— 先建一支（P8 船坞会有完整的编队界面；现在建完用下面的「测试用」按钮填卡库即可试玩）。
            </p>
            <button
              type="button"
              onClick={newFleet}
              className="rounded-[7px] border border-blue-500 bg-blue-700 px-3 py-1 text-[12px] text-white hover:bg-blue-600"
            >
              新建舰队
            </button>
          </div>
        ) : (
          <div className="flex flex-wrap gap-1.5">
            {fleets.map((f) => {
              const on = fleetId === f.id;
              return (
                <button
                  key={f.id}
                  type="button"
                  onClick={() => setFleetId(f.id)}
                  className={`${optionBase} w-auto ${
                    on ? 'border-cyan-500 bg-cyan-900/20' : 'border-[#2b3550] bg-[#1b2438] hover:border-[#3a4767]'
                  }`}
                >
                  <span className="text-[12.5px] font-bold text-slate-100">{f.name}</span>
                  <span className="text-[11px] text-slate-500">{f.shipIds.length} 艘</span>
                  {f.defending ? <span className="text-[10px] text-amber-400">防守</span> : null}
                </button>
              );
            })}
          </div>
        )}

        {kind === 'expedition' && selected && (
          <p className="mt-2 text-[11px] text-slate-500">
            出征舰队：{selected.name} —— 编制上限 {BATTLE_TUNING.fleetSize} 艘，当前 {selected.shipIds.length} 艘
          </p>
        )}

        {kind === 'expedition' && expedition && (
          <p className="mt-2 text-[11px] text-amber-400">
            已有出征在途：{PIRATE_BOSSES[expedition.bossId]?.name || expedition.bossId}
            （剩 {expedition.turnsRemaining} 回合开战）—— 同时只能出征 1 个老巢。
          </p>
        )}
        {kind === 'defense' && raid.inTurns !== null && (
          <p className="mt-2 text-[11px] text-amber-400">
            掠夺队还有 {raid.inTurns} 回合到场
            {raid.raiders > 1 ? `（本次 ${raid.raiders} 支，赢下第一场还要连打一场）` : ''}。
          </p>
        )}
        {kind === 'defense' && raid.immuneTurns > 0 && (
          <p className="mt-2 text-[11px] text-slate-500">当前免疫期还剩 {raid.immuneTurns} 回合。</p>
        )}
      </div>

      {/* ==================== ③ 开战摘要 + 按钮 ==================== */}
      <div className={cardBase}>
        <h3 className="mb-2 text-[13px] font-bold text-slate-200">
          参战舰队（{participants.length} 艘）
          <span className="ml-2 text-[11px] font-normal text-slate-500">卡库共 {cardLibrary.length} 艘</span>
        </h3>
        {participants.length > 0 ? (
          <div className="flex flex-wrap gap-1">
            {summarize(participants).map((s) => (
              <span
                key={s.id}
                className="rounded-[5px] border border-[#2b3550] bg-[#161f36] px-1.5 py-px text-[10.5px] text-slate-400"
              >
                {s.id}
                {s.n > 1 ? ` ×${s.n}` : ''}
              </span>
            ))}
          </div>
        ) : (
          <p className="text-xs leading-relaxed text-amber-400">
            {missing
              ? '请先选择舰队（或给舰队打上防守标签）。'
              : '这支队里还没有战舰 —— 出征不能空手（V1.5 §10.1）；船坞（P8）上线前可先建队，编成在船坞里做。'}
          </p>
        )}
        {cardLibrary.length === 0 && (
          <p className="mt-2 text-xs leading-relaxed text-slate-500">
            卡库是空的：战舰只能靠船坞建造（V1.5 §8，P8 上线）。想现在试玩，用下面的「测试用」按钮。
          </p>
        )}
        {/* 出征在途时**直接开战**也要挡住（打老巢 = 又一次出征；V1.5 §10.1 同时只能出征 1 个老巢）。
            防守战（raid）不受影响：出征期间殖民地被掠夺，只能靠留守舰队接战。 */}
        {kind === 'expedition' && expedition && (
          <p className="mt-2 text-[11px] leading-relaxed text-amber-400">
            已有出征在途，新的出征（含这里的「直接开战」打老巢）暂时不能发起 —— 先等它抵达开战，或在上面的「出征」里取消。
          </p>
        )}
        <div className="mt-3 flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={start}
            disabled={!canStart || (kind === 'expedition' && !!expedition)}
            className="rounded-[7px] border border-blue-500 bg-blue-700 px-3 py-1.5 text-[12.5px] font-bold text-white hover:enabled:bg-blue-600 disabled:cursor-not-allowed disabled:opacity-40"
          >
            开战
          </button>
          <button
            type="button"
            onClick={newFleet}
            className="rounded-[7px] border border-[#39507d] bg-[#22304d] px-3 py-1.5 text-[12px] text-slate-200 hover:bg-[#2c3d61]"
          >
            新建舰队
          </button>
          {/* ⚠ P4 临时入口：P8 船坞上线后删除（连同 types/game.ts 的 DEBUG_FILL_SAMPLE_LIBRARY） */}
          <button
            type="button"
            onClick={fillSample}
            className="rounded-[7px] border border-amber-600 bg-amber-900/30 px-3 py-1.5 text-[12px] text-amber-200 hover:bg-amber-900/50"
          >
            测试用：填入示例舰队（26 艘）
          </button>
        </div>
      </div>
    </div>
  );
}

export default memo(BattleTabBase);
