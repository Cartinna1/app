import { useCallback } from 'react';
import type { GameState } from '@/types/game';
import { getLeaderDef, rollLeaders, getLeaderUpgradeCost, getRecruitRollCost } from '@/data/colony/leaders';
import { firstMissing, payCost } from '@/lib/turn/resourceCost';
import { GOLD_LOG_LIMIT } from '@/data/gameData';

/** 殖民地领袖招募 / 升级 / 招募池（从 useColony 拆出） */
export function useColonyLeaders(
  gameState: GameState,
  dispatch: React.Dispatch<{ type: 'FUNCTIONAL_UPDATE'; updater: (state: GameState) => GameState }>
) {
  /** 招募领袖（添加+清池合一） */
  const recruitLeader = useCallback((leaderId: string) => {
    dispatch({
      type: 'FUNCTIONAL_UPDATE',
      updater: (prev) => {
        const ships = [...prev.ships]; const s = { ...ships[0] };
        if (!s.colony || s.colony.phase !== 'active') return prev;
        const ld = getLeaderDef(leaderId);
        if (!ld) return prev;
        if (s.colony.leaders.some(l => l.id === leaderId)) return prev;
        if (s.colony.leaders.length >= s.colony.leaderCap) return prev;
        s.colony = {
          ...s.colony,
          leaders: [...s.colony.leaders, { id: ld.id, name: ld.name, rarity: ld.rarity, description: ld.description, abilityName: ld.abilityName, level: 1 }],
          recruitPool: undefined,
        };
        ships[0] = s; return { ...prev, ships };
      },
    });
  }, [dispatch]);

  /** 领袖升级（费用唯一真值 data/colony/leaders.getLeaderUpgradeCost；校验与扣减走 lib/turn/resourceCost） */
  const upgradeLeader = useCallback((leaderIndex: number): { success: boolean; message: string } => {
    const ship = gameState.ships[0];
    const col = ship?.colony;
    if (!col || col.phase !== 'active') return { success: false, message: '殖民地未激活' };
    const li = col.leaders[leaderIndex];
    if (!li) return { success: false, message: '领袖不存在' };
    const cost = getLeaderUpgradeCost(li.level);
    if (!cost) return { success: false, message: '已达最高等级' };
    const missing = firstMissing(ship, col, cost);
    if (missing) return { success: false, message: missing };
    dispatch({
      type: 'FUNCTIONAL_UPDATE',
      updater: (prev) => {
        const ships = [...prev.ships];
        const s = { ...ships[0], colony: { ...ships[0].colony! } };
        payCost(s, s.colony, cost);
        // 金币支付记入金币日志（与其它扣款口径一致）
        if (cost.gold) {
          s.goldLog = [{ turn: prev.turn, amount: -cost.gold, reason: `领袖「${li.name}」升级至 Lv${li.level + 1}`, balanceAfter: s.gold }, ...s.goldLog].slice(0, GOLD_LOG_LIMIT);
        }
        s.colony!.leaders = s.colony!.leaders.map((l, i) => i === leaderIndex ? { ...l, level: l.level + 1 } : l);
        ships[0] = s; return { ...prev, ships };
      },
    });
    return { success: true, message: `「${li.name}」升至Lv${li.level+1}` };
  }, [dispatch, gameState]);

  /** 领袖招募：扣星尘+生成选项存入 colony.recruitPool */
  const rollAndRecruit = useCallback(() => {
    dispatch({
      type: 'FUNCTIONAL_UPDATE',
      updater: (prev) => {
        const ships = [...prev.ships]; const s = { ...ships[0] };
        if (!s.colony) return prev;
        if (s.colony.leaders.length >= s.colony.leaderCap) return prev;
        const rollCost = getRecruitRollCost(s.colony.leaders);
        if (s.stardust < rollCost) return prev;
        s.stardust -= rollCost;
        s.colony = { ...s.colony, recruitPool: rollLeaders(3, s.colony.leaders.map((l) => l.id)) };
        ships[0] = s; return { ...prev, ships };
      },
    });
  }, [dispatch]);

  /** 清空招募池 */
  const clearRecruitPool = useCallback(() => {
    dispatch({
      type: 'FUNCTIONAL_UPDATE',
      updater: (prev) => {
        if (!prev.ships[0].colony) return prev;
        const ships = [...prev.ships]; const s = { ...ships[0] };
        s.colony = { ...s.colony!, recruitPool: undefined };
        ships[0] = s; return { ...prev, ships };
      },
    });
  }, [dispatch]);

  return { recruitLeader, upgradeLeader, rollAndRecruit, clearRecruitPool };
}
