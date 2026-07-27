import { useReducer, useCallback } from 'react';
import type { Mothership, GameState } from '@/types/game';
import { gameReducer, initialGameState } from './gameReducer';
import { useStock } from './useStock';
import { useProduction } from './useProduction';
import { useEvent } from './useEvent';
import { useLoan } from './useLoan';
import { useTrade } from './useTrade';
import { useSave } from './useSave';
import { useTurn } from './useTurn';
import { useRedeem } from './useRedeem';
import { useModule } from './useModule';
import { useColony } from './useColony';
import { getRelicById } from '@/data/relics';
import { rollPolicy, POLICY_EFFECTS } from '@/data/factions';

/**
 * 游戏主 Hook —— 整合所有子 Hook，对外保持接口兼容
 * 
 * 架构：
 * - useReducer 管理 gameState（dispatch 引用稳定，减少不必要的函数重建）
 * - 各业务 Hook（useStock/useProduction/useEvent/useLoan/useTrade/useSave/useTurn/useRedeem）
 *   接收 dispatch，通过 FUNCTIONAL_UPDATE action 更新状态
 * - getShipTotalAssets 是纯函数，不触发任何更新
 */

export function useGameState() {
  const [gameState, dispatch] = useReducer(gameReducer, initialGameState);

  // 子 Hook（dispatch 引用稳定，不会导致函数重建）
  const { buyStock, sellStock } = useStock(gameState, dispatch);
  const { buyMaterial, startProduction, sellProduct, sellProductQty } = useProduction(gameState, dispatch);
  const { activeEvent, eventDodged, drawEvent, chooseOption: chooseEventOption, applyResources: applyEventResources, clearActiveEvent, clearDodged: clearEventDodged } = useEvent(gameState, dispatch);
  const { takeLoan, repayLoan } = useLoan(gameState, dispatch);
  const { travelToFaction, buySpecialty, sellSpecialty, exploreFaction, investFaction, gatherIntel } = useTrade(gameState, dispatch);
  const { autoSave, hasSave, loadSave, exportSave, importSave, resetGame } = useSave(dispatch);
  const { redeemCode } = useRedeem(gameState, dispatch);
  const { installModule, useManualModule } = useModule(gameState, dispatch);
  const { unlockColony, selectPlanet, rescrollPlanets, generateScoutingPool, buildColonyBuilding, recruitPop, assignPop, startResearch, recruitLeader, upgradeLeader, rollAndRecruit,
    clearRecruitPool, clearRecruitPool } = useColony(gameState, dispatch);
  const { nextTurn, fluctuatePrices } = useTurn(gameState, dispatch, autoSave);

  // 初始化游戏（选择单舰队）
  const selectShips = useCallback(
    (shipId: number) => {
      dispatch({ type: 'SELECT_SHIP', shipId });
    },
    []
  );

  // 从星尘集市购买遗物
  // 合金购买
  const buyAlloy = useCallback(
    (type: 'gold' | 'stardust', qty: number): boolean => {
      const ship = gameState.ships[0];
      if (!ship) return false;
      if (type === 'gold') {
        const cost = 1200 * qty;
        if (ship.gold < cost) return false;
        dispatch({
          type: 'FUNCTIONAL_UPDATE',
          updater: (prev) => {
            const ships = [...prev.ships];
            const s = { ...ships[0] };
            s.gold -= cost;
            s.alloy += qty;
            s.goldLog = [{ turn: prev.turn, amount: -cost, reason: `购买合金x${qty}`, balanceAfter: s.gold }, ...s.goldLog].slice(0, 200);
            ships[0] = s;
            return { ...prev, ships };
          },
        });
      } else {
        if (ship.stardust < qty) return false;
        dispatch({
          type: 'FUNCTIONAL_UPDATE',
          updater: (prev) => {
            const ships = [...prev.ships];
            const s = { ...ships[0] };
            s.stardust -= qty;
            s.alloy += qty * 5;
            ships[0] = s;
            return { ...prev, ships };
          },
        });
      }
      return true;
    },
    [gameState, dispatch]
  );

  // 食物购买
  const buyFood = useCallback(
    (type: 'gold' | 'alloy', qty: number): boolean => {
      const ship = gameState.ships[0];
      if (!ship) return false;
      if (type === 'gold') {
        const cost = 800 * qty;
        if (ship.gold < cost) return false;
        dispatch({
          type: 'FUNCTIONAL_UPDATE',
          updater: (prev) => {
            const ships = [...prev.ships];
            const s = { ...ships[0] };
            s.gold -= cost;
            s.food += qty;
            s.goldLog = [{ turn: prev.turn, amount: -cost, reason: `购买食物x${qty}`, balanceAfter: s.gold }, ...s.goldLog].slice(0, 200);
            ships[0] = s;
            return { ...prev, ships };
          },
        });
      } else {
        if (ship.alloy < qty) return false;
        dispatch({
          type: 'FUNCTIONAL_UPDATE',
          updater: (prev) => {
            const ships = [...prev.ships];
            const s = { ...ships[0] };
            s.alloy -= qty;
            s.food += qty * 2;
            ships[0] = s;
            return { ...prev, ships };
          },
        });
      }
      return true;
    },
    [gameState, dispatch]
  );

  const buyRelic = useCallback(
    (relicId: string): { success: boolean; message: string } => {
      const relic = getRelicById(relicId);
      if (!relic) return { success: false, message: '遗物不存在' };
      const ship = gameState.ships[0];
      if (!ship) return { success: false, message: '舰队不存在' };
      if (ship.stardust < relic.stardustCost) return { success: false, message: `星尘不足，需要 ${relic.stardustCost} 星尘` };
      if (ship.relics.some((r) => r.id === relicId)) return { success: false, message: '已拥有该遗物' };

      let result = { success: false, message: '' };
      dispatch({
        type: 'FUNCTIONAL_UPDATE',
        updater: (prev: GameState) => {
          const ships = [...prev.ships];
          const s = { ...ships[0] };
          s.stardust -= relic.stardustCost;
          s.relics = [...s.relics, { id: relic.id, name: relic.name, description: relic.description, effect: relic.effect, stardustCost: relic.stardustCost }];
          ships[0] = s;
          result = { success: true, message: `获得遗物「${relic.name}」！${relic.effect}` };
          return {
            ...prev,
            ships,
            stardustMarket: { ...prev.stardustMarket, soldRelicIds: [...prev.stardustMarket.soldRelicIds, relicId], currentRelicId: null },
          };
        },
      });
      return result;
    },
    [gameState.ships, dispatch]
  );

  // 星尘购买随机原料（2星尘→10个随机原料）
  const buyRandomMats = useCallback(
    (): { success: boolean; message: string } => {
      const ship = gameState.ships[0];
      if (!ship) return { success: false, message: '舰队不存在' };
      if (ship.stardust < 2) return { success: false, message: '星尘不足（需要2星尘）' };
      const matIds = ['carbon', 'gold_ore', 'oil', 'dark_matter', 'silicon', 'quantum'];
      const matNames: Record<string, string> = { carbon: '碳块', gold_ore: '黄金', oil: '石油', dark_matter: '暗物质', silicon: '硅片', quantum: '量子簇' };
      let result = { success: false, message: '' };
      dispatch({
        type: 'FUNCTIONAL_UPDATE',
        updater: (prev) => {
          const ships = [...prev.ships];
          const s = { ...ships[0] };
          s.stardust -= 2;
          s.materials = { ...s.materials };
          const drops: string[] = [];
          for (let i = 0; i < 10; i++) {
            const mat = matIds[Math.floor(Math.random() * matIds.length)];
            s.materials[mat] = (s.materials[mat] || 0) + 1;
            drops.push(matNames[mat]);
          }
          result = { success: true, message: `获得原料：${[...new Set(drops)].map((m) => `${m}×${drops.filter((d) => d === m).length}`).join('、')}` };
          ships[0] = s;
          return { ...prev, ships };
        },
      });
      return result;
    },
    [gameState.ships, dispatch]
  );

  // 星尘购买产品售价加成（5回合）
  const buySellBonus = useCallback(
    (turns: number, bonus: number, stardustCost: number): { success: boolean; message: string } => {
      const ship = gameState.ships[0];
      if (!ship) return { success: false, message: '舰队不存在' };
      if (ship.stardust < stardustCost) return { success: false, message: `星尘不足（需要${stardustCost}星尘）` };
      let result = { success: false, message: '' };
      dispatch({
        type: 'FUNCTIONAL_UPDATE',
        updater: (prev) => {
          const ships = [...prev.ships];
          const s = { ...ships[0] };
          s.stardust -= stardustCost;
          s.sellBonuses = [...(s.sellBonuses || []), { bonus, remainingTurns: turns, source: '星尘集市' }];
          result = { success: true, message: `产品售价+${bonus}%，持续${turns}回合！` };
          ships[0] = s;
          return { ...prev, ships };
        },
      });
      return result;
    },
    [gameState.ships, dispatch]
  );

  // 星尘兑换金币（1星尘→5000金币）
  const buyGoldWithStardust = useCallback(
    (): { success: boolean; message: string } => {
      const ship = gameState.ships[0];
      if (!ship) return { success: false, message: '舰队不存在' };
      if (ship.stardust < 1) return { success: false, message: '星尘不足（需要1星尘）' };
      let result = { success: false, message: '' };
      dispatch({
        type: 'FUNCTIONAL_UPDATE',
        updater: (prev) => {
          const ships = [...prev.ships];
          const s = { ...ships[0] };
          s.stardust -= 1;
          s.gold += 5000;
          if (s.bankrupt && s.gold > 0) s.bankrupt = false;
          s.goldLog = [{ turn: prev.turn, amount: 5000, reason: '星尘集市兑换金币', balanceAfter: s.gold }, ...s.goldLog].slice(0, 200);
          result = { success: true, message: '兑换成功，获得5000金币！' };
          ships[0] = s;
          return { ...prev, ships };
        },
      });
      return result;
    },
    [gameState.ships, dispatch]
  );

  // 星尘强制刷新贸易政策
  const rerollPolicy = useCallback(
    (): { success: boolean; message: string } => {
      const ship = gameState.ships[0];
      if (!ship) return { success: false, message: '舰队不存在' };
      if (ship.stardust < 1) return { success: false, message: '星尘不足（需要1星尘）' };
      let result = { success: false, message: '' };
      dispatch({
        type: 'FUNCTIONAL_UPDATE',
        updater: (prev) => {
          const ships = [...prev.ships];
          const s = { ...ships[0] };
          s.stardust -= 1;
          const newType = rollPolicy();
          const newEffect = POLICY_EFFECTS[newType];
          const newRemaining = Math.floor(Math.random() * 3) + 3;
          result = { success: true, message: `已强制刷新贸易政策！当前：「${newEffect.name}」（持续${newRemaining}回合）` };
          ships[0] = s;
          return {
            ...prev,
            ships,
            factionPolicy: { type: newType, effect: newEffect },
            policyRemainingTurns: newRemaining,
          };
        },
      });
      return result;
    },
    [gameState.ships, dispatch]
  );

  // 星尘购买食物（1星尘→20食物）
  const buyFoodWithStardust = useCallback(
    (qty: number): { success: boolean; message: string } => {
      const ship = gameState.ships[0];
      if (!ship) return { success: false, message: '舰队不存在' };
      if (ship.stardust < qty) return { success: false, message: `星尘不足（需要${qty}星尘）` };
      let result = { success: false, message: '' };
      dispatch({
        type: 'FUNCTIONAL_UPDATE',
        updater: (prev) => {
          const ships = [...prev.ships];
          const s = { ...ships[0] };
          s.stardust -= qty;
          s.food += qty * 20;
          if (s.food >= 0 && s.famineTimer > 0 && !s.isRebellion) s.famineTimer = 0;
          result = { success: true, message: `花费${qty}星尘购买了${qty * 20}个食物` };
          ships[0] = s;
          return { ...prev, ships };
        },
      });
      return result;
    },
    [gameState.ships, dispatch]
  );

  // 纯函数：计算总资产（不触发更新，按需计算）
  const getShipTotalAssets = useCallback(
    (ship: Mothership): number => {
      let total = ship.gold;
      const loanDebt = ship.loans.reduce((sum, l) => sum + (l.totalRepay - l.repaid), 0);
      total -= loanDebt;
      gameState.stocks.forEach((stock) => {
        const count = ship.stockHoldings[stock.id] || 0;
        if (count > 0) total += stock.currentPrice * count;
      });
      gameState.materials.forEach((mat) => {
        const count = ship.materials[mat.id] || 0;
        if (count > 0) total += mat.currentPrice * count;
      });
      gameState.products.forEach((product) => {
        const hasProduct = ship.products.some((p) => p.productId === product.id);
        if (hasProduct) {
          const qty = ship.products.filter((p) => p.productId === product.id).length;
          const totalBonus = (ship.sellBonuses || []).reduce((sum, b) => sum + b.bonus, 0);
          total += product.currentSellPrice * qty * (1 + totalBonus / 100);
        }
      });
      return Math.round(total);
    },
    [gameState.stocks, gameState.materials, gameState.products]
  );

  return {
    // 状态
    gameState,
    activeEvent,

    // 初始化
    selectShips,

    // 股票
    buyStock,
    sellStock,

    // 原料与生产
    buyMaterial,
    startProduction,
    sellProduct,
    sellProductQty,

    // 回合
    nextTurn,
    fluctuatePrices,

    // 事件
    eventDodged,
    drawEvent,
    chooseEventOption,
    applyEventResources,
    clearActiveEvent,
    clearEventDodged,

    // 贷款
    takeLoan,
    repayLoan,

    // 贸易
    travelToFaction,
    buySpecialty,
    sellSpecialty,
    exploreFaction,
    investFaction,
    gatherIntel,

    // 合金购买
    buyAlloy,

    // 食物购买
    buyFood,

    // 星尘集市
    buyRelic,
    buyRandomMats,
    buySellBonus,
    buyGoldWithStardust,
    rerollPolicy,
    buyFoodWithStardust,

    // 兑换码
    redeemCode,

    // 母舰改造
    installModule,
    useManualModule,

    // 星际殖民
    unlockColony,
    selectPlanet,
    rescrollPlanets,
    generateScoutingPool,
    buildColonyBuilding,
    recruitPop,
    assignPop,
    startResearch,
    recruitLeader,
    upgradeLeader,
    rollAndRecruit,
    clearRecruitPool,

    // 存档
    autoSave,
    hasSave,
    loadSave,
    exportSave,
    importSave,
    resetGame,

    // 计算
    getShipTotalAssets,
  };
}

// 重新导出 getShipTotalAssets 纯函数（供组件外部使用）
export { getShipTotalAssets } from './useTurn';
