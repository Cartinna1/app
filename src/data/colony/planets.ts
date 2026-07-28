import type { PlanetDef } from '@/types/colony';

export const ALL_PLANETS: PlanetDef[] = [
  {
    id: 'desert',
    name: '沙漠星球',
    description: '干燥的沙漠世界，有氮氧大气层，几乎没有大片水体或者降水存在。昼夜温差巨大。很少有植物，但只要有适量降雨就能使沙漠变得生机勃勃。',
    buffs: {
      alloyMult: 1.40, // 电弧熔炼炉B6/星核熔炉B8 +40%
      materialMults: { silicon: 1.30 }, // 硅片+30%
      foodMult: 0.75, // 食物-25%
    },
  },
  {
    id: 'ocean',
    name: '海洋星球',
    description: '一颗被无垠海洋包裹的蓝色宝石。氮氧大气层，洋面覆盖率97%。陆地仅存在于少数火山岛链和珊瑚环礁。',
    buffs: {
      foodMult: 1.80, // 食物+80%
      buildCostMult: 1.10, // 造价+10%
    },
  },
  {
    id: 'polar',
    name: '极地星球',
    description: '永恒的冰雪世界。氮氧大气层，极地冰盖覆盖85%地表。赤道地区有稀疏针叶林和季节性融冰河流。',
    buffs: {
      researchMult: 1.0, // 低温超导：研究减1回合（Phase 2实现）
      stardustMult: 1.30, // 星尘+30%
      foodConsumptionDelta: 1, // 每人+1食物消耗
      buildTurnDelta: 1, // 建造+1回合
    },
  },
  {
    id: 'arid',
    name: '干旱星球',
    description: '干旱的岩石世界，有氮氧大气层，表面多是峭壁和峡谷。可以在气候更加温和的极地地区发现树林，但其它植物比较稀缺。',
    buffs: {
      alloyMult: 1.60, // 合金+60%
      materialMults: { gold_ore: 1.60 }, // 黄金+60%
      foodMult: 0.60, // 食物-40%
    },
  },
  {
    id: 'terran',
    name: '陆地星球',
    description: '有氮氧大气层的岩石世界，存在稳定的水源，有被海洋分割开的大陆，随经纬度不同有不同的季节温度。',
    buffs: {
      initialPopCap: 10, // 初始上限10
      initialPop: 3, // 自带3人口
    },
  },
  {
    id: 'alpine',
    name: '高山星球',
    description: '一个充满氮氧大气层的山地世界。积雪终年将山顶覆盖而山谷中充满着被冻结的湖泊。',
    buffs: {
      researchMult: 1.80, // 研究实验室产出+80%
      materialMults: { carbon: 1.30, gold_ore: 1.20 },
      buildCostMult: 1.20, // 造价+20%
    },
  },
  {
    id: 'savannah',
    name: '草原星球',
    description: '有氮氧大气层的岩石世界，有大片的平原存在。水源较少，只有短暂的雨季。',
    buffs: {
      materialMults: { oil: 1.80 }, // 石油+80%
      leaderCostDelta: -1, // 领袖招募-1星尘
      foodMult: 0.80, // 食物-20%
    },
  },
  {
    id: 'tropical',
    name: '热带星球',
    description: '有厚重氮氧大气层的潮湿岩石世界，气候变化巨大，旱季和雨季交替明显。绝大部分的大陆上都覆盖着茂盛的植被。',
    buffs: {
      foodMult: 1.60, // 食物+60%
      materialMults: { carbon: 2.00 }, // 碳块+100%
      buildCostMult: 1.10, // 造价+10%
    },
  },
  {
    id: 'tundra',
    name: '苔原星球',
    description: '一颗寒冷的岩态星球，大气充斥着氮氧元素。除了更温和的赤道地区以外，大部分地表都被永久冻土层覆盖。',
    buffs: {
      materialMults: { quantum: 1.40, dark_matter: 1.40 }, // 量子簇+40%,暗物质+40%
      recruitCostDelta: 700, // 招募费用+700→2700一个
    },
  },
  {
    id: 'ruin',
    name: '遗落星球',
    description: '这个星球表面曾经被完全被单一城市所覆盖。如今这里只有废弃的古老遗迹，其原住民早已离去。',
    buffs: {
      specialEffects: ['初始拥有一座已建造完成的纳米铸造阵列B7、碳基材料合成器B20与暗物质压缩阱B21', '一级居住舱B1人口上限变为+3'],
    },
  },
];

export function getPlanetById(id: string): PlanetDef | undefined {
  return ALL_PLANETS.find((p) => p.id === id);
}
