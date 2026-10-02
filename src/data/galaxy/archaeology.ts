// ==================== 考古遗迹数据（10 处，唯一真值） ====================
// 星图边陲带的 10 处遗迹（节点 siteId → 本文件，见 data/galaxy/nodes.ts）的发掘阶段与奖励。
// 口径：每处遗迹需 1 名领袖驻守（minLeaderLevel 为驻守门槛，0 = 无要求）；
//   每个阶段 = 耗时 turns 回合 · 难度 difficulty（成功率 −0.12×难度）· 投入 cost（金币/食物/合金/星尘扣母舰，科研点扣殖民地，原料见 materials）。
//   阶段抉择 choice 只影响该阶段奖励与成功率，不影响能否推进；阶段小奖励写在 bonus（成功时的「发现」同走此字段）。
//   全部阶段完成后的最终奖励写在 reward（遗物 / 永久加成 / 称号 + 附带资源）。
//   危险率 dangerRate 默认 0.35（碳壳巢为 0.5）。
// 图片约定：阶段图 /archaeology/<siteId>/<stageId>.webp，图鉴大图 /archaeology/<siteId>/cover.webp，
//   发掘中止剧情图 /archaeology/<siteId>/halt.webp（每处遗迹一张，自然失败按 HALT_CHANCE 触发永久中止时显示）。
// ⚠ 数值为既定平衡（阶段数合计 42），改动前先出前后对比表；本文件是阶段与奖励的唯一来源，逻辑层与 UI 勿另行硬编码。

import type { ArchaeologySite } from '@/types/galaxy';

export const ARCHAEOLOGY_SITES: ArchaeologySite[] = [
  // ==================== 1. 无声钟楼 ====================
  {
    id: 'bell_tower',
    name: '无声钟楼',
    civilization: '聆弦者',
    minLeaderLevel: 0,
    dangerRate: 0.35,
    intro:
      '聆弦者立起的一座环状声学塔。塔心悬着一口从未被敲响的钟，整颗星球静得没有回声。他们后来不再听了，塔还留着，来人想弄清它究竟想听见什么。',
    galleryImage: '/archaeology/bell_tower/cover.webp',
    haltText:
      '钟腔里那口钟自己响了。不是被敲响的，是八根细弦同时崩断，钟身沉下来，把塔心的竖井整段压塌。井下的人只来得及退回塔外。塔身随后向内收拢，接缝重新合上，像是终于听完了它要听的东西，不再留出入口。',
    haltImage: '/archaeology/bell_tower/halt.webp',
    stages: [
      {
        id: 'S1',
        title: '塔基清理',
        turns: 1,
        difficulty: 0,
        cost: { gold: 5000 },
        text: '我们清走了塔基周围积了不知多少年的尘。塔座由一整块暗色岩石凿成，接缝处没有灰浆，只有被反复摩擦出的圆润弧面。塔身向内收成环，站在中央说话，声音不会散开，只贴着环壁一圈一圈地绕。谁也没有开口，都在听。',
        image: '/archaeology/bell_tower/S1.webp',
        bonus: { researchPoints: 120 },
      },
      {
        id: 'S2',
        title: '测音井',
        turns: 1,
        difficulty: 1,
        cost: { researchPoints: 150 },
        text: '塔基下有一口竖井，井壁上刻着等距的细槽，深浅不一。声波沿井壁下行时被细槽一段段截住，落到底部已经碎成极低的嗡鸣。我们把测距仪垂下去量，槽距与塔身的环径对应得严丝合缝。这不是井，是一条把声音慢慢放慢的管道。',
        image: '/archaeology/bell_tower/S2.webp',
        bonus: { materials: { carbon: 20 } },
      },
      {
        id: 'S3',
        title: '钟腔余响',
        turns: 2,
        difficulty: 1,
        cost: { gold: 12000 },
        text: '清理到塔心时，悬钟的绳索已经朽断，钟却仍停在原来的高度，被八根细弦拉住。钟体内壁满是一层极薄的白霜，像是长期承受振动留下的痕迹。我们把最后一段朽绳收进箱里，没有敲门。整座塔在那一刻安静下来，静得让人不敢挪脚。',
        image: '/archaeology/bell_tower/S3.webp',
        bonus: { stardust: 5 },
      },
    ],
    reward: { relics: ['r_016'], researchPoints: 200 },
  },

  // ==================== 2. 镜面坟场 ====================
  {
    id: 'mirror_graveyard',
    name: '镜面坟场',
    civilization: '磨镜者',
    minLeaderLevel: 0,
    dangerRate: 0.35,
    intro:
      '磨镜者把整颗行星的表面磨成了一面镜子。如今镜面碎成千万片，仍在天光下互相对照。来的人大多冲着镜面本身，少数人是来读镜面里压着的字。',
    galleryImage: '/archaeology/mirror_graveyard/cover.webp',
    haltText:
      '我们脚下那片镜面在取样时沿着纹路裂成两半。裂缝没有声音，两半镜面各向一侧倾斜，把压在玻璃层下的纹路全部对进了对方里面。要再读，得先有第二颗行星的镜面来对照。磨镜者留下的字，从此只照着自己。',
    haltImage: '/archaeology/mirror_graveyard/halt.webp',
    stages: [
      {
        id: 'S1',
        title: '镜面测绘',
        turns: 1,
        difficulty: 0,
        cost: { gold: 6000 },
        text: '我们从停在轨道上的飞船往下看，整块大陆是一面裂开的镜。碎片之间没有错位，缝隙细得只能容下一条影子。落地后第一步踩下去，脚下传来极轻的脆响，像踩在一层薄冰上。测绘队沿着裂痕走了一天，把每一条裂缝的走向都标了出来。',
        image: '/archaeology/mirror_graveyard/S1.webp',
        bonus: { materials: { silicon: 15 } },
      },
      {
        id: 'S2',
        title: '拓印与抉择',
        turns: 2,
        difficulty: 1,
        cost: { materials: { silicon: 40 } },
        text: '我们在最大的一片镜面上读出了磨镜者留下的纹路，线条细如发丝，被压在玻璃表面之下。纹路不是刻的，是磨的时候一层一层留下来的，靠近边缘处的内容还很完整。要带走它，只有两种办法，一种是隔着玻璃把它抄下来，另一种是直接把这块镜面撬出来。',
        image: '/archaeology/mirror_graveyard/S2.webp',
        choice: {
          prompt: '最大那片镜面上的纹路，拓印还是把镜面取下来？',
          options: [
            {
              label: '拓印',
              description: '隔膜读数，纹路只能取到表层，但镜面一步不动。',
              kind: 'safe',
            },
            {
              label: '取下镜面',
              description: '整块撬出带走，纹路完整，裂痕会沿着整片镜面散开。',
              kind: 'risky',
            },
          ],
        },
        bonus: { gold: 4000 },
      },
      {
        id: 'S3',
        title: '镜心取出',
        turns: 1,
        difficulty: 2,
        cost: { gold: 15000 },
        text: '镜面之下还有一层透镜阵列，每一片都对着一片镜子。所有透镜最后汇到中央一面凹面镜，焦点悬在离地六百米的空中，正对着天顶一个固定的方位。我们用激光沿这条光路打上去，光束穿过所有镜片，方向一点没偏。整颗星球原来是一台对着同一个方向说话的机器。',
        image: '/archaeology/mirror_graveyard/S3.webp',
        bonus: { researchPoints: 150 },
      },
    ],
    reward: { relics: ['r_017'], alloy: 30 },
  },

  // ==================== 3. 碳壳巢 ====================
  {
    id: 'carbon_nest',
    name: '碳壳巢',
    civilization: '深掘者',
    minLeaderLevel: 0,
    dangerRate: 0.5,
    intro:
      '深掘者在地壳深处筑起的一座巨型巢体，层层碳纤维叠成壳。巢还带着余温，靠近时仪器会自己跳数。来的人想要壳里的原料，也想弄明白它养过什么。',
    galleryImage: '/archaeology/carbon_nest/cover.webp',
    haltText:
      '深处的碳壁承受不住通道加固的应力，成片地脱开。脱落的碳层像活物一样逐段合拢，把通道一层层封回去，合到入口时连钢架一起包了进去。仪器上的温度还在上升。巢体回到了它自己的密度里，这里不能再进了。',
    haltImage: '/archaeology/carbon_nest/halt.webp',
    stages: [
      {
        id: 'S1',
        title: '碳层剥落',
        turns: 1,
        difficulty: 0,
        cost: { materials: { carbon: 40 } },
        text: '巢体露在地面上的部分像一截被折断的树干，断面全是同心圆状的碳层。我们沿着断面剥下最外一层，纤维仍然带着韧性，掰不断。剥到第三层时，下面的碳层忽然变热，手套隔着两层也挡不住。我们退出来，重新选了一个入刀的位置。',
        image: '/archaeology/carbon_nest/S1.webp',
        bonus: { materials: { oil: 12 } },
      },
      {
        id: 'S2',
        title: '通道加固',
        turns: 1,
        difficulty: 1,
        cost: { gold: 10000 },
        text: '壳与壳之间的过道只有一人宽，脚下踩的是碎碳，头顶是一层被挤压变形的拱。我们用合金钢架把最先两段撑起来，撑杆刚受力就发出连续的闷响，那是壳在自己找平衡。往里走第一步需要贴住侧壁，因为脚下的碳层是软的。',
        image: '/archaeology/carbon_nest/S2.webp',
        bonus: { researchPoints: 150 },
      },
      {
        id: 'S3',
        title: '余热深处',
        turns: 2,
        difficulty: 2,
        cost: { alloy: 60 },
        text: '越往里温度越高，第四层开始，碳壁上挂着细密的水珠，落到地上立刻腾起白气。我们用隔热板一段段铺过去，把温度记录仪留在每一段过道里。数据回传时显示，巢心方向的热源没有随深度衰减，反而在最后一公里内抬升得更快。什么东西还在里面维持着温度。',
        image: '/archaeology/carbon_nest/S3.webp',
        bonus: { stardust: 4 },
      },
      {
        id: 'S4',
        title: '巢心取样',
        turns: 1,
        difficulty: 2,
        cost: { gold: 18000 },
        text: '巢心是一个不足十米的空腔，腔内壁覆着一层镜面似的碳膜，映出我们所有人的轮廓。空腔正中没有任何结构，只有一圈环状凹痕，像是长久承托过什么圆的东西。我们在凹痕底部取了样，碳块与石油混在一起，断面里还嵌着极细的纤维束。有人轻声说，那东西后来自己走了。',
        image: '/archaeology/carbon_nest/S4.webp',
        bonus: { gold: 6000 },
      },
    ],
    reward: { relics: ['r_018'], materials: { carbon: 30, oil: 30 } },
  },

  // ==================== 4. 停摆的摇篮 ====================
  {
    id: 'cradle',
    name: '停摆的摇篮',
    civilization: '园丁',
    minLeaderLevel: 0,
    dangerRate: 0.35,
    intro:
      '园丁留下的方舟遗址。他们自称种过每一颗有土的行星，把各地的种质装进这座摇篮，它却在中途停了。种子还封在里面，来的人多半为了那批还没醒的种。',
    galleryImage: '/archaeology/cradle/cover.webp',
    haltText:
      '保温格的内膜在我们搬动那粒种子之后开始收缩。收缩从走廊尽头往外来，格盖一格格合上，最后整条走廊的内膜贴到了外壳上，中间再没有留出空隙。种子留在了它自己的位置上，我们只带走了记录下来的数据。',
    haltImage: '/archaeology/cradle/halt.webp',
    stages: [
      {
        id: 'S1',
        title: '种子静默',
        turns: 1,
        difficulty: 0,
        cost: { food: 200 },
        text: '摇篮外壁覆着厚厚一层枯去的根系，根须沿着外壳的缝一直长到地下。我们清出一段入口，先用食物把营地稳住，才敢往里看。里面是一条环形走廊，两侧是数不清的格子，每个格子都关着一粒种子。没有一粒发芽，也没有一粒腐烂，它们只是停在那里。',
        image: '/archaeology/cradle/S1.webp',
        bonus: { materials: { carbon: 20 } },
      },
      {
        id: 'S2',
        title: '摇篮外壳',
        turns: 2,
        difficulty: 1,
        cost: { gold: 12000 },
        text: '摇篮的外壳是三层套着的壳，最外是活体组织，中间是合金骨架，最内是一层摸上去像皮肤的内膜。我们在骨架上找到了停摆的痕迹，所有传动轮都停在同一角度上，像是被同一个指令同时叫停。内膜还保持着水分，手按上去会慢慢回弹。',
        image: '/archaeology/cradle/S2.webp',
        bonus: { researchPoints: 150 },
      },
      {
        id: 'S3',
        title: '种子抉择',
        turns: 2,
        difficulty: 2,
        cost: { researchPoints: 300 },
        text: '在走廊尽头的保温格里，我们找到唯一一粒还带着微弱代谢信号的种子。格盖上贴着一枚极小的标签，字迹已经磨平，只用指尖摸得出一个圆形的凹印。它像是被特意留到最后的一粒，等一个够资格的人来决定。',
        image: '/archaeology/cradle/S3.webp',
        choice: {
          prompt: '这粒还活着的种子，唤醒它还是原样封回去？',
          options: [
            {
              label: '复活种子',
              description: '当场唤醒它带回去，成败就看这一次。',
              kind: 'risky',
            },
            {
              label: '原位封存',
              description: '保持原有环境，只取走记录，种子继续睡。',
              kind: 'safe',
            },
          ],
        },
        bonus: { stardust: 6 },
      },
      {
        id: 'S4',
        title: '星尘落定',
        turns: 1,
        difficulty: 2,
        cost: { stardust: 8 },
        text: '收尾那天我们没有动剩下的格子，只是逐格记录了温湿与光谱数据。撒下的星尘在走廊里浮成一条淡淡的亮线，落在每个格盖上，把编号照得比灯下更清楚。整座摇篮在这一刻像被谁轻轻拍了一下。我们封上入口，把记录带了出来。',
        image: '/archaeology/cradle/S4.webp',
        bonus: { gold: 5000 },
      },
    ],
    reward: { permaBonuses: ['perm_agriculture'], food: 300 },
  },

  // ==================== 5. 折叠回廊 ====================
  {
    id: 'corridor',
    name: '折叠回廊',
    civilization: '汇兑者',
    minLeaderLevel: 0,
    dangerRate: 0.35,
    intro:
      '汇兑者的空间中转站。他们把三个星系之间的货流折进同一条走廊，走廊至今还能用，只是出口的坐标漂了。往来的人想知道他们当年换的是什么。',
    galleryImage: '/archaeology/corridor/cover.webp',
    haltText:
      '回廊在中段又折了一次。这一次折角不再是一度以内，测距仪上的距离与脚下的步数同时失去了意义，圆厅的坐标从中转站的记录里滑了出去。我们从原路退出来时，身后的入口已经不是入口了。汇兑者折过的路，只肯折那么几次。',
    haltImage: '/archaeology/corridor/halt.webp',
    stages: [
      {
        id: 'S1',
        title: '汇率断层',
        turns: 1,
        difficulty: 0,
        cost: { gold: 15000 },
        text: '回廊入口的岩层被切成整齐的断口，断面上留着平行排布的金属薄片，每一片厚度不同。我们用探针逐片测，薄片的间距在某个位置忽然改了规律，前段按三配一，后段按五配二。汇兑者把兑换的算法直接浇进了墙里。',
        image: '/archaeology/corridor/S1.webp',
        bonus: { gold: 4000 },
      },
      {
        id: 'S2',
        title: '回廊折叠',
        turns: 1,
        difficulty: 1,
        cost: { gold: 25000 },
        text: '往里走两百步，身后的入口已经看不见了，测距仪却显示我们离入口只有四十米。回廊在中段折了两次，两次的折角加起来不足一度，走起来却像绕了很远。我们把合页状的结构逐个编号，编号到一半时，队里有人停下来说，这里不像通道，像是被人捏在手里反复折叠的一张账页。',
        image: '/archaeology/corridor/S2.webp',
        bonus: { researchPoints: 150 },
      },
      {
        id: 'S3',
        title: '星尘汇率',
        turns: 2,
        difficulty: 2,
        cost: { stardust: 10 },
        text: '回廊尽头是一间圆厅，穹顶向下压得很低，地面嵌着三层同心环，环上浮着极淡的星尘。星尘在环槽里缓慢流动，速度与环的直径成反比。我们把星尘的流向记录下来，发现它始终在向中央汇集，像在结算一笔还没结清的账。圆厅没有一个出口，来路就是唯一的出口。',
        image: '/archaeology/corridor/S3.webp',
        bonus: { materials: { quantum: 10 } },
      },
      {
        id: 'S4',
        title: '账目核对',
        turns: 2,
        difficulty: 2,
        cost: { gold: 40000 },
        text: '圆厅中央的台面上摊着一层极薄的金属片，上面有密密麻麻的压痕，每一道都是一次交易。我们把压痕逐条拓下，序列排到最后，记录停在一个重复了三次的符号上，后面就再也没有了。汇兑者最后那笔账，只写了收，没有写付。我们收好拓片，沿原路往回走，回程比来时短得多。',
        image: '/archaeology/corridor/S4.webp',
        bonus: { stardust: 5 },
      },
    ],
    reward: { relics: ['r_019'], gold: 60000 },
  },

  // ==================== 6. 九转丹炉残址 ====================
  {
    id: 'crucible',
    name: '九转丹炉残址',
    civilization: '两仪者',
    minLeaderLevel: 0,
    dangerRate: 0.35,
    intro:
      '两仪者的九座熔炉残址。九炉串成一圈，炉膛内壁留着被烧过的层层痕迹。他们相信物可以反复提纯九次，来的人想看看第九次之后留下了什么。',
    galleryImage: '/archaeology/crucible/cover.webp',
    haltText:
      '引火室里那只空心的环接受了暗物质之后没有停。热度沿着九条管道一路回灌，把九座炉的内壁重新烧成流动的一层。渣、灰、结晶全部熔回炉膛，圆心的地面塌下去半尺。第九次提纯之后留下的东西，我们终究没有看到。',
    haltImage: '/archaeology/crucible/halt.webp',
    stages: [
      {
        id: 'S1',
        title: '炉膛清灰',
        turns: 2,
        difficulty: 0,
        cost: { researchPoints: 200 },
        text: '九座炉围成一个三百步的圆，炉口全部朝向圆心。我们清掉炉膛里积的灰，灰是分层的，每层颜色都不同，越靠下越亮。灰层的厚度在九座炉之间依次递减，像有人按顺序把同一炉料从第一座挪到了第九座。清到第九座时，膛里几乎没有灰。',
        image: '/archaeology/crucible/S1.webp',
        bonus: { materials: { carbon: 25 } },
      },
      {
        id: 'S2',
        title: '配液倒炉',
        turns: 1,
        difficulty: 2,
        cost: { alloy: 80 },
        text: '炉与炉之间的管道内壁挂着一层灰白色的渣，用合金铲刮下来后，渣在空气中很快变成了粉。每段管道的斜度只有一点点，液体要靠重力一站一站往下走，中途还要经过一个分岔口。分岔口两侧的口径不同，一边窄得只容一线，一边宽得能并排放进两只手。',
        image: '/archaeology/crucible/S2.webp',
        bonus: { researchPoints: 150 },
      },
      {
        id: 'S3',
        title: '暗火重燃',
        turns: 2,
        difficulty: 2,
        cost: { materials: { dark_matter: 10 } },
        text: '圆心的地下是一间引火室，室内悬着一只空心的环，环内没有燃料，也没有灰。我们投入暗物质后，环芯缓慢亮起一层看不见的热，热度传遍九座炉，炉膛里的残渣跟着发出细响。温度升到某个值时，所有炉口同时吐出一线白气。这场火隔了很久，又燃了一次。',
        image: '/archaeology/crucible/S3.webp',
        bonus: { alloy: 40 },
      },
      {
        id: 'S4',
        title: '丹留炉底',
        turns: 1,
        difficulty: 3,
        cost: { stardust: 12 },
        text: '熄火后我们在第九座炉底贴壁取到一层极薄的结晶，结晶呈两层，一层发暗，一层透亮，之间分得极清楚。两仪者说的九转，大概就落在这一层上。谁也不确定它能不能用，但所有人都同意，先把它完整取下来。星尘洒在结晶上时，暗的一层忽然沉了一下。',
        image: '/archaeology/crucible/S4.webp',
        bonus: { stardust: 5 },
      },
    ],
    reward: { permaBonuses: ['perm_cycle'], researchPoints: 800 },
  },

  // ==================== 7. 逆向星图台 ====================
  {
    id: 'orrery',
    name: '逆向星图台',
    civilization: '轨道师',
    minLeaderLevel: 2,
    dangerRate: 0.35,
    intro:
      '轨道师留下的一台倒转的星象仪。星轨朝内翻，天体都绕着台心转，台心却空着。设备须由 Lv2 以上的领袖操作，来的人多是为了那套导航算法。',
    galleryImage: '/archaeology/orrery/cover.webp',
    haltText:
      '我们在量子点上改动的那一簇状态没能锁回去。星轨开始反向自转，硅晶薄片一片片脱开，绕着台心排成新的轨道。齿轮咬到最后一格时，台基整体沉了半米，镜室的门被压死在下面。它转起来了，只是不再朝着任何一颗星。',
    haltImage: '/archaeology/orrery/halt.webp',
    stages: [
      {
        id: 'S1',
        title: '齿轮咬合',
        turns: 1,
        difficulty: 1,
        cost: { gold: 12000 },
        text: '台基是一圈咬合着的齿轮，最大的齿轮直径超过二十米，齿面几乎没有磨损。我们用手推了推最小的一片，整圈齿轮跟着转了半格，头顶的星轨同时挪了一段。齿轮之间没有润滑油，转动时却听不见摩擦声，只有空气被搅动的低响。',
        image: '/archaeology/orrery/S1.webp',
        bonus: { gold: 4500 },
      },
      {
        id: 'S2',
        title: '星图校准',
        turns: 2,
        difficulty: 1,
        cost: { materials: { silicon: 60 } },
        text: '星轨由数万片硅晶薄片缀成，每片对应一颗星。我们把硅晶逐片取下校验，编号到两千余片时发现整批薄片的坐标都偏了同一个角度。不是坏，是旧了，星图记的是很久以前的天空。校准完最后一组角度后，头顶的星轨与真实星空的偏差缩到了几乎测不出。',
        image: '/archaeology/orrery/S2.webp',
        bonus: { researchPoints: 200 },
      },
      {
        id: 'S3',
        title: '镜像迷宫',
        turns: 2,
        difficulty: 2,
        cost: { researchPoints: 400 },
        text: '台心下方有一层镜室，六面都是镜面，任何一束光进去都会分成无数条路。我们点了一支冷光棒放进去，光在镜室里绕了很久才衰减干净。轨道师把导航算法藏在这种地方，读的人必须先能在迷宫里分清哪一条才是原始的光。',
        image: '/archaeology/orrery/S3.webp',
        bonus: { materials: { quantum: 12 } },
      },
      {
        id: 'S4',
        title: '量子星轨',
        turns: 2,
        difficulty: 3,
        cost: { materials: { quantum: 12 } },
        text: '镜室最深处有一小簇纠缠着的量子点，彼此之间的距离与头顶星轨的排布完全一致。我们改动其中一个点的状态，对应位置的硅晶薄片立刻跟着亮了。这张星图不是在记录天体，天体在跟着它动。有人低声说，这不是星图台，是把天写下来的一支笔。',
        image: '/archaeology/orrery/S4.webp',
        bonus: { stardust: 6 },
      },
      {
        id: 'S5',
        title: '星尘对表',
        turns: 2,
        difficulty: 3,
        cost: { stardust: 15 },
        text: '收尾时我们用星尘在台面铺了一层薄薄的对照层，让星轨在上面投一次影。投影落定后，整圈星轨与星尘的分布对得几乎没有缝隙，只有台心那一点是空的。轨道师把台心留了出来，一直留到现在。我们把最后的数据抄完，关上齿轮，星轨慢慢停在原来的位置上。',
        image: '/archaeology/orrery/S5.webp',
        bonus: { researchPoints: 200 },
      },
    ],
    reward: { permaBonuses: ['perm_starcal'], researchPoints: 1200 },
  },

  // ==================== 8. 七层碑林 ====================
  {
    id: 'steles',
    name: '七层碑林',
    civilization: '倏忽人',
    minLeaderLevel: 0,
    dangerRate: 0.35,
    intro:
      '倏忽人留下的七层碑林。七层台阶层层向里收，每层立满石碑，碑上的字被风磨得很浅。来的人想抄一两块碑走，抄到第五层就会明白抄不完。',
    galleryImage: '/archaeology/steles/cover.webp',
    haltText:
      '第五层的合金匣在撬开时释放了匣内的气压，压力推动第六层与第七层的石碑向内倾倒。碑没有碎，只是一层层叠着躺下，把第七层那块空白的碑压在最下面。碑文都还在，抄，是抄不到了。',
    haltImage: '/archaeology/steles/halt.webp',
    stages: [
      {
        id: 'S1',
        title: '碑林外层',
        turns: 1,
        difficulty: 0,
        cost: { gold: 10000 },
        text: '第一层石碑排成一个近乎闭合的圆，碑与碑之间只留一人侧身的缝。碑面上刻的字极浅，靠侧光才看得见笔画。我们沿着圆走了一圈，数出三百二十七块碑，每块的碑首都刻着同一个符号。符号的意思没人认得，但它出现在每一块碑上。',
        image: '/archaeology/steles/S1.webp',
        choice: {
          prompt: '第一层碑面怎么处理？',
          options: [
            {
              label: '逐块拓印',
              description: '不碰碑体，抄录速度慢，字迹只取得到浅层。',
              kind: 'safe',
            },
            {
              label: '刮去积垢',
              description: '当场刮净碑面，字口立刻清晰，风化的表层会一并失去。',
              kind: 'risky',
            },
          ],
        },
        bonus: { researchPoints: 120 },
      },
      {
        id: 'S2',
        title: '铭文拼接',
        turns: 1,
        difficulty: 2,
        cost: { materials: { carbon: 60 } },
        text: '第二层的碑比第一层矮，碑文不再是单句，而是一段一段被拆开的残句。我们把残句逐条抄下来铺在地上，按笔画的起收位置重新拼接，拼到第三十组时，所有残句连成了一段完整的话。整层碑林原来共用同一篇文章，一块碑只是其中的几个字。',
        image: '/archaeology/steles/S2.webp',
        choice: {
          prompt: '第二层残句怎么拼？',
          options: [
            {
              label: '按次序拼',
              description: '照碑林原有方位排列，结果稳妥，可能有几处接不上。',
              kind: 'safe',
            },
            {
              label: '按笔画拼',
              description: '打乱方位全按笔锋接续，能拼出更长的段落，方向会全乱。',
              kind: 'risky',
            },
          ],
        },
        bonus: { materials: { silicon: 20 } },
      },
      {
        id: 'S3',
        title: '层间刻痕',
        turns: 2,
        difficulty: 2,
        cost: { researchPoints: 500 },
        text: '层与层之间的台阶侧面也刻着字，字号比碑上的更小，只有贴着石头才看得清。写的是一段关于读碑的规矩，读第几层要带什么心态，读错了要退回上一层重读。我们把台阶上的字全部录入后，才明白七层不是七层石头，是七遍同一篇文章。',
        image: '/archaeology/steles/S3.webp',
        choice: {
          prompt: '层间刻痕怎么读？',
          options: [
            {
              label: '按层读',
              description: '一层读完再上一层，规矩清楚，中间可能被风化断掉。',
              kind: 'safe',
            },
            {
              label: '对照读',
              description: '七层同时展开比对，能看出文章的改动，读法与碑林原意相违。',
              kind: 'risky',
            },
          ],
        },
        bonus: { gold: 5000 },
      },
      {
        id: 'S4',
        title: '合金封匣',
        turns: 2,
        difficulty: 3,
        cost: { alloy: 100 },
        text: '第五层的碑不再立在台面上，而是一块块封进合金匣里，匣盖与碑面之间只留一线。用合金起子逐只撬开时，匣里的空气涌出来，带着一股很淡的旧纸味。匣内碑面保存得比外面好得多，字口的棱角还在，笔画边缘能看到刻刀留下的浅坡。',
        image: '/archaeology/steles/S4.webp',
        choice: {
          prompt: '封匣怎么开？',
          options: [
            {
              label: '逐只撬',
              description: '一只一只慢慢起盖，进度慢，匣体与碑面都不受损。',
              kind: 'safe',
            },
            {
              label: '整排起',
              description: '一排同时受力，一次开完，匣盖应力集中容易连带碑面。',
              kind: 'risky',
            },
          ],
        },
        bonus: { alloy: 45 },
      },
      {
        id: 'S5',
        title: '读法留白',
        turns: 1,
        difficulty: 3,
        cost: { stardust: 18 },
        text: '第七层只有一块碑，碑面干干净净，一个字也没有。我们围着它站了很久，最后把前六层抄录的内容在碑前读了一遍。读到最后一句时，空碑上落了一层极薄的星尘，正对着我们刚才念字的方位。倏忽人留了七层，最后一层是留给读的人自己填的。',
        image: '/archaeology/steles/S5.webp',
        choice: {
          prompt: '第七层空碑怎么处置？',
          options: [
            {
              label: '留空不动',
              description: '保持七层原貌，抄录到此为止，谁也不添字。',
              kind: 'safe',
            },
            {
              label: '刻下抄录',
              description: '把前六层的抄录补刻上去，碑林自此有第八种读法，原貌不再。',
              kind: 'risky',
            },
          ],
        },
        bonus: { researchPoints: 180 },
      },
    ],
    reward: { relics: ['r_020'], stardust: 20 },
  },

  // ==================== 9. 掌灯者灯塔基座 ====================
  {
    id: 'lighthouse',
    name: '掌灯者灯塔基座',
    civilization: '掌灯者',
    minLeaderLevel: 0,
    dangerRate: 0.35,
    intro:
      '掌灯者的行星光信号站。基座上原本立着几公里高的水晶透镜塔，塔身早已不在，地心的光却还在往外走。来的人先看见那束光，再顺着它找到这里。',
    galleryImage: '/archaeology/lighthouse/cover.webp',
    haltText:
      '补给环收下星尘之后，基座的七个基准面同时亮了一次，随后整块水晶自内向外冻住。光轴锁死在一个不再变化的方位上，光脉冲被拉成一条平直的线。它还在亮，只是不再回应任何校正。掌灯者把灯交出去了，也把钥匙一起收了回去。',
    haltImage: '/archaeology/lighthouse/halt.webp',
    stages: [
      {
        id: 'S1',
        title: '基座勘验',
        turns: 1,
        difficulty: 1,
        cost: { alloy: 50 },
        text: '基座是七层叠起来的整块水晶，层与层之间找不到胶，也找不到缝。用合金支架固定测点后我们发现，基座的方位至今没变，七个面的朝向与当初刻下的记录分毫不差。塔虽然倒了，底座还保持着发射时的姿势。',
        image: '/archaeology/lighthouse/S1.webp',
        bonus: { researchPoints: 150 },
      },
      {
        id: 'S2',
        title: '透镜复位',
        turns: 2,
        difficulty: 2,
        cost: { materials: { silicon: 80 } },
        text: '我们在基座四周的碎石堆里捡回大批透镜碎片，按曲率一片片比对，能拼回原先的三成。拼好的镜片架上基座后，光线开始重新收拢成束，边缘的杂散光晕一圈圈收细。远处看，那束光比我们刚落地时亮了一点。',
        image: '/archaeology/lighthouse/S2.webp',
        bonus: { materials: { quantum: 12 } },
      },
      {
        id: 'S3',
        title: '光轴校正',
        turns: 2,
        difficulty: 2,
        cost: { gold: 30000 },
        text: '地心深处的光源核心仍在缓慢燃烧，只是它的心跳被塔身倒塌时留下的偏差带歪了。我们用基座的七个基准面重建光轴，把偏差一点点拧回原值。校正完成的瞬间，光柱从基座直上，笔直穿过整片天空。值守的人抬头看了很久，才想起要记录。',
        image: '/archaeology/lighthouse/S3.webp',
        bonus: { gold: 8000 },
      },
      {
        id: 'S4',
        title: '心跳取样',
        turns: 2,
        difficulty: 3,
        cost: { materials: { quantum: 15 } },
        text: '光脉冲里藏着一层极低的周期性起伏，周期大约一分钟，波形并不匀齐，更像心跳。我们用干扰仪把每一层反馈逐级剥离，剥离到最下面时，露出一串极短的数字，从二开始，一个接一个都是素数。掌灯者把这串数字放进了光里，让每个收到光的人都读一遍。',
        image: '/archaeology/lighthouse/S4.webp',
        bonus: { researchPoints: 200 },
      },
      {
        id: 'S5',
        title: '添灯续焰',
        turns: 2,
        difficulty: 3,
        cost: { stardust: 20 },
        text: '我们把收集到的星尘送入星核外的补给环，让光源重新获得一点补偿。补给完成后，脉动比原先稳了一档，塔身的碎影在光里显得很清楚。掌灯者在基座内壁刻着一段极短的话，大意是灯不用人加燃料，但每隔很久要有人来看一眼。我们看了这一眼，然后记下了时间。',
        image: '/archaeology/lighthouse/S5.webp',
        bonus: { stardust: 6 },
      },
    ],
    reward: { permaBonuses: ['perm_eternal_light'], stardust: 25 },
  },

  // ==================== 10. 空白神像厅 ====================
  {
    id: 'idols',
    name: '空白神像厅',
    civilization: '华胥',
    minLeaderLevel: 3,
    dangerRate: 0.35,
    intro:
      '华胥留下的神像厅。厅里的石像全都立着，却没有一张脸，也没有一处刻名。造像的人把名字留给了来读的人，只有对遗迹足够熟的人才接得住这段对话。',
    galleryImage: '/archaeology/idols/cover.webp',
    haltText:
      '空台那层薄膜在晶体被取出的一瞬失去了支撑，整厅二百余尊石像同时转向空台。转向之后，七列朝向与殿内排布全部错开，原有的读法再也对不上任何一尊。信我们读完了，厅随后自己合上了门。',
    haltImage: '/archaeology/idols/halt.webp',
    stages: [
      {
        id: 'S1',
        title: '厅门落锁',
        turns: 2,
        difficulty: 2,
        cost: { gold: 25000 },
        text: '厅门是两扇整石，没有门轴，靠自重合着，推的时候必须两扇同时给力，否则纹丝不动。我们花了半天才把门推开一条缝，缝里没有风，也没有尘。门内侧刻着一行极浅的字，说的是进门之后不要急着认人。',
        image: '/archaeology/idols/S1.webp',
        bonus: { researchPoints: 150 },
      },
      {
        id: 'S2',
        title: '无面排布',
        turns: 2,
        difficulty: 3,
        cost: { alloy: 120 },
        text: '厅内立着二百余尊石像，排成七列，每列朝向略有不同，全部面向厅心的空台。石像的面部被打磨得极平，一点五官的痕迹也没有，颈部与肩部的比例却各不相同。我们用合金支架逐尊测高，量到最后一列才发现，七列的顺序按身高排成了一句话的长度。',
        image: '/archaeology/idols/S2.webp',
        bonus: { materials: { dark_matter: 15 } },
      },
      {
        id: 'S3',
        title: '掌心刻痕',
        turns: 2,
        difficulty: 3,
        cost: { researchPoints: 800 },
        text: '石像的手都拢在腹前，掌心向上。我们逐尊查看掌心，发现每只掌心都刻着几道极短的线，线数不等，最多的九道，最少的只有一道。把线数与石像的朝向对上之后，线数变成了编号。华胥没在石像上刻名字，他们把名字拆成了线，刻在了手心里。',
        image: '/archaeology/idols/S3.webp',
        bonus: { gold: 7000 },
      },
      {
        id: 'S4',
        title: '空台取信',
        turns: 2,
        difficulty: 3,
        cost: { materials: { dark_matter: 20, quantum: 20 } },
        text: '厅心的空台表面覆着一层看不出材质的薄膜，薄膜下面压着一枚薄薄的晶体，形状像一封没有封口的信。我们用暗物质与量子场配合着把薄膜一处处松开，晶体才完整地取出来。取出的那一刻，二百余尊石像同时偏了一度，全都转向了我们。',
        image: '/archaeology/idols/S4.webp',
        bonus: { researchPoints: 200 },
      },
      {
        id: 'S5',
        title: '读信留名',
        turns: 3,
        difficulty: 3,
        cost: { stardust: 30 },
        text: '晶体里的内容不是文字，是一段极长的等待记录，从第一尊石像立起来那天开始记，记到石像全部完工，然后是一段长久的空白。空白后面只有一句：能读到这封信的人，请告诉我我的名字。星尘落在晶体上时，石像群里响起一声极轻的低鸣，像有人在很久之后终于被叫到。',
        image: '/archaeology/idols/S5.webp',
        bonus: { stardust: 6 },
      },
    ],
    reward: { relics: ['r_021'], title: '读信人', stardust: 40 },
  },
];

/** 遗迹 id → 定义 */
export const ARCHAEOLOGY_SITE_MAP: Record<string, ArchaeologySite> = Object.fromEntries(
  ARCHAEOLOGY_SITES.map((s) => [s.id, s])
);

export function getArchaeologySite(id: string | undefined): ArchaeologySite | undefined {
  return id ? ARCHAEOLOGY_SITE_MAP[id] : undefined;
}

export const ARCHAEOLOGY_SITE_COUNT = ARCHAEOLOGY_SITES.length;
