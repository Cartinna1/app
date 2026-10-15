// ==================== 股票补位池（永久退市后的"全新公司"） ====================
// 用途：一只股票连续退市 6 次（重整 5 次后仍退市）→ **彻底关闭**（`permanentlyClosed`），
//   为维持市场总数不变，从本池按顺序补一家新公司（见 lib/turn/priceFluctuation.ts 的重整块）。
//
// 规则（唯一入口 = 本文件的 getStockRefill，调用方只管传"已经补过几次"）：
//   · 取号 = `refillIndex % STOCK_REFILLS.length`（用尽后从第 1 家循环）；
//   · 重名规避 = 第 2 轮起公司名后加「·二代 / ·三代 …」（序号 = floor(index / 12) + 1，
//     12 家 × 每轮都用同一个序号，二代里不会再出现重名）；
//   · id = `<池内id>_g<代>_<序号>`（如 sr01_g2_13），保证**同一局内 id 永不重复**
//     （id 是持仓/成本/买入回合的表键，重复会串账）；
//   · 价格与走势 **不在这里生成**：一律走 `data/gameData.ts` 的 `createStockRefill(def)`
//     （= 与开局 createStocks 同一份 generateInitialPrices，别写第二套）。
//
// 数值口径：basePrice 100~600、volatility 0.15~0.48，与 INITIAL_STOCKS 的 100 家一致。

import type { Stock } from '@/types/game';

/** 补位公司的静态定义（字段与 gameData 的 INITIAL_STOCKS 完全一致） */
export type StockRefillDef = Omit<Stock, 'prices' | 'currentPrice'>;

export const STOCK_REFILLS: StockRefillDef[] = [
  // ===== 能源 =====
  { id: 'sr01', name: '戴森环续建', description: '接续废弃戴森环工程的能源承包集团', sector: '能源', basePrice: 385, volatility: 0.32 },
  { id: 'sr02', name: '脉冲星蓄能', description: '利用脉冲星射电暴高峰期蓄能的新型电站', sector: '能源', basePrice: 245, volatility: 0.28 },
  // ===== 科技 =====
  { id: 'sr03', name: '量子中继网络', description: '跨星系量子纠缠中继站建设与运营', sector: '科技', basePrice: 560, volatility: 0.44 },
  { id: 'sr04', name: '拓扑计算所', description: '拓扑量子比特容错计算架构研究机构', sector: '科技', basePrice: 520, volatility: 0.4 },
  // ===== 军工 =====
  { id: 'sr05', name: '引力锚防御', description: '引力锚定与航道封锁防御系统供应商', sector: '军工', basePrice: 335, volatility: 0.27 },
  { id: 'sr06', name: '深空雷场公司', description: '自动布雷与航道拒止系统承包商', sector: '军工', basePrice: 415, volatility: 0.36 },
  // ===== 生物 =====
  { id: 'sr07', name: '极端环境菌群', description: '在高辐射与真空环境作业的工程菌群', sector: '生物', basePrice: 265, volatility: 0.31 },
  { id: 'sr08', name: '生体打印工坊', description: '按需打印器官与组织的生体制造企业', sector: '生物', basePrice: 425, volatility: 0.37 },
  // ===== 医疗 =====
  { id: 'sr09', name: '低温休眠医疗', description: '重症患者低温休眠与苏醒医疗方案', sector: '医疗', basePrice: 305, volatility: 0.25 },
  { id: 'sr10', name: '纳米凝血剂', description: '战场与事故现场用的纳米级快速止血剂', sector: '医疗', basePrice: 185, volatility: 0.33 },
  // ===== 金融 =====
  { id: 'sr11', name: '星际铸币局', description: '跨势力通用信用凭证的发行与清算', sector: '金融', basePrice: 275, volatility: 0.17 },
  { id: 'sr12', name: '风险对冲基金', description: '专做星区战乱与瘟疫风险的对冲基金', sector: '金融', basePrice: 495, volatility: 0.45 },
  // ===== 资源 =====
  { id: 'sr13', name: '小行星熔炼', description: '在轨熔炼小行星矿石的移动冶炼平台', sector: '资源', basePrice: 355, volatility: 0.34 },
  { id: 'sr14', name: '深海热液采矿', description: '外星海洋热液喷口的稀有金属开采', sector: '资源', basePrice: 205, volatility: 0.29 },
  // ===== 科研教育 =====
  { id: 'sr15', name: '深空观测联盟', description: '分布全星系的引力波与深空观测网', sector: '科研教育', basePrice: 445, volatility: 0.21 },
  { id: 'sr16', name: '失传技术复原', description: '从遗迹残片中复原远古技术的机构', sector: '科研教育', basePrice: 285, volatility: 0.36 },
  // ===== 基建设施 =====
  { id: 'sr17', name: '环形轨道城', description: '环绕行星的环形轨道城市设计与建造', sector: '基建设施', basePrice: 530, volatility: 0.28 },
  { id: 'sr18', name: '虚空灯塔网', description: '为跃迁航道提供定位的灯塔网络', sector: '基建设施', basePrice: 165, volatility: 0.23 },
  // ===== 娱乐服务 =====
  { id: 'sr19', name: '引力冲浪度假', description: '黑洞潮汐与气态巨行星冲浪旅游项目', sector: '娱乐服务', basePrice: 315, volatility: 0.39 },
  { id: 'sr20', name: '记忆体验馆', description: '把他人记忆剪辑成体验节目的连锁馆', sector: '娱乐服务', basePrice: 235, volatility: 0.42 },
];

/** 每轮（走完整个池子）的序号后缀，第 1 轮不加后缀 */
const GENERATION_SUFFIX = ['', '·二代', '·三代', '·四代', '·五代', '·六代', '·七代', '·八代', '·九代', '·十代'];

/**
 * 取第 `refillIndex` 家补位公司（`refillIndex` = 本局**已经**补过几次，从 0 开始）。
 * 只做"取号 + 重名规避 + 唯一 id 分配"，不生成价格（价格由调用方走 `createStockRefill`）。
 */
export function getStockRefill(refillIndex: number): StockRefillDef {
  const index = Math.max(0, Math.floor(refillIndex));
  const pool = STOCK_REFILLS;
  const def = pool[index % pool.length];
  const generation = Math.floor(index / pool.length);
  if (generation === 0) return { ...def };
  const suffix = GENERATION_SUFFIX[generation] || `·第${generation + 1}代`;
  return {
    ...def,
    id: `${def.id}_g${generation + 1}_${index + 1}`,
    name: `${def.name}${suffix}`,
  };
}
