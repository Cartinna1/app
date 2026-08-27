import type { ModuleDefinition } from '@/types/game';
import { RELIC_STABILITY_ANCHOR, RELIC_STAR_COMPASS } from './relics';

// 母舰装置 ID 常量（单一真值：逻辑层按装置效果判断一律引用，勿硬编码字符串）
export const MODULE_BIO_KITCHEN = 'bio_kitchen';
export const MODULE_NANO_FARM = 'nano_farm';
export const MODULE_SIXTH_FARM = 'sixth_farm';
export const MODULE_RESERVE_BAY = 'reserve_bay';
export const MODULE_MINING_ARRAY = 'mining_array';
export const MODULE_TRADE_HUB = 'trade_hub';
export const MODULE_ENGINEER_AI = 'engineer_ai';
export const MODULE_DYSON_COLLECTOR = 'dyson_collector';
export const MODULE_PROD_SCHEDULER = 'prod_scheduler';
export const MODULE_PARALLEL_MATRIX = 'parallel_matrix';
export const MODULE_AUTOMATION_HUB = 'automation_hub';

/**
 * 母舰装置定义 — 共15种
 * 每种只能造1个
 */
export const MODULE_DEFINITIONS: ModuleDefinition[] = [
  // ===== 基础装置 =====
  {
    id: MODULE_BIO_KITCHEN,
    name: '生物合成厨房',
    description: '每回合自动产出 15 食物，维持船员生存的基础设施',
    costFood: 0,
    costAlloy: 5,
    costStardust: 0,
    effectType: 'per_turn',
    cooldown: 0,
    effectDescription: '每回合 +15 食物',
  },
  {
    id: MODULE_NANO_FARM,
    name: '纳米机器人农场',
    description: '部署纳米机器人群体自动化种植，每回合产出30食物',
    costFood: 0,
    costGold: 10000,
    costAlloy: 0,
    costStardust: 0,
    effectType: 'per_turn',
    cooldown: 0,
    effectDescription: '每回合 +30 食物',
  },
  {
    id: MODULE_SIXTH_FARM,
    name: '六维奇点农场',
    description: '利用六维空间特性进行超高效农业，每回合产出60食物（生物合成厨房的终极升级版）',
    costFood: 0,
    costGold: 20000,
    costAlloy: 0,
    costStardust: 0,
    costMaterials: { dark_matter: 5 },
    effectType: 'per_turn',
    cooldown: 0,
    effectDescription: '每回合 +60 食物',
  },
  {
    id: MODULE_RESERVE_BAY,
    name: '应急储备舱',
    description: '产品过期时间延长3回合，保护你的生产成果',
    costFood: 0,
    costAlloy: 20,
    costStardust: 0,
    effectType: 'passive',
    cooldown: 0,
    effectDescription: '产品过期时间 +3 回合',
  },
  {
    id: 'gravity_anchor',
    name: '引力锚定器',
    description: '星际跃迁所需回合数 -1（最少1回合）',
    costFood: 0,
    costAlloy: 160,
    costStardust: 0,
    effectType: 'passive',
    cooldown: 0,
    effectDescription: '跃迁回合 -1（最少1回合）',
  },

  // ===== 中级装置 =====
  {
    id: 'quantum_reactor',
    name: '量子生物反应器',
    description: '手动消耗50食物，转化为30000金币',
    costFood: 0,
    costAlloy: 300,
    costStardust: 5,
    effectType: 'manual',
    cooldown: 0,
    effectDescription: '消耗 50 食物 → +30000 金币（无冷却，食物不足时无法使用）',
  },
  {
    id: MODULE_MINING_ARRAY,
    name: '深空采矿阵列',
    description: '每回合自动产出10单位随机基础原料',
    costFood: 0,
    costAlloy: 250,
    costStardust: 3,
    effectType: 'per_turn',
    cooldown: 0,
    effectDescription: '每回合 +10 随机基础原料（碳/黄金/石油/硅）',
  },
  {
    id: MODULE_TRADE_HUB,
    name: '贸易枢纽协议',
    description: '所有特产卖出价格+15%，原料购买价格-8%',
    costFood: 0,
    costAlloy: 200,
    costStardust: 8,
    effectType: 'passive',
    cooldown: 0,
    effectDescription: '特产卖出 +15%，原料购买 -8%',
  },
  {
    id: MODULE_ENGINEER_AI,
    name: '工程师AI助手',
    description: '所有生产所需回合数 -1（最少1回合）',
    costFood: 0,
    costAlloy: 350,
    costStardust: 0,
    effectType: 'passive',
    cooldown: 0,
    effectDescription: '生产回合 -1（最少1回合）',
  },

  {
    id: 'stardust_pool',
    name: '星尘催化池',
    description: '消耗500合金，手动转化为10星尘（冷却2回合）',
    costFood: 0,
    costAlloy: 400,
    costStardust: 0,
    effectType: 'manual',
    cooldown: 2,
    effectDescription: '消耗500合金 → +10 星尘（冷却2回合）',
  },
  {
    id: MODULE_DYSON_COLLECTOR,
    name: '戴森粒子收集器',
    description: '每回合直接产出3星尘',
    costFood: 0,
    costAlloy: 500,
    costStardust: 20,
    effectType: 'per_turn',
    cooldown: 0,
    effectDescription: '每回合 +3 星尘',
  },
  {
    id: 'void_replicator',
    name: '虚空复制器',
    description: '消耗30星尘，复制当前所有产品和原料库存（数量翻倍）',
    costFood: 0,
    costAlloy: 400,
    costStardust: 50,
    effectType: 'manual',
    cooldown: 5,
    effectDescription: '消耗30星尘 → 所有产品和原料数量翻倍（冷却5回合）',
  },
  {
    id: MODULE_PROD_SCHEDULER,
    name: '量产调度终端',
    description: '加装自动化调度系统，优化产线排程，让母舰每回合能多进行一次产品生产。',
    costFood: 0,
    costAlloy: 100,
    costStardust: 0,
    effectType: 'passive',
    cooldown: 0,
    effectDescription: '每回合生产产品上限 +1',
  },
  {
    id: MODULE_PARALLEL_MATRIX,
    name: '并行生产矩阵',
    description: '多轴并行加工矩阵，同时运行多条产线，生产上限 +2，进一步提升母舰产能。',
    costFood: 0,
    costAlloy: 300,
    costStardust: 0,
    effectType: 'passive',
    cooldown: 0,
    effectDescription: '每回合生产产品上限 +2',
  },
  {
    id: MODULE_AUTOMATION_HUB,
    name: '全自动量产中枢',
    description: '由中央AI统筹的无人化量产中枢，生产上限 +3，将母舰产能推向极限。',
    costFood: 0,
    costAlloy: 500,
    costStardust: 0,
    effectType: 'passive',
    cooldown: 0,
    effectDescription: '每回合生产产品上限 +3',
  },
];

// 获取装置定义
export function getModuleDef(id: string): ModuleDefinition | undefined {
  return MODULE_DEFINITIONS.find((m) => m.id === id);
}

// 计算生产上限总加成（遗物时空稳定锚 +2、三个量产装置 +1/+2/+3，可叠加）
export function getProductionLimitBonus(ship: { installedModuleIds: string[]; relics: { id: string }[] }): number {
  let bonus = 0;
  if (ship.relics.some((r) => r.id === RELIC_STABILITY_ANCHOR)) bonus += 2;
  if (ship.installedModuleIds.includes(MODULE_PROD_SCHEDULER)) bonus += 1;
  if (ship.installedModuleIds.includes(MODULE_PARALLEL_MATRIX)) bonus += 2;
  if (ship.installedModuleIds.includes(MODULE_AUTOMATION_HUB)) bonus += 3;
  return bonus;
}

// 原料购买总折扣（母舰技能 + 星际罗盘遗物 + 贸易枢纽协议，可叠加）
// 单一真值：逻辑层（useProduction.buyMaterial）与显示层（MaterialMarket）都从这里取，避免分叉。
export function getMaterialDiscountRate(ship: { materialPriceDiscount: number; relics: { id: string }[]; installedModuleIds: string[] }): number {
  let discount = ship.materialPriceDiscount || 0;
  if (ship.relics.some((r) => r.id === RELIC_STAR_COMPASS)) discount += 0.1;
  if (ship.installedModuleIds.includes(MODULE_TRADE_HUB)) discount += 0.08;
  return discount;
}

// 原料折扣来源明细（用于 UI 明示玩家折扣构成，括号内列出各分项）
// 单一真值：分项百分比从此处取，与 getMaterialDiscountRate 同源；UI 只渲染不再硬编码。
export function getMaterialDiscountBreakdown(ship: { materialPriceDiscount: number; relics: { id: string }[]; installedModuleIds: string[] }): Array<{ label: string; rate: number }> {
  const breakdown: Array<{ label: string; rate: number }> = [];
  if ((ship.materialPriceDiscount || 0) > 0) {
    breakdown.push({ label: '母舰技能', rate: ship.materialPriceDiscount });
  }
  if (ship.relics.some((r) => r.id === RELIC_STAR_COMPASS)) {
    breakdown.push({ label: '星际罗盘', rate: 0.1 });
  }
  if (ship.installedModuleIds.includes(MODULE_TRADE_HUB)) {
    breakdown.push({ label: '贸易枢纽', rate: 0.08 });
  }
  return breakdown;
}

// 生产实际回合数（基础回合 − 母舰生产加速 − 工程师AI，下限 0）
// 单一真值：逻辑层（useProduction.startProduction）与显示层（ProductionPanel）都从这里取，避免分叉。
export function getProductionTurns(recipe: { productionTurns: number }, ship: { productionSpeedBonus: number; installedModuleIds: string[] }): number {
  const engineerAiBonus = ship.installedModuleIds.includes(MODULE_ENGINEER_AI) ? 1 : 0;
  return Math.max(0, recipe.productionTurns - (ship.productionSpeedBonus || 0) - engineerAiBonus);
}

// 产品卖出价加成明细（母舰技能 + 事件套装 + 联盟）
// 单一真值：逻辑层（useProduction 出售）与显示层（ProductMarket 单价/出售消息）都从这里取，
// 避免三处拷贝分叉、漏联盟加成、eventBonus 单位不一致（历史坑）。
export interface SellPriceBreakdown {
  multiplier: number;      // 总乘数 = 1 + event/100 + skill + alliance/100
  eventPercent: number;    // 事件套装加成（百分比整数，如 50）
  skillPercent: number;    // 母舰技能加成（百分比整数，如 20）
  alliancePercent: number; // 联盟加成（15 或 0）
}

export function getSellPriceBreakdown(ship: { sellPriceBonus: number; sellBonuses?: { bonus: number }[]; allianceRounds?: number }): SellPriceBreakdown {
  const eventPercent = (ship.sellBonuses || []).reduce((sum, b) => sum + b.bonus, 0);
  const skillBonus = ship.sellPriceBonus || 0;
  const skillPercent = Math.round(skillBonus * 100);
  const alliancePercent = (ship.allianceRounds && ship.allianceRounds > 0) ? 15 : 0;
  // multiplier 内部用 sellPriceBonus 原始小数参与运算，勿用 skillPercent/100 重建（避免二次取整偏差）
  const multiplier = 1 + eventPercent / 100 + skillBonus + alliancePercent / 100;
  return { multiplier, eventPercent, skillPercent, alliancePercent };
}

// 检查是否已安装
export function isModuleInstalled(ship: { installedModuleIds: string[] }, id: string): boolean {
  return ship.installedModuleIds.includes(id);
}

// 检查是否有足够的资源
export function canAffordModule(
  ship: { food: number; alloy: number; stardust: number; gold: number; materials: Record<string, number> },
  def: ModuleDefinition
): boolean {
  if (def.costFood > 0 && ship.food < def.costFood) return false;
  if (ship.alloy < def.costAlloy) return false;
  if (ship.stardust < def.costStardust) return false;
  if (def.costGold && ship.gold < def.costGold) return false;
  if (def.costMaterials) {
    for (const [matId, cost] of Object.entries(def.costMaterials)) {
      if ((ship.materials[matId] || 0) < cost) return false;
    }
  }
  return true;
}
