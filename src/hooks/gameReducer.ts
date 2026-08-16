import type { GameState, GameAction, Mothership } from '@/types/game';
import { FACTIONS, POLICY_EFFECTS, refreshFactionPrices, calculateSellMultipliers } from '@/data/factions';
import { createMotherships, createStocks, createMaterials, createProducts } from '@/data/gameData';

// ==================== 初始状态 ====================

export const initialGameState: GameState = {
  phase: 'select',
  turn: 1,
  currentShipIndex: 0,
    ships: [],
  stocks: [],
  materials: [],
  products: [],
  eventLog: [],
  redeemedCodes: [],
  factions: FACTIONS,
  factionPrices: {},
  factionSellMultipliers: {},
  blackMarketMultiplier: 3.2,
  buyStocks: {},
  buyStockMax: {},
  sellDemands: {},
  sellDemandMax: {},
  buyTriggered: {},
  sellTriggered: {},
  buyBuffs: {},
  sellBuffs: {},
  factionPolicy: { type: 'normal', effect: POLICY_EFFECTS['normal'] },
  policyRemainingTurns: 0,
  stardustMarket: { currentRelicId: null, soldRelicIds: [] },
  gameWon: false,
  wonWonderName: '',
  factionReputation: {},
  factionRepLog: {},
  factionContracts: [],
};

// ==================== Reducer ====================

export function gameReducer(state: GameState, action: GameAction): GameState {
  switch (action.type) {
    case 'SELECT_SHIP': {
      const allShips = createMotherships();
      const myShip = allShips.find((s) => s.id === action.shipId);
      if (!myShip) return state;
      const stocks = createStocks();
      const materials = createMaterials();
      const products = createProducts();
      // 初始化市场库存/需求（第1回合即可交易）
      const buyStocks: Record<string, number> = {};
      const buyStockMax: Record<string, number> = {};
      const sellDemands: Record<string, number> = {};
      const sellDemandMax: Record<string, number> = {};
      for (const f of FACTIONS) {
        const bs = 800 + Math.floor(Math.random() * 401); // 800~1200
        const sd = 900 + Math.floor(Math.random() * 601); // 900~1500
        buyStocks[f.id] = bs;
        buyStockMax[f.id] = bs;
        sellDemands[f.id] = sd;
        sellDemandMax[f.id] = sd;
      }
      return {
        ...state,
        phase: 'playing',
        turn: 1,
                ships: [myShip],
        stocks,
        materials,
        products,
        eventLog: [],
        redeemedCodes: [],
        factions: FACTIONS,
        factionPrices: refreshFactionPrices(),
        factionSellMultipliers: calculateSellMultipliers(
          myShip.tradeStatus.currentFactionId,
          { type: 'normal', effect: POLICY_EFFECTS['normal'] },
                  ),
        blackMarketMultiplier: 3.2,
        buyStocks,
        buyStockMax,
        sellDemands,
        sellDemandMax,
        buyTriggered: {},
        sellTriggered: {},
        buyBuffs: {},
        sellBuffs: {},
        factionPolicy: { type: 'normal', effect: POLICY_EFFECTS['normal'] },
        policyRemainingTurns: 0,
stardustMarket: { currentRelicId: null, soldRelicIds: [] },
  factionReputation: {},
  factionRepLog: {},
  factionContracts: [],
};
    }

    case 'FUNCTIONAL_UPDATE': {
      const newState = action.updater(state);
      return newState === state ? state : newState;
    }

    case 'FLUCTUATE_PRICES':
      return { ...state, stocks: action.stocks, materials: action.materials, products: action.products };

    case 'LOAD_SAVE': {
      const loaded = action.state as GameState;
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
        }));
      }
      // 兼容旧存档：声望/合同字段
      if (!loaded.factionReputation) {
        loaded.factionReputation = {};
        // 旧投资迁移：每5000金币投资→+1声望，每势力上限+15
        if (loaded.ships?.[0]?.tradeStatus?.factionStates) {
          for (const [fid, fs] of Object.entries(loaded.ships[0].tradeStatus.factionStates)) {
            loaded.factionReputation[fid] = Math.min(15, Math.floor((fs.invested || 0) / 5000));
          }
        }
      }
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

    case 'RESET_GAME':
      return { ...initialGameState };

    case 'ADD_EVENT_LOG':
      return { ...state, eventLog: [action.entry, ...state.eventLog].slice(0, 100) };

    default:
      return state;
  }
}
