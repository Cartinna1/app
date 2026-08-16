import { useCallback } from 'react';
import type { GameState, Mothership } from '@/types/game';
import { FACTIONS, POLICY_EFFECTS, refreshFactionPrices } from '@/data/factions';

const SAVE_KEY = 'aviation_career_save';

/** 存档结构校验（防止损坏/恶意存档导致崩溃） */
function validateSaveData(data: unknown): data is Record<string, unknown> {
  if (!data || typeof data !== 'object' || Array.isArray(data)) return false;
  const d = data as Record<string, unknown>;
  // 必需字段存在性检查
  if (typeof d.turn !== 'number') return false;
  if (!Array.isArray(d.ships)) return false;
  return true;
}

export function useSave(
  dispatch: React.Dispatch<
    | { type: 'LOAD_SAVE'; state: GameState }
    | { type: 'RESET_GAME' }
    | { type: 'FUNCTIONAL_UPDATE'; updater: (state: GameState) => GameState }
  >
) {
  const autoSave = useCallback(() => {
    dispatch({
      type: 'FUNCTIONAL_UPDATE',
      updater: (prev) => {
        try {
          const saveData = {
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
          localStorage.setItem(SAVE_KEY, JSON.stringify(saveData));
        } catch { /* ignore */ }
        return prev;
      },
    });
  }, [dispatch]);

  const hasSave = useCallback(() => !!localStorage.getItem(SAVE_KEY), []);

  const loadSave = useCallback((): boolean => {
    const data = localStorage.getItem(SAVE_KEY);
    if (!data) return false;
    try {
      const saveData = JSON.parse(data);
      if (!validateSaveData(saveData)) return false;
      // 校验通过后安全类型转换
      const d = saveData as Record<string, any>;
      const state: GameState = {
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
        factionReputation: d.factionReputation || {},
        factionRepLog: {},
        factionContracts: d.factionContracts || [],
      };
      dispatch({ type: 'LOAD_SAVE', state });
      return true;
    } catch { return false; }
  }, [dispatch]);

  /**
   * 导出存档文件下载
   * 命名规则：YYYYMMDDHHMM + 舰队名称 + 回合数 + .json
   * 例：202607151633黄金舰队44.json
   */
  const exportSave = useCallback((ships: Mothership[], turn: number): boolean => {
    const data = localStorage.getItem(SAVE_KEY);
    if (!data) return false;

    try {
      const now = new Date();
      const timeStr = `${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, '0')}${String(now.getDate()).padStart(2, '0')}${String(now.getHours()).padStart(2, '0')}${String(now.getMinutes()).padStart(2, '0')}`;
      const shipName = ships[0]?.name || '舰队';
      const filename = `${timeStr}${shipName}${turn}.json`;

      const blob = new Blob([data], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
      return true;
    } catch { return false; }
  }, []);

  /**
   * 从文件导入存档
   */
  const importSave = useCallback((file: File): Promise<boolean> => {
    return new Promise((resolve) => {
      const reader = new FileReader();
      reader.onload = (e) => {
        try {
          const text = e.target?.result as string;
          const saveData = JSON.parse(text);
          if (!validateSaveData(saveData)) { resolve(false); return; }
          localStorage.setItem(SAVE_KEY, text);
          // 校验通过后安全类型转换
          const d = saveData as Record<string, any>;
          const state: GameState = {
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
            factionReputation: d.factionReputation || {},
            factionRepLog: {},
            factionContracts: d.factionContracts || [],
          };
          dispatch({ type: 'LOAD_SAVE', state });
          resolve(true);
        } catch { resolve(false); }
      };
      reader.onerror = () => resolve(false);
      reader.readAsText(file);
    });
  }, [dispatch]);

  const resetGame = useCallback(() => {
    localStorage.removeItem(SAVE_KEY);
        dispatch({ type: 'RESET_GAME' });
  }, [dispatch]);

  return { autoSave, hasSave, loadSave, exportSave, importSave, resetGame };
}
