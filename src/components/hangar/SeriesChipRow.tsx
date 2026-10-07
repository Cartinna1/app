import { memo } from 'react';
import type { SeriesGroup } from '@/lib/battle/seriesFilter';
import { seriesChipClass } from '@/lib/battle/seriesFilter';

// ============================================================================
// 机库 · 系列筛选 chip 行（**船坞与卡库共用的同一份**）
//
// 用户 2026-08 口径：「卡库也按照船坞那样做每个系列的可点标签，颜色样式一样即可」
//   → chip 的样式 / 尺寸 / 横滑 / 颜色**只有这一份实现**，两个标签都渲染这个组件：
//     · 船坞：`groups = shipyardView(state).seriesFilters`（来自「**已解锁**的卡」）
//     · 卡库：`groups = seriesGroups(libraryRows(state))`（来自「**已拥有**的卡」）
//   判定与计数在 `lib/battle/seriesFilter`（唯一真值），本组件只渲染。
//
// ⚠ 颜色值全部来自 `seriesChipClass`（表 = `SERIES_CHIP_THEME`）—— 本组件不写任何颜色类。
// ⚠ 交互（与船坞一致）：**永远恰好选中一个系列**，默认 = 第一个有卡的系列；
//   点已选中的那一颗**什么都不发生**（没有"取消筛选"）。`onPick` 由调用方用 useCallback 给稳定引用。
// ⚠ 只有一个系列（或一个都没有）时**不渲染** —— 那时没有任何东西可筛，多一排标签只是噪音。
// ⚠ 手机端**不换行**：容器 `flex`（默认 nowrap）+ `overflow-x-auto` 横滑，chip 自身
//   `flex-none whitespace-nowrap`；与机库内部标签栏 / 底部页签同款做法。⚠ `scrollbar-hide`
//   在本项目**没有定义**（全库 grep 无定义），故照底部页签用显式的细滚动条类（可见、可发现）。
// ============================================================================

export interface SeriesChipRowProps {
  /** 档位与计数（`seriesGroups(rows)`；每颗 chip 上的张数就是 `count`） */
  groups: readonly SeriesGroup[];
  /** 当前选中的系列（调用方用 `resolveSeriesFilter` 算出来，永远恰好一个） */
  active: string;
  /** 点某颗 chip（调用方用 useCallback 保持引用稳定） */
  onPick: (series: string) => void;
}

function SeriesChipRowBase({ groups, active, onPick }: SeriesChipRowProps) {
  if (groups.length <= 1) return null;
  return (
    <div className="mt-1.5 flex items-center gap-2 overflow-x-auto pb-1 [scrollbar-width:thin] [&::-webkit-scrollbar]:h-1.5 [&::-webkit-scrollbar-track]:bg-slate-800/40 [&::-webkit-scrollbar-thumb]:rounded-full [&::-webkit-scrollbar-thumb]:bg-slate-600">
      {groups.map((g) => (
        <button
          key={g.series}
          type="button"
          onClick={() => onPick(g.series)}
          className={`flex-none whitespace-nowrap rounded-full border px-3 py-1 text-[12.5px] font-bold transition-colors ${seriesChipClass(
            g.series,
            active === g.series,
          )}`}
        >
          {g.series} {g.count}
        </button>
      ))}
    </div>
  );
}

export default memo(SeriesChipRowBase);
