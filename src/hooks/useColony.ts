import type { GameState } from '@/types/game';
import { useColonyBase } from './colony/useColonyBase';
import { useColonyBuildings } from './colony/useColonyBuildings';
import { useColonyPop } from './colony/useColonyPop';
import { useColonyResearch } from './colony/useColonyResearch';
import { useColonyLeaders } from './colony/useColonyLeaders';
import { useColonyExpedition } from './colony/useColonyExpedition';
import { useWonder } from './useWonder';

/**
 * 殖民地系统组合 hook。
 * 具体动作已按领域拆到 hooks/colony/ 下的子 hook；回合结算逻辑在 lib/colony/colonyTurn.ts。
 */
export function useColony(
  gameState: GameState,
  dispatch: React.Dispatch<{ type: 'FUNCTIONAL_UPDATE'; updater: (state: GameState) => GameState }>
) {
  const { unlockColony, selectPlanet, rescrollPlanets, generateScoutingPool } = useColonyBase(gameState, dispatch);
  const { buildColonyBuilding, cancelBuilding, demolishBuilding } = useColonyBuildings(dispatch);
  const { recruitPop, assignPop } = useColonyPop(dispatch);
  const { startResearch } = useColonyResearch(dispatch);
  const { recruitLeader, upgradeLeader, rollAndRecruit, clearRecruitPool } = useColonyLeaders(gameState, dispatch);
  // 奇观系统
  const { selectWonder, submitWonderResources, canStartWonder, completeWonder } = useWonder(gameState, dispatch);
  // 远征系统（领袖剧情树）
  const { startExpedition, payExpeditionNode, unlockUltimate } = useColonyExpedition(gameState, dispatch);

  return {
    unlockColony, selectPlanet, rescrollPlanets, generateScoutingPool,
    buildColonyBuilding, recruitPop, assignPop, startResearch,
    recruitLeader, upgradeLeader, rollAndRecruit, clearRecruitPool,
    cancelBuilding, demolishBuilding,
    selectWonder, submitWonderResources, canStartWonder, completeWonder,
    startExpedition, payExpeditionNode, unlockUltimate,
  };
}
