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
  // ⚠ 其中 5 个带 `pirateLair`（海盗老巢，V1.5 §7.1）。**只复用空星系节点挂标记**：
  //   节点 id / 坐标 / 航道 / 类型一律没动（动了星图校验与贸易距离折价都会变），
  //   故 validateGalaxy() 的结果与本次改动前逐字一致。
  //   ⚠ **只有 `name` 改过**（用户 2026-08 裁定）：这 5 个节点的 `name` 是**玩家可见的展示名**
  //     （出征卡片走 lib/battle/expedition.discoveredLairs → node.name；星图信息卡、下一回合预告、
  //     贸易目的地走 lib/galaxy/knowledge.getNodeDisplayName → node.name），
  //     仍叫「空星系·NN」会让玩家看到"黑寡妇玛拉的老巢 = 空星系·12"（截图实证 ✗）。
  //     故老巢节点的 name 写成 **`海盗老巢·<BOSS 简称>`**（**带 BOSS 名**：星图信息卡只有标题位能说明
  //     "这是谁的老巢"，别处不显示，用户最终裁定；代价是出征卡片上 BOSS 名出现两次，**用户知情并接受**），
  //     `pirateLair` 标记与坐标保持不变。
  //   ⚠ **类型标签另算**：星图信息卡的 `TYPE_LABEL[node.type]` 对 empty 节点是「空星系」，
  //     套到老巢头上同样是错的 → components/GalaxyMapPanel 的 `nodeLabel()` 按 `node.pirateLair` 取「海盗老巢」。
  //     标签恒为「海盗老巢」四个字（**不带 BOSS 名**，名字已经在标题位了，别在标签里再说一遍）。
  //     判据（有断言脚本核）：**5 个老巢节点在任何玩家可见处都不出现「空星系」**。
  //   ⚠ 迷雾不受影响：未探明的老巢，getNodeDisplayName 仍返回「未探测星系」、星图节点不画名字、
  //     getNodeLandscapeImage 仍返回 null、信息卡走迷雾分支（**不渲染类型标签**）—— name 与标签只在探明后可见。
  //   ⚠ 除这 5 个老巢外，其余 15 个空星系的 name **保持**「空星系·NN」（那里确实没有内容）。
  //   对照表（V1.5 §7.1 的星图位置 → 对应 BOSS）：
  //     e20 → b4（锈钩·卡尔戈）  e11 → b3（深海阎王·巴罗萨）  e06 → b1（快刀·红胡子）
  //     e16 → b5（苍白歌者·塞壬） e12 → b2（黑寡妇·玛拉）
  //   BOSS 全名与血量见 data/battle/pirates.ts（本文件仍**不重复维护** BOSS 全名：节点名只写简称，
  //   出征卡片上的 BOSS 名走 PIRATE_BOSSES；坏 id 由 expedition 的 DEV 自检兜底）；
  //   出征耗时由坐标推导，见 lib/battle/expedition.ts。
  { id: 'e01', type: 'empty', name: '空星系·01', x: 520, y: 340 },
  { id: 'e02', type: 'empty', name: '空星系·02', x: 250, y: 250 },
  { id: 'e03', type: 'empty', name: '空星系·03', x: 620, y: 430 },
  { id: 'e04', type: 'empty', name: '空星系·04', x: 470, y: 270 },
  { id: 'e05', type: 'empty', name: '空星系·05', x: 790, y: 60 },
  { id: 'e06', type: 'empty', name: '海盗老巢·红胡子', x: 120, y: 520, pirateLair: 'b1' },
  { id: 'e07', type: 'empty', name: '空星系·07', x: 300, y: 600 },
  { id: 'e08', type: 'empty', name: '空星系·08', x: 520, y: 520 },
  { id: 'e09', type: 'empty', name: '空星系·09', x: 820, y: 300 },
  { id: 'e10', type: 'empty', name: '空星系·10', x: 700, y: 240 },
  { id: 'e11', type: 'empty', name: '海盗老巢·巴罗萨', x: 240, y: 120, pirateLair: 'b3' },
  { id: 'e12', type: 'empty', name: '海盗老巢·玛拉', x: 900, y: 80, pirateLair: 'b2' },
  { id: 'e13', type: 'empty', name: '空星系·13', x: 80, y: 250 },
  { id: 'e14', type: 'empty', name: '空星系·14', x: 600, y: 540 },
  { id: 'e15', type: 'empty', name: '空星系·15', x: 330, y: 240 },
  { id: 'e16', type: 'empty', name: '海盗老巢·塞壬', x: 760, y: 560, pirateLair: 'b5' },
  { id: 'e17', type: 'empty', name: '空星系·17', x: 180, y: 420 },
  { id: 'e18', type: 'empty', name: '空星系·18', x: 500, y: 600 },
  { id: 'e19', type: 'empty', name: '空星系·19', x: 860, y: 200 },
  { id: 'e20', type: 'empty', name: '海盗老巢·卡尔戈', x: 420, y: 460, pirateLair: 'b4' },
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
