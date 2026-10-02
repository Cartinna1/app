// ==================== 母舰每回合被动收益（唯一真值） ====================
// 结算（lib/turn/shipTurn.processShipTurn）与总览「资源收支」共用本清单，
// 避免出现"结算加了、总览没显示"的分叉（共鸣音叉 / 星灵共鸣石 / 克隆培养皿 / 招财猫 曾全部漏显，
// 而戴森那 +3 还被硬编码在 GameScreen 的 JSX 里）。
//
// 只收录**固定数值**的来源。动态来源仍由 processShipTurn 就地结算，其效果文字由总览「遗物BUFF」说明：
//   - 誊录仪（总资产 1% 金币）、万众一心股息（总资产 1% 金币）
//   - 随机原料类：深空采矿阵列 +10 基础原料、奇点探求者 +2~4 原料、奥得律斯基亚水晶 +3 随机原料
//
// phase 表示结算时点：pre = 船员食物消耗之前（装置产出，会被船员吃掉）；
//                     post = 之后（遗物收益，食物类可解除饥荒判定）。

import type { Mothership } from '@/types/game';
import { RELIC_RESONANCE_STONE, RELIC_CLONE_DISH, RELIC_LUCKY_CAT, RELIC_RESONANCE_FORK } from '@/data/relics';
import { MODULE_BIO_KITCHEN, MODULE_NANO_FARM, MODULE_SIXTH_FARM, MODULE_DYSON_COLLECTOR } from '@/data/modules';

export type ShipIncomeKind = 'food' | 'stardust' | 'gold';

export interface ShipIncomeLine {
  /** 来源名（装置/遗物名；总览明细与金币流水 reason 共用） */
  label: string;
  kind: ShipIncomeKind;
  value: number;
  phase: 'pre' | 'post';
}

/** 当前母舰的每回合固定被动收益清单（pre 段在前，与结算顺序一致） */
export function getShipPerTurnIncome(ship: Mothership): ShipIncomeLine[] {
  const lines: ShipIncomeLine[] = [];
  const hasModule = (id: string) => ship.installedModuleIds.includes(id);
  const hasRelic = (id: string) => ship.relics.some((r) => r.id === id);

  // 装置产出（船员消耗前）
  if (hasModule(MODULE_BIO_KITCHEN)) lines.push({ label: '生物合成厨房', kind: 'food', value: 15, phase: 'pre' });
  if (hasModule(MODULE_NANO_FARM)) lines.push({ label: '纳米机器人农场', kind: 'food', value: 30, phase: 'pre' });
  if (hasModule(MODULE_SIXTH_FARM)) lines.push({ label: '六维奇点农场', kind: 'food', value: 60, phase: 'pre' });
  if (hasModule(MODULE_DYSON_COLLECTOR)) lines.push({ label: '戴森粒子收集器', kind: 'stardust', value: 3, phase: 'pre' });

  // 遗物收益（船员消耗后）
  if (hasRelic(RELIC_CLONE_DISH)) lines.push({ label: '克隆培养皿', kind: 'food', value: 5, phase: 'post' });
  if (hasRelic(RELIC_RESONANCE_STONE)) lines.push({ label: '星灵共鸣石', kind: 'stardust', value: 2, phase: 'post' });
  if (hasRelic(RELIC_RESONANCE_FORK)) lines.push({ label: '共鸣音叉', kind: 'stardust', value: 3, phase: 'post' });
  if (hasRelic(RELIC_LUCKY_CAT)) lines.push({ label: '招财猫摆件', kind: 'gold', value: 200, phase: 'post' });

  return lines;
}

/** 按资源汇总（总览展示用；phase 省略表示 pre + post 全部） */
export function sumShipIncome(ship: Mothership, kind: ShipIncomeKind, phase?: 'pre' | 'post'): number {
  return getShipPerTurnIncome(ship)
    .filter((l) => l.kind === kind && (!phase || l.phase === phase))
    .reduce((total, l) => total + l.value, 0);
}
