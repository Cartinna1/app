// ==================== 星图节点配图（唯一真值） ====================
// 星图信息卡（components/GalaxyMapPanel）在跃迁按钮上方展示一张节点配图。
// 命名规则（与其它资源目录保持一致：public/ 映射站点根，路径里不写 public/）：
//   可殖民星球  /planet-landscape/<星球类型id>.png   已有（类型 id：desert/ocean/polar/arid/terran/alpine/savannah/tropical/tundra/ruin）
//   遗迹        /archaeology/<遗迹id>/cover.webp      已有（直接复用该遗迹的图鉴封面，避免两套图分叉）
//   势力        /faction-landscape/<势力id>.png       **待补**（如 /faction-landscape/f01.png，共 f01~f10；缺图自动隐藏，不影响功能）
//   未开发(empty) 无图（后续更新）
// 迷雾规则：只对**已探测**节点返回图片；未探测节点不返回任何路径，避免泄露信息。

import type { GalaxyNode } from '@/types/galaxy';
import { getArchaeologySite } from '@/data/galaxy/archaeology';

/** 节点配图的存储目录（供文档/工具引用，勿在业务代码里重复硬编码） */
export const NODE_IMAGE_DIR = {
  planet: '/planet-landscape',
  faction: '/faction-landscape',
  archaeology: '/archaeology',
} as const;

/** 返回该节点在星图信息卡里要展示的配图路径；无图返回 null */
export function getNodeLandscapeImage(node: GalaxyNode): string | null {
  if (node.type === 'colony') return node.planetId ? `${NODE_IMAGE_DIR.planet}/${node.planetId}.png` : null;
  if (node.type === 'ruin') {
    const site = node.siteId ? getArchaeologySite(node.siteId) : undefined;
    return site?.galleryImage || null; // 形如 /archaeology/<siteId>/cover.webp
  }
  if (node.type === 'faction') return node.factionId ? `${NODE_IMAGE_DIR.faction}/${node.factionId}.png` : null;
  return null;
}
