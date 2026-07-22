import type { ChoiceEvent } from '@/types/game';

/** 资源事件 — 30个（食物15 + 合金10 + 星尘5），以获取为主、三级嵌套 */
export const RESOURCE_EVENTS: ChoiceEvent[] = [
  {
    id: 'r_f01',
    name: '太空温室奇迹',
    description: '你的探测 drone 在一颗无人卫星上发现了一个仍在自动运行的古代太空温室——数千年的运行让里面的植物发生了奇妙的变异。',
    category: 'opportunity',
    options: [
      {
        label: '启动收获系统', description: '收割所有可食用的作物',
        outcomes: [
          {
            probability: 50,
            description: '收获系统喷涌而出大量的变异果实——营养丰富到不可思议。',
            message: '太空温室大丰收！获得了大量变异食物！',
            resources: { foodChange: 25 },
            subOutcomes: [
              { probability: 50, description: '清理温室时发现了一间隐藏的种子库。', message: '发现了古代种子库！额外获得了珍稀种子！', resources: { foodChange: 10 } },
              { probability: 50, description: '温室AI感谢你结束了它的孤独，给了你一个种植优化程序。', message: '获得了种植优化程序！食物产量提升！', resources: { foodChange: 5, goldChange: 500 } },
            ],
          },
          {
            probability: 35,
            description: '大部分作物已经过度生长，但核心区域还保存着一批高质量的食用植物。',
            message: '收获了核心区域的高质量作物！',
            resources: { foodChange: 15 },
          },
          {
            probability: 15,
            description: '收获系统启动时释放了大量休眠的花粉——虽然不致命，但让船员们打了一整天喷嚏。',
            message: '被花粉攻击了！但拿到了食物！阿嚏！',
            resources: { foodChange: 12, goldChange: -500 },
          },
        ],
      },
      {
        label: '只取种子', description: '拿走种子，自己种植',
        outcomes: [
          {
            probability: 100,
            description: '你小心翼翼地收集了温室中的各种种子。这是一笔长期投资。',
            message: '获得了太空植物种子！未来食物来源有保障了！',
            resources: { foodChange: 8, goldChange: 500 },
          },
        ],
      },
    ],
  },
  {
    id: 'r_f02',
    name: '坠毁的补给舰',
    description: '雷达探测到一颗荒凉的小行星表面有一道长长的划痕——坑里是一艘坠毁的联邦补给舰，船身上的标识显示它失踪了整整五年。',
    category: 'opportunity',
    options: [
      {
        label: '搜索货舱', description: '里面可能有食物',
        outcomes: [
          {
            probability: 55,
            description: '货舱里整齐排列着数千个真空密封的食物包——联邦标准的合成营养块，保质期长达十年。',
            message: '发现了大量真空密封的食物包！发财了！',
            resources: { foodChange: 30 },
          },
          {
            probability: 30,
            description: '货舱有一半已经被撞击损毁了，但另一半还保存完好。',
            message: '抢救出了一半的食物储备！',
            resources: { foodChange: 15 },
          },
          {
            probability: 15,
            description: '你撬开最后一个货柜时，一只受惊的太空老鼠窜了出来——它背后还跟着一窝小老鼠。它们其实是友好的，而且帮你清理出了更多食物。',
            message: '救了一窝太空老鼠！它们帮你找到了更多食物！',
            resources: { foodChange: 20, goldChange: 500 },
          },
        ],
      },
      {
        label: '搜索舰桥', description: '可能有更有价值的东西',
        outcomes: [
          {
            probability: 70,
            description: '舰桥里找到了加密的航行日志和一份备用星图。',
            message: '卖出了航行日志和星图！',
            resources: { goldChange: 800 },
          },
          {
            probability: 30,
            description: '舰桥里有一台还能用的合金回收装置。',
            message: '回收了合金回收装置！',
            resources: { alloyChange: 5 },
          },
        ],
      },
    ],
  },
  {
    id: 'r_f03',
    name: '外星果农的交易',
    description: '一艘造型奇特的有机飞船拦住了你——外壳看起来像是活的树皮。一个植物状的外星人出现在屏幕上："我...果实...很多。你...金属？交换？"',
    category: 'business',
    options: [
      {
        label: '用合金交换', description: '3合金换大量食物',
        outcomes: [
          {
            probability: 70,
            description: '外星果农对你的合金非常满意——在它的母星，金属是极其稀有的资源。它慷慨地多给了你一倍的果实。',
            message: '外星果农对你的合金很满意！多送了果实和种子！',
            resources: { alloyChange: -3, foodChange: 20 },
          },
          {
            probability: 30,
            description: '交易顺利完成。外星果农教会了你如何安全食用这些果实。',
            message: '成功交易！学会了外星果实的食用方法！',
            resources: { alloyChange: -3, foodChange: 12 },
          },
        ],
      },
      {
        label: '用星尘交换', description: '1星尘换大量食物',
        outcomes: [
          {
            probability: 80,
            description: '外星果农看到星尘的瞬间，它的"脸"上开出了花——字面意义上的。它激动得把整船的食物都堆到了交易平台上。',
            message: '外星果农对星尘 ecstatic！把整船食物都给你了！',
            resources: { stardustChange: -1, foodChange: 25 },
          },
          {
            probability: 20,
            description: '交易完成后，外星果农神秘地告诉你："种子...种下...更多。"',
            message: '交易完成！外星果农告诉你种子能种出更多食物！',
            resources: { stardustChange: -1, foodChange: 25 },
          },
        ],
      },
      {
        label: '请它上船吃饭', description: '文化交流也许有回报',
        outcomes: [
          {
            probability: 100,
            description: '你的船员们举办了一场"星际美食交流会"。外星果农被你们的合成食物逗乐了，留下了一整套外星种植技术和大量种子样本。',
            message: '美食交流会大成功！学会了外星种植技术！获得了大量种子！',
            resources: { foodChange: 15, goldChange: 500 },
          },
        ],
      },
    ],
  },
  {
    id: 'r_f04',
    name: '漂浮的生态舱',
    description: '你发现了一座 abandoned 的农业轨道站——里面的植物在无人照料的情况下运行了不知多少年，长满了茂盛的植物。',
    category: 'opportunity',
    options: [
      {
        label: '收获作物', description: '里面有大量可食用植物',
        outcomes: [
          {
            probability: 60,
            description: '生态舱里的植物经过多代自然选择，演化出了极高产量的品种。',
            message: '生态舱的作物产量惊人！大丰收！',
            resources: { foodChange: 22 },
          },
          {
            probability: 40,
            description: '大部分植物已经过熟，但核心区域的蔬菜区保存完好。',
            message: '收获了核心区域的新鲜蔬菜！',
            resources: { foodChange: 14 },
          },
        ],
      },
      {
        label: '研究生态系统', description: '学习它的循环原理',
        outcomes: [
          {
            probability: 100,
            description: '你花了一整天研究这个生态舱。它的循环原理堪称完美。你把这套系统设计图记录下来。',
            message: '学会了完美的生态循环系统！未来食物产量提升！',
            resources: { foodChange: 10, goldChange: 800 },
          },
        ],
      },
    ],
  },
  {
    id: 'r_f05',
    name: '美食星球的邀请函',
    description: '你收到了一份来自"Culinary Prime"的全息邀请函——一颗以美食闻名整个星系的星球。他们正在举办年度"星际食神大赛"，冠军将获得一整年的免费食物供应。',
    category: 'opportunity',
    options: [
      {
        label: '参赛', description: '带最好的食材去',
        outcomes: [
          {
            probability: 30,
            description: '你的大厨发挥出了前所未有的水平——一道"量子态海鲜汤"征服了所有评委。食神大赛冠军！',
            message: '赢得了食神大赛冠军！！一整年的免费食物！！',
            resources: { foodChange: 40, goldChange: 1200 },
          },
          {
            probability: 40,
            description: '虽然没有夺冠，但你们获得了一份"特别创意奖"——评委们对你用太空藻类做的甜品赞不绝口。',
            message: '获得了创意奖！奖品是大量高级食材！',
            resources: { foodChange: 20 },
          },
          {
            probability: 30,
            description: '比赛现场一位食材供应商看中了你们的创意，当场签了一份供应合同。',
            message: '认识了食材供应商！未来食物价格大幅降低！',
            resources: { foodChange: 10, goldChange: 800 },
          },
        ],
      },
      {
        label: '当评委', description: '以行业专家身份参与',
        outcomes: [
          {
            probability: 100,
            description: '你以"星际贸易商"的身份被邀请担任评委。你发现了几个极具潜力的参赛者——他们后来成了明星厨师，而你获得了他们的"终生免费晚餐"承诺。',
            message: '当评委结识了未来的明星厨师！获得了终生免费晚餐权！',
            resources: { foodChange: 15, goldChange: 500 },
          },
        ],
      },
    ],
  },
  {
    id: 'r_f06',
    name: '冬眠的巨兽',
    description: '你的舰队经过一颗冰封的卫星时，扫描仪检测到冰层下面有一个巨大的有机体。冰层表面生长着一层发光的藻类——含有极高的营养成分。',
    category: 'opportunity',
    options: [
      {
        label: '采集藻类', description: '安全地采集冰层表面的藻类',
        outcomes: [
          {
            probability: 70,
            description: '你派出了采集 drone，安全地收集了大量发光藻类。营养价值是普通合成食物的五倍。',
            message: '采集了大量高营养发光藻类！',
            resources: { foodChange: 18 },
          },
          {
            probability: 30,
            description: '采集过程中，冰层发出了一声低沉的"咕哝"——巨兽翻了个身！采集 drone 紧急撤回，但还是带回来了一些藻类。',
            message: '巨兽翻身了！吓得赶紧跑，但带回了藻类！',
            resources: { foodChange: 8 },
          },
        ],
      },
      {
        label: '采集深层样本', description: '靠近巨兽可能有更高收益',
        outcomes: [
          {
            probability: 40,
            description: '深层样本中发现了巨兽的"冬眠分泌物"——一种凝胶状物质，营养丰富到不可思议。',
            message: '发现了巨兽的冬眠分泌物！超级营养！',
            resources: { foodChange: 28, stardustChange: 1 },
          },
          {
            probability: 40,
            description: '采集很成功。回程时巨兽的一只眼睛睁开了——它看了你的 drone 一眼，又闭上了。像是在说"拿走就好，别吵醒我。"',
            message: '巨兽睁眼看了你一眼！但允许你带走样本！',
            resources: { foodChange: 15 },
          },
          {
            probability: 20,
            description: '巨兽突然打了个喷嚏。冰层崩裂。你的 drone 差点被埋在冰下。',
            message: '巨兽打喷嚏了！冰层崩裂！惊险采集完成！',
            resources: { foodChange: 10, goldChange: -500 },
          },
        ],
      },
    ],
  },
  {
    id: 'r_f07',
    name: '废弃的农业站',
    description: '你发现了一座 abandoned 的农业轨道站——station 的自动系统似乎还在运行，培养舱里长满了各种作物。',
    category: 'opportunity',
    options: [
      {
        label: '接入系统收获', description: '收割所有成熟的作物',
        outcomes: [
          {
            probability: 65,
            description: '农业站的 AI 热情地欢迎了你——它已经孤独地运行了十五年！它主动帮你收割了所有成熟的作物。',
            message: '农业站AI热情欢迎！收割了所有作物还给了种植建议！',
            resources: { foodChange: 25 },
          },
          {
            probability: 35,
            description: '农业站的部分培养舱已经故障，但核心系统还在运行。',
            message: '收获了核心区域的作物！',
            resources: { foodChange: 15 },
          },
        ],
      },
      {
        label: '修复并接管', description: '花费资源修复这个农业站',
        outcomes: [
          {
            probability: 100,
            description: '你投入了一些合金修复了农业站的核心系统。AI 同意定期向你供应食物——这是一个长期的食物来源！',
            message: '修复了农业站！获得了长期食物供应！',
            resources: { alloyChange: -5, foodChange: 20 },
          },
        ],
      },
    ],
  },
  {
    id: 'r_f08',
    name: '孢子云中的馈赠',
    description: '你的舰队穿过了一片色彩斑斓的孢子云。孢子附着在了船体上，科学官紧急报告：这些孢子是某种真菌的繁殖体——而且，它们富含蛋白质和碳水化合物。',
    category: 'opportunity',
    options: [
      {
        label: '收集孢子', description: '这些是可以吃的',
        outcomes: [
          {
            probability: 80,
            description: '你的船员们穿戴防护装备，在船体外壳上收集了大量的孢子。处理后变成了一种味道独特的粉状食物。',
            message: '收集了大量可食用孢子！',
            resources: { foodChange: 15 },
          },
          {
            probability: 20,
            description: '孢子中有一部分是某种极其稀有的品种——营养价值极高，在黑市上价格不菲。',
            message: '发现了稀有孢子品种！营养极高！',
            resources: { foodChange: 22, goldChange: 500 },
          },
        ],
      },
      {
        label: '让孢子继续生长', description: '在船上的培养舱中培育',
        outcomes: [
          {
            probability: 100,
            description: '你把孢子样本放进了培养舱。几天后，它们长成了一片微型真菌森林——持续不断地产出食物。',
            message: '孢子在培养舱里长成了真菌森林！持续产出食物！',
            resources: { foodChange: 12 },
          },
        ],
      },
    ],
  },
  {
    id: 'r_f09',
    name: '黑洞渔场',
    description: '你遇到了一群在黑洞边缘捕鱼的太空渔民——他们利用黑洞的引力透镜效应聚集一种名为"时空鳟"的奇特生物。据说味道"像是在嘴里绽放的超新星"。',
    category: 'business',
    options: [
      {
        label: '学习捕鱼技术', description: '掌握这门危险但高回报的技术',
        outcomes: [
          {
            probability: 60,
            description: '渔民们耐心地教了你如何在黑洞边缘安全捕鱼。你捕获了大量的时空鳟。',
            message: '学会了黑洞捕鱼技术！捕获了大量时空鳟！',
            resources: { foodChange: 20, goldChange: -500 },
          },
          {
            probability: 40,
            description: '学习过程中，一位老渔民偷偷教了你一个"秘密钓点"——那里的时空鳟特别多。',
            message: '老渔民给了你秘密钓点！超额收获！',
            resources: { foodChange: 25, stardustChange: 1 },
          },
        ],
      },
      {
        label: '直接购买', description: '用金币买现成的',
        outcomes: [
          {
            probability: 100,
            description: '渔民们很乐意把多余的鱼卖给你——在他们看来，这些鱼只是日常食物，但对星际旅行者来说价值连城。',
            message: '购买了大量时空鳟！',
            resources: { goldChange: -500, foodChange: 18 },
          },
        ],
      },
    ],
  },
  {
    id: 'r_f10',
    name: '基因库探险',
    description: '你发现了一座 buried 在冰层下的古代基因库——里面保存着数以百万计的地球植物基因样本。核心区域还保持着低温保存状态。',
    category: 'opportunity',
    options: [
      {
        label: '提取可食用植物基因', description: '找到能种植的食物来源',
        outcomes: [
          {
            probability: 50,
            description: '你成功提取了数十种古代可食用植物的基因——水稻、小麦、番茄、土豆...这些都是传说中的"天然食物"。',
            message: '提取了古代食用植物基因！传说中的天然食物！',
            resources: { foodChange: 20, goldChange: 800 },
          },
          {
            probability: 35,
            description: '提取过程中，你意外激活了一种高产作物的基因序列——它的生长速度是普通作物的十倍。',
            message: '发现了超高产作物基因！食物产量将大幅提升！',
            resources: { foodChange: 15 },
          },
          {
            probability: 15,
            description: '提取过程中发生了一点小意外——一种基因样本泄漏到了培养舱里。但它开始快速生长， producing 可食用的果实。',
            message: '基因样本意外泄漏！但它长出了可食用果实！',
            resources: { foodChange: 12 },
          },
        ],
      },
      {
        label: '出售基因数据', description: '科研机构会为此支付高价',
        outcomes: [
          {
            probability: 100,
            description: '你把基因数据卖给了一家生物技术公司。他们对这些古代基因样本 ecstatic。',
            message: '出售古代基因数据获得了巨额回报！',
            resources: { goldChange: 2000, foodChange: 5 },
          },
        ],
      },
    ],
  },
  {
    id: 'r_f11',
    name: '星际快递',
    description: '一艘自动快递 drone 误把你当成了收件人，在你船旁边徘徊不去。扫描显示它携带的是一批高端合成食物。',
    category: 'opportunity',
    options: [
      {
        label: '收下快递', description: '不是我的但我收下了',
        outcomes: [
          {
            probability: 70,
            description: '你"不小心"按下了接收按钮。Drone 欢快地交出了货物，然后快乐地飞走了。',
            message: '收到了误投的快递！里面全是高端食物！',
            resources: { foodChange: 15 },
          },
          {
            probability: 30,
            description: '你刚收下快递，真正的收件人就追来了。你只好分了一半给他。',
            message: '和真正的收件人平分了快递！',
            resources: { foodChange: 8, goldChange: 500 },
          },
        ],
      },
      {
        label: '退货', description: '不是我的我不要',
        outcomes: [
          {
            probability: 100,
            description: '你把快递退了。发件人为了感谢你的诚实，送了你一箱食物作为"诚实奖金"。',
            message: '退货后获得了诚实奖金！',
            resources: { foodChange: 5, goldChange: 500 },
          },
        ],
      },
    ],
  },
  {
    id: 'r_f12',
    name: '太空蛋糕师',
    description: '一位自称"银河蛋糕大师"的神秘人物出现在你的通讯频道上。他说他能用任何原料做出最美味的蛋糕——而且蛋糕的营养成分是普通食物的两倍。',
    category: 'opportunity',
    options: [
      {
        label: '聘请他', description: '用合金和金币请他做蛋糕',
        outcomes: [
          {
            probability: 100,
            description: '蛋糕大师在你的厨房里施展了他的魔法。做出来的蛋糕不仅好吃到让船员们流泪，而且营养价值极高。',
            message: '蛋糕大师的蛋糕让全船 ecstatic！获得大量食物！',
            resources: { foodChange: 18, alloyChange: -2, goldChange: -500 },
          },
        ],
      },
      {
        label: '学习配方', description: '学会自己做好吃的',
        outcomes: [
          {
            probability: 100,
            description: '蛋糕大师教了你几个独家配方。你的合成厨房现在能产出既好吃又营养的食物了。',
            message: '学会了蛋糕大师的独家配方！食物质量大幅提升！',
            resources: { foodChange: 10 },
          },
        ],
      },
    ],
  },
  {
    id: 'r_f13',
    name: '冰彗星垂钓',
    description: '一颗冰彗星正在经过你的航线。扫描显示它的冰层中含有大量冻结的有机物——可能是某种古代海洋生物的遗骸。',
    category: 'opportunity',
    options: [
      {
        label: '采集有机冰', description: '融化后可能有营养',
        outcomes: [
          {
            probability: 60,
            description: '融化的有机冰中确实含有高蛋白物质。处理后变成了一种味道独特的汤料。',
            message: '从冰彗星采集到了高蛋白有机物质！',
            resources: { foodChange: 14 },
          },
          {
            probability: 40,
            description: '采集过程中发现冰层深处有一种特殊的矿物质——和有机物质混合后产生了一种超级营养液。',
            message: '发现了超级营养液！营养翻倍！',
            resources: { foodChange: 20, stardustChange: 1 },
          },
        ],
      },
      {
        label: '出售冰样本', description: '科研机构会感兴趣',
        outcomes: [
          {
            probability: 100,
            description: '你把冰样本卖给了一家科研机构。他们对这种古代有机物质 ecstatic。',
            message: '出售了冰彗星样本！获得了丰厚报酬！',
            resources: { goldChange: 1200 },
          },
        ],
      },
    ],
  },
  {
    id: 'r_f14',
    name: '自动售卖机',
    description: '你在一座废弃的空间站上发现了一台仍在运行的自动售卖机——里面装满了各种食物。但问题是：它只接受一种已经 discontinued 的联邦硬币。',
    category: 'opportunity',
    options: [
      {
        label: '破解它', description: '技术流解决问题',
        outcomes: [
          {
            probability: 70,
            description: '你的工程师花了十分钟就破解了售卖机的支付系统。里面的所有食物都归你们了。',
            message: '破解成功！免费获得了大量食物！',
            resources: { foodChange: 12 },
          },
          {
            probability: 30,
            description: '破解过程中触发了售卖机的防盗系统——它开始疯狂吐食物，比你想象的更多。',
            message: '防盗系统触发了！食物疯狂涌出！',
            resources: { foodChange: 18, goldChange: -500 },
          },
        ],
      },
      {
        label: '找收藏家', description: ' discontinued 硬币很值钱',
        outcomes: [
          {
            probability: 100,
            description: '你拆下了售卖机的硬币识别模块，卖给了一个收藏家。他用稀有的 discontinued 硬币跟你换了一堆金币。',
            message: '卖了硬币识别模块！收藏家给了高价！',
            resources: { goldChange: 800, foodChange: 3 },
          },
        ],
      },
    ],
  },
  {
    id: 'r_f15',
    name: '星际感恩节',
    description: '你的舰队收到了一个来自不知名发件人的包裹——里面是一封信和大量的食物。信上写着："今天是星际感恩节。感谢你在这个孤独的宇宙中继续前行。——一个陌生人"',
    category: 'social',
    options: [
      {
        label: '接受礼物', description: '来自陌生人的温暖',
        outcomes: [
          {
            probability: 100,
            description: '你收下了这份来自宇宙陌生人的礼物。船员们被这个举动深深感动了。感恩节大餐开始。',
            message: '收到了陌生人的感恩节礼物！全船感动！',
            resources: { foodChange: 20, goldChange: 500 },
          },
        ],
      },
      {
        label: '传递温暖', description: '把食物分给更需要的人',
        outcomes: [
          {
            probability: 100,
            description: '你把食物分发给了一艘路过的难民船。几天后，你的事迹传遍了星际网络——多家媒体给你发了"年度最暖心船长"奖金。',
            message: '传递了温暖！获得了媒体奖金和声望！',
            resources: { goldChange: 1200, foodChange: 5, allianceRounds: 3 },
          },
        ],
      },
    ],
  },
  {
    id: 'r_a01',
    name: '小行星采矿竞赛',
    description: '一颗富含金属的小行星进入了可开采轨道，三家采矿公司提议举办一场"和平竞赛"——谁先开采到指定数量的合金谁就获胜。他们需要一个独立的船长来担任裁判。',
    category: 'business',
    options: [
      {
        label: '担任裁判', description: '获得报酬和额外收获',
        outcomes: [
          {
            probability: 50,
            description: '竞赛过程异常激烈。获胜公司感激你公正的裁决，不仅支付了报酬，还允许你从他们的矿场中"免费采样"。',
            message: '公正裁判！获得了报酬和免费采矿权！',
            resources: { goldChange: 1200, alloyChange: 12 },
          },
          {
            probability: 30,
            description: '竞赛中一家公司使用了违规设备，被你及时发现并制止。联邦矿业委员会给了你一个"荣誉采矿许可证"。',
            message: '制止了违规行为！获得了荣誉采矿许可证！',
            resources: { alloyChange: 10, goldChange: 800 },
          },
          {
            probability: 20,
            description: '竞赛虽然顺利完成，但过程中发生了一些摩擦。你的船在调解纠纷时被一块飞溅的矿石击中了。',
            message: '完成了裁判工作！虽然船被矿石砸了一下。',
            resources: { goldChange: 500 },
          },
        ],
      },
      {
        label: '自己也参赛', description: '偷偷开采',
        outcomes: [
          {
            probability: 40,
            description: '你在担任裁判的同时，偷偷派 drone 开采了一处未被发现的矿脉。',
            message: '偷偷开采了隐藏矿脉！',
            resources: { alloyChange: 15, goldChange: 500 },
          },
          {
            probability: 60,
            description: '你的小伎俩被发现了。一家公司威胁要举报你，除非你分享一部分收获。',
            message: '被发现偷采！被迫分赃！',
            resources: { alloyChange: 5 },
          },
        ],
      },
    ],
  },
  {
    id: 'r_a02',
    name: '古代合金配方',
    description: '你在一个废弃的空间站残骸中发现了一台古老的终端机。屏幕上显示着一份标有"绝密"的文件："Project ETERNAL - 永恒合金配方"。',
    category: 'opportunity',
    options: [
      {
        label: '下载配方', description: '这可能是无价之宝',
        outcomes: [
          {
            probability: 50,
            description: '配方下载完成！这是一种早已失传的合金冶炼技术——生产的合金强度是现代合金的三倍。',
            message: '获得了传说中的永恒合金配方！',
            resources: { alloyChange: 10, goldChange: 2000 },
          },
          {
            probability: 30,
            description: '配方的一部分数据已经损坏了，但核心工艺还完整。你根据残缺的配方改良出了自己的版本。',
            message: '获得了残缺的配方！改良出了自己的版本！',
            resources: { alloyChange: 8, goldChange: 1200 },
          },
          {
            probability: 20,
            description: '配方下载到一半时终端机崩溃了。但就在崩溃前的最后一毫秒，你截获了一段关键数据。',
            message: '终端崩溃！但截获了关键数据！',
            resources: { alloyChange: 5 },
          },
        ],
      },
      {
        label: '把终端带回去研究', description: '可能有更多秘密',
        outcomes: [
          {
            probability: 100,
            description: '你把整个终端机搬回了母舰。技术人员恢复了部分数据——除了合金配方，还有一份古代星图。',
            message: '恢复了终端数据！获得了合金配方和古代星图！',
            resources: { alloyChange: 8, goldChange: 800, stardustChange: 1 },
          },
        ],
      },
    ],
  },
  {
    id: 'r_a03',
    name: '星际铁匠铺',
    description: '你在一个偏远的空间站发现了一家名为"雷神之锤"的铁匠铺——店主是一位据说有三百年工龄的机械改造人。铺子里摆满了各种奇特的金属制品。',
    category: 'opportunity',
    options: [
      {
        label: '定制合金', description: '用原料换定制合金',
        outcomes: [
          {
            probability: 70,
            description: '老铁匠对你的原料非常满意。他花了一整天为你打造了一批纯度极高的合金。',
            message: '老铁匠为你打造了极品合金！',
            resources: { goldChange: -500, alloyChange: 12 },
          },
          {
            probability: 30,
            description: '打造过程中，老铁匠发现了一种新的合金配比——强度提高了20%。他兴奋地把这批实验品都送给了你。',
            message: '老铁匠发明了新合金配方！全部送给你了！',
            resources: { alloyChange: 15 },
          },
        ],
      },
      {
        label: '学习锻造技术', description: '知识就是力量',
        outcomes: [
          {
            probability: 100,
            description: '老铁匠看你诚心求学，教了你几手"星际锻造术"。这些技术可以大幅提升你的合金生产效率。',
            message: '学会了星际锻造术！合金产量提升！',
            resources: { alloyChange: 8, goldChange: -500 },
          },
        ],
      },
    ],
  },
  {
    id: 'r_a04',
    name: '陨石雨中的金矿',
    description: '导航系统发出警报——前方有一片密集的陨石雨。扫描仪显示，这些陨石的金属含量异常高——几乎是纯金属的！',
    category: 'opportunity',
    options: [
      {
        label: '冒险采集', description: '高收益高风险',
        outcomes: [
          {
            probability: 45,
            description: '你的驾驶技术在这种极端环境下发挥到了极致。你在陨石之间穿梭，采集了一块又一块纯金属陨石。',
            message: '在陨石雨中成功采集了大量纯金属！',
            resources: { alloyChange: 18, goldChange: -500 },
          },
          {
            probability: 35,
            description: '采集过程惊险万分。有两次陨石差点直接命中你的船。但最终你还是安全地带回了收获。',
            message: '惊险采集！有惊无险地获得了合金！',
            resources: { alloyChange: 10, goldChange: -500 },
          },
          {
            probability: 20,
            description: '一块巨大的陨石碎片击中了你的 drone。紧急回收程序启动，但至少已经采集到了一部分。',
            message: ' drone 被击中！但抢救回了一部分合金！',
            resources: { alloyChange: 5, goldChange: -800 },
          },
        ],
      },
      {
        label: '安全距离远程采集', description: '收获少但安全',
        outcomes: [
          {
            probability: 100,
            description: '你保持在安全距离，用牵引光束远程采集了几块小型陨石。',
            message: '安全采集了几块合金陨石！',
            resources: { alloyChange: 5 },
          },
        ],
      },
    ],
  },
  {
    id: 'r_a05',
    name: '废弃的军工基地',
    description: '你发现了一座 buried 在荒原下的古代军工生产基地。核心冶炼炉看起来还能运转——而且周围的矿渣堆中可能还有大量可回收的合金。',
    category: 'opportunity',
    options: [
      {
        label: '回收矿渣', description: '里面还有大量可回收金属',
        outcomes: [
          {
            probability: 60,
            description: '矿渣堆中隐藏了大量的可回收合金——古代的冶炼工艺虽然落后，但产量惊人。',
            message: '从矿渣中回收了大量合金！',
            resources: { alloyChange: 15 },
          },
          {
            probability: 40,
            description: '矿渣堆的表层已经氧化了，但深层还保存着不少可回收金属。',
            message: '挖掘出了深层的可回收合金！',
            resources: { alloyChange: 8, goldChange: -500 },
          },
        ],
      },
      {
        label: '重启冶炼炉', description: '用燃料换合金',
        outcomes: [
          {
            probability: 100,
            description: '你投入了燃料重启了古代冶炼炉。虽然效率不高，但它还是产出了一批合金。更重要的是，你获得了它的设计图。',
            message: '重启了古代冶炼炉！获得了合金和设计图！',
            resources: { alloyChange: 12, goldChange: -500 },
          },
        ],
      },
    ],
  },
  {
    id: 'r_a06',
    name: '合金走私者的"清仓"',
    description: '一个慌慌张张的通讯接入了你的频道。画面上是一个看起来很紧张的年轻人："船长！我有一批来源不太官方的合金。联邦缉私队正在追我，我需要脱手！价格只有市场价的三分之一！"',
    category: 'business',
    options: [
      {
        label: '买下所有', description: '500金币买大量合金',
        outcomes: [
          {
            probability: 60,
            description: '年轻人的合金质量出奇地好——纯度接近军用级别。他拿到钱后千恩万谢地逃走了。',
            message: '买到了高质量的走私合金！',
            resources: { goldChange: -800, alloyChange: 15 },
          },
          {
            probability: 25,
            description: '合金质量不错，但数量比承诺的少一些——年轻人可能在路上丢了一些。',
            message: '买到了合金，数量比预期的少一些。',
            resources: { goldChange: -800, alloyChange: 10 },
          },
          {
            probability: 15,
            description: '就在交易完成时，缉私队的信号出现在雷达上！你紧急启动跃迁逃离。',
            message: '缉私队来了！紧急逃跑！丢失了一部分合金！',
            resources: { goldChange: -800, alloyChange: 5, stockFreeze: true },
          },
        ],
      },
      {
        label: '举报他', description: '换取联邦奖金',
        outcomes: [
          {
            probability: 100,
            description: '你悄悄通知了缉私队。他们成功截获了走私者，并给了你一笔可观的举报奖金。',
            message: '举报成功！获得了联邦奖金！',
            resources: { goldChange: 1200 },
          },
        ],
      },
    ],
  },
  {
    id: 'r_a07',
    name: '外星冶炼技术',
    description: '你在一个 alien 遗迹中发现了一套完整的合金冶炼设备——设计风格完全不像是人类制造的。效率之高让你目瞪口呆：产出是现代设备的三倍，但能耗只有五分之一。',
    category: 'opportunity',
    options: [
      {
        label: '拆解带回', description: '研究 alien 技术',
        outcomes: [
          {
            probability: 50,
            description: '你成功拆解了设备并带回了母舰。技术团队 reverse-engineer 了它的核心原理——一种全新的冶炼方法。',
            message: '成功逆向工程了 alien 冶炼技术！',
            resources: { alloyChange: 15, goldChange: 1200 },
          },
          {
            probability: 50,
            description: '设备的核心部件已经被岁月侵蚀了，但你还是回收了大量可用的组件。',
            message: '回收了 alien 合金组件！',
            resources: { alloyChange: 12, stardustChange: 1 },
          },
        ],
      },
      {
        label: '就地学习', description: '在遗迹中研究',
        outcomes: [
          {
            probability: 100,
            description: '你在遗迹中待了整整一周，仔细研究了 alien 的冶炼工艺。虽然没有搬走设备，但你学到了足以改良自己设备的知识。',
            message: '学会了 alien 冶炼工艺！大幅提升了合金产量！',
            resources: { alloyChange: 8, goldChange: 800 },
          },
        ],
      },
    ],
  },
  {
    id: 'r_a08',
    name: '星际矿工的求救',
    description: '你收到了一个来自小行星矿场的求救信号——一群矿工被困在了坍塌的矿洞中。他们有大量的合金储备，但无法运出来。如果你能帮他们打通通道，他们愿意分一半给你。',
    category: 'social',
    options: [
      {
        label: '全力救援', description: '帮他们打通通道',
        outcomes: [
          {
            probability: 60,
            description: '你用母舰的牵引光束成功打通了坍塌的通道。矿工们兴高采烈地把承诺的一半合金运到了你的船上。',
            message: '成功救援矿工！获得了大量合金和稀有金属！',
            resources: { alloyChange: 18, goldChange: -500 },
          },
          {
            probability: 40,
            description: '通道打通比预想的困难。你花了不少燃料和精力，但还是成功了。',
            message: '成功打通通道！获得了合金分成！',
            resources: { alloyChange: 10, goldChange: -500 },
          },
        ],
      },
      {
        label: '只提供设备', description: '借给他们工具，让他们自己干',
        outcomes: [
          {
            probability: 100,
            description: '你借给了矿工一些钻探设备。他们花了两天时间自己打通了通道。作为感谢，他们给了你四分之一的合金。',
            message: '借设备给矿工！轻松获得了合金报酬！',
            resources: { alloyChange: 6 },
          },
        ],
      },
    ],
  },
  {
    id: 'r_a09',
    name: '金属星云',
    description: '你的舰队进入了一片罕见的"金属星云"——一片由微小金属颗粒组成的星云。虽然颗粒很小，但总量惊人。',
    category: 'opportunity',
    options: [
      {
        label: '全面采集', description: '用所有 drone 收集金属颗粒',
        outcomes: [
          {
            probability: 50,
            description: '你的 drone 在星云中工作了整整一天，收集了大量的金属颗粒。经过冶炼处理后，它们变成了一批纯度不错的合金。',
            message: '在金属星云中大量采集！获得了可观的合金！',
            resources: { alloyChange: 12 },
          },
          {
            probability: 30,
            description: '采集过程中，你发现了一种特殊的金属颗粒——它们含有微量的星尘！',
            message: '发现了含星尘的金属颗粒！价值连城！',
            resources: { alloyChange: 8, stardustChange: 2 },
          },
          {
            probability: 20,
            description: '星云中的金属颗粒比预想的更细小，采集效率不高。',
            message: '采集效率不高，但还是获得了一些合金。',
            resources: { alloyChange: 5 },
          },
        ],
      },
      {
        label: '分析成分', description: '可能有更珍贵的成分',
        outcomes: [
          {
            probability: 100,
            description: '分析结果显示，这片星云中含有微量的超稀有元素。你把数据卖给了一家科研机构。',
            message: '发现了超稀有元素！卖给科研机构大赚！',
            resources: { goldChange: 1200, alloyChange: 3 },
          },
        ],
      },
    ],
  },
  {
    id: 'r_a10',
    name: '赛博铁匠的挑战',
    description: '一位自称"赛博铁匠零号"的机械改造人联系了你。他声称自己是全星系最好的合金工匠，愿意为你打造一批极品合金——但前提是你能通过他的"测试"。',
    category: 'opportunity',
    options: [
      {
        label: '接受挑战', description: '证明你的技术',
        outcomes: [
          {
            probability: 40,
            description: '在极端困难的电磁干扰下，你凭借惊人的手眼协调完成了冶炼。赛博铁匠零号沉默了三秒钟，然后爆发出一阵机械笑声："三百年了！终于有人通过了我的测试！"',
            message: '通过了赛博铁匠的测试！获得了传说中的零号合金！',
            resources: { alloyChange: 20, goldChange: 800 },
          },
          {
            probability: 35,
            description: '虽然你没有完美通过测试，但赛博铁匠还是对你的努力表示认可。',
            message: '没通过测试，但获得了友情价合金！',
            resources: { alloyChange: 10, goldChange: -500 },
          },
          {
            probability: 25,
            description: '电磁干扰太强了，你的冶炼彻底失败。但至少赛博铁匠给了你一个"安慰奖"。',
            message: '冶炼失败了，但获得了安慰奖合金。',
            resources: { alloyChange: 3 },
          },
        ],
      },
      {
        label: '雇佣专业人士', description: '让专家来完成',
        outcomes: [
          {
            probability: 100,
            description: '你雇佣了一位经验丰富的冶炼师来完成挑战。他轻松通过了测试。',
            message: '雇佣专家通过了测试！获得了高质量合金！',
            resources: { alloyChange: 12, goldChange: -800 },
          },
        ],
      },
    ],
  },
  {
    id: 'r_s01',
    name: '超新星遗迹的馈赠',
    description: '你的探测器在一颗最近爆发的超新星遗迹中检测到了高浓度的星尘——这是恒星死亡时释放的稀有物质。但超新星遗迹也是全宇宙最危险的环境之一。',
    category: 'opportunity',
    options: [
      {
        label: '深入采集', description: '高风险高回报',
        outcomes: [
          {
            probability: 40,
            description: '你的 drone 在遗迹核心区域发现了一片星尘结晶——它们在超新星的光芒中闪闪发光，美得令人窒息。',
            message: '在超新星遗迹核心发现了大量星尘结晶！',
            resources: { stardustChange: 6, goldChange: -500 },
          },
          {
            probability: 35,
            description: '采集过程中，遗迹发生了一次小型能量爆发。你的 drone 紧急撤退，但还是带回了可观的收获。',
            message: '遭遇能量爆发！紧急撤退但收获不菲！',
            resources: { stardustChange: 4, goldChange: -1200 },
          },
          {
            probability: 25,
            description: '遗迹的辐射强度远超预期。你的 drone 大部分都损坏了，但还是有一架带回了珍贵的星尘样本。',
            message: ' drone 损失惨重！但带回了珍贵的星尘！',
            resources: { stardustChange: 3, goldChange: -2000 },
          },
        ],
      },
      {
        label: '外围采集', description: '安全优先',
        outcomes: [
          {
            probability: 100,
            description: '你在超新星遗迹的外围区域安全地采集了星尘。虽然浓度不如核心区域高，但数量仍然可观。',
            message: '在外围安全采集了星尘！',
            resources: { stardustChange: 3 },
          },
        ],
      },
    ],
  },
  {
    id: 'r_s02',
    name: '星尘猎人的遗产',
    description: '你在一艘被遗弃的飞船上发现了一位已故星尘猎人的日记——里面详细记载了他在全星系追踪星尘矿脉的旅程。最后一篇日记写道："我的时间不多了。但我的知识不应该随我消逝。后来者，里面的坐标和线索都是你的了。"',
    category: 'mystery',
    options: [
      {
        label: '追踪最近的坐标', description: '跟着猎人的足迹',
        outcomes: [
          {
            probability: 50,
            description: '最近的坐标指向一颗气态巨行星的卫星。在那里，你发现了一处隐藏的星尘矿脉——猎人把它留给了"值得的人"。',
            message: '找到了老猎人留下的星尘矿脉！',
            resources: { stardustChange: 5, goldChange: 800 },
          },
          {
            probability: 30,
            description: '坐标指向的地方已经被其他猎人开采过了。但在废弃的矿井中，你发现了一些被遗漏的星尘结晶。',
            message: '矿脉已被开采，但找到了遗漏的星尘！',
            resources: { stardustChange: 3 },
          },
          {
            probability: 20,
            description: '坐标的星尘矿脉已经被联邦登记为保护区。你无法开采，但联邦给了你一笔"发现奖金"。',
            message: '矿脉是保护区！但获得了发现奖金！',
            resources: { goldChange: 1200 },
          },
        ],
      },
      {
        label: '出售日记', description: '猎人的知识很值钱',
        outcomes: [
          {
            probability: 100,
            description: '你把日记卖给了一位星尘收藏家。他对猎人的生平 ecstatic ，愿意支付高价。',
            message: '出售了星尘猎人的日记！获得了高额报酬！',
            resources: { goldChange: 2000, stardustChange: 2 },
          },
        ],
      },
    ],
  },
  {
    id: 'r_s03',
    name: '星尘龙的传说',
    description: '你在一个太空酒吧里听到了一个老水手的故事："在彩虹星云深处，有一条传说中的星尘龙。它不是真正的龙，而是一群以星尘为食的外星生物。但它们的巢穴周围会积累大量的星尘结晶！"',
    category: 'mystery',
    options: [
      {
        label: '寻找星尘龙', description: '跟随传说',
        outcomes: [
          {
            probability: 35,
            description: '你在彩虹星云深处真的找到了它们——一群散发着微光的外星生物，在零重力中优雅地游动。它们的巢穴周围堆积了大量的星尘结晶。',
            message: '找到了星尘龙巢穴！采集了大量结晶！',
            resources: { stardustChange: 8, goldChange: -500 },
          },
          {
            probability: 35,
            description: '你找到了星尘龙，但它们的"呼吸"让大部分电子设备失灵了。你只来得及用手动工具采集了一小部分星尘就撤退了。',
            message: '找到了星尘龙但电子设备失灵！手动采集了一些星尘！',
            resources: { stardustChange: 4, goldChange: -800 },
          },
          {
            probability: 30,
            description: '你在星云中迷路了三天，最终只找到了一块脱落的龙鳞——但它含有微量的星尘。',
            message: '只找到了一块星尘龙鳞！但至少含有星尘！',
            resources: { stardustChange: 2 },
          },
        ],
      },
      {
        label: '记录传说出售', description: '故事也能换钱',
        outcomes: [
          {
            probability: 100,
            description: '你把星尘龙的故事卖给了一家旅游公司。他们打算开辟一条"寻龙之旅"的观光线路。',
            message: '出售了星尘龙传说！获得了报酬和纪念品！',
            resources: { goldChange: 1200, stardustChange: 1 },
          },
        ],
      },
    ],
  },
  {
    id: 'r_s04',
    name: '古代星门',
    description: '你的探测器发现了一座 buried 在小行星内部的古代建筑——它看起来像是一个"星门"，周围刻满了你不认识的符号。但最引人注目的是星门周围堆积的星尘结晶——它们似乎在维持星门的运转。',
    category: 'mystery',
    options: [
      {
        label: '采集星门周围的星尘', description: '小心不要影响星门',
        outcomes: [
          {
            probability: 50,
            description: '你小心翼翼地采集了星门周围多余的星尘——那些溢出的部分。星门继续运转，似乎没有受到影响。',
            message: '安全采集了星门周围的溢出星尘！',
            resources: { stardustChange: 5 },
          },
          {
            probability: 30,
            description: '采集过程中，星门突然发出了一道光芒——它激活了！虽然只持续了一秒钟，但你的传感器捕捉到了惊人的数据。',
            message: '星门突然激活！捕捉到了天价数据！',
            resources: { stardustChange: 3, goldChange: 3000 },
          },
          {
            probability: 20,
            description: '你采集时不小心碰到了星门的保护机制。一道能量波把你推出了小行星。',
            message: '触发了保护机制！但还是拿到了星尘！',
            resources: { stardustChange: 2, goldChange: -500 },
          },
        ],
      },
      {
        label: '研究星门', description: '科学价值可能更高',
        outcomes: [
          {
            probability: 100,
            description: '你花了一周时间研究星门。虽然没有完全理解它的原理，但你的发现足以写一篇改变学术界认知的论文。',
            message: '星门研究成果惊人！获得了巨额学术奖金！',
            resources: { goldChange: 3000, stardustChange: 2 },
          },
        ],
      },
    ],
  },
  {
    id: 'r_s05',
    name: '星尘商人最后的交易',
    description: '一艘破旧的金色飞船拦住了你。通讯接通后，一位白发苍苍的老人："我老了，我的航线走到了尽头。但我还有最后一批货——全星系最好的星尘。让我看看你的...诚意。"',
    category: 'business',
    options: [
      {
        label: '用金币购买', description: '1000金币',
        outcomes: [
          {
            probability: 60,
            description: '老人微笑着收下了金币："你懂得珍惜。这批星尘来自我最后一个秘密矿脉——纯度是整个星系的 top 1%。"他把货交给你，然后驾驶着金色飞船消失在了星尘中。',
            message: '买到了全星系最高纯度的星尘！老商人永远消失了...',
            resources: { goldChange: -1200, stardustChange: 8 },
          },
          {
            probability: 40,
            description: '老人看了你的金币，摇了摇头："不够...但你的眼神让我想起了年轻时的自己。"他少收了一些钱，但多给了你一倍的星尘。',
            message: '老商人被你的诚意打动！多给了你一倍的星尘！',
            resources: { goldChange: -1200, stardustChange: 10 },
          },
        ],
      },
      {
        label: '用故事交换', description: '他也许想要的是陪伴',
        outcomes: [
          {
            probability: 100,
            description: '你讲了一个关于你在星际间冒险的故事。老人听得入神，眼中闪烁着回忆的光芒。"故事比金币更珍贵。"他把所有星尘都给了你——没有收一分钱。"在我生命的尽头，能听到这样的故事...值了。"',
            message: '用故事感动了老商人！他免费把所有星尘都给了你！',
            resources: { stardustChange: 12 },
          },
        ],
      },
    ],
  },
];
