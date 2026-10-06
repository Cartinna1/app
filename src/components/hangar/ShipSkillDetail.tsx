import { memo } from 'react';

// ============================================================================
// 机库 · 技能详情固定区域（**手机端看技能的唯一出口**，V1.5 §10.2 铁律①）
//   为什么必须是一块固定区域：卡面只放 名字 / 系列·稀有度 / 攻盾体 / 费用，
//   **技能不上卡面**；手机端没有 hover，点选一张卡后必须有一个稳定的地方读技能全文。
//
// 唯一真值纪律：这块区域**只有一份实现**，卡库面板与船坞面板共用它
//   （点卡库的卡、点船坞的卡，都在同一块区域里读全文——不许各写一份）。
//   调用方（HangarTab）负责持有"当前点选的是哪张卡"。
// ============================================================================

export interface ShipSkillDetailProps {
  /** 当前点选的卡（null = 未选，只显示当前状态） */
  card: {
    name: string;
    series: string;
    rarity: string;
    cost: number;
    atk: number;
    shield: number;
    structure: number;
    text: string;
  } | null;
  /** 持有份数（卡库里没有这一型时传 0） */
  owned: number;
  /** 已编入各舰队的份数 */
  assigned: number;
  /** 还能编入的份数（= owned − assigned，负数已收底） */
  available: number;
}

function ShipSkillDetailBase({ card, owned, assigned, available }: ShipSkillDetailProps) {
  if (!card) {
    return <p className="text-[12.5px] leading-relaxed text-slate-500">未选择战舰</p>;
  }
  return (
    <div className="text-[12.5px] leading-[1.55]">
      <div className="flex flex-wrap items-baseline gap-x-2">
        <b className="text-slate-100">{card.name}</b>
        <span className="text-[11px] text-slate-500">
          （{card.series} · {card.rarity}） {card.cost} 费
        </span>
        <span className="text-[11px] text-slate-300">
          攻 {card.atk} · 盾 {card.shield} · 体 {card.structure}
        </span>
      </div>
      <p className="mt-1 text-slate-200">{card.text}</p>
      <p className="mt-1 text-[11px] text-slate-500">
        持有 {owned} 份 · 已编 {assigned} 份 · 可编 {available} 份
        {available === 0 ? '（这一型已经全编完了，想再编得先去船坞造新舰，或从别的队卸下）' : ''}
      </p>
    </div>
  );
}

export default memo(ShipSkillDetailBase);
