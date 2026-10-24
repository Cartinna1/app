// ==================== 银河雇佣兵协会 · 悬赏定义表（静态数据，唯一来源） ====================
// 出处：`docs/03-雇佣兵协会.md` §3（清剿 5 条 / 截击 5 条 / 头目 4 条 = 14 条）。
// ⚠ 本文件**只放数据**：查询口在 `lib/turn/bounties.ts`（`getBountyDef` / `allBountyDefs`），
//   批次生成、冷却、期限、文案也都在那里。组件与 hook 不许直接 import 本文件。
// ⚠ 悬赏**不含声望字段**（完成不加、失败与超时不扣），也**不含任何星图字段**
//   （接单后在协会页签当场开战，不跃迁、不计耗时）。
// ⚠ 数值口径（报酬 / 期限 / 难度）以文档 §3 为准，改动前先出前后对比表（AGENTS 第七节）。

import type { BountyDef } from '@/types/game';

// ---------------- 三档报酬锚点（文档 §0.2 / §3 的明文数字，集中一处便于核对）----------------

/** 清剿海盗：10,000 金 + 5 星尘，无材料、无门槛 */
export const PIRATE_BOUNTY_REWARD = { gold: 10000, stardust: 5 } as const;
/** 截击掠夺队：18,000 金 + 8 星尘 + 随机 30 份普通原料 */
export const RAID_BOUNTY_REWARD = { gold: 18000, stardust: 8 } as const;
/** 截击档随机材料数量（文档 §3.2「随机 30 份普通原料」） */
export const RAID_BOUNTY_MATERIAL_AMOUNT = 30;
/** 悬赏头目：60,000 金 + 25 星尘 + 独特材料，卡库门槛 20 艘 */
export const ELITE_BOUNTY_REWARD = { gold: 60000, stardust: 25 } as const;
/** 头目档的接取门槛（文档 §3.3「卡库 ≥ 20 艘」） */
export const ELITE_BOUNTY_REQUIRED_SHIPS = 20;
/** 头目档的"独特材料"：文档只写"独特材料"没给 id，本步暂用最稀有的暗物质 ×2 顶上，
 *  等独特材料系统落地再换成它（见报告「我补的文档空缺」）。 */
export const ELITE_BOUNTY_MATERIAL_AMOUNT = 2;

/** 全部悬赏定义（14 条；顺序 = 展示顺序，也是批次抽取的候选顺序） */
export const BOUNTY_DEFS: readonly BountyDef[] = [
  // ==================== 3.1 清剿海盗（kind: 'pirate'，敌方 = m05 海盗杂兵头目）====================
  {
    id: 'bty_p1',
    kind: 'pirate',
    title: '锈钩的旧账',
    desc: '协会的账房里有一笔二十年前的旧账，债主早就死在深空，欠债的还在。这批人就在会所后巷停船，去把他们清干净。',
    difficulty: 1,
    enemyId: 'm05',
    deadlineTurns: 14,
    rewardGold: PIRATE_BOUNTY_REWARD.gold,
    rewardStardust: PIRATE_BOUNTY_REWARD.stardust,
    rewardMaterial: null,
  },
  {
    id: 'bty_p2',
    kind: 'pirate',
    title: '会所门口的钉子',
    desc: '有人在协会的泊位上钉了一颗钉子，钉了半年，收过路钱。协会不收税，协会只拔钉子。',
    difficulty: 1,
    enemyId: 'm05',
    deadlineTurns: 15,
    rewardGold: PIRATE_BOUNTY_REWARD.gold,
    rewardStardust: PIRATE_BOUNTY_REWARD.stardust,
    rewardMaterial: null,
  },
  {
    id: 'bty_p3',
    kind: 'pirate',
    title: '三条航道的过路税',
    desc: '一群杂兵把三条航道的信标改成了自己的收费站。别砸信标，信标是协会的。',
    difficulty: 2,
    enemyId: 'm05',
    deadlineTurns: 13,
    rewardGold: PIRATE_BOUNTY_REWARD.gold,
    rewardStardust: PIRATE_BOUNTY_REWARD.stardust,
    rewardMaterial: null,
  },
  {
    id: 'bty_p4',
    kind: 'pirate',
    title: '被剪断的信标',
    desc: '一整段航道的导航信标被人剪断了，断口整齐，是懂行的人干的。把干这件事的那伙人找出来。',
    difficulty: 2,
    enemyId: 'm05',
    deadlineTurns: 12,
    rewardGold: PIRATE_BOUNTY_REWARD.gold,
    rewardStardust: PIRATE_BOUNTY_REWARD.stardust,
    rewardMaterial: null,
  },
  {
    id: 'bty_p5',
    kind: 'pirate',
    title: '黑市账本上的第九个名字',
    desc: '协会拿到了一页账本，前八个名字都已经被划掉，第九个还空着。这一趟不用带证人回来，只需要带一句确认。',
    difficulty: 2,
    enemyId: 'm05',
    deadlineTurns: 11,
    rewardGold: PIRATE_BOUNTY_REWARD.gold,
    rewardStardust: PIRATE_BOUNTY_REWARD.stardust,
    rewardMaterial: null,
  },

  // ==================== 3.2 截击掠夺队（kind: 'raid'，敌方 = raid 掠夺队）====================
  {
    id: 'bty_r1',
    kind: 'raid',
    title: '抢先一步',
    desc: '一支掠夺队刚洗完协会名下的一处仓库，正在会所外的空域整备。它们以为自己已经安全了，这大概是这一趟最省力的地方。',
    difficulty: 2,
    enemyId: 'raid',
    deadlineTurns: 14,
    rewardGold: RAID_BOUNTY_REWARD.gold,
    rewardStardust: RAID_BOUNTY_REWARD.stardust,
    rewardMaterial: { mode: 'random', amount: RAID_BOUNTY_MATERIAL_AMOUNT },
  },
  {
    id: 'bty_r2',
    kind: 'raid',
    title: '满载的船跑不快',
    desc: '它们装得太满，转身都慢。协会算过它们的油量与货重，你只需要在它们散开之前上去。',
    difficulty: 3,
    enemyId: 'raid',
    deadlineTurns: 12,
    rewardGold: RAID_BOUNTY_REWARD.gold,
    rewardStardust: RAID_BOUNTY_REWARD.stardust,
    rewardMaterial: { mode: 'random', amount: RAID_BOUNTY_MATERIAL_AMOUNT },
  },
  {
    id: 'bty_r3',
    kind: 'raid',
    title: '十吨合金的下落',
    desc: '那批合金本来是给殖民地打地基用的。协会不缺这点钱，缺的是把东西拿回来这个说法。',
    difficulty: 3,
    enemyId: 'raid',
    deadlineTurns: 13,
    rewardGold: RAID_BOUNTY_REWARD.gold,
    rewardStardust: RAID_BOUNTY_REWARD.stardust,
    rewardMaterial: { mode: 'random', amount: RAID_BOUNTY_MATERIAL_AMOUNT },
  },
  {
    id: 'bty_r4',
    kind: 'raid',
    title: '谁在给他们通风',
    desc: '三次围剿都扑了空，协会里有人在外面递消息。先别查人，先把那支掠夺队留下来。',
    difficulty: 3,
    enemyId: 'raid',
    deadlineTurns: 10,
    rewardGold: RAID_BOUNTY_REWARD.gold,
    rewardStardust: RAID_BOUNTY_REWARD.stardust,
    rewardMaterial: { mode: 'random', amount: RAID_BOUNTY_MATERIAL_AMOUNT },
  },
  {
    id: 'bty_r5',
    kind: 'raid',
    title: '最后一艘没跟上的船',
    desc: '掠夺队撤走时少了一艘，那艘船掉队了，还在协会外的空域慢慢往回蹭。追上它。',
    difficulty: 3,
    enemyId: 'raid',
    deadlineTurns: 11,
    rewardGold: RAID_BOUNTY_REWARD.gold,
    rewardStardust: RAID_BOUNTY_REWARD.stardust,
    rewardMaterial: { mode: 'random', amount: RAID_BOUNTY_MATERIAL_AMOUNT },
  },

  // ==================== 3.3 悬赏头目（kind: 'elite'，敌方 = m01~m04，可重复刷）====================
  // ⚠ 这 4 条是**模板**：头目打赢后进 10 回合冷却（`bounties.bossCooldown`），冷却期内不进候选池。
  // ⚠ `m01`~`m04` 的敌人定义（hp / 技能 / 编成池）在阶段 2/3 加入，见 `data/mercenary/bosses.ts` 头注释。
  {
    id: 'bty_e1',
    kind: 'elite',
    title: '巢要挪窝了',
    desc: '噬星虫群啃空了三座无人矿站，正在往有人的地方挪。协会不问它们从哪来，只要求它们停在原地。',
    difficulty: 4,
    enemyId: 'm01',
    deadlineTurns: 8,
    rewardGold: ELITE_BOUNTY_REWARD.gold,
    rewardStardust: ELITE_BOUNTY_REWARD.stardust,
    rewardMaterial: { mode: 'fixed', materialId: 'dark_matter', amount: ELITE_BOUNTY_MATERIAL_AMOUNT },
    requireCardCount: ELITE_BOUNTY_REQUIRED_SHIPS,
  },
  {
    id: 'bty_e2',
    kind: 'elite',
    title: '最后一台还在响',
    desc: '残响智械的残部已经没有人下指令，仍在按几十年前的旧任务清单做事。把最后一台会响的关掉。',
    difficulty: 4,
    enemyId: 'm02',
    deadlineTurns: 8,
    rewardGold: ELITE_BOUNTY_REWARD.gold,
    rewardStardust: ELITE_BOUNTY_REWARD.stardust,
    rewardMaterial: { mode: 'fixed', materialId: 'dark_matter', amount: ELITE_BOUNTY_MATERIAL_AMOUNT },
    requireCardCount: ELITE_BOUNTY_REQUIRED_SHIPS,
  },
  {
    id: 'bty_e3',
    kind: 'elite',
    title: '潮里有人在数名字',
    desc: '忆潮灵能者相信只要还有人记得，死去的东西就不算死。他们记的东西太多了，协会想请他们少记一点。',
    difficulty: 4,
    enemyId: 'm03',
    deadlineTurns: 9,
    rewardGold: ELITE_BOUNTY_REWARD.gold,
    rewardStardust: ELITE_BOUNTY_REWARD.stardust,
    rewardMaterial: { mode: 'fixed', materialId: 'dark_matter', amount: ELITE_BOUNTY_MATERIAL_AMOUNT },
    requireCardCount: ELITE_BOUNTY_REQUIRED_SHIPS,
  },
  {
    id: 'bty_e4',
    kind: 'elite',
    title: '旧律还在执法',
    desc: '旧律军团手里那份法典的签发机构已经不存在了，他们还在依法执行。协会的通缉令上只写一句：让他们停下。',
    difficulty: 4,
    enemyId: 'm04',
    deadlineTurns: 10,
    rewardGold: ELITE_BOUNTY_REWARD.gold,
    rewardStardust: ELITE_BOUNTY_REWARD.stardust,
    rewardMaterial: { mode: 'fixed', materialId: 'dark_matter', amount: ELITE_BOUNTY_MATERIAL_AMOUNT },
    requireCardCount: ELITE_BOUNTY_REQUIRED_SHIPS,
  },
];
