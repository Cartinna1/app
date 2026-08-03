import type { PlanetDef } from '@/types/colony';

export const ALL_PLANETS: PlanetDef[] = [
  {
    id: 'desert',
    name: '沙漠星球',
    description: '干燥的沙漠世界，有氮氧大气层，几乎没有大片水体或者降水存在。昼夜温差巨大。很少有植物，但只要有适量降雨就能使沙漠变得生机勃勃。',
    buffs: {
      alloyMult: 1.50, // 合金 +50%
      foodMult: 0.70, // 食物 −30%
      powerGenMult: 1.50, // 太阳能 +50%
      powerUseMult: 1.10, // 功耗 +10%
    },
  },
  {
    id: 'ocean',
    name: '海洋星球',
    description: '一颗被无垠海洋包裹的蓝色宝石。氮氧大气层，洋面覆盖率97%。陆地仅存在于少数火山岛链和珊瑚环礁。',
    buffs: {
      foodMult: 1.60, // 食物 +60%（原1.80）
      tradeMult: 1.20, // 贸易 +20%
      buildCostMult: 1.20, // 造价 +20%（原1.10）
      powerUseMult: 1.20, // 功耗 +20%
    },
  },
  {
    id: 'polar',
    name: '极地星球',
    description: '永恒的冰雪世界。氮氧大气层，极地冰盖覆盖85%地表。赤道地区有稀疏针叶林和季节性融冰河流。',
    buffs: {
      stardustMult: 1.30, // 星尘 +30%
      researchMult: 1.0, // 科研回合 -1（低温超导，在processColonyTurn中实现）
      foodConsumptionDelta: 1, // 每人+1食物消耗
      buildTurnDelta: 1, // 建造+1回合
    },
  },
  {
    id: 'arid',
    name: '干旱星球',
    description: '干旱的岩石世界，有氮氧大气层，表面多是峭壁和峡谷。可以在气候更加温和的极地地区发现树林，但其它植物比较稀缺。',
    buffs: {
      alloyMult: 1.60, // 合金 +60%
      materialMults: { gold_ore: 1.60 }, // 黄金 +60%
      foodMult: 0.80, // 食物 −20%（原0.60）
      powerGenMult: 0.80, // 太阳能 −20%
    },
  },
  {
    id: 'terran',
    name: '陆地星球',
    description: '有氮氧大气层的岩石世界，存在稳定的水源，有被海洋分割开的大陆，随经纬度不同有不同的季节温度。',
    buffs: {
      initialPopCap: 10, // 初始上限10
      initialPop: 5, // 自带5人口（原3）
      powerGenMult: 1.20, // 太阳能 +20%
      buildCostMult: 1.10, // 造价 +10%
      alloyMult: 0.80, // 合金 −20%
    },
  },
  {
    id: 'alpine',
    name: '高山星球',
    description: '一个充满氮氧大气层的山地世界。积雪终年将山顶覆盖而山谷中充满着被冻结的湖泊。',
    buffs: {
      researchMult: 1.80, // 研究实验室产出 +80%
      materialMults: { carbon: 1.40 }, // 碳块 +40%
      buildCostMult: 1.20, // 造价 +20%
      powerGenMult: 0.80, // 太阳能 −20%
    },
  },
  {
    id: 'savannah',
    name: '草原星球',
    description: '有氮氧大气层的岩石世界，有大片的平原存在。水源较少，只有短暂的雨季。',
    buffs: {
      materialMults: { oil: 1.80 }, // 石油 +80%
      powerGenMult: 1.20, // 太阳能 +20%
      foodMult: 0.80, // 食物 −20%
      buildTurnDelta: 1, // 建造 +1回合
    },
  },
  {
    id: 'tropical',
    name: '热带星球',
    description: '有厚重氮氧大气层的潮湿岩石世界，气候变化巨大，旱季和雨季交替明显。绝大部分的大陆上都覆盖着茂盛的植被。',
    buffs: {
      foodMult: 1.60, // 食物 +60%
      materialMults: { carbon: 2.00 }, // 碳块 +100%
      buildCostMult: 1.20, // 造价 +20%（原1.10）
      powerGenMult: 0.70, // 太阳能 −30%
    },
  },
  {
    id: 'tundra',
    name: '苔原星球',
    description: '一颗寒冷的岩态星球，大气充斥着氮氧元素。除了更温和的赤道地区以外，大部分地表都被永久冻土层覆盖。',
    buffs: {
      materialMults: { quantum: 1.60, dark_matter: 1.60 }, // 量子 +60%（原1.40）,暗物质 +60%（原1.40）
      recruitCostDelta: 500, // 招募 +500G（原700）
      foodMult: 0.90, // 食物 −10%
    },
  },
  {
    id: 'ruin',
    name: '遗落星球',
    description: '这个星球表面曾经被完全被单一城市所覆盖。如今这里只有废弃的古老遗迹，其原住民早已离去。',
    buffs: {
      specialEffects: ['初始拥有一座已建造完成的纳米铸造阵列、碳基材料合成器与暗物质压缩阱', '每栋居住舱额外提供 3 人口上限'],
      buildTurnDelta: 1, // 建造 +1回合
      powerUseMult: 1.10, // 功耗 +10%
    },
  },
];

export function getPlanetById(id: string): PlanetDef | undefined {
  return ALL_PLANETS.find((p) => p.id === id);
}
