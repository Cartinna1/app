// ==================== 战斗页签 ·「雇佣兵」子标签 ====================
// 只做渲染：所有判定与文案都来自 `lib/turn/bounties`（与 reducer 守卫**同一份判据**）：
//   · `buildBountyBatch(state)`  → 本批榜单 + `notice`（四支全冷却那句）
//   · `canAcceptBounty` / `canStartBountyBattle` → 按钮可用性 + **不可用原因**（UI 不自己判一遍）
//   · `bountyRewardText` / `bountyExpiryText` / `bountyRestRemaining` → 三处文案
// ⚠ 回调全部由 GameScreen 从 `useStableActions` 传下来（本组件不接 dispatch、不写 inline 箭头进 memo 子件）。
// ⚠ 结算不在本组件：打赢/打输的结果只出现在**事件记录**里（与掠夺战同一条口径）。

import { memo, useState } from 'react';
import type { BattleFleet } from '@/types/battle';
import type { GameState } from '@/types/game';
import {
  BOUNTY_MAX_ACTIVE,
  bountyEnemyId,
  bountyExpiryText,
  bountyRewardText,
  bountyRestRemaining,
  buildBountyBatch,
  canAcceptBounty,
  canStartBountyBattle,
  getBountyDef,
} from '@/lib/turn/bounties';
// 卡库艘数的唯一真值（与接单守卫同一来源：UI 不许自己写 cardLibrary.length）
import { libraryShipCount } from '@/lib/battle/hangar';
// 敌方旗帜的唯一映射（敌人 id → 旗帜路径 / 显示名）
import { enemyFlagLabel, enemyFlagPath } from '@/lib/battle/enemyFlag';

interface MercenaryBoardProps {
  state: GameState;
  fleets: BattleFleet[];
  /** 接一条（ACCEPT_BOUNTY） */
  onAccept: (defId: string) => void;
  /** 放弃一条（ABANDON_BOUNTY，不扣任何东西） */
  onAbandon: (defId: string) => void;
  /** 当场出击（START_BOUNTY_BATTLE） */
  onStart: (defId: string, fleetId: string) => void;
}

const KIND_LABEL: Record<string, string> = {
  pirate: '清剿海盗',
  raid: '截击掠夺队',
  elite: '悬赏头目',
};

const cardBase = 'mb-2.5 rounded-[10px] border border-[#2b3550] bg-[#141b2e] px-2.5 py-2.5';
const btnBase = 'rounded-[7px] border px-3 py-1.5 text-[12.5px] font-bold transition-colors';

function MercenaryBoardBase({ state, fleets, onAccept, onAbandon, onStart }: MercenaryBoardProps) {
  /** 出击舰队（空串 = 还没选，回落到第一支可用舰队） */
  const [fleetId, setFleetId] = useState<string>('');

  const batch = buildBountyBatch(state);
  const actives = state.bounties.active;
  // 本批榜单 + 已接但已不在榜单里的（换批后仍可继续打，必须看得见）
  const listedIds: string[] = [];
  for (const id of batch.offered) listedIds.push(id);
  for (const p of actives) if (!listedIds.includes(p.defId)) listedIds.push(p.defId);

  // 出击舰队：玩家选过就用它，否则回落到第一支「不带防守标签、有战舰」的舰队
  const fallbackFleet = fleets.find((f) => !f.defending && f.shipIds.length > 0) ?? fleets[0];
  const effectiveFleetId = fleetId || (fallbackFleet ? fallbackFleet.id : '');

  const totalActive = actives.length;
  const atCap = totalActive >= BOUNTY_MAX_ACTIVE;

  return (
    <div>
      <p className="mb-2 text-[11px] leading-relaxed text-slate-500">
        接单后<b className="text-slate-300">当场出击</b>，不跃迁、不计耗时。同时最多 {BOUNTY_MAX_ACTIVE} 条
        （当前 {totalActive} 条）· 榜单每 10 回合换一批 · **打赢任意一条后统一休息 6 回合**。
      </p>

      {bountyRestRemaining(state) > 0 ? (
        <p className="mb-2 rounded-[8px] border border-rose-700/60 bg-rose-950/40 px-2.5 py-2 text-[12px] font-bold leading-relaxed text-rose-200">
          悬赏整理中，还差 {bountyRestRemaining(state)} 回合
        </p>
      ) : null}

      {batch.notice ? (
        <p className="mb-2 rounded-[8px] border border-amber-700/60 bg-amber-950/30 px-2.5 py-2 text-[11.5px] leading-relaxed text-amber-300">
          {batch.notice}
        </p>
      ) : null}

      {/* 出击舰队（所有"出击"按钮共用）：不可用时把原因写在下面，不只置灰 */}
      <div className={`${cardBase} border-cyan-800/60`}>
        <label className="flex flex-wrap items-center gap-2 text-[12.5px] text-slate-300">
          出击舰队
          <select
            value={effectiveFleetId}
            onChange={(e) => setFleetId(e.target.value)}
            className="rounded-[7px] border border-[#39507d] bg-[#1b2437] px-2 py-1 text-[12.5px] text-slate-200"
          >
            {fleets.length === 0 ? <option value="">（还没有舰队）</option> : null}
            {fleets.map((f) => (
              <option key={f.id} value={f.id}>
                {f.name}（{f.shipIds.length} 艘{f.defending ? ' · 防守' : ''}）
              </option>
            ))}
          </select>
        </label>
        {fleets.length === 0 ? (
          <p className="mt-1.5 text-[11px] leading-relaxed text-amber-400">
            还没有舰队 —— 去「机库」页签编一支，再回来出击。
          </p>
        ) : null}
      </div>

      {/* ==================== 本批榜单 ==================== */}
      {listedIds.map((defId) => {
        const def = getBountyDef(defId);
        if (!def) return null;
        const progress = actives.find((p) => p.defId === defId) ?? null;
        const acceptCheck = canAcceptBounty(state, defId);
        const startCheck = progress ? canStartBountyBattle(state, defId, effectiveFleetId) : null;
        // 敌方旗帜（四支势力专属）：路径与显示名都来自 `lib/battle/enemyFlag` 的**唯一映射**，
        // m05（弱海盗）与 raid 返回 null → 整个徽记元素都不渲染（不占位、不塞占位图）。
        const flagSrc = enemyFlagPath(def.enemyId);
        const flagLabel = enemyFlagLabel(def.enemyId);
        return (
          <div key={defId} className={`${cardBase} ${progress ? 'border-emerald-800/60' : ''}`}>
            {flagSrc ? (
              /* 40×40 圆角徽记：最大出口只有 40px（64px 级）→ 用原图、不走缩略图；
                 缺失/加载失败直接把元素收起（与项目里"缺图不崩、不留空框"的既有做法一致）。 */
              <img
                src={flagSrc}
                alt={flagLabel || ''}
                title={flagLabel || undefined}
                width={40}
                height={40}
                loading="lazy"
                decoding="async"
                className="float-left mr-2 mb-1 h-10 w-10 rounded-[6px] border border-[#2b3550] object-cover"
                onError={(e) => { e.currentTarget.style.display = 'none'; }}
              />
            ) : null}
            <div className="flex flex-wrap items-baseline gap-x-2 gap-y-1">
              <span className="rounded bg-[#22304d] px-1.5 py-0.5 text-[10px] text-slate-300">
                {KIND_LABEL[def.kind] ?? def.kind}
              </span>
              <b className="text-[13px] text-slate-100">{def.title}</b>
              <span className="text-[10.5px] text-amber-300">难度 {def.difficulty}</span>
              <span className="text-[10.5px] text-slate-500">目标：{bountyTargetLabel(defId)}</span>
            </div>
            <p className="mt-1 text-[11.5px] leading-relaxed text-slate-400">{def.desc}</p>
            <p className="mt-1 text-[11px] leading-relaxed text-cyan-300">报酬：{bountyRewardText(def)}</p>
            {def.requireCardCount ? (
              <p className="mt-0.5 text-[10.5px] leading-relaxed text-slate-500">
                接取门槛：卡库至少 {def.requireCardCount} 艘（当前 {libraryShipCount(state.cardLibrary)} 艘）
              </p>
            ) : null}

            {progress ? (
              <div className="mt-1.5 border-t border-[#2b3550] pt-1.5">
                <p className="text-[11.5px] text-emerald-300">
                  进行中 · {bountyExpiryText(progress, state.turn)}
                </p>
                <div className="mt-1.5 flex flex-wrap items-center gap-2">
                  <button
                    type="button"
                    disabled={!startCheck || !startCheck.ok}
                    onClick={() => onStart(defId, effectiveFleetId)}
                    className={`${btnBase} ${startCheck && startCheck.ok
                      ? 'border-red-500 bg-red-700 text-white hover:bg-red-600'
                      : 'cursor-not-allowed border-[#39507d] bg-[#22304d] text-slate-500'}`}
                  >
                    出击
                  </button>
                  <button
                    type="button"
                    disabled={!!state.battle}
                    onClick={() => onAbandon(defId)}
                    className={`${btnBase} ${state.battle
                      ? 'cursor-not-allowed border-[#39507d] bg-[#22304d] text-slate-500'
                      : 'border-[#39507d] bg-[#22304d] text-slate-200 hover:bg-[#2c3d61]'}`}
                  >
                    放弃
                  </button>
                  {/* 不可出击的原因：与 reducer 守卫同一份判据（canStartBountyBattle） */}
                  {startCheck && !startCheck.ok ? (
                    <span className="text-[10.5px] leading-relaxed text-amber-400">{startCheck.reason}</span>
                  ) : null}
                </div>
              </div>
            ) : (
              <div className="mt-1.5 flex flex-wrap items-center gap-2 border-t border-[#2b3550] pt-1.5">
                <button
                  type="button"
                  disabled={!acceptCheck.ok}
                  onClick={() => onAccept(defId)}
                  className={`${btnBase} ${acceptCheck.ok
                    ? 'border-cyan-500 bg-cyan-700 text-white hover:bg-cyan-600'
                    : 'cursor-not-allowed border-[#39507d] bg-[#22304d] text-slate-500'}`}
                >
                  接取
                </button>
                {/* 不可接的原因：同样来自 canAcceptBounty（不在这里另写判断） */}
                {!acceptCheck.ok ? (
                  <span className="text-[10.5px] leading-relaxed text-amber-400">{acceptCheck.reason}</span>
                ) : null}
                {atCap ? (
                  <span className="text-[10.5px] leading-relaxed text-amber-400">
                    已接满 {BOUNTY_MAX_ACTIVE} 条
                  </span>
                ) : null}
              </div>
            )}

            {/* 头目档冷却提示（只在冷却中显示；冷却不影响已接的那条，只影响再接） */}
            {null}
          </div>
        );
      })}

      {listedIds.length === 0 ? (
        <p className="text-[11.5px] leading-relaxed text-slate-500">
          榜单是空的 —— 下个刷新周期再来看看。
        </p>
      ) : null}
    </div>
  );
}

/** 敌方显示名：本版四支头目都还没有敌人定义（m01~m04 待阶段 2/3），
 *  所以这里只给**类别名**，不编造具体敌人名。 */
function bountyTargetLabel(defId: string): string {
  const def = getBountyDef(defId);
  if (!def) return '未知';
  if (def.kind === 'elite') return '势力头目';
  const enemy = bountyEnemyId(def);
  return enemy === 'raid' ? '海盗掠夺队' : '海盗杂兵队';
}

export default memo(MercenaryBoardBase);
