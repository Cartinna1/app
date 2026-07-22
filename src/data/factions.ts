import type { Faction, TradePolicy, PolicyEffect } from '@/types/game';

// 10个星际势力
export const FACTIONS: Faction[] = [
  { id: 'f01', name: '银河人类联邦', specialtyName: '凝滞时光导航图', specialtyDescription: '能冻结局部时空的远古星图', basePrice: 800 },
  { id: 'f02', name: '齐戈尔统一集群', specialtyName: '活体塑材', specialtyDescription: '自我增殖的活体金属', basePrice: 750 },
  { id: 'f03', name: '泰拉钢铁王座', specialtyName: '督军级基因认证战斗装甲', specialtyDescription: '特定基因序列才能激活的顶级装甲', basePrice: 1200 },
  { id: 'f04', name: '阿基米德圣咏体', specialtyName: '矛盾解构水晶', specialtyDescription: '瓦解物理法则矛盾的神秘水晶', basePrice: 900 },
  { id: 'f05', name: '盖亚环廊商贸联合体', specialtyName: '概率债券', specialtyDescription: '以量子概率为背书的金融工具', basePrice: 600 },
  { id: 'f06', name: '灵能蔷薇王朝', specialtyName: '忆晶华', specialtyDescription: '封存记忆的晶体', basePrice: 850 },
  { id: 'f07', name: '诺瓦共鸣共和国', specialtyName: '共识场生成器', specialtyDescription: '让所有智慧生物瞬间达成共识', basePrice: 700 },
  { id: 'f08', name: '光语者宁静域', specialtyName: '恒星谐波谐振器', specialtyDescription: '与恒星产生共振提取能源', basePrice: 950 },
  { id: 'f09', name: '黑渊自由港邦联', specialtyName: '幽灵数据污泥', specialtyDescription: '废弃数据库中的活性信息残渣', basePrice: 650 },
  { id: 'f10', name: '超念矩阵', specialtyName: '定制化人格副本', specialtyDescription: '将意识完整备份为数字人格', basePrice: 1100 },
];

// 距离矩阵
export const DISTANCE_MATRIX: number[][] = [
  [0, 2, 3, 4, 2, 5, 3, 6, 7, 5],
  [2, 0, 4, 3, 3, 4, 2, 5, 6, 4],
  [3, 4, 0, 5, 4, 6, 5, 7, 8, 6],
  [4, 3, 5, 0, 4, 3, 3, 4, 5, 3],
  [2, 3, 4, 4, 0, 5, 3, 6, 7, 5],
  [5, 4, 6, 3, 5, 0, 4, 3, 4, 2],
  [3, 2, 5, 3, 3, 4, 0, 5, 6, 4],
  [6, 5, 7, 4, 6, 3, 5, 0, 3, 3],
  [7, 6, 8, 5, 7, 4, 6, 3, 0, 4],
  [5, 4, 6, 3, 5, 2, 4, 3, 4, 0],
];

export function getDistance(fromId: string, toId: string): number {
  const fromIdx = FACTIONS.findIndex((f) => f.id === fromId);
  const toIdx = FACTIONS.findIndex((f) => f.id === toId);
  if (fromIdx === -1 || toIdx === -1) return 5;
  return DISTANCE_MATRIX[fromIdx][toIdx];
}

export function getTravelTurns(fromId: string, toId: string): number {
  return getDistance(fromId, toId);
}

// ==================== 贸易政策系统 ====================

export const POLICY_EFFECTS: Record<TradePolicy, PolicyEffect> = {
  free_trade: { name: '自由贸易协定', description: '全星系关税减免，出口收益+12%', multiplier: 1.12 },
  normal: { name: '正常贸易', description: '市场平稳，无特殊影响', multiplier: 1.0 },
  tax_hike: { name: '关税上涨', description: '星际关税大幅提高，出口收益-18%', multiplier: 0.82 },
  sanctions: { name: '贸易制裁', description: '部分航线被封锁，出口收益-28%', multiplier: 0.72 },
  boom: { name: '市场繁荣', description: '星际贸易空前繁荣，出口收益+20%', multiplier: 1.20 },
};

// 按概率随机选择政策
export function rollPolicy(): TradePolicy {
  const r = Math.random();
  if (r < 0.18) return 'free_trade';   // 18%
  if (r < 0.55) return 'normal';        // 37%
  if (r < 0.78) return 'tax_hike';      // 23%
  if (r < 0.92) return 'sanctions';     // 14%
  return 'boom';                         // 8%
}

// ==================== 价格系统 ====================

// 每回合刷新各势力的实际市场价格（基准价 ±15% 浮动）
export function refreshFactionPrices(): Record<string, number> {
  const prices: Record<string, number> = {};
  for (const f of FACTIONS) {
    const fluctuation = 0.85 + Math.random() * 0.3; // 0.85 ~ 1.15
    prices[f.id] = Math.round(f.basePrice * fluctuation);
  }
  return prices;
}

// 计算特产的购买价格（含投资优惠，使用当前浮动价格）
export function getBuyPrice(factionId: string, invested: number, factionPrices: Record<string, number>): number {
  const marketPrice = factionPrices[factionId] || 800;
  const tier = getInvestmentTier(invested);
  const discount = getDiscountRate(tier);
  return Math.round(marketPrice * (1 - discount));
}

// 计算每回合的固定卖出乘数（整回合内不变）
// 距离系数 0.05：综合盈利概率≈60%
// 固定随机因子 0.85~1.15（每回合用 rng() 生成，保证同步）
export function calculateSellMultipliers(
  currentFactionId: string,
  policy: { type: TradePolicy; effect: PolicyEffect },
  rng: () => number
): Record<string, number> {
  const multipliers: Record<string, number> = {};
  for (const f of FACTIONS) {
    const dist = getDistance(currentFactionId, f.id);
    const distanceBonus = 1 + dist * 0.05; // 每距离+5%
    const policyMult = policy.effect.multiplier;
    const localVariance = 0.85 + rng() * 0.3; // 0.85 ~ 1.15，固定整回合
    multipliers[f.id] = Math.round(distanceBonus * policyMult * localVariance * 100) / 100;
  }
  return multipliers;
}

// 计算特产的卖出价格（使用预计算的固定乘数）
export function getSellPrice(
  factionId: string,
  factionPrices: Record<string, number>,
  factionSellMultipliers: Record<string, number>
): number {
  const marketPrice = factionPrices[factionId] || 800;
  const mult = factionSellMultipliers[factionId] || 1.0;
  return Math.round(marketPrice * mult);
}

// ==================== 投资系统 ====================

export function getInvestmentTier(invested: number): number {
  const pct = invested / 50000;
  if (pct >= 1) return 5;
  if (pct >= 0.8) return 4;
  if (pct >= 0.6) return 3;
  if (pct >= 0.4) return 2;
  if (pct >= 0.2) return 1;
  return 0;
}

export function getDiscountRate(tier: number): number {
  switch (tier) {
    case 5: return 0.30;
    case 4: return 0.25;
    case 3: return 0.20;
    case 2: return 0.20;
    case 1: return 0.10;
    default: return 0;
  }
}

export function getIncomeCap(tier: number): number {
  switch (tier) {
    case 5: return 2000;
    case 4: return 1300;
    case 3: return 800;
    default: return 0;
  }
}

export function getBuffDescription(tier: number): string {
  switch (tier) {
    case 5: return '购买优惠30% + 每回合≤2000金币收益';
    case 4: return '购买优惠25% + 每回合≤1300金币收益';
    case 3: return '购买优惠20% + 每回合≤800金币收益';
    case 2: return '购买优惠20%';
    case 1: return '购买优惠10%';
    default: return '投资后可获得优惠';
  }
}
