// ==================== 战斗战利品（V1.5 §〇 战利品 / §10.2 掠夺） ====================
// 主游戏侧「打赢之后给什么」的唯一真值。规则出处：
//   · 出征打老巢（b1~b5）赢 → **固定 100000 金币 + 40 星尘**（§〇 / §10.2）→ battleRewards / grantBattleRewards
//   · 掠夺战（bossId === 'raid'）赢 → **随机获得星尘 / 原料 / 金币 / 某势力声望**（§10.2）
//     → rollRaidReward / grantRaidReward（**本文件下半部分**；battleRewards 对它恒返回 0/0，语义不变）
//   · 打输 → 不给任何奖励（永久损失由 gameReducer 的 END_BATTLE 按 P3 规则写回，不在本文件）
// ⚠ 本文件只做纯计算：不 mutate 传入对象，不读随机数（随机数由调用方传进来），不 dispatch。
// ⚠ 金币收益**必须**过 lib/turn/shipTurn.ts 的 famineHalveGold（AGENTS 第十节：新增金币收益都要问饥荒减半），
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
/** ⚠ 占位值（文档未给）：掠夺胜利的原料奖励数量（随机一种原料） */
export const RAID_REWARD_MATERIAL_AMOUNT = 5;
/** ⚠ 占位值（文档未给）：掠夺胜利的声望奖励（随机一个已探明势力） */
export const RAID_REWARD_REPUTATION = 5;

/** 掠夺奖励的类别（§10.2 的四类，等概率取一类） */
export type RaidRewardKind = 'gold' | 'stardust' | 'material' | 'reputation';

/** 一次掠夺奖励的内容（声望不在 Mothership 上，由 reducer 写回 GameState） */
export interface RaidReward {
  kind: RaidRewardKind;
  /** 基础金币（未过饥荒减半；实收见 grantRaidReward） */
  gold: number;
  stardust: number;
  /** 随机到的原料 id（非原料类为 null） */
  materialId: string | null;
  materialAmount: number;
  /** 声望给哪个势力（非声望类 / 一个势力都没探明时为 null，后者文案里也不露名，见迷雾口径） */
  factionId: string | null;
  reputation: number;
  /** 事件日志文案（写明拿到了什么） */
  text: string;
}

/**
 * 掷一次掠夺奖励（§10.2）。只吃两个 [0,1) 随机数（调用方取随机数，便于测试）：
 *   · kindRoll：四类等概率取一类（文档只说"随机获得"，没给分布）
 *   · pickRoll：该类内部随机（原料取哪一种 / 声望给哪个势力）
 * 迷雾口径（AGENTS 第九节）：声望只从**已探明**势力里取；一个都没探明时不给名字（"某个势力"）。
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
    return { ...base, kind: 'gold', gold: RAID_REWARD_GOLD, text: `击退海盗：缴获 ${RAID_REWARD_GOLD} 金币` };
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
  const known = [...getKnownFactionIds(ship)];
  if (known.length === 0) {
    return { ...base, kind: 'reputation', reputation: RAID_REWARD_REPUTATION, text: `击退海盗：某个势力的声望 +${RAID_REWARD_REPUTATION}` };
  }
  const fid = known[Math.min(known.length - 1, Math.floor(Math.max(0, pickRoll) * known.length))];
  const factionName = FACTIONS.find((f) => f.id === fid)?.name || fid;
  return {
    ...base,
    kind: 'reputation',
    factionId: fid,
    reputation: RAID_REWARD_REPUTATION,
    text: `击退海盗：与「${factionName}」的声望 +${RAID_REWARD_REPUTATION}`,
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
