import { memo, useCallback, useMemo, useRef, useState } from 'react';
import type { GameState } from '@/types/game';
import type { BattleAction, BattleExpedition, BattleFleet, BattleState, PirateBossId, ShipCardId } from '@/types/battle';
import { BATTLE_TUNING } from '@/data/battle/tuning';
import { BATTLE_CARDS } from '@/data/battle/cards';
import { PIRATE_BOSSES } from '@/data/battle/pirates';
import { getThumbPath } from '@/lib/assetThumb';
import { bossArtSrc } from '@/lib/battle/view';
import { canStartExpedition, discoveredLairs, lairNodeId } from '@/lib/battle/expedition';
import { RAID_CHANCE, RAID_IMMUNE_TURNS, RAID_WARNING_TURNS, raidStatus } from '@/lib/battle/raid';
import { LAIR_REWARD_GOLD, LAIR_REWARD_STARDUST } from '@/lib/battle/rewards';
import BattleScreen from './BattleScreen';
import { BossAvatar } from './parts';

// ============================================================================
// 战斗页签
//   没有进行中的战斗 → 出征入口（**已探明**的老巢 + 出征舰队 → START_EXPEDITION）
//                        ＋ 掠夺**阶段 B**（海盗已抵达）时的「开战」入口 → onStartRaidBattle
//   有战斗             → BattleScreen（整屏编排）
// 敌人选择与「怎么凑出参战舰队」是主游戏侧的规则（V1.5 §10.1 出征 / §10.2 掠夺防守），
// 战斗内部的一切判定都在引擎与 lib/battle/view.ts，本文件不重算任何战斗规则。
// 出征可用性 / 耗时 / 老巢探明 / 战利品预期金额一律读 lib/battle/expedition 与 lib/battle/rewards（唯一真值）。
//
// ⚠ **没有"直接开战"入口**（用户 2026-08 裁定），全场只有两条产生战斗的路：
//     ① 出征倒计时归零 → `useTurn` 自动派发 START_BATTLE（P5，**自动**）；
//     ② 掠夺**阶段 B** 的「开战」→ 本页签唯一的按钮，走 `START_RAID_BATTLE`（**玩家主动**但不带参数：
//        目标 / 编制 / seed 全由 reducer 侧的 lib/battle/raid.readyRaidBattle 组装）。
//   "选择敌人"那份手动清单（5 个老巢 + 掠夺队）与旧的通用"开战"按钮**已删除**：
//     · 老巢只能通过「出征」（本页签唯一的出征发起流程）打；
//     · 掠夺队**只在掠夺事件把它送到门口时**出现（阶段 B），且阶段 A 只显示预警、不给开战入口。
//   出征可用性仍走 canStartExpedition（已探明 + 有殖民地 + 有非空且非防守的舰队）。
// ============================================================================

interface BattleTabProps {
  battle: BattleState | null;
  /** 进行中的出征（V1.5 §10.1） */
  expedition: BattleExpedition | null;
  fleets: BattleFleet[];
  cardLibrary: ShipCardId[];
  /** 整份存档状态：出征的可用性 / 耗时 / 探明判定（lib/battle/expedition）与
   *  掠夺的两段窗口（lib/battle/raid.raidStatus，读 state.raid）都从它推导 —— 故**不再单独收 raid prop**。 */
  state: GameState;
  /** 发起出征（START_EXPEDITION：登记目标老巢 + 出征舰队 + 耗时回合数） */
  onStartExpedition: (bossId: PirateBossId, fleetId: string, turns: number) => void;
  /** 取消在途的出征 */
  onCancelExpedition: () => void;
  /** **掠夺阶段 B 的「开战」**（START_RAID_BATTLE）：全场唯一由玩家主动点开的战斗入口。
   *  无参窄回调 —— 目标 / 编制 / seed 全在 reducer 侧装配（UI 不能凭空开一场战斗）。 */
  onStartRaidBattle: () => void;
  onAction: (action: BattleAction) => void;
  onEndBattle: () => void;
  onCreateFleet: (name?: string) => void;
}

/** 参战舰队的摘要：同型合并计数，按池内出现顺序（出征舰队与防守合并池共用） */
function summarize(shipIds: ShipCardId[]): { id: string; n: number }[] {
  const counts: Record<string, number> = {};
  const order: string[] = [];
  for (const id of shipIds) {
    if (counts[id] === undefined) order.push(id);
    counts[id] = (counts[id] || 0) + 1;
  }
  return order.map((id) => ({ id, n: counts[id] }));
}

function BattleTabBase({
  battle,
  expedition,
  fleets,
  cardLibrary,
  state,
  onStartExpedition,
  onCancelExpedition,
  onStartRaidBattle,
  onAction,
  onEndBattle,
  onCreateFleet,
}: BattleTabProps) {
  /** 出征选中的老巢（null = 用列表第一个已探明的老巢，见 activeLair） */
  const [lairBossId, setLairBossId] = useState<PirateBossId | null>(null);
  /** 选中的出征舰队 id（'' = 还没选） */
  const [fleetId, setFleetId] = useState<string>('');

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

  /** 带防守标签的舰队（V1.5 §10.2：掠夺战 = 所有防守舰队一起接战）。
   *  合并顺序与池上限的**唯一真值**是 lib/battle/raid.raidDefensePool（与 useTurn 自动开战同源）——
   *  这里只数条数、给玩家一句"留守有几支"，不再手写 flatMap、也不参与任何手动开战。 */
  const defenders = useMemo(() => fleets.filter((f) => f.defending), [fleets]);
  const selected = fleets.find((f) => f.id === fleetId) || null;
  /** 掠夺的两段窗口（阶段 A 预警 / 阶段 B 已抵达待战 / idle + 免疫期）——
   *  判定与文案口径的**唯一真值**是 lib/battle/raid.raidStatus，本组件只渲染。 */
  const raidView = useMemo(() => raidStatus(state), [state]);

  // 稳定引用：按钮共用同一个处理器（onCreateFleet 已是稳定引用）
  const newFleet = useCallback(() => {
    onCreateFleet();
  }, [onCreateFleet]);

  /** 发起出征：拦截至此为止的唯一真值是 canStartExpedition（已在进行中 / 没有舰队 / 舰队空手都会被拦） */
  const startExpedition = useCallback(() => {
    if (!activeLair) return;
    if (!expeditionCheck || !expeditionCheck.ok) return;
    onStartExpedition(activeLair.bossId, fleetId, activeLair.turns);
  }, [activeLair, expeditionCheck, onStartExpedition, fleetId]);

  const cancelExpedition = useCallback(() => {
    onCancelExpedition();
  }, [onCancelExpedition]);

  /** 阶段 B 的「开战」：只转发，判定（阶段 / 战斗进行中 / 防守池非空）全在 reducer 侧的 readyRaidBattle */
  const startRaidBattle = useCallback(() => {
    onStartRaidBattle();
  }, [onStartRaidBattle]);

  // ---------------- 战斗实例序号（BattleScreen 的 key） ----------------
  // 换**一场新的**战斗就整体重挂载 BattleScreen → 清掉上一场残留的「已选卡 / 已选舰 / 临时提示 /
  // 自动战斗」。为什么需要它：2 支海盗掠夺队"连打两场"时第二场由 reducer 的 END_BATTLE 直接接上，
  // 主游戏侧的 seed 不变（seed 由 useTurn 在开战时取 Date.now()），只靠 seed 会把第一场的选择态带进第二场。
  // ⚠ 判据不能用"battle 对象身份变了"：每次 BATTLE_ACTION 都会克隆出新对象，那会把玩家每次操作的
  //   选择态都清掉。只有「上一场已结束（或还没有过战斗）→ 现在这场没结束」才算新的一场；
  //   没有战斗时把记录清空，下一场必然算新的。
  // ⚠ 战斗现在**只由 useTurn 自动开战**（出征 / 掠夺倒计时归零），本页签不再自己开战，
  //   所以没有"本场 seed"这个本地状态了 —— 传下去的 seed 是常量（同样靠 battleSeq 重挂载切场）。
  const battleSeq = useRef(0);
  const lastBattle = useRef<BattleState | null>(null);
  if (battle) {
    const prev = lastBattle.current;
    if (!prev || (prev.over && !battle.over)) battleSeq.current += 1;
    lastBattle.current = battle;
  } else {
    lastBattle.current = null;
  }

  // ---------------- 有战斗：整屏战斗界面 ----------------
  if (battle) {
    return (
      <BattleScreen
        key={battleSeq.current}
        battle={battle}
        seed={0}
        onAction={onAction}
        onEnd={onEndBattle}
      />
    );
  }

  // ---------------- 没有战斗：只列已探明的老巢 + 选择出征舰队 ----------------
  // ⚠ 这里**没有**"选择敌人"清单，也**没有**"开战"按钮：战斗只能由出征/掠夺的倒计时归零自动产生
  //   （发起出征是本页签唯一的入口）。掠夺队不出现在任何手动列表里。
  const optionBase =
    'flex w-full items-center gap-2 rounded-lg border px-2.5 py-2 text-left transition-colors';
  const cardBase = 'mb-2.5 rounded-[10px] border border-[#2b3550] bg-[#141b2e] px-2.5 py-2.5';

  return (
    <div className="mx-auto max-w-4xl">
      <h2 className="mb-1.5 text-lg font-bold text-slate-100">出征 / 防守</h2>

      {/* ==================== 出征（V1.5 §10.1：本页签唯一的发起入口） ====================
           目标只列**已探明**的老巢（discoveredLairs：未探明的一律不出现，也不做占位提示，
           且没有殖民地 / 航线被封锁时列表为空），耗时与可用性全部来自 lib/battle/expedition。 */}
      <div className={`${cardBase} border-cyan-800/60`}>
        <h3 className="mb-2 flex items-center gap-2 text-[13px] font-bold text-slate-200">
          出征
          <span className="text-[11px] font-normal text-slate-500">
            探明老巢后派 1 支舰队出征，抵达即自动开战
          </span>
        </h3>

        {expedition ? (
          <div>
            <p className="text-[12.5px] font-bold text-amber-300">
              还有 {expedition.turnsRemaining} 回合抵达{PIRATE_BOSSES[expedition.bossId]?.name || '未知老巢'}
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
                        {PIRATE_BOSSES[l.bossId]?.name || '未知老巢'}
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
          </div>
        )}
      </div>

      {/* ==================== 殖民地掠夺（V1.5 §10.2，两段窗口） ====================
           阶段 A（预警 CD）只报"还有 N 回合抵达"，**不给开战入口**；
           阶段 B（已抵达）海盗停在门口等玩家点「开战」，并给"还有 N 回合不迎战就自动失败"的倒计时。
           阶段 / 倒计时 / 参战池条数全部来自 lib/battle/raid.raidStatus（唯一真值），本组件只渲染。 */}
      {(raidView.phase !== 'idle' || raidView.immuneTurns > 0) && (
        <div className={`${cardBase} ${raidView.phase === 'arrived' ? 'border-red-700/70' : raidView.phase === 'warning' ? 'border-amber-700/70' : 'border-[#2b3550]'}`}>
          <h3 className="mb-2 flex items-center gap-2 text-[13px] font-bold text-slate-200">
            殖民地掠夺
            <span className="text-[11px] font-normal text-slate-500">
              每回合 {RAID_CHANCE * 100}% 触发，{RAID_WARNING_TURNS} 回合预警，结束免疫 {RAID_IMMUNE_TURNS} 回合
            </span>
          </h3>

          {raidView.phase === 'warning' ? (
            <>
              <p className="text-[12.5px] font-bold text-amber-300">
                海盗还有 {raidView.turnsToArrival} 回合抵达
                {raidView.raiders > 1 ? `（本次 ${raidView.raiders} 支，赢下第一场要连打第二场）` : ''}
              </p>
              <p className="mt-1 text-[11px] leading-relaxed text-slate-400">
                {raidView.defenseCount > 0
                  ? `现在有 ${raidView.defenseCount} 艘带「防守」标签的舰队会在抵达时合并成一个部署池（到那时再点「开战」）。`
                  : '现在还没有带「防守」标签的舰队 —— 去机库给留守舰队打上防守标签（到达后不打会被掠夺成功）。'}
              </p>
            </>
          ) : raidView.phase === 'arrived' ? (
            <>
              <p className="text-[12.5px] font-bold text-red-300">
                海盗已抵达，还有 {raidView.turnsToAutoLoot} 回合
                <span className="ml-1 font-normal text-slate-400">（到时你还不迎战，就会被掠夺成功）</span>
                {raidView.raiders > 1 ? `（本次 ${raidView.raiders} 支，赢下第一场要连打第二场）` : ''}
              </p>
              <p className="mt-1 text-[11px] leading-relaxed text-slate-400">
                {raidView.defenseCount > 0
                  ? `留守的 ${raidView.defenseCount} 艘带「防守」标签的舰队会合并成一个部署池接战；这 ${raidView.turnsToAutoLoot} 回合里还可以去机库调整编成与防守标签。`
                  : '还没有挂防守标签的舰队 —— 现在去机库给留守舰队打上防守标签，再回来点「开战」；不打就会在倒计时归零时被掠夺成功。'}
              </p>
              <div className="mt-2 flex flex-wrap items-center gap-2">
                <button
                  type="button"
                  onClick={startRaidBattle}
                  disabled={!raidView.canFight}
                  className="rounded-[7px] border border-red-500 bg-red-700 px-3 py-1.5 text-[12.5px] font-bold text-white hover:enabled:bg-red-600 disabled:cursor-not-allowed disabled:opacity-40"
                >
                  开战
                </button>
                {/* 不能开战的原因写在行内（手机端没有 hover）：防守池为空时的文案是用户裁定的逐字口径 */}
                <span className="text-[10.5px] leading-relaxed text-amber-400">
                  {raidView.canFight
                    ? `可以迎战：${raidView.defenseCount} 艘防守舰队合并接战`
                    : '还没有挂防守标签的舰队'}
                </span>
              </div>
            </>
          ) : (
            <p className="text-[12.5px] text-slate-300">
              海盗已退（击退或已结算），{raidView.immuneTurns} 回合内不会再被掠夺。
            </p>
          )}
        </div>
      )}

      {/* ==================== 选择出征舰队 ====================
           出征战：1 支舰队出征，带防守标签的舰队不能出征。
           "不带防守标签""编制非空"这两条由 canStartExpedition 判（上面的按钮已置灰并给原因）。 */}
      <div className={cardBase}>
        <h3 className="mb-2 flex items-center gap-2 text-[13px] font-bold text-slate-200">
          选择出征舰队
          <span className="text-[11px] font-normal text-slate-500">
            出征战：1 支舰队出征，带防守标签的舰队不能出征
          </span>
        </h3>
        {fleets.length === 0 ? (
          <div>
            <p className="mb-2 text-xs leading-relaxed text-amber-400">
              还没有舰队 —— 先建一支，然后去机库页签里编成（卡库与编队都在机库）。
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

        {selected && (
          <p className="mt-2 text-[11px] text-slate-500">
            出征舰队：{selected.name} —— 编制上限 {BATTLE_TUNING.fleetSize} 艘，当前 {selected.shipIds.length} 艘
            {selected.shipIds.length > 0 ? '' : '（这支队里还没有战舰 —— 出征不能空手，去机库页签里把战舰编进来）'}
          </p>
        )}
        {selected && selected.shipIds.length > 0 ? (
          <div className="mt-1.5 flex flex-wrap gap-1">
            {summarize(selected.shipIds).map((s) => (
              <span
                key={s.id}
                className="rounded-[5px] border border-[#2b3550] bg-[#161f36] px-1.5 py-px text-[10.5px] text-slate-400"
              >
                {BATTLE_CARDS[s.id]?.name || '未知战舰'}
                {s.n > 1 ? ` ×${s.n}` : ''}
              </span>
            ))}
          </div>
        ) : null}

        {expedition && (
          <p className="mt-2 text-[11px] leading-relaxed text-amber-400">
            已有出征在途：{PIRATE_BOSSES[expedition.bossId]?.name || '未知老巢'}
            （剩 {expedition.turnsRemaining} 回合开战）—— 同时只能出征 1 个老巢；先等它抵达开战，或在上面的「出征」里取消。
          </p>
        )}

        {cardLibrary.length === 0 && (
          <p className="mt-2 text-xs leading-relaxed text-slate-500">
            卡库是空的 —— 去机库页签的船坞面板建成船坞、下单造舰，完工后自动进卡库。
          </p>
        )}

        <p className="mt-2 text-[11px] leading-relaxed text-slate-500">
          卡库共 {cardLibrary.length} 艘 · 留守（带「防守」标签）{defenders.length} 支
        </p>
      </div>
    </div>
  );
}

export default memo(BattleTabBase);
