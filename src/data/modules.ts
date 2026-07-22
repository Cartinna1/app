import type { ModuleDefinition } from '@/types/game';

/**
 * 母舰装置定义 — 共12种
 * 每种只能造1个
 */
export const MODULE_DEFINITIONS: ModuleDefinition[] = [
  // ===== 基础装置 =====
  {
    id: 'bio_kitchen',
    name: '生物合成厨房',
    description: '每回合自动产出 15 食物，维持船员生存的基础设施',
    costFood: 0,
    costAlloy: 15,
    costStardust: 0,
    effectType: 'per_turn',
    cooldown: 0,
    effectDescription: '每回合 +15 食物',
  },
  {
    id: 'nano_farm',
    name: '纳米机器人农场',
    description: '部署纳米机器人群体自动化种植，每回合产出30食物',
    costFood: 0,
    costAlloy: 50,
    costStardust: 0,
    costMaterials: { gold_ore: 50 },
    effectType: 'per_turn',
    cooldown: 0,
    effectDescription: '每回合 +30 食物',
  },
  {
    id: 'sixth_farm',
    name: '六维奇点农场',
    description: '利用六维空间特性进行超高效农业，每回合产出60食物（生物合成厨房的终极升级版）',
    costFood: 0,
    costAlloy: 100,
    costStardust: 0,
    costMaterials: { gold_ore: 90 },
    effectType: 'per_turn',
    cooldown: 0,
    effectDescription: '每回合 +60 食物',
  },
  {
    id: 'alloy_furnace',
    name: '小型合金熔炉',
    description: '消耗任意5个原料，产出3合金（冷却1回合）',
    costFood: 50,
    costAlloy: 0,
    costStardust: 0,
    effectType: 'manual',
    cooldown: 1,
    effectDescription: '消耗任意5个原料 → +3合金（冷却1回合）',
  },
  {
    id: 'micro_alloy_furnace',
    name: '微型合金熔炉',
    description: '消耗2个碳块+2个石油，产出2合金（冷却1回合）',
    costFood: 0,
    costGold: 3000,
    costAlloy: 0,
    costStardust: 0,
    effectType: 'manual',
    cooldown: 1,
    effectDescription: '消耗2碳块+2石油 → +2合金（冷却1回合）',
  },
  {
    id: 'mega_alloy_furnace',
    name: '巨型合金熔炉',
    description: '消耗任意10个原料，产出8合金（冷却1回合）',
    costFood: 0,
    costGold: 50000,
    costAlloy: 200,
    costStardust: 20,
    effectType: 'manual',
    cooldown: 1,
    effectDescription: '消耗任意10个原料 → +8合金（冷却1回合）',
  },
  {
    id: 'reserve_bay',
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
    id: 'mining_array',
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
    id: 'trade_hub',
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
    id: 'engineer_ai',
    name: '工程师AI助手',
    description: '所有生产所需回合数 -1（最少1回合）',
    costFood: 0,
    costAlloy: 350,
    costStardust: 0,
    effectType: 'passive',
    cooldown: 0,
    effectDescription: '生产回合 -1（最少1回合）',
  },

  // ===== 高级装置 =====
  {
    id: 'time_fold_engine',
    name: '时间折叠引擎',
    description: '通过折叠局部时空，在同一回合内创造额外的生产窗口。每回合生产产品次数+3。',
    costFood: 0,
    costAlloy: 150,
    costStardust: 0,
    costMaterials: { dark_matter: 150 },
    effectType: 'passive',
    cooldown: 0,
    effectDescription: '每回合生产次数 +3',
  },
  {
    id: 'stardust_pool',
    name: '星尘催化池',
    description: '消耗6合金，手动转化为1星尘（无冷却）',
    costFood: 0,
    costAlloy: 400,
    costStardust: 0,
    effectType: 'manual',
    cooldown: 0,
    effectDescription: '消耗6合金 → +1 星尘（无冷却）',
  },
  {
    id: 'dyson_collector',
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
    id: 'eternal_core',
    name: '永恒合金核心',
    description: '每回合直接产出5合金',
    costFood: 0,
    costAlloy: 260,
    costStardust: 30,
    effectType: 'per_turn',
    cooldown: 0,
    effectDescription: '每回合 +5 合金',
  },
];

// 获取装置定义
export function getModuleDef(id: string): ModuleDefinition | undefined {
  return MODULE_DEFINITIONS.find((m) => m.id === id);
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
  if (ship.food < def.costFood) return false;
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
