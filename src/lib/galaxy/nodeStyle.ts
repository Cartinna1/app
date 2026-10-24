// ==================== 星图节点的圆圈配色 / 类型标签（唯一真值） ====================
// 纯函数，不依赖 React/DOM —— 星图面板（components/GalaxyMapPanel）只渲染这里算出来的
// fill / stroke / 半径 / 类型标签，不在 UI 里另抄一份颜色表。
//
// ⚠ **节点分类的唯一权威是 `GalaxyNode.type`**（`pirateLair` = 海盗老巢，`empty` = 真空星系）。
//   以类型为键的这几张表（NODE_RADIUS / NODE_FILL / NODE_STROKE / TYPE_LABEL）都是
//   `Record<GalaxyNode['type'], …>`，**加新类型时四张必须一起补齐**（漏一张就是 Record 缺键的编译错）。
//
// ⚠ 为什么值得单独一个文件：**迷雾硬约束**（AGENTS 第九节「迷雾必须落到函数上」）。
//   「未探明的海盗老巢必须与普通未探明节点长得一模一样」是一条**可被测试的规则**，
//   写在 JSX 分支里就只能靠肉眼复核；放进纯函数后 `scripts/check-galaxy-lair.cjs` 可以逐节点断言
//   「5 个未探明老巢的 r/fill/stroke 与 `empty` 的未探明值逐字节相同，且与普通未探明节点完全一致」。
//   判据 `discovered` 由调用方从 `lib/galaxy/knowledge.isNodeDiscovered` 取（迷雾的唯一判据）。

import type { GalaxyNode } from '@/types/galaxy';

/** 海盗老巢的配色（海盗红，与势力青 / 殖民绿 / 遗迹紫并列；`pirateLair` 类型专属）。
 *  ⚠ 声明在下面两张配色表**之前**：NODE_FILL / NODE_STROKE 直接引用它，避免同一颜色抄两份。 */
export const LAIR_FILL = '#b91c1c';
export const LAIR_STROKE = '#f87171';
/** 海盗老巢的类型标签（**绝不许写「空星系」**；老巢自成 `pirateLair` 类型，不再借用 empty） */
export const LAIR_LABEL = '海盗老巢';

/** 银河雇佣兵协会（`guild` 类型专属；青绿，与势力青 / 殖民绿 / 遗迹紫 / 老巢红并列）。
 *  它是**公开功能节点**（不是藏起来的老巢），所以图例里有它一行。 */
export const GUILD_FILL = '#0f766e';
export const GUILD_STROKE = '#5eead4';
export const GUILD_LABEL = '雇佣兵协会';

/** 节点半径（按类型；老巢与空星系同尺寸层级 = 12，**不放大**；协会比空星系大一圈 = 16） */
export const NODE_RADIUS: Record<GalaxyNode['type'], number> = {
  faction: 20,
  colony: 17,
  ruin: 17,
  empty: 12,
  pirateLair: 12,
  guild: 16,
};
/** 已探明节点的填充色 */
export const NODE_FILL: Record<GalaxyNode['type'], string> = {
  faction: '#0e7490',
  colony: '#047857',
  ruin: '#6d28d9',
  empty: '#334155',
  pirateLair: LAIR_FILL,
  guild: GUILD_FILL,
};
/** 已探明节点的描边色 */
export const NODE_STROKE: Record<GalaxyNode['type'], string> = {
  faction: '#22d3ee',
  colony: '#34d399',
  ruin: '#a78bfa',
  empty: '#64748b',
  pirateLair: LAIR_STROKE,
  guild: GUILD_STROKE,
};
/** 未探明节点的固定配色（**老巢也不例外**） */
export const UNDISCOVERED_FILL = '#1e293b';
export const UNDISCOVERED_STROKE = '#475569';

/** 类型标签（信息卡与图例共用；老巢那一行就是 `LAIR_LABEL`，协会那一行就是 `GUILD_LABEL`，两处同源） */
export const TYPE_LABEL: Record<GalaxyNode['type'], string> = {
  faction: '势力星系',
  colony: '可殖民星球',
  ruin: '遗迹星系',
  empty: '空星系',
  pirateLair: LAIR_LABEL,
  guild: GUILD_LABEL,
};

/** 节点圆圈的渲染样式（半径 + 填充 + 描边） */
export interface GalaxyNodeStyle {
  r: number;
  fill: string;
  stroke: string;
}

/**
 * 节点圆圈的配色 / 半径（**唯一入口**）。
 *
 * ⚠ **迷雾硬约束**：未探明的老巢必须与普通未探明节点**逐字节相同** —— 判据只读 `discovered`
 *   （走 knowledge.isNodeDiscovered），未探明分支里 `type` / `pirateLair` 都不参与上色，
 *   否则玩家在星图上一眼就能看出"这个灰点会变红 = 这里有老巢"，迷雾当场作废。
 *   `scripts/check-galaxy-lair.cjs` 对 50 个节点逐点断言这条。
 */
export function nodeStyle(node: GalaxyNode, discovered: boolean): GalaxyNodeStyle {
  if (!discovered) return { r: NODE_RADIUS[node.type], fill: UNDISCOVERED_FILL, stroke: UNDISCOVERED_STROKE };
  // 老巢判据：`type === 'pirateLair'` 是**唯一权威**；`!!node.pirateLair` 只是历史数据兜底
  //（"empty 节点挂 pirateLair 标记"的老写法照样上红色）——两条判据在现数据上同真，配色不变。
  // ⚠ `guild` 不走这条分支：它有自己的 fill/stroke（GUILD_FILL / GUILD_STROKE），
  //   绝不能被 `empty` 的灰或老巢的红吞掉（类型键表里已经有它，直接按 type 取即可）。
  const isLair = node.type === 'pirateLair' || !!node.pirateLair;
  return {
    // 老巢半径与空星系同尺寸层级（12），上红色但不放大 —— 与其它深空节点同一个尺寸层级
    r: isLair ? NODE_RADIUS.pirateLair : NODE_RADIUS[node.type],
    fill: isLair ? LAIR_FILL : NODE_FILL[node.type],
    stroke: isLair ? LAIR_STROKE : NODE_STROKE[node.type],
  };
}

/** 信息卡 / 图例用的类型标签（老巢按 `type` 已经在表里是「海盗老巢」，`pirateLair` 字段再兜一层） */
export function nodeTypeLabel(node: GalaxyNode): string {
  return node.pirateLair ? LAIR_LABEL : TYPE_LABEL[node.type];
}
