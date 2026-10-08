import { memo } from 'react';

// ============================================================================
// 舰船卡面（**机库卡库 / 机库船坞 / 战斗舰队池共用这一个组件**）
//   用户 2026-08 口径：「卡库也按照船坞那样做…」「战斗也一样嘛」——
//   三处的卡面**样式只有这一份**（名字 / 系列·稀有度 / 攻·盾·体 / 费用角标 / 左上角徽章 / 图位），
//   差别只用 props 表达：
//     · `layout`      `stack` = 图在上、文字在下（卡库网格 / 战斗部署池）；`row` = 文字在左、图在右（船坞列表行）
//     · `chips`       左上角数量徽章（机库：持有 / 已编 / 可编）；战斗池不传
//     · `costSuffix`  费用角标后缀（机库「费」；战斗池同型多份时「×N」）
//     · `selectable`  能不能读（点开看技能）→ 决定 cursor 与"点了没反应"的观感；
//                     ⚠ **灰卡也必须能点**（`selectable` 与 `playable` 是两个概念，见 lib/battle/view.CardView）
//     · `playable`    能不能出（指挥度/空位）→ **只影响视觉变暗**，出不去由调用方在**执行那一步**给中文原因
//     · `title`       桌面悬浮提示（战斗池给技能原文）——手机没有 hover，**它不是技能出口**
//
// ⚠ 图位（排版口径，三轮定案）：
//   · **≈2:1、贴合素材**：实测 原图 640×316（2.0253:1）/ 列表缩略图 192×95（2.0211:1，50/50 一致）
//     → 框取 `SHIP_ART_ASPECT = aspect-[2/1]`，`object-cover` 最多裁 **1.25%**。
//     （旧框是 `h-24` + `w-[42%]`：高度**写死 96px**、比例随卡宽在 1.0~2.1:1 之间飘，
//       2.02:1 的素材被横裁 **25%~49%** —— 那才是"图片被压缩"的真因。）
//   · `stack` 的图 **占满整卡宽**（`order-first w-full`）→ 手机上一张卡 ≈346×246（旧 346×96），
//     图 ≈346×173（旧 145×96 且裁 1/4）；`lg`（宽屏 2 列那一档）把内边距与字号放大，
//     于是"宽屏 2 列的每张卡 = 手机那版放大 1.5×"。
//   · ⚠ 不用 `components/battle/parts` 的 CardArt（固定框、比例不对）：这里自己渲染图位，
//     用调用方给的**缩略图** artSrc（AGENTS 第五节），`onError` 隐藏、不留破图。
// ============================================================================

/** 卡面排布：
 *  · `stack`（默认）= 图在上、文字在下（**机库卡库**用；手机那版用户说最好看）
 *  · `row`          = 文字在左、图在右 58%（**船坞列表行**用，宽松）
 *  · `flat`         = 文字在左、图在右 **48%**、内边距略松（**战斗部署池**用 —— 那儿是"选卡"的地方，
 *                     要一屏看到 3 张以上；"扁"靠**缩窄图位**实现，不是裁切/拉伸）
 *  · `bar`          = **横条**（战场**手机端**的单位条）：图在右、**高度固定** `h-[44px]`、宽度由 2:1 算出来
 *                     —— 战场竖格子只有 ≈53px 宽，2:1 素材会被横裁 64%；手机改横条后零裁切。
 *                     （桌面仍用 6 列竖格子：格子 ≈150px × 72px ≈ 2.08:1，本来就基本不裁，不动。） */
export type ShipCardLayout = 'stack' | 'row' | 'flat' | 'bar';

/**
 * 图位比例（**唯一真值**）：素材实测 2.0253:1（原图 640×316）/ 2.0211:1（缩略图 192×95）
 * → 取 2:1，`object-cover` 裁切 ≈1.25%（可忽略）。**任何地方都不许再写第二份比例**。
 * ⚠ 四种排布**共用这一个比例**：变扁/变条只改图位的**宽或高**（`w-[58%]` / `w-[48%]` / `h-[44px]`），
 *   绝不改比例 —— 改比例就等于裁切/拉伸。
 */
export const SHIP_ART_ASPECT = 'aspect-[2/1]';

/** 卡面图位的整串 class（四态；图位比例 / 边框 / 排布**只有这一处**，页面不许自己拼）
 *  ⚠ `self-center`：横排时文字块可能比图高，若不加它，flex 默认的 `stretch` 会把图拉高、
 *    2:1 比例被破坏（`object-cover` 就会开始裁切）。 */
export function shipArtClass(layout: ShipCardLayout): string {
  const base = `${SHIP_ART_ASPECT} flex-none object-cover`;
  if (layout === 'stack') return `${base} order-first w-full border-b border-[#2b3550]`;
  /* 横条：**高固定、宽由比例算**（`h-[44px]` + `w-auto` → 88×44），与竖格子的 `h-[72px] w-full` 同一套边框/圆角 */
  if (layout === 'bar') return `${base} self-center h-[44px] w-auto rounded-[5px] border border-[#2b3550]`;
  return `${base} self-center ${layout === 'flat' ? 'w-[48%]' : 'w-[58%]'} border-l border-[#2b3550]`;
}

/**
 * 卡片在网格里的列宽（**唯一真值**）：**手机 1 列、`sm` 起 2 列 —— 上限就是 2**。
 * ⚠ 机库卡库网格与战斗部署池**读同一串**（`w-full sm:w-[calc(50%-3px)]`）：
 *   3 列已删（3 列时卡片 ≈325px，2.02:1 的素材被横裁 30%）。
 */
export const SHIP_CARD_GRID_ITEM = 'w-full sm:w-[calc(50%-3px)]';

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

/** 稀有度 → 左边条颜色（机库与战斗卡面同一套语言） */
function rarityClass(rarity: string): string {
  if (rarity === '蓝') return 'border-l-[3px] border-l-sky-400';
  if (rarity === '紫') return 'border-l-[3px] border-l-violet-400';
  if (rarity === '橙') return 'border-l-[3px] border-l-amber-400';
  if (rarity === '衍') return 'border-l-[3px] border-l-slate-500';
  return 'border-l-[3px] border-l-slate-300';
}

export interface ShipCardProps {
  /** 本卡对应的卡型 id（数组遍历时由 map 的第二个参数传入，避免在 map 里写 inline 箭头） */
  id: string;
  name: string;
  series: string;
  rarity: string;
  /** 当前费用（战斗里是含减免/动态后的实际值） */
  cost: number;
  atk: number;
  shield: number;
  structure: number;
  /** 卡面图位（调用方保证已走缩略图） */
  artSrc: string;
  /** 选中的卡加重描边（点选后技能详情/信息条显示它） */
  selected: boolean;
  /** 左上角数量徽章（机库用；缺省不显示） */
  chips?: CardCountChip[];
  /** 费用角标后缀：机库「费」；战斗池同型多份时「×N」（空串 = 不显示） */
  costSuffix?: string;
  /** 排布（缺省 `stack` = 图在上） */
  layout?: ShipCardLayout;
  /** 能不能读（点开看技能）：false → `cursor-not-allowed` + 变暗。**缺省 true** */
  selectable?: boolean;
  /** 能不能出（指挥度/空位）：false → 只变暗，点击照样进处理器。**缺省 true** */
  playable?: boolean;
  /** 桌面悬浮提示（战斗池给技能原文；手机没有 hover，不是技能出口） */
  title?: string;
  /** 点选/点开这张卡：调用方用 useCallback 保持引用稳定（AGENTS 第五节，不许 inline 箭头击穿 memo） */
  onSelect: (cardId: string) => void;
}

function ShipCardBase({
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
  costSuffix,
  layout,
  selectable,
  playable,
  title,
  onSelect,
}: ShipCardProps) {
  const list = chips || [];
  /** 实际排布：缺省 `stack`（图在上）；`row` / `flat` 都是横排（图在右），只是图位宽窄不同 */
  const art: ShipCardLayout = layout === 'row' ? 'row' : layout === 'flat' ? 'flat' : 'stack';
  const stacked = art === 'stack';
  /** 文字区内边距：
   *  · `stack`（机库大卡）= 手机紧凑、`lg` 再放大一圈；
   *  · `flat`（战斗部署池）= 略松一点（`py-3.5`）把卡托到 ≈85~120px，**不跟 lg 放大**（那儿要"扁"）；
   *  · `row`（船坞行）= 维持原样。 */
  const pad = stacked ? 'px-2 py-1.5 lg:px-4 lg:py-3.5' : art === 'flat' ? 'px-2 py-3.5' : 'px-2 py-1.5';
  /** 能不能点：决定 cursor 与 hover；`playable` 只管变暗（两个概念绝不合成一个值） */
  const clickable = selectable !== false;
  const canPlay = playable !== false;
  return (
    <button
      type="button"
      title={title}
      onClick={() => onSelect(id)}
      /* ⚠ 不写死高度（旧写法 h-24）：卡高由内容决定 —— 图位随卡宽长高，卡片跟着变高 */
      className={`relative flex w-full overflow-hidden rounded-lg border border-[#3a4767] bg-[#1b2438] text-left ${
        stacked ? 'flex-col' : 'flex-row'
      } ${clickable ? 'cursor-pointer hover:bg-[#243052]' : 'cursor-not-allowed opacity-[0.38]'} ${
        canPlay ? '' : 'opacity-[0.55]'
      } ${rarityClass(rarity)} ${selected ? 'border-amber-400 ring-2 ring-amber-400/30' : ''}`}
    >
      {/* 数量徽章（左上角，可多段：持有 / 已编 / 可编）—— stack 时它压在图上，深色底仍清晰 */}
      {list.length > 0 ? (
        <div className="absolute left-[5px] top-1 z-[2] flex flex-wrap gap-1">
          {list.map((c) => (
            <span
              key={c.label}
              className={`rounded-md border bg-[#0b1020]/85 px-1 text-[10px] font-semibold leading-[1.5] ${
                stacked ? 'lg:px-1.5 lg:text-[11px]' : ''
              } ${chipClass(c.tone)}`}
            >
              {c.label} {c.value}
            </span>
          ))}
        </div>
      ) : null}

      {/* 费用徽章（右上角，机库与战斗同一位置与样式；后缀「费」/「×N」由调用方给） */}
      <div
        className={`absolute right-[5px] top-1 z-[2] rounded-md border border-[#3a4767] bg-[#0b1020]/85 px-1 text-sm font-extrabold leading-[1.3] text-slate-200 ${
          stacked ? 'lg:px-1.5 lg:text-base' : ''
        }`}
      >
        {cost}
        {costSuffix ? (
          <em className={`text-[10.5px] font-semibold not-italic text-slate-400 ${stacked ? 'lg:text-[11px]' : ''}`}>
            {costSuffix}
          </em>
        ) : null}
      </div>

      {/* 文字区：stack = 图下方整行（宽屏放大内边距与字号）；row / flat = 左侧列（紧凑） */}
      <div className={`flex min-w-0 flex-1 flex-col justify-center ${pad}`}>
        <div className={`overflow-hidden text-ellipsis whitespace-nowrap text-[12.5px] font-bold ${stacked ? 'lg:text-[15px]' : ''}`}>
          {name}
        </div>
        <div className={`mt-0.5 text-[10px] text-slate-500 ${stacked ? 'lg:text-[11.5px]' : ''}`}>
          {series} · {rarity}
        </div>
        {/* ⚠ 允许换行（flex-wrap）：窄卡上宁可折成两行也不溢出到图位上去 */}
        <div className={`mt-1.5 flex flex-wrap items-baseline gap-x-3.5 gap-y-0.5 ${stacked ? 'lg:gap-x-5' : ''}`}>
          <span className="text-[#fca5a5]">
            <i className={`mr-px text-[11px] not-italic opacity-80 ${stacked ? 'lg:text-[12.5px]' : ''}`}>攻</i>
            <b className={`text-xl font-extrabold leading-none tracking-tight ${stacked ? 'lg:text-[24px]' : ''}`}>{atk}</b>
          </span>
          <span className="text-[#7dd3fc]">
            <i className={`mr-px text-[11px] not-italic opacity-80 ${stacked ? 'lg:text-[12.5px]' : ''}`}>盾</i>
            <b className={`text-xl font-extrabold leading-none tracking-tight ${stacked ? 'lg:text-[24px]' : ''}`}>{shield}</b>
          </span>
          <span className="text-[#fcd34d]">
            <i className={`mr-px text-[11px] not-italic opacity-80 ${stacked ? 'lg:text-[12.5px]' : ''}`}>体</i>
            <b className={`text-xl font-extrabold leading-none tracking-tight ${stacked ? 'lg:text-[24px]' : ''}`}>{structure}</b>
          </span>
        </div>
      </div>

      {/* 图位：`stack` = 图在上、占满卡宽；`row` = 右侧 58%；`flat` = 右侧 48%（更扁）。
          三者共用同一个 2:1 比例 —— 变扁只缩窄图位。缺图隐藏，不留破图 */}
      <img
        src={artSrc}
        alt=""
        loading="lazy"
        decoding="async"
        onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }}
        className={shipArtClass(art)}
      />
    </button>
  );
}

export default memo(ShipCardBase);
