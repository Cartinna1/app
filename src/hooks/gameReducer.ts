import type { GameState, GameAction } from '@/types/game';
import { FACTIONS, POLICY_EFFECTS, refreshFactionPrices, calculateSellMultipliers } from '@/data/factions';
import { createMotherships, createStocks, createMaterials, createProducts, EVENT_LOG_LIMIT } from '@/data/gameData';
import { BLACK_MARKET_DEFAULT } from '@/data/exchangeRates';
import { rollMarketBuyStock, rollMarketSellDemand } from '@/lib/turn/factionTurn';
import { createUid } from '@/lib/id';
import { migrateSave } from '@/lib/save';
import { getCurrentFactionId } from '@/lib/galaxy/access';

// ==================== 初始状态（单一真值：新开局/重置/选船共用，勿另抄一份） ====================

export function createInitialGameState(): GameState {
  return {
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
    blackMarketMultiplier: BLACK_MARKET_DEFAULT,
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
}

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
      // 区间与每回合刷新**共用同一套**（唯一真值：factionTurn.rollMarketBuyStock/rollMarketSellDemand）。
      // 历史上开局写的是 800~1200 / 900~1500、每回合是 500~800 / 500~700 两套区间（已确认为遗留）。
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
      return {
        ...createInitialGameState(),
        phase: 'playing',
        ships: [myShip],
        stocks,
        materials,
        products,
        factionPrices: refreshFactionPrices(),
        factionSellMultipliers: calculateSellMultipliers(
          getCurrentFactionId(myShip) || FACTIONS[0].id,
          { type: 'normal', effect: POLICY_EFFECTS['normal'] },
        ),
        buyStocks,
        buyStockMax,
        sellDemands,
        sellDemandMax,
      };
    }

    case 'FUNCTIONAL_UPDATE': {
      const newState = action.updater(state);
      return newState === state ? state : newState;
    }

    case 'LOAD_SAVE':
      // 旧存档兼容补丁集中在 lib/save.ts 的 migrateSave
      return migrateSave(action.state);

    case 'RESET_GAME':
      return createInitialGameState();

    case 'ADD_EVENT_LOG': {
      // 为每条日志注入稳定唯一 id（写入时统一生成），供列表渲染作 key，
      // 避免 eventLog 从头部 unshift 时用 index 作 key 导致的错位复用。
      const entry = action.entry.id
        ? action.entry
        : { ...action.entry, id: createUid('log') };
      return { ...state, eventLog: [entry, ...state.eventLog].slice(0, EVENT_LOG_LIMIT) };
    }

    default:
      return state;
  }
}
