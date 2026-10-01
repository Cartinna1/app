import type { Faction, TradePolicy, PolicyEffect } from '@/types/game';
import { getTradeDistance, FALLBACK_DISTANCE } from '@/lib/galaxy/graph';

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

// 距离与跃迁回合数：唯一真值是星图（lib/galaxy/graph.ts 的最短路，航道长度由节点坐标推导）。
// ⚠ 旧的 10×10 DISTANCE_MATRIX 已随星图上线删除；势力间距现在由图上的航道决定，
//   改星图布局（data/galaxy/nodes.ts / lanes.ts）会同时改变跃迁回合与异地卖出折价。

export function getDistance(fromId: string, toId: string): number {
  const from = FACTIONS.some((f) => f.id === fromId);
  const to = FACTIONS.some((f) => f.id === toId);
  if (!from || !to) return FALLBACK_DISTANCE;
  return getTradeDistance(fromId, toId);
}

export function getTravelTurns(fromId: string, toId: string): number {
  return getDistance(fromId, toId);
}

// ==================== 贸易政策系统 ====================

export const POLICY_EFFECTS: Record<TradePolicy, PolicyEffect> = {
  embargo:         { name: '全面禁运',     description: '多方势力封锁航线，出口极其艰难',         multiplier: 0.45 },
  black_market:    { name: '银河黑市',     description: '走私猖獗挤兑正规渠道，价格受到打压',     multiplier: 0.55 },
  tariff_wall:     { name: '关税壁垒',     description: '星际关税大幅提高，出口收益锐减',         multiplier: 0.68 },
  trade_dispute:   { name: '贸易争端',     description: '星际间贸易摩擦加剧，出口略受影响',       multiplier: 0.82 },
  normal:          { name: '正常贸易',     description: '市场平稳，无特殊影响',                   multiplier: 1.00 },
  regional_mutual: { name: '区域互惠',     description: '区域贸易协定生效，出口略有提振',         multiplier: 1.15 },
  free_trade:      { name: '自由贸易',     description: '全星系关税减免，出口收益大幅提升',       multiplier: 1.28 },
  trade_frenzy:    { name: '贸易狂潮',     description: '星际商贸空前活跃，价格一路上扬',         multiplier: 1.42 },
  golden_age:      { name: '黄金时代',     description: '各大势力抢购物资，出口利润暴涨',         multiplier: 1.60 },
  stellar_boom:    { name: '星际繁荣',     description: '千年一遇的星际贸易盛世，价格达巅峰！',   multiplier: 1.75 },
};

// 按概率随机选择政策
export function rollPolicy(): TradePolicy {
  const r = Math.random();
  if (r < 0.03) return 'embargo';          // 3%
  if (r < 0.05) return 'black_market';     // 2%
  if (r < 0.15) return 'tariff_wall';      // 10%
  if (r < 0.32) return 'trade_dispute';    // 17%
  if (r < 0.62) return 'normal';           // 30%
  if (r < 0.77) return 'regional_mutual';  // 15%
  if (r < 0.89) return 'free_trade';       // 12%
  if (r < 0.96) return 'trade_frenzy';     // 7%
  if (r < 0.99) return 'golden_age';       // 3%
  return 'stellar_boom';                    // 1%
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

/**
 * 距离折价系数：`1 + DIST_SLOPE×距离 + DIST_QUADRATIC×距离²`。
 * 为什么带二次项：距离既是"要多跑的回合数"又是加价乘数，纯线性会让"每回合利润"随距离单调下降
 * （实测 dist9 只有近程的 19%），远程变成坏选择。二次项让每回合利润随距离不再下降（132→177）。
 * ⚠ 改这两个数等于改全部特产的空间收益，改前先跑一遍按距离分桶的利润对比表。
 */
export const DIST_SLOPE = 0.05;
export const DIST_QUADRATIC = 0.015;
/**
 * 单势力卖出乘数上限（距离 × 政策 × 波动）。
 * 防止「星际繁荣 1.75 × 远程 2.665 × 波动 1.15」这类极端叠加拿单件卖到失控（上限后最大约 4.0）。
 * 钳制在结算处，玩家在贸易面板看到的乘数就是实收乘数，不会出现显示与实收分叉。
 */
export const MAX_SELL_MULTIPLIER = 4.0;

// 计算每回合的固定卖出乘数（整回合内不变）
// 构成：距离折价（见上）× 政策倍率 × 固定随机因子 0.85~1.15（每回合 Math.random()，保证整回合同步）
export function calculateSellMultipliers(
  currentFactionId: string,
  policy: { type: TradePolicy; effect: PolicyEffect },
  
): Record<string, number> {
  const multipliers: Record<string, number> = {};
  for (const f of FACTIONS) {
    const dist = getDistance(currentFactionId, f.id);
    const distanceBonus = 1 + DIST_SLOPE * dist + DIST_QUADRATIC * dist * dist;
    const policyMult = policy.effect.multiplier;
    const localVariance = 0.85 + Math.random() * 0.3; // 0.85 ~ 1.15，固定整回合
    const raw = distanceBonus * policyMult * localVariance;
    multipliers[f.id] = Math.round(Math.min(raw, MAX_SELL_MULTIPLIER) * 100) / 100;
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
  const pct = invested / 80000;
  if (pct >= 1) return 6;
  if (pct >= 0.625) return 5;
  if (pct >= 0.5) return 4;
  if (pct >= 0.375) return 3;
  if (pct >= 0.25) return 2;
  if (pct >= 0.125) return 1;
  return 0;
}

export function getDiscountRate(tier: number): number {
  switch (tier) {
    case 6: return 0.38;
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
    case 6: return 4500;
    case 5: return 2000;
    case 4: return 1300;
    case 3: return 800;
    default: return 0;
  }
}

export function getBuffDescription(tier: number): string {
  switch (tier) {
    case 6: return '购买优惠38% + 每回合≤4500金币收益 + 每5回合自动补给特产x3';
    case 5: return '购买优惠30% + 每回合≤2000金币收益';
    case 4: return '购买优惠25% + 每回合≤1300金币收益';
    case 3: return '购买优惠20% + 每回合≤800金币收益';
    case 2: return '购买优惠20%';
    case 1: return '购买优惠10%';
    default: return '投资后可获得优惠';
  }
}

// ==================== 势力声望 ====================

/** 势力关系矩阵：{ factionId → { allies: string[], enemies: string[] } } */
export const RELATION_MATRIX: Record<string, { allies: string[]; enemies: string[] }> = {
  f01: { allies: ['f05', 'f07'], enemies: ['f03'] },
  f02: { allies: ['f09'], enemies: ['f10'] },
  f03: { allies: [], enemies: ['f01', 'f08'] },
  f04: { allies: ['f10'], enemies: ['f09'] },
  f05: { allies: ['f01', 'f07'], enemies: ['f06'] },
  f06: { allies: ['f08', 'f10'], enemies: ['f05'] },
  f07: { allies: ['f01', 'f05'], enemies: [] },
  f08: { allies: ['f06'], enemies: ['f03', 'f09'] },
  f09: { allies: ['f02'], enemies: ['f04', 'f08'] },
  f10: { allies: ['f04', 'f06'], enemies: ['f02'] },
};

/** 声望层级定义 */
export interface ReputationTier {
  min: number; max: number; label: string; discount: number; passiveIncomeMin: number; passiveIncomeMax: number;
}
export const REPUTATION_TIERS: ReputationTier[] = [
  { min: -100, max: -91, label: '宿敌', discount: 0, passiveIncomeMin: 0, passiveIncomeMax: 0 },
  { min: -90, max: -51, label: '恶意', discount: 0, passiveIncomeMin: 0, passiveIncomeMax: 0 },
  { min: -50, max: -21, label: '敌意', discount: -0.40, passiveIncomeMin: 0, passiveIncomeMax: 0 },
  { min: -20, max: -1, label: '不信任', discount: -0.20, passiveIncomeMin: 0, passiveIncomeMax: 0 },
  { min: 0, max: 9, label: '中立', discount: 0, passiveIncomeMin: 0, passiveIncomeMax: 0 },
  { min: 10, max: 29, label: '友善', discount: 0.10, passiveIncomeMin: 300, passiveIncomeMax: 500 },
  { min: 30, max: 49, label: '盟友', discount: 0.20, passiveIncomeMin: 700, passiveIncomeMax: 900 },
  { min: 50, max: 69, label: '亲密', discount: 0.30, passiveIncomeMin: 1300, passiveIncomeMax: 1600 },
  { min: 70, max: 89, label: '忠诚', discount: 0.35, passiveIncomeMin: 2500, passiveIncomeMax: 3500 },
  { min: 90, max: 100, label: '尊崇', discount: 0.38, passiveIncomeMin: 3500, passiveIncomeMax: 4500 },
];

/** 根据声望值获取层级 */
export function getReputationTier(rep: number): ReputationTier {
  return REPUTATION_TIERS.find(t => rep >= t.min && rep <= t.max) || REPUTATION_TIERS[0];
}
