// ==================== 海盗敌人（5 个老巢 BOSS + 掠夺队） ====================
// 本文件由 scripts/export-battle-data.cjs 从 carddemo/engine.js 生成 —— **请勿手改**。
// 改卡牌数据请改 DEMO 引擎（或 V1.5 后同步 DEMO），然后重跑：
//   node scripts/export-battle-data.cjs && node scripts/verify-battle-data.cjs

import type { PirateBossDef } from '@/types/battle';

/** 敌人本体血量与头目技能（掠夺队 = raid，20 血、无头目技能） */
export const PIRATE_BOSSES: Record<string, PirateBossDef> = {
  "raid": { id: "raid", name: "海盗旗舰（掠夺队）", hp: 20, skill: "无头目技能（掠夺队不带 BOSS）" },
  "b1": { id: "b1", name: "「快刀」红胡子", hp: 35, skill: "每回合开始：随机冻结玩家 1~2 艘；开场自带 1 艘 1/2 杂兵" },
  "b2": { id: "b2", name: "「黑寡妇」玛拉", hp: 30, skill: "每回合结束：若场上不足 3 艘则补到 3 艘（钩爪登陆艇），然后全体己方 +1 护盾（每艘最多比原始高 2）" },
  "b3": { id: "b3", name: "「深海阎王」巴罗萨", hp: 30, skill: "本体血量 ≤22 时全体己方 +4 攻（仅一次），且每 3 个 BOSS 回合玩家本体 -1" },
  "b4": { id: "b4", name: "「锈钩」卡尔戈", hp: 35, skill: "玩家每被击毁 1 艘战舰，就从池外召唤 1 艘锈蚀残骸" },
  "b5": { id: "b5", name: "「苍白歌者」塞壬", hp: 30, skill: "每 2 个回合：对随机一艘玩家战舰造成 1 点伤害（不打本体；玩家场上没有战舰时落空）" },
  "m01": { id: "m01", name: "噬星母巢", hp: 24, skill: "开场自带 1 艘噬星幼虫；每回合结束：若己方场上不足 2 艘，召唤 1 艘噬星幼虫（q1）" },
  "m02": { id: "m02", name: "残响总控", hp: 32, skill: "每回合开始：己方全体攻击 +1（最多 +2）；同时给己方场上结构最低的一艘补 1 护盾" },
  "m03": { id: "m03", name: "忆潮主祭", hp: 28, skill: "每回合开始：随机冻结玩家 1 艘战舰" },
  "m04": { id: "m04", name: "旧律裁决官", hp: 24, skill: "开场：己方全体护盾 +2" },
  "m05": { id: "m05", name: "海盗杂兵头目", hp: 18, skill: "开场自带 1 艘海盗杂兵；每回合结束：若己方场上不足 2 艘，召唤 1 艘海盗杂兵（t_grunt）" },
};

/** 海盗舰船池（海盗每回合从这里按指挥度出牌，用光不补充；玩家永远不可获得） */
export const PIRATE_POOL: readonly string[] = ["r1","r1","r1","r1","r2","r2","r2","r3","r3","r3","r4","r4","r4","r4","r5","r5","r5","r6","r6","r6","r7","r7","r7","r8","r8","r9","r9","r9","r9","r10"];

/** 掠夺队（bossId = raid）自己的舰船池（**用户 2026-08 裁定**：15 艘、构成本身也更偏低阶，
 *  最高 4 费、不含 r8/r9/r10 头目与旗舰级 —— 与 5 个老巢共用的 PIRATE_POOL 区分开）。 */
export const RAID_POOL: readonly string[] = ["r1","r1","r1","r1","r2","r2","r2","r3","r3","r4","r4","r4","r5","r6","r7"];

/** 老巢敌人 id（5 个 BOSS；掠夺队单列） */
export const LAIR_BOSS_IDS: readonly string[] = ["b1","b2","b3","b4","b5"];
