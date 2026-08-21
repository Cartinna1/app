// ==================== 势力/市场回合刷新（纯逻辑，从 useTurn 抽离） ====================
// computeFactionTurn：贸易政策轮换、势力价格/出售倍率、黑市倍率、
// 市场库存/需求刷新、买卖 buff 清理、星尘集市遗物刷新。
// applyPassiveIncome：声望被动收入结算（直接改写 ships[0] 草稿）。

import type { GameState, Mothership } from '@/types/game';
import { FACTIONS, rollPolicy, POLICY_EFFECTS, refreshFactionPrices, calculateSellMultipliers, getReputationTier } from '@/data/factions';
import { rollRelic } from '@/data/relics';

export interface FactionTurnResult {
  factionPolicy: GameState['factionPolicy'];
  policyRemainingTurns: number;
  factionPrices: GameState['factionPrices'];
  factionSellMultipliers: GameState['factionSellMultipliers'];
  blackMarketMultiplier: number;
  buyStocks: Record<string, number>;
  buyStockMax: Record<string, number>;
  sellDemands: Record<string, number>;
  sellDemandMax: Record<string, number>;
  buyBuffs: GameState['buyBuffs'];
  sellBuffs: GameState['sellBuffs'];
  stardustMarket: GameState['stardustMarket'];
}

/** 势力/市场层面的每回合刷新；currentFid 取结算后 ships[0] 的所在势力 */
export function computeFactionTurn(prev: GameState, currentFid: string): FactionTurnResult {
  // 更新贸易政策
  let newPolicyType = prev.factionPolicy.type;
  let newPolicyEffect = prev.factionPolicy.effect;
  let remaining = prev.policyRemainingTurns - 1;
  if (remaining <= 0) {
    newPolicyType = rollPolicy();
    newPolicyEffect = POLICY_EFFECTS[newPolicyType];
    remaining = Math.floor(Math.random() * 3) + 3;
  }

  const newPrices = refreshFactionPrices();
  const sellMultipliers = calculateSellMultipliers(currentFid, { type: newPolicyType, effect: newPolicyEffect });
  // 黑市倍率：每回合随机 3.2~4.5（保留1位小数）
  const blackMarketMultiplier = Math.round((3.2 + Math.random() * 1.3) * 10) / 10;

  // 市场库存/需求：每回合刷新
  const buyStocks: Record<string, number> = {};
  const buyStockMax: Record<string, number> = {};
  const sellDemands: Record<string, number> = {};
  const sellDemandMax: Record<string, number> = {};
  for (const f of FACTIONS) {
    const bs = 500 + Math.floor(Math.random() * 301); // 500~800
    const sd = 500 + Math.floor(Math.random() * 201); // 500~700
    buyStocks[f.id] = bs;
    buyStockMax[f.id] = bs;
    sellDemands[f.id] = sd;
    sellDemandMax[f.id] = sd;
  }
  // 清理过期 buff（新回合 prev.turn+1 已过期的移除）
  const nextTurn = prev.turn + 1;
  const buyBuffs: Record<string, { multiplier: number; expiresTurn: number }[]> = {};
  for (const [fid, list] of Object.entries(prev.buyBuffs || {})) {
    const alive = list.filter((b) => b.expiresTurn >= nextTurn);
    if (alive.length) buyBuffs[fid] = alive;
  }
  const sellBuffs: Record<string, { multiplier: number; expiresTurn: number }[]> = {};
  for (const [fid, list] of Object.entries(prev.sellBuffs || {})) {
    const alive = list.filter((b) => b.expiresTurn >= nextTurn);
    if (alive.length) sellBuffs[fid] = alive;
  }

  // 星尘集市：每回合刷新一个遗物
  const newRelic = rollRelic(prev.stardustMarket.soldRelicIds);

  return {
    factionPolicy: { type: newPolicyType, effect: newPolicyEffect },
    policyRemainingTurns: remaining,
    factionPrices: newPrices,
    factionSellMultipliers: sellMultipliers,
    blackMarketMultiplier,
    buyStocks,
    buyStockMax,
    sellDemands,
    sellDemandMax,
    buyBuffs,
    sellBuffs,
    stardustMarket: {
      ...prev.stardustMarket,
      currentRelicId: newRelic ? newRelic.id : null,
    },
  };
}

/** 声望被动收入结算：直接改写 ships[0] 草稿（金币 + 流水） */
export function applyPassiveIncome(prev: GameState, ships: Mothership[]): void {
  const rep = { ...prev.factionReputation };
  for (const [fid, r] of Object.entries(rep)) {
    const tier = getReputationTier(r);
    if (!tier || tier.passiveIncomeMax <= 0) continue;
    const income = Math.floor(Math.random() * (tier.passiveIncomeMax - tier.passiveIncomeMin + 1)) + tier.passiveIncomeMin;

    if (ships[0]) {
      const factionName = FACTIONS.find((f) => f.id === fid)?.name || fid;
      ships[0].gold += income; ships[0].goldLog = [{ turn: prev.turn, amount: income, reason: `「${factionName}」声望被动收入`, balanceAfter: ships[0].gold }, ...ships[0].goldLog].slice(0, 200);
    }
  }
}
