import type { ResearchTech } from '@/types/colony';

export const ALL_TECHS: ResearchTech[] = [
  // ===== T1 都市级穹顶理论 =====
  { id: 'T1', name: '都市级穹顶理论', unlocksBuilding: 'B2',
    description: '"我们不再栖身于穹顶之下，我们让穹顶成为天空。"将生态穹顶的微缩循环逻辑，以城市尺度进行数学重构。',
    costRP: 300, researchTurns: 2, prerequisites: [] },
  // ===== T2 碳基重组法则 =====
  { id: 'T2', name: '碳基重组法则', unlocksBuilding: 'B4',
    description: '"蛋白质不再是生长出来的，而是��计算出来的。"纳米机械将碳基原料重组为美味高能蛋白质。',
    costRP: 360, researchTurns: 2, prerequisites: [] },
  // ===== T3 盖亚蓝图 =====
  { id: 'T3', name: '盖亚蓝图', unlocksBuilding: 'B5',
    description: '"世界是一个可以复制的花园。"完整的大气循环、水文模型与物种共生矩阵，在荒芜星球上建造自循环生态穹顶。',
    costRP: 1800, researchTurns: 3, prerequisites: ['T2'] },
  // ===== T4 晶格冶金学 =====
  { id: 'T4', name: '晶格冶金学', unlocksBuilding: 'B7',
    description: '"金属记住了星辰的锻造术。"重新定义金属分子晶格排列，产出的材料能承受恒星风暴。',
    costRP: 400, researchTurns: 2, prerequisites: [] },
  // ===== T5 星核工业原理 =====
  { id: 'T5', name: '星核工业原理', unlocksBuilding: 'B8',
    description: '"我们驯服了奇点，让它成为铁砧。"利用微型人造奇点将物质压锻为恒星合金。',
    costRP: 2000, researchTurns: 3, prerequisites: ['T4'] },
  // ===== T6 星尘感知理论 =====
  { id: 'T6', name: '星尘感知理论', unlocksBuilding: 'B9',
    description: '"虚空从不虚空，它在低语。"解读宇宙微波背景辐射中的星尘涟漪，制造超导丝线巨网。',
    costRP: 2300, researchTurns: 4, prerequisites: ['T1', 'T2', 'T4'] },
  // ===== T7 星尘共鸣学说 =====
  { id: 'T7', name: '星尘共鸣学说', unlocksBuilding: 'B10',
    description: '"宇宙是一首宏大的交响诗，我们可以加入合唱。"让星尘跨越光年自动汇聚。',
    costRP: 5000, researchTurns: 6, prerequisites: ['T6', 'T3', 'T5'] },
  // ===== T8 泛星系金融律法 =====
  { id: 'T8', name: '泛星系金融律法', unlocksBuilding: 'B12',
    description: '"市场是看不见的巨兽，律法是拴住它的缰绳。"量子加密合约与稀有资源期货的超级算法法典。',
    costRP: 390, researchTurns: 2, prerequisites: [] },
  // ===== T9 异星地质沉积学 =====
  { id: 'T9', name: '异星地质沉积学', unlocksBuilding: 'B13',
    description: '"每一颗星球都用自己的方式书写历史，我们只是学会了阅读。"破解碳氢化合物形成密码。',
    costRP: 490, researchTurns: 3, prerequisites: [] },
  // ===== T10 行星声波共振勘探理论 =====
  { id: 'T10', name: '行星声波共振勘探理论', unlocksBuilding: 'B14',
    description: '"我们用声音去触碰大地深处的心��。"声波共振定位贵金属矿脉。',
    costRP: 900, researchTurns: 2, prerequisites: ['T11'] },
  // ===== T11 大气碳循环解析模型 =====
  { id: 'T11', name: '大气碳循环解析模型', unlocksBuilding: 'B15',
    description: '"碳是宇宙的货币，大气是它的账本。"精准预测碳沉积物富集区域。',
    costRP: 300, researchTurns: 2, prerequisites: [] },
  // ===== T12 暗物质粒子通量假说 =====
  { id: 'T12', name: '暗物质粒子通量假说', unlocksBuilding: 'B16',
    description: '"宇宙质量的百分之八十五在黑暗中流淌，我们决定不再视而不见。"捕捉暗物质微闪。',
    costRP: 1500, researchTurns: 3, prerequisites: ['T10'] },
  // ===== T13 亚稳态量子涨落观测理论 =====
  { id: 'T13', name: '亚稳态量子涨落观测理论', unlocksBuilding: 'B17',
    description: '"虚空从不静止，它在沸腾。我们终于看到了泡沫。"从虚空震出零点能。',
    costRP: 1400, researchTurns: 3, prerequisites: [] },
  // ===== T14 选择性激光熔析原理 =====
  { id: 'T14', name: '选择性激光熔析原理', unlocksBuilding: 'B18',
    description: '"沙粒中藏着芯片的灵魂，我们只需要把它唤醒。"分离硅晶的精准光学手术。',
    costRP: 320, researchTurns: 2, prerequisites: [] },
  // ===== T15 深地层渗透技术 =====
  { id: 'T15', name: '深地层渗透技术', unlocksBuilding: 'B19',
    description: '"我们刺穿行星的皮肤，去倾听它黑色的心跳。"钻入地壳提取液态碳氢化合物。',
    costRP: 1400, researchTurns: 3, prerequisites: ['T9'] },
  // ===== T16 碳基重组工程 =====
  { id: 'T16', name: '碳基重组工程', unlocksBuilding: 'B20',
    description: '"一切碳基皆可为燃料，一切生命皆可为基石。"任何有机物重组成高密度碳块。',
    costRP: 1000, researchTurns: 2, prerequisites: ['T11'] },
  // ===== T17 暗物质相互作用模型 =====
  { id: 'T17', name: '暗物质相互作用模型', unlocksBuilding: 'B21',
    description: '"我们终于看见了那些从不与光共舞的幽灵。"捕捉穿透一切物质的暗物质微闪。',
    costRP: 2500, researchTurns: 4, prerequisites: ['T12'] },
  // ===== T18 地核熔炼工程 =====
  { id: 'T18', name: '地核熔炼工程', unlocksBuilding: 'B22',
    description: '"黄金不是挖掘出来的，而是从地心泵取出来的。"利用行星内热熔聚贵金属。',
    costRP: 1300, researchTurns: 3, prerequisites: ['T10'] },
  // ===== T19 量子晶格生长原理 =====
  { id: 'T19', name: '量子晶格生长原理', unlocksBuilding: 'B23',
    description: '"我们将量子幽灵培养成了晶体。"在宏观尺度培育稳定量子晶体。',
    costRP: 2200, researchTurns: 3, prerequisites: ['T13'] },
  // ===== T20 单原子精度制造协议 =====
  { id: 'T20', name: '单原子精度制造协议', unlocksBuilding: 'B24',
    description: '"���美的世界，从一个完美的原子开始。"原子级硅晶圆制造自动化协议。',
    costRP: 1250, researchTurns: 3, prerequisites: ['T14'] },
  // ===== T21 实用量子力学体系 =====
  { id: 'T21', name: '实用量子力学体系', unlocksBuilding: 'B26',
    description: '"在这里，现实只是一条可以被重写��代码。"量子实验室配备了超低温量子比特阵列。',
    costRP: 2700, researchTurns: 3, prerequisites: ['T12'] },
  // ===== T22 加速表型复制协议 =====
  { id: 'T22', name: '加速表型复制协议', unlocksBuilding: 'B28',
    description: '"一具能挥动镐头的躯体，我们只需要它的基因组。"数周内培育完全成熟的克隆体。',
    costRP: 3000, researchTurns: 4, prerequisites: ['T3'] },
  // ===== T23 星际贤才招募法案 =====
  { id: 'T23', name: '星际贤才招募法案', leaderCapBonus: 1,
    description: '"银河广阔，人才不应被数字埋没。"跨星域精英搜寻与快速归化法案。',
    costRP: 1000, researchTurns: 3, prerequisites: [] },
  // ===== T24 集体意识协同网络 =====
  { id: 'T24', name: '集体意识协同网络', leaderCapBonus: 3,
    description: '"我们不再指挥个体，我们编织灵魂的网络。"量子纠缠态群体神经接口。',
    costRP: 2000, researchTurns: 5, prerequisites: ['T23'] },
];

export function getTechById(id: string): ResearchTech | undefined {
  return ALL_TECHS.find((t) => t.id === id);
}

export function getAvailableTechs(researchedIds: string[]): ResearchTech[] {
  return ALL_TECHS.filter((t) =>
    !researchedIds.includes(t.id) &&
    t.prerequisites.every((p) => researchedIds.includes(p))
  );
}
