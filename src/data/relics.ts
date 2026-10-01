import type { Relic } from '@/types/game';

// 遗物 ID 常量（单一真值：逻辑层按遗物效果判断一律引用，勿硬编码字符串）
export const RELIC_CRYSTAL = 'r_001';            // 奥得律斯基亚水晶：每回合3个随机原料
export const RELIC_TRANSCRIBER = 'r_002';        // 誊录仪：每回合+1%总资产金币
export const RELIC_STABILITY_ANCHOR = 'r_003';   // 时空稳定锚：生产上限+2
export const RELIC_STAR_COMPASS = 'r_004';       // 星际罗盘：原料购买9折
export const RELIC_DICE = 'r_005';               // 命运之骰：事件金币收益+20%、损失-20%
export const RELIC_RESONANCE_STONE = 'r_006';    // 星灵共鸣石：每回合+2星尘
export const RELIC_FOOD_PRESERVER = 'r_007';     // 食物保鲜舱：船员食物消耗减半
export const RELIC_ALLOY_MANUAL = 'r_008';       // 合金精炼手册：所有合金建筑产出+1合金
export const RELIC_DECIPHERER = 'r_009';         // 情报破译器：走私订单成功率100%
export const RELIC_JUMP_ACCELERATOR = 'r_010';   // 跃迁加速器：跃迁回合额外-1
export const RELIC_VOID_SAFE = 'r_011';          // 虚空保险箱：免疫金币损失类事件
export const RELIC_CLONE_DISH = 'r_012';         // 克隆培养皿：每回合+5食物
export const RELIC_LUCKY_CAT = 'r_013';          // 招财猫摆件：每回合+200金币
export const RELIC_ANTI_MONOPOLY = 'r_014';      // 反垄断法案：特产卖出价格+10%
export const RELIC_BARGAIN_AI = 'r_015';         // 讨价还价AI机器人：买特产价格打9折

// ===== 考古专属遗物（只能通过遗迹发掘获得，见 data/galaxy/archaeology.ts） =====
export const RELIC_RESONANCE_FORK = 'r_016';     // 共鸣音叉：每回合+3星尘
export const RELIC_UNFINISHED_MIRROR = 'r_017';  // 未完成的镜：每回合+2科研点
export const RELIC_DEEP_DRILL = 'r_018';         // 深层钻头：所有原料建筑产出+1
export const RELIC_ARBITRAGE_NOTE = 'r_019';     // 套利凭证：卖出特产+5%金币
export const RELIC_SEVENTH_LAYER = 'r_020';      // 第七层手稿：考古阶段成功率+10%
export const RELIC_BLANK_IDOL = 'r_021';         // 空白神像：全部建筑产出+10%

/**
 * 遗物数据 - 共15个
 * 效果必须可在代码中实现（通过relicId判断）
 */
export const ALL_RELICS: Relic[] = [
  // ===== 原始5个 =====
  {
    id: RELIC_CRYSTAL,
    name: '奥得律斯基亚水晶',
    description: '散发着柔和蓝光的远古水晶，蕴含着生命创造之力',
    effect: '每回合随机获得3个原料',
    stardustCost: 42,
  },
  {
    id: RELIC_TRANSCRIBER,
    name: '誊录仪',
    description: '自动记录所有交易并从中提炼财富的智慧装置',
    effect: '每回合增加你所有财富值1%的金币',
    stardustCost: 350,
  },
  {
    id: RELIC_STABILITY_ANCHOR,
    name: '时空稳定锚',
    description: '锚定局部时空流速，让生产线的效率翻倍',
    effect: '每回合生产次数上限+2',
    stardustCost: 32,
  },
  {
    id: RELIC_STAR_COMPASS,
    name: '星际罗盘',
    description: '指向最有价值的星际航线，让你总能找到最好的交易',
    effect: '原料购买价格额外打9折',
    stardustCost: 28,
  },
  {
    id: RELIC_DICE,
    name: '命运之骰',
    description: '一颗永远停在六面的骰子，为持有者带来好运',
    effect: '所有事件金币收益+20%，损失-20%',
    stardustCost: 38,
  },

  // ===== 新增10个 =====
  {
    id: RELIC_RESONANCE_STONE,
    name: '星灵共鸣石',
    description: '与星尘产生共鸣的神秘宝石，能自动聚集星尘粒子',
    effect: '每回合+2星尘',
    stardustCost: 150,
  },
  {
    id: RELIC_FOOD_PRESERVER,
    name: '食物保鲜舱',
    description: '利用量子冻结技术保存食物，几乎零损耗',
    effect: '船员食物消耗减少50%',
    stardustCost: 55,
  },
  {
    id: RELIC_ALLOY_MANUAL,
    name: '合金精炼手册',
    description: '记录了古代合金精炼技术的全息手册',
    effect: '所有合金建筑产出+1合金',
    stardustCost: 50,
  },
  {
    id: RELIC_DECIPHERER,
    name: '情报破译器',
    description: '能破解海关缉私系统的加密信号，让走私订单万无一失',
    effect: '走私订单成功率提升至100%',
    stardustCost: 100,
  },
  {
    id: RELIC_JUMP_ACCELERATOR,
    name: '跃迁加速器',
    description: '与引力锚定器共鸣，进一步缩短跃迁时间',
    effect: '跃迁回合额外-1（可与引力锚定器叠加，最少1回合）',
    stardustCost: 58,
  },
  {
    id: RELIC_VOID_SAFE,
    name: '虚空保险箱',
    description: '存放在异次元空间的保险箱，海盗无法触及',
    effect: '免疫所有金币损失类事件（直接免疫惩罚事件中的金币损失）',
    stardustCost: 200,
  },
  {
    id: RELIC_CLONE_DISH,
    name: '克隆培养皿',
    description: '自动培养食用菌落的培养皿',
    effect: '每回合+5食物',
    stardustCost: 70,
  },
  {
    id: RELIC_LUCKY_CAT,
    name: '招财猫摆件',
    description: '据说能带来财运的古董摆件',
    effect: '每回合+200金币',
    stardustCost: 12,
  },
  {
    id: RELIC_ANTI_MONOPOLY,
    name: '反垄断法案',
    description: '银河联邦特别授予的贸易特权证书',
    effect: '特产卖出价格额外+10%',
    stardustCost: 100,
  },
  {
    id: RELIC_BARGAIN_AI,
    name: '讨价还价AI机器人',
    description: '精通银河议价话术的AI谈判官，总能把特产价格谈到最低',
    effect: '购买特产价格打9折',
    stardustCost: 30,
  },
];

/**
 * 考古专属遗物（r_016~r_021）
 * 只作为遗迹发掘的最终奖励发放，**不进星尘集市**（rollRelic 只从 ALL_RELICS 抽取）。
 * stardustCost 固定 0 = 非卖品。
 */
export const ARCHAEOLOGY_RELICS: Relic[] = [
  {
    id: RELIC_RESONANCE_FORK,
    name: '共鸣音叉',
    description: '无声钟楼里唯一还能发出声音的部件，被拆下时仍在极轻地振动',
    effect: '每回合 +3 星尘',
    stardustCost: 0,
  },
  {
    id: RELIC_UNFINISHED_MIRROR,
    name: '未完成的镜',
    description: '磨镜者留下的最后一面镜坯，表面只磨到了一半，却已经能照出结论',
    effect: '每回合 +2 科研点',
    stardustCost: 0,
  },
  {
    id: RELIC_DEEP_DRILL,
    name: '深层钻头',
    description: '深掘者用来啃开行星外壳的钻头，碳壳在它面前像湿土',
    effect: '所有原料建筑产出 +1',
    stardustCost: 0,
  },
  {
    id: RELIC_ARBITRAGE_NOTE,
    name: '套利凭证',
    description: '汇兑者网络里最后一张仍在计息的凭证，签名栏空着，谁持有就归谁',
    effect: '卖出特产额外 +5% 金币',
    stardustCost: 0,
  },
  {
    id: RELIC_SEVENTH_LAYER,
    name: '第七层手稿',
    description: '倏忽人碑林最深处那一层的抄本，记的是如何把话说给时间听',
    effect: '考古阶段成功率 +10%',
    stardustCost: 0,
  },
  {
    id: RELIC_BLANK_IDOL,
    name: '空白神像',
    description: '华胥人留下的最后一尊神像，脸上什么都没有刻，却谁都认得出来',
    effect: '全部建筑产出 +10%',
    stardustCost: 0,
  },
];

// 随机生成一个遗物（用于星尘集市每日刷新；只出集市款）

export function rollRelic(excludeIds: string[] = []): Relic | null {
  const pool = ALL_RELICS.filter((r) => !excludeIds.includes(r.id));
  if (pool.length === 0) return null;
  return pool[Math.floor(Math.random() * pool.length)];
}

// 根据ID获取遗物（含考古专属遗物，供 UI 反查名称/描述）
export function getRelicById(id: string): Relic | undefined {
  return ALL_RELICS.find((r) => r.id === id) || ARCHAEOLOGY_RELICS.find((r) => r.id === id);
}
