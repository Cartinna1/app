import { memo } from 'react';
import type { CardView } from '@/lib/battle/view';
import ShipCard, { SHIP_CARD_GRID_ITEM } from '@/components/ship/ShipCard';

// ============================================================================
// 舰队池（DEMO 的 .pool + .card）。
// ⚠ **卡面 = 与机库卡库/船坞共用的同一个组件**（`components/ship/ShipCard`，用户 2026-08 口径：
//   「战斗也一样嘛」）：图位比例、网格列数、字号/内边距、徽章全在那一份里，这里只做"下发数据"。
//   本文件不再自己写卡面样式（曾经与机库各写一套）。
//
// ⚠ **「能不能读」与「能不能出」是两个概念**（2026-08 用户报"灰卡的技能在手机上无处可看"）：
//   · `selectable`（能不能读）= 手牌每一张都能点开看技能全文 → 决定 cursor / 是否变暗；
//   · `playable`（能不能出）= 指挥度/空位够不够 → **只影响视觉**（变暗），点击照样进处理器，
//     出不去的时候由 BattleScreen 在**部署那一步**给出中文原因（`manualActionView` 闸门在那边）。
//   注意 `title` 是桌面专属的悬浮提示（手机没有 hover），**它不是技能出口**，信息条才是（铁律①）。
// ============================================================================

interface FleetPoolProps {
  cards: CardView[];
  selCard: string | null;
  onPoolClick: (cardId: string) => void;
}

function FleetPoolBase({ cards, selCard, onPoolClick }: FleetPoolProps) {
  if (cards.length === 0) {
    return (
      <div className="px-0.5 py-1 text-[11px] leading-relaxed text-slate-500">
        部署池已空 —— 你的舰船全部打完或已被击毁（打光不给保底）
      </div>
    );
  }
  return (
    /* 加高滚动窗（原 290px）：卡面按新排版高 ≈2.5 倍，290px 只装得下 1 张卡，池子会没法用。
       520px = 手机 2 张卡（246×2）或宽屏 2 列 2 行（≈250×2），仍是内部滚动、不吃战斗板高度。 */
    <div className="flex max-h-[520px] flex-wrap gap-1.5 overflow-auto p-0.5">
      {cards.map((c) => (
        <div key={c.id} className={SHIP_CARD_GRID_ITEM}>
          <ShipCard
            id={c.id}
            name={c.name}
            series={c.series}
            rarity={c.rarity}
            cost={c.cost}
            costSuffix={c.count > 1 ? `×${c.count}` : ''}
            atk={c.atk}
            shield={c.shield}
            structure={c.structure}
            artSrc={c.artSrc}
            selected={selCard === c.id}
            selectable={c.selectable}
            playable={c.playable}
            title={`${c.name}（${c.series} · ${c.rarity}）\n${c.text}`}
            onSelect={onPoolClick}
          />
        </div>
      ))}
    </div>
  );
}

export default memo(FleetPoolBase);
