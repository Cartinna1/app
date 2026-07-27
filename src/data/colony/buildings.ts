import type { BuildingDef } from '@/types/colony';

/** Phase 1 可用建筑（无需科技即可建造） */
export const PHASE_1_BUILDINGS: BuildingDef[] = [
  // ===== 居住类 =====
  {
    id: 'B1',
    name: '居住舱',
    description: '标准化殖民者居住单元，每间容纳5人。模块化设计，可堆叠扩建。',
    category: 'housing',
    costGold: 5000,
    buildTurns: 1,
    minPop: 0,
    maxPop: 0,
  },

  // ===== 食物生产 =====
  {
    id: 'B3',
    name: '气雾栽培舱',
    description: '悬浮在雾化营养液中的作物矩阵，利用大气氮氧循环种植，是殖民地的第一口粮仓。',
    category: 'food',
    costGold: 500,
    costMaterials: { carbon: 80 },
    buildTurns: 2,
    minPop: 1,
    maxPop: 5,
    outputType: 'food',
    baseOutput: 6,
    popFactor: 3,
  },

  // ===== 合金生产 =====
  {
    id: 'B6',
    name: '电弧熔炼炉',
    description: '通过可控电弧将原矿瞬间熔化，提纯出高强度结构金属，熔炉的蓝光彻夜不息。',
    category: 'alloy',
    costGold: 1000,
    costMaterials: { silicon: 40 },
    buildTurns: 2,
    minPop: 1,
    maxPop: 3,
    outputType: 'alloy',
    baseOutput: 1,
    popFactor: 1,
  },

  // ===== 贸易类 =====
  {
    id: 'B11',
    name: '星际贸易节点',
    description: '连接超光速通讯网络的终端，在此每一笔跨星系交易都能让你抽成，财富如数据流般涌入。',
    category: 'trade',
    costGold: 0,
    costMaterials: { carbon: 100 },
    buildTurns: 3,
    maxCount: 5,
    minPop: 4,
    maxPop: 4,
    outputType: 'gold',
    goldOutputMin: 500,
    goldOutputMax: 1000,
  },
];

/** 完整建筑列表（Phase 2 扩展） */
export function getBuildingDef(id: string): BuildingDef | undefined {
  return PHASE_1_BUILDINGS.find((b) => b.id === id);
}
