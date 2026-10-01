import { useCallback } from 'react';
import type { GameState } from '@/types/game';
import { ALL_PLANETS } from '@/data/colony/planets';
import { getGalaxyNode } from '@/data/galaxy/nodes';

/** 殖民解锁费用（唯一常量：殖民地面板已无入口，仅星图 foundColony 使用） */
const UNLOCK_COST = 30000;

/**
 * 殖民地建立（入口已统一到星图）。
 * 旧流程的 unlockColony / selectPlanet / rescrollPlanets / generateScoutingPool（3 选 1 随机星球池）
 * 已随《星图更新》方案删除：星球类型由玩家在星图上选择的节点决定。
 */
export function useColonyBase(
  gameState: GameState,
  dispatch: React.Dispatch<{ type: 'FUNCTIONAL_UPDATE'; updater: (state: GameState) => GameState }>
) {
  const ship = gameState.ships[0];

  /** 星图流程：跃迁到殖民地星球后支付 30,000 建立殖民地（星球类型由节点决定；全局限一颗） */
  const foundColony = useCallback((nodeId: string, name: string): { success: boolean; message: string } => {
    if (!ship) return { success: false, message: '舰队不存在' };
    const node = getGalaxyNode(nodeId);
    if (!node || node.type !== 'colony' || !node.planetId) return { success: false, message: '该星系不是可殖民星球' };
    if (ship.galaxy.currentNodeId !== nodeId) return { success: false, message: '母舰不在该星球，请先在星图跃迁抵达' };
    if (ship.colony && ship.colony.phase !== 'inactive') return { success: false, message: '你已经建立过殖民地，全局只能殖民一颗星球' };
    if (name.length < 3 || name.length > 16) return { success: false, message: '星球名称需3-16个字符' };
    if (ship.gold < UNLOCK_COST) return { success: false, message: `金币不足（需要${UNLOCK_COST.toLocaleString()}金币）` };
    const planetDef = ALL_PLANETS.find((p) => p.id === node.planetId);
    let result = { success: false, message: '' };
    dispatch({
      type: 'FUNCTIONAL_UPDATE',
      updater: (prev) => {
        const ships = [...prev.ships];
        const s = { ...ships[0] };
        s.gold -= UNLOCK_COST;
        s.goldLog = [{ turn: prev.turn, amount: -UNLOCK_COST, reason: `在「${planetDef?.name || node.name}」组建远征军`, balanceAfter: s.gold }, ...s.goldLog].slice(0, 200);
        s.galaxy = { ...s.galaxy, colonizedNodeId: nodeId };
        s.colony = {
          phase: 'scouting',
          scoutTurnsRemaining: 2,
          planetType: node.planetId!,
          planetName: name,
          buildings: [],
          population: { total: 0, available: 0, cap: 5 },
          recruitedThisTurn: 0,
          leaders: [],
          leaderCap: 3,
          energy: 0,
          blackoutGuardTurns: 0,
          expeditionEndings: {},
          expeditionUnlocks: [],
        };
        ships[0] = s;
        result = { success: true, message: `远征军已出发，2 回合后将在「${planetDef?.name || node.name}」建成殖民地` };
        return { ...prev, ships };
      },
    });
    return result;
  }, [ship, dispatch]);

  return { foundColony };
}
