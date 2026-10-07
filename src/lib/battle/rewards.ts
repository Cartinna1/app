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

// ---------------- 文案（**唯一文案产出口**） ----------------
// ⚠ AGENTS 第九节「单一真值」：奖励文案一律在本文件拼（`rollRaidReward().text`），
//   **消费它的是事件记录**（`eventLog` 的 detail）—— 组件不许自己算奖励、也不许自己拼数量/势力名。
//   四类各自写明"类型 + 数量"：`缴获 20000 金币` / `缴获 10 星尘` / `缴获 <原料名> ×40` / `与「<势力名>」的声望 +5`。

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

// ---------------- 掠夺损失的**文案**（用户 2026-08：显示出口 = **事件记录**） ----------------
// 用户最终口径（原话）：「是不是就相当于事件记录了，那干脆不要再战斗页签加东西了，直接放事件记录好了哇，
// 打赢也一样。」→ **战斗页签 / 战斗结算画面都不再放结算行**，唯一的显示出口是**事件记录**（事件面板底部）。
// 于是这里只剩「把实扣明细拼成中文」这一件事——**唯一文案产出口**，事件日志的 detail 直接用它。
//
// ⚠ 为什么不再需要"结算快照"（`lastRaidSettlement` 已整个删掉）：
//   事件记录本身**就是**那条持久化的结算展示（`GameState.eventLog`，上限 100 条、事件面板展示最近 30 条），
//   它由 reducer 在结算的同一次调用里写入、内容与实扣值同源，所以另存一份快照纯属重复。

/** 失败时**实际扣掉**的那几项（逐项列清，扣 0 的项不列）。
 *  ⚠ 形状故意比 `raidLootLoss` 窄：那里面还有 `food` / `alloy`（恒 0，§10.2 只扣金币+原料+星尘），
 *   展示层的形状由本类型说了算（`raidLootItems` 会逐字段取，不让上游形状漏进来）。 */
export interface RaidLootDetail {
  gold: number;
  stardust: number;
  /** 原料 id → 实扣数量（只列实扣 > 0 的） */
  materials: Record<string, number>;
}

/** 掠夺失败（被抢）在**事件记录**里的 `event` 名（唯一写死处）。
 *  `detail` 由 `raidLootText` 拼（逐项列实际扣到的资源与数量、扣 0 的项不列）。
 *  ⚠ 文案口径：`event` 是"发生了什么"，`detail` 是"具体扣了什么"——两者不许互相重复前缀。 */
export const RAID_LOOT_EVENT = '殖民地被掠夺';

/**
 * **实扣明细 → 逐项显示串**（唯一产出口：**事件记录**的 detail 由它拼出来）。
 * 顺序固定 = 金币 → 星尘 → 原料（**扣 0 的项不列**）；原料译名走 `getMaterialName`。
 * `sign` 只决定数字前写不写负号：事件记录用 `''`（「金币 20000」，与既有日志口径一致）；
 * 默认 `'-'` 是用户给的逐字例那套写法（「金币 -20000」）。
 * 返回空数组 = 什么都没扣到（调用方给一句"没抢走任何东西"，不许渲染成半句）。
 */
export function raidLootItems(detail: RaidLootDetail, sign: '' | '-' = '-'): string[] {
  const out: string[] = [];
  if ((detail.gold || 0) > 0) out.push(`金币 ${sign}${detail.gold}`);
  if ((detail.stardust || 0) > 0) out.push(`星尘 ${sign}${detail.stardust}`);
  for (const [id, amount] of Object.entries(detail.materials || {})) {
    if (amount > 0) out.push(`${getMaterialName(id)} ${sign}${amount}`);
  }
  return out;
}
