import { useCallback } from 'react';
import type { GameState } from '@/types/game';
import type { PlanetTypeId, BuildingInstance } from '@/types/colony';
import { ALL_PLANETS } from '@/data/colony/planets';

const UNLOCK_COST = 30000;

/** 殖民地解锁 / 星球选择 / 探索池（从 useColony 拆出） */
export function useColonyBase(
  gameState: GameState,
  dispatch: React.Dispatch<{ type: 'FUNCTIONAL_UPDATE'; updater: (state: GameState) => GameState }>
) {
  const ship = gameState.ships[0];

  /** 解锁殖民功能 */
  const unlockColony = useCallback((): { success: boolean; message: string } => {
    if (!ship) return { success: false, message: '舰队不存在' };
    if (ship.colony) return { success: false, message: '殖民地已解锁' };
    if (ship.gold < UNLOCK_COST) return { success: false, message: `金币不足（需要${UNLOCK_COST.toLocaleString()}金币）` };
    dispatch({
      type: 'FUNCTIONAL_UPDATE',
      updater: (prev) => {
        const ships = [...prev.ships];
        const s = { ...ships[0] };
        s.gold -= UNLOCK_COST;
        s.goldLog = [{ turn: prev.turn, amount: -UNLOCK_COST, reason: '组建远征军探索殖民', balanceAfter: s.gold }, ...s.goldLog].slice(0, 200);
        s.colony = { phase: 'scouting', scoutTurnsRemaining: 2, planetType: null, planetName: '', buildings: [], population: { total: 0, available: 0, cap: 5 }, leaders: [], leaderCap: 3, energy: 0 };
        ships[0] = s;
        return { ...prev, ships };
      },
    });
    return { success: true, message: '远征军已出发！预计2回合后抵达目标星系。' };
  }, [ship, dispatch]);

  /** 选择星球 */
  const selectPlanet = useCallback((planetId: PlanetTypeId, name: string): { success: boolean; message: string } => {
    const planet = ALL_PLANETS.find((p) => p.id === planetId);
    if (!planet) return { success: false, message: '星球不存在' };
    if (name.length < 3 || name.length > 16) return { success: false, message: '星球名称需3-16个字符' };
    let result = { success: false, message: '' };
    dispatch({
      type: 'FUNCTIONAL_UPDATE',
      updater: (prev) => {
        const ships = [...prev.ships];
        const s = { ...ships[0] };
        if (!s.colony || s.colony.phase !== 'selecting') {
          result = { success: false, message: '当前无法选择星球' };
          return prev;
        }
        const planetDef = ALL_PLANETS.find((p) => p.id === planetId);
        if (!planetDef) {
          result = { success: false, message: '星球不存在' };
          return prev;
        }
        const initialCap = planetDef.buffs.initialPopCap || 5;
        const initialPop = planetDef.buffs.initialPop || 0;
        // 遗落星球赠送 B7/B20/B21
        const buildings: BuildingInstance[] = [];
        if (planetId === 'ruin') {
          buildings.push(
            { defId: 'B7', uid: 'B7_ruin_1', assignedPop: 0, buildProgress: 3, active: true },
            { defId: 'B20', uid: 'B20_ruin_1', assignedPop: 0, buildProgress: 3, active: true },
            { defId: 'B21', uid: 'B21_ruin_1', assignedPop: 0, buildProgress: 4, active: true },
          );
        }
        s.colony = {
          ...s.colony,
          phase: 'active',
          planetType: planetId,
          planetName: name,
          buildings,
          population: { total: initialPop, available: initialPop, cap: initialCap },
          techState: { researched: [], currentResearch: null, currentProgress: 0, researchPoints: 500, researchSeed: 0, repeatableLevels: {} },
          leaders: [],
          leaderCap: 3,
          energy: 0,
        };
        ships[0] = s;
        result = { success: true, message: `成功在「${planetDef.name}」建立殖民地「${name}」！` };
        return { ...prev, ships };
      },
    });
    return result;
  }, [dispatch]);

  /** 生成一个 3 星球随机池（纯函数，不写状态） */
  const rollScoutingPool = useCallback((): PlanetTypeId[] => {
    const pool = [...ALL_PLANETS];
    const result: PlanetTypeId[] = [];
    for (let i = 0; i < 3; i++) {
      const idx = Math.floor(Math.random() * pool.length);
      result.push(pool[idx].id);
      pool.splice(idx, 1);
    }
    return result;
  }, []);

  /** 重新探索星球 */
  const rescrollPlanets = useCallback((): { success: boolean; message: string } => {
    if (!ship) return { success: false, message: '舰队不存在' };
    if (ship.gold < UNLOCK_COST) return { success: false, message: `金币不足（需要${UNLOCK_COST.toLocaleString()}金币）` };
    dispatch({
      type: 'FUNCTIONAL_UPDATE',
      updater: (prev) => {
        const ships = [...prev.ships];
        const s = { ...ships[0] };
        s.gold -= UNLOCK_COST;
        if (s.colony && s.colony.phase === 'selecting') {
          // 重新生成星球池
          s.colony = { ...s.colony, scoutingPool: rollScoutingPool() };
        }
        ships[0] = s;
        return { ...prev, ships };
      },
    });
    return { success: true, message: '已重新派出远征军探索新星系。' };
  }, [ship, dispatch, rollScoutingPool]);

  /**
   * 生成星球池（保持原签名，供 UI 兜底调用）。
   * 若当前处于 selecting 且池中为空，则通过 dispatch 正规写回 state（不可变更新），
   * 不再由调用方在渲染期直接 mutate colony.scoutingPool。
   */
  const generateScoutingPool = useCallback((): PlanetTypeId[] => {
    const existing = ship?.colony?.scoutingPool;
    if (existing && existing.length > 0) return existing;
    const result = rollScoutingPool();
    if (ship?.colony?.phase === 'selecting') {
      dispatch({
        type: 'FUNCTIONAL_UPDATE',
        updater: (prev) => {
          const ships = [...prev.ships];
          const s = { ...ships[0] };
          // 并发/重复触发时以先到者为准，避免覆盖
          if (s.colony && s.colony.phase === 'selecting' && (!s.colony.scoutingPool || s.colony.scoutingPool.length === 0)) {
            s.colony = { ...s.colony, scoutingPool: result };
            ships[0] = s;
            return { ...prev, ships };
          }
          return prev;
        },
      });
    }
    return result;
  }, [ship, dispatch, rollScoutingPool]);

  return { unlockColony, selectPlanet, rescrollPlanets, generateScoutingPool };
}
