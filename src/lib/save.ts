// ==================== 存档序列化 / 反序列化 / 迁移 ====================
// 存档字段清单的唯一维护点：GameState 新增需要持久化的字段时，只改 buildSaveData / stateFromSave。
// 旧存档兼容补丁集中在 migrateSave（由 gameReducer 的 LOAD_SAVE 统一调用）。

import type { GameState, SaveData, Mothership } from '@/types/game';
import { FACTIONS, POLICY_EFFECTS, refreshFactionPrices } from '@/data/factions';

export const SAVE_KEY = 'aviation_career_save';
export const SAVE_VERSION = 1;

/** 存档结构校验（防止损坏/恶意存档导致崩溃） */
export function validateSaveData(data: unknown): data is Record<string, unknown> {
  if (!data || typeof data !== 'object' || Array.isArray(data)) return false;
  const d = data as Record<string, unknown>;
  // 必需字段存在性检查
  if (typeof d.turn !== 'number') return false;
  if (!Array.isArray(d.ships)) return false;
  return true;
}

/** 从运行时状态提取存档字段（唯一字段清单） */
export function buildSaveData(prev: GameState): SaveData {
  return {
    saveVersion: SAVE_VERSION,
    ships: prev.ships,
    stocks: prev.stocks,
    materials: prev.materials,
    products: prev.products,
    turn: prev.turn,
    currentShipIndex: prev.currentShipIndex,
    eventLog: prev.eventLog,
    redeemedCodes: prev.redeemedCodes,
    factions: prev.factions,
    factionPrices: prev.factionPrices,
    factionSellMultipliers: prev.factionSellMultipliers,
    blackMarketMultiplier: prev.blackMarketMultiplier,
    buyStocks: prev.buyStocks,
    buyStockMax: prev.buyStockMax,
    sellDemands: prev.sellDemands,
    sellDemandMax: prev.sellDemandMax,
    buyTriggered: prev.buyTriggered,
    sellTriggered: prev.sellTriggered,
    buyBuffs: prev.buyBuffs,
    sellBuffs: prev.sellBuffs,
    factionPolicy: prev.factionPolicy,
    policyRemainingTurns: prev.policyRemainingTurns,
    stardustMarket: prev.stardustMarket,
    gameWon: prev.gameWon,
    wonWonderName: prev.wonWonderName,
    factionReputation: prev.factionReputation,
    factionContracts: prev.factionContracts,
  };
}

/** 旧投资迁移：每5000金币投资→+1声望，每势力上限+15 */
function reputationFromLegacyInvestments(ships: Mothership[] | undefined): Record<string, number> {
  const rep: Record<string, number> = {};
  const factionStates = ships?.[0]?.tradeStatus?.factionStates;
  if (factionStates) {
    for (const [fid, fs] of Object.entries(factionStates)) {
      rep[fid] = Math.min(15, Math.floor((fs.invested || 0) / 5000));
    }
  }
  return rep;
}

/** 存档 JSON → GameState（缺失字段用默认值兜底） */
export function stateFromSave(d: Record<string, any>): GameState {
  return {
    phase: 'playing',
    turn: d.turn || 1,
    currentShipIndex: d.currentShipIndex || 0,
    ships: d.ships || [],
    stocks: d.stocks || [],
    materials: d.materials || [],
    products: d.products || [],
    eventLog: d.eventLog || [],
    redeemedCodes: d.redeemedCodes || [],
    factions: d.factions || FACTIONS,
    factionPrices: d.factionPrices || refreshFactionPrices(),
    factionSellMultipliers: d.factionSellMultipliers || {},
    blackMarketMultiplier: d.blackMarketMultiplier || 3.2,
    buyStocks: d.buyStocks || {},
    buyStockMax: d.buyStockMax || {},
    sellDemands: d.sellDemands || {},
    sellDemandMax: d.sellDemandMax || {},
    buyTriggered: d.buyTriggered || {},
    sellTriggered: d.sellTriggered || {},
    buyBuffs: d.buyBuffs || {},
    sellBuffs: d.sellBuffs || {},
    factionPolicy: d.factionPolicy || { type: 'normal', effect: POLICY_EFFECTS['normal'] },
    policyRemainingTurns: d.policyRemainingTurns || 0,
    stardustMarket: d.stardustMarket || { currentRelicId: null, soldRelicIds: [] },
    gameWon: d.gameWon || false,
    wonWonderName: d.wonWonderName || '',
    // 旧存档无声望字段时从投资记录迁移（原逻辑在 reducer 里，因 useSave 预填 {} 从未生效，此处修复）
    factionReputation: d.factionReputation || reputationFromLegacyInvestments(d.ships),
    factionRepLog: {},
    factionContracts: d.factionContracts || [],
  };
}

/** 旧存档兼容补丁（由 gameReducer 的 LOAD_SAVE 统一调用） */
export function migrateSave(loaded: GameState): GameState {
  if (!loaded.stardustMarket) {
    loaded.stardustMarket = { currentRelicId: null, soldRelicIds: [] };
  }
  // 兼容旧存档：补充破产/饥荒/叛乱字段
  if (loaded.ships) {
    loaded.ships = loaded.ships.map((s: Mothership) => ({
      ...s,
      bankruptTimer: s.bankruptTimer || 0,
      famineTimer: s.famineTimer || 0,
      isRebellion: s.isRebellion || false,
      colony: s.colony ? {
        ...s.colony,
        recruitedThisTurn: s.colony.recruitedThisTurn || 0,
        expeditionEndings: s.colony.expeditionEndings || {},
        expeditionUnlocks: s.colony.expeditionUnlocks || [],
      } : s.colony,
    }));
  }
  // 兼容旧存档：声望/合同字段
  if (!loaded.factionReputation) loaded.factionReputation = {};
  if (!loaded.factionRepLog) loaded.factionRepLog = {};
  if (!loaded.factionContracts) loaded.factionContracts = [];
  // 兼容旧存档：黑市倍率字段
  if (!loaded.blackMarketMultiplier) loaded.blackMarketMultiplier = 3.2;
  // 兼容旧存档：市场库存/需求/buff 字段
  if (!loaded.buyStocks) loaded.buyStocks = {};
  if (!loaded.buyStockMax) loaded.buyStockMax = {};
  if (!loaded.sellDemands) loaded.sellDemands = {};
  if (!loaded.sellDemandMax) loaded.sellDemandMax = {};
  if (!loaded.buyTriggered) loaded.buyTriggered = {};
  if (!loaded.sellTriggered) loaded.sellTriggered = {};
  if (!loaded.buyBuffs) loaded.buyBuffs = {};
  if (!loaded.sellBuffs) loaded.sellBuffs = {};
  return loaded;
}
