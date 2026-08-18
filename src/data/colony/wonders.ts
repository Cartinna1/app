import type { WonderDef } from '@/types/colony';

/** 五座奇观完整定义 */
export const ALL_WONDERS: WonderDef[] = [
  // ===== 戴森球 =====
  {
    id: 'dyson', name: '戴森球', subtitle: '工业霸权',
    description: '一千亿块镜面环绕着一颗恒星，在虚空中缓缓展开成一道吞噬光明的环。每一缕星光穿透镜阵后都被转化为永恒的能量——你的熔炉从此不再需要燃料，因为整颗恒星都在为你燃烧。这不是发电站，这是你给宇宙写下的第一条工业宣言。',
    preferredPlanets: '沙漠/干旱',
    totalLines: ['900万金币', '合金 24,400', '硅片 5,550', '量子簇 9,450', '暗物质 6,050'],
    stages: [
      { name:'选址勘察', turns:3, gold:100000, alloy:500, silicon:100, quantum:0, dark_matter:0, stardust:0, food:0, carbon:0, oil:0, gold_ore:0, research:0 },
      { name:'轨道平台', turns:3, gold:200000, alloy:600, silicon:150, quantum:0, dark_matter:0, stardust:0, food:0, carbon:0, oil:0, gold_ore:0, research:0 },
      { name:'结构骨架', turns:4, gold:250000, alloy:700, silicon:200, quantum:100, dark_matter:0, stardust:0, food:0, carbon:0, oil:0, gold_ore:0, research:0 },
      { name:'镜面铺设', turns:5, gold:250000, alloy:800, silicon:300, quantum:200, dark_matter:0, stardust:0, food:0, carbon:0, oil:0, gold_ore:0, research:0 },
      { name:'能量管路', turns:5, gold:300000, alloy:800, silicon:500, quantum:350, dark_matter:150, stardust:0, food:0, carbon:0, oil:0, gold_ore:0, research:0 },
      { name:'聚变点火', turns:3, gold:350000, alloy:900, silicon:0, quantum:500, dark_matter:300, stardust:0, food:0, carbon:0, oil:0, gold_ore:0, research:0 },
      { name:'等离子约束', turns:4, gold:450000, alloy:1000, silicon:0, quantum:600, dark_matter:500, stardust:0, food:0, carbon:0, oil:0, gold_ore:0, research:0 },
      { name:'恒星触燃', turns:3, gold:500000, alloy:1200, silicon:0, quantum:800, dark_matter:800, stardust:0, food:0, carbon:0, oil:0, gold_ore:0, research:0 },
    ],
  },
  // ===== 银河之门 =====
  {
    id: 'gate', name: '银河之门', subtitle: '星海拓荒者',
    description: '在宇宙最古老的虫洞遗迹上，你建起了一道违反所有物理法则的巨门。暗物质在门框中流动如静脉中的血，星尘在奇点核心凝聚成通路的锚点。推开它，三千光年坍缩成一步的距离。',
    preferredPlanets: '极地/苔原',
    totalLines: ['218万金币', '合金 11,400', '量子簇 10,200', '暗物质 12,050', '星尘 2,000'],
    stages: [
      { name:'虫洞测绘', turns:3, gold:50000, alloy:0, silicon:0, quantum:0, dark_matter:100, stardust:40, food:0, carbon:0, oil:0, gold_ore:0, research:0 },
      { name:'引力锚定', turns:3, gold:50000, alloy:300, silicon:0, quantum:0, dark_matter:150, stardust:40, food:0, carbon:0, oil:0, gold_ore:0, research:0 },
      { name:'奇点开凿', turns:4, gold:60000, alloy:300, silicon:0, quantum:200, dark_matter:300, stardust:50, food:0, carbon:0, oil:0, gold_ore:0, research:0 },
      { name:'门框铸造', turns:5, gold:60000, alloy:300, silicon:0, quantum:350, dark_matter:400, stardust:50, food:0, carbon:0, oil:0, gold_ore:0, research:0 },
      { name:'维度支架', turns:5, gold:70000, alloy:300, silicon:0, quantum:500, dark_matter:500, stardust:60, food:0, carbon:0, oil:0, gold_ore:0, research:0 },
      { name:'能量矩阵', turns:3, gold:80000, alloy:500, silicon:0, quantum:650, dark_matter:500, stardust:60, food:0, carbon:0, oil:0, gold_ore:0, research:0 },
      { name:'相位校准', turns:4, gold:90000, alloy:600, silicon:0, quantum:800, dark_matter:500, stardust:110, food:0, carbon:0, oil:0, gold_ore:0, research:0 },
      { name:'深渊激活', turns:3, gold:130000, alloy:800, silicon:0, quantum:0, dark_matter:700, stardust:130, food:0, carbon:0, oil:0, gold_ore:0, research:0 },
    ],
  },
  // ===== 创世引擎 =====
  {
    id: 'engine', name: '创世引擎', subtitle: '生命播种者',
    description: '你建造的不是机器，是一颗可以编程的行星心脏。它吸入灰烬、岩屑和死寂的大气，呼出雨林、洋流和漫天飞鸟。三十个回合前这里还是一片沉默的岩石，现在风里有了泥土的气味。',
    preferredPlanets: '海洋/热带',
    totalLines: ['554万金币', '食物 73,000', '碳块 37,300', '石油 1,965', '暗物质 2,900', '金矿 5,600'],
    stages: [
      { name:'生态测绘', turns:4, gold:60000, alloy:0, silicon:0, quantum:0, dark_matter:0, stardust:0, food:1000, carbon:800, oil:0, gold_ore:0, research:0 },
      { name:'地壳预热', turns:3, gold:100000, alloy:0, silicon:0, quantum:0, dark_matter:0, stardust:0, food:1000, carbon:1100, oil:30, gold_ore:0, research:0 },
      { name:'大气注入', turns:5, gold:150000, alloy:0, silicon:0, quantum:0, dark_matter:0, stardust:0, food:2000, carbon:1400, oil:45, gold_ore:0, research:0 },
      { name:'海洋催生', turns:4, gold:200000, alloy:0, silicon:0, quantum:0, dark_matter:0, stardust:0, food:2000, carbon:1700, oil:60, gold_ore:500, research:0 },
      { name:'微生物播撒', turns:4, gold:200000, alloy:0, silicon:0, quantum:0, dark_matter:0, stardust:0, food:3000, carbon:2000, oil:75, gold_ore:0, research:0 },
      { name:'森林序曲', turns:4, gold:250000, alloy:0, silicon:0, quantum:0, dark_matter:200, stardust:0, food:3000, carbon:1500, oil:90, gold_ore:0, research:0 },
      { name:'物种觉醒', turns:3, gold:250000, alloy:0, silicon:0, quantum:0, dark_matter:300, stardust:0, food:4000, carbon:1000, oil:100, gold_ore:500, research:0 },
      { name:'盖亚降临', turns:3, gold:300000, alloy:0, silicon:0, quantum:0, dark_matter:400, stardust:0, food:4000, carbon:0, oil:150, gold_ore:700, research:0 },
    ],
  },
  // ===== 时间档案馆 =====
  {
    id: 'archive', name: '时间档案馆', subtitle: '智识永存',
    description: '一座纯粹由硅晶与量子晶格构成的知识圣殿。你把整个文明从第一个钻木取火的夜晚到最后一艘母舰的蓝图，一座不落地压缩进这枚永不衰变的水晶。告诉宇宙——我们活过。',
    preferredPlanets: '高山/极地',
    totalLines: ['467万金币', '合金 13,600', '硅片 11,910', '量子簇 5,790', '暗物质 3,280', '科研点 742,000'],
    stages: [
      { name:'基座铸造', turns:3, gold:50000, alloy:100, silicon:150, quantum:0, dark_matter:0, stardust:0, food:0, carbon:0, oil:0, gold_ore:0, research:5000 },
      { name:'晶格生长', turns:3, gold:80000, alloy:200, silicon:300, quantum:100, dark_matter:0, stardust:0, food:0, carbon:0, oil:0, gold_ore:0, research:5000 },
      { name:'时空锚定', turns:4, gold:120000, alloy:300, silicon:350, quantum:180, dark_matter:50, stardust:0, food:0, carbon:0, oil:0, gold_ore:0, research:8000 },
      { name:'数据洪流', turns:5, gold:180000, alloy:400, silicon:400, quantum:180, dark_matter:100, stardust:0, food:0, carbon:0, oil:0, gold_ore:0, research:10000 },
      { name:'维度编织', turns:5, gold:180000, alloy:500, silicon:440, quantum:180, dark_matter:150, stardust:0, food:0, carbon:0, oil:0, gold_ore:0, research:20000 },
      { name:'因果织网', turns:3, gold:180000, alloy:600, silicon:480, quantum:190, dark_matter:170, stardust:0, food:0, carbon:0, oil:0, gold_ore:0, research:30000 },
      { name:'永恒凝固', turns:4, gold:200000, alloy:700, silicon:880, quantum:300, dark_matter:180, stardust:0, food:0, carbon:0, oil:0, gold_ore:0, research:50000 },
      { name:'智识永存', turns:3, gold:220000, alloy:800, silicon:0, quantum:400, dark_matter:200, stardust:0, food:0, carbon:0, oil:0, gold_ore:0, research:80000 },
    ],
  },
  // ===== 统一信标 =====
  {
    id: 'beacon', name: '统一信标', subtitle: '万邦来朝',
    description: '黄金铸成的信标核心悬浮在十道势力舰队的交汇点上，每秒向全银河播送一段翻译成所有语言的信息。你不需要征服银河，你只需要让银河听见自己。',
    preferredPlanets: '草原/陆地',
    totalLines: ['280万金币', '合金 3,200', '碳块 8,160', '金矿 28,000', '星尘 1,470', '暗物质 3,900'],
    stages: [
      { name:'外交筹备', turns:5, gold:50000, alloy:0, silicon:0, quantum:0, dark_matter:0, stardust:0, food:0, carbon:600, oil:0, gold_ore:400, research:0 },
      { name:'信标地基', turns:4, gold:50000, alloy:800, silicon:0, quantum:0, dark_matter:0, stardust:0, food:0, carbon:900, oil:0, gold_ore:600, research:0 },
      { name:'星联邀请', turns:5, gold:60000, alloy:0, silicon:0, quantum:0, dark_matter:0, stardust:50, food:0, carbon:110, oil:0, gold_ore:800, research:0 },
      { name:'联邦宪章', turns:3, gold:80000, alloy:0, silicon:0, quantum:0, dark_matter:0, stardust:50, food:0, carbon:130, oil:0, gold_ore:800, research:0 },
      { name:'势力调和', turns:4, gold:100000, alloy:0, silicon:0, quantum:0, dark_matter:150, stardust:50, food:0, carbon:80, oil:0, gold_ore:1000, research:0 },
      { name:'利益共约', turns:3, gold:120000, alloy:0, silicon:0, quantum:0, dark_matter:250, stardust:50, food:0, carbon:60, oil:0, gold_ore:1200, research:0 },
      { name:'万邦签署', turns:3, gold:150000, alloy:0, silicon:0, quantum:0, dark_matter:350, stardust:120, food:0, carbon:40, oil:0, gold_ore:1400, research:0 },
      { name:'银河纪元', turns:3, gold:200000, alloy:0, silicon:0, quantum:0, dark_matter:500, stardust:120, food:0, carbon:0, oil:0, gold_ore:1800, research:0 },
    ],
  },
];

export function getWonderDef(id: string): WonderDef | undefined {
  return ALL_WONDERS.find((w) => w.id === id);
}
