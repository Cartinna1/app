// ==================== 星图节点（固定布局，共 50 个） ====================
// 坐标系：SVG viewBox 1000×700。跃迁回合数由两端坐标距离推导（唯一真值见 lib/galaxy/graph.ts 的 TURN_UNIT）。
// 构成：10 势力（核心区）/ 10 殖民地星球（富饶环）/ 10 遗迹（边陲带）/ 20 空星系（深空，内容待后续更新）。
// ⚠ 布局固定，仅开局停泊点随机。改坐标会同时改变最短路与贸易距离折价，
//   改完必须跑 validateGalaxy() 与「势力间最短路 vs 原 DISTANCE_MATRIX」对比表。

import type { GalaxyNode, GalaxyState } from '@/types/galaxy';

export const GALAXY_NODES: GalaxyNode[] = [
  // ==================== 10 势力（核心区） ====================
  // 坐标经一次"最短路贴近旧 DISTANCE_MATRIX"的优化：平均偏差 1.53 回合。
  // 当前势力间最短路区间 2~9 回合、均值 ≈5.87（再改任何坐标都要重跑该对比表与 validateGalaxy）
  { id: 'f01', type: 'faction', name: '银河人类联邦', x: 172, y: 129, factionId: 'f01' },
  { id: 'f02', type: 'faction', name: '齐戈尔统一集群', x: 75, y: 333, factionId: 'f02' },
  { id: 'f03', type: 'faction', name: '泰拉钢铁王座', x: 565, y: 248, factionId: 'f03' },
  { id: 'f04', type: 'faction', name: '阿基米德圣咏体', x: 443, y: 177, factionId: 'f04' },
  { id: 'f05', type: 'faction', name: '盖亚环廊商贸联合体', x: 254, y: 555, factionId: 'f05' },
  { id: 'f06', type: 'faction', name: '灵能蔷薇王朝', x: 721, y: 384, factionId: 'f06' },
  { id: 'f07', type: 'faction', name: '诺瓦共鸣共和国', x: 353, y: 360, factionId: 'f07' },
  { id: 'f08', type: 'faction', name: '光语者宁静域', x: 519, y: 406, factionId: 'f08' },
  { id: 'f09', type: 'faction', name: '黑渊自由港邦联', x: 571, y: 629, factionId: 'f09' },
  { id: 'f10', type: 'faction', name: '超念矩阵', x: 749, y: 130, factionId: 'f10' },

  // ==================== 10 殖民地星球（富饶环；未到达前类型隐藏） ====================
  { id: 'c_desert', type: 'colony', name: '沙漠星球', x: 300, y: 180, planetId: 'desert' },
  { id: 'c_ocean', type: 'colony', name: '海洋星球', x: 60, y: 600, planetId: 'ocean' },
  { id: 'c_polar', type: 'colony', name: '极地星球', x: 560, y: 20, planetId: 'polar' },
  { id: 'c_arid', type: 'colony', name: '干旱星球', x: 110, y: 400, planetId: 'arid' },
  { id: 'c_terran', type: 'colony', name: '陆地星球', x: 640, y: 590, planetId: 'terran' },
  { id: 'c_alpine', type: 'colony', name: '高山星球', x: 380, y: 540, planetId: 'alpine' },
  { id: 'c_savannah', type: 'colony', name: '草原星球', x: 940, y: 180, planetId: 'savannah' },
  { id: 'c_tropical', type: 'colony', name: '热带星球', x: 500, y: 80, planetId: 'tropical' },
  { id: 'c_tundra', type: 'colony', name: '苔原星球', x: 900, y: 600, planetId: 'tundra' },
  { id: 'c_ruin', type: 'colony', name: '遗落星球', x: 440, y: 400, planetId: 'ruin' },

  // ==================== 10 遗迹（边陲带；考古目标，siteId → data/galaxy/archaeology.ts） ====================
  { id: 'ruin_bell_tower', type: 'ruin', name: '无声钟楼', x: 60, y: 60, siteId: 'bell_tower' },
  { id: 'ruin_mirror_graveyard', type: 'ruin', name: '镜面坟场', x: 340, y: 40, siteId: 'mirror_graveyard' },
  { id: 'ruin_carbon_nest', type: 'ruin', name: '碳壳巢', x: 650, y: 40, siteId: 'carbon_nest' },
  { id: 'ruin_cradle', type: 'ruin', name: '停摆的摇篮', x: 960, y: 120, siteId: 'cradle' },
  { id: 'ruin_corridor', type: 'ruin', name: '折叠回廊', x: 960, y: 420, siteId: 'corridor' },
  { id: 'ruin_crucible', type: 'ruin', name: '九转丹炉残址', x: 700, y: 670, siteId: 'crucible' },
  { id: 'ruin_orrery', type: 'ruin', name: '逆向星图台', x: 430, y: 670, siteId: 'orrery' },
  { id: 'ruin_steles', type: 'ruin', name: '七层碑林', x: 160, y: 660, siteId: 'steles' },
  { id: 'ruin_lighthouse', type: 'ruin', name: '掌灯者灯塔基座', x: 30, y: 430, siteId: 'lighthouse' },
  { id: 'ruin_idols', type: 'ruin', name: '空白神像厅', x: 30, y: 180, siteId: 'idols' },

  // ==================== 20 空星系（深空；可进入，内容待更新） ====================
  { id: 'e01', type: 'empty', name: '空星系·01', x: 520, y: 340 },
  { id: 'e02', type: 'empty', name: '空星系·02', x: 250, y: 250 },
  { id: 'e03', type: 'empty', name: '空星系·03', x: 620, y: 430 },
  { id: 'e04', type: 'empty', name: '空星系·04', x: 470, y: 270 },
  { id: 'e05', type: 'empty', name: '空星系·05', x: 790, y: 60 },
  { id: 'e06', type: 'empty', name: '空星系·06', x: 120, y: 520 },
  { id: 'e07', type: 'empty', name: '空星系·07', x: 300, y: 600 },
  { id: 'e08', type: 'empty', name: '空星系·08', x: 520, y: 520 },
  { id: 'e09', type: 'empty', name: '空星系·09', x: 820, y: 300 },
  { id: 'e10', type: 'empty', name: '空星系·10', x: 700, y: 240 },
  { id: 'e11', type: 'empty', name: '空星系·11', x: 240, y: 120 },
  { id: 'e12', type: 'empty', name: '空星系·12', x: 900, y: 80 },
  { id: 'e13', type: 'empty', name: '空星系·13', x: 80, y: 250 },
  { id: 'e14', type: 'empty', name: '空星系·14', x: 600, y: 540 },
  { id: 'e15', type: 'empty', name: '空星系·15', x: 330, y: 240 },
  { id: 'e16', type: 'empty', name: '空星系·16', x: 760, y: 560 },
  { id: 'e17', type: 'empty', name: '空星系·17', x: 180, y: 420 },
  { id: 'e18', type: 'empty', name: '空星系·18', x: 500, y: 600 },
  { id: 'e19', type: 'empty', name: '空星系·19', x: 860, y: 200 },
  { id: 'e20', type: 'empty', name: '空星系·20', x: 420, y: 460 },
];

/** 节点 id → 定义（星图渲染与状态查询共用） */
export const GALAXY_NODE_MAP: Record<string, GalaxyNode> = Object.fromEntries(
  GALAXY_NODES.map((n) => [n.id, n])
);

export function getGalaxyNode(id: string | null | undefined): GalaxyNode | undefined {
  return id ? GALAXY_NODE_MAP[id] : undefined;
}

/** 开局停泊点候选：10 个势力节点（每局随机一个） */
export const GALAXY_START_NODE_IDS: string[] = GALAXY_NODES
  .filter((n) => n.type === 'faction')
  .map((n) => n.id);

/**
 * 初始星图状态（新开局 / 读档兜底共用，唯一工厂）。
 * 不传 startNodeId 时随机停泊一个势力节点；其余节点均为「未探测」。
 */
export function createGalaxyState(startNodeId?: string): GalaxyState {
  const start = startNodeId && GALAXY_NODE_MAP[startNodeId]
    ? startNodeId
    : GALAXY_START_NODE_IDS[Math.floor(Math.random() * GALAXY_START_NODE_IDS.length)];
  return {
    currentNodeId: start,
    targetNodeId: null,
    travelTurnsRemaining: 0,
    visitedNodes: [start],
    colonizedNodeId: null,
    archaeology: {},
    permaBonuses: [],
    titles: [],
  };
}
