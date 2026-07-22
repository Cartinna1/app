import type { Relic } from '@/types/game';

/**
 * 遗物数据 - 共15个
 * 效果必须可在代码中实现（通过relicId判断）
 */
export const ALL_RELICS: Relic[] = [
  // ===== 原始5个（保留以兼容旧存档，但不再通过兑换码获取）=====
  {
    id: 'r_001',
    name: '奥得律斯基亚水晶',
    description: '散发着柔和蓝光的远古水晶，蕴含着生命创造之力',
    effect: '每回合随机获得3个原料',
    stardustCost: 10,
  },
  {
    id: 'r_002',
    name: '誊录仪',
    description: '自动记录所有交易并从中提炼财富的智慧装置',
    effect: '每回合增加你所有财富值1%的金币',
    stardustCost: 25,
  },
  {
    id: 'r_003',
    name: '时空稳定锚',
    description: '锚定局部时空流速，让生产线的效率翻倍',
    effect: '每回合生产次数上限+2',
    stardustCost: 8,
  },
  {
    id: 'r_004',
    name: '星际罗盘',
    description: '指向最有价值的星际航线，让你总能找到最好的交易',
    effect: '原料购买价格额外打9折',
    stardustCost: 6,
  },
  {
    id: 'r_005',
    name: '命运之骰',
    description: '一颗永远停在六面的骰子，为持有者带来好运',
    effect: '所有事件金币收益+20%，损失-20%',
    stardustCost: 10,
  },

  // ===== 新增10个 =====
  {
    id: 'r_006',
    name: '星灵共鸣石',
    description: '与星尘产生共鸣的神秘宝石，能自动聚集星尘粒子',
    effect: '每回合+2星尘',
    stardustCost: 60,
  },
  {
    id: 'r_007',
    name: '食物保鲜舱',
    description: '利用量子冻结技术保存食物，几乎零损耗',
    effect: '每回合食物消耗减少50%',
    stardustCost: 18,
  },
  {
    id: 'r_008',
    name: '合金精炼手册',
    description: '记录了古代合金精炼技术的全息手册',
    effect: '所有合金熔炉产出+1合金',
    stardustCost: 15,
  },
  {
    id: 'r_009',
    name: '情报破译器',
    description: '能破译加密市场信号，提高情报准确度',
    effect: '情报兑现率从60%提升至85%',
    stardustCost: 11,
  },
  {
    id: 'r_010',
    name: '跃迁加速器',
    description: '与引力锚定器共鸣，进一步缩短跃迁时间',
    effect: '跃迁回合额外-1（可与引力锚定器叠加，最少1回合）',
    stardustCost: 19,
  },
  {
    id: 'r_011',
    name: '虚空保险箱',
    description: '存放在异次元空间的保险箱，海盗无法触及',
    effect: '免疫所有金币损失类事件（直接免疫惩罚事件中的金币损失）',
    stardustCost: 30,
  },
  {
    id: 'r_012',
    name: '克隆培养皿',
    description: '自动培养食用菌落的培养皿',
    effect: '每回合+5食物',
    stardustCost: 25,
  },
  {
    id: 'r_013',
    name: '招财猫摆件',
    description: '据说能带来财运的古董摆件',
    effect: '每回合+200金币',
    stardustCost: 3,
  },
  {
    id: 'r_014',
    name: '反垄断法案',
    description: '银河联邦特别授予的贸易特权证书',
    effect: '特产卖出价格额外+10%',
    stardustCost: 35,
  },
  {
    id: 'r_015',
    name: '量子望远镜',
    description: '能看透股价走势的量子观测设备',
    effect: '情报获取概率+20%（事件奖励中更容易获得情报类奖励）',
    stardustCost: 7,
  },
];

// 随机生成一个遗物（用于星尘集市每日刷新）
import { rng } from '@/utils/prng';

export function rollRelic(excludeIds: string[] = []): Relic | null {
  const pool = ALL_RELICS.filter((r) => !excludeIds.includes(r.id));
  if (pool.length === 0) return null;
  return pool[Math.floor(rng() * pool.length)];
}

// 根据ID获取遗物
export function getRelicById(id: string): Relic | undefined {
  return ALL_RELICS.find((r) => r.id === id);
}
