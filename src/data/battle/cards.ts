// ==================== 舰船卡牌数据（玩家 5 系 + 海盗 + 衍生单位） ====================
// 本文件由 scripts/export-battle-data.cjs 从 carddemo/engine.js 生成 —— **请勿手改**。
// 改卡牌数据请改 DEMO 引擎（或 V1.5 后同步 DEMO），然后重跑：
//   node scripts/export-battle-data.cjs && node scripts/verify-battle-data.cjs

import type { ShipCardDef } from '@/types/battle';

/** 全部卡牌（含衍生单位；token = true 的不进卡库） */
export const BATTLE_CARDS: Record<string, ShipCardDef> = {
  "h1": { id: "h1", name: "圣火巡逻艇", cost: 1, atk: 1, shield: 2, structure: 1, series: "圣辉", rarity: "白", text: "回合结束：相邻友舰回复 1 护盾" },
  "h2": { id: "h2", name: "诵经护卫舰", cost: 2, atk: 2, shield: 3, structure: 1, series: "圣辉", rarity: "白", text: "入场：本体回复 1 点结构值" },
  "h3": { id: "h3", name: "审判巡洋舰", cost: 3, atk: 3, shield: 4, structure: 1, series: "圣辉", rarity: "蓝", text: "入场（神罚）：选择一个敌方战舰，造成 2 点伤害（无视护盾）" },
  "h4": { id: "h4", name: "圣龛战列舰", cost: 4, atk: 4, shield: 6, structure: 2, series: "圣辉", rarity: "蓝", text: "锁链；回合结束：全体友舰 +1 护盾" },
  "h5": { id: "h5", name: "苦修者母舰", cost: 4, atk: 3, shield: 5, structure: 2, series: "圣辉", rarity: "紫", text: "入场：召唤 2 个 1/1/0 的修士舰" },
  "h6": { id: "h6", name: "大主教座舰", cost: 5, atk: 5, shield: 6, structure: 3, series: "圣辉", rarity: "紫", text: "入场：召回（重新部署）一个已被击毁的 3 费以下友舰" },
  "h7": { id: "h7", name: "圣光方舟", cost: 6, atk: 6, shield: 8, structure: 3, series: "圣辉", rarity: "橙", text: "回合开始：本体 +2 结构值，全体友舰回复 2 护盾；亡语：本体 +5 结构值" },
  "i1": { id: "i1", name: "炮灰鱼雷艇", cost: 1, atk: 2, shield: 1, structure: 0, series: "铁血", rarity: "白", text: "亡语：随机一艘友舰攻击 +1" },
  "i2": { id: "i2", name: "军阀突击舰", cost: 2, atk: 3, shield: 2, structure: 2, series: "铁血", rarity: "白", text: "狂怒+2：半血（结构值 ≤1）时攻击 +2" },
  "i3": { id: "i3", name: "装甲破坏者", cost: 3, atk: 4, shield: 3, structure: 1, series: "铁血", rarity: "蓝", text: "入场：对敌方本体造成 2 点伤害" },
  "i4": { id: "i4", name: "钢铁壁垒舰", cost: 4, atk: 4, shield: 6, structure: 2, series: "铁血", rarity: "蓝", text: "锁链；亡语：召唤 2 艘 1/1/1 的僚舰（占场上位置）" },
  "i5": { id: "i5", name: "战帅旗舰", cost: 5, atk: 5, shield: 7, structure: 3, series: "铁血", rarity: "紫", text: "入场：本回合全体友舰攻击 +2" },
  "i6": { id: "i6", name: "自爆突击舰", cost: 5, atk: 6, shield: 4, structure: 2, series: "铁血", rarity: "紫", text: "亡语：对敌方所有单位造成 2 点伤害" },
  "i7": { id: "i7", name: "灭绝级无畏舰", cost: 6, atk: 7, shield: 7, structure: 3, series: "铁血", rarity: "橙", text: "贯穿；攻击后自身受到 2 点反噬伤害" },
  "p1": { id: "p1", name: "灵媒侦察艇", cost: 1, atk: 1, shield: 2, structure: 1, series: "灵能", rarity: "白", text: "入场：选择冻结一艘敌方战舰" },
  "p2": { id: "p2", name: "心灵干扰舰", cost: 2, atk: 2, shield: 3, structure: 1, series: "灵能", rarity: "白", text: "入场：选择冻结 2 个敌方战舰" },
  "p3": { id: "p3", name: "幻象巡洋舰", cost: 3, atk: 3, shield: 3, structure: 1, series: "灵能", rarity: "蓝", text: "潜航；亡语：召唤一个 3 攻/2 盾/0 的幻象分身" },
  "p4": { id: "p4", name: "深渊凝望者", cost: 4, atk: 4, shield: 5, structure: 2, series: "灵能", rarity: "蓝", text: "回合结束：随机一艘敌方战舰攻击 -2（最低 0）" },
  "p5": { id: "p5", name: "记忆掠夺者", cost: 4, atk: 3, shield: 4, structure: 2, series: "灵能", rarity: "紫", text: "入场：自行选择一艘场上已有战舰，复制它（身材与关键词）" },
  "p6": { id: "p6", name: "主星祭司舰", cost: 5, atk: 5, shield: 6, structure: 3, series: "灵能", rarity: "紫", text: "入场：己方所有战舰攻击 +2、护盾 +2" },
  "p7": { id: "p7", name: "心灵风暴母舰", cost: 6, atk: 6, shield: 7, structure: 3, series: "灵能", rarity: "橙", text: "入场：控制一艘攻击 ≤3 的敌方战舰（归你方场上）" },
  "g1": { id: "g1", name: "金鳞运输艇", cost: 1, atk: 1, shield: 3, structure: 1, series: "财团", rarity: "白", text: "亡语：本回合指挥度 +1" },
  "g2": { id: "g2", name: "雇佣兵炮舰", cost: 2, atk: 3, shield: 2, structure: 1, series: "财团", rarity: "白", text: "入场：若你当前指挥度 ≥4，攻击 +1" },
  "g3": { id: "g3", name: "贸易货轮", cost: 3, atk: 1, shield: 5, structure: 2, series: "财团", rarity: "蓝", text: "回合结束：本回合指挥度 +1" },
  "g4": { id: "g4", name: "铸币工厂舰", cost: 4, atk: 3, shield: 6, structure: 2, series: "财团", rarity: "紫", text: "入场：本局指挥度上限永久 +1" },
  "g5": { id: "g5", name: "财团主席舰", cost: 5, atk: 4, shield: 7, structure: 3, series: "财团", rarity: "紫", text: "入场：你所有舰船的指挥度 -1（最低为 1）" },
  "g6": { id: "g6", name: "黄金泰坦", cost: 6, atk: 8, shield: 8, structure: 3, series: "财团", rarity: "橙", text: "过载 2；入场时你每控制一艘友舰，费用 -1（最低 0）" },
  "c1": { id: "c1", name: "民用改装艇", cost: 1, atk: 1, shield: 2, structure: 1, series: "通用", rarity: "白", text: "—" },
  "c2": { id: "c2", name: "哨戒无人机", cost: 2, atk: 2, shield: 2, structure: 1, series: "通用", rarity: "白", text: "锁链" },
  "c3": { id: "c3", name: "突击巡洋舰", cost: 3, atk: 3, shield: 4, structure: 2, series: "通用", rarity: "白", text: "—" },
  "c4": { id: "c4", name: "维修工程舰", cost: 3, atk: 2, shield: 5, structure: 2, series: "通用", rarity: "蓝", text: "回合结束：修复相邻友舰 2 点护盾" },
  "c5": { id: "c5", name: "重型战列舰", cost: 5, atk: 6, shield: 6, structure: 3, series: "通用", rarity: "白", text: "—" },
  "c6": { id: "c6", name: "轨道炮旗舰", cost: 6, atk: 7, shield: 7, structure: 3, series: "通用", rarity: "蓝", text: "入场：对随机一艘敌方战舰造成 3 点伤害" },
  "r1": { id: "r1", name: "掠夺者快艇", cost: 1, atk: 2, shield: 1, structure: 0, series: "海盗", rarity: "白", text: "—" },
  "r2": { id: "r2", name: "钩爪登陆艇", cost: 1, atk: 1, shield: 2, structure: 0, series: "海盗", rarity: "白", text: "—" },
  "r3": { id: "r3", name: "烟幕投放艇", cost: 2, atk: 2, shield: 1, structure: 1, series: "海盗", rarity: "蓝", text: "入场：相邻友舰获得「伏击」" },
  "r4": { id: "r4", name: "海盗巡逻艇", cost: 2, atk: 2, shield: 2, structure: 0, series: "海盗", rarity: "白", text: "入场：获得伏击（部署当回合即可攻击）" },
  "r5": { id: "r5", name: "黑市走私艇", cost: 3, atk: 2, shield: 4, structure: 1, series: "海盗", rarity: "蓝", text: "入场：双方各获得 1 点指挥度" },
  "r6": { id: "r6", name: "破盾鱼雷舰", cost: 3, atk: 4, shield: 2, structure: 0, series: "海盗", rarity: "蓝", text: "破甲（攻击无视护盾）" },
  "r7": { id: "r7", name: "双桅劫掠舰", cost: 4, atk: 4, shield: 5, structure: 2, series: "海盗", rarity: "蓝", text: "掠夺 2：命中对方本体时获得 2 点指挥度" },
  "r8": { id: "r8", name: "海盗头目舰", cost: 4, atk: 5, shield: 4, structure: 2, series: "海盗", rarity: "紫", text: "入场：从池外召唤 2 艘钩爪登陆艇（不占池）" },
  "r9": { id: "r9", name: "嗜血旗舰", cost: 5, atk: 6, shield: 5, structure: 3, series: "海盗", rarity: "紫", text: "亡命+2；击毁一艘战舰后可再次攻击（每回合一次）" },
  "r10": { id: "r10", name: "深海阎王号", cost: 6, atk: 7, shield: 7, structure: 3, series: "海盗", rarity: "橙", text: "锁链；入场：召唤 2 艘 2/3/1 海盗炮舰；贯穿" },
  "t_monk": { id: "t_monk", name: "修士舰", cost: 0, atk: 1, shield: 1, structure: 0, series: "圣辉", rarity: "白", text: "衍生", token: true },
  "t_wing": { id: "t_wing", name: "僚舰", cost: 0, atk: 1, shield: 1, structure: 1, series: "铁血", rarity: "白", text: "衍生", token: true },
  "t_mirage": { id: "t_mirage", name: "幻象分身", cost: 0, atk: 3, shield: 2, structure: 0, series: "灵能", rarity: "白", text: "衍生", token: true },
  "t_claw": { id: "t_claw", name: "钩爪登陆艇", cost: 0, atk: 1, shield: 2, structure: 0, series: "海盗", rarity: "白", text: "衍生", token: true },
  "t_cannon": { id: "t_cannon", name: "海盗炮舰", cost: 0, atk: 2, shield: 3, structure: 1, series: "海盗", rarity: "白", text: "衍生", token: true },
  "t_wreck": { id: "t_wreck", name: "锈蚀残骸", cost: 0, atk: 2, shield: 1, structure: 0, series: "海盗", rarity: "白", text: "衍生", token: true },
  "t_grunt": { id: "t_grunt", name: "海盗杂兵", cost: 0, atk: 1, shield: 2, structure: 0, series: "海盗", rarity: "白", text: "衍生", token: true },
};

/** 卡牌 id 全集（含衍生单位） */
export const BATTLE_CARD_IDS: readonly string[] = ["h1", "h2", "h3", "h4", "h5", "h6", "h7", "i1", "i2", "i3", "i4", "i5", "i6", "i7", "p1", "p2", "p3", "p4", "p5", "p6", "p7", "g1", "g2", "g3", "g4", "g5", "g6", "c1", "c2", "c3", "c4", "c5", "c6", "r1", "r2", "r3", "r4", "r5", "r6", "r7", "r8", "r9", "r10", "t_monk", "t_wing", "t_mirage", "t_claw", "t_cannon", "t_wreck", "t_grunt"];

/** 衍生单位 id（召唤物：不进卡库、被击毁不计入永久损失） */
export const BATTLE_TOKEN_IDS: readonly string[] = ["t_monk","t_wing","t_mirage","t_claw","t_cannon","t_wreck","t_grunt"];
