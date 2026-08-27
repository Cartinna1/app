import { useCallback } from 'react';
import type { GameState } from '@/types/game';
import { ALL_PLANETS } from '@/data/colony/planets';
import { getBuildingDef } from '@/data/colony/buildings';
import { getLeaderDef } from '@/data/colony/leaders';
import { getRecruitCapPerTurn } from '@/lib/colony/colonyTurn';

/** 殖民地人口招募 / 分配（从 useColony 拆出） */
export function useColonyPop(
  dispatch: React.Dispatch<{ type: 'FUNCTIONAL_UPDATE'; updater: (state: GameState) => GameState }>
) {
  /** 招募人口 */
  const recruitPop = useCallback((amount: number): { success: boolean; message: string } => {
    if (amount <= 0) return { success: false, message: '数量必须大于0' };
    let result = { success: false, message: '' };
    dispatch({
      type: 'FUNCTIONAL_UPDATE',
      updater: (prev) => {
        const ships = [...prev.ships];
        const s = { ...ships[0] };
        if (!s.colony || s.colony.phase !== 'active') {
          result = { success: false, message: '殖民地未激活' };
          return prev;
        }
        const baseCost = 2000;
        const planetDelta = (() => {
          if (!s.colony?.planetType) return 0;
          const pd = ALL_PLANETS.find((p) => p.id === s.colony!.planetType);
          return pd?.buffs.recruitCostDelta || 0;
        })();
        // 领袖招募费用减免
        let recruitCostBonus = 0;
        for (const l of s.colony!.leaders || []) {
          const ld = getLeaderDef(l.id);
          recruitCostBonus += (ld?.levelExtras[l.level-1]?.recruitCostBonus || 0);
        }
        const maxRecruit = getRecruitCapPerTurn(s.colony!);
        const recruitedThisTurn = s.colony!.recruitedThisTurn || 0;
        const remaining = maxRecruit - recruitedThisTurn;
        if (amount > remaining) {
          result = { success: false, message: `本回合剩余可招募${remaining}人（每回合最多${maxRecruit}人）` };
          return prev;
        }
        const cost = Math.max(0, (baseCost + planetDelta + recruitCostBonus) * amount);
        if (s.gold < cost) {
          result = { success: false, message: `金币不足（需要${cost.toLocaleString()}金币）` };
          return prev;
        }
        if (s.colony.population.total + amount > s.colony.population.cap) {
          result = { success: false, message: `人口已达上限（${s.colony.population.cap}）` };
          return prev;
        }
        s.gold -= cost;
        s.goldLog = [{ turn: prev.turn, amount: -cost, reason: `招募${amount}人口`, balanceAfter: s.gold }, ...s.goldLog].slice(0, 200);
        s.colony = {
          ...s.colony,
          population: {
            ...s.colony.population,
            total: s.colony.population.total + amount,
            available: s.colony.population.available + amount,
          },
          recruitedThisTurn: recruitedThisTurn + amount,
        };
        result = { success: true, message: `招募了${amount}人口` };
        ships[0] = s;
        return { ...prev, ships };
      },
    });
    return result;
  }, [dispatch]);

  /** 分配人口到建筑 */
  const assignPop = useCallback((buildingUid: string, count: number): { success: boolean; message: string } => {
    let result = { success: false, message: '' };
    dispatch({
      type: 'FUNCTIONAL_UPDATE',
      updater: (prev) => {
        const ships = [...prev.ships];
        const s = { ...ships[0] };
        if (!s.colony || s.colony.phase !== 'active') {
          result = { success: false, message: '殖民地未激活' };
          return prev;
        }
        const idx = s.colony.buildings.findIndex((b) => b.uid === buildingUid);
        if (idx === -1) { result = { success: false, message: '建筑不存在' }; return prev; }
        const inst = s.colony.buildings[idx];
        if (!inst.active) { result = { success: false, message: '建筑尚未建成' }; return prev; }
        const def = getBuildingDef(inst.defId);
        if (!def) { result = { success: false, message: '建筑定义不存在' }; return prev; }

        // 计算领袖扩展后的最大入驻人口
        let effMax = def.maxPop;
        if (s.colony) {
          for (const l of s.colony.leaders) {
            const ld = getLeaderDef(l.id);
            const extras = ld?.levelExtras[l.level - 1];
            if (extras?.popCapBonus?.[inst.defId]) effMax = Math.max(effMax, extras.popCapBonus[inst.defId]);
          }
        }

        const delta = count - inst.assignedPop;
        if (delta > 0 && s.colony.population.available < delta) {
          result = { success: false, message: '空闲人口不足' };
          return prev;
        }
        if (count < 0 || count > effMax) {
          result = { success: false, message: `入驻人口需在0-${effMax}之间` };
          return prev;
        }
        // 最小入驻人口约束：B9/B10/B11/B12/量子实验室 等建筑必须满足 minPop
        if (count > 0 && count < def.minPop) {
          result = { success: false, message: `「${def.name}」最少需要${def.minPop}人才能运作（当前分配${count}人不足）` };
          return prev;
        }
        s.colony = {
          ...s.colony,
          population: {
            ...s.colony.population,
            available: s.colony.population.available - delta,
          },
          buildings: s.colony.buildings.map((b, i) =>
            i === idx ? { ...b, assignedPop: count } : b
          ),
        };
        result = { success: true, message: `已分配${count}人口到「${def.name}」` };
        ships[0] = s;
        return { ...prev, ships };
      },
    });
    return result;
  }, [dispatch]);

  return { recruitPop, assignPop };
}
