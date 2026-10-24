import { memo, useCallback, useMemo, useState } from 'react';
import type { FleetEditorRow, FleetRow } from '@/lib/battle/hangar';
import { defaultSeriesFilter, filterBySeries, pickSeriesFilter, resolveSeriesFilter, seriesGroups } from '@/lib/battle/seriesFilter';
import SeriesChipRow from './SeriesChipRow';

// ============================================================================
// 机库 · 编成界面（选中某队后逐型加减）
//   每行：`− 本队已编 Y / 卡库 Z +`
//   ⚠ 动作不可用时**写明原因**（原因全部来自 lib/battle/hangar 的 canAddShip / canRemoveShip）；
//     出征中的舰队整块禁用，并在标题下写明同一条原因。
//
//   ⚠ 系列 chip（用户 2026-08：「编成舰队的时候没有分类，建议也按圣辉/财团/灵能/铁血进行可点的
//     标签分类，费用从低到高」）：
//     · **与卡库 / 船坞同一个组件**（`SeriesChipRow`）与**同一份判定**（`lib/battle/seriesFilter`）——
//       本组件只持有"选了哪个系列"这一份选择态，档位/默认值/兜底/筛选全部调 lib，不另写一份；
//     · 档位来自**这份编成列表里出现的卡**（`rows` = `hangar.fleetEditorRows` = 卡库持有的型，
//       即"**已拥有**"口径，与卡库标签一致）→ **不硬编码系列清单**：
//       雇佣兵协会打头目掉落的 4 个敌方系列（虫群 / 智械 / 灵潮 / 旧律）以及通用系，
//       只要卡库里有就会自动出现对应 chip（用户点名的边界）；
//     · 每系列内**费用从低到高**：`fleetEditorRows` 已经按「系列 → 费用 → id」排好，
//       `filterBySeries` 只过滤不重排 ⇒ 这里**不自己另排**（AGENTS：同一顺序只许一个来源）。
// ============================================================================

interface FleetEditorProps {
  fleet: FleetRow;
  rows: FleetEditorRow[];
  onAdd: (cardId: string) => void;
  onRemove: (cardId: string) => void;
}

function FleetEditorBase({ fleet, rows, onAdd, onRemove }: FleetEditorProps) {
  /** 系列档位与计数（**这份编成列表里出现的卡**按系列分组；顺序 = 行出现的顺序，不硬编码系列清单） */
  const groups = useMemo(() => seriesGroups(rows), [rows]);
  /** 选中的系列：**默认 = 第一个"有卡的"系列**（永远恰好选中一个；没有卡时是空串，chip 行不渲染） */
  const [seriesFilter, setSeriesFilter] = useState<string>(() => defaultSeriesFilter(groups));

  /** 点某颗 chip（**useCallback 保持稳定引用**，不往 memo 子组件传 inline 箭头）；
   *  点已选中的那一颗什么都不发生（`pickSeriesFilter` 原样返回），没有"取消筛选"这条路。 */
  const pickSeries = useCallback((series: string) => {
    setSeriesFilter((prev) => pickSeriesFilter(prev, series));
  }, []);

  /** 兜底 = 落到第一个有卡的系列（不是"不筛选"）；`filterBySeries` 在无匹配时返回完整数组
   *  ⇒ 任何路径都不会给出空列表。 */
  const activeSeries = resolveSeriesFilter(seriesFilter, groups);
  const visibleRows = filterBySeries(rows, activeSeries);

  return (
    <div className="rounded-[10px] border border-[#2b3550] bg-[#141b2e] px-2.5 py-2.5">
      <div className="flex flex-wrap items-baseline gap-2">
        <h3 className="text-[13px] font-bold text-slate-200">
          编成 · {fleet.name}
        </h3>
        <span className="text-[11px] text-slate-500">
          {fleet.total} / {fleet.capacity} 艘
          {fleet.defending ? ' · 带防守标签（不能出征）' : ''}
        </span>
      </div>

      {!fleet.canEdit ? (
        <p className="mt-2 rounded-lg border border-cyan-800/60 bg-cyan-900/20 px-2 py-2 text-[11.5px] leading-relaxed text-cyan-200">
          这支队正在出征途中 —— 抵达开战前不能编成（也不能改名、打防守标签、删除）。
          要去战斗页签取消这次出征，或者等它抵达自动开战。
        </p>
      ) : rows.length === 0 ? (
        <p className="mt-2 text-[11.5px] leading-relaxed text-amber-400">
          卡库是空的，没有可编入的战舰 —— 去下面的船坞面板下单，建好的舰当回合自动进卡库，再回来编队。
        </p>
      ) : (
        <>
          {/* 系列标签（chip）：与卡库/船坞**同一个组件**，行来自"卡库持有的型"（含雇佣兵掉落的敌方系列） */}
          <SeriesChipRow groups={groups} active={activeSeries} onPick={pickSeries} />
          <div className="mt-2 space-y-1.5">
            {visibleRows.map((r) => (
              <div key={r.id} className="rounded-lg border border-[#2b3550] bg-[#161f36] px-2 py-1.5">
                <div className="flex items-center gap-2">
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-[12.5px] font-bold text-slate-100">
                      {r.name}
                      <span className="ml-1 text-[10.5px] font-normal text-slate-500">
                        {r.series} · {r.rarity} · {r.cost} 费
                      </span>
                    </span>
                    <span className="mt-0.5 block text-[10.5px] text-slate-500">
                      本队已编 {r.inFleet} / 卡库 {r.owned}
                      {r.canStillAdd > 0 ? ` · 还能再编 ${r.canStillAdd} 份` : ' · 卡库已全部编入'}
                    </span>
                  </span>

                  <div className="flex flex-none items-center gap-1">
                    <button
                      type="button"
                      onClick={() => onRemove(r.id)}
                      disabled={!r.canRemove}
                      title={r.removeReason}
                      className="h-7 w-7 rounded-[7px] border border-[#39507d] bg-[#22304d] text-[15px] font-bold leading-none text-slate-200 hover:enabled:bg-[#2c3d61] disabled:cursor-not-allowed disabled:opacity-40"
                    >
                      −
                    </button>
                    <span className="min-w-[52px] text-center text-[12.5px] font-bold text-slate-100">
                      {r.inFleet}
                      <span className="text-[10.5px] font-normal text-slate-500"> / {r.owned}</span>
                    </span>
                    <button
                      type="button"
                      onClick={() => onAdd(r.id)}
                      disabled={!r.canAdd}
                      title={r.addReason}
                      className="h-7 w-7 rounded-[7px] border border-[#39507d] bg-[#22304d] text-[15px] font-bold leading-none text-slate-200 hover:enabled:bg-[#2c3d61] disabled:cursor-not-allowed disabled:opacity-40"
                    >
                      +
                    </button>
                  </div>
                </div>

                {/* 不可用原因（不是只置灰）——手机端没有 hover，所以写在行内而不只是 title */}
                {!r.canAdd || !r.canRemove ? (
                  <p className="mt-1 text-[10.5px] leading-tight text-amber-400">
                    {!r.canAdd ? r.addReason : r.removeReason}
                  </p>
                ) : null}
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  );
}

export default memo(FleetEditorBase);
