// ==================== 存档序列化 / 反序列化 / 迁移 ====================
// 存档字段清单的唯一维护点：GameState 新增需要持久化的字段时，只改 buildSaveData / stateFromSave。
// 旧存档兼容补丁集中在 migrateSave（由 gameReducer 的 LOAD_SAVE 统一调用）。

import type { GameState, SaveData, Mothership } from '@/types/game';
import { FACTIONS, POLICY_EFFECTS, refreshFactionPrices } from '@/data/factions';
import { createGalaxyState } from '@/data/galaxy/nodes';
import { BLACK_MARKET_DEFAULT } from '@/data/exchangeRates';

export const SAVE_KEY = 'aviation_career_save';
/** 音乐静音开关的 localStorage key（与存档同处声明，避免组件里写裸字符串） */
export const BGM_MUTED_KEY = 'bgm_muted';
/** 2：位置与跃迁迁入 ship.galaxy（星图）；旧档不做星图进度迁移，只补一份全新星图 */
export const SAVE_VERSION = 2;

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
    ships: (d.ships || []).map((s: Mothership) => ({
      ...s,
      // galaxy 归一化：先铺一份**完整**默认星图（保留已到达的节点），再覆盖存档里实际存在的字段。
      // 只兜「galaxy 整键缺失」是不够的：老档/改档可能 galaxy 存在却缺 visitedNodes/permaBonuses/titles，
      // 而 shipTurn（到达即探明）与 archaeologyTurn（写称号）是裸读 → 读档即 TypeError 白屏。
      galaxy: {
        ...createGalaxyState(s.galaxy?.currentNodeId),
        ...(s.galaxy || {}),
        archaeology: s.galaxy?.archaeology || {},
      },
      // 旧投资系统已退役（投资 = 8000 金币 → +1 声望，回报走 REPUTATION_TIERS 被动收入）：
      // 旧的 factionStates.invested 在上面的声望迁移里已一次性折算，这里**清零**，
      // 使 shipTurn 不再有"投资收益/档位6补给"这条永不可达的分支（自检报告 🔴R6）。
      tradeStatus: { ...s.tradeStatus, factionStates: {} },
    })),
    stocks: d.stocks || [],
    materials: d.materials || [],
    products: d.products || [],
    eventLog: d.eventLog || [],
    redeemedCodes: d.redeemedCodes || [],
    factions: d.factions || FACTIONS,
    factionPrices: d.factionPrices || refreshFactionPrices(),
    factionSellMultipliers: d.factionSellMultipliers || {},
    blackMarketMultiplier: d.blackMarketMultiplier || BLACK_MARKET_DEFAULT,
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

/** 旧存档兼容补丁（由 gameReducer 的 LOAD_SAVE 统一调用）。
 *  ⚠ 职责分工：**字段级默认值一律由 stateFromSave 负责**（它是唯一兜底点，LOAD_SAVE 的两个入口
 *  都先过它），本函数只做「结构/语义改写」——旧字段缺失的补写在这里属于死代码（判空永不成立）。 */
export function migrateSave(loaded: GameState): GameState {
  // 兼容旧存档：补充破产/饥荒/叛乱字段（这几个字段不在 stateFromSave 的清单里，故仍需在此兜底）
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
        // 图鉴的阶段图集与降落图格只收录走过的；旧档没有该字段时，用**进行中那一轮**的 history 回填
        // （history 非空说明已降落过，故补一个 'planet'；已收尾的旧轮次没有 history，只能从本次更新后重新累计）
        expeditionVisited: s.colony.expeditionVisited
          || (s.colony.expedition
            ? { [s.colony.expedition.leaderId]: [...((s.colony.expedition.history || []).length ? ['planet'] : []), ...(s.colony.expedition.history || [])] }
            : {}),
        expeditionUnlocks: s.colony.expeditionUnlocks || [],
        blackoutGuardTurns: s.colony.blackoutGuardTurns || 0,
        // v2：殖民地不再有 selecting 阶段（星球在星图上确定）。
        // 旧档若停在 selecting，退回建设期并在下一回合按随机星球建成。
        ...((s.colony.phase as string) === 'selecting'
          ? {
              phase: 'scouting' as const,
              scoutTurnsRemaining: 1,
              planetType: s.colony.planetType || 'terran' as const,
            }
          : {}),
      } : s.colony,
    }));
  }
  return loaded;
}
