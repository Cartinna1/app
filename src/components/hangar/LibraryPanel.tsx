import { memo } from 'react';
import type { HangarSummary, LibraryRow } from '@/lib/battle/hangar';
import HangarCard from './HangarCard';

// ============================================================================
// 机库 · 卡库面板
//   · 顶部：机库总览（hangarSummary）
//   · 下部：卡面网格（遍历完整数组，**不 slice / 不 filter 静默截断**，AGENTS 第九节）
//   ⚠「技能详情固定区域」**不在这里**：它是卡库与船坞共用的同一块（HangarTab 渲染
//     ShipSkillDetail，点卡库的卡和点船坞的卡都写进那一块）——V1.5 §10.2 铁律①
//     「技能不上卡面、手机端必须有一个地方读全文」。本面板只负责高亮当前选中的那张。
// ============================================================================

interface LibraryPanelProps {
  rows: LibraryRow[];
  summary: HangarSummary;
  /** 当前点选的卡（null = 未选；只用于卡面高亮，详情区由 HangarTab 渲染） */
  selectedId: string | null;
  onSelect: (cardId: string) => void;
  /** 「编入选中舰队」：把该型再编入当前选中的那支队一份 */
  canAssign: boolean;
  /** 编不进去时的原因（来自 canAddShip，直接显示） */
  assignReason: string;
  /** 能编入时给的说明（中性提示，不是错误） */
  assignHint: string;
  onAssign: (cardId: string) => void;
}

function LibraryPanelBase({
  rows,
  summary,
  selectedId,
  onSelect,
  canAssign,
  assignReason,
  assignHint,
  onAssign,
}: LibraryPanelProps) {
  const statBase = 'rounded-lg border border-[#2b3550] bg-[#0f1729] px-2 py-1.5';
  // 只把"点选的那张卡再编入当前舰队一份"转发出去（onAssign 是 HangarTab 的稳定引用）
  const assignSelected = () => {
    if (selectedId) onAssign(selectedId);
  };

  return (
    <div>
      {/* ==================== 机库总览 ==================== */}
      <div className="mb-2.5 grid grid-cols-2 gap-2 sm:grid-cols-4">
        <div className={statBase}>
          <p className="text-[10px] text-slate-500">卡库类型</p>
          <p className="text-[15px] font-bold text-slate-100">{summary.cardTypes}</p>
        </div>
        <div className={statBase}>
          <p className="text-[10px] text-slate-500">卡库总数</p>
          <p className="text-[15px] font-bold text-slate-100">{summary.totalShips} 艘</p>
        </div>
        <div className={statBase}>
          <p className="text-[10px] text-slate-500">舰队数</p>
          <p className="text-[15px] font-bold text-slate-100">{summary.fleetCount}</p>
        </div>
        <div className={statBase}>
          <p className="text-[10px] text-slate-500">已编入</p>
          <p className="text-[15px] font-bold text-cyan-300">
            {summary.assignedShips}
            <span className="text-[11px] font-normal text-slate-500"> 艘</span>
          </p>
        </div>
      </div>

      {/* ==================== 编入按钮（动作与原因；技能全文在上面那块共用详情区） ==================== */}
      <div className="mb-2.5 flex flex-wrap items-center gap-2 rounded-[10px] border border-[#2b3550] bg-[#0f1729] px-2.5 py-2">
        <button
          type="button"
          onClick={assignSelected}
          disabled={!canAssign}
          className="rounded-[7px] border border-blue-500 bg-blue-700 px-2.5 py-1 text-[12px] font-bold text-white hover:enabled:bg-blue-600 disabled:cursor-not-allowed disabled:opacity-40"
        >
          编入当前舰队
        </button>
        {/* 原因写在行内（不只 title/置灰）——手机端没有 hover，AGENTS 第十节机库铁律② */}
        <span className={`text-[11px] leading-relaxed ${canAssign ? 'text-slate-500' : 'text-amber-400'}`}>
          {canAssign ? assignHint : assignReason}
        </span>
      </div>

      {/* ==================== 卡面网格（全部渲染，不截断） ==================== */}
      <div className="mb-1.5 flex items-baseline gap-2">
        <h3 className="text-[13px] font-bold text-slate-200">卡库</h3>
        <span className="text-[11px] text-slate-500">共 {rows.length} 型（按 系列 → 费用 排序）</span>
      </div>
      {rows.length === 0 ? (
        <p className="rounded-lg border border-dashed border-[#33405f] px-3 py-4 text-xs leading-relaxed text-amber-400">
          卡库是空的 —— 卡库里的战舰**只能靠船坞建造**（V1.5 §8）：先去下面的船坞面板造几艘，
          完工的当回合会自动进入卡库，然后就能在这里编入舰队了。
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
