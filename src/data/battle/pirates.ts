// ==================== 海盗敌人（5 个老巢 BOSS + 掠夺队） ====================
// 本文件由 scripts/export-battle-data.cjs 从 carddemo/engine.js 生成 —— **请勿手改**。
// 改卡牌数据请改 DEMO 引擎（或 V1.5 后同步 DEMO），然后重跑：
//   node scripts/export-battle-data.cjs && node scripts/verify-battle-data.cjs

import type { PirateBossDef } from '@/types/battle';

/** 敌人本体血量与头目技能（掠夺队 = raid，20 血、无头目技能） */
export const PIRATE_BOSSES: Record<string, PirateBossDef> = {
  "raid": { id: "raid", name: "海盗旗舰（掠夺队）", hp: 20, skill: "无头目技能（掠夺队不带 BOSS）" },
  "b1": { id: "b1", name: "「快刀」红胡子", hp: 35, skill: "每回合开始：随机冻结玩家 1~2 艘；开场自带 1 艘 1/2 杂兵" },
  "b2": { id: "b2", name: "「黑寡妇」玛拉", hp: 30, skill: "每回合结束：召唤 1 艘钩爪登陆艇" },
  "b3": { id: "b3", name: "「深海阎王」巴罗萨", hp: 30, skill: "血量 ≤15 时全体己方 +4 攻，且玩家每回合开始本体 -1" },
  "b4": { id: "b4", name: "「锈钩」卡尔戈", hp: 35, skill: "玩家每被击毁 1 艘战舰，就从池外召唤 1 艘锈蚀残骸" },
  "b5": { id: "b5", name: "「苍白歌者」塞壬", hp: 30, skill: "回合结束：对随机一艘玩家战舰造成 1 点伤害（不打本体；玩家场上没有战舰时落空）" },
};

/** 海盗舰船池（海盗每回合从这里按指挥度出牌，用光不补充；玩家永远不可获得） */
export const PIRATE_POOL: readonly string[] = ["r1","r1","r1","r1","r2","r2","r2","r3","r3","r3","r4","r4","r4","r4","r5","r5","r5","r6","r6","r6","r7","r7","r7","r8","r8","r9","r9","r9","r9","r10"];

/** 老巢敌人 id（5 个 BOSS；掠夺队单列） */
export const LAIR_BOSS_IDS: readonly string[] = ["b1","b2","b3","b4","b5"];
