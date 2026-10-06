import { memo } from 'react';
import type { LibraryRow } from '@/lib/battle/hangar';
import HangarCard from './HangarCard';

// ============================================================================
// 机库 · 卡库标签
//   · 卡面网格（遍历完整数组，**不 slice / 不 filter 静默截断**，AGENTS 第九节）；
//   · 卡库为空时给出"去船坞造船"的指引（这正是总览标签那句引导的落地页）。
//
// ⚠ 本面板**只负责渲染卡面与点选**：
//   · 「技能详情固定区域」不在这里 —— 它是卡库 / 船坞 / 编队共用的一块，由 HangarTab 在标签栏
//     下方统一渲染（点哪边的卡都写进那一块）—— V1.5 §10.2 铁律①「技能不上卡面、手机端必须
//     有一个地方读全文」；本面板只负责高亮当前选中的那张卡。
//   · 「编入当前舰队」与四个概览数字也不在这里 —— 编入动作是**跨标签**的（在卡库选了卡、
//     切到编队也要能编），故与数字一起上移到 HangarTab 的页签级区域（总览标签 / 操作条）。
// ============================================================================

interface LibraryPanelProps {
  rows: LibraryRow[];
  /** 当前点选的卡（null = 未选；只用于卡面高亮，详情区与操作条由 HangarTab 渲染） */
  selectedId: string | null;
  /** 点选一张卡（调用方用 useCallback 保持引用稳定） */
  onSelect: (cardId: string) => void;
}

function LibraryPanelBase({ rows, selectedId, onSelect }: LibraryPanelProps) {
  return (
    <div>
      {/* ==================== 卡面网格（全部渲染，不截断） ==================== */}
      <div className="mb-1.5 flex items-baseline gap-2">
        <h3 className="text-[13px] font-bold text-slate-200">卡库</h3>
        <span className="text-[11px] text-slate-500">共 {rows.length} 型</span>
      </div>
      {rows.length === 0 ? (
        <p className="rounded-lg border border-dashed border-[#33405f] px-3 py-4 text-xs leading-relaxed text-amber-400">
          卡库是空的 —— 切到「船坞」标签下单造舰，完工的当回合会自动进入卡库，
          然后就能在这里编入舰队了。
        </p>
      ) : (
        <div className="flex flex-wrap gap-1.5">
          {rows.map((r) => (
            <div key={r.id} className="w-full sm:w-[calc(50%-3px)] xl:w-[calc(33.333%-4px)]">
              <HangarCard
                id={r.id}
                name={r.name}
                series={r.series}
                rarity={r.rarity}
                cost={r.cost}
                atk={r.atk}
                shield={r.shield}
                structure={r.structure}
                artSrc={r.artSrc}
                selected={selectedId === r.id}
                chips={[
                  { label: '持有', value: r.owned, tone: 'owned' },
                  { label: '已编', value: r.assigned, tone: 'assigned' },
                  { label: '可编', value: r.available, tone: 'available' },
                ]}
                onSelect={onSelect}
              />
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

export default memo(LibraryPanelBase);
