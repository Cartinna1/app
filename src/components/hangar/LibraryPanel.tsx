import { memo, useCallback, useMemo, useState } from 'react';
import type { LibraryRow } from '@/lib/battle/hangar';
import { defaultSeriesFilter, filterBySeries, pickSeriesFilter, resolveSeriesFilter, seriesGroups } from '@/lib/battle/seriesFilter';
import ShipCard, { SHIP_CARD_GRID_ITEM } from '@/components/ship/ShipCard';
import SeriesChipRow from './SeriesChipRow';

// ============================================================================
// 机库 · 卡库标签
//   · 卡面网格（遍历完整数组，**不 slice / 不 filter 静默截断**，AGENTS 第九节）；
//   · **系列筛选 chip（用户 2026-08 口径：「卡库也按照船坞那样做每个系列的可点标签，颜色样式一样即可」）**：
//     与船坞**共用同一个组件** `SeriesChipRow`（颜色/尺寸/横滑只有一份实现）与同一份判定
//     `lib/battle/seriesFilter` —— 差别只在**传进去的行**：船坞传「**已解锁**的卡」，
//     这里传「**已拥有**的卡」（`rows` = `hangar.libraryRows`）。
//     默认 = 第一个"有卡的"系列（永远恰好选中一个，点已选中的那颗什么都不发生）。
//   · 卡库为空时给出"去船坞造船"的指引（这正是总览标签那句引导的落地页）——那时 chip 行不渲染。
//
// ⚠ 本面板**只负责渲染卡面与点选**：
//   · 「技能详情固定区域」不在这里 —— 它是卡库 / 船坞 / 编队共用的一块，由 HangarTab 在标签栏
//     下方统一渲染（点哪边的卡都写进那一块）—— V1.5 §10.2 铁律①「技能不上卡面、手机端必须
//     有一个地方读全文」；本面板只负责高亮当前选中的那张卡。
//   · 「编入当前舰队」与四个概览数字也不在这里 —— 编入动作是**跨标签**的（在卡库选了卡、
//     切到编队也要能编），故与数字一起上移到 HangarTab 的页签级区域（总览标签 / 操作条）。
//   · ⚠ 顶部「卡库 共 N 型」那行说的是**卡库总数**，不受系列筛选影响（与船坞顶部那行同口径）。
// ============================================================================

interface LibraryPanelProps {
  rows: LibraryRow[];
  /** 当前点选的卡（null = 未选；只用于卡面高亮，详情区与操作条由 HangarTab 渲染） */
  selectedId: string | null;
  /** 点选一张卡（调用方用 useCallback 保持引用稳定） */
  onSelect: (cardId: string) => void;
}

function LibraryPanelBase({ rows, selectedId, onSelect }: LibraryPanelProps) {
  /** 系列档位与计数（**已拥有**的卡按系列分组；顺序 = 卡牌数据出现顺序，不硬编码系列清单）。
   *  `rows` 变了才重算（卡片入队完工进卡库时会变），引用稳定 → 底下 memo 的 chip 行不会白重渲染。 */
  const groups = useMemo(() => seriesGroups(rows), [rows]);
  /** 选中的系列：**默认 = 第一个"有卡的"系列**（永远恰好选中一个；卡库为空时是空串，chip 行不渲染） */
  const [seriesFilter, setSeriesFilter] = useState<string>(() => defaultSeriesFilter(groups));

  /** 点某颗 chip（**useCallback 保持稳定引用**，不往 memo 子组件传 inline 箭头 —— AGENTS 第五节）。
   *  ⚠ **点已选中的那一颗什么都不发生**（`pickSeriesFilter` 原样返回），没有"取消筛选"。 */
  const pickSeries = useCallback((series: string) => {
    setSeriesFilter((prev) => pickSeriesFilter(prev, series));
  }, []);

  /** 当前筛选在现有档位里还有效吗（卡库变化后该系列可能没有卡了）→ 落到**第一个有卡的系列**
   *  （不是"不筛选"）。判定与兜底都在 lib/battle/seriesFilter，配合 filterBySeries 的
   *  "无匹配 → 完整数组"防线，任何路径都不会给出空列表。 */
  const activeSeries = resolveSeriesFilter(seriesFilter, groups);
  const visibleRows = filterBySeries(rows, activeSeries);

  return (
    <div>
      {/* ==================== 卡面网格（全部渲染，不截断；筛选只缩显示，不丢数据） ==================== */}
      <div className="mb-1.5 flex items-baseline gap-2">
        <h3 className="text-[13px] font-bold text-slate-200">卡库</h3>
        <span className="text-[11px] text-slate-500">共 {rows.length} 型</span>
      </div>
      {/* 系列标签（chip）：**与船坞同一个组件**（颜色/尺寸/横滑一份实现），只是行来自"已拥有"的卡 */}
      <SeriesChipRow groups={groups} active={activeSeries} onPick={pickSeries} />
      {rows.length === 0 ? (
        <p className="rounded-lg border border-dashed border-[#33405f] px-3 py-4 text-xs leading-relaxed text-amber-400">
          卡库是空的 —— 切到「船坞」标签下单造舰，完工的当回合会自动进入卡库，
          然后就能在这里编入舰队了。
        </p>
      ) : (
        /* 排版（用户 2026-08 口径）：**手机 1 列、sm 起 2 列**，不再有 3 列。
           · 列宽常量 = `SHIP_CARD_GRID_ITEM`（与**战斗部署池读同一串**，上限就是 2）；
           · 3 列已删：3 列时卡片 ≈325px、2.02:1 的素材被横裁 30% —— 那正是"图片被压缩"的来源。
           卡面本身（图在上、占满卡宽、2:1）见 `components/ship/ShipCard`（卡库/船坞/战斗池共用那一个）。 */
        <div className="mt-1.5 flex flex-wrap gap-1.5">
          {visibleRows.map((r) => (
            <div key={r.id} className={SHIP_CARD_GRID_ITEM}>
              <ShipCard
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
