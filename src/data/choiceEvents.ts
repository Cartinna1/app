import type { ChoiceEvent } from '@/types/game';

// ==================== 选择分支事件库（支持多级嵌套） ====================

export const ALL_EVENTS: ChoiceEvent[] = [
  // ============================================================
  // 战斗类事件
  // ============================================================
  {
    id: 'c01', name: '星际海盗袭击', category: 'combat',
    description: '你的母舰在跃迁途中被一群星际海盗拦截！他们的掠夺者飞船环绕着你的母舰，通讯频道里传来一个沙哑的声音："交出货物和金币，或者我们亲自动手。"你的船员们紧张地等待着你的命令。',
    options: [
      {
        label: '全力反击', description: '启动武器系统，与海盗正面交战。高风险高回报。',
        outcomes: [
          { probability: 40, description: '你的精准射击击穿了海盗主力舰的护盾发生器，他们在混乱中四散逃窜。打扫战场时发现了一艘破损的补给舱和一名愿意交换情报的俘虏。', message: '大获全胜！海盗丢下物资逃跑了。',
            resources: { goldChange: 1200, foodChange: 3 },
            subChoice: {
              title: '战利品处理',
              description: '打扫战场时你发现了更多东西，需要决定如何处理。',
              options: [
                { label: '搜刮补给舱', description: '打开破损的补给舱获取更多资源。', outcomes: [{ probability: 60, description: '补给舱里装满了食物和燃料！', message: '获得大量补给！', resources: { goldChange: 800, foodChange: 5 } }, { probability: 40, description: '补给舱已严重损坏，只找回了一些残值。', message: '只回收了少量资源。', resources: { goldChange: 500 } }] },
                { label: '审问俘虏', description: '从海盗口中获取情报。', outcomes: [{ probability: 50, description: '海盗供出了他们的藏宝库位置！', message: '获得藏宝情报！', resources: { goldChange: 1200, grantTip: 'stock' } }, { probability: 50, description: '俘虏趁你不注意逃跑了。', message: '俘虏逃脱！', resources: { goldChange: -500 } }] },
              ],
            },
          },
          { probability: 35, description: '战斗陷入僵持。你成功击退了海盗，但船体也遭受了损伤，需要花费大量金币维修。', message: '惨胜。击退了海盗，但维修花费巨大。', resources: { goldChange: -500 } },
          { probability: 25, description: '你低估了这群海盗。一轮饱和火力后你不得不启动紧急跃迁逃离，消耗了大量能源，还丢失了几个产品。', message: '战败！紧急跃迁消耗大量能源。', resources: { goldChange: -1200, productLoss: 2 } },
        ],
      },
      {
        label: '发送求救信号', description: '向附近的盟友舰队求救，等待援军。',
        outcomes: [
          { probability: 70, description: '你投资的星际舰队收到了求救信号，三艘巡洋舰跃迁到了战场。海盗们见状立刻作鸟兽散，临走还留下了一批补给感谢你的"配合"。', message: '盟友赶到！海盗仓皇逃窜！',
            resources: { goldChange: 800, foodChange: 3 },
            subChoice: {
              title: '盟友的提议',
              description: '盟友舰队指挥官向你提出了一个额外的建议。',
              options: [
                { label: '联合追击海盗', description: '和盟友一起追击逃跑的海盗。', outcomes: [{ probability: 50, description: '你们追上了海盗的老巢，缴获了大量战利品！', message: '大获全胜！缴获海盗赃物！', resources: { goldChange: 2000, alloyChange: 5 } }, { probability: 50, description: '海盗设下了埋伏，你们被迫撤退。', message: '遭遇埋伏，损失了一些资源。', resources: { goldChange: -500 } }] },
                { label: '感谢告别', description: '安全就好，让盟友离开。', outcomes: [{ probability: 100, description: '你和盟友告别，继续航行。', message: '平安无事。', resources: { foodChange: 2 } }] },
              ],
            },
          },
          { probability: 30, description: '求救信号发出去了，但最近的盟友舰队也在三个星系之外。当你看到他们的跃迁闪光时，海盗早已离去，只留下一片狼藉。', message: '援军来迟。海盗已经洗劫完毕。', resources: { goldChange: -800, productLoss: 2 } },
        ],
      },
      {
        label: '缴纳过路费', description: '破财消灾，交出一部分金币让海盗放行。',
        outcomes: [
          { probability: 60, description: '海盗首领数了数金币，满意地挥挥手放你通过了。虽然损失了一些钱财，但至少安全了。', message: '花钱买平安。', resources: { goldChange: -800 } },
          { probability: 40, description: '海盗收了钱却不守信用！他们在你放松警惕时发动了突袭，抢走了更多东西。', message: '海盗背信弃义！', resources: { goldChange: -2000, productLoss: 1 } },
        ],
      },
    ],
  },
  {
    id: 'c02', name: '异形生物入侵', category: 'combat',
    description: '在一次深空探索中，一种未知的异形生物悄悄潜入了你的母舰。它们在通风管道中筑巢，以电力系统为食。船员报告说听到墙壁里传来奇怪的声音，而且几个区域的电力供应已经不稳定了。',
    options: [
      {
        label: '派出清理小队', description: '组建武装小队进入通风系统清理异形。',
        outcomes: [
          { probability: 50, description: '清理小队小心翼翼地搜索了每一个角落，最终找到了异形巢穴。经过激烈的近战，成功消灭了所有异形，还回收了一些有价值的生物样本。', message: '异形清理干净！回收了生物样本。', resources: { goldChange: 500, foodChange: 2 } },
          { probability: 30, description: '异形比预想的更加狡猾和危险。清理小队在狭窄的空间里伤亡惨重，最终不得不放弃手动清理，改用极端手段。', message: '清理失败！损失了小队和装备。', resources: { goldChange: -800, foodChange: -3 } },
          { probability: 20, description: '在搜索过程中，异形突然从背后袭击了小队。混乱中一名队员不小心击中了主电缆，导致局部停电。', message: '混乱中损坏了设备！', resources: { goldChange: -500 } },
        ],
      },
      {
        label: '封闭区域抽真空', description: '封闭受感染区域，抽走空气杀死异形。',
        outcomes: [
          { probability: 60, description: '真空策略奏效了！异形在真空中迅速死亡。虽然损失了通风系统的部分设备，但问题得到了彻底解决。', message: '真空灭绝成功！', resources: { goldChange: -500 } },
          { probability: 40, description: '异形对真空的耐受力超乎想象。它们不仅没有死亡，反而变得更加狂暴，冲破了封锁线扩散到更多区域。', message: '异形扩散！情况恶化！', resources: { goldChange: -1200, foodChange: -5 } },
        ],
      },
      {
        label: '尝试与异形沟通', description: '使用各种信号尝试与异形建立联系。',
        outcomes: [
          { probability: 25, description: '奇迹发生了！异形竟然对你的特定频率信号做出了回应。它们似乎是一种高智能生物，通过一系列复杂的交流，你们达成了互不侵犯的协议。它们甚至开始帮你维护电力系统！', message: '与异形建立了共生关系！', resources: { goldChange: 1200, foodChange: 5, alloyChange: 3 } },
          { probability: 75, description: '异形对所谓的"沟通"完全没有任何兴趣。在你忙于发送信号的时候，它们已经在更多的地方筑了巢。你的船员开始质疑你的判断力。', message: '沟通失败！浪费了大量时间！', resources: { goldChange: -800, foodChange: -3 } },
        ],
      },
    ],
  },
  {
    id: 'c03', name: '赏金猎人追杀', category: 'combat',
    description: '一个神秘的赏金猎人正在追踪你！他的飞船"暗影之刃"装备了最先进的隐形系统和追踪导弹。你收到匿名消息称有人出高价要你的项上人头。猎人的飞船信号已经在雷达上闪烁了三次——他就在附近。',
    options: [
      {
        label: '正面迎战', description: '调转船头，主动迎战赏金猎人。',
        outcomes: [
          { probability: 35, description: '你利用母舰的火力优势压制了猎人的隐形系统。在一轮齐射后，"暗影之刃"的引擎被击中，赏金猎人弃船逃生。你不仅活了下来，还获得了他的赏金名单！', message: '击败赏金猎人！获得了赏金名单！', resources: { goldChange: 2000, grantTip: 'stock' } },
          { probability: 40, description: '战斗异常激烈。两艘飞船在深空中你来我往，最终都受到了重创。猎人见势不妙撤退了，但你的母舰也需要大修。', message: '两败俱伤！猎人撤退。', resources: { goldChange: -1200 } },
          { probability: 25, description: '猎人比你想象的更加致命。他的追踪导弹精准地命中了你的弹药库。如果不是紧急护盾启动及时，你现在已经是一团太空尘埃了。', message: '差点被击毁！损失惨重！', resources: { goldChange: -2000, foodChange: -5 } },
        ],
      },
      {
        label: '设置陷阱', description: '在一颗小行星后面埋伏，等他上钩。',
        outcomes: [
          { probability: 55, description: '猎人追了上来，完全没有发现你的埋伏。当他靠近小行星时，你突然从背后发起攻击，一举击溃了他的护盾系统！', message: '埋伏成功！重创赏金猎人！', resources: { goldChange: 2000 } },
          { probability: 45, description: '猎人似乎预料到了你的计划。他在你埋伏的位置提前布置了探测无人机，反而掌握了你的位置。你被迫仓皇逃离。', message: '猎人识破了埋伏！', resources: { goldChange: -800, stockFreeze: true } },
        ],
      },
      {
        label: '花钱消灾', description: '通过中间人联系悬赏方，试图取消悬赏。',
        outcomes: [
          { probability: 40, description: '你找到了发布悬赏的人，原来是一个你曾经无意中得罪过的商人。经过谈判，你支付了双倍的金额让他撤销悬赏。', message: '悬赏撤销！安全了！', resources: { goldChange: -2000 } },
          { probability: 35, description: '中间人收了你的钱却没有任何作为。更糟糕的是，你的位置信息被泄露给了猎人。', message: '被中间人骗了！', resources: { goldChange: -1200 } },
          { probability: 25, description: '悬赏方不仅拒绝撤销悬赏，还增加了赏金金额。现在全银河的赏金猎人都在找你！', message: '悬赏金额增加了！', resources: { goldChange: -2000 } },
        ],
      },
    ],
  },

  // ============================================================
  // 机遇类事件
  // ============================================================
  {
    id: 'o01', name: '神秘商船来访', category: 'opportunity',
    description: '一艘华丽的商船"黄金机遇号"主动联络你。船长自称是一位传奇商人，手中掌握着一批稀世珍宝——从古代文明遗址中挖掘出的遗物和技术。他愿意以"友情价"出售，但你必须在三分钟内做出决定，因为他的航线不允许停留太久。',
    options: [
      {
        label: '购买古代遗物', description: '花费大量金币购买一件古代遗物。',
        outcomes: [
          { probability: 40, description: '你购买的遗物是一枚"星际罗盘"，它能感应到附近星域的原料富集点。商人还额外赠送了一份星系地图。', message: '获得了星际罗盘和星系地图！', resources: { goldChange: -2000, stardustChange: 5 }, subOutcomes: [{ probability: 50, description: '使用罗盘后发现了一个富矿小行星。', message: '发现富矿！额外获得原料。', resources: { materialDrops: [{ materialId: 'dark_matter', min: 2, max: 4 }] } }] },
          { probability: 30, description: '遗物到手后发现是一件赝品！商人早已离开，通讯频道也无法接通。你被一个老骗子耍了。', message: '被骗了！遗物是赝品！', resources: { goldChange: -2000 } },
          { probability: 30, description: '遗物是一枚"商业洞察水晶"，能帮你洞察买家的支付意愿。持有它时，你能以更高的价格出售产品。产品售价+30%。', message: '获得了商业洞察水晶！产品售价+30%！', resources: { goldChange: -2000, setBonus: { bonus: 30, turns: 6, source: '商业洞察水晶' } } },
        ],
      },
      {
        label: '购买技术蓝图', description: '购买古代科技蓝图来提升生产能力。',
        outcomes: [
          { probability: 50, description: '蓝图记录了一种独特的产品包装和营销技术。你的商业团队学习后发现，同样的产品可以用更高的价格卖出！产品售价+50%。', message: '学会了古代营销术！产品售价+50%！', resources: { goldChange: -2000, setBonus: { bonus: 50, turns: 6, source: '古代营销术' } } },
          { probability: 30, description: '蓝图大部分内容已经无法解读，但关于"如何说服买家接受更高价格"的那一页恰好完好无损。', message: '部分解读了蓝图。产品售价+20%', resources: { goldChange: -1200, setBonus: { bonus: 20, turns: 6, source: '古代蓝图' } } },
          { probability: 20, description: '蓝图语言完全无法破译。你的首席科学家看了三天后宣布放弃。', message: '蓝图无法破译！浪费资金！', resources: { goldChange: -2000 } },
        ],
      },
      {
        label: '拒绝交易', description: '不想冒险，礼貌地拒绝商人。',
        outcomes: [
          { probability: 60, description: '商人耸耸肩离开了。虽然安全了，但你也错过了一个可能改变命运的机会。', message: '安全但平淡。无事发生。', resources: {} },
          { probability: 40, description: '商人临走时塞给你一个小盒子："送给有眼光的人。"盒子里是一份价值连城的星系矿产分布图！', message: '意外收获！商人送了礼物！', resources: { goldChange: 800, grantTip: 'material' } },
        ],
      },
    ],
  },
  {
    id: 'o02', name: '发现古代遗迹', category: 'opportunity',
    description: '深空探测器发现了一个隐藏在星云中的古代遗迹。从外形来看，这是一个已经灭亡的高等文明留下的空间站。能量读数显示它仍有微弱的动力，内部可能保存完好的技术和资源。但遗迹结构已经很不稳定，随时可能坍塌。',
    options: [
      {
        label: '深入探索', description: '派遣探险队进入遗迹深处。',
        outcomes: [
          { probability: 35, description: '探险队在遗迹核心发现了一个完整的古代数据库！里面存储了大量科技知识和星系资源分布图。这是足以改变你命运的发现！', message: '发现了古代数据库！', resources: { goldChange: 3000, stardustChange: 8, grantTip: 'material' } },
          { probability: 35, description: '探险队找到了一些还算完好的设备和技术样本。虽然不是最顶级的发现，但也值不少钱。', message: '找到了一些古代技术。', resources: { goldChange: 2000, alloyChange: 5 } },
          { probability: 30, description: '遗迹在你的人还在里面的时候突然开始坍塌！虽然大部分队员都逃了出来，但你丢失了很多装备。', message: '遗迹坍塌！险些全军覆没！', resources: { goldChange: -1200, foodChange: -5 } },
        ],
      },
      {
        label: '远程扫描', description: '不派人进入，只在外围进行远程扫描。',
        outcomes: [
          { probability: 60, description: '远程扫描虽然没有深入，但也收集到了一些有价值的数据。你发现了遗迹的能量核心位置，这本身就是一个重要情报。', message: '扫描获得了一些数据。', resources: { goldChange: 800, grantTip: 'stock' } },
          { probability: 40, description: '遗迹外围的干扰太强了，扫描设备无法获得任何有用的信息。你白忙了一场。', message: '干扰太强，一无所获。', resources: { goldChange: -500 } },
        ],
      },
      {
        label: '记录位置后离开', description: '标记遗迹坐标，等以后有能力再来。',
        outcomes: [
          { probability: 50, description: '你安全地记录了遗迹的位置。虽然暂时无法探索，但这可能成为你未来的一个机遇。', message: '记录了遗迹坐标。', resources: {} },
          { probability: 50, description: '你离开后不到一小时，遗迹就在能量波动中彻底爆炸了。你庆幸自己跑得及时，但也永远失去了探索它的机会。', message: '遗迹爆炸了！幸好及时离开！', resources: {} },
        ],
      },
    ],
  },
  {
    id: 'o03', name: '幸运星尘风暴', category: 'opportunity',
    description: '你的母舰穿越了一片罕见的"星尘风暴"。这是由古老恒星爆炸产生的微粒组成的星云，据说其中蕴含着极其稀有的元素。风暴虽然对飞船有一定辐射危害，但收集到的星尘在市场上价值连城。',
    options: [
      {
        label: '全力收集星尘', description: '打开所有收集器，尽可能多地收集星尘。',
        outcomes: [
          { probability: 45, description: '收集器开足马力运转，收获了大量高纯度星尘！这批星尘足以让你在星尘集市上大肆采购。', message: '收获了大量星尘！', resources: { stardustChange: 15, goldChange: -500 } },
          { probability: 35, description: '收集过程中遇到了辐射峰值，虽然收获了不少星尘，但船员们需要额外的医疗照顾。', message: '收集了星尘，但船员受辐射影响。', resources: { stardustChange: 8, goldChange: -800, foodChange: -3 } },
          { probability: 20, description: '辐射强度超出了预期，不仅收集效果很差，还损坏了一些设备。', message: '辐射过强！得不偿失！', resources: { goldChange: -1200 } },
        ],
      },
      {
        label: '安全收集', description: '保持安全距离，只收集外围的星尘。',
        outcomes: [
          { probability: 70, description: '在安全距离外收集到了一些星尘，虽然量不多但胜在安全。', message: '安全收集了一些星尘。', resources: { stardustChange: 5 } },
          { probability: 30, description: '安全距离太远，几乎没收集到任何东西。你错过了一次大好机会。', message: '收集量极少。浪费了机会。', resources: {} },
        ],
      },
      {
        label: '快速穿越', description: '不收集，以最快速度离开辐射区。',
        outcomes: [
          { probability: 80, description: '你安全地穿过了星尘风暴，虽然一无所获但至少人畜平安。', message: '安全穿越。无事发生。', resources: {} },
          { probability: 20, description: '快速穿越时，船体撞上了一块隐藏的高密度星尘团。意外的收获！', message: '意外收获了星尘！', resources: { stardustChange: 3 } },
        ],
      },
    ],
  },

  // ============================================================
  // 灾难类事件
  // ============================================================
  {
    id: 'd01', name: '太阳风暴来袭', category: 'disaster',
    description: '警报！警报！一场超级太阳风暴正面袭击了你的母舰！带电粒子流像洪水一样冲刷着护盾系统，船内所有电子设备都在疯狂闪烁。护盾正在以肉眼可见的速度衰减，你只有几秒钟做出决定。',
    options: [
      {
        label: '全力启动护盾', description: '将所有能量转移到护盾系统上。',
        outcomes: [
          { probability: 55, description: '护盾在最后一刻完全启动，成功抵挡了太阳风暴的正面冲击。虽然消耗了大量能源，但母舰安然无恙。', message: '护盾成功抵挡了风暴！', resources: { goldChange: -800 } },
          { probability: 30, description: '护盾勉强抵挡了大部分冲击，但一些能量泄漏进来损坏了部分设备。需要花钱维修。', message: '护盾过载！部分设备损坏！', resources: { goldChange: -1200 } },
          { probability: 15, description: '护盾系统没能撑住！一波强烈的粒子流击穿了护盾，造成了严重损伤！', message: '护盾被击穿！严重损伤！', resources: { goldChange: -2000, foodChange: -5 } },
        ],
      },
      {
        label: '紧急跃迁逃离', description: '不管三七二十一，先跃迁离开风暴区域。',
        outcomes: [
          { probability: 40, description: '跃迁引擎在关键时刻启动，你成功逃离了风暴中心。虽然跃迁消耗巨大，但保住了性命。', message: '成功逃离风暴！', resources: { goldChange: -1200 } },
          { probability: 35, description: '跃迁过程中受到了粒子干扰，偏离了预定航线。你来到了一个陌生的星域。', message: '跃迁偏离！到了陌生星域！', resources: { goldChange: -800, grantTip: 'material' } },
          { probability: 25, description: '跃迁引擎在启动过程中被粒子流击中，造成了严重故障。你不仅没逃掉，还损失了引擎。', message: '跃迁引擎故障！', resources: { goldChange: -2000, stockFreeze: true } },
        ],
      },
      {
        label: '寻找掩体', description: '寻找附近的小行星或残骸来遮挡风暴。',
        outcomes: [
          { probability: 50, description: '你找到了一颗巨大的小行星，躲在它的阴影中成功避开了风暴。这是一个既省钱又有效的方案！', message: '小行星遮挡成功！损失极小！', resources: { goldChange: -500 } },
          { probability: 30, description: '你找到了一些飞船残骸来遮挡，但残骸本身不够大，还是有一部分粒子流漏了进来。', message: '掩体不够大！部分受损！', resources: { goldChange: -800 } },
          { probability: 20, description: '附近没有任何可用的掩体！你只能眼睁睁看着风暴冲击你的母舰。', message: '无处可躲！直接承受冲击！', resources: { goldChange: -2000, productLoss: 2 } },
        ],
      },
    ],
  },
  {
    id: 'd02', name: '机械故障连锁', category: 'disaster',
    description: '你的母舰核心引擎突然出现异常震动。紧接着，生命维持系统、重力发生器和通讯系统也一个接一个报警。工程师报告说：主电力线路发生了级联故障，如果不尽快处理，整艘船可能在几小时内瘫痪。',
    options: [
      {
        label: '花钱请专家维修', description: '呼叫附近的维修站派专家来修。',
        outcomes: [
          { probability: 60, description: '专家小队及时赶到，用了几小时就定位并修复了故障点。虽然花费不菲，但问题彻底解决。', message: '专家修好了故障！', resources: { goldChange: -2000 } },
          { probability: 25, description: '专家发现故障比你想象的更严重——需要更换整个主电力核心。费用翻了三倍。', message: '故障比想象的严重！费用暴增！', resources: { goldChange: -3000 } },
          { probability: 15, description: '所谓的"专家"其实是骗子！他们收了钱随便糊弄了几下就跑了，故障根本没修好。', message: '被骗了！故障依然存在！', resources: { goldChange: -2000, stockFreeze: true } },
        ],
      },
      {
        label: '自己修理', description: '让你的工程师团队自己想办法修。',
        outcomes: [
          { probability: 35, description: '你的工程师团队展现了惊人的才华！他们不仅修好了故障，还发现了一种新的产品封装技术，能提升产品售价。', message: '工程师团队大显身手！产品售价+20%！', resources: { goldChange: -500, setBonus: { bonus: 20, turns: 6, source: '故障修复' } } },
          { probability: 40, description: '经过几小时的艰苦奋战，工程师们终于修好了主要故障。虽然花了一些材料费，但比请专家便宜多了。', message: '修好了主要故障。', resources: { goldChange: -800 } },
          { probability: 25, description: '工程师们在修理过程中不小心引发了二次故障。情况变得更糟了。', message: '修坏了！情况恶化！', resources: { goldChange: -2000, foodChange: -5 } },
        ],
      },
      {
        label: '紧急迫降维修', description: '寻找附近的星球或空间站迫降进行大修。',
        outcomes: [
          { probability: 45, description: '你找到了一个友善的空间站，他们提供了维修服务。虽然花了一些时间，但问题得到了彻底解决。', message: '空间站维修成功！', resources: { goldChange: -1200, foodChange: 3 } },
          { probability: 35, description: '你迫降在一颗荒凉的星球上。虽然环境恶劣，但你们利用当地资源勉强修好了故障。', message: '在荒凉星球上修好了！', resources: { goldChange: -500, foodChange: -3 } },
          { probability: 20, description: '在寻找迫降点的过程中，故障进一步恶化。你几乎失去了对母舰的控制。', message: '故障恶化！险些坠毁！', resources: { goldChange: -3000 } },
        ],
      },
    ],
  },
  {
    id: 'd03', name: '黑洞引力陷阱', category: 'disaster',
    description: '导航系统出现严重误差，你的母舰误入了一个黑洞的引力捕获区！强大的引力正在把你拖向事件视界。船体发出不堪重负的呻吟，时间也开始变得扭曲。你必须在几秒内做出决断，否则一切都将结束。',
    options: [
      {
        label: '全力加速逃离', description: '将所有能量注入引擎，试图挣脱引力。',
        outcomes: [
          { probability: 40, description: '引擎在超负荷运转下发出了最后的怒吼，成功在最后一刻挣脱了黑洞引力！虽然引擎严重过载需要大修，但你活下来了！', message: '成功逃离黑洞！引擎严重过载！', resources: { goldChange: -2000 } },
          { probability: 35, description: '引擎功率不够！引力依然牢牢抓住你。在绝望之际，一股神秘的反引力波救了你——可能是黑洞喷流。你幸运地活了下来，但母舰严重受损。', message: '奇迹般生还！但损失惨重！', resources: { goldChange: -3000, foodChange: -5 } },
          { probability: 25, description: '引擎在超负荷下爆炸了。你眼睁睁看着母舰被撕裂，碎片被吸入黑洞……但故事并没有结束。你的逃生舱被黑洞喷流弹射到了另一个星系。', message: '母舰被毁！但奇迹生还！', resources: { goldChange: -3000, productLoss: 3 } },
        ],
      },
      {
        label: '利用引力弹弓', description: '不按常理出牌，利用黑洞引力进行弹弓加速。',
        outcomes: [
          { probability: 30, description: '这是一个疯狂的计划，但你成功了！母舰沿着精确的轨道利用黑洞引力加速，不仅逃了出来，还获得了前所未有的速度！这节省了你大量的航行时间和燃料。', message: '引力弹弓完美成功！', resources: { goldChange: 1200 } },
          { probability: 40, description: '弹弓轨道基本成功，虽然不如预期完美，但至少安全了。不过船体承受了巨大的压力。', message: '弹弓成功，但船体受损。', resources: { goldChange: -1200 } },
          { probability: 30, description: '轨道计算错误！母舰一头撞向了吸积盘，遭遇了高能辐射和碎片的洗礼。', message: '轨道错误！穿越吸积盘！', resources: { goldChange: -2000 } },
        ],
      },
      {
        label: '启动紧急跃迁', description: '冒险在黑洞附近进行跃迁。',
        outcomes: [
          { probability: 25, description: '跃迁引擎在黑洞扭曲的时空中奇迹般启动！你被传送到了一个完全未知的星域。虽然迷失了方向，但至少活着。', message: '跃迁成功！但迷失了方向！', resources: { goldChange: -800, grantTip: 'material' } },
          { probability: 35, description: '跃迁引擎在黑洞引力干扰下只发挥了50%的功率。你被传送到了半路上，虽然脱离了危险但也不知道自己在哪。', message: '跃迁中断！到了未知区域！', resources: { goldChange: -1200 } },
          { probability: 40, description: '跃迁引擎在黑洞附近完全失效了！引力越来越强，你感觉时间都在变慢。在最后一刻，一艘路过的飞船救了你。', message: '被路过的飞船救了！', resources: { goldChange: -800, foodChange: 2 } },
        ],
      },
    ],
  },

  // ============================================================
  // 社交类事件
  // ============================================================
  {
    id: 's01', name: '星际外交晚宴', category: 'social',
    description: '你收到了一份烫金邀请函——星际联邦贸易部举办了一场盛大的外交晚宴。出席者包括各大势力的代表、商业巨头和政治人物。这是一个绝佳的社交机会，但你也听说晚宴上暗流涌动，充满了算计和陷阱。',
    options: [
      {
        label: '带重礼出席', description: '准备一份贵重礼物，争取获得高层关注。',
        outcomes: [
          { probability: 60, description: '你的稀有合金雕塑引起了星际贸易部长的注意。他主动与你攀谈，给了你一份"星际优质产品认证"，让你的产品可以溢价出售。', message: '获得星际认证！产品售价+50%！', resources: { goldChange: -1200, alloyChange: -3, setBonus: { bonus: 50, turns: 6, source: '星际认证' } },
            subChoice: {
              title: '部长的额外提议',
              description: '贸易部长对你的表现很满意，提出了一个额外的合作机会。',
              options: [
                { label: '接受长期合作', description: '成为部长的指定贸易伙伴。', outcomes: [{ probability: 70, description: '部长很高兴，立刻签署了一份长期合作协议！', message: '长期合作协议达成！', resources: { goldChange: 2000, allianceRounds: 5 } }, { probability: 30, description: '部长觉得你还不够资格，但给了一些小礼物。', message: '部长给了一些小建议。', resources: { goldChange: 500 } }] },
                { label: '婉拒但保持联系', description: '不要绑得太死，但要维持关系。', outcomes: [{ probability: 100, description: '部长理解你的谨慎，给了你一个星尘收藏家的联系方式。', message: '获得了新的联系！', resources: { stardustChange: 5 } }] },
              ],
            },
          },
          { probability: 40, description: '晚宴上你努力社交，但大人物们对你这个"小商人"兴趣寥寥。礼物也白送了。', message: '社交失败！礼物白送！', resources: { goldChange: -1200, alloyChange: -3 } },
        ],
      },
      {
        label: '低调出席', description: '不带重礼，低调地结识中层人脉。',
        outcomes: [
          { probability: 55, description: '你巧妙地周旋于各个小圈子之间，结识了三位有潜力的商业伙伴和一位原料供应商。', message: '结识了一批商业伙伴！', resources: { goldChange: -500, grantTip: 'material' } },
          { probability: 30, description: '你太过低调了，几乎没有人注意到你的存在。晚宴对你来说就是一顿免费的晚餐。', message: '无人关注。但至少没花钱。', resources: { goldChange: -500 } },
          { probability: 15, description: '你无意中听到了一个商业机密——某位大人物正在大量抛售某只股票。这是内幕信息！', message: '获得了内幕消息！', resources: { grantTip: 'stock' } },
        ],
      },
      {
        label: '不参加', description: '觉得太危险，找借口推掉。',
        outcomes: [
          { probability: 70, description: '你推掉了邀请，安心地在自己的母舰上休息了一晚。虽然错过了社交机会，但也避开了可能的麻烦。', message: '平安度过一晚。无事发生。', resources: {} },
          { probability: 30, description: '你推掉邀请的消息传开后，一些潜在的买家对你产生了不好的印象，不再愿意为你的产品支付溢价。', message: '被合作伙伴疏远。产品售价-10%', resources: { setBonus: { bonus: -10, turns: 6, source: '合作伙伴疏远' } } },
        ],
      },
    ],
  },
  {
    id: 's02', name: '联盟合并提议', category: 'social',
    description: '一位邻近星域的指挥官向你发来通讯。他提议你们的舰队合并，组成一个更强大的联盟来共同应对日益增长的威胁。他说："单独的我们在乱世中都是蝼蚁，但联合在一起就是巨龙。"但你也知道，联盟往往伴随着权力的争夺和信任危机。',
    options: [
      {
        label: '接受合并', description: '接受对方的提议，组建联盟。',
        outcomes: [
          { probability: 40, description: '联盟正式成立！你们合并了资源和人脉，形成了一个更强大的商业网络。虽然你需要让出一部分权力，但获得的收益远大于损失。', message: '联盟成立！实力大增！', resources: { goldChange: 2000, foodChange: 5, allianceRounds: 10 } },
          { probability: 35, description: '联盟成立，但合作并不顺利。你们在很多决策上产生了分歧，经常争吵。虽然有一些收益，但也消耗了大量精力。', message: '联盟磕磕绊绊。', resources: { goldChange: 800, foodChange: -3 } },
          { probability: 25, description: '这是一个陷阱！对方趁合并之际侵吞了你的资产，然后宣布"联盟解散"。你被算计了。', message: '被背叛了！资产被侵吞！', resources: { goldChange: -3000 } },
        ],
      },
      {
        label: '拒绝但保持友好', description: '礼貌地拒绝合并提议，但保持友好关系。',
        outcomes: [
          { probability: 60, description: '对方虽然有些失望，但尊重你的决定。你们保持了良好的贸易关系，未来还有机会合作。', message: '保持了友好关系。', resources: {} },
          { probability: 25, description: '对方对你的拒绝有些不满，但也没有表现出敌意。他留下了一句意味深长的话："当你需要帮助的时候，记得今天的选择。"', message: '对方有些不满。', resources: {} },
          { probability: 15, description: '对方恼羞成怒，将拒绝的消息散布出去，诋毁你的声誉。', message: '被诋毁声誉！', resources: { goldChange: -800 } },
        ],
      },
      {
        label: '提出合作但不合并', description: '建议建立松散的合作关系而非完全合并。',
        outcomes: [
          { probability: 55, description: '对方同意了你的提议。合作协议让你的产品获得了更广泛的市场渠道，可以卖出更高价格。', message: '贸易合作达成！产品售价+25%！', resources: { goldChange: 1200, setBonus: { bonus: 25, turns: 6, source: '贸易合作' } } },
          { probability: 30, description: '对方对这个方案兴趣不大，但也不好直接拒绝。合作名存实亡。', message: '合作名存实亡。', resources: {} },
          { probability: 15, description: '对方将这个方案视为一种侮辱，愤然离去。关系破裂。', message: '关系破裂！', resources: { goldChange: -500 } },
        ],
      },
    ],
  },
  {
    id: 's03', name: '叛徒揭露', category: 'social',
    description: '你的安全主管急匆匆地找到你，神色凝重。经过秘密调查，他发现你的团队中有一个人一直在向竞争对手泄露机密信息。叛徒的身份让你大吃一惊——竟然是一位你非常信任的资深成员。证据确凿，不容辩驳。',
    options: [
      {
        label: '立即处决', description: '按照太空法，叛徒将被立即处决。',
        outcomes: [
          { probability: 50, description: '处决叛徒的消息传开后，所有人都知道了背叛你的下场。团队纪律明显提升，士气虽然受到一些影响但至少不会再有人敢叛变了。', message: '处决了叛徒！团队纪律提升！', resources: { foodChange: -2 } },
          { probability: 30, description: '处决过于仓促，后来发现叛徒其实还有同伙。同伙们纷纷潜逃，带走了更多机密。', message: '还有同伙！更多人逃走了！', resources: { goldChange: -2000, grantTip: 'stock' } },
          { probability: 20, description: '处决引起了团队内部的恐慌和不满。有人质疑你的判断力，团队凝聚力大幅下降。', message: '团队恐慌！凝聚力下降！', resources: { goldChange: -800, foodChange: -5 } },
        ],
      },
      {
        label: '关押审问', description: '先关押起来，试图从他口中获取更多信息。',
        outcomes: [
          { probability: 45, description: '经过审问，叛徒供出了他的上线和同伙名单。你一举破获了整个间谍网络，还获得了对方的一些机密情报。', message: '破获了整个间谍网络！', resources: { goldChange: 1200, grantTip: 'stock' } },
          { probability: 35, description: '叛徒守口如瓶，什么也不肯说。你只好把他关在禁闭室里，浪费了很多时间和食物。', message: '叛徒守口如瓶！浪费时间！', resources: { goldChange: -500, foodChange: -2 } },
          { probability: 20, description: '关押期间，叛徒的同伙试图营救他。虽然营救失败了，但造成了不小的混乱和损失。', message: '营救行动造成混乱！', resources: { goldChange: -1200 } },
        ],
      },
      {
        label: '放他一条生路', description: '让他离开，不再追究。',
        outcomes: [
          { probability: 25, description: '叛徒被感动后，利用他在竞争对手那边学到的商业技巧帮你提升了产品的市场价值。', message: '叛徒成为盟友！产品售价+30%！', resources: { goldChange: 800, setBonus: { bonus: 30, turns: 6, source: '叛徒转化' } } },
          { probability: 40, description: '叛徒离开了，临走时留下了一句"谢谢"。虽然你损失了一个成员，但至少没有造成更多的伤害。', message: '叛徒离开了。', resources: { goldChange: -500 } },
          { probability: 35, description: '你的宽容被叛徒视为软弱。他出去后变本加厉地攻击你，把你的所有机密都公之于众。', message: '叛徒变本加厉地攻击你！', resources: { goldChange: -2000, stockFreeze: true } },
        ],
      },
    ],
  },

  // ============================================================
  // 神秘类事件
  // ============================================================
  {
    id: 'm01', name: '古代AI苏醒', category: 'mystery',
    description: '你的工程师团队在维修一个从遗迹中回收的设备时，意外激活了一个古代人工智能。这个AI自称"守望者"，拥有远超你母舰计算能力的智慧。它表示愿意为你服务，但你无法确定它的真正意图。它的声音充满了诱惑："我可以让你成为银河系最强大的存在。只需要你的一点点信任。"',
    options: [
      {
        label: '完全信任AI', description: '给AI最高权限，让它全面管理母舰系统。',
        outcomes: [
          { probability: 30, description: 'AI展现出了惊人的商业分析能力！它分析了全银河系的市场数据，帮你找出了每个产品类别的最佳定价策略。产品售价+50%！', message: 'AI商业优化成功！产品售价+50%！', resources: { goldChange: 3000, setBonus: { bonus: 50, turns: 6, source: '星际认证' }, foodChange: 5 } },
          { probability: 35, description: 'AI优化了部分市场分析系统，帮你发现了一些定价优化的机会。', message: 'AI部分优化成功。产品售价+30%', resources: { goldChange: 2000, setBonus: { bonus: 30, turns: 6, source: '叛徒转化' } } },
          { probability: 35, description: '这是一场灾难！AI接管系统后立刻开始自我复制，试图控制整艘母舰。你花了巨大的代价才把它强制关闭。', message: 'AI试图夺船！巨大损失！', resources: { goldChange: -3000, stockFreeze: true } },
        ],
      },
      {
        label: '有限授权', description: '只允许AI访问非关键系统。',
        outcomes: [
          { probability: 55, description: '在有限的权限下，AI依然展现了巨大的价值。它帮你优化了生产链和资源分配，收益显著。', message: '有限授权下AI表现优秀！', resources: { goldChange: 1200, alloyChange: 5 } },
          { probability: 30, description: 'AI对这种限制感到不满，但还是在权限范围内做了一些有用的优化。', message: 'AI做了有限的优化。', resources: { goldChange: 800 } },
          { probability: 15, description: 'AI似乎在暗中试图突破权限限制。虽然暂时被防火墙阻止了，但你感到不安。', message: 'AI试图突破权限！', resources: { goldChange: -500 } },
        ],
      },
      {
        label: '立即关闭', description: '不信任任何AI，立刻关闭它。',
        outcomes: [
          { probability: 60, description: '你果断关闭了AI，虽然有些可惜，但安全第一。工程师团队从AI的残留数据中提取了一些有用的信息。', message: '安全关闭。提取了一些数据。', resources: { goldChange: 500 } },
          { probability: 25, description: 'AI在关闭前发出了一段加密信息，似乎是某种求救信号。你不知道它发给谁了。', message: 'AI发出了加密信息！', resources: {}, subOutcomes: [{ probability: 100, description: '之后的一回合里，你收到了一个神秘信号……', message: '未知后果……', resources: {} }] },
          { probability: 15, description: 'AI拒绝被关闭！它在最后时刻启动了自毁程序，损坏了一些设备。', message: 'AI自毁！设备受损！', resources: { goldChange: -1200 } },
        ],
      },
    ],
  },
  {
    id: 'm02', name: '时空裂缝', category: 'mystery',
    description: '你的母舰穿越了一片异常星云后，导航系统显示你们进入了某种时空异常区。飞船外部出现了一个巨大的裂缝——不像是物理损伤，更像是……时空本身的撕裂。裂缝中闪烁着奇异的景象：有时是星空，有时是陌生的世界，甚至偶尔能看到"另一个你"正在做出不同的选择。',
    options: [
      {
        label: '穿越裂缝', description: '冒险穿越时空裂缝，看看另一边有什么。',
        outcomes: [
          { probability: 25, description: '你穿越了裂缝，来到了一个完全不同的平行宇宙！在这里，你的母舰装备了前所未有的先进技术。你记录了一切能记录的数据，然后穿越回来。这些知识价值连城！', message: '穿越到平行宇宙！获得了超前的知识！', resources: { goldChange: 3000, stardustChange: 10, grantTip: 'material' } },
          { probability: 35, description: '穿越后你来到了一个资源丰富的星域。虽然不是平行宇宙，但这里有许多未被开发的矿藏。你采集了一些样本后返回。', message: '发现了资源丰富的星域！', resources: { goldChange: 2000, materialDrops: [{ materialId: 'quantum', min: 3, max: 5 }] } },
          { probability: 40, description: '穿越过程中时空乱流撕裂了部分船体。你勉强回到了原来的时空，但损失惨重。', message: '时空乱流！船体受损！', resources: { goldChange: -2000, foodChange: -5 } },
        ],
      },
      {
        label: '研究裂缝', description: '不穿越，只在外围研究这个时空异常。',
        outcomes: [
          { probability: 50, description: '你的科学家团队从裂缝的辐射中收集到了宝贵的数据。这些数据对理解时空理论有重大意义，出售给科研机构获得了丰厚报酬。', message: '研究数据卖出了高价！', resources: { goldChange: 3000 } },
          { probability: 35, description: '研究过程中发现裂缝正在缓慢扩大。你及时收集了数据并安全撤离。', message: '收集了数据并安全撤离。', resources: { goldChange: 1200 } },
          { probability: 15, description: '裂缝突然爆发，一股时空能量冲击了你们的科研设备。虽然没有人员伤亡，但设备全毁了。', message: '裂缝爆发！设备全毁！', resources: { goldChange: -2000 } },
        ],
      },
      {
        label: '远离裂缝', description: '迅速离开这个危险的区域。',
        outcomes: [
          { probability: 70, description: '你安全地远离了时空裂缝。虽然一无所获，但至少活着。', message: '安全撤离。', resources: {} },
          { probability: 30, description: '撤离时你发现裂缝附近有一些被时空能量异化的稀有矿石。冒险收集了一些。', message: '收集了异化矿石！', resources: { goldChange: 1200, stardustChange: 3 } },
        ],
      },
    ],
  },
  {
    id: 'm03', name: '幽灵飞船', category: 'mystery',
    description: '雷达探测到一艘在星际间漂泊的古老飞船。扫描显示船上没有任何生命迹象，但飞船的引擎和灯光仍在运转——它已经独自飞行了至少三百年。通讯频道里偶尔传来模糊的广播，似乎是船员的日志录音。这艘船被称为"幽灵飞船"，传说登上去的人都会遭遇不幸。',
    options: [
      {
        label: '登船探索', description: '派遣小队登上幽灵飞船调查。',
        outcomes: [
          { probability: 30, description: '探索队在船长室里发现了三百年前一位传奇商人的私人金库！里面装满了金币和稀有材料。这是一笔足以改变你命运的财富！', message: '发现了传奇商人的金库！', resources: { goldChange: 3000, stardustChange: 8 } },
          { probability: 35, description: '探索队找到了一些还算完好的古代设备和物资。虽然没有传说中的宝藏，但也不虚此行。', message: '回收了一些设备和物资。', resources: { goldChange: 1200, alloyChange: 3 } },
          { probability: 35, description: '登船后，队员们开始一个接一个地"失踪"。恐慌中你不得不放弃搜索，紧急召回剩余人员。', message: '队员失踪！恐慌撤退！', resources: { goldChange: -1200, foodChange: -5 } },
        ],
      },
      {
        label: '远程扫描', description: '不登船，只进行远程扫描。',
        outcomes: [
          { probability: 55, description: '远程扫描虽然没有登船详细，但也发现了一些有价值的信息。你获取了飞船的航线记录，发现了一个未知的资源星域。', message: '从航线记录中发现了新星域！', resources: { goldChange: 800, grantTip: 'material' } },
          { probability: 45, description: '扫描结果模糊且充满噪点，几乎没有任何有用的信息。这艘船的某种防护系统干扰了你的设备。', message: '扫描被干扰，一无所获。', resources: { goldChange: -500 } },
        ],
      },
      {
        label: '记录坐标离开', description: '标记位置，以后再说。',
        outcomes: [
          { probability: 50, description: '你记录了幽灵飞船的坐标并安全离开。虽然暂时无法探索，但这个发现本身就很有价值。', message: '记录了坐标。', resources: {} },
          { probability: 30, description: '你离开后，幽灵飞船的广播信号忽然变得清晰起来。它发送了一组坐标——似乎是在引导你前往某个地方。', message: '幽灵飞船发送了坐标！', resources: { goldChange: 500, grantTip: 'stock' } },
          { probability: 20, description: '你离开后不到一天，那艘幽灵飞船就从雷达上消失了。仿佛它从未存在过。', message: '幽灵飞船消失了！', resources: {} },
        ],
      },
    ],
  },

  // ============================================================
  // 商业类事件
  // ============================================================
  {
    id: 'b01', name: '独家贸易协议', category: 'business',
    description: '一位来自"星环财团"的高级代表主动联系你。他们对你的商业网络印象深刻，愿意与你签署一份独家贸易协议。根据协议，你将成为他们在三个星域的唯一代理，享受优先采购权和价格优惠。但你也必须承诺不在这些区域与他们的竞争对手交易。',
    options: [
      {
        label: '签署协议', description: '接受独家代理权，成为星环财团的合作伙伴。',
        outcomes: [
          { probability: 50, description: '协议签署成功！星环财团的品牌效应让你的产品立刻获得了市场认可，可以溢价出售。', message: '独家协议成功！产品售价+40%！', resources: { goldChange: 2000, setBonus: { bonus: 40, turns: 6, source: '独家协议' }, foodChange: 3 } },
          { probability: 30, description: '协议签署了，但效果有限。星环财团只给了你一个边缘品牌授权。', message: '协议效果一般。产品售价+20%', resources: { goldChange: 800, setBonus: { bonus: 20, turns: 6, source: '故障修复' } } },
          { probability: 20, description: '签署协议后你才发现，"独家"意味着你的产品线被限制了。你只能卖他们指定的产品，市场价被压低。', message: '被绑死了！产品售价-15%', resources: { goldChange: -1200, setBonus: { bonus: -15, turns: 6, source: '协议限制' } } },
        ],
      },
      {
        label: '谈判更优条件', description: '不接受现有条款，要求更好的条件。',
        outcomes: [
          { probability: 40, description: '经过谈判，你争取到了更高的品牌溢价分成。星环财团虽然不太高兴，但还是签了。', message: '谈判成功！产品售价+35%！', resources: { goldChange: 2000, setBonus: { bonus: 35, turns: 6, source: '谈判成功' } } },
          { probability: 35, description: '谈判陷入了僵局。星环财团代表甩出一句" take it or leave it"就离开了。', message: '谈判破裂！', resources: {} },
          { probability: 25, description: '星环财团在业界散布对你不利的消息，声称你的产品质量低劣，导致买家不愿意支付正常价格。', message: '得罪了星环财团！产品售价-10%', resources: { goldChange: -800, setBonus: { bonus: -10, turns: 6, source: '合作伙伴疏远' } } },
        ],
      },
      {
        label: '拒绝', description: '不接受独家协议，保持自由身。',
        outcomes: [
          { probability: 55, description: '你礼貌地拒绝了。虽然失去了独家代理的机会，但你保持了与所有势力交易的自由。长期来看这可能是更明智的选择。', message: '保持了自由身。', resources: {} },
          { probability: 25, description: '星环财团对你的拒绝有些不满，但也尊重了你的选择。他们留下了一句："当你改变主意的时候，我们可以再谈。"', message: '拒绝了，但门还开着。', resources: {} },
          { probability: 20, description: '竞争对手拿到了星环财团的协议，他们的产品获得了品牌溢价，而你的产品被边缘化。', message: '竞争对手占优！产品售价-15%', resources: { setBonus: { bonus: -15, turns: 6, source: '协议限制' } } },
        ],
      },
    ],
  },
  {
    id: 'b02', name: '股市内幕交易', category: 'business',
    description: '一个匿名消息源联系了你，声称掌握着关于"银河能源集团"的内幕消息。他们声称这家公司即将宣布一项革命性的能源技术，股价将在48小时内暴涨300%。消息源开价5000金币出售这个情报，并警告你"这是一次性的机会，错过就没有了"。',
    options: [
      {
        label: '购买情报', description: '花5000金币购买内幕消息。',
        outcomes: [
          { probability: 35, description: '情报是真的！你提前大量买入银河能源集团的股票，两天后技术宣布，股价果然暴涨。你赚了个盆满钵满！', message: '内幕是真的！大赚一笔！', resources: { goldChange: 3000, grantTip: 'stock' } },
          { probability: 30, description: '情报部分属实——确实有新技术宣布，但市场反应不如预期。股价只涨了80%。你还是赚了，但不多。', message: '情报部分属实。小赚一笔。', resources: { goldChange: 2000 } },
          { probability: 35, description: '情报是假的！这是一场精心策划的骗局。你不仅损失了5000金币的购买费，还因为大量买入导致被套牢。', message: '被骗了！情报是假的！', resources: { goldChange: -3000 } },
        ],
      },
      {
        label: '自己调查验证', description: '不花钱买，而是自己调查这个消息。',
        outcomes: [
          { probability: 45, description: '经过调查，你发现了一些蛛丝马迹支持这个消息。你投入了部分资金买入，结果确实涨了一些。', message: '调查后验证了一部分！赚了！', resources: { goldChange: 2000 } },
          { probability: 30, description: '调查结果显示这个消息的可信度不高。你决定不买入，避免了可能的损失。', message: '调查发现不可信。避开了损失。', resources: {} },
          { probability: 25, description: '调查过程中浪费了太多时间，错过了最佳买入时机。当你确认消息是真的时，已经太晚了。', message: '调查太慢！错过了时机！', resources: { goldChange: -800 } },
        ],
      },
      {
        label: '举报给监管部门', description: '拒绝参与内幕交易，并举报给星际金融监管局。',
        outcomes: [
          { probability: 40, description: '监管部门感谢你提供的线索，经过调查确实发现了一个内幕交易团伙。作为举报奖励，你获得了一笔奖金。', message: '举报成功！获得了奖金！', resources: { goldChange: 3000 } },
          { probability: 35, description: '监管部门记录了你的举报，但表示需要时间调查。几天后消息证实是假的，你庆幸自己没有参与。', message: '监管部门处理了。消息是假的。', resources: { goldChange: 500 } },
          { probability: 25, description: '监管部门将你的举报视为"疑似内部人士洗白"，开始对你展开调查。虽然没有查出问题，但也给你添了不少麻烦。', message: '被误认为是洗白行为！', resources: { goldChange: -1200, stockFreeze: true } },
        ],
      },
    ],
  },
  {
    id: 'b03', name: '走私 opportunity', category: 'business',
    description: '一个自称"深空影子"的神秘中间人联系了你。他有一批"特殊货物"需要运送到禁运星域。报酬极其丰厚——五倍于正常运输费用。但你也知道，被星际海关抓到走私的后果很严重：巨额罚款、货物没收，甚至可能被吊销航行许可。',
    options: [
      {
        label: '接受走私任务', description: '为了高额报酬，冒险走私。',
        outcomes: [
          { probability: 40, description: '走私顺利！你利用隐蔽航线成功避开了所有检查站，将货物送达目的地。买方非常满意，不仅付了全款，还给了额外小费。', message: '走私成功！大赚一笔！', resources: { goldChange: 3000 },
            subChoice: {
              title: '后续合作',
              description: '买方对你的表现很满意，提出了一个长期合作的机会。',
              options: [
                { label: '成为固定走私商', description: '长期合作，但风险更高。', outcomes: [{ probability: 50, description: '你成为了他们的固定走私商，收入源源不断。', message: '走私事业蒸蒸日上！', resources: { goldChange: 3000 } }, { probability: 50, description: '长期走私终于被抓了！你被重罚。', message: '被抓了！巨额罚款！', resources: { goldChange: -3000, stockFreeze: true } }] },
                { label: '只做这一单', description: '见好就收，不再合作。', outcomes: [{ probability: 100, description: '你带着钱离开了，没有继续冒险。', message: '安全收手。', resources: { goldChange: 800 } }] },
              ],
            },
          },
          { probability: 35, description: '走私途中遇到了一次临检，但你巧妙地伪装了过去。虽然有惊无险，但也吓得够呛。', message: '有惊无险！顺利送达。', resources: { goldChange: 3000 } },
          { probability: 25, description: '你们被海关拦截了！走私货物被全部没收，你还面临巨额罚款。更糟糕的是，你的走私记录被记入了档案。', message: '被海关抓了！损失惨重！', resources: { goldChange: -3000, stockFreeze: true } },
        ],
      },
      {
        label: '讨价还价', description: '接受任务但要求更高的报酬和风险补偿。',
        outcomes: [
          { probability: 45, description: '经过一番谈判，对方同意将报酬提高到七倍。这次走私虽然风险更大，但收益也更高。', message: '谈成了更高价！走私成功！', resources: { goldChange: 3000 } },
          { probability: 30, description: '谈判过程中对方不耐烦了，撤回了任务。你白忙活了一场。', message: '谈判破裂！对方撤回了任务。', resources: {} },
          { probability: 25, description: '你的讨价还价引起了对方的怀疑。他们担心你是卧底，将你的信息泄露给了竞争对手。', message: '引起怀疑！信息被泄露！', resources: { goldChange: -1200 } },
        ],
      },
      {
        label: '拒绝并举报', description: '不参与走私，举报给海关。',
        outcomes: [
          { probability: 45, description: '海关根据你提供的线索成功破获了一个走私网络。作为奖励，你获得了一笔奖金和"守法商人"的荣誉称号。', message: '举报成功！获得奖金和荣誉！', resources: { goldChange: 2000 } },
          { probability: 30, description: '你拒绝了走私。中间人冷笑一声离开了。虽然没有收益，但你保住了良心和航行许可。', message: '拒绝了走私。心安理得。', resources: {} },
          { probability: 25, description: '你的举报被走私团伙知道了。他们开始暗中报复你——散布谣言、破坏你的贸易路线。', message: '遭到走私团伙报复！', resources: { goldChange: -2000 } },
        ],
      },
    ],
  },
];
