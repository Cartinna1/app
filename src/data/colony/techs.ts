import type { ResearchTech } from '@/types/colony';
import { BUILDING_QUANTUM_LAB, BUILDING_FUSION_PLANT } from './buildings';

export const ALL_TECHS: ResearchTech[] = [
  // ===== T1 都市级穹顶理论 =====
  { id: 'T1', name: '都市级穹顶理论', unlocksBuilding: 'B2',
    description: '"我们不再栖身于穹顶之下，我们让穹顶成为天空。"',
    costRP: 300, researchTurns: 2, prerequisites: [] },
  // ===== T2 碳基重组法则 =====
  { id: 'T2', name: '碳基重组法则', unlocksBuilding: 'B4',
    description: '"蛋白质不再是生长出来的，而是被计算出来的。"',
    costRP: 360, researchTurns: 2, prerequisites: [] },
  // ===== T3 盖亚蓝图 =====
  { id: 'T3', name: '盖亚蓝图', unlocksBuilding: 'B5',
    description: '"世界是一个可以复制的花园。"',
    costRP: 1800, researchTurns: 3, prerequisites: ['T2'] },
  // ===== T4 晶格冶金学 =====
  { id: 'T4', name: '晶格冶金学', unlocksBuilding: 'B7',
    description: '"金属记住了星辰的锻造术。"',
    costRP: 400, researchTurns: 2, prerequisites: [] },
  // ===== T5 星核工业原理 =====
  { id: 'T5', name: '星核工业原理', unlocksBuilding: 'B8',
    description: '"我们驯服了奇点，让它成为铁砧。"',
    costRP: 2000, researchTurns: 3, prerequisites: ['T4'] },
  // ===== T6 星尘感知理论 =====
  { id: 'T6', name: '星尘感知理论', unlocksBuilding: 'B9',
    description: '"虚空从不虚空，它在低语。"',
    costRP: 2300, researchTurns: 4, prerequisites: ['T1', 'T2', 'T4'] },
  // ===== T7 星尘共鸣学说 =====
  { id: 'T7', name: '星尘共鸣学说', unlocksBuilding: 'B10',
    description: '"宇宙是一首宏大的交响诗，我们可以加入合唱。"',
    costRP: 5000, researchTurns: 6, prerequisites: ['T6', 'T3', 'T5'] },
  // ===== T8 泛星系金融律法 =====
  { id: 'T8', name: '泛星系金融律法', unlocksBuilding: 'B12',
    description: '"市场是看不见的巨兽，律法是拴住它的缰绳。"',
    costRP: 390, researchTurns: 2, prerequisites: [] },
  // ===== T9 异星地质沉积学 =====
  { id: 'T9', name: '异星地质沉积学', unlocksBuilding: 'B13',
    description: '"每一颗星球都用自己的方式书写历史，我们只是学会了阅读。"',
    costRP: 490, researchTurns: 3, prerequisites: [] },
  // ===== T10 行星声波共振勘探理论 =====
  { id: 'T10', name: '行星声波共振勘探理论', unlocksBuilding: 'B14',
    description: '"我们用声音去触碰大地深处的心跳。"',
    costRP: 900, researchTurns: 2, prerequisites: ['T11'] },
  // ===== T11 大气碳循环解析模型 =====
  { id: 'T11', name: '大气碳循环解析模型', unlocksBuilding: 'B15',
    description: '"碳是宇宙的货币，大气是它的账本。"',
    costRP: 300, researchTurns: 2, prerequisites: [] },
  // ===== T12 暗物质粒子通量假说 =====
  { id: 'T12', name: '暗物质粒子通量假说', unlocksBuilding: 'B16',
    description: '"宇宙质量的百分之八十五在黑暗中流淌，我们决定不再视而不见。"',
    costRP: 1500, researchTurns: 3, prerequisites: ['T10'] },
  // ===== T13 亚稳态量子涨落观测理论 =====
  { id: 'T13', name: '亚稳态量子涨落观测理论', unlocksBuilding: 'B17',
    description: '"虚空从不静止，它在沸腾。我们终于看到了泡沫。"',
    costRP: 1400, researchTurns: 3, prerequisites: [] },
  // ===== T14 选择性激光熔析原理 =====
  { id: 'T14', name: '选择性激光熔析原理', unlocksBuilding: 'B18',
    description: '"沙粒中藏着芯片的灵魂，我们只需要把它唤醒。"',
    costRP: 320, researchTurns: 2, prerequisites: [] },
  // ===== T15 深地层渗透技术 =====
  { id: 'T15', name: '深地层渗透技术', unlocksBuilding: 'B19',
    description: '"我们刺穿行星的皮肤，去倾听它黑色的心跳。"',
    costRP: 1400, researchTurns: 3, prerequisites: ['T9'] },
  // ===== T16 碳基重组工程 =====
  { id: 'T16', name: '碳基重组工程', unlocksBuilding: 'B20',
    description: '"一切碳基皆可为燃料，一切生命皆可为基石。"',
    costRP: 1000, researchTurns: 2, prerequisites: ['T11'] },
  // ===== T17 暗物质相互作用模型 =====
  { id: 'T17', name: '暗物质相互作用模型', unlocksBuilding: 'B21',
    description: '"我们终于看见了那些从不与光共舞的幽灵。"',
    costRP: 2500, researchTurns: 4, prerequisites: ['T12'] },
  // ===== T18 地核熔炼工程 =====
  { id: 'T18', name: '地核熔炼工程', unlocksBuilding: 'B22',
    description: '"黄金不是挖掘出来的，而是从地心泵取出来的。"',
    costRP: 1300, researchTurns: 3, prerequisites: ['T10'] },
  // ===== T19 量子晶格生长原理 =====
  { id: 'T19', name: '量子晶格生长原理', unlocksBuilding: 'B23',
    description: '"我们将量子幽灵培养成了晶体。"',
    costRP: 2200, researchTurns: 3, prerequisites: ['T13'] },
  // ===== T20 单原子精度制造协议 =====
  { id: 'T20', name: '单原子精度制造协议', unlocksBuilding: 'B24',
    description: '"完美的世界，从一个完美的原子开始。"',
    costRP: 1250, researchTurns: 3, prerequisites: ['T14'] },
  // ===== T21 实用量子力学体系 =====
  { id: 'T21', name: '实用量子力学体系', unlocksBuilding: BUILDING_QUANTUM_LAB,
    description: '"在这里，现实只是一条可以被重写的代码。"',
    costRP: 2700, researchTurns: 3, prerequisites: ['T12'] },
  // ===== T22 加速表型复制协议 =====
  { id: 'T22', name: '加速表型复制协议', unlocksBuilding: 'B28',
    description: '"灵魂是不可复制的——但一具能挥动镐头的躯体，我们只需要它的基因组。"',
    costRP: 3000, researchTurns: 4, prerequisites: ['T3'] },
  // ===== T23 星际贤才招募法案 =====
  { id: 'T23', name: '星际贤才招募法案', leaderCapBonus: 1,
    description: '"银河广阔，人才不应被数字埋没。"',
    costRP: 1000, researchTurns: 3, prerequisites: [] },
  // ===== T24 集体意识协同网络 =====
  { id: 'T24', name: '集体意识协同网络', leaderCapBonus: 3,
    description: '"我们不再指挥个体，我们编织灵魂的网络。"',
    costRP: 2000, researchTurns: 5, prerequisites: ['T23'] },
  // ===== T25 星河奇迹 =====
  { id: 'T25', name: '星河奇迹',
    description: '"巨型结构是我们时代的伟大奇观。如此范围的大型工程在几代人之前是完全无法想象的。"',
    costRP: 10000, researchTurns: 6, prerequisites: [], minResearchedCount: 10 },
  // ===== T26 聚变能源原理 =====
  { id: 'T26', name: '聚变能源原理',
    description: '"当温度和压力达到临界点，恒星的核心反应可以被囚禁在一枚磁场之茧中。"',
    costRP: 6000, researchTurns: 4, prerequisites: [], minResearchedCount: 15, unlocksBuilding: BUILDING_FUSION_PLANT },
  // ===== T27 反物质约束理论 =====
  { id: 'T27', name: '反物质约束理论',
    description: '"反物质不是燃料……它是纯能量凝固成的晶体。困难不在于制造它，而在于说服它安静地待在容器里。"',
    costRP: 10000, researchTurns: 5, prerequisites: ['T26'], unlocksBuilding: 'B31' },
];

export function getTechById(id: string): ResearchTech | undefined {
  return ALL_TECHS.find((t) => t.id === id);
}

export function getAvailableTechs(researchedIds: string[]): ResearchTech[] {
  return ALL_TECHS.filter((t) =>
    !researchedIds.includes(t.id) &&
    t.prerequisites.every((p) => researchedIds.includes(p)) &&
    (!t.minResearchedCount || researchedIds.length >= t.minResearchedCount)
  );
}

// ===== 循环科技 =====

export interface RepeatableTech {
  id: string;
  name: string;
  description: string;
  baseCost: number;
  costIncrement: number;
  researchTurns: number;
}

export const REPEATABLE_TECHS: RepeatableTech[] = [
  { id: 'RP_FOOD', name: '食物产能优化', description: '所有食物建筑产出 +5%', baseCost: 2400, costIncrement: 1200, researchTurns: 3 },
  { id: 'RP_ALLOY', name: '合金冶炼精进', description: '所有合金建筑产出 +5%', baseCost: 2400, costIncrement: 1200, researchTurns: 3 },
  { id: 'RP_STARDUST', name: '星尘捕获效率', description: '所有星尘建筑产出 +5%', baseCost: 3000, costIncrement: 1500, researchTurns: 5 },
  { id: 'RP_MATERIAL', name: '原料提纯技术', description: '所有原料建筑产出 +5%', baseCost: 3000, costIncrement: 1500, researchTurns: 5 },
  { id: 'RP_TRADE', name: '贸易网络扩展', description: '所有贸易建筑金币产出 +5%', baseCost: 2400, costIncrement: 1200, researchTurns: 3 },
  { id: 'RP_RESEARCH', name: '科研加速协议', description: '所有研究建筑产出 +10%', baseCost: 3600, costIncrement: 1800, researchTurns: 5 },
];

/** 获取循环科技当前成本 */
export function getRepeatableCost(tech: RepeatableTech, level: number): number {
  return tech.baseCost + level * tech.costIncrement;
}

/** 根据循环科技ID获取建筑类别加成倍数 */
export function getRepeatableBonus(repeatableLevels: Record<string, number>, category: string): number {
  switch (category) {
    case 'food': return 1 + (repeatableLevels['RP_FOOD'] || 0) * 0.05;
    case 'alloy': return 1 + (repeatableLevels['RP_ALLOY'] || 0) * 0.05;
    case 'stardust': return 1 + (repeatableLevels['RP_STARDUST'] || 0) * 0.05;
    case 'material': return 1 + (repeatableLevels['RP_MATERIAL'] || 0) * 0.05;
    case 'trade': return 1 + (repeatableLevels['RP_TRADE'] || 0) * 0.05;
    case 'functional': {
      const lv = repeatableLevels['RP_RESEARCH'] || 0;
      return 1 + lv * 0.10; // research buildings
    }
    default: return 1;
  }
}