// ==================== 战斗战利品（V1.5 §〇 战利品 / §10.2 掠夺） ====================
// 主游戏侧「打赢之后给什么」的唯一真值。规则出处：
//   · 出征打老巢（b1~b5）赢 → **固定 100000 金币 + 40 星尘**（§〇 / §10.2）→ battleRewards / grantBattleRewards
//   · 掠夺战（bossId === 'raid'）赢 → **随机获得星尘 / 原料 / 金币 / 某势力声望**（§10.2）
//     → rollRaidReward / grantRaidReward（**本文件下半部分**；battleRewards 对它恒返回 0/0，语义不变）
//   · 打输 → 不给任何奖励（永久损失由 gameReducer 的 END_BATTLE 按 P3 规则写回，不在本文件）
// ⚠ 本文件只做纯计算：不 mutate 传入对象，不读随机数（随机数由调用方传进来），不 dispatch。
// ⚠ 金币收益**必须**过 lib/turn/shipTurn.ts 的 famineHalveGold（AGENTS-附录.md 10.2：新增金币收益都要问饥荒减半），
//   并按 AGENTS 第三节写 pushGoldLog（**调用前必须先改完金币**）。

import type { Mothership } from '@/types/game';
import type { BattleState } from '@/types/battle';
import { famineHalveGold } from '@/lib/turn/shipTurn';
import { pushGoldLog } from '@/lib/turn/goldLog';
import { ALL_MATERIAL_IDS, getMaterialName } from '@/data/materialNames';
import { FACTIONS } from '@/data/factions';
import { getKnownFactionIds } from '@/lib/galaxy/knowledge';

/** 老巢战利品（§〇 / §10.2）：固定 100000 金币 + 40 星尘 */
export const LAIR_REWARD_GOLD = 100000;
export const LAIR_REWARD_STARDUST = 40;

/**
 * 本场战斗的**基础**战利品（未过饥荒减半）。
 * 掠夺队与打输的战斗一律 0/0 —— 这是 P5 起就定下的语义，**不要改**（验收脚本按它断言）。
 * 掠夺战的随机奖励走本文件下半部分的 rollRaidReward / grantRaidReward（§10.2）。
 */
export function battleRewards(battle: BattleState): { gold: number; stardust: number } {
  // 掠夺战（bossId === 'raid'）的奖励**不在这里**：§10.2 是"随机获得四类之一"，形状与本函数的
  // {gold, stardust} 不同（还可能是原料 / 声望），故另开一组函数，见下方「掠夺战利品」段。
  if (battle.bossId === 'raid' || battle.winner !== 'player') return { gold: 0, stardust: 0 };
  return { gold: LAIR_REWARD_GOLD, stardust: LAIR_REWARD_STARDUST };
}

/**
 * 本场战斗**实收**的金币（= 基础战利品过 famineHalveGold）——UI 展示与结算同源，勿在别处再算一遍。
 * `food` 取打这场仗时母舰的食物（食 < 0 即饥荒，金币减半）。
 */
export function expectedBattleGold(food: number, battle: BattleState): number {
  return famineHalveGold(food, battleRewards(battle).gold);
}

/**
 * 结算并写回战利品：返回**新的 ship**（不改传入的 ship / battle）。
 * 顺序：① 先算实收金币（饥荒减半）→ ② 改金币 → ③ pushGoldLog（读改完后的余额）→ ④ 加星尘。
 * 没有任何收益时原样返回传入的 ship 引用（调用方可据此判断"没变"）。
 */
export function grantBattleRewards(ship: Mothership, battle: BattleState, turn: number): Mothership {
  const { stardust } = battleRewards(battle);
  const gold = expectedBattleGold(ship.food, battle);
  if (gold <= 0 && stardust <= 0) return ship;

  const next: Mothership = { ...ship };
  if (gold > 0) {
    const reason = `出征战利品：${battle.bossId} 老巢`;
    next.gold += gold;                                  // 一、先改金币（pushGoldLog 读的是改完后的余额）
    pushGoldLog(next, turn, gold, reason);              // 二、再记流水（唯一真值 lib/turn/goldLog.ts）
  }
  if (stardust > 0) next.stardust += stardust;           // 三、星尘直接加在母舰上
  return next;
}

// ==================== 掠夺战利品（V1.5 §10.2：打败海盗后随机获得） ====================
// §10.2 原文：「打败海盗后：随机获得星尘 / 原料 / 金币 / 某势力声望；之后 20 回合内不再被掠夺」。
// ⚠ **与 battleRewards 分开**：battleRewards 的语义与签名是 P5 落地并验收过的（掠夺队恒 0/0），
//   本组函数是 P7 新增的掠夺专属奖励，**不改 battleRewards**（它的 TODO 注释保留，指向这里）。
// ⚠ 文档**没有给任何数值**：既没有数量，也没有四类的概率分布 → 下面四个常量是**待裁定的占位**，
//   改动只在本处。取值的参照（不是文档明文）：掠夺队比老巢 BOSS（30~35 血）弱，而老巢固定战利品
//   是 100000 金币 + 40 星尘（§10.2），故金币取 1/5、星尘取 1/4；四类等概率。

/** ⚠ 占位值（文档未给）：掠夺胜利的金币奖励 */
export const RAID_REWARD_GOLD = 20000;
/** ⚠ 占位值（文档未给）：掠夺胜利的星尘奖励 */
export const RAID_REWARD_STARDUST = 10;
/** **用户 2026-08 裁定：40 个随机原料**（覆盖原占位 5；登记在 AGENTS-附录.md 10.3）。
 *  ⚠ 文案里的数量由本常量拼出来，改这里文案自动跟着变（勿在别处写死 40）。 */
export const RAID_REWARD_MATERIAL_AMOUNT = 40;
/** ⚠ 占位值（文档未给）：掠夺胜利的声望奖励（随机一个**已探明**势力） */
export const RAID_REWARD_REPUTATION = 5;

/** 掠夺奖励的类别（§10.2 的四类，等概率取一类） */
export type RaidRewardKind = 'gold' | 'stardust' | 'material' | 'reputation';

// ---------------- 文案（**唯一产出口**：UI 只渲染这里给出的句子） ----------------
// ⚠ AGENTS 第九节「单一真值」：奖励文案一律在本文件拼，**UI 不许自己算奖励**（也不许自己拼数量/势力名）。
//   唯一例外是"这次没有战利品"那一句（无奖励可报），见下方 RAID_NO_LOOT_TEXT。

/** 金币类奖励的文案（也用于"没有已探明势力"时回退到金币的那条路） */
export const RAID_GOLD_TEXT = `击退海盗：缴获 ${RAID_REWARD_GOLD} 金币`;

/** 一字不差地取自原声望文案的势力名格式（势力名仍走 FACTIONS 表，不另抄一份） */
function reputationText(factionName: string): string {
  return `击退海盗：与「${factionName}」的声望 +${RAID_REWARD_REPUTATION}`;
}

/** 一次掠夺奖励的内容（声望不在 Mothership 上，由 reducer 写回 GameState） */
export interface RaidReward {
  kind: RaidRewardKind;
  /** 基础金币（未过饥荒减半；实收见 grantRaidReward） */
  gold: number;
  stardust: number;
  /** 随机到的原料 id（非原料类为 null） */
  materialId: string | null;
  materialAmount: number;
  /** 声望给哪个势力。**恒为已探明势力**（用户 2026-08 裁定）；
   *  非声望类 / **一个势力都没探明**（此时已回退成金币，kind 也不是 reputation）为 null。 */
  factionId: string | null;
  reputation: number;
  /** 事件日志文案（写明拿到了什么）——**唯一产出口**，UI 只渲染它 */
  text: string;
}

/**
 * 声望奖励现在能不能发（迷雾口径）：**至少要有一个已探明势力**。
 * 判据**复用既有唯一真值** `lib/galaxy/knowledge.getKnownFactionIds`
 * （与黑市 / 贸易面板「势力列表」的迷雾同源，AGENTS 第九节），**不许在这里自己过滤领奖名单**。
 */
export function canGrantReputationReward(ship: Mothership): boolean {
  return getKnownFactionIds(ship).size > 0;
}

/**
 * 掷一次掠夺奖励（§10.2）。只吃两个 [0,1) 随机数（调用方取随机数，便于测试）：
 *   · kindRoll：四类等概率取一类（文档只说"随机获得"，没给分布）
 *   · pickRoll：该类内部随机（原料取哪一种 / 声望给哪个势力）
 * 迷雾口径（AGENTS 第九节 ＋ **用户 2026-08 裁定**）：声望**只给已探明的势力** ——
 * 候选 = `getKnownFactionIds(ship)`（唯一真值，与黑市/势力列表同源），**一个都没探明时不发声望**
 * 而是**回退到金币**（绝不发一条空奖励：`kind` 与 `text` 都跟着换成金币那条，reducer 按 kind='gold'
 * 就会真的把金币发出去）。
 */
export function rollRaidReward(ship: Mothership, kindRoll: number, pickRoll: number): RaidReward {
  const base: RaidReward = {
    kind: 'gold',
    gold: 0,
    stardust: 0,
    materialId: null,
    materialAmount: 0,
    factionId: null,
    reputation: 0,
    text: '',
  };
  if (kindRoll < 0.25) {
    return { ...base, kind: 'gold', gold: RAID_REWARD_GOLD, text: RAID_GOLD_TEXT };
  }
  if (kindRoll < 0.5) {
    return { ...base, kind: 'stardust', stardust: RAID_REWARD_STARDUST, text: `击退海盗：缴获 ${RAID_REWARD_STARDUST} 星尘` };
  }
  if (kindRoll < 0.75) {
    const idx = Math.min(ALL_MATERIAL_IDS.length - 1, Math.floor(Math.max(0, pickRoll) * ALL_MATERIAL_IDS.length));
    const materialId = ALL_MATERIAL_IDS[idx];
    return {
      ...base,
      kind: 'material',
      materialId,
      materialAmount: RAID_REWARD_MATERIAL_AMOUNT,
      text: `击退海盗：缴获 ${getMaterialName(materialId)} ×${RAID_REWARD_MATERIAL_AMOUNT}`,
    };
  }
  // 声望：候选**只**来自 getKnownFactionIds（唯一真值）。一个都没有 → **回退金币**，不发空声望。
  const known = [...getKnownFactionIds(ship)];
  if (known.length === 0) {
    return { ...base, kind: 'gold', gold: RAID_REWARD_GOLD, text: RAID_GOLD_TEXT };
  }
  const fid = known[Math.min(known.length - 1, Math.floor(Math.max(0, pickRoll) * known.length))];
  const factionName = FACTIONS.find((f) => f.id === fid)?.name || fid;
  return {
    ...base,
    kind: 'reputation',
    factionId: fid,
    reputation: RAID_REWARD_REPUTATION,
    text: reputationText(factionName),
  };
}

/**
 * 结算并写回掠夺奖励：返回**新的 ship**（不改传入的 ship）。
 * 顺序与 grantBattleRewards 一致：① 先算实收金币（饥荒减半）→ ② 改金币 → ③ pushGoldLog
 * （读改完后的余额）→ ④ 星尘 → ⑤ 原料。没有任何收益时原样返回传入的 ship 引用。
 * ⚠ 声望不是 Mothership 字段（在 GameState 上）→ 由 reducer 按 factionId / reputation 写回
 *   （唯一调用点见 gameReducer 的 END_BATTLE），本函数不管声望。
 */
export function grantRaidReward(ship: Mothership, reward: RaidReward, turn: number): Mothership {
  const gold = famineHalveGold(ship.food, reward.gold);
  const hasMaterial = reward.materialId !== null && reward.materialAmount > 0;
  if (gold <= 0 && reward.stardust <= 0 && !hasMaterial) return ship;

  const next: Mothership = { ...ship };
  if (gold > 0) {
    next.gold += gold;                                    // 一、先改金币（pushGoldLog 读的是改完后的余额）
    pushGoldLog(next, turn, gold, '击退海盗：战利品');      // 二、再记流水（唯一真值 lib/turn/goldLog.ts）
  }
  if (reward.stardust > 0) next.stardust += reward.stardust;
  if (hasMaterial && reward.materialId) {
    const materialId = reward.materialId;
    const held = (ship.materials && ship.materials[materialId]) || 0;
    next.materials = { ...(ship.materials || {}), [materialId]: held + reward.materialAmount };
  }
  return next;
}

// ---------------- 掠夺收尾的**展示模型**（用户 2026-08：奖励 / 损失都要显著显示出来） ----------------
// 用户原话：「把奖励显著地显示出来」＋「失败也要显示丢了啥」。
// 原先打赢掠夺战后奖励**确实发了**，但只落进"资源数字 + 事件日志一行"，玩家几乎不可能注意到；
// 而**失败（被抢）那两条路连一行显示都没有**。
//
// ⚠ **为什么要在状态里留一份快照**（而不是让 UI 收到战斗就自己再算一次）：
//   · 打赢：奖励是在 reducer 的 `END_BATTLE` 里掷的（那里才有 Math.random、才能写回资源与声望），
//     而战斗结算画面在按下「结算并返回」**之前**就已经渲染了 —— 那时奖励还没发。
//     若让 UI 自己掷，同一次胜利会被掷两次（UI 显示的和实际到账的必然分叉）。
//   · 打输 / 被抢：**显示值必须就是实扣值**（AGENTS 第九节："日志写明实际扣了什么"），
//     而重算一遍 `raidLootLoss` 是在"已经扣完之后"读状态 → 两边必然对不上。
//   → 取**做法 (a)**：写回状态的同一次调用里把这份结算存进 `GameState.lastRaidSettlement`，
//     战斗结算界面与战斗页签**读同一份**（AGENTS 第九节：判定与文案进 lib，UI 只渲染）。
//
// 清空时机（唯一写入点 / 清空点都在 hooks/gameReducer.ts，见那里的注释）：
//   · 写入 = `END_BATTLE`（打赢最后一支 → outcome 'win'；防守战打输 → outcome 'lost'）
//     与 `APPLY_RAID_LOOT`（阶段 B 超时未迎战 → outcome 'lost'）；**2 支连打的中途那场不写**；
//   · 清空 = `START_RAID`（下一场**掠夺事件**开打时 —— 用户明说"下一场掠夺开打时清空"）。

/** 失败时**实际扣掉**的那几项（逐项列清，扣 0 的项不进来）。
 *  ⚠ 这是"显示值 = 实扣值"的**唯一载体**：由 `raidLootLoss` 算一次，既交给 `payCost`/`pushGoldLog`
 *  去扣，也原样存进结算快照 —— 显示层**不许再算一遍**（AGENTS 第九节：日志/界面写明实际扣了什么）。 */
export interface RaidLootDetail {
  gold: number;
  stardust: number;
  /** 原料 id → 实扣数量（只列实扣 > 0 的） */
  materials: Record<string, number>;
}

/** 掠夺收尾的结果类型：'win' = 击退海盗拿到战利品；'lost' = 被掠夺成功（资源被抢） */
export type RaidOutcomeKind = 'win' | 'lost';

/** 最近一次掠夺收尾的展示模型（存档字段 `GameState.lastRaidSettlement` 的形状）。
 *  ⚠ **打赢与打输共用这一个形状**（用户 2026-08 口径：两条路写进同一份状态，用 `outcome` 区分）。
 *  ⚠ 字段名用 `outcome`（而不是 `kind`）：`kind` 在奖励语境里已是"奖励类别"（gold/stardust/…），
 *    这里说的是"赢还是输"，两者混用会让断言与 UI 配色都读错东西。 */
export interface RaidSettlement {
  /** 'win'（击退海盗、拿到战利品）| 'lost'（被掠夺成功、资源被抢） */
  outcome: RaidOutcomeKind;
  /** 界面上的**主句**：赢 = `reward.text`（唯一产出口，一个字不改）；
   *  输 = 「殖民地被掠夺：…」（由 `raidSettlementLostText` 从**实扣明细**拼出）。 */
  text: string;
  /** 赢的那句原话（= `rollRaidReward().text`）；输的时候是空串。
   *  ⚠ 保留它的唯一理由：战斗页签那行写「上次掠夺战果：<awardText>」时**必须**用奖励路径的原话。 */
  awardText: string;
  /** 打输时**实扣**明细；赢的时候是空对象（`EMPTY_RAID_LOOT_DETAIL`） */
  loot: RaidLootDetail;
}

/** 空明细（模块级常量：无损失时用同一份，避免到处新造对象） */
export const EMPTY_RAID_LOOT_DETAIL: RaidLootDetail = { gold: 0, stardust: 0, materials: {} };

/** 打赢掠夺战但**没拿到任何东西**时的显示文案（唯一产出口：UI 不许自己拼这一句）。
 *  注：本游戏唯一"赢了也没战利品"的路径 = 母舰不存在（`applyRaidReward` 提前返回），属防御性文案。 */
export const RAID_NO_LOOT_TEXT = '击退海盗：这次没缴获到战利品';

/** 掠夺成功的显示前缀（用户逐字例：「殖民地被掠夺：金币 -20000、硅片 -100、量子簇 -30」） */
export const RAID_LOOT_PREFIX = '殖民地被掠夺：';

/** 明细里**到底扣没扣到东西**（全 0 = 没什么可抢的） */
export function raidLootDetailEmpty(detail: RaidLootDetail): boolean {
  return detail.gold <= 0 && detail.stardust <= 0 && Object.keys(detail.materials || {}).length === 0;
}

/**
 * 把**实扣明细**拼成那句中文（唯一产出口：UI 只渲染，不许自己拼资源名/数量）。
 * 逐项写法与用户例句一致：`金币 -20000` / `星尘 -3` / `硅片 -100`（原料译名走 getMaterialName）。
 * 什么都没扣到时说清楚（不许渲染成"殖民地被掠夺："这样的半句）。
 */
export function raidSettlementLostText(detail: RaidLootDetail): string {
  if (raidLootDetailEmpty(detail)) return '殖民地被掠夺：这次没抢走任何东西（金币与原料都已见底）';
  const parts: string[] = [];
  if (detail.gold > 0) parts.push(`金币 -${detail.gold}`);
  if (detail.stardust > 0) parts.push(`星尘 -${detail.stardust}`);
  for (const [id, amount] of Object.entries(detail.materials || {})) {
    if (amount > 0) parts.push(`${getMaterialName(id)} -${amount}`);
  }
  return `${RAID_LOOT_PREFIX}${parts.join('、')}`;
}

/**
 * 把一次刚结算的掠夺**奖励**收成存档形状（读写都只走这里，勿在 reducer 里另拼对象）。
 * 打赢那条路的行为与文案**一个字都不许变**：`text` 与 `awardText` 都是 `reward.text`（空则兜底）。
 */
export function raidRewardView(reward: RaidReward): RaidSettlement {
  const text = reward.text || RAID_NO_LOOT_TEXT;
  return { outcome: 'win', text, awardText: text, loot: EMPTY_RAID_LOOT_DETAIL };
}

/**
 * 把一次掠夺**失败**（防守战打输 / 阶段 B 超时未迎战）收成同一份形状。
 * `detail` 必须是**实扣明细**（`raidLootLoss` 算出来的那一份，与扣减/流水同源）。
 * ⚠ 这里**逐字段取**（而不是直接把传入对象塞进 `loot`）：`raidLootLoss` 的完整形状还带
 * `food` / `alloy`（恒 0，§10.2 只扣金币+原料+星尘），直接塞进去会让快照多出两个永远为 0 的字段、
 * 并让"快照到底存了什么"依赖上游形状。取三个字段 = 展示层的形状由本文件说了算。
 */
export function raidLootView(detail: RaidLootDetail): RaidSettlement {
  const loot: RaidLootDetail = {
    gold: detail.gold || 0,
    stardust: detail.stardust || 0,
    materials: detail.materials || {},
  };
  return { outcome: 'lost', text: raidSettlementLostText(loot), awardText: '', loot };
}
