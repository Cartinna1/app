// ============================================================================
// 舰队卡牌战斗 · 系列筛选 + 系列主题色（**唯一真值**，机库的「船坞」与「卡库」两个标签共用）
//   —— 纯函数与常量表，不依赖 React / DOM（与 hangar.ts / shipyard.ts 同性质）。
//
// 用户 2026-08 口径：「卡库也按照船坞那样做每个系列的可点标签，颜色样式一样即可」
//   → 颜色表、chip 类名与筛选判定**只有这一份实现**，两个标签都调它（组件侧共用
//     `components/hangar/SeriesChipRow`；本文件是它的数据与判定源）。
//
// ⚠ 为什么做成"吃一组 rows"的泛型：两个标签的**集合不同** ——
//   · 船坞的 chip 来自「**已解锁**的卡」（`shipyard.shipyardView().unlockedCards`）；
//   · 卡库的 chip 来自「**已拥有**的卡」（`hangar.libraryRows(state)`）。
//   故这里只认"行上有个 `series` 字段"，谁传进来就按谁算，**不把船坞那份硬套到卡库**。
//
// ⚠ 交互口径（两个标签一致）：**永远恰好选中一个系列**，默认 = **第一个"有卡的"系列**；
//   点当前已选中的那一颗**什么都不发生**（没有"取消筛选 / 回到全部"这条路，也没有提示语）；
//   兜底一律**落到第一个有卡的系列**，且任何输入都**不许给出空列表**。
//
// ⚠ Tailwind 只在源码里扫**完整字面量**类名（不做字符串拼接）→ 颜色两态都写成整串字面量，
//   不许 `bg-${color}-800` 这种拼法（那样类名不会被生成）。颜色类名不得散落到 JSX 里。
// ============================================================================

/** 系列 chip 的两态类名 */
export interface SeriesChipTheme {
  /** 未选中 */
  idle: string;
  /** 选中（永远恰好选中一个 —— 选中态就是常态，要一眼看得出） */
  active: string;
}

/** 系列 → chip 两态类名。
 *  **配色 = 用户 2026-08 三次口径**：**圣辉白 / 铁血红 / 灵能紫 / 财团金 / 通用蓝**
 *  （海盗系不可建、不会出现在 chip 里，留着只为表完整）。
 *  ⚠ 白与金是**亮色**，在暗色面板上有对比度陷阱 → 这两系的**选中态一律"亮底 + 深字 + 浅光环"**
 *    （绝不是白底白字），**未选中态一律"深底 + 浅字"**；红/紫/蓝三系选中态用实底 + 白字。
 *    六个系列的两态都保证：暗底上读得清、且彼此不撞色。 */
export const SERIES_CHIP_THEME: Readonly<Record<string, SeriesChipTheme>> = {
  圣辉: { idle: 'border-slate-400/70 bg-slate-800/50 text-slate-100 hover:bg-slate-700/60', active: 'border-white bg-slate-100 text-slate-900 ring-2 ring-white/60' },
  铁血: { idle: 'border-red-700/70 bg-red-900/25 text-red-300 hover:bg-red-900/45', active: 'border-red-300 bg-red-600 text-white ring-2 ring-red-400/50' },
  灵能: { idle: 'border-violet-700/70 bg-violet-900/25 text-violet-300 hover:bg-violet-900/45', active: 'border-violet-300 bg-violet-600 text-white ring-2 ring-violet-400/50' },
  财团: { idle: 'border-amber-600/70 bg-amber-900/25 text-amber-300 hover:bg-amber-900/45', active: 'border-amber-300 bg-amber-400 text-amber-950 ring-2 ring-amber-300/60' },
  通用: { idle: 'border-sky-700/70 bg-sky-900/25 text-sky-300 hover:bg-sky-900/45', active: 'border-sky-300 bg-sky-600 text-white ring-2 ring-sky-400/50' },
  海盗: { idle: 'border-orange-800/70 bg-orange-900/25 text-orange-300 hover:bg-orange-900/45', active: 'border-orange-400 bg-orange-700 text-white ring-2 ring-orange-400/50' },
};

/** 表里没有的系列（将来加系列）的兜底色：跟主题强调色（cyan）一致，不会出现"没颜色"的 chip */
const SERIES_THEME_FALLBACK: SeriesChipTheme = {
  idle: 'border-[#33405f] bg-[#161f36] text-slate-400 hover:bg-[#1d2740]',
  active: 'border-cyan-300 bg-cyan-700 text-white ring-2 ring-cyan-400/50',
};

/** 系列 chip 的一态类名（**颜色值的唯一出口**；组件不许自己写颜色类） */
export function seriesChipClass(series: string, selected: boolean): string {
  const theme = SERIES_CHIP_THEME[series] || SERIES_THEME_FALLBACK;
  return selected ? theme.active : theme.idle;
}

/** 一个系列档：`铁血 3` = 铁血系在这组行里有 3 型（船坞 = 已解锁型数；卡库 = 已拥有型数） */
export interface SeriesGroup {
  /** 系列名（data/battle/cards.ts 的 `series`，如 '圣辉'） */
  series: string;
  /** 这一组行里有几型（与传入的 rows 同源，一次遍历算完） */
  count: number;
}

/**
 * 把一组行按系列归成 chip 档：**只收"真的有行"的系列**（一个都没有的系列不出现），
 * 系列名与顺序都取**行里出现的顺序**（卡牌数据的顺序），不硬编码「圣辉/铁血/…」，
 * 以后加系列卡自动出现；计数 = 这组行的型数（船坞传已解锁卡、卡库传已拥有卡）。
 */
export function seriesGroups<T extends { series: string }>(rows: readonly T[]): SeriesGroup[] {
  const groups: SeriesGroup[] = [];
  for (const row of rows) {
    const hit = groups.find((g) => g.series === row.series);
    if (hit) hit.count += 1;
    else groups.push({ series: row.series, count: 1 });
  }
  return groups;
}

/** 默认选中的系列 = **第一个"有卡的"系列**（`groups[0]`；一个都没有时返回空串 —— 那时本来就没有卡可筛） */
export function defaultSeriesFilter(groups: readonly { series: string }[]): string {
  return groups.length > 0 ? groups[0].series : '';
}

/** 点某颗 chip 之后的选中值：**永远恰好选中一个系列** —— 点已选中的那一颗是**无操作**
 *  （原样返回它），**不存在**"取消筛选 / 回到全部"这条路。 */
export function pickSeriesFilter(current: string, series: string): string {
  return current === series ? current : series;
}

/** 当前筛选值在现有档位里还有效吗：无效（换档 / 换存档后该系列已经没有卡了）→ 落到
 *  **第一个有卡的系列**（`defaultSeriesFilter`）—— 不是"不筛选"：永远恰好选中一个系列。
 *  这样不会出现"chip 不见了、列表却还被筛着"的空列表。 */
export function resolveSeriesFilter(active: string, groups: readonly { series: string }[]): string {
  return groups.some((g) => g.series === active) ? active : defaultSeriesFilter(groups);
}

/**
 * 按系列取行（**同一个实现**：船坞取已解锁卡、卡库取已拥有卡）。
 * ⚠ **传入的档位一张都匹配不上时原样返回完整数组**（不复制、不截断，杜绝静默空列表 ——
 *   与 `resolveSeriesFilter` 的兜底同口径；正常路径走不到，这是防线）。
 */
export function filterBySeries<T extends { series: string }>(rows: T[], series: string): T[] {
  const hit = rows.filter((r) => r.series === series);
  return hit.length > 0 ? hit : rows;
}
