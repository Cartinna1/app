import { memo } from 'react';
import type { SlotView, UnitView } from '@/lib/battle/view';
import { UnitArt } from './parts';

// ============================================================================
// 一侧战场（6 槽）。视觉逐条对齐 carddemo/index.html 的 .board / .slot / .unit / .badge。
// 判定全部来自 lib/battle/view.ts 的 boardView（纯函数）：只有 clickable 的格子可点。
// ============================================================================

// ---------------- 视觉映射（类名是静态字面量，Tailwind 才能扫到） ----------------

/** 攻击状态的左边条 + 整卡明暗：ready 绿 / used 灰+变暗 / blocked 琥珀 / idle 无 */
function unitStateClass(state: UnitView['attackState']): string {
  if (state === 'ready') return 'border-l-[3px] border-l-green-500';
  if (state === 'used') return 'border-l-[3px] border-l-slate-600 opacity-50';
  if (state === 'blocked') return 'border-l-[3px] border-l-amber-500';
  return '';
}

/** 底部状态字的颜色 */
function attackTextClass(state: string): string {
  if (state === 'ready') return 'text-green-500';
  if (state === 'used') return 'text-slate-400';
  if (state === 'blocked') return 'text-amber-500';
  return '';
}

/** 徽章配色（DEMO：冻结蓝 / 锁链棕 / 失调灰） */
function badgeClass(kind: 'taunt' | 'frozen' | 'sick' | 'subm'): string {
  if (kind === 'taunt') return 'bg-orange-900 text-orange-200';
  if (kind === 'frozen') return 'bg-blue-800 text-blue-100';
  if (kind === 'sick') return 'bg-zinc-700 text-zinc-300';
  return 'bg-slate-700 text-slate-300';
}

/** 槽位框（DEMO：虚线边 / 可部署蓝 / 可攻击可点 / 目标红） */
function slotClass(tone: SlotView['tone']): string {
  if (tone === 'can') return 'border border-dashed border-blue-500 bg-[#132039] cursor-pointer';
  if (tone === 'tgt') return 'border border-solid border-red-500 bg-[#2a1418] cursor-pointer';
  if (tone === 'act') return 'border border-dashed border-[#2f3b58] bg-[#101728] cursor-pointer';
  return 'border border-dashed border-[#2f3b58] bg-[#101728]';
}

// ---------------- 单位卡 ----------------

function UnitCardBase({ u, selected }: { u: UnitView | null; selected: boolean }) {
  if (!u) return null;
  return (
    <div
      title={u.tooltip}
      className={`relative flex h-full w-full min-w-0 flex-col overflow-hidden rounded-lg border border-[#3a4767] bg-[#1b2438] px-1.5 py-1 ${
        selected ? 'border-amber-400 ring-2 ring-amber-400/25' : ''
      } ${unitStateClass(u.attackState)}`}
    >
      {/* 徽章（右上角） */}
      <div className="absolute right-1 top-[3px] flex gap-[3px]">
        {u.badges.map((b) => (
          <i
            key={b.kind}
            className={`rounded px-1 py-px text-[9px] not-italic leading-[1.4] ${badgeClass(b.kind)}`}
          >
            {b.text}
          </i>
        ))}
      </div>
      <div className="overflow-hidden text-ellipsis whitespace-nowrap text-[11px] font-bold leading-tight">
        {u.name}
      </div>
      <div className="mt-1 flex flex-wrap items-baseline gap-x-[9px] gap-y-0.5 text-[13px] md:text-base">
        <span className="whitespace-nowrap text-[#fca5a5]">
          <i className="mr-px text-[10px] not-italic opacity-80 md:text-[13px]">攻</i>
          <b className={`font-extrabold leading-none ${u.attackState === 'ready' ? '' : 'text-slate-500'}`}>
            {u.atk}
          </b>
        </span>
        <span className="whitespace-nowrap text-[#7dd3fc]">
          <i className="mr-px text-[10px] not-italic opacity-80 md:text-[13px]">盾</i>
          <b className="font-extrabold leading-none">{u.shield}</b>
          <u className="text-[10px] text-slate-500 no-underline md:text-[11px]">/{u.maxShield}</u>
        </span>
        <span className="whitespace-nowrap text-[#fcd34d]">
          <i className="mr-px text-[10px] not-italic opacity-80 md:text-[13px]">体</i>
          <b className="font-extrabold leading-none">{u.structure}</b>
          <u className="text-[10px] text-slate-500 no-underline md:text-[11px]">/{u.maxStructure}</u>
        </span>
      </div>
      <div className="mt-[3px] text-[9.5px] leading-[1.3] text-amber-400">{u.keywords}</div>
      {u.attackStateLabel ? (
        <div className={`mt-[3px] text-[9.5px] font-extrabold tracking-wide md:text-[11px] ${attackTextClass(u.attackState)}`}>
          {u.attackStateLabel}
        </div>
      ) : null}
      <UnitArt src={u.artSrc} />
    </div>
  );
}

const UnitCard = memo(UnitCardBase);

// ---------------- 一侧战场 ----------------

interface BoardSideProps {
  side: 'player' | 'boss';
  slots: SlotView[];
  selUnit: string | null;
  onPlayerSlot: (i: number) => void;
  onBossTarget: (uid: string) => void;
}

function BoardSideBase({ side, slots, selUnit, onPlayerSlot, onBossTarget }: BoardSideProps) {
  return (
    <div className="grid min-h-[156px] grid-cols-6 gap-1.5">
      {slots.map((s) => (
        <div
          key={s.i}
          onClick={() => {
            if (!s.clickable) return;
            if (side === 'player') onPlayerSlot(s.i);
            else if (s.unit) onBossTarget(s.unit.uid);
          }}
          className={`flex min-h-[156px] min-w-0 items-center justify-center rounded-lg ${slotClass(s.tone)}`}
        >
          {s.unit ? (
            <UnitCard u={s.unit} selected={!!selUnit && selUnit === s.unit.uid} />
          ) : (
            <span className="text-[11px] text-[#3b4763]">空位</span>
          )}
        </div>
      ))}
    </div>
  );
}

export default memo(BoardSideBase);
