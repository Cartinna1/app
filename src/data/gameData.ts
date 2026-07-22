import type { Mothership, Stock, RawMaterial, Product, Recipe } from '@/types/game';
import { rng } from '@/utils/prng';
import { FACTIONS } from './factions';

// ==================== 母舰数据 ====================

export const MOTHERSHIP_TEMPLATES: Omit<Mothership, 'gold' | 'food' | 'alloy' | 'stardust' | 'modules' | 'installedModuleIds' | 'stockHoldings' | 'stockCosts' | 'stockBuyTurn' | 'sellPriceBonus' | 'productionsThisTurn' | 'maxProductionsPerTurn' | 'materials' | 'products' | 'productionQueue' | 'usedCodes' | 'loans' | 'bankrupt' | 'bankruptTimer' | 'famineTimer' | 'isRebellion' | 'relics' | 'tradeStatus' | 'goldLog'>[] = [
  {
    id: 0,
    name: '万众一心',
    description: '团结协作的舰队，善于全面优化资源运转',
    skill: {
      name: '协同增效',
      description: '股票交易手续费减免50%，原料购买额外9折，每回合获得总资产1%的股息收入',
    },
    tradeFeeDiscount: 0.5,
    productionSpeedBonus: 0,
    eventDodgeChance: 0,
    materialPriceDiscount: 0.1,
    initialCapitalMultiplier: 1,
  },
  {
    id: 1,
    name: '跃迁者',
    description: '掌握先进跃迁技术的舰队，行动如风',
    skill: {
      name: '量子跃迁',
      description: '所有生产所需回合-1，30%概率闪避负面事件',
    },
    tradeFeeDiscount: 0,
    productionSpeedBonus: 1,
    eventDodgeChance: 0.3,
    materialPriceDiscount: 0,
    initialCapitalMultiplier: 1,
  },
  {
    id: 2,
    name: '黄金集团',
    description: '星际最大的金融财团，资本的力量无处不在',
    skill: {
      name: '资本豁免',
      description: '股票交易0手续费，初始资金+20%',
    },
    tradeFeeDiscount: 1,
    productionSpeedBonus: 0,
    eventDodgeChance: 0,
    materialPriceDiscount: 0,
    initialCapitalMultiplier: 1.2,
  },
  {
    id: 3,
    name: '银河之心',
    description: '掌控星际贸易航线的物流巨头，买卖皆有优势',
    skill: {
      name: '贸易网络',
      description: '原料购买8折，产品出售价格+20%',
    },
    tradeFeeDiscount: 0,
    productionSpeedBonus: 0,
    eventDodgeChance: 0,
    materialPriceDiscount: 0.2,
    initialCapitalMultiplier: 1,
  },
  {
    id: 4,
    name: '奇点探求者',
    description: '探索宇宙奥秘的科学舰队，稳定获取研究资源',
    skill: {
      name: '量子发现',
      description: '每回合必定获得2-4单位随机原料',
    },
    tradeFeeDiscount: 0,
    productionSpeedBonus: 0,
    eventDodgeChance: 0,
    materialPriceDiscount: 0,
    initialCapitalMultiplier: 1,
  },
  {
    id: 5,
    name: '神圣荣耀',
    description: '传说中的神圣舰队，受到星空的庇佑',
    skill: {
      name: '神圣裁决',
      description: '惩罚事件效果减半，奖励事件收益+25%',
    },
    tradeFeeDiscount: 0,
    productionSpeedBonus: 0,
    eventDodgeChance: 0,
    materialPriceDiscount: 0,
    initialCapitalMultiplier: 1,
  },
];

export const INITIAL_GOLD = 10000;

// 遗物兑换码：6位数字，100001-100005
export const RELICS: Record<string, { name: string; description: string; effect: string }> = {
  '100001': {
    name: '奥得律斯基亚水晶',
    description: '散发着柔和蓝光的远古水晶，蕴含着生命创造之力',
    effect: '每回合随机获得3个原料',
  },
  '100002': {
    name: '誊录仪',
    description: '自动记录所有交易并从中提炼财富的智慧装置',
    effect: '每回合增加你所有财富值1%的金币',
  },
  '100003': {
    name: '时空稳定锚',
    description: '锚定局部时空流速，让生产线的效率翻倍',
    effect: '每回合生产次数上限+2',
  },
  '100004': {
    name: '星际罗盘',
    description: '指向最有价值的星际航线，让你总能找到最好的交易',
    effect: '原料购买价格额外打9折',
  },
  '100005': {
    name: '命运之骰',
    description: '一颗永远停在六面的骰子，为持有者带来好运',
    effect: '所有事件金币收益+20%，损失-20%',
  },
};

export function createMotherships(): Mothership[] {
  return MOTHERSHIP_TEMPLATES.map((tpl) => ({
    ...tpl,
    sellPriceBonus: tpl.id === 3 ? 0.2 : 0,
    gold: Math.round(INITIAL_GOLD * tpl.initialCapitalMultiplier),
    // 新资源系统（初始：食物20，合金5，星尘5）
    food: 20,
    alloy: 5,
    stardust: 5,
    modules: [],
    installedModuleIds: [],
    stockHoldings: {},
    stockCosts: {},
    stockBuyTurn: {},
    materials: {
      carbon: 0,
      gold_ore: 0,
      oil: 0,
      dark_matter: 0,
      silicon: 0,
      quantum: 0,
    },
    products: [],
    productionQueue: [],
    productionsThisTurn: 0,
    maxProductionsPerTurn: 5,
    usedCodes: [],
    loans: [],
    bankrupt: false,
    bankruptTimer: 0,
    famineTimer: 0,
    isRebellion: false,
    relics: [],
    // 星际贸易系统：随机停靠一个势力
    tradeStatus: {
      currentFactionId: FACTIONS[Math.floor(Math.random() * FACTIONS.length)].id,
      targetFactionId: null,
      travelTurnsRemaining: 0,
      inventory: {},
      factionStates: {},
      exploredThisTurn: false,
      intelGatheredInFaction: null,
    },
    goldLog: [],
  }));
}

// ==================== 股票数据（100只科幻股，10板块×10只） ====================

export const INITIAL_STOCKS: Omit<Stock, 'prices' | 'currentPrice'>[] = [
  // ===== 能源 × 10 =====
  { id: 's01', name: '戴森球能源', description: '巨型能源采集企业，掌握恒星能量利用技术', sector: '能源', basePrice: 320, volatility: 0.24 },
  { id: 's02', name: '黑洞能源公司', description: '利用黑洞辐射提取清洁能量的先驱', sector: '能源', basePrice: 410, volatility: 0.3 },
  { id: 's03', name: '星云能源采集', description: '星云气体提取与核聚变燃料生产', sector: '能源', basePrice: 260, volatility: 0.26 },
  { id: 's04', name: '零点能科技', description: '真空零点能提取技术的开拓者', sector: '能源', basePrice: 380, volatility: 0.34 },
  { id: 's05', name: '反物质发电站', description: '反物质湮灭发电技术商业化运营', sector: '能源', basePrice: 520, volatility: 0.4 },
  { id: 's31', name: '恒星收割者', description: '直接从恒星表面采集等离子体能源', sector: '能源', basePrice: 440, volatility: 0.38 },
  { id: 's32', name: '引力波发电', description: '利用引力波扰动产生电能', sector: '能源', basePrice: 360, volatility: 0.32 },
  { id: 's33', name: '等离子核心', description: '可控等离子体反应堆制造商', sector: '能源', basePrice: 400, volatility: 0.29 },
  { id: 's34', name: '日冕能源站', description: '在恒星日冕层建设的能量采集站', sector: '能源', basePrice: 480, volatility: 0.35 },
  { id: 's35', name: '冷聚变动力', description: '室温核聚变技术的商业化先锋', sector: '能源', basePrice: 350, volatility: 0.3 },
  // ===== 科技 × 10 =====
  { id: 's06', name: '跃迁引擎科技', description: '超空间引擎研发先锋，引领星际航行革命', sector: '科技', basePrice: 450, volatility: 0.35 },
  { id: 's07', name: '银河人工智能', description: '通用人工智能与量子计算解决方案', sector: '科技', basePrice: 520, volatility: 0.4 },
  { id: 's08', name: '水晶矩阵科技', description: '量子水晶存储与超光速通信技术', sector: '科技', basePrice: 480, volatility: 0.38 },
  { id: 's09', name: '时间胶囊科技', description: '时间膨胀商业应用与冷藏休眠技术', sector: '科技', basePrice: 600, volatility: 0.46 },
  { id: 's10', name: '维度折叠科技', description: '高维空间折叠与超维存储技术', sector: '科技', basePrice: 580, volatility: 0.48 },
  { id: 's36', name: '全息网络集团', description: '跨星系全息通信与数据传输', sector: '科技', basePrice: 460, volatility: 0.34 },
  { id: 's37', name: '纳米机器人工厂', description: '医用与工业用纳米机器人批量生产', sector: '科技', basePrice: 510, volatility: 0.4 },
  { id: 's38', name: '意识上传公司', description: '人类意识数字化保存与转移服务', sector: '科技', basePrice: 620, volatility: 0.45 },
  { id: 's39', name: '基因编辑科技', description: 'CRISPR-X外星基因编辑技术', sector: '科技', basePrice: 540, volatility: 0.38 },
  { id: 's40', name: '虚拟现实帝国', description: '完全沉浸式VR世界开发与运营', sector: '科技', basePrice: 430, volatility: 0.32 },
  // ===== 军工 × 10 =====
  { id: 's13', name: '赛博坦军工', description: '星际战舰与防御系统制造商', sector: '军工', basePrice: 360, volatility: 0.34 },
  { id: 's14', name: '虚空护盾工业', description: '能量护盾与防护系统研发制造', sector: '军工', basePrice: 310, volatility: 0.22 },
  { id: 's15', name: '星际安保集团', description: '私人军事承包与星际安保服务', sector: '军工', basePrice: 270, volatility: 0.3 },
  { id: 's16', name: '深空导弹系统', description: '超远程星际导弹与防御平台', sector: '军工', basePrice: 340, volatility: 0.32 },
  { id: 's17', name: '隐形战机集团', description: '光学隐形与雷达屏蔽战机研发', sector: '军工', basePrice: 390, volatility: 0.29 },
  { id: 's41', name: '死星建设集团', description: '行星级别超级武器的设计与建造', sector: '军工', basePrice: 580, volatility: 0.46 },
  { id: 's42', name: '无人机蜂群', description: 'AI控制的自主战斗无人机编队', sector: '军工', basePrice: 330, volatility: 0.3 },
  { id: 's43', name: '轨道炮台公司', description: '行星轨道防御炮台系统', sector: '军工', basePrice: 370, volatility: 0.26 },
  { id: 's44', name: '机甲制造厂', description: '人形战斗机甲与工程机甲', sector: '军工', basePrice: 410, volatility: 0.34 },
  { id: 's45', name: '粒子束武器', description: '高能粒子束定向能武器系统', sector: '军工', basePrice: 450, volatility: 0.35 },
  // ===== 生物 × 10 =====
  { id: 's18', name: '泰坦生物工程', description: '外星生物基因编辑与合成生物技术', sector: '生物', basePrice: 380, volatility: 0.32 },
  { id: 's46', name: '外星农场集团', description: '外星生态作物种植与食品生产', sector: '生物', basePrice: 290, volatility: 0.24 },
  { id: 's49', name: '基因种子银行', description: '濒危物种与外星星球生物基因库', sector: '生物', basePrice: 310, volatility: 0.22 },
  { id: 's50', name: '生物计算机', description: '利用DNA和蛋白质进行数据运算', sector: '生物', basePrice: 470, volatility: 0.35 },
  { id: 's11', name: '光子计算集团', description: '光量子计算芯片与光子神经网络', sector: '生物', basePrice: 550, volatility: 0.42 },
  { id: 's12', name: '神经网络科技', description: '跨物种脑机接口与意识上传', sector: '生物', basePrice: 490, volatility: 0.35 },
  { id: 's61', name: '辐射耐受基因', description: '赋予生物超强辐射抗性的基因改造', sector: '生物', basePrice: 159, volatility: 0.22 },
  { id: 's62', name: '合成肉类公司', description: '实验室培育的星际旅行用高蛋白合成肉', sector: '生物', basePrice: 167, volatility: 0.26 },
  { id: 's63', name: '寄生治愈生物', description: '利用改良寄生虫进行靶向治疗的生物技术', sector: '生物', basePrice: 359, volatility: 0.35 },
  { id: 's64', name: '光合作用增强', description: '让人类获得光合作用能力的基因改造', sector: '生物', basePrice: 380, volatility: 0.24 },
  // ===== 医疗 × 10 =====
  { id: 's19', name: '星际医疗联盟', description: '先进医疗技术跨物种医疗服务', sector: '医疗', basePrice: 340, volatility: 0.19 },
  { id: 's20', name: '克隆器官公司', description: '人体器官克隆与再生医学', sector: '医疗', basePrice: 420, volatility: 0.26 },
  { id: 's47', name: '永生科技公司', description: '端粒修复与细胞年轻化疗法', sector: '医疗', basePrice: 560, volatility: 0.4 },
  { id: 's48', name: '赛博义肢工厂', description: '生物电子融合义肢与增强植入物', sector: '医疗', basePrice: 380, volatility: 0.29 },
  { id: 's65', name: '睡眠优化舱', description: '压缩睡眠周期同时提升质量的医疗舱', sector: '医疗', basePrice: 435, volatility: 0.42 },
  { id: 's66', name: '精神健康网络', description: '跨物种心理健康诊断与治疗服务', sector: '医疗', basePrice: 228, volatility: 0.29 },
  { id: 's67', name: '疫苗快速反应', description: '针对新型外星病原体的快速疫苗研发', sector: '医疗', basePrice: 450, volatility: 0.42 },
  { id: 's68', name: '远程手术机器人', description: '跨星球远程操控的精密手术系统', sector: '医疗', basePrice: 138, volatility: 0.19 },
  { id: 's69', name: '疼痛消除芯片', description: '植入式神经阻断疼痛感知芯片', sector: '医疗', basePrice: 149, volatility: 0.34 },
  { id: 's70', name: '神经修复科技', description: '修复受损神经系统的纳米医疗技术', sector: '医疗', basePrice: 225, volatility: 0.4 },
  // ===== 金融 × 10 =====
  { id: 's21', name: '星际联邦债券', description: '星际联邦发行的低风险债券基金', sector: '金融', basePrice: 180, volatility: 0.15 },
  { id: 's22', name: '星际联邦银行', description: '跨星系金融服务与信贷机构', sector: '金融', basePrice: 250, volatility: 0.16 },
  { id: 's23', name: '量子保险箱', description: '量子加密与星际资产安全存储', sector: '金融', basePrice: 430, volatility: 0.22 },
  { id: 's24', name: '星际仲裁庭', description: '跨星系法律服务与纠纷解决机构', sector: '金融', basePrice: 200, volatility: 0.15 },
  { id: 's25', name: '星际保险集团', description: '星际航行与战斗损伤保险', sector: '金融', basePrice: 220, volatility: 0.18 },
  { id: 's71', name: '养老金管理', description: '星际移民的长期养老金投资管理', sector: '金融', basePrice: 265, volatility: 0.35 },
  { id: 's72', name: '星际加密货币', description: '基于量子加密的跨星系去中心化货币', sector: '金融', basePrice: 281, volatility: 0.38 },
  { id: 's73', name: '保险精算系统', description: '基于大数据的星际风险评估与定价', sector: '金融', basePrice: 449, volatility: 0.3 },
  { id: 's74', name: '信用评级机构', description: '跨星球企业和政府信用评级', sector: '金融', basePrice: 319, volatility: 0.18 },
  { id: 's75', name: '投资基金管理', description: '专注新兴星球开发的私募股权基金', sector: '金融', basePrice: 210, volatility: 0.34 },
  // ===== 资源 × 10 =====
  { id: 's26', name: '暗物质提炼厂', description: '稀有暗物质的提取与精炼加工', sector: '资源', basePrice: 550, volatility: 0.45 },
  { id: 's27', name: '深空矿业集团', description: '小行星带与小行星矿藏开采企业', sector: '资源', basePrice: 280, volatility: 0.29 },
  { id: 's76', name: '废料回收处理', description: '太空垃圾回收和资源再利用', sector: '资源', basePrice: 225, volatility: 0.29 },
  { id: 's77', name: '土壤改造公司', description: '将荒芜星球土壤改造为可耕地', sector: '资源', basePrice: 145, volatility: 0.3 },
  { id: 's78', name: '贵重金属采矿', description: '小行星贵金属深空开采作业', sector: '资源', basePrice: 233, volatility: 0.26 },
  { id: 's79', name: '稀土提炼集团', description: '外星球稀土元素提取与分离', sector: '资源', basePrice: 288, volatility: 0.22 },
  { id: 's80', name: '氦-3开采公司', description: '月球和小行星氦-3燃料大规模开采', sector: '资源', basePrice: 367, volatility: 0.4 },
  { id: 's81', name: '晶体矿场集团', description: '开采具有特殊光学性质的天然晶体', sector: '资源', basePrice: 460, volatility: 0.38 },
  { id: 's82', name: '冰矿开采企业', description: '从彗星和冰冻小行星提取水资源', sector: '资源', basePrice: 239, volatility: 0.34 },
  { id: 's83', name: '地热能源开采', description: '利用行星内部地热资源的能源公司', sector: '资源', basePrice: 161, volatility: 0.42 },
  // ===== 科研教育 × 10 =====
  { id: 's28', name: '星际考古协会', description: '古代文明遗迹发掘与远古科技回收', sector: '科研教育', basePrice: 390, volatility: 0.32 },
  { id: 's29', name: '星际教育联盟', description: '跨星球知识传播与技能培训学校', sector: '科研教育', basePrice: 130, volatility: 0.16 },
  { id: 's84', name: '星际法学院', description: '教授跨星球法律体系的专业学院', sector: '科研教育', basePrice: 259, volatility: 0.42 },
  { id: 's85', name: '音乐合成工厂', description: '融合各星球音乐风格的创作工作室', sector: '科研教育', basePrice: 479, volatility: 0.26 },
  { id: 's86', name: '体育竞技联盟', description: '组织跨星球体育赛事的联盟', sector: '科研教育', basePrice: 236, volatility: 0.19 },
  { id: 's87', name: '机器人学院', description: '培养AI和机器人工程师的星际学校', sector: '科研教育', basePrice: 118, volatility: 0.29 },
  { id: 's88', name: '哲学思想库', description: '汇集各文明哲学思想的跨文化研究中心', sector: '科研教育', basePrice: 302, volatility: 0.22 },
  { id: 's89', name: '艺术创意中心', description: '汇集全星系艺术家的创意孵化器', sector: '科研教育', basePrice: 395, volatility: 0.4 },
  { id: 's90', name: '历史档案馆', description: '收集保存各文明历史的全息档案馆', sector: '科研教育', basePrice: 490, volatility: 0.22 },
  { id: 's91', name: '烹饪研究院', description: '研究外星食材烹饪方法的食品科学机构', sector: '科研教育', basePrice: 187, volatility: 0.24 },
  // ===== 基建设施 × 10 =====
  { id: 's51', name: '星门建设集团', description: '星际传送门网络建设与维护', sector: '基建设施', basePrice: 290, volatility: 0.19 },
  { id: 's52', name: '虫洞维护公司', description: '天然虫洞稳定与人工虫洞开凿', sector: '基建设施', basePrice: 500, volatility: 0.29 },
  { id: 's54', name: '轨道电梯公司', description: '行星表面到轨道的太空电梯建设', sector: '基建设施', basePrice: 350, volatility: 0.26 },
  { id: 's53', name: '虚空航运公司', description: '星际货运与物流运输网络', sector: '基建设施', basePrice: 170, volatility: 0.24 },
  { id: 's55', name: '星际港口集团', description: '星际港口与码头设施运营', sector: '基建设施', basePrice: 230, volatility: 0.19 },
  { id: 's58', name: '星际快递公司', description: '跨星系即时快递与闪送服务', sector: '基建设施', basePrice: 190, volatility: 0.26 },
  { id: 's92', name: '生命支持系统', description: '密闭环境的空气和水循环系统', sector: '基建设施', basePrice: 460, volatility: 0.19 },
  { id: 's93', name: '海底城市建造', description: '外星海洋底部城市的设计与施工', sector: '基建设施', basePrice: 368, volatility: 0.35 },
  { id: 's94', name: '浮动城市工程', description: '气态巨行星大气层浮动平台', sector: '基建设施', basePrice: 106, volatility: 0.42 },
  { id: 's95', name: '轨道空间站', description: '建设和运营轨道居住空间站', sector: '基建设施', basePrice: 390, volatility: 0.22 },
  // ===== 娱乐服务 × 10 =====
  { id: 's56', name: '银河娱乐集团', description: '跨星球度假村与虚拟娱乐帝国', sector: '娱乐服务', basePrice: 220, volatility: 0.29 },
  { id: 's57', name: '超新星观光', description: '极端天体现象观赏与太空旅游', sector: '娱乐服务', basePrice: 160, volatility: 0.35 },
  { id: 's60', name: '星际传媒集团', description: '跨星球新闻与娱乐内容制作', sector: '娱乐服务', basePrice: 250, volatility: 0.22 },
  { id: 's30', name: '宇宙终点殡葬', description: '星际遗体处理与数字意识保存服务', sector: '娱乐服务', basePrice: 240, volatility: 0.19 },
  { id: 's59', name: '新地平线移民', description: '星际移民服务与外星定居支持', sector: '娱乐服务', basePrice: 210, volatility: 0.26 },
  { id: 's96', name: '美食配送网络', description: '跨星球美食即时配送服务', sector: '娱乐服务', basePrice: 361, volatility: 0.3 },
  { id: 's97', name: '主题公园联盟', description: '各星球特色主题公园运营商', sector: '娱乐服务', basePrice: 264, volatility: 0.29 },
  { id: 's98', name: '家政机器人', description: '智能家政机器人租赁和销售', sector: '娱乐服务', basePrice: 172, volatility: 0.26 },
  { id: 's99', name: '侦探事务所', description: '跨星球调查和安全咨询服务', sector: '娱乐服务', basePrice: 318, volatility: 0.35 },
  { id: 's100', name: '美容整形医院', description: '跨物种外形改造医疗美容', sector: '娱乐服务', basePrice: 298, volatility: 0.38 },
];

export function createStocks(): Stock[] {
  return INITIAL_STOCKS.map((s) => {
    const prices = generateInitialPrices(s.basePrice, s.volatility, 10);
    return {
      ...s,
      prices,
      currentPrice: prices[prices.length - 1],
    };
  });
}

function generateInitialPrices(base: number, volatility: number, count: number): number[] {
  const prices: number[] = [base];
  for (let i = 1; i < count; i++) {
    const change = (rng() - 0.5) * 2 * volatility;
    const newPrice = Math.max(10, Math.round(prices[i - 1] * (1 + change)));
    prices.push(newPrice);
  }
  return prices;
}

// ==================== 原料数据（6种） ====================

// 原料上限倍率（从基准价出发，最多涨多少）
export const MAT_MAX_UP: Record<string, number> = {
  carbon: 2.0,    // 碳块 最多涨200% → 最高150
  silicon: 2.0,   // 硅片 最多涨200% → 最高300
  oil: 2.0,       // 石油 最多涨200% → 最高600
  gold_ore: 2.0,  // 黄金 最多涨200% → 最高900
  quantum: 3.0,   // 量子簇 最多涨300% → 最高1800
  dark_matter: 3.0, // 暗物质 最多涨300% → 最高2000
};

export const INITIAL_MATERIALS: Omit<RawMaterial, 'prices' | 'currentPrice'>[] = [
  { id: 'carbon', name: '碳块', basePrice: 50 },
  { id: 'gold_ore', name: '黄金', basePrice: 300 },
  { id: 'oil', name: '石油', basePrice: 200 },
  { id: 'dark_matter', name: '暗物质', basePrice: 500 },
  { id: 'silicon', name: '硅片', basePrice: 100 },
  { id: 'quantum', name: '量子簇', basePrice: 450 },
];

export function createMaterials(): RawMaterial[] {
  return INITIAL_MATERIALS.map((m) => {
    // 初始价格在基准价 ±10% 范围内随机
    const lower = Math.round(m.basePrice * 0.9);
    const upper = Math.round(m.basePrice * 1.1);
    const initial = lower + Math.floor(rng() * (upper - lower + 1));
    const prices: number[] = [];
    for (let i = 0; i < 10; i++) {
      prices.push(initial);
    }
    return { ...m, prices, currentPrice: initial };
  });
}

// ==================== 产品配方（25种） ====================

export const RECIPES: Recipe[] = [
  // 1回合（简单配方，10种）
  { id: 'p01', productName: '量子绸缎', description: '用于高端能量护盾的纺织材料', inputs: [{ materialId: 'gold_ore', amount: 2 }, { materialId: 'quantum', amount: 1 }], productionTurns: 1 },
  { id: 'p04', productName: '纳米修复液', description: '船体与设备自动修复溶液', inputs: [{ materialId: 'carbon', amount: 3 }, { materialId: 'oil', amount: 2 }], productionTurns: 1 },
  { id: 'p07', productName: '生物培养基', description: '外星生态系统维持培养液', inputs: [{ materialId: 'carbon', amount: 4 }, { materialId: 'oil', amount: 1 }], productionTurns: 1 },
  { id: 'p12', productName: '星际信标', description: '深空导航与求救信号发射器', inputs: [{ materialId: 'silicon', amount: 2 }, { materialId: 'quantum', amount: 1 }, { materialId: 'carbon', amount: 2 }], productionTurns: 1 },
  { id: 'p16', productName: '基因改造药剂', description: '临时增强人体能力的注射药剂', inputs: [{ materialId: 'carbon', amount: 2 }, { materialId: 'oil', amount: 1 }, { materialId: 'gold_ore', amount: 1 }], productionTurns: 1 },
  { id: 'p22', productName: '外星香料', description: '珍稀外星植物提取的调味香料', inputs: [{ materialId: 'carbon', amount: 2 }, { materialId: 'oil', amount: 2 }], productionTurns: 1 },
  { id: 'p02', productName: '暗能燃料棒', description: '飞船核心动力燃料', inputs: [{ materialId: 'dark_matter', amount: 1 }, { materialId: 'oil', amount: 3 }], productionTurns: 1 },
  { id: 'p18', productName: '太阳能帆板', description: '高效星际航行用光压推进帆', inputs: [{ materialId: 'silicon', amount: 5 }, { materialId: 'gold_ore', amount: 1 }], productionTurns: 1 },
  { id: 'p05', productName: '星际导航芯片', description: '高精度星际航线计算芯片', inputs: [{ materialId: 'silicon', amount: 4 }, { materialId: 'gold_ore', amount: 1 }], productionTurns: 1 },
  { id: 'p14', productName: '全息投影仪', description: '超真实全息影像生成设备', inputs: [{ materialId: 'silicon', amount: 3 }, { materialId: 'gold_ore', amount: 1 }, { materialId: 'carbon', amount: 1 }], productionTurns: 1 },
  // 2回合（中等配方，10种）
  { id: 'p08', productName: '能量转换器', description: '多形式能量高效转换装置', inputs: [{ materialId: 'gold_ore', amount: 1 }, { materialId: 'silicon', amount: 2 }, { materialId: 'oil', amount: 2 }], productionTurns: 2 },
  { id: 'p11', productName: '碳晶装甲板', description: '超轻超强星际船体装甲', inputs: [{ materialId: 'carbon', amount: 5 }, { materialId: 'gold_ore', amount: 1 }], productionTurns: 1 },
  { id: 'p17', productName: '引力锚定器', description: '固定飞船位置的引力发生装置', inputs: [{ materialId: 'dark_matter', amount: 1 }, { materialId: 'silicon', amount: 3 }], productionTurns: 1 },
  { id: 'p19', productName: '冷冻休眠舱', description: '长途星际旅行的低温休眠设备', inputs: [{ materialId: 'carbon', amount: 3 }, { materialId: 'quantum', amount: 1 }, { materialId: 'oil', amount: 1 }], productionTurns: 2 },
  { id: 'p21', productName: '星际合金锭', description: '超强度多用途星际建筑合金', inputs: [{ materialId: 'carbon', amount: 3 }, { materialId: 'gold_ore', amount: 2 }, { materialId: 'silicon', amount: 1 }], productionTurns: 2 },
  { id: 'p24', productName: '生态修复舱', description: '修复受损星球生态的环境装置', inputs: [{ materialId: 'carbon', amount: 4 }, { materialId: 'oil', amount: 2 }, { materialId: 'gold_ore', amount: 1 }], productionTurns: 2 },
  { id: 'p03', productName: '量子处理器', description: '超光速计算机核心组件', inputs: [{ materialId: 'silicon', amount: 3 }, { materialId: 'quantum', amount: 2 }], productionTurns: 2 },
  { id: 'p10', productName: '量子通讯器', description: '无视距离即时通讯终端', inputs: [{ materialId: 'quantum', amount: 3 }, { materialId: 'silicon', amount: 2 }], productionTurns: 2 },
  { id: 'p25', productName: '跃迁燃料添加剂', description: '提升跃迁引擎效率的催化添加剂', inputs: [{ materialId: 'quantum', amount: 1 }, { materialId: 'oil', amount: 3 }, { materialId: 'dark_matter', amount: 1 }], productionTurns: 2 },
  { id: 'p15', productName: '反物质容器', description: '安全储存反物质的磁约束罐', inputs: [{ materialId: 'dark_matter', amount: 1 }, { materialId: 'gold_ore', amount: 2 }, { materialId: 'quantum', amount: 2 }], productionTurns: 2 },
  // 3回合（复杂配方，5种）
  { id: 'p06', productName: '暗物质炸弹', description: '军事级大规模杀伤武器', inputs: [{ materialId: 'dark_matter', amount: 3 }, { materialId: 'quantum', amount: 1 }], productionTurns: 3 },
  { id: 'p09', productName: '重力稳定器', description: '人工重力场生成与稳定设备', inputs: [{ materialId: 'dark_matter', amount: 2 }, { materialId: 'gold_ore', amount: 2 }], productionTurns: 3 },
  { id: 'p13', productName: '时间减缓场', description: '局部时间流速控制装置', inputs: [{ materialId: 'dark_matter', amount: 2 }, { materialId: 'quantum', amount: 3 }], productionTurns: 3 },
  { id: 'p20', productName: '相位护盾发生器', description: '可穿透实体物质的相位偏移护盾', inputs: [{ materialId: 'dark_matter', amount: 2 }, { materialId: 'quantum', amount: 2 }, { materialId: 'gold_ore', amount: 1 }], productionTurns: 3 },
  { id: 'p23', productName: '灵能增幅器', description: '增强灵能者精神力量的装置', inputs: [{ materialId: 'quantum', amount: 2 }, { materialId: 'dark_matter', amount: 1 }, { materialId: 'silicon', amount: 2 }], productionTurns: 2 },
];

// 产品售价波动范围（每个产品独立）
export const PRODUCT_PRICE_LIMITS: Record<string, { maxUp: number; maxDown: number }> = {
  p07: { maxUp: 0.20, maxDown: 0.15 }, // 生物培养基
  p22: { maxUp: 0.60, maxDown: 0.75 }, // 外星香料
  p04: { maxUp: 0.30, maxDown: 0.55 }, // 纳米修复液
  p11: { maxUp: 0.20, maxDown: 0.75 }, // 碳晶装甲板
  p16: { maxUp: 0.30, maxDown: 0.75 }, // 基因改造药剂
  p14: { maxUp: 0.20, maxDown: 0.75 }, // 全息投影仪
  p05: { maxUp: 0.40, maxDown: 0.40 }, // 星际导航芯片
  p12: { maxUp: 0.20, maxDown: 0.45 }, // 星际信标
  p17: { maxUp: 0.40, maxDown: 0.45 }, // 引力锚定器
  p19: { maxUp: 0.55, maxDown: 0.55 }, // 冷冻休眠舱
  p18: { maxUp: 0.35, maxDown: 0.55 }, // 太阳能帆板
  p21: { maxUp: 0.20, maxDown: 0.75 }, // 星际合金锭
  p08: { maxUp: 1.00, maxDown: 0.70 }, // 能量转换器
  p24: { maxUp: 0.20, maxDown: 0.75 }, // 生态修复舱
  p01: { maxUp: 0.20, maxDown: 0.75 }, // 量子绸缎
  p02: { maxUp: 0.50, maxDown: 0.75 }, // 暗能燃料棒
  p03: { maxUp: 0.40, maxDown: 0.75 }, // 量子处理器
  p10: { maxUp: 0.20, maxDown: 0.55 }, // 量子通讯器
  p09: { maxUp: 0.30, maxDown: 0.80 }, // 重力稳定器
  p23: { maxUp: 0.60, maxDown: 0.75 }, // 灵能增幅器
  p25: { maxUp: 0.70, maxDown: 0.75 }, // 跃迁燃料添加剂
  p06: { maxUp: 0.30, maxDown: 0.25 }, // 暗物质炸弹
  p15: { maxUp: 0.15, maxDown: 0.25 }, // 反物质容器
  p20: { maxUp: 0.60, maxDown: 0.65 }, // 相位护盾发生器
  p13: { maxUp: 1.00, maxDown: 0.70 }, // 时间减缓场
};

export const INITIAL_PRODUCTS: Omit<Product, 'sellPrices' | 'currentSellPrice' | 'priceMaxUp' | 'priceMaxDown'>[] = [
  // 1回合（12种）
  { id: 'p07', name: '生物培养基', description: '外星生态系统维持培养液', baseSellPrice: 734, productionTurns: 1 },
  { id: 'p22', name: '外星香料', description: '珍稀外星植物提取的调味香料', baseSellPrice: 827, productionTurns: 1 },
  { id: 'p04', name: '纳米修复液', description: '船体与设备自动修复溶液', baseSellPrice: 891, productionTurns: 1 },
  { id: 'p11', name: '碳晶装甲板', description: '超轻超强星际船体装甲', baseSellPrice: 892, productionTurns: 1 },
  { id: 'p16', name: '基因改造药剂', description: '临时增强人体能力的注射药剂', baseSellPrice: 907, productionTurns: 1 },
  { id: 'p14', name: '全息投影仪', description: '超真实全息影像生成设备', baseSellPrice: 969, productionTurns: 1 },
  { id: 'p05', name: '星际导航芯片', description: '高精度星际航线计算芯片', baseSellPrice: 1034, productionTurns: 1 },
  { id: 'p12', name: '星际信标', description: '深空导航与求救信号发射器', baseSellPrice: 1050, productionTurns: 1 },
  { id: 'p17', name: '引力锚定器', description: '固定飞船位置的引力发生装置', baseSellPrice: 1145, productionTurns: 1 },
  { id: 'p19', name: '冷冻休眠舱', description: '长途星际旅行的低温休眠设备', baseSellPrice: 1105, productionTurns: 1 },
  { id: 'p18', name: '太阳能帆板', description: '高效星际航行用光压推进帆', baseSellPrice: 1130, productionTurns: 1 },
  { id: 'p01', name: '量子绸缎', description: '用于高端能量护盾的纺织材料', baseSellPrice: 1759, productionTurns: 2 },
  // 2回合（10种）
  { id: 'p21', name: '星际合金锭', description: '超强度多用途星际建筑合金', baseSellPrice: 1597, productionTurns: 2 },
  { id: 'p08', name: '能量转换器', description: '多形式能量高效转换装置', baseSellPrice: 1609, productionTurns: 2 },
  { id: 'p24', name: '生态修复舱', description: '修复受损星球生态的环境装置', baseSellPrice: 1622, productionTurns: 2 },
  { id: 'p02', name: '暗能燃料棒', description: '飞船核心动力燃料', baseSellPrice: 1823, productionTurns: 2 },
  { id: 'p03', name: '量子处理器', description: '超光速计算机核心组件', baseSellPrice: 1919, productionTurns: 2 },
  { id: 'p10', name: '量子通讯器', description: '无视距离即时通讯终端', baseSellPrice: 2269, productionTurns: 2 },
  { id: 'p09', name: '重力稳定器', description: '人工重力场生成与稳定设备', baseSellPrice: 2323, productionTurns: 2 },
  { id: 'p23', name: '灵能增幅器', description: '增强灵能者精神力量的装置', baseSellPrice: 2318, productionTurns: 2 },
  { id: 'p15', name: '反物质容器', description: '安全储存反物质的磁约束罐', baseSellPrice: 3272, productionTurns: 3 },
  { id: 'p20', name: '相位护盾发生器', description: '可穿透实体物质的相位偏移护盾', baseSellPrice: 3479, productionTurns: 3 },
  // 3回合（3种）
  { id: 'p06', name: '暗物质炸弹', description: '军事级大规模杀伤武器', baseSellPrice: 3249, productionTurns: 3 },
  { id: 'p25', name: '跃迁燃料添加剂', description: '提升跃迁引擎效率的催化添加剂', baseSellPrice: 3160, productionTurns: 3 },
  { id: 'p13', name: '时间减缓场', description: '局部时间流速控制装置', baseSellPrice: 3723, productionTurns: 3 },
];

export function createProducts(): Product[] {
  return INITIAL_PRODUCTS.map((p) => {
    const limits = PRODUCT_PRICE_LIMITS[p.id] || { maxUp: 0.20, maxDown: 0.15 };
    // 初始价格在基准价 ±10% 范围内随机
    const lower = Math.round(p.baseSellPrice * 0.9);
    const upper = Math.round(p.baseSellPrice * 1.1);
    const initial = lower + Math.floor(rng() * (upper - lower + 1));
    const prices: number[] = [];
    for (let i = 0; i < 10; i++) prices.push(initial);
    return { ...p, sellPrices: prices, currentSellPrice: initial, priceMaxUp: limits.maxUp, priceMaxDown: limits.maxDown };
  });
}

// ==================== 随机事件库 ====================


// ==================== 兑换码（30组固定6位数字，可重复使用）====================
// 分布: 10个500, 5个1000, 5个2000, 5个3000, 3个5000, 2个10000

export const REDEEM_CODES: Record<string, number> = {
  // 500金币 x10
  '412112': 500, '594859': 500, '196906': 500, '886176': 500, '706749': 500,
  '792548': 500, '771130': 500, '212436': 500, '745518': 500, '384533': 500,
  // 1000金币 x5
  '100511': 1000, '585325': 1000, '212016': 1000, '258463': 1000, '133694': 1000,
  // 2000金币 x5
  '735706': 2000, '258726': 2000, '571396': 2000, '825752': 2000, '576195': 2000,
  // 3000金币 x5
  '706766': 3000, '894164': 3000, '833287': 3000, '181041': 3000, '999630': 3000,
  // 5000金币 x3
  '168203': 5000, '553879': 5000, '986448': 5000,
  // 10000金币 x2
  '377425': 10000, '624987': 10000,
};

export function getRedeemCodeList(): string[] {
  return Object.keys(REDEEM_CODES);
}
