// ==================== 舰船卡牌战斗 · 数值锚点（唯一位置） ====================
// 改任何一个数字前，先按 AGENTS 第七节的数值纪律出前后对比表，并重跑 carddemo 的胜率表。
// 这些值全部与《舰队卡牌游戏设计方案 V1.5》对应；卡牌/海盗数据在 data/battle/{cards,pirates}.ts（由引擎导出）。

import type { BattleTuning } from '@/types/battle';

export const BATTLE_TUNING: BattleTuning = {
  /** §1.1：本体就是玩家本人，15 点结构值，无护盾无攻击，不会消失，每场战斗后回满 */
  bodyHp: 15,
  /** §1.1：指挥度先手第 1 回合 3 点 */
  firstCap: 3,
  /** §1.1：后手第 1 回合 4 点（后手 +1 补偿） */
  secondCap: 4,
  /** §1.1：指挥度上限 10（铸币工厂舰的 capBonus 加在钳制之后，可超过 10） */
  manaCap: 10,
  /** §1.1：每方场上最多 6 艘 */
  boardSize: 6,
  /** §1.1：20 回合上限，到时比本体结构值，高者胜、相同判防守方（BOSS）胜 */
  turnLimit: 20,
  /** §10.1：舰队编制上限 30 艘 */
  fleetSize: 30,
  /** §1.3：狂怒/亡命的"半血"= 结构值 ≤ 一半（向下取整）；零结构值的舰没有半血概念 */
  halfHpFloor: true,
  /** §10.2：掠夺队没有 BOSS，用无头目技能、无护盾、20 点结构值的「海盗旗舰」 */
  raidHp: 20,
};

/** 关键词清单（§1.3；实现见 lib/battle/keywords.ts） */
export const BATTLE_KEYWORDS = [
  '锁链', '入场', '亡语', '回合开始', '回合结束', '潜航', '贯穿',
  '狂怒', '过载', '冻结', '掠夺', '伏击', '亡命', '破甲',
] as const;

/** 玩家可获得的系列（海盗为 PvE 专属，玩家永远不可获得、不可生产） */
export const PLAYER_SERIES = ['圣辉', '铁血', '灵能', '财团', '通用'] as const;
