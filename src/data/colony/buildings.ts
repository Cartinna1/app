import type { BuildingDef } from '@/types/colony';

/** 全部建筑定义（含科技要求） */
export const FULL_BUILDINGS: BuildingDef[] = [
  // ===== 居住类 =====
  { id: 'B1', name: '居住舱', description: '标准化殖民者居住单元，每间容纳5人。模块化设计，可堆叠扩建。', category: 'housing', costGold: 5000, buildTurns: 1, minPop: 0, maxPop: 0, powerConsumption: 2 },
  { id: 'B2', name: '穹顶都市', description: '巨型穹顶覆盖的完整社区，含内部生态循环。殖民地的骄傲。', category: 'housing', costGold: 15000, costMaterials: { silicon: 30 }, buildTurns: 3, minPop: 0, maxPop: 0, requiresTech: 'T1', powerConsumption: 2 },

  // ===== 食物生产 =====
  { id: 'B3', name: '气雾栽培舱', description: '悬浮在雾化营养液中的作物矩阵，利用大气氮氧循环种植，是殖民地的第一口粮仓。', category: 'food', costGold: 500, costMaterials: { carbon: 80 }, buildTurns: 2, minPop: 1, maxPop: 5, outputType: 'food', baseOutput: 2, popFactor: 3, powerConsumption: 1 },
  { id: 'B4', name: '蛋白质重组塔', description: '高塔内亿万纳米机器将碳基原料重组为美味蛋白，一条生产线可养活一个城镇。', category: 'food', costGold: 0, costMaterials: { carbon: 200, quantum: 10 }, buildTurns: 3, minPop: 2, maxPop: 7, outputType: 'food', baseOutput: 5, popFactor: 4, requiresTech: 'T2', powerConsumption: 2 },
  { id: 'B5', name: '生态穹顶', description: '全封闭的微型世界，拥有自循环大气与模拟季节，是荒芜星球上的翡翠。', category: 'food', costGold: 0, costMaterials: { carbon: 500, quantum: 5, dark_matter: 5 }, buildTurns: 4, minPop: 3, maxPop: 10, outputType: 'food', baseOutput: 10, popFactor: 5, requiresTech: 'T3', powerConsumption: 3 },

  // ===== 合金生产 =====
  { id: 'B6', name: '电弧熔炼炉', description: '通过可控电弧将原矿瞬间熔化，提纯出高强度结构金属，熔炉的蓝光彻夜不息。', category: 'alloy', costGold: 1000, costMaterials: { silicon: 40 }, buildTurns: 2, minPop: 1, maxPop: 3, outputType: 'alloy', baseOutput: 2, popFactor: 2, powerConsumption: 3 },
  { id: 'B7', name: '纳米铸造阵列', description: '数万枚微型机械在真空中编织金属晶格，每件成品都拥有完美分子排列。', category: 'alloy', costGold: 5000, costMaterials: { silicon: 100 }, buildTurns: 3, minPop: 2, maxPop: 4, outputType: 'alloy', baseOutput: 3, popFactor: 3, requiresTech: 'T4', powerConsumption: 4 },
  { id: 'B8', name: '星核熔炉', description: '利用微型人造奇点产生的极端重力与温度，将物质直接压锻为恒星合金。', category: 'alloy', costGold: 10000, costMaterials: { dark_matter: 10, silicon: 150 }, buildTurns: 5, minPop: 3, maxPop: 8, outputType: 'alloy', baseOutput: 5, popFactor: 4, requiresTech: 'T5', powerConsumption: 5 },

  // ===== 星尘生产 =====
  { id: 'B9', name: '星尘捕获网', description: '一张由超导丝线编织的太空巨网，专门捕捉恒星风与虚空中飘浮的星尘微粒。', category: 'stardust', costGold: 15000, buildTurns: 3, maxCount: 3, minPop: 5, maxPop: 5, outputType: 'stardust', baseOutput: 2, requiresTech: 'T6', powerConsumption: 10 },
  { id: 'B10', name: '星尘共鸣尖塔', description: '一座刺破云层的共振晶体塔，与宇宙背景辐射同频，直接召唤星尘向自身汇聚。', category: 'stardust', costGold: 30000, buildTurns: 6, maxCount: 1, minPop: 8, maxPop: 8, outputType: 'stardust', baseOutput: 4, requiresTech: 'T7', powerConsumption: 15 },

  // ===== 贸易类 =====
  { id: 'B11', name: '星际贸易节点', description: '连接超光速通讯网络的终端，在此每一笔跨星系交易都能让你抽成。', category: 'trade', costGold: 0, costAlloy: 350, costMaterials: { carbon: 100 }, buildTurns: 3, maxCount: 5, minPop: 4, maxPop: 4, outputType: 'gold', goldOutputMin: 500, goldOutputMax: 1000, powerConsumption: 2 },
  { id: 'B12', name: '泛星系金融交易所', description: '悬浮在同步轨道的环形市场，商船无需着陆即可完成交割，你从中征收星港税。', category: 'trade', costGold: 0, costAlloy: 600, costMaterials: { carbon: 200 }, buildTurns: 5, maxCount: 3, minPop: 6, maxPop: 6, outputType: 'gold', goldOutputMin: 1000, goldOutputMax: 2000, requiresTech: 'T8', powerConsumption: 3 },

  // ===== 原料生产（全部需要科技，每种限1） =====
  { id: 'B13', name: '碳氢化合物泵站', description: '钻入沉积层抽取液态碳氢化合物的脉动泵，仿佛在汲取星球黑色的血液。', category: 'material', costGold: 15000, buildTurns: 2, maxCount: 1, minPop: 1, maxPop: 3, outputType: 'material', outputMaterialId: 'oil', popFactor: 1, requiresTech: 'T9', powerConsumption: 3 },
  { id: 'B14', name: '贵金属提取器', description: '通过声波共振粉碎岩层分离出金砂，随后被磁力线俘获并铸成金条。', category: 'material', costGold: 30000, buildTurns: 2, maxCount: 1, minPop: 1, maxPop: 2, outputType: 'material', outputMaterialId: 'gold_ore', popFactor: 1, requiresTech: 'T10', powerConsumption: 3 },
  { id: 'B15', name: '碳沉积采集器', description: '竖立于冻土或古老森林中的吸碳塔，收集空气中与地表沉积的固态碳块。', category: 'material', costGold: 5000, buildTurns: 2, maxCount: 1, minPop: 1, maxPop: 3, outputType: 'material', outputMaterialId: 'carbon', popFactor: 1, requiresTech: 'T11', powerConsumption: 2 },
  { id: 'B16', name: '暗物质捕获阱', description: '深埋于行星内部的探测器阵列，捕捉那些穿透一切物质的暗物质微闪。', category: 'material', costGold: 50000, buildTurns: 3, maxCount: 1, minPop: 1, maxPop: 1, outputType: 'material', outputMaterialId: 'dark_matter', popFactor: 1, requiresTech: 'T12', powerConsumption: 4 },
  { id: 'B17', name: '量子谐振器', description: '共振晶体发出与量子涨落同频的声波，从虚空中震出亚稳态量子簇。', category: 'material', costGold: 50000, buildTurns: 3, maxCount: 1, minPop: 1, maxPop: 1, outputType: 'material', outputMaterialId: 'quantum', popFactor: 1, requiresTech: 'T13', powerConsumption: 4 },
  { id: 'B18', name: '硅晶提取站', description: '扫描整个沙漠或岩层，用激光选择性地熔化含硅矿物，冷却后即得到高纯硅晶。', category: 'material', costGold: 10000, buildTurns: 2, maxCount: 1, minPop: 1, maxPop: 3, outputType: 'material', outputMaterialId: 'silicon', popFactor: 1, requiresTech: 'T14', powerConsumption: 3 },
  { id: 'B19', name: '地壳深钻平台', description: '一座钻透地壳的移动堡垒，触及蕴藏亿万年的古老油藏。', category: 'material', costGold: 40000, buildTurns: 4, maxCount: 1, minPop: 2, maxPop: 4, outputType: 'material', outputMaterialId: 'oil', popFactor: 2, requiresTech: 'T15', powerConsumption: 5 },
  { id: 'B20', name: '碳基材料合成器', description: '将任何有机物快速热解并重组为纯碳结构材料，甚至杂草都能转化为坚固的碳块。', category: 'material', costGold: 10000, buildTurns: 3, maxCount: 1, minPop: 1, maxPop: 4, outputType: 'material', outputMaterialId: 'carbon', popFactor: 2, requiresTech: 'T16', powerConsumption: 4 },
  { id: 'B21', name: '暗物质压缩阱', description: '利用引力透镜将弥散的暗物质聚集压缩，使其变得可见并可用于提取。', category: 'material', costGold: 100000, buildTurns: 4, maxCount: 1, minPop: 1, maxPop: 2, outputType: 'material', outputMaterialId: 'dark_matter', popFactor: 2, requiresTech: 'T17', powerConsumption: 5 },
  { id: 'B22', name: '地核贵金属熔炼厂', description: '直抵地幔的深井，利用行星内热将分散的黄金熔聚成纯矿脉，再抽取至地表。', category: 'material', costGold: 60000, buildTurns: 2, maxCount: 1, minPop: 1, maxPop: 3, outputType: 'material', outputMaterialId: 'gold_ore', popFactor: 2, requiresTech: 'T18', powerConsumption: 5 },
  { id: 'B23', name: '量子晶格锻炉', description: '将谐振器捕获的量子簇放入晶格场中培育生长，最终得到稳定的大块量子晶体。', category: 'material', costGold: 80000, buildTurns: 2, maxCount: 1, minPop: 1, maxPop: 3, outputType: 'material', outputMaterialId: 'quantum', popFactor: 2, requiresTech: 'T19', powerConsumption: 5 },
  { id: 'B24', name: '硅基晶圆制造矩阵', description: '全自动的真空光刻巨构，将硅晶打磨成原子级平整的晶圆，是任何高算力芯片的母体。', category: 'material', costGold: 20000, buildTurns: 3, maxCount: 1, minPop: 2, maxPop: 4, outputType: 'material', outputMaterialId: 'silicon', popFactor: 2, requiresTech: 'T20', powerConsumption: 4 },

  // ===== 功能类 =====
  { id: 'B25', name: '研究实验室', description: '装备了最先进分析仪器的研究中心，每一位科学家都在推进文明的知识边界。', category: 'functional', costGold: 8000, buildTurns: 1, minPop: 1, maxPop: 5, outputType: 'research', baseOutput: 0, popFactor: 20, powerConsumption: 4 },
  { id: 'B26', name: '量子实验室', description: '接近绝对零度的量子计算与实验设施，将研究实验室的产出效率倍增。', category: 'functional', costGold: 15000, buildTurns: 3, maxCount: 1, minPop: 5, maxPop: 5, requiresTech: 'T21', powerConsumption: 5 },
  { id: 'B27', name: '星河议政厅', description: '殖民地行政中枢，解锁招募领袖的功能。', category: 'functional', costGold: 10000, buildTurns: 1, maxCount: 1, minPop: 0, maxPop: 0, powerConsumption: 2 },
  { id: 'B28', name: '克隆中心', description: '生物克隆设施，加速人口增长。存在伦理争议——但在殖民前线，实用主义压倒一切。', category: 'functional', costGold: 30000, buildTurns: 3, maxCount: 1, minPop: 1, maxPop: 1, requiresTech: 'T22', powerConsumption: 3 },

  // ===== 电能生产 =====
  { id: 'B29', name: '太阳能阵列', description: '铺设在殖民地外围的巨型光伏矩阵，利用恒星辐射为基地提供基础电力。转化效率不高，但建造简单、无需原料。', category: 'power', costGold: 5000, costMaterials: { silicon: 50 }, buildTurns: 2, maxCount: 4, minPop: 1, maxPop: 3, outputType: 'power', baseOutput: 5, popFactor: 5, powerConsumption: 0 },
  { id: 'B30', name: '聚变电站', description: '磁约束等离子体核心反应炉，将轻元素直接转化为巨量热能发电。殖民地从矿石社会迈向工业文明的真正标志。', category: 'power', costGold: 15000, costAlloy: 100, costMaterials: { quantum: 50 }, buildTurns: 4, maxCount: 2, minPop: 2, maxPop: 5, outputType: 'power', baseOutput: 8, popFactor: 8, requiresTech: 'T26', powerConsumption: 0 },
  { id: 'B31', name: '反物质反应堆', description: '悬浮在真空舱内的反质子环——每一毫克反物质湮灭释放的能量足以驱动整座城市。建造代价极高，但让电能不再成为制约。', category: 'power', costGold: 60000, costMaterials: { dark_matter: 150 }, buildTurns: 6, maxCount: 1, minPop: 3, maxPop: 8, outputType: 'power', baseOutput: 12, popFactor: 12, requiresTech: 'T27', powerConsumption: 0 },
];

/** 根据ID获取建筑定义 */
export function getBuildingDef(id: string): BuildingDef | undefined {
  return FULL_BUILDINGS.find((b) => b.id === id);
}

/** 获取当前可建造的建筑（已满足科技要求） */
export function getBuildableBuildings(researchedIds: string[]): BuildingDef[] {
  return FULL_BUILDINGS.filter((b) => !b.requiresTech || researchedIds.includes(b.requiresTech));
}

/** 获取建筑产出效果描述（用于科技解锁提示） */
export function getBuildingEffect(bd: BuildingDef): string {
  const min = bd.minPop, max = bd.maxPop;
  // 功能类特殊建筑
  if (bd.id === 'B1') return '提供5人口上限';
  if (bd.id === 'B2') return '提供额外10人口上限';
  if (bd.id === 'B26') return '使所有研究实验室产出翻倍';
  if (bd.id === 'B27') return '解锁领袖招募功能';
  if (bd.id === 'B28') return '每回合自动招募1人口';
  if (bd.category === 'housing') return '提供居住空间，提升人口上限';
  if (bd.category === 'power') {
    const lo = (bd.baseOutput || 0) + (bd.popFactor || 0) * bd.minPop;
    const hi = (bd.baseOutput || 0) + (bd.popFactor || 0) * bd.maxPop;
    return bd.minPop === bd.maxPop ? `每回合产出${lo}电能` : `${bd.minPop}人产出${lo}电能，满人${bd.maxPop}人产出${hi}电能`;
  }
  if (min === 0 && max === 0) return '功能建筑';

  const base = bd.baseOutput || 0;
  const pf = bd.popFactor || 0;

  switch (bd.outputType) {
    case 'food':
    case 'alloy': {
      const unit = bd.outputType === 'food' ? '食物' : '合金';
      const lo = base + pf * min, hi = base + pf * max;
      return min === max ? `每回合产出${lo}${unit}` : `${min}人产出${lo}${unit}，满人${max}人产出${hi}${unit}`;
    }
    case 'stardust':
      return `每回合产出${base}星尘（固定产出）`;
    case 'gold':
      return `每回合产出${bd.goldOutputMin}~${bd.goldOutputMax}金币`;
    case 'material': {
      const mat = { carbon: '碳块', gold_ore: '金矿', oil: '石油', silicon: '硅片', dark_matter: '暗物质', quantum: '量子簇' }[bd.outputMaterialId || ''] || '原料';
      const lo = base + pf * min, hi = base + pf * max;
      return min === max ? `每回合产出${lo}${mat}` : `${min}人产出${lo}${mat}，满人${max}人产出${hi}${mat}`;
    }
    case 'research': {
      const lo = base + pf * min, hi = base + pf * max;
      return `${min}人产出${lo}科研点，满人${max}人产出${hi}科研点`;
    }
    default:
      return '功能建筑';
  }
}
