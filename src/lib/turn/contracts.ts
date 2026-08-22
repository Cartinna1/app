// ==================== 势力合同生成（纯逻辑，从 useTurn 抽离） ====================

import type { GameState, FactionContract } from '@/types/game';
import { RECIPES } from '@/data/gameData';
import { RELATION_MATRIX } from '@/data/factions';

/** 合同生成：清理过期合同并按势力补充新合同，返回新列表 */
export function generateContracts(prev: GameState): FactionContract[] {
  const factionContracts = [...(prev.factionContracts || [])];
  // 过期清理
  const alive = factionContracts.filter((c) => c.accepted ? c.expiresTurn >= prev.turn : true);
  // 清理未接取的过期合同
  const kept = alive.filter((c) => c.accepted || c.expiresTurn >= prev.turn);
  // 每势力生成新合同
  const contractFactions = new Set(kept.map((c) => c.factionId));
  for (const f of prev.factions) {
    const count = kept.filter((c) => c.factionId === f.id && !c.accepted).length;
    if (count >= 3) continue;
    if (Math.random() < 0.35 && !contractFactions.has(f.id)) {
      const types: Array<'procurement' | 'smuggling'> = ['procurement', 'procurement', 'smuggling'];
      const type = types[Math.floor(Math.random() * types.length)];
      if (type === 'procurement') {
        const recipes = RECIPES.filter((r) => !r.foodYield);
        const recipe = recipes[Math.floor(Math.random() * recipes.length)];
        const qty = Math.floor(Math.random() * 4) + 2; // 2-5
        const tier = Math.min(5, Math.max(0, recipe.productionTurns - 1));
        // 金币为每件报酬，rewardGold = 每件 × qty，约 1.2-1.3 倍单件材料成本，与直接售价相当
        const rewards = [
          [5, 8, 900, 1400],        // 1回合（单件成本约400-1100）
          [8, 12, 1300, 2000],      // 2回合（单件成本约800-2000）
          [10, 15, 2200, 3200],     // 3回合（单件成本约1600-2350）
          [12, 18, 18000, 24000],   // 4回合（单件成本约15000）
          [14, 22, 24000, 32000],   // 5回合（单件成本约20000）
          [16, 26, 30000, 40000],   // 6回合（单件成本约25000）
        ][tier];
        const perUnitGold = Math.floor(Math.random() * (rewards[3] - rewards[2] + 1)) + rewards[2];
        const rewardGold = perUnitGold * qty;
        const rewardRep = Math.floor(Math.random() * (rewards[1] - rewards[0] + 1)) + rewards[0];
        // 可接取窗口：生成后 5-8 回合内可接取，接取后再独立计算完成期限
        const expires = prev.turn + 5 + Math.floor(Math.random() * 4);
        kept.push({ id: `c_${prev.turn}_${f.id}_${kept.length}`, factionId: f.id, type: 'procurement', accepted: false, targetItemId: recipe.id, targetQty: qty, rewardGold, rewardRep, expiresTurn: expires, blackMarketUsed: false });
      } else {
        const rel = RELATION_MATRIX[f.id];
        if (!rel || !rel.enemies.length) continue;
        const enemyId = rel.enemies[Math.floor(Math.random() * rel.enemies.length)];
        if (enemyId === 'f07') continue;
        const qty = Math.floor(Math.random() * 6) + 5; // 5-10
        const rewardRep = Math.floor(Math.random() * 6) + 20; // 20-25
        // 可接取窗口：生成后 5-8 回合内可接取，接取后再独立计算完成期限
        const expires = prev.turn + 5 + Math.floor(Math.random() * 4);
        kept.push({ id: `c_${prev.turn}_${f.id}_${kept.length}`, factionId: f.id, type: 'smuggling', accepted: false, targetItemId: enemyId, targetQty: qty, rewardGold: 0, rewardRep, expiresTurn: expires, blackMarketUsed: false });
      }
    }
  }
  return kept;
}
