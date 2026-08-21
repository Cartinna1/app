import { useCallback } from 'react';
import type { GameState } from '@/types/game';
import { getTechById, REPEATABLE_TECHS, getRepeatableCost } from '@/data/colony/techs';

/** 殖民地科技研究（从 useColony 拆出） */
export function useColonyResearch(
  dispatch: React.Dispatch<{ type: 'FUNCTIONAL_UPDATE'; updater: (state: GameState) => GameState }>
) {
  /** 开始研究科技（含循环科技） */
  const startResearch = useCallback((techId: string): { success: boolean; message: string } => {
    const tech = getTechById(techId);
    const rpt = REPEATABLE_TECHS.find(rt => rt.id === techId);
    if (!tech && !rpt) return { success: false, message: '科技不存在' };
    let result = { success: false, message: '' };
    dispatch({
      type: 'FUNCTIONAL_UPDATE',
      updater: (prev) => {
        const ships = [...prev.ships];
        const s = { ...ships[0] };
        if (!s.colony || s.colony.phase !== 'active') { result = { success: false, message: '殖民地未激活' }; return prev; }
        if (!s.colony.techState) { result = { success: false, message: '科技系统未就绪' }; return prev; }
        if (s.colony.techState.currentResearch) { result = { success: false, message: '已经在研究一项科技' }; return prev; }
        // 普通科技不可重复研究
        if (tech && s.colony.techState.researched.includes(techId)) { result = { success: false, message: '该科技已研究完成' }; return prev; }
        const cost = tech ? tech.costRP : getRepeatableCost(rpt!, (s.colony.techState.repeatableLevels?.[techId] || 0));
        const turns = tech ? tech.researchTurns : rpt!.researchTurns;
        const name = tech ? tech.name : rpt!.name;
        if (s.colony.techState.researchPoints < cost) { result = { success: false, message: `科研点数不足（需要${cost}）` }; return prev; }
        s.colony = { ...s.colony, techState: { ...s.colony.techState, researchPoints: s.colony.techState.researchPoints - cost, currentResearch: techId, currentProgress: 0 } };
        result = { success: true, message: `开始研究「${name}」（需要${turns}回合）` };
        ships[0] = s;
        return { ...prev, ships };
      },
    });
    return result;
  }, [dispatch]);

  return { startResearch };
}
