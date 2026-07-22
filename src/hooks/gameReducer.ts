import type { GameState, GameAction, Mothership } from '@/types/game';
import { FACTIONS, POLICY_EFFECTS, refreshFactionPrices, calculateSellMultipliers } from '@/data/factions';
import { createMotherships, createStocks, createMaterials, createProducts } from '@/data/gameData';
import { setSeed, rng } from '@/utils/prng';

// ==================== 初始状态 ====================

export const initialGameState: GameState = {
  phase: 'select',
  turn: 1,
  currentShipIndex: 0,
  seed: '',
  ships: [],
  stocks: [],
  materials: [],
  products: [],
  eventLog: [],
  redeemedCodes: [],
  factions: FACTIONS,
  factionPrices: {},
  factionSellMultipliers: {},
  factionPolicy: { type: 'normal', effect: POLICY_EFFECTS['normal'] },
  policyRemainingTurns: 0,
  stardustMarket: { currentRelicId: null, soldRelicIds: [] },
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
      return {
        ...state,
        phase: 'playing',
        turn: 1,
        seed: '',
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
          rng
        ),
        factionPolicy: { type: 'normal', effect: POLICY_EFFECTS['normal'] },
        policyRemainingTurns: 0,
        stardustMarket: { currentRelicId: null, soldRelicIds: [] },
      };
    }

    case 'FUNCTIONAL_UPDATE': {
      const newState = action.updater(state);
      return newState === state ? state : newState;
    }

    case 'FLUCTUATE_PRICES':
      return { ...state, stocks: action.stocks, materials: action.materials, products: action.products };

    case 'LOAD_SAVE': {
      if (action.state.seed) setSeed(action.state.seed);
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
