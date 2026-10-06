import { memo } from 'react';
import type { CardView } from '@/lib/battle/view';
import { getThumbPath } from '@/lib/assetThumb';
import { CardArt } from './parts';

// ============================================================================
// 舰队池（DEMO 的 .pool + .card）。
// 卡面只放「名字 / 系列·稀有度 / 攻·盾·体」+ 费用徽章 —— 技能文字在信息条里看（不上卡面）。
// ⚠ 这是列表位：图片必须走缩略图（lib/assetThumb.getThumbPath，AGENTS 第五节）。
// ============================================================================

/** 稀有度 → 左边条颜色（DEMO 的 .rare-白/蓝/紫/橙/衍） */
function rarityClass(rarity: string): string {
  if (rarity === '蓝') return 'border-l-[3px] border-l-sky-400';
  if (rarity === '紫') return 'border-l-[3px] border-l-violet-400';
  if (rarity === '橙') return 'border-l-[3px] border-l-amber-400';
  if (rarity === '衍') return 'border-l-[3px] border-l-slate-500';
  return 'border-l-[3px] border-l-slate-300';
}

interface FleetPoolProps {
  cards: CardView[];
  selCard: string | null;
  onPoolClick: (cardId: string) => void;
}

function FleetPoolBase({ cards, selCard, onPoolClick }: FleetPoolProps) {
  if (cards.length === 0) {
    return (
      <div className="px-0.5 py-1 text-[11px] leading-relaxed text-slate-500">
        部署池已空 —— 你的舰船全部打完或已被击毁（按 V1.5，打光不给保底）
      </div>
    );
  }
  return (
    <div className="flex max-h-[290px] flex-wrap gap-1.5 overflow-auto p-0.5">
      {cards.map((c) => (
        <div
          key={c.id}
          title={`${c.name}（${c.series} · ${c.rarity}）\n${c.text}`}
          onClick={() => onPoolClick(c.id)}
          className={`relative flex h-24 w-full cursor-pointer overflow-hidden rounded-lg border border-[#3a4767] bg-[#1b2438] hover:bg-[#243052] sm:w-[calc(50%-3px)] xl:w-[calc(33.333%-4px)] ${
            c.playable ? '' : 'cursor-not-allowed opacity-[0.38]'
          } ${rarityClass(c.rarity)} ${selCard === c.id ? 'border-amber-400 ring-2 ring-amber-400/30' : ''}`}
        >
          {/* 费用徽章（右上角） */}
          <div className="absolute right-[5px] top-1 z-[2] rounded-md border border-[#3a4767] bg-[#0b1020]/85 px-1 text-sm font-extrabold leading-[1.3] text-slate-200">
            {c.cost}
            {c.count > 1 ? <em className="text-[11px] font-semibold not-italic text-slate-400">×{c.count}</em> : null}
          </div>
          <div className="flex min-w-0 flex-1 flex-col justify-center px-2 py-1.5">
            <div className="overflow-hidden text-ellipsis whitespace-nowrap text-[12.5px] font-bold">{c.name}</div>
            <div className="mt-0.5 text-[10px] text-slate-500">
              {c.series} · {c.rarity}
            </div>
            <div className="mt-1.5 flex items-baseline gap-3.5">
              <span className="text-[#fca5a5]">
                <i className="mr-px text-[11px] not-italic opacity-80">攻</i>
                <b className="text-xl font-extrabold leading-none tracking-tight">{c.atk}</b>
              </span>
              <span className="text-[#7dd3fc]">
                <i className="mr-px text-[11px] not-italic opacity-80">盾</i>
                <b className="text-xl font-extrabold leading-none tracking-tight">{c.shield}</b>
              </span>
              <span className="text-[#fcd34d]">
                <i className="mr-px text-[11px] not-italic opacity-80">体</i>
                <b className="text-xl font-extrabold leading-none tracking-tight">{c.structure}</b>
              </span>
            </div>
          </div>
          {/* 列表位走缩略图（/battle/units/x.webp → /battle/thumbs/units/x.webp） */}
          <CardArt src={getThumbPath(c.artSrc)} />
        </div>
      ))}
    </div>
  );
}

export default memo(FleetPoolBase);
