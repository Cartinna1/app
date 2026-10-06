import { memo } from 'react';
import { CardArt } from '@/components/battle/parts';

// ============================================================================
// 机库 · 卡面（机库内复用的一处卡面）
//   卡面**只放**：名字 / 系列·稀有度 / 攻·盾·体 / 费用徽章 / 数量徽章。
//   ⚠ 技能文字**不上卡面**（V1.5 §10.2 铁律①）：机库顶部的「技能详情」固定区域才是看技能的出口
//     —— 手机端没有 hover，卡面塞技能等于谁都读不到。
//   图位复用 components/battle/parts.tsx 的 CardArt（列表位，artSrc 必须已经走缩略图）。
// ============================================================================

/** 稀有度 → 左边条颜色（与战斗卡面 FleetPool 同一套语言） */
function rarityClass(rarity: string): string {
  if (rarity === '蓝') return 'border-l-[3px] border-l-sky-400';
  if (rarity === '紫') return 'border-l-[3px] border-l-violet-400';
  if (rarity === '橙') return 'border-l-[3px] border-l-amber-400';
  if (rarity === '衍') return 'border-l-[3px] border-l-slate-500';
  return 'border-l-[3px] border-l-slate-300';
}

/** 数量徽章（左上角）的一段：标签 + 数值 + 配色 */
export interface CardCountChip {
  label: string;
  value: number;
  tone: 'owned' | 'assigned' | 'available';
}

function chipClass(tone: CardCountChip['tone']): string {
  if (tone === 'owned') return 'border-[#3a4767] text-slate-300';
  if (tone === 'assigned') return 'border-cyan-700/60 text-cyan-300';
  return 'border-emerald-700/60 text-emerald-300';
}

interface HangarCardProps {
  /** 本卡对应的卡型 id（数组遍历时由 map 的第二个参数传入，避免在 map 里写 inline 箭头） */
  id: string;
  name: string;
  series: string;
  rarity: string;
  cost: number;
  atk: number;
  shield: number;
  structure: number;
  /** 卡面图位（调用方保证已走缩略图） */
  artSrc: string;
  /** 选中的卡加重描边（点选后顶部技能详情显示它） */
  selected: boolean;
  /** 数量徽章（缺省不显示徽章） */
  chips?: CardCountChip[];
  /** 点选一张卡：调用方用 useCallback 保持引用稳定（AGENTS 第五节，不许 inline 箭头击穿 memo） */
  onSelect: (cardId: string) => void;
}

function HangarCardBase({
  id,
  name,
  series,
  rarity,
  cost,
  atk,
  shield,
  structure,
  artSrc,
  selected,
  chips,
  onSelect,
}: HangarCardProps) {
  const list = chips || [];
  return (
    <button
      type="button"
      onClick={() => onSelect(id)}
      className={`relative flex h-24 w-full overflow-hidden rounded-lg border border-[#3a4767] bg-[#1b2438] text-left hover:bg-[#243052] ${rarityClass(
        rarity
      )} ${selected ? 'border-amber-400 ring-2 ring-amber-400/30' : ''}`}
    >
      {/* 数量徽章（左上角，可多段：持有 / 已编 / 可编） */}
      {list.length > 0 ? (
        <div className="absolute left-[5px] top-1 z-[2] flex flex-wrap gap-1">
          {list.map((c) => (
            <span
              key={c.label}
              className={`rounded-md border bg-[#0b1020]/85 px-1 text-[10px] font-semibold leading-[1.5] ${chipClass(
                c.tone
              )}`}
            >
              {c.label} {c.value}
            </span>
          ))}
        </div>
      ) : null}

      {/* 费用徽章（右上角，与战斗卡面同一位置与样式） */}
      <div className="absolute right-[5px] top-1 z-[2] rounded-md border border-[#3a4767] bg-[#0b1020]/85 px-1 text-sm font-extrabold leading-[1.3] text-slate-200">
        {cost}
        <em className="text-[10px] font-semibold not-italic text-slate-400">费</em>
      </div>

      <div className="flex min-w-0 flex-1 flex-col justify-center px-2 py-1.5">
        <div className="overflow-hidden text-ellipsis whitespace-nowrap text-[12.5px] font-bold">{name}</div>
        <div className="mt-0.5 text-[10px] text-slate-500">
          {series} · {rarity}
        </div>
        <div className="mt-1.5 flex items-baseline gap-3.5">
          <span className="text-[#fca5a5]">
            <i className="mr-px text-[11px] not-italic opacity-80">攻</i>
            <b className="text-xl font-extrabold leading-none tracking-tight">{atk}</b>
          </span>
          <span className="text-[#7dd3fc]">
            <i className="mr-px text-[11px] not-italic opacity-80">盾</i>
            <b className="text-xl font-extrabold leading-none tracking-tight">{shield}</b>
          </span>
          <span className="text-[#fcd34d]">
            <i className="mr-px text-[11px] not-italic opacity-80">体</i>
            <b className="text-xl font-extrabold leading-none tracking-tight">{structure}</b>
          </span>
        </div>
      </div>

      <CardArt src={artSrc} />
    </button>
  );
}

export default memo(HangarCardBase);
