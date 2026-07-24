import { useCallback } from 'react';
import type { GameState } from '@/types/game';
import { RECIPES } from '@/data/gameData';

export function useProduction(
  _gameState: GameState,
  dispatch: React.Dispatch<{ type: 'FUNCTIONAL_UPDATE'; updater: (state: GameState) => GameState }>
) {
  // 原料购买
  const buyMaterial = useCallback(
    (shipIndex: number, materialId: string, quantity: number): string | null => {
      if (quantity <= 0) return '数量必须大于0';

      dispatch({
        type: 'FUNCTIONAL_UPDATE',
        updater: (prev) => {
          const ships = [...prev.ships];
          const ship = { ...ships[shipIndex] };
          if (ship.gold <= 0) return prev; // 金币不足无法买入
          
          const mat = prev.materials.find((m) => m.id === materialId);
          if (!mat) return prev;

          const relicDiscount = ship.relics.some((r) => r.id === '100004' || r.id === 'r_004') ? 0.1 : 0;
          const tradeHubDiscount = ship.installedModuleIds.includes('trade_hub') ? 0.08 : 0;
          const cost = Math.round(mat.currentPrice * quantity * (1 - ship.materialPriceDiscount - relicDiscount - tradeHubDiscount));
          if (ship.gold < cost) return prev;

          ship.gold -= cost;
          ship.goldLog = [{ turn: prev.turn, amount: -cost, reason: `购买原料「${mat.name}」x${quantity}`, balanceAfter: ship.gold }, ...ship.goldLog].slice(0, 200);
          ship.materials = { ...ship.materials, [materialId]: (ship.materials[materialId] || 0) + quantity };
          ships[shipIndex] = ship;
          return { ...prev, ships };
        },
      });
      return null;
    },
    [dispatch]
  );

  // 开始生产
  const startProduction = useCallback(
    (shipIndex: number, recipeId: string): string | null => {
      dispatch({
        type: 'FUNCTIONAL_UPDATE',
        updater: (prev) => {
          const ships = [...prev.ships];
          const ship = { ...ships[shipIndex] };
          const hasTimeFold = ship.installedModuleIds.includes('time_fold_engine');
          const maxProd = ship.maxProductionsPerTurn + (ship.relics.some((r) => r.id === '100003' || r.id === 'r_003') ? 2 : 0) + (hasTimeFold ? 3 : 0);
          if (ship.productionsThisTurn >= maxProd) return prev;
          const recipe = RECIPES.find((r) => r.id === recipeId);
          if (!recipe) return prev;
          for (const input of recipe.inputs) {
            if ((ship.materials[input.materialId] || 0) < input.amount) return prev;
          }

          ship.materials = { ...ship.materials };
          for (const input of recipe.inputs) ship.materials[input.materialId] -= input.amount;
          ship.productionsThisTurn += 1;
          const matCost = recipe.inputs.reduce((sum, inp) => {
            const m = prev.materials.find((mm) => mm.id === inp.materialId);
            return sum + (m ? m.currentPrice * inp.amount : 0);
          }, 0);
          const engineerAiBonus = ship.installedModuleIds.includes('engineer_ai') ? 1 : 0;
          const turns = Math.max(0, recipe.productionTurns - ship.productionSpeedBonus - engineerAiBonus);
          if (turns <= 0) {
            // 食物配方：立即完成时直接加食物
            if (recipe.foodYield) {
              ship.food += recipe.foodYield;
              if (ship.food >= 0 && ship.famineTimer > 0 && !ship.isRebellion) {
                ship.famineTimer = 0;
              }
            } else {
              const expiryBonus = ship.installedModuleIds.includes('reserve_bay') ? 3 : 0;
              ship.products = [...ship.products, { productId: recipeId, expiresAt: prev.turn + 3 + expiryBonus, materialCost: matCost }];
            }
          } else {
            ship.productionQueue = [...ship.productionQueue, { id: `${recipeId}_${Date.now()}_${Math.random()}`, productId: recipeId, remainingTurns: turns, createTurn: prev.turn }];
          }
          ships[shipIndex] = ship;
          return { ...prev, ships };
        },
      });
      return null;
    },
    [dispatch]
  );

  // 出售单个产品
  const sellProduct = useCallback(
    (shipIndex: number, productIndex: number): string | null => {
      dispatch({
        type: 'FUNCTIONAL_UPDATE',
        updater: (prev) => {
          const ships = [...prev.ships];
          const ship = { ...ships[shipIndex] };
          if (productIndex < 0 || productIndex >= ship.products.length) return prev;
          const item = ship.products[productIndex];
          const product = prev.products.find((p) => p.id === item.productId);
          if (!product) return prev;

          const eventBonus = (ship.sellBonuses || []).reduce((sum, b) => sum + b.bonus, 0) / 100;
          const skillBonus = ship.sellPriceBonus || 0;
          const bonus = eventBonus + skillBonus;
          const allianceBonus = ship.allianceRounds && ship.allianceRounds > 0 ? 0.15 : 0;
          const price = Math.round(product.currentSellPrice * (1 + bonus + allianceBonus));
          ship.gold += price;
          if (ship.bankrupt && ship.gold > 0) ship.bankrupt = false;
          ship.goldLog = [{ turn: prev.turn, amount: price, reason: `出售产品「${product.name}」`, balanceAfter: ship.gold }, ...ship.goldLog].slice(0, 200);
          ship.products = [...ship.products];
          ship.products.splice(productIndex, 1);
          ships[shipIndex] = ship;
          return { ...prev, ships };
        },
      });
      return null;
    },
    [dispatch]
  );

  // 批量出售产品
  const sellProductQty = useCallback(
    (shipIndex: number, productId: string, qty?: number) => {
      let result: { totalRevenue: number; count: number; avgMatCost: number; unitPrice: number } | null = null;
      dispatch({
        type: 'FUNCTIONAL_UPDATE',
        updater: (prev) => {
          const ships = [...prev.ships];
          const ship = { ...ships[shipIndex] };
          const product = prev.products.find((p) => p.id === productId);
          if (!product) return prev;

          const eventBonus = (ship.sellBonuses || []).reduce((sum, b) => sum + b.bonus, 0) / 100;
          const skillBonus = ship.sellPriceBonus || 0;
          const bonus = eventBonus + skillBonus;
          const allianceBonus = ship.allianceRounds && ship.allianceRounds > 0 ? 0.15 : 0;
          const unitPrice = Math.round(product.currentSellPrice * (1 + bonus + allianceBonus));
          const matching: { idx: number; item: typeof ship.products[0] }[] = [];
          ship.products.forEach((p, idx) => { if (p.productId === productId) matching.push({ idx, item: p }); });
          matching.sort((a, b) => a.item.expiresAt - b.item.expiresAt);
          if (matching.length === 0) return prev;

          const sellCount = qty === undefined ? matching.length : Math.min(qty, matching.length);
          const toSellIndices = new Set(matching.slice(0, sellCount).map((m) => m.idx));
          const totalMatCost = matching.filter((m) => toSellIndices.has(m.idx)).reduce((sum, m) => sum + (m.item.materialCost || 0), 0);
          ship.gold += unitPrice * sellCount;
          if (ship.bankrupt && ship.gold > 0) ship.bankrupt = false;
          const prodName = prev.products.find((p) => p.id === productId)?.name || productId;
          ship.goldLog = [{ turn: prev.turn, amount: unitPrice * sellCount, reason: `出售产品「${prodName}」x${sellCount}`, balanceAfter: ship.gold }, ...ship.goldLog].slice(0, 200);
          ship.products = ship.products.filter((_, idx) => !toSellIndices.has(idx));
          result = { totalRevenue: unitPrice * sellCount, count: sellCount, avgMatCost: sellCount > 0 ? totalMatCost / sellCount : 0, unitPrice };
          ships[shipIndex] = ship;
          return { ...prev, ships };
        },
      });
      return result;
    },
    [dispatch]
  );

  return { buyMaterial, startProduction, sellProduct, sellProductQty };
}
