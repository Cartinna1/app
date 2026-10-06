// ==================== 星图节点的圆圈配色 / 类型标签（唯一真值） ====================
// 纯函数，不依赖 React/DOM —— 星图面板（components/GalaxyMapPanel）只渲染这里算出来的
// fill / stroke / 半径 / 类型标签，不在 UI 里另抄一份颜色表。
//
// ⚠ 为什么值得单独一个文件：**迷雾硬约束**（AGENTS 第九节「迷雾必须落到函数上」）。
//   「未探明的海盗老巢必须与普通未探明节点长得一模一样」是一条**可被测试的规则**，
//   写在 JSX 分支里就只能靠肉眼复核；放进纯函数后 `scripts/check-galaxy-lair.cjs` 可以逐节点断言
//   「6 个未探明老巢的 r/fill/stroke 与 `empty` 的未探明值逐字节相同，且与普通未探明节点完全一致」。
//   判据 `discovered` 由调用方从 `lib/galaxy/knowledge.isNodeDiscovered` 取（迷雾的唯一判据）。

import type { GalaxyNode } from '@/types/galaxy';

/** 节点半径（按类型） */
export const NODE_RADIUS: Record<GalaxyNode['type'], number> = { faction: 20, colony: 17, ruin: 17, empty: 12 };
/** 已探明节点的填充色 */
export const NODE_FILL: Record<GalaxyNode['type'], string> = {
  faction: '#0e7490',
  colony: '#047857',
  ruin: '#6d28d9',
  empty: '#334155',
};
/** 已探明节点的描边色 */
export const NODE_STROKE: Record<GalaxyNode['type'], string> = {
  faction: '#22d3ee',
  colony: '#34d399',
  ruin: '#a78bfa',
  empty: '#64748b',
};
/** 未探明节点的固定配色（**老巢也不例外** —— 见 nodeStyle） */
export const UNDISCOVERED_FILL = '#1e293b';
export const UNDISCOVERED_STROKE = '#475569';
/** 海盗老巢的配色（海盗红，与势力青 / 殖民绿 / 遗迹紫并列；老巢节点本体是 `empty` 类型） */
export const LAIR_FILL = '#b91c1c';
export const LAIR_STROKE = '#f87171';

/** 类型标签（信息卡与图例共用） */
export const TYPE_LABEL: Record<GalaxyNode['type'], string> = {
  faction: '势力星系',
  colony: '可殖民星球',
  ruin: '遗迹星系',
  empty: '空星系',
};
/** 老巢节点的类型标签（老巢本体是 `empty`，绝不许写「空星系」） */
export const LAIR_LABEL = '海盗老巢';

/** 节点圆圈的渲染样式（半径 + 填充 + 描边） */
export interface GalaxyNodeStyle {
  r: number;
  fill: string;
  stroke: string;
}

/**
 * 节点圆圈的配色 / 半径（**唯一入口**；`empty` 类型里那 5 个老巢按 `pirateLair` 单独上色）。
 *
 * ⚠ **迷雾硬约束**：未探明的老巢必须与普通未探明节点**逐字节相同** —— 判据是
 *   `discovered && node.pirateLair`（`discovered` 走 knowledge.isNodeDiscovered），
 *   未探明时一律落到同一组值 `UNDISCOVERED_FILL` / `UNDISCOVERED_STROKE`、且 `pirateLair` 不参与计算，
 *   否则玩家在星图上一眼就能看出"这个灰点会变红 = 这里有老巢"，迷雾当场作废。
 *   `scripts/check-galaxy-lair.cjs` 对 50 个节点逐点断言这条。
 */
export function nodeStyle(node: GalaxyNode, discovered: boolean): GalaxyNodeStyle {
  if (!discovered) return { r: NODE_RADIUS[node.type], fill: UNDISCOVERED_FILL, stroke: UNDISCOVERED_STROKE };
  const isLair = !!node.pirateLair;
  return {
    // 老巢本体是 empty（半径 12），上红色但不放大 —— 与其它 empty 节点同一个尺寸层级
    r: isLair ? NODE_RADIUS.empty : NODE_RADIUS[node.type],
    fill: isLair ? LAIR_FILL : NODE_FILL[node.type],
    stroke: isLair ? LAIR_STROKE : NODE_STROKE[node.type],
  };
}

/** 信息卡 / 图例用的类型标签（老巢按 `pirateLair` 取「海盗老巢」） */
export function nodeTypeLabel(node: GalaxyNode): string {
  return node.pirateLair ? LAIR_LABEL : TYPE_LABEL[node.type];
}
