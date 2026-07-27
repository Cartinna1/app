import type { ResearchTech } from '@/types/colony';

export const ALL_TECHS: ResearchTech[] = [
  // ===== T1 都市级穹顶理论 =====
  { id: 'T1', name: '都市级穹顶理论', unlocksBuilding: 'B2',
    description: '"我们不再栖身于穹顶之下，我们让穹顶成为天空。"将生态穹顶的微缩循环逻辑，以城市尺度进行数学重构。通过动态气候模拟、群体心理学建模与超大规模生命维持系统集成，我们终于可以设计出一个能容纳数十万人口、拥有完整生态与文化的巨构穹顶。在异星荒原上，一座穹顶都市就是一颗跳动的人造心脏，是文明向宇宙递交的宣言。',
    costRP: 300, researchTurns: 2, prerequisites: [] },
  // ===== T2 碳基重组法则 =====
  { id: 'T2', name: '碳基重组法则', unlocksBuilding: 'B4',
    description: '"蛋白质不再是生长出来的，而是被计算出来的。"纳米机械在分子层面将最普通的碳基原料——废料、气体、甚至尸体——重组为美味且高能的蛋白质。这条法则宣告了传统农业的终结，食物成了纯粹的数字游戏。',
    costRP: 360, researchTurns: 2, prerequisites: [] },
  // ===== T3 盖亚蓝图 =====
  { id: 'T3', name: '盖亚蓝图', unlocksBuilding: 'B5',
    description: '"世界是一个可以复制的花园。"一套全息设计图，记录了完整的大气循环、水文模型与物种共生矩阵。我们得以在荒芜星球上建造自循环的生态穹顶，它们是散落在银河中的生命孤岛，也是新世界的种子。',
    costRP: 1800, researchTurns: 3, prerequisites: ['T2'] },
  // ===== T4 晶格冶金学 =====
  { id: 'T4', name: '晶格冶金学', unlocksBuilding: 'B7',
    description: '"金属记住了星辰的锻造术。"重新定义金属的分子晶格排列，让合金在铸造过程中"生长"出完美晶体结构。产出的材料能承受恒星风暴的洗礼，是星际文明的骨骼。',
    costRP: 400, researchTurns: 2, prerequisites: [] },
  // ===== T5 星核工业原理 =====
  { id: 'T5', name: '星核工业原理', unlocksBuilding: 'B8',
    description: '"我们驯服了奇点，让它成为铁砧。"利用微型人造奇点产生的极端重力与温度，将物质直接压锻为传说中的"恒星合金"。这种材料能承受跨维度冲击，是建造恒星巨构与泰坦舰体的基石。',
    costRP: 2000, researchTurns: 3, prerequisites: ['T4'] },
  // ===== T6 星尘感知理论 =====
  { id: 'T6', name: '星尘感知理论', unlocksBuilding: 'B9',
    description: '"虚空从不虚空，它在低语。"解读宇宙微波背景辐射中的星尘涟漪，我们学会了制造超导丝线巨网，捕捉那些飘浮于恒星风中的微光。星尘，不再是神话，而是可收集的资源。',
    costRP: 2300, researchTurns: 4, prerequisites: ['T1', 'T2', 'T4'] },
  // ===== T7 星尘共鸣学说 =====
  { id: 'T7', name: '星尘共鸣学说', unlocksBuilding: 'B10',
    description: '"宇宙是一首宏大的交响诗，我们可以加入合唱。"一座刺破云层的共振晶体塔，它的核心频率与宇宙背景辐射完全同步。它不再被动等待星尘降临，而是主动呼唤——跨越光年将星尘牵引至自身身边，仿佛整个宇宙都在响应它的召唤。',
    costRP: 5000, researchTurns: 6, prerequisites: ['T6', 'T3', 'T5'] },
  // ===== T8 泛星系金融律法 =====
  { id: 'T8', name: '泛星系金融律法', unlocksBuilding: 'B12',
    description: '"市场是看不见的巨兽，律法是拴住它的缰绳。"一套融合了量子加密合约、跨星系税务协定与稀有资源期货对冲算法的超级金融法典框架。在泛星系金融交易所中，每一秒都在发生跨越数百光年的资本流动——而律法，是让它们不变成混沌的唯一保证。',
    costRP: 390, researchTurns: 2, prerequisites: [] },
  // ===== T9 异星地质沉积学 =====
  { id: 'T9', name: '异星地质沉积学', unlocksBuilding: 'B13',
    description: '"每一颗星球都用自己的方式书写历史，我们只是学会了阅读。"通过分析行星地质分层与沉积岩样本，我们破解了这颗星球碳氢化合物的形成密码。液态烃脉不再是无迹可寻的矿藏，而是可以被精准定位的黑色血脉。第一座碳氢化合物泵站，便是我们插入这颗星球历史书页中的第一枚书签。',
    costRP: 490, researchTurns: 3, prerequisites: [] },
  // ===== T10 行星声波共振勘探理论 =====
  { id: 'T10', name: '行星声波共振勘探理论', unlocksBuilding: 'B14',
    description: '"我们用声音去触碰大地深处的心跳。"发射特定频率的声波穿透岩层，通过分析回波中的共振异常，便能定位高密度贵金属矿脉。这套理论将勘探从"盲目挖掘"变成了"声呐导航"，金砂在声波的召唤下自行浮现。从此，行星的骨骼中藏着多少宝藏，我们一听了然。',
    costRP: 900, researchTurns: 2, prerequisites: ['T11'] },
  // ===== T11 大气碳循环解析模型 =====
  { id: 'T11', name: '大气碳循环解析模型', unlocksBuilding: 'B15',
    description: '"碳是宇宙的货币，大气是它的账本。"建立了这颗星球大气碳循环的完整数学模型，我们能够精准预测碳沉积物的富集区域——无论是冻土中的甲烷水合物，还是大气中的二氧化碳富集层。碳沉积采集器不再盲目地吸取大气，而是像渔夫一样，知道鱼群何时何地聚集。',
    costRP: 300, researchTurns: 2, prerequisites: [] },
  // ===== T12 暗物质粒子通量假说 =====
  { id: 'T12', name: '暗物质粒子通量假说', unlocksBuilding: 'B16',
    description: '"宇宙质量的百分之八十五在黑暗中流淌，我们决定不再视而不见。"提出暗物质并非完全不可探测，而是存在极微弱的相互作用截面。假说指出，当暗物质流穿过行星核心时，会因引力透镜效应产生短暂的"微闪"——虽然极其微弱，但可以被高灵敏度探测器阵列捕捉。暗物质捕获阱，便是将这一假说变为现实的第一次尝试。',
    costRP: 1500, researchTurns: 3, prerequisites: ['T10'] },
  // ===== T13 亚稳态量子涨落观测理论 =====
  { id: 'T13', name: '亚稳态量子涨落观测理论', unlocksBuilding: 'B17',
    description: '"虚空从不静止，它在沸腾。我们终于看到了泡沫。"通过建立超低温环境下的量子干涉观测矩阵，我们首次确认了量子涨落中存在极短暂的亚稳态粒子簇。虽然它们的寿命短到用皮秒衡量，但共振晶体可以在它们湮灭的瞬间将其"冻结"，从虚空中震出零点能的微光。量子谐振器，就是第一台能听到宇宙心跳的听诊器。',
    costRP: 1400, researchTurns: 3, prerequisites: [] },
  // ===== T14 选择性激光熔析原理 =====
  { id: 'T14', name: '选择性激光熔析原理', unlocksBuilding: 'B18',
    description: '"沙粒中藏着芯片的灵魂，我们只需要把它唤醒。"通过精确调谐激光频率，使其只与硅氧化物的分子键发生共振，从而在不熔化其他矿物的前提下，将硅从沙粒与岩层中分离出来。这项原理让硅晶提取从高能耗的化学流程变成了精准的光学手术，沙漠从此不再是荒芜之地，而是天然的硅晶矿田。',
    costRP: 320, researchTurns: 2, prerequisites: [] },
  // ===== T15 深地层渗透技术 =====
  { id: 'T15', name: '深地层渗透技术', unlocksBuilding: 'B19',
    description: '"我们刺穿行星的皮肤，去倾听它黑色的心跳。"结合抗地压合金与岩浆冷却系统，让钻探平台能像针管一样刺入地壳深处，提取那里蕴藏亿万年的液态碳氢化合物。那是行星的血液，也是工业的命脉。',
    costRP: 1400, researchTurns: 3, prerequisites: ['T9'] },
  // ===== T16 碳基重组工程 =====
  { id: 'T16', name: '碳基重组工程', unlocksBuilding: 'B20',
    description: '"一切碳基皆可为燃料，一切生命皆可为基石。"将任何有机物——无论是杂草、尸体还是废弃物——快速热解并重组成高密度碳块。碳，成了这颗星球上最通用的硬通货。',
    costRP: 1000, researchTurns: 2, prerequisites: ['T11'] },
  // ===== T17 暗物质相互作用模型 =====
  { id: 'T17', name: '暗物质相互作用模型', unlocksBuilding: 'B21',
    description: '"我们终于看见了那些从不与光共舞的幽灵。"通过引力透镜技术将弥散的暗物质聚集压缩，使原本无形的粒子流凝聚为可测量的暗紫色光柱。暗物质不再是理论家笔下的抽象符号，而是可以被捕获、储存并利用的战略资源。',
    costRP: 2500, researchTurns: 4, prerequisites: ['T12'] },
  // ===== T18 地核熔炼工程 =====
  { id: 'T18', name: '地核熔炼工程', unlocksBuilding: 'B22',
    description: '"黄金不是挖掘出来的，而是从地心泵取出来的。"利用行星内热与重力分异原理，在靠近地核的位置将分散的贵金属熔聚成纯矿脉，再通过电磁管道抽取至地表。这是对行星本身的炼金术。',
    costRP: 1300, researchTurns: 3, prerequisites: ['T10'] },
  // ===== T19 量子晶格生长原理 =====
  { id: 'T19', name: '量子晶格生长原理', unlocksBuilding: 'B23',
    description: '"我们将量子幽灵培养成了晶体。"在宏观尺度上，通过晶格场培育稳定量子晶体的方法。这些晶体可被用于操控现实结构、制造反物质或作为终极计算介质，是迈向神级文明的台阶。',
    costRP: 2200, researchTurns: 3, prerequisites: ['T13'] },
  // ===== T20 单原子精度制造协议 =====
  { id: 'T20', name: '单原子精度制造协议', unlocksBuilding: 'B24',
    description: '"完美的世界，从一个完美的原子开始。"在原子级层面进行硅晶圆制造的自动化协议。激光以单原子精度熔融硅晶，制造出平整度无可挑剔的晶圆。这是任何高算力芯片的母体，也是AI觉醒的温床。',
    costRP: 1250, researchTurns: 3, prerequisites: ['T14'] },
  // ===== T21 实用量子力学体系 =====
  { id: 'T21', name: '实用量子力学体系', unlocksBuilding: 'B26',
    description: '"在这里，现实只是一条可以被重写的代码。"将量子谐振器的零散发现系统化为一门完整的学科。量子实验室配备了超低温量子比特阵列、因果律隔离场与亚稳态粒子囚禁环，科学家们得以在受控环境中反复验证量子现象——从量子纠缠的宏观化，到虚粒子对的定向提取。它不仅是研究设施，更是通往量子编织、量子计算与量子现实等终极技术的大门。',
    costRP: 2700, researchTurns: 3, prerequisites: ['T12'] },
  // ===== T22 加速表型复制协议 =====
  { id: 'T22', name: '加速表型复制协议', unlocksBuilding: 'B28',
    description: '"灵魂是不可复制的——但一具能挥动镐头的躯体，我们只需要它的基因组。"突破了传统克隆的伦理桎梏与表型不稳定性难题。通过"加速表型协议"，我们能在数周内培育出完全成熟的克隆体，其肌肉记忆与基础技能被直接编码进神经模板。他们不是复制品，而是殖民地的"标准人类单元"。在生死存亡的殖民前线，每一个新克隆体踏出培育舱的脚步声，都是文明存续的鼓点。',
    costRP: 3000, researchTurns: 4, prerequisites: ['T3'] },
  // ===== T23 星际贤才招募法案 =====
  { id: 'T23', name: '星际贤才招募法案', leaderCapBonus: 1,
    description: '"银河广阔，人才不应被数字埋没。"制定跨星域的精英搜寻与快速归化法案，通过超光速通讯广播殖民地的愿景，吸引那些在群星间漂泊的天才。一套标准化的筛选、评估与信任建立流程，使得殖民地能够在维持正常运转的同时，额外容纳一位具有卓越才能的领袖。',
    costRP: 1000, researchTurns: 3, prerequisites: [] },
  // ===== T24 集体意识协同网络 =====
  { id: 'T24', name: '集体意识协同网络', leaderCapBonus: 3,
    description: '"我们不再指挥个体，我们编织灵魂的网络。"利用量子纠缠态与群体神经接口，构建一个覆盖整个殖民地的协同意识网络。领袖们的决策通过分布式智能实时优化，个体的认知负荷被集体分担。在网络的带宽极限内，殖民地能够同时容纳并协调更多领袖，他们如同一个超级有机体的不同器官般运作。',
    costRP: 2000, researchTurns: 5, prerequisites: ['T23'] },
];

export function getTechById(id: string): ResearchTech | undefined {
  return ALL_TECHS.find((t) => t.id === id);
}

export function getAvailableTechs(researchedIds: string[]): ResearchTech[] {
  return ALL_TECHS.filter((t) =>
    !researchedIds.includes(t.id) &&
    t.prerequisites.every((p) => researchedIds.includes(p))
  );
}