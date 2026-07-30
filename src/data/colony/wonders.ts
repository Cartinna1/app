import type { WonderDef, WonderEventDef } from '@/types/colony';

/** 五座奇观完整定义 */
export const ALL_WONDERS: WonderDef[] = [
  // ===== 戴森球 =====
  {
    id: 'dyson', name: '戴森球', subtitle: '工业霸权',
    description: '一千亿块镜面环绕着一颗恒星，在虚空中缓缓展开成一道吞噬光明的环。每一缕星光穿透镜阵后都被转化为永恒的能量——你的熔炉从此不再需要燃料，因为整颗恒星都在为你燃烧。这不是发电站，这是你给宇宙写下的第一条工业宣言。',
    preferredPlanets: '沙漠/干旱',
    totalLines: ['75.5万金币', '合金 4,470', '硅片 2,120', '量子簇 1,105', '暗物质 695'],
    stages: [
      { name:'选址勘察', turns:3, gold:5000, alloy:50, silicon:40, quantum:0, dark_matter:0, stardust:0, food:0, carbon:0, oil:0, gold_ore:0, research:0 },
      { name:'轨道平台', turns:3, gold:8000, alloy:80, silicon:65, quantum:0, dark_matter:0, stardust:0, food:0, carbon:0, oil:0, gold_ore:0, research:0 },
      { name:'结构骨架', turns:4, gold:12000, alloy:120, silicon:95, quantum:10, dark_matter:0, stardust:0, food:0, carbon:0, oil:0, gold_ore:0, research:0 },
      { name:'镜面铺设', turns:5, gold:18000, alloy:160, silicon:130, quantum:20, dark_matter:0, stardust:0, food:0, carbon:0, oil:0, gold_ore:0, research:0 },
      { name:'能量管路', turns:5, gold:25000, alloy:200, silicon:100, quantum:35, dark_matter:15, stardust:0, food:0, carbon:0, oil:0, gold_ore:0, research:0 },
      { name:'聚变点火', turns:3, gold:35000, alloy:250, silicon:0, quantum:50, dark_matter:30, stardust:0, food:0, carbon:0, oil:0, gold_ore:0, research:0 },
      { name:'等离子约束', turns:4, gold:50000, alloy:300, silicon:0, quantum:60, dark_matter:50, stardust:0, food:0, carbon:0, oil:0, gold_ore:0, research:0 },
      { name:'恒星触燃', turns:3, gold:70000, alloy:350, silicon:0, quantum:80, dark_matter:80, stardust:0, food:0, carbon:0, oil:0, gold_ore:0, research:0 },
    ],
  },
  // ===== 银河之门 =====
  {
    id: 'gate', name: '银河之门', subtitle: '星海拓荒者',
    description: '在宇宙最古老的虫洞遗迹上，你建起了一道违反所有物理法则的巨门。暗物质在门框中流动如静脉中的血，星尘在奇点核心凝聚成通路的锚点。推开它，三千光年坍缩成一步的距离。',
    preferredPlanets: '极地/苔原',
    totalLines: ['90万金币', '星尘 3,195', '暗物质 2,570', '量子簇 955', '合金 350'],
    stages: [
      { name:'虫洞测绘', turns:3, gold:6000, alloy:0, silicon:0, quantum:0, dark_matter:40, stardust:30, food:0, carbon:0, oil:0, gold_ore:0, research:0 },
      { name:'引力锚定', turns:3, gold:10000, alloy:0, silicon:0, quantum:0, dark_matter:60, stardust:45, food:0, carbon:0, oil:0, gold_ore:0, research:0 },
      { name:'奇点开凿', turns:4, gold:15000, alloy:0, silicon:0, quantum:20, dark_matter:80, stardust:60, food:0, carbon:0, oil:0, gold_ore:0, research:0 },
      { name:'门框铸造', turns:5, gold:20000, alloy:30, silicon:0, quantum:35, dark_matter:90, stardust:75, food:0, carbon:0, oil:0, gold_ore:0, research:0 },
      { name:'维度支架', turns:5, gold:30000, alloy:0, silicon:0, quantum:50, dark_matter:100, stardust:90, food:0, carbon:0, oil:0, gold_ore:0, research:0 },
      { name:'能量矩阵', turns:3, gold:45000, alloy:50, silicon:0, quantum:65, dark_matter:60, stardust:110, food:0, carbon:0, oil:0, gold_ore:0, research:0 },
      { name:'相位校准', turns:4, gold:65000, alloy:0, silicon:0, quantum:80, dark_matter:80, stardust:130, food:0, carbon:0, oil:0, gold_ore:0, research:0 },
      { name:'深渊激活', turns:3, gold:90000, alloy:0, silicon:0, quantum:0, dark_matter:100, stardust:160, food:0, carbon:0, oil:0, gold_ore:0, research:0 },
    ],
  },
  // ===== 创世引擎 =====
  {
    id: 'engine', name: '创世引擎', subtitle: '生命播种者',
    description: '你建造的不是机器，是一颗可以编程的行星心脏。它吸入灰烬、岩屑和死寂的大气，呼出雨林、洋流和漫天飞鸟。三十个回合前这里还是一片沉默的岩石，现在风里有了泥土的气味。',
    preferredPlanets: '海洋/热带',
    totalLines: ['34.3万金币', '食物 30,700', '碳块 4,730', '石油 1,985', '暗物质 320'],
    stages: [
      { name:'生态测绘', turns:4, gold:3000, alloy:0, silicon:0, quantum:0, dark_matter:0, stardust:0, food:300, carbon:80, oil:0, gold_ore:0, research:0 },
      { name:'地壳预热', turns:3, gold:5000, alloy:0, silicon:0, quantum:0, dark_matter:0, stardust:0, food:450, carbon:110, oil:30, gold_ore:0, research:0 },
      { name:'大气注入', turns:5, gold:8000, alloy:0, silicon:0, quantum:0, dark_matter:0, stardust:0, food:600, carbon:140, oil:45, gold_ore:0, research:0 },
      { name:'海洋催生', turns:4, gold:12000, alloy:0, silicon:0, quantum:0, dark_matter:0, stardust:0, food:800, carbon:170, oil:60, gold_ore:15, research:0 },
      { name:'微生物播撒', turns:4, gold:15000, alloy:0, silicon:0, quantum:0, dark_matter:0, stardust:0, food:1000, carbon:200, oil:75, gold_ore:0, research:0 },
      { name:'森林序曲', turns:4, gold:20000, alloy:0, silicon:0, quantum:0, dark_matter:20, stardust:0, food:1300, carbon:150, oil:90, gold_ore:0, research:0 },
      { name:'物种觉醒', turns:3, gold:30000, alloy:0, silicon:0, quantum:0, dark_matter:30, stardust:0, food:1600, carbon:100, oil:100, gold_ore:20, research:0 },
      { name:'盖亚降临', turns:3, gold:50000, alloy:0, silicon:0, quantum:0, dark_matter:50, stardust:0, food:2000, carbon:0, oil:50, gold_ore:0, research:0 },
    ],
  },
  // ===== 时间档案馆 =====
  {
    id: 'archive', name: '时间档案馆', subtitle: '智识永存',
    description: '一座纯粹由硅晶与量子晶格构成的知识圣殿。你把整个文明从第一个钻木取火的夜晚到最后一艘母舰的蓝图，一座不落地压缩进这枚永不衰变的水晶。告诉宇宙——我们活过。',
    preferredPlanets: '高山/极地',
    totalLines: ['65.7万金币', '硅片 3,170', '量子簇 2,740', '暗物质 1,095', '科研点 114,400'],
    stages: [
      { name:'基座铸造', turns:3, gold:5000, alloy:0, silicon:60, quantum:0, dark_matter:0, stardust:0, food:0, carbon:0, oil:0, gold_ore:0, research:800 },
      { name:'晶格生长', turns:3, gold:8000, alloy:0, silicon:90, quantum:30, dark_matter:0, stardust:0, food:0, carbon:0, oil:0, gold_ore:0, research:1200 },
      { name:'时空锚定', turns:4, gold:12000, alloy:0, silicon:110, quantum:50, dark_matter:15, stardust:0, food:0, carbon:0, oil:0, gold_ore:0, research:1800 },
      { name:'数据洪流', turns:5, gold:18000, alloy:0, silicon:140, quantum:70, dark_matter:25, stardust:0, food:0, carbon:0, oil:0, gold_ore:0, research:2500 },
      { name:'维度编织', turns:5, gold:25000, alloy:0, silicon:170, quantum:90, dark_matter:35, stardust:0, food:0, carbon:0, oil:0, gold_ore:0, research:3500 },
      { name:'因果织网', turns:3, gold:35000, alloy:0, silicon:100, quantum:110, dark_matter:50, stardust:0, food:0, carbon:0, oil:0, gold_ore:0, research:5000 },
      { name:'永恒凝固', turns:4, gold:50000, alloy:0, silicon:80, quantum:130, dark_matter:65, stardust:0, food:0, carbon:0, oil:0, gold_ore:0, research:7000 },
      { name:'智识永存', turns:3, gold:70000, alloy:0, silicon:0, quantum:160, dark_matter:80, stardust:0, food:0, carbon:0, oil:0, gold_ore:0, research:10000 },
    ],
  },
  // ===== 统一信标 =====
  {
    id: 'beacon', name: '统一信标', subtitle: '万邦来朝',
    description: '黄金铸成的信标核心悬浮在十道势力舰队的交汇点上，每秒向全银河播送一段翻译成所有语言的信息。你不需要征服银河，你只需要让银河听见自己。',
    preferredPlanets: '草原/陆地',
    totalLines: ['115.4万金币', '金矿 3,640', '碳块 2,620', '星尘 650', '暗物质 420'],
    stages: [
      { name:'外交筹备', turns:5, gold:8000, alloy:0, silicon:0, quantum:0, dark_matter:0, stardust:0, food:0, carbon:60, oil:0, gold_ore:40, research:0 },
      { name:'信标地基', turns:4, gold:15000, alloy:20, silicon:0, quantum:0, dark_matter:0, stardust:0, food:0, carbon:90, oil:0, gold_ore:60, research:0 },
      { name:'星联邀请', turns:5, gold:20000, alloy:0, silicon:0, quantum:0, dark_matter:0, stardust:10, food:0, carbon:110, oil:0, gold_ore:80, research:0 },
      { name:'联邦宪章', turns:3, gold:30000, alloy:0, silicon:0, quantum:0, dark_matter:0, stardust:15, food:0, carbon:130, oil:0, gold_ore:100, research:0 },
      { name:'势力调和', turns:4, gold:45000, alloy:0, silicon:0, quantum:0, dark_matter:15, stardust:25, food:0, carbon:80, oil:0, gold_ore:120, research:0 },
      { name:'利益共约', turns:3, gold:60000, alloy:0, silicon:0, quantum:0, dark_matter:25, stardust:30, food:0, carbon:60, oil:0, gold_ore:140, research:0 },
      { name:'万邦签署', turns:3, gold:80000, alloy:0, silicon:0, quantum:0, dark_matter:35, stardust:40, food:0, carbon:40, oil:0, gold_ore:160, research:0 },
      { name:'银河纪元', turns:3, gold:120000, alloy:0, silicon:0, quantum:0, dark_matter:50, stardust:50, food:0, carbon:0, oil:0, gold_ore:200, research:0 },
    ],
  },
];

export function getWonderDef(id: string): WonderDef | undefined {
  return ALL_WONDERS.find((w) => w.id === id);
}

// ==================== 建设事件定义 ====================

export const WONDER_EVENTS: WonderEventDef[] = [
  {
    id: 'tech_breakthrough', name: '技术突破',
    description: '你的科学家团队在施工过程中意外发现了一种革命性的结构方案，可以将大量建筑步骤合并执行。',
    optionA: { label: '投入 5,000 金币加速', effect: '直接推进 3 回合' },
    optionB: { label: '暂不采用', effect: '不加不减，继续建设' },
  },
  {
    id: 'construction_accident', name: '施工事故',
    description: '一场突如其来的框架坍塌摧毁了部分已完成的结构。工头报告说需要紧急调配合金进行抢修。',
    optionA: { label: '花费 30 合金抢修', effect: '回复正常，进度不变' },
    optionB: { label: '放任不管', effect: '倒退 2 回合' },
  },
  {
    id: 'faction_intervention', name: '势力干预',
    description: '某个星际势力对你的庞大工程提出了抗议，声称其引力扰动干扰了他们的贸易航线。他们的舰队正在逼近。',
    optionA: { label: '支付 10,000 金币和解', effect: '继续建设' },
    optionB: { label: '拒绝赔偿', effect: '工程冻结 3 回合' },
  },
  {
    id: 'unexpected_discovery', name: '意外之喜',
    description: '工人在挖掘地基时意外发现了一处远古文明遗迹，里面保存着与你工程高度相关的技术资料。',
    optionA: { label: '全力研究遗迹', effect: '直接推进 4 回合' },
    optionB: { label: '小心挖掘并归档', effect: '获得 20 科研点' },
  },
  {
    id: 'plague_outbreak', name: '瘟疫爆发',
    description: '建筑工地上突然爆发了一种未知的病原体，数十名工人倒下。医疗官要求紧急调配食物进行隔离。',
    optionA: { label: '调配 200 食物隔离', effect: '继续建设' },
    optionB: { label: '不管继续施工', effect: '死亡 3 人口，倒退 1 回合' },
  },
  {
    id: 'sabotage', name: '破坏行动',
    description: '极端组织潜入工地纵火，一座建筑和大量施工设备被毁。安保系统需要紧急升级。',
    optionA: { label: '花费 5,000 金币增援安保', effect: '继续建设' },
    optionB: { label: '强行继续', effect: '损失 1 座随机建筑，倒退 3 回合' },
  },
  {
    id: 'leader_sacrifice', name: '领袖献身',
    description: '一名 3 级领袖主动找到你，表示愿意将自己的毕生知识和经验永久注入工程核心——这将大大加速建设，但代价是他将永远离开。',
    optionA: { label: '接受献身', effect: '直接推进 8 回合，该领袖永久消失' },
    optionB: { label: '婉拒', effect: '继续建设，领袖留任' },
  },
];

/** 随机触发一个事件 */
export function rollWonderEvent(): WonderEventDef {
  const r = Math.random();
  if (r < 0.25) return WONDER_EVENTS[0]; // 技术突破 25%
  if (r < 0.45) return WONDER_EVENTS[1]; // 施工事故 20%
  if (r < 0.60) return WONDER_EVENTS[2]; // 势力干预 15%
  if (r < 0.75) return WONDER_EVENTS[3]; // 意外之喜 15%
  if (r < 0.85) return WONDER_EVENTS[4]; // 瘟疫爆发 10%
  if (r < 0.95) return WONDER_EVENTS[5]; // 破坏行动 10%
  return WONDER_EVENTS[6];                 // 领袖献身 5%
}
