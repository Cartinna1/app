// ==================== 奇观回合推进（纯逻辑，从 useWonder 抽离） ====================
// 由 processColonyTurn 在每回合结算时调用；直接改写传入的 ship 草稿（调用方已克隆）。

import type { WonderState } from '@/types/colony';
import { getWonderDef } from '@/data/colony/wonders';

/** 由 processColonyTurn 调用：结算奇观推进 */
export function processWonderTurn(ship: any, _turn: number): void {
  const ws = ship.colony?.wonder;
  if (!ws || ws.phase !== 'building' || !ws.selectedWonderId) return;
  if (!ws.submittedThisTurn) { return; }

  const wonder = getWonderDef(ws.selectedWonderId);
  if (!wonder) return;

  let newStage = ws.currentStage;
  let newProgress = ws.stageProgress + 1;
  let newTotal = ws.totalTurnsSpent + 1;

  // 阶段切换
  if (newStage < wonder.stages.length && newProgress >= wonder.stages[newStage].turns) {
    newProgress = 0;
    newStage++;
  }

  const newWS: WonderState = {
    ...ws,
    currentStage: newStage,
    stageProgress: newProgress,
    totalTurnsSpent: newTotal,
    submittedThisTurn: false,
    eventHistory: [...ws.eventHistory, `第${newTotal}回合：${wonder.stages[ws.currentStage]?.name || ''}进度 +1`],
  };

  ship.colony.wonder = newWS;
}
