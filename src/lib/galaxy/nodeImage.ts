// ==================== 星图节点配图（唯一真值） ====================
// 星图信息卡（components/GalaxyMapPanel）在跃迁按钮上方展示一张节点配图。
// 命名规则（与其它资源目录保持一致：public/ 映射站点根，路径里不写 public/）：
//   可殖民星球  /planet-landscape/<星球类型id>.webp   **已在位**（10 个类型：desert/ocean/polar/arid/terran/alpine/savannah/tropical/tundra/ruin）
//   遗迹        /archaeology/<遗迹id>/cover.webp      **已在位**（直接复用该遗迹的图鉴封面，避免两套图分叉）
//   势力        /faction-landscape/<势力id>.webp     **已在位**（f01~f10，共 10 张；2026-08 实测：文件都在，非"待补"）
//   海盗老巢    /battle/lairs/<bossId>.webp          **待出图**（5 张：b1~b5；老巢 = 挂了 pirateLair 的空星系，见 data/galaxy/nodes.ts）
//   未开发(empty，且非老巢) 无图
// 尺寸口径：本图位是**详情大图**（宽度跟卡片走、`w-full aspect-video`，桌面最宽可达 1360px），
//   故与 planet-landscape / faction-landscape 同档出 **1424×800（16:9）**，**不需要缩略图**
//   （只有"列表/网格"位才走 lib/assetThumb.getThumbPath）。
//
// ⚠ 迷雾规则（铁律，**已落到代码上**）：**未探测的节点一律不返回图片**。
//   判据唯一真值是 lib/galaxy/knowledge.ts 的 isNodeDiscovered（内部就是 visitedNodes），
//   本函数**四类图位全部**先过它 —— 曾经四类都无条件返回路径，未探测节点会泄露
//   星球类型（/planet-landscape/<planetId>.webp）、势力 id、遗迹 id，属"注释里有、代码里没有"。
//   勿在本文件另写 `visitedNodes.includes(...)` 或哨兵名比对。

import type { GalaxyNode } from '@/types/galaxy';
import type { Mothership } from '@/types/game';
import { getArchaeologySite } from '@/data/galaxy/archaeology';
import { isNodeDiscovered } from '@/lib/galaxy/knowledge';

/** 节点配图的存储目录（供文档/工具引用，勿在业务代码里重复硬编码） */
export const NODE_IMAGE_DIR = {
  planet: '/planet-landscape',
  faction: '/faction-landscape',
  archaeology: '/archaeology',
  lair: '/battle/lairs',
} as const;

/**
 * 返回该节点在星图信息卡里要展示的配图路径；无图返回 null。
 * @param ship 母舰：用于迷雾判定（**四类图位**：未探明节点一律不出图）。
 *   不传时按"都没探明"处理 —— 保守方向，不会泄露未探明内容。
 */
export function getNodeLandscapeImage(node: GalaxyNode, ship?: Mothership): string | null {
  if (!isNodeDiscovered(ship, node.id)) return null; // 迷雾：未探测节点不返回任何图片
  if (node.type === 'colony') return node.planetId ? `${NODE_IMAGE_DIR.planet}/${node.planetId}.webp` : null;
  if (node.type === 'ruin') {
    const site = node.siteId ? getArchaeologySite(node.siteId) : undefined;
    return site?.galleryImage || null; // 形如 /archaeology/<siteId>/cover.webp
  }
  if (node.type === 'faction') return node.factionId ? `${NODE_IMAGE_DIR.faction}/${node.factionId}.webp` : null;
  // 海盗老巢（V1.5 §7.1：5 个老巢复用空星系挂 pirateLair）
  if (node.pirateLair) return `${NODE_IMAGE_DIR.lair}/${node.pirateLair}.webp`;
  return null;
}
