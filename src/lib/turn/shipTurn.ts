// ==================== 单舰船回合推进（纯逻辑，从 useTurn 抽离） ====================
// processShipTurn 负责装置效果、食物消耗、破产/饥荒倒计时、生产队列、
// 跃迁、投资收益、贷款还款等所有"每艘母舰"级别的回合结算。

import type { Mothership, Stock, RawMaterial, Product } from '@/types/game';
import { RECIPES, MOTHERSHIP_ID_UNITY, MOTHERSHIP_ID_SINGULARITY_SEEKER } from '@/data/gameData';
import { FACTIONS, getInvestmentTier, getIncomeCap } from '@/data/factions';
import { getShipTotalAssets } from '@/lib/game/assets';
import {
  RELIC_CRYSTAL, RELIC_TRANSCRIBER, RELIC_RESONANCE_STONE, RELIC_FOOD_PRESERVER,
  RELIC_CLONE_DISH, RELIC_LUCKY_CAT,
} from '@/data/relics';
import {
  MODULE_BIO_KITCHEN, MODULE_NANO_FARM, MODULE_SIXTH_FARM, MODULE_MINING_ARRAY,
  MODULE_DYSON_COLLECTOR, MODULE_RESERVE_BAY,
} from '@/data/modules';

// 原料 ID 清单（随机原料效果用，勿就地重复声明）
const BASIC_MATERIAL_IDS = ['carbon', 'gold_ore', 'oil', 'silicon'];
const ALL_MATERIAL_IDS = ['carbon', 'gold_ore', 'oil', 'dark_matter', 'silicon', 'quantum'];

/** 处理单艘母舰的回合推进；内部先浅拷贝再改写，返回新 ship 对象。 */
export function processShipTurn(
  ship: Mothership,
  turn: number,
  stocks: Stock[],
  mats: RawMaterial[],
  prods: Product[]
): Mothership {
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
  if (hasModule(MODULE_BIO_KITCHEN)) s.food += 15;

  // 1b. 纳米机器人农场：每回合 +30 食物
  if (hasModule(MODULE_NANO_FARM)) s.food += 30;

  // 1c. 六维奇点农场：每回合 +60 食物
  if (hasModule(MODULE_SIXTH_FARM)) s.food += 60;

  // 2. 深空采矿阵列：每回合 +10 随机基础原料
  if (hasModule(MODULE_MINING_ARRAY)) {
    const basicMats = BASIC_MATERIAL_IDS;
    const picked = basicMats[Math.floor(Math.random() * basicMats.length)];
    s.materials = { ...s.materials, [picked]: (s.materials[picked] || 0) + 10 };
  }

  // 4. 戴森粒子收集器：每回合 +3 星尘
  if (hasModule(MODULE_DYSON_COLLECTOR)) s.stardust += 3;

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
  s.food -= computeCrewFoodCost(turn, s);
  // 食物刚变负数 → 触发饥荒
  if (s.food < 0 && s.famineTimer === 0 && !s.isRebellion) {
    s.famineTimer = 10;
  }

  // 万众一心股息（MOTHERSHIP_ID_UNITY）- 饥荒减半
  if (s.id === MOTHERSHIP_ID_UNITY) {
    const div = famineHalve(Math.floor(getShipTotalAssets(s, stocks, mats, prods) * 0.01));
    if (div > 0) {
      s.gold += div;
      checkBankrupt();
      s.goldLog = [{ turn, amount: div, reason: "万众一心股息", balanceAfter: s.gold }, ...s.goldLog].slice(0, 200);
    }
  }

  // 奇点探求者原料（MOTHERSHIP_ID_SINGULARITY_SEEKER）
  if (s.id === MOTHERSHIP_ID_SINGULARITY_SEEKER) {
    const matIds = ALL_MATERIAL_IDS;
    const pickedMat = matIds[Math.floor(Math.random() * matIds.length)];
    const amount = Math.floor(Math.random() * 3) + 2;
    s.materials = { ...s.materials };
    s.materials[pickedMat] = (s.materials[pickedMat] || 0) + amount;
  }

  // 遗物「奥得律斯基亚水晶」——每回合3个随机原料
  if (s.relics.some((r) => r.id === RELIC_CRYSTAL)) {
    const matIds = ALL_MATERIAL_IDS;
    s.materials = { ...s.materials };
    for (let i = 0; i < 3; i++) {
      const picked = matIds[Math.floor(Math.random() * matIds.length)];
      s.materials[picked] = (s.materials[picked] || 0) + 1;
    }
  }

  // 遗物「誊录仪」——每回合+1%总资产金币
  if (s.relics.some((r) => r.id === RELIC_TRANSCRIBER)) {
    const assets = getShipTotalAssets(s, stocks, mats, prods);
    const bonus = famineHalve(Math.max(0, Math.floor(assets * 0.01)));
    if (bonus > 0) {
      s.gold += bonus;
      checkBankrupt();
      s.goldLog = [{ turn, amount: bonus, reason: "遗物「誊录仪」收益", balanceAfter: s.gold }, ...s.goldLog].slice(0, 200);
    }
  }

  // 新遗物：星灵共鸣石——每回合+2星尘
  if (s.relics.some((r) => r.id === RELIC_RESONANCE_STONE)) s.stardust += 2;

  // 新遗物：克隆培养皿——每回合+5食物
  if (s.relics.some((r) => r.id === RELIC_CLONE_DISH)) {
    s.food += 5;
    if (s.food >= 0 && s.famineTimer > 0 && !s.isRebellion) {
      s.famineTimer = 0; // 食物回正解除饥荒
    }
  }

  // 新遗物：招财猫摆件——每回合+200金币
  if (s.relics.some((r) => r.id === RELIC_LUCKY_CAT)) {
    const catBonus = famineHalve(200);
    s.gold += catBonus;
    checkBankrupt();
    s.goldLog = [{ turn, amount: catBonus, reason: "遗物「招财猫」收益", balanceAfter: s.gold }, ...s.goldLog].slice(0, 200);
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
    // 食物配方：直接加到食物库存
    if (recipe?.foodYield) {
      s.food += recipe.foodYield;
      if (s.food >= 0 && s.famineTimer > 0 && !s.isRebellion) {
        s.famineTimer = 0;
      }
    } else {
      const mCost = recipe ? recipe.inputs.reduce((sum, inp) => { const m = mats.find((mm) => mm.id === inp.materialId); return sum + (m ? m.currentPrice * inp.amount : 0); }, 0) : 0;
      const expiryBonus = s.installedModuleIds.includes(MODULE_RESERVE_BAY) ? 3 : 0;
      s.products.push({ productId: task.productId, expiresAt: turn + 3 + expiryBonus, materialCost: mCost });
    }
  });
  s.products = s.products.filter((p) => p.expiresAt > turn);

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
      const income = famineHalve(Math.floor(Math.random() * incomeCap) + 1);
      s.gold += income;
      checkBankrupt();
      const factionName = FACTIONS.find((f) => f.id === fid)?.name || '未知';
      s.goldLog = [{ turn, amount: income, reason: `「${factionName}」投资收益`, balanceAfter: s.gold }, ...s.goldLog].slice(0, 200);
    }
    // 档位6自动补给：每5回合自动获得该势力特产×3
    if (tier >= 6 && turn % 5 === 0) {
      s.tradeStatus = { ...s.tradeStatus };
      s.tradeStatus.inventory = { ...s.tradeStatus.inventory };
      s.tradeStatus.inventory[fid] = (s.tradeStatus.inventory[fid] || 0) + 3;
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
      s.goldLog = [{ turn, amount: -totalDue, reason: "贷款到期扣款", balanceAfter: s.gold }, ...s.goldLog].slice(0, 200);
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
}

/** 船员食物消耗（阶梯 + 遗物保鲜减半）——单一真值：回合结算与总览显示共用 */
export function computeCrewFoodCost(turn: number, ship: { relics: { id: string }[] }): number {
  let base: number;
  if (turn <= 5) base = 1;
  else if (turn <= 10) base = 3;
  else if (turn <= 15) base = 7;
  else if (turn <= 20) base = 15;
  else if (turn <= 25) base = 23;
  else if (turn <= 30) base = 26;
  else base = turn;
  const preserve = ship.relics.some((r) => r.id === RELIC_FOOD_PRESERVER) ? 0.5 : 0;
  return Math.floor(base * (1 - preserve));
}

/** 游戏结束判定：返回结束原因文案，未结束返回 null */
export function getGameOverReason(ship0: Mothership | undefined): string | null {
  return ship0
    ? (ship0.bankrupt && ship0.bankruptTimer <= 0 && ship0.gold < 0)
      ? '你的舰队因资不抵债而解散……'
      : (ship0.isRebellion && ship0.famineTimer <= 0 && ship0.food < 0)
        ? '饥饿的船员发动了叛乱，你失去了对舰队的控制……'
        : null
    : null;
}
