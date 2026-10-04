import { useCallback } from 'react';
import type { GameState } from '@/types/game';
import { RECIPES, GOLD_LOG_LIMIT } from '@/data/gameData';
import {
  getProductionLimitBonus, getProductionTurns, getProductSellUnitPrice,
  getProductExpiry, computeProductMaterialCost, getMaterialBuyCost,
} from '@/data/modules';
import { getMaterialName } from '@/data/materialNames';
import { createUid } from '@/lib/id';

export function useProduction(
  gameState: GameState,
  dispatch: React.Dispatch<{ type: 'FUNCTIONAL_UPDATE'; updater: (state: GameState) => GameState }>
) {
  // 原料购买
  // ⚠ 可同步判定的拦截一律放在 dispatch **之前**（照 useTrade.requireFactionHere 的写法）：
  //   历史上这里全部静默 `return prev` 且恒返回 null，而 MaterialMarket 以"返回 null = 成功"打印
  //   「成功购买…」，于是金币不足/原料不存在时玩家看到成功但什么都没发生（自检报告 🔴R4）。
  const buyMaterial = useCallback(
    (shipIndex: number, materialId: string, quantity: number): string | null => {
      if (quantity <= 0) return '数量必须大于0';
      const ship = gameState.ships[shipIndex];
      if (!ship) return '舰队不存在';
      const mat = gameState.materials.find((m) => m.id === materialId);
      if (!mat) return '原料不存在';
      const cost = getMaterialBuyCost(mat, quantity, ship);
      if (ship.gold < cost) return `金币不足（需要${cost.toLocaleString()}金币）`;

      dispatch({
        type: 'FUNCTIONAL_UPDATE',
        updater: (prev) => {
          const ships = [...prev.ships];
          const s = { ...ships[shipIndex] };
          const m = prev.materials.find((mm) => mm.id === materialId);
          if (!m) return prev;
          // 成本算式唯一真值（末尾一次 round，与面板显示/按钮置灰同源）
          const actualCost = getMaterialBuyCost(m, quantity, s);
          if (s.gold < actualCost) return prev;

          s.gold -= actualCost;
          s.goldLog = [{ turn: prev.turn, amount: -actualCost, reason: `购买原料「${m.name}」x${quantity}`, balanceAfter: s.gold }, ...s.goldLog].slice(0, GOLD_LOG_LIMIT);
          s.materials = { ...s.materials, [materialId]: (s.materials[materialId] || 0) + quantity };
          ships[shipIndex] = s;
          return { ...prev, ships };
        },
      });
      return null;
    },
    [gameState.ships, gameState.materials, dispatch]
  );

  // 开始生产（守卫同样前移：生产上限已满 / 原料不足都返回错误串，避免"界面说开始、实际没入队"）
  const startProduction = useCallback(
    (shipIndex: number, recipeId: string): string | null => {
      const ship0 = gameState.ships[shipIndex];
      if (!ship0) return '舰队不存在';
      const recipe0 = RECIPES.find((r) => r.id === recipeId);
      if (!recipe0) return '配方不存在';
      const maxProd0 = ship0.maxProductionsPerTurn + getProductionLimitBonus(ship0);
      if (ship0.productionsThisTurn >= maxProd0) return '本回合生产次数已用完，结束回合后可继续';
      for (const input of recipe0.inputs) {
        const have = ship0.materials[input.materialId] || 0;
        if (have < input.amount) return `原料不足（需要${input.amount}个${getMaterialName(input.materialId)}，当前${have}个）`;
      }

      dispatch({
        type: 'FUNCTIONAL_UPDATE',
        updater: (prev) => {
          const ships = [...prev.ships];
          const ship = { ...ships[shipIndex] };
          const maxProd = ship.maxProductionsPerTurn + getProductionLimitBonus(ship);
          if (ship.productionsThisTurn >= maxProd) return prev;
          const recipe = RECIPES.find((r) => r.id === recipeId);
          if (!recipe) return prev;
          for (const input of recipe.inputs) {
            if ((ship.materials[input.materialId] || 0) < input.amount) return prev;
          }

          ship.materials = { ...ship.materials };
          for (const input of recipe.inputs) ship.materials[input.materialId] -= input.amount;
          ship.productionsThisTurn += 1;
          // 原料成本快照（唯一真值：与队列完成路径 shipTurn 同源）
          const matCost = computeProductMaterialCost(recipe, prev.materials);
          const turns = getProductionTurns(recipe, ship);
          if (turns <= 0) {
            // 食物配方：立即完成时直接加食物
            if (recipe.foodYield) {
              ship.food += recipe.foodYield;
              if (ship.food >= 0 && ship.famineTimer > 0 && !ship.isRebellion) {
                ship.famineTimer = 0;
              }
            } else {
              // 保质期唯一真值（含应急储备舱加成）
              ship.products = [...ship.products, { productId: recipeId, expiresAt: getProductExpiry(prev.turn, ship.installedModuleIds), materialCost: matCost }];
            }
          } else {
            ship.productionQueue = [...ship.productionQueue, { id: createUid(recipeId), productId: recipeId, remainingTurns: turns, createTurn: prev.turn }];
          }
          ships[shipIndex] = ship;
          return { ...prev, ships };
        },
      });
      return null;
    },
    [gameState.ships, gameState.materials, dispatch]
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

          // 卖出单价唯一真值（与 ProductMarket 显示同源）
          const price = getProductSellUnitPrice(product.currentSellPrice, ship);
          ship.gold += price;
          if (ship.bankrupt && ship.gold > 0) ship.bankrupt = false;
          ship.goldLog = [{ turn: prev.turn, amount: price, reason: `出售产品「${product.name}」`, balanceAfter: ship.gold }, ...ship.goldLog].slice(0, GOLD_LOG_LIMIT);
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

          const unitPrice = getProductSellUnitPrice(product.currentSellPrice, ship);
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
          ship.goldLog = [{ turn: prev.turn, amount: unitPrice * sellCount, reason: `出售产品「${prodName}」x${sellCount}`, balanceAfter: ship.gold }, ...ship.goldLog].slice(0, GOLD_LOG_LIMIT);
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
