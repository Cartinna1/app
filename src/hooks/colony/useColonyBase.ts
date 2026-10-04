import { useCallback } from 'react';
import type { GameState } from '@/types/game';
import type { Colony } from '@/types/colony';
import { ALL_PLANETS } from '@/data/colony/planets';
import { getGalaxyNode } from '@/data/galaxy/nodes';
import { applyColonyFounding } from '@/lib/colony/colonySetup';
import { LEADER_CAP_BASE } from '@/data/colony/leaders';
import { GOLD_LOG_LIMIT } from '@/data/gameData';

/** 建立殖民地费用（唯一常量；唯一入口是殖民面板的「建立殖民地」按钮，UI 显示也读它） */
export const UNLOCK_COST = 30000;

/**
 * 殖民地建立：入口在「殖民」页签，星球类型由母舰当前所在的星图节点决定（全局一颗）。
 * 旧流程的 unlockColony / selectPlanet / rescrollPlanets / generateScoutingPool（3 选 1 随机星球池）
 * 已随《星图更新》方案删除。
 */
export function useColonyBase(
  gameState: GameState,
  dispatch: React.Dispatch<{ type: 'FUNCTIONAL_UPDATE'; updater: (state: GameState) => GameState }>
) {
  const ship = gameState.ships[0];

  /** 建立殖民地：母舰已停泊在该星球，支付后**立即建成**（不再有建设等待期） */
  const foundColony = useCallback((nodeId: string, name: string): { success: boolean; message: string } => {
    if (!ship) return { success: false, message: '舰队不存在' };
    const node = getGalaxyNode(nodeId);
    if (!node || node.type !== 'colony' || !node.planetId) return { success: false, message: '该星系不是可殖民星球' };
    if (ship.galaxy.currentNodeId !== nodeId) return { success: false, message: '母舰不在该星球，请先在星图跃迁抵达' };
    if (ship.colony && ship.colony.phase !== 'inactive') return { success: false, message: '你已经建立过殖民地，全局只能殖民一颗星球' };
    if (name.length < 3 || name.length > 16) return { success: false, message: '星球名称需3-16个字符' };
    if (ship.gold < UNLOCK_COST) return { success: false, message: `金币不足（需要${UNLOCK_COST.toLocaleString()}金币）` };
    const planetDef = ALL_PLANETS.find((p) => p.id === node.planetId);
    const planetId = node.planetId;
    let result = { success: false, message: '' };
    dispatch({
      type: 'FUNCTIONAL_UPDATE',
      updater: (prev) => {
        const ships = [...prev.ships];
        const s = { ...ships[0] };
        s.gold -= UNLOCK_COST;
        s.goldLog = [{ turn: prev.turn, amount: -UNLOCK_COST, reason: `在「${planetDef?.name || node.name}」建立殖民地`, balanceAfter: s.gold }, ...s.goldLog].slice(0, GOLD_LOG_LIMIT);
        s.galaxy = { ...s.galaxy, colonizedNodeId: nodeId };
        // 立刻建成：初始化唯一真值 lib/colony/colonySetup.ts（含遗落星球赠送的 B7/B20/B21）
        const base: Colony = {
          phase: 'active',
          scoutTurnsRemaining: 0,
          planetType: planetId,
          planetName: name,
          buildings: [],
          population: { total: 0, available: 0, cap: 5 },
          recruitedThisTurn: 0,
          leaders: [],
          leaderCap: LEADER_CAP_BASE,
          energy: 0,
          blackoutGuardTurns: 0,
          expeditionEndings: {},
          expeditionVisited: {},
          expeditionUnlocks: [],
        };
        s.colony = applyColonyFounding(base, planetId, name);
        ships[0] = s;
        result = { success: true, message: `已在「${planetDef?.name || node.name}」建立殖民地「${name}」` };
        return { ...prev, ships };
      },
    });
    return result;
  }, [ship, dispatch]);

  return { foundColony };
}
