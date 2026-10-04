// ==================== 势力/市场回合刷新（纯逻辑，从 useTurn 抽离） ====================
// computeFactionTurn：贸易政策轮换、势力价格/出售倍率、黑市倍率、
// 市场库存/需求刷新、买卖 buff 清理、星尘集市遗物刷新。
// applyPassiveIncome：声望被动收入结算（直接改写 ships[0] 草稿）。

import type { GameState, Mothership } from '@/types/game';
import { FACTIONS, rollPolicy, POLICY_EFFECTS, refreshFactionPrices, calculateSellMultipliers, getReputationTier } from '@/data/factions';
import { rollRelic } from '@/data/relics';
import { GOLD_LOG_LIMIT } from '@/data/gameData';
import { BLACK_MARKET_DEFAULT, BLACK_MARKET_SPREAD } from '@/data/exchangeRates';
import { famineHalveGold } from './shipTurn';

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

/** 单条买卖 buff 的剩余回合（与结算口径一致：结算保留 `expiresTurn >= 下一回合` 的 buff，
 *  故剩余回合 = expiresTurn − 当前回合）。唯一真值：贸易面板各处显示与"快到期"高亮共用。 */
export function getBuffRemainingTurns(buff: { expiresTurn: number }, turn: number): number {
  return Math.max(0, buff.expiresTurn - turn);
}

/** 一组买卖 buff 的连乘倍率（唯一真值：结算（买/卖/黑市）与贸易面板显示共用，勿再各写 reduce）。 */
export function getBuffMultiplier(list: { multiplier: number }[] | undefined): number {
  return (list || []).reduce((m, b) => m * b.multiplier, 1);
}

/** 市场库存/需求区间（**唯一真值**：开局 SELECT_SHIP 与每回合刷新共用同一套）。
 *  历史上开局是 800~1200 / 900~1500、每回合是 500~800 / 500~700 两套区间（无任何说明，
 *  已确认为遗留），现统一为较小的一套（500~800 / 500~700），两处都调下面两个函数。 */
function rollRange(min: number, max: number): number {
  return min + Math.floor(Math.random() * (max - min + 1));
}
/** 本回合某势力的特产可买库存（500~800） */
export function rollMarketBuyStock(): number {
  return rollRange(500, 800);
}
/** 本回合某势力的特产收购需求（500~700） */
export function rollMarketSellDemand(): number {
  return rollRange(500, 700);
}

/** 汇总某势力的买卖 buff：合并倍率（连乘）与整体剩余回合（取最晚到期的那条）；
 *  没有 buff 返回 null。用于势力列表里的「买价 ×2.50（剩 12 回合）」徽章。 */
export function summarizeBuffs(
  list: { multiplier: number; expiresTurn: number }[] | undefined,
  turn: number
): { multiplier: number; turnsLeft: number } | null {
  if (!list || list.length === 0) return null;
  const multiplier = getBuffMultiplier(list);
  const turnsLeft = Math.max(...list.map((b) => getBuffRemainingTurns(b, turn)));
  return { multiplier, turnsLeft };
}

/** 剩余回合 ≤3 → 即将到期（UI 用琥珀色高亮） */
export function isBuffExpiringSoon(turnsLeft: number): boolean {
  return turnsLeft <= 3;
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
  // 黑市倍率：每回合随机（基准值与浮动区间走 data/exchangeRates 唯一真值，保留 1 位小数）
  const blackMarketMultiplier = Math.round((BLACK_MARKET_DEFAULT + Math.random() * BLACK_MARKET_SPREAD) * 10) / 10;

  // 市场库存/需求：每回合刷新
  const buyStocks: Record<string, number> = {};
  const buyStockMax: Record<string, number> = {};
  const sellDemands: Record<string, number> = {};
  const sellDemandMax: Record<string, number> = {};
  for (const f of FACTIONS) {
    const bs = rollMarketBuyStock();
    const sd = rollMarketSellDemand();
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

/** 声望被动收入结算：直接改写 ships[0] 草稿（金币 + 流水）。
 *  与其它金币收益同口径：**饥荒（食物<0）时减半**——尊崇档每回合 3500~4500 金币，
 *  不减半等于给出一条绕开饥荒惩罚的稳定管道（历史上这里漏了 famineHalveGold）。 */
export function applyPassiveIncome(prev: GameState, ships: Mothership[]): void {
  const rep = { ...prev.factionReputation };
  for (const [fid, r] of Object.entries(rep)) {
    const tier = getReputationTier(r);
    if (!tier || tier.passiveIncomeMax <= 0) continue;
    const raw = Math.floor(Math.random() * (tier.passiveIncomeMax - tier.passiveIncomeMin + 1)) + tier.passiveIncomeMin;

    if (ships[0]) {
      const income = famineHalveGold(ships[0].food, raw);
      if (income <= 0) continue;
      const factionName = FACTIONS.find((f) => f.id === fid)?.name || fid;
      ships[0].gold += income; ships[0].goldLog = [{ turn: prev.turn, amount: income, reason: `「${factionName}」声望被动收入`, balanceAfter: ships[0].gold }, ...ships[0].goldLog].slice(0, GOLD_LOG_LIMIT);
    }
  }
}
