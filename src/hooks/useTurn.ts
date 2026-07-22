import { useCallback } from 'react';
import type { GameState, Mothership, Stock, RawMaterial, Product } from '@/types/game';
import { RECIPES, MAT_MAX_UP, PRODUCT_PRICE_LIMITS } from '@/data/gameData';
import { FACTIONS, getInvestmentTier, getIncomeCap, rollPolicy, POLICY_EFFECTS, refreshFactionPrices, calculateSellMultipliers } from '@/data/factions';
import { rollRelic } from '@/data/relics';
import { rng } from '@/utils/prng';

// 板块列表（用于生成板块风气）
const SECTORS = ['能源', '科技', '军工', '生物', '医疗', '金融', '资源', '科研教育', '基建设施', '娱乐服务'];

// 供需影响计算（简化版：统计本回合净买入量）
function calculateDemandEffect(ships: Mothership[], stockId: string, currentTurn: number): number {
  const CIRCULATION_BASE = 100; // 虚拟基准流通量
  const DEMAND_COEFF = 0.02; // 每100股净买入推价2%

  let netBuy = 0;
  ships.forEach((ship) => {
    // 买入：如果本回合买入了这只股票
    const buyTurn = ship.stockBuyTurn[stockId];
    if (buyTurn === currentTurn) {
      netBuy += ship.stockHoldings[stockId] || 0;
    }
    // 卖出：如果本回合卖出了这只股票
    const sellTurn = ship.stockSellThisTurn?.[stockId];
    if (sellTurn === currentTurn) {
      netBuy -= ship.stockSellQtyThisTurn?.[stockId] || 0;
    }
  });

  return (netBuy / CIRCULATION_BASE) * DEMAND_COEFF;
}

// 纯函数：计算舰队总资产
export function getShipTotalAssets(ship: Mothership, stocks: Stock[], materials: RawMaterial[], products: Product[]): number {
  let total = ship.gold;
  const loanDebt = ship.loans.reduce((sum, l) => sum + (l.totalRepay - l.repaid), 0);
  total -= loanDebt;
  Object.entries(ship.stockHoldings).forEach(([stockId, count]) => {
    const stock = stocks.find((s) => s.id === stockId);
    if (stock && count > 0) total += stock.currentPrice * count;
  });
  Object.entries(ship.materials).forEach(([matId, count]) => {
    const mat = materials.find((m) => m.id === matId);
    if (mat && count > 0) total += mat.currentPrice * count;
  });
  const eventBonus = (ship.sellBonuses || []).reduce((sum, b) => sum + b.bonus, 0) / 100;
  const skillBonus = ship.sellPriceBonus || 0;
  ship.products.forEach((p) => {
    const product = products.find((pr) => pr.id === p.productId);
    if (product) total += product.currentSellPrice * (1 + eventBonus + skillBonus);
  });
  return Math.round(total);
}

export function useTurn(
  _gameState: GameState,
  dispatch: React.Dispatch<
    | { type: 'FUNCTIONAL_UPDATE'; updater: (state: GameState) => GameState }
    | { type: 'FLUCTUATE_PRICES'; stocks: Stock[]; materials: RawMaterial[]; products: Product[] }
  >,
  autoSave: () => void
) {
  // ==================== 情报兑现辅助函数 ====================
  // 解析股票情报字符串，返回 { name, direction(1=涨,-1=跌), magnitude }
  function parseStockTip(tip: string | undefined): { name: string; direction: number; magnitude: number } | null {
    if (!tip) return null;
    const match = tip.match(/「(.+?)」.+?可能(上涨|下跌)\s+(\d+)%/);
    if (!match) return null;
    return { name: match[1], direction: match[2] === '上涨' ? 1 : -1, magnitude: parseInt(match[3], 10) };
  }
  // 解析原料情报字符串
  function parseMatTip(tip: string | undefined): { name: string; direction: number; magnitude: number } | null {
    if (!tip) return null;
    const match = tip.match(/「(.+?)」下回合可能(上涨|下跌)\s+(\d+)%/);
    if (!match) return null;
    return { name: match[1], direction: match[2] === '上涨' ? 1 : -1, magnitude: parseInt(match[3], 10) };
  }

  // 价格波动 —— 四因子模型 + 情报兑现
  const fluctuatePrices = useCallback(() => {
    dispatch({
      type: 'FUNCTIONAL_UPDATE',
      updater: (prev) => {
        // 从舰船获取当前回合情报
        const ship = prev.ships[0];
        const stockTip = parseStockTip(ship?.stockTipThisTurn);
        const matTip = parseMatTip(ship?.matTipThisTurn);

        // 1. 先计算板块风气（每回合一次性生成，同板块共享）
        const sectorBiases: Record<string, number> = {};
        SECTORS.forEach((sector) => {
          sectorBiases[sector] = (rng() - 0.5) * 2 * 0.05; // ±5%
        });

        // 2. 股票波动（四因子：基础随机 + 均值回归 + 动量 + 板块联动 + 供需）
        const stocks = prev.stocks.map((s) => {
          const baseChange = (rng() - 0.5) * 2 * s.volatility;
          const deviation = (s.currentPrice - s.basePrice) / s.basePrice;
          const meanReversion = -deviation * 0.2; // 减弱回拉（旧0.4→新0.2）
          const lastChange = s.prices.length >= 2 ? (s.prices[s.prices.length - 1] - s.prices[s.prices.length - 2]) / s.prices[s.prices.length - 2] : 0;
          const momentum = lastChange * 0.25; // 加强趋势（旧0.15→新0.25）
          const sectorBias = sectorBiases[s.sector] || 0; // 板块联动
          const demandEffect = calculateDemandEffect(prev.ships, s.id, prev.turn); // 供需影响

          // 情报兑现：如果情报匹配该股票，施加定向偏移
          let intelEffect = 0;
          if (stockTip && s.name.includes(stockTip.name)) {
            // 情报兑现：偏移 = 方向 * 幅度% * 0.6（兑现60%的承诺，留一点随机性）
            intelEffect = stockTip.direction * (stockTip.magnitude / 100) * 0.6;
          }

          const totalChange = baseChange + meanReversion + momentum + sectorBias + demandEffect + intelEffect;
          // 价格保护：下限 basePrice*0.2，上限 basePrice*3.0
          const rawPrice = Math.round(s.currentPrice * (1 + totalChange));
          const newPrice = Math.max(Math.round(s.basePrice * 0.2), Math.min(Math.round(s.basePrice * 3.0), rawPrice));
          return { ...s, prices: [...s.prices, newPrice], currentPrice: newPrice };
        });

        // 3. 原料波动：每回合价格完全独立，直接基于基准价计算
        // 例：基准500，涨→随机147%→500×1.147=573.5；跌→随机10%→500×0.9=450
        const MAT_MAX_DOWN = 0.15;
        const materials = prev.materials.map((m) => {
          const base = m.basePrice;
          const maxUp = MAT_MAX_UP[m.id] || 2.0;

          let multiplier: number;
          if (rng() < 0.5) {
            // 50%概率跌：基准价 × (1 - 随机0%~15%)
            multiplier = 1 - rng() * MAT_MAX_DOWN;
          } else {
            // 50%概率涨：基准价 × (1 + 随机0%~maxUp%)
            multiplier = 1 + rng() * maxUp;
          }

          let newPrice = Math.round(base * multiplier);

          // 情报兑现：额外加/减基于基准价的固定金额
          if (matTip && m.name.includes(matTip.name)) {
            newPrice += Math.round(matTip.direction * base * (matTip.magnitude / 100) * 0.3);
          }

          // 上下限保护
          const upperLimit = Math.round(base * (1 + maxUp));
          const lowerLimit = Math.round(base * (1 - MAT_MAX_DOWN));
          newPrice = Math.max(lowerLimit, Math.min(upperLimit, newPrice));
          newPrice = Math.max(10, newPrice);
          return { ...m, prices: [...m.prices, newPrice], currentPrice: newPrice };
        });

        // 4. 产品波动：每回合价格完全独立，直接基于基准价计算
        // 例：基准1000，涨→随机20%→1000×1.2=1200；跌→随机15%→1000×0.85=850
        const products = prev.products.map((p) => {
          const base = p.baseSellPrice;
          const limits = PRODUCT_PRICE_LIMITS[p.id] || { maxUp: 0.20, maxDown: 0.15 };

          let multiplier: number;
          if (rng() < 0.5) {
            // 50%概率跌：基准价 × (1 - 随机0%~maxDown%)
            multiplier = 1 - rng() * limits.maxDown;
          } else {
            // 50%概率涨：基准价 × (1 + 随机0%~maxUp%)
            multiplier = 1 + rng() * limits.maxUp;
          }

          let newPrice = Math.round(base * multiplier);

          // 上下限保护
          const upperLimit = Math.round(base * (1 + limits.maxUp));
          const lowerLimit = Math.round(base * (1 - limits.maxDown));
          newPrice = Math.max(lowerLimit, Math.min(upperLimit, newPrice));
          newPrice = Math.max(10, newPrice);
          return { ...p, sellPrices: [...p.sellPrices, newPrice], currentSellPrice: newPrice };
        });

        return { ...prev, stocks, materials, products };
      },
    });
  }, [dispatch]);

  // 回合推进
  const nextTurn = useCallback(() => {
    dispatch({
      type: 'FUNCTIONAL_UPDATE',
      updater: (prev) => {
        const stocks = prev.stocks;
        const mats = prev.materials;
        const prods = prev.products;

        const ships = prev.ships.map((ship) => {
          const s = { ...ship };

          // 重置每回合状态
          s.productionsThisTurn = 0;
          s.eventTriggeredThisTurn = false;
          s.eventProcessedThisTurn = false;
          // 探索每回合限一次，结果展示字段清除
          // intelGatheredInFaction 不清除！必须跃迁到新地方才能再次打探
          s.tradeStatus = { ...s.tradeStatus, exploredThisTurn: false, lastExploreResult: undefined };
          // 清除卖出记录（供需影响只持续一回合）
          s.stockSellThisTurn = {};
          s.stockSellQtyThisTurn = {};

          // ==================== 母舰装置每回合效果 ====================
          const hasModule = (id: string) => s.installedModuleIds.includes(id);

          // 1. 生物合成厨房：每回合 +15 食物
          if (hasModule('bio_kitchen')) s.food += 15;

          // 1b. 纳米机器人农场：每回合 +30 食物
          if (hasModule('nano_farm')) s.food += 30;

          // 1c. 六维奇点农场：每回合 +60 食物
          if (hasModule('sixth_farm')) s.food += 60;

          // 2. 深空采矿阵列：每回合 +10 随机基础原料
          if (hasModule('mining_array')) {
            const basicMats = ['carbon', 'gold_ore', 'oil', 'silicon'];
            const picked = basicMats[Math.floor(rng() * basicMats.length)];
            s.materials = { ...s.materials, [picked]: (s.materials[picked] || 0) + 10 };
          }

          // 4. 戴森粒子收集器：每回合 +3 星尘
          if (hasModule('dyson_collector')) s.stardust += 3;

          // 5. 永恒合金核心：每回合 +5 合金
          if (hasModule('eternal_core')) s.alloy += 5;

          // 6. 手动装置冷却倒计时
          s.modules = s.modules.map((m) => m.cooldown > 0 ? { ...m, cooldown: m.cooldown - 1 } : m);

          // 联盟倒计时
          if (s.allianceRounds && s.allianceRounds > 0) s.allianceRounds -= 1;

          // 产品售价加成倒计时（每个加成独立计算）
          if (s.sellBonuses && s.sellBonuses.length > 0) {
            s.sellBonuses = s.sellBonuses
              .map((b) => ({ ...b, remainingTurns: b.remainingTurns - 1 }))
              .filter((b) => b.remainingTurns > 0);
          }

          // ==================== 饥荒buff + 破产辅助函数 ====================
          const famineHalve = (goldAmount: number): number => {
            if (goldAmount <= 0) return goldAmount;
            if (s.food < 0) return Math.floor(goldAmount * 0.5);
            return goldAmount;
          };
          const checkBankrupt = () => {
            if (s.gold < 0 && !s.bankrupt) { s.bankrupt = true; s.bankruptTimer = 10; }
          };

          // ==================== 食物消耗（船员维持）- 允许变负数 ====================
          const foodPreserve = s.relics.some((r) => r.id === 'r_007') ? 0.5 : 0;
          const t = prev.turn;
          let foodCost: number;
          if (t <= 5) foodCost = 1;
          else if (t <= 10) foodCost = 3;
          else if (t <= 15) foodCost = 7;
          else if (t <= 20) foodCost = 15;
          else if (t <= 25) foodCost = 23;
          else if (t <= 30) foodCost = 26;
          else foodCost = t;
          const finalFoodCost = Math.floor(foodCost * (1 - foodPreserve));
          s.food -= finalFoodCost;
          // 食物刚变负数 → 触发饥荒
          if (s.food < 0 && s.famineTimer === 0 && !s.isRebellion) {
            s.famineTimer = 10;
          }

          // 万众一心股息（ship.id === 0）- 饥荒减半
          if (s.id === 0) {
            const div = famineHalve(Math.floor(getShipTotalAssets(s, stocks, mats, prods) * 0.01));
            if (div > 0) {
              s.gold += div;
              checkBankrupt();
              s.goldLog = [{ turn: prev.turn, amount: div, reason: "万众一心股息", balanceAfter: s.gold }, ...s.goldLog].slice(0, 200);
            }
          }

          // 奇点探求者原料（ship.id === 4）
          if (s.id === 4) {
            const matIds = ['carbon', 'gold_ore', 'oil', 'dark_matter', 'silicon', 'quantum'];
            const pickedMat = matIds[Math.floor(rng() * matIds.length)];
            const amount = Math.floor(rng() * 3) + 2;
            s.materials = { ...s.materials };
            s.materials[pickedMat] = (s.materials[pickedMat] || 0) + amount;
          }

          // 遗物 r_001/100001：奥得律斯基亚水晶——每回合3个随机原料
          if (s.relics.some((r) => r.id === '100001' || r.id === 'r_001')) {
            const matIds = ['carbon', 'gold_ore', 'oil', 'dark_matter', 'silicon', 'quantum'];
            s.materials = { ...s.materials };
            for (let i = 0; i < 3; i++) {
              const picked = matIds[Math.floor(rng() * matIds.length)];
              s.materials[picked] = (s.materials[picked] || 0) + 1;
            }
          }

          // 遗物 r_002/100002：誊录仪——每回合+1%总资产金币
          if (s.relics.some((r) => r.id === '100002' || r.id === 'r_002')) {
            const assets = getShipTotalAssets(s, stocks, mats, prods);
            const bonus = famineHalve(Math.max(0, Math.floor(assets * 0.01)));
            if (bonus > 0) {
              s.gold += bonus;
              checkBankrupt();
              s.goldLog = [{ turn: prev.turn, amount: bonus, reason: "遗物「誊录仪」收益", balanceAfter: s.gold }, ...s.goldLog].slice(0, 200);
            }
          }

          // 新遗物：星灵共鸣石——每回合+2星尘
          if (s.relics.some((r) => r.id === 'r_006')) s.stardust += 2;

          // 新遗物：克隆培养皿——每回合+5食物
          if (s.relics.some((r) => r.id === 'r_012')) {
            s.food += 5;
            if (s.food >= 0 && s.famineTimer > 0 && !s.isRebellion) {
              s.famineTimer = 0; // 食物回正解除饥荒
            }
          }

          // 新遗物：招财猫摆件——每回合+200金币
          if (s.relics.some((r) => r.id === 'r_013')) {
            const catBonus = famineHalve(200);
            s.gold += catBonus;
            checkBankrupt();
            s.goldLog = [{ turn: prev.turn, amount: catBonus, reason: "遗物「招财猫」收益", balanceAfter: s.gold }, ...s.goldLog].slice(0, 200);
          }

          // 情报提示延续
          if (s.nextTurnStockTip) { s.stockTipThisTurn = s.nextTurnStockTip; s.nextTurnStockTip = undefined; }
          else { s.stockTipThisTurn = undefined; }
          if (s.nextTurnMatTip) { s.matTipThisTurn = s.nextTurnMatTip; s.nextTurnMatTip = undefined; }
          else { s.matTipThisTurn = undefined; }

          // ==================== 破产/饥荒/叛乱倒计时处理 ====================
          // 破产倒计时
          if (s.bankrupt && s.bankruptTimer > 0) {
            s.bankruptTimer -= 1;
            if (s.gold >= 0) { s.bankrupt = false; s.bankruptTimer = 0; }
          }
          // 饥荒倒计时
          if (s.famineTimer > 0) {
            s.famineTimer -= 1;
            if (s.food >= 0) { s.famineTimer = 0; s.isRebellion = false; }
            else if (s.famineTimer <= 0 && !s.isRebellion) {
              s.isRebellion = true; s.famineTimer = 10;
            } else if (s.famineTimer <= 0 && s.isRebellion) {
              s.famineTimer = 0;
            }
          }

          // 推进生产队列
          s.productionQueue = s.productionQueue.map((t) => ({ ...t, remainingTurns: t.remainingTurns - 1 }));
          const completed = s.productionQueue.filter((t) => t.remainingTurns <= 0);
          s.productionQueue = s.productionQueue.filter((t) => t.remainingTurns > 0);
          s.products = [...s.products];
          completed.forEach((task) => {
            const recipe = RECIPES.find((r) => r.id === task.productId);
            const mCost = recipe ? recipe.inputs.reduce((sum, inp) => { const m = mats.find((mm) => mm.id === inp.materialId); return sum + (m ? m.currentPrice * inp.amount : 0); }, 0) : 0;
            s.products.push({ productId: task.productId, expiresAt: prev.turn + 3, materialCost: mCost });
          });
          s.products = s.products.filter((p) => p.expiresAt > prev.turn);

          // 星际贸易：跃迁倒计时
          s.tradeStatus = { ...s.tradeStatus };
          if (s.tradeStatus.travelTurnsRemaining > 0) {
            s.tradeStatus.travelTurnsRemaining -= 1;
            if (s.tradeStatus.travelTurnsRemaining <= 0 && s.tradeStatus.targetFactionId) {
              s.tradeStatus.currentFactionId = s.tradeStatus.targetFactionId;
              s.tradeStatus.targetFactionId = null;
              s.tradeStatus.intelGatheredInFaction = null;
              s.tradeStatus.lastIntelResult = undefined;
            }
          }

          // 投资收益
          for (const [fid, fs] of Object.entries(s.tradeStatus.factionStates)) {
            if (fs.invested <= 0) continue;
            const tier = getInvestmentTier(fs.invested);
            const incomeCap = getIncomeCap(tier);
            if (incomeCap > 0) {
              const income = famineHalve(Math.floor(rng() * incomeCap) + 1);
              s.gold += income;
              checkBankrupt();
              const factionName = FACTIONS.find((f) => f.id === fid)?.name || '未知';
              s.goldLog = [{ turn: prev.turn, amount: income, reason: `「${factionName}」投资收益`, balanceAfter: s.gold }, ...s.goldLog].slice(0, 200);
            }
          }

          // 贷款还款：到期一次性还清（金币允许变负）
          if (s.loans.length > 0) {
            s.loans = s.loans.map((l) => {
              if (l.remainingTurns <= 0) return l;
              return { ...l, remainingTurns: l.remainingTurns - 1 };
            });
            const dueLoans = s.loans.filter((l) => l.remainingTurns <= 0);
            if (dueLoans.length > 0) {
              const totalDue = dueLoans.reduce((sum, l) => sum + l.totalRepay, 0);
              s.gold -= totalDue;
              s.goldLog = [{ turn: prev.turn, amount: -totalDue, reason: "贷款到期扣款", balanceAfter: s.gold }, ...s.goldLog].slice(0, 200);
              s.loans = s.loans.filter((l) => l.remainingTurns > 0);
              if (s.gold < 0 && !s.bankrupt) { s.bankrupt = true; s.bankruptTimer = 10; }
            }
          }

          // 金币回正解除破产
          if (s.bankrupt && s.gold >= 0) {
            s.bankrupt = false;
            s.bankruptTimer = 0;
          }

          return s;
        });

        // 更新贸易政策
        let newPolicyType = prev.factionPolicy.type;
        let newPolicyEffect = prev.factionPolicy.effect;
        let remaining = prev.policyRemainingTurns - 1;
        if (remaining <= 0) {
          newPolicyType = rollPolicy();
          newPolicyEffect = POLICY_EFFECTS[newPolicyType];
          remaining = Math.floor(rng() * 3) + 3;
        }

        const newPrices = refreshFactionPrices();
        const currentFid = ships[0]?.tradeStatus?.currentFactionId || FACTIONS[0].id;
        const sellMultipliers = calculateSellMultipliers(currentFid, { type: newPolicyType, effect: newPolicyEffect }, rng);

        // 星尘集市：每回合刷新一个遗物
        const newRelic = rollRelic(prev.stardustMarket.soldRelicIds);

        // ==================== 游戏结束检测 ====================
        const ship0 = ships[0];
        const gameOverReason = ship0
          ? (ship0.bankrupt && ship0.bankruptTimer <= 0 && ship0.gold < 0)
            ? '你的舰队因资不抵债而解散……'
            : (ship0.isRebellion && ship0.famineTimer <= 0 && ship0.food < 0)
              ? '饥饿的船员发动了叛乱，你失去了对舰队的控制……'
              : null
          : null;

        if (gameOverReason) {
          return { ...prev, ships, phase: 'ended' as const, eventLog: [{ turn: prev.turn, event: '游戏结束', detail: gameOverReason }, ...prev.eventLog] };
        }

        return {
          ...prev,
          ships,
          turn: prev.turn + 1,
          factionPrices: newPrices,
          factionSellMultipliers: sellMultipliers,
          factionPolicy: { type: newPolicyType, effect: newPolicyEffect },
          policyRemainingTurns: remaining,
          stardustMarket: {
            ...prev.stardustMarket,
            currentRelicId: newRelic ? newRelic.id : null,
          },
        };
      },
    });

    fluctuatePrices();
    setTimeout(() => autoSave(), 100);
  }, [dispatch, fluctuatePrices, autoSave]);

  return { nextTurn, fluctuatePrices };
}
