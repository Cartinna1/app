// ==================== 单舰船回合推进（纯逻辑，从 useTurn 抽离） ====================
// processShipTurn 负责装置效果、食物消耗、破产/饥荒倒计时、生产队列、
// 跃迁、投资收益、贷款还款等所有"每艘母舰"级别的回合结算。

import type { Mothership, Stock, RawMaterial, Product } from '@/types/game';
import { RECIPES, MOTHERSHIP_ID_UNITY, MOTHERSHIP_ID_SINGULARITY_SEEKER, GOLD_LOG_LIMIT } from '@/data/gameData';
import { getShipTotalAssets } from '@/lib/game/assets';
import { ALL_MATERIAL_IDS, BASIC_MATERIAL_IDS } from '@/data/materialNames';
import {
  RELIC_CRYSTAL, RELIC_TRANSCRIBER, RELIC_FOOD_PRESERVER,
} from '@/data/relics';
import {
  MODULE_MINING_ARRAY, getProductExpiry, computeProductMaterialCost,
} from '@/data/modules';
import { getShipPerTurnIncome, getAssetPercentIncome, DYNAMIC_INCOME_AMOUNTS } from '@/lib/turn/shipIncome';

/** 破产倒计时（回合数）：金币 < 0 时触发并从该值倒数，归零仍未回正则舰队解散。
 *  唯一真值：shipTurn / useTrade / useEvent 的破产判定共用，勿再写裸 10。 */
export const BANKRUPT_TURNS = 10;
/** 饥荒倒计时（回合数）：食物 < 0 时触发并从该值倒数，归零仍为负则升级为叛乱（同样 10 回合）。 */
export const FAMINE_TURNS = 10;

/** 饥荒（食物 &lt; 0）时金币收益减半；非正数原样返回。
 *  唯一真值：shipTurn / useTrade（打探）/ useEvent（事件结算与结果卡显示）共用，勿再就地写第三份。 */
export function famineHalveGold(food: number, amount: number): number {
  if (amount <= 0) return amount;
  return food < 0 ? Math.floor(amount * 0.5) : amount;
}

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

  // 装置/遗物的每回合**固定**收益（唯一真值 lib/turn/shipIncome.ts，总览「资源收支」同源）：
  // 这一段是 pre 段（船员消耗前）：生物合成厨房 +15 食物、纳米机器人农场 +30 食物、
  // 六维奇点农场 +60 食物、戴森粒子收集器 +3 星尘
  for (const line of getShipPerTurnIncome(s)) {
    if (line.phase !== 'pre') continue;
    if (line.kind === 'food') s.food += line.value;
    else if (line.kind === 'stardust') s.stardust += line.value;
  }

  // 2. 深空采矿阵列：每回合 +10 随机基础原料
  if (hasModule(MODULE_MINING_ARRAY)) {
    const basicMats = BASIC_MATERIAL_IDS;
    const picked = basicMats[Math.floor(Math.random() * basicMats.length)];
    s.materials = { ...s.materials, [picked]: (s.materials[picked] || 0) + 10 };
  }

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
  const checkBankrupt = () => {
    if (s.gold < 0 && !s.bankrupt) { s.bankrupt = true; s.bankruptTimer = BANKRUPT_TURNS; }
  };

  // ==================== 食物消耗（船员维持）- 允许变负数 ====================
  s.food -= computeCrewFoodCost(turn, s);
  // 食物刚变负数 → 触发饥荒
  if (s.food < 0 && s.famineTimer === 0 && !s.isRebellion) {
    s.famineTimer = FAMINE_TURNS;
  }

  // 万众一心股息（MOTHERSHIP_ID_UNITY）- 饥荒减半
  if (s.id === MOTHERSHIP_ID_UNITY) {
    const div = famineHalveGold(s.food, getAssetPercentIncome(getShipTotalAssets(s, stocks, mats, prods)));
    if (div > 0) {
      s.gold += div;
      checkBankrupt();
      s.goldLog = [{ turn, amount: div, reason: "万众一心股息", balanceAfter: s.gold }, ...s.goldLog].slice(0, GOLD_LOG_LIMIT);
    }
  }

  // 奇点探求者原料（MOTHERSHIP_ID_SINGULARITY_SEEKER）——数量走 shipIncome 的动态收益常量
  if (s.id === MOTHERSHIP_ID_SINGULARITY_SEEKER) {
    const matIds = ALL_MATERIAL_IDS;
    const pickedMat = matIds[Math.floor(Math.random() * matIds.length)];
    const { singularityMatsMin, singularityMatsMax } = DYNAMIC_INCOME_AMOUNTS;
    const amount = singularityMatsMin + Math.floor(Math.random() * (singularityMatsMax - singularityMatsMin + 1));
    s.materials = { ...s.materials };
    s.materials[pickedMat] = (s.materials[pickedMat] || 0) + amount;
  }

  // 遗物「奥得律斯基亚水晶」——每回合 N 个随机原料（N = DYNAMIC_INCOME_AMOUNTS.crystalMats）
  if (s.relics.some((r) => r.id === RELIC_CRYSTAL)) {
    const matIds = ALL_MATERIAL_IDS;
    s.materials = { ...s.materials };
    for (let i = 0; i < DYNAMIC_INCOME_AMOUNTS.crystalMats; i++) {
      const picked = matIds[Math.floor(Math.random() * matIds.length)];
      s.materials[picked] = (s.materials[picked] || 0) + 1;
    }
  }

  // 遗物「誊录仪」——每回合 +1% 总资产金币（百分比走 shipIncome.ASSET_INCOME_PCT）
  if (s.relics.some((r) => r.id === RELIC_TRANSCRIBER)) {
    const bonus = famineHalveGold(s.food, getAssetPercentIncome(getShipTotalAssets(s, stocks, mats, prods)));
    if (bonus > 0) {
      s.gold += bonus;
      checkBankrupt();
      s.goldLog = [{ turn, amount: bonus, reason: "遗物「誊录仪」收益", balanceAfter: s.gold }, ...s.goldLog].slice(0, GOLD_LOG_LIMIT);
    }
  }

  // 遗物每回合**固定**收益（唯一真值 getShipPerTurnIncome 的 post 段，船员消耗后结算）：
  // 克隆培养皿 +5 食物（可解除饥荒）、星灵共鸣石 +2 星尘、共鸣音叉 +3 星尘、招财猫摆件 +200 金币
  for (const line of getShipPerTurnIncome(s)) {
    if (line.phase !== 'post') continue;
    if (line.kind === 'food') {
      s.food += line.value;
      if (s.food >= 0 && s.famineTimer > 0 && !s.isRebellion) {
        s.famineTimer = 0; // 食物回正解除饥荒
      }
    } else if (line.kind === 'stardust') {
      s.stardust += line.value;
    } else if (line.kind === 'gold') {
      const bonus = famineHalveGold(s.food, line.value);
      if (bonus > 0) {
        s.gold += bonus;
        checkBankrupt();
        s.goldLog = [{ turn, amount: bonus, reason: `遗物「${line.label}」收益`, balanceAfter: s.gold }, ...s.goldLog].slice(0, GOLD_LOG_LIMIT);
      }
    }
  }

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
      s.isRebellion = true; s.famineTimer = FAMINE_TURNS;
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
      // 原料成本快照与保质期都走 data/modules 的唯一真值（与立即完成路径 useProduction 同源）
      const mCost = recipe ? computeProductMaterialCost(recipe, mats) : 0;
      s.products.push({ productId: task.productId, expiresAt: getProductExpiry(turn, s.installedModuleIds), materialCost: mCost });
    }
  });
  s.products = s.products.filter((p) => p.expiresAt > turn);

  // 星图：跃迁倒计时（位置与目标都在 galaxy，单一真值）
  s.galaxy = { ...s.galaxy };
  if (s.galaxy.travelTurnsRemaining > 0) {
    const left = s.galaxy.travelTurnsRemaining - 1;
    const arrived = left <= 0 && !!s.galaxy.targetNodeId;
    const nodeId = arrived ? s.galaxy.targetNodeId! : null;
    s.galaxy.travelTurnsRemaining = left;
    if (arrived) {
      s.galaxy.currentNodeId = nodeId!;
      s.galaxy.targetNodeId = null;
      if (!s.galaxy.visitedNodes.includes(nodeId!)) {
        s.galaxy.visitedNodes = [...s.galaxy.visitedNodes, nodeId!]; // 到达即探明
      }
      // 抵达新势力后重置打探状态（浅拷贝 tradeStatus，避免改到 prev 的嵌套对象）
      s.tradeStatus = { ...s.tradeStatus, intelGatheredInFaction: null, lastIntelResult: undefined };
    }
  }

  // 旧「投资收益 + 档位6自动补给」已随投资系统退役一并删除：
  // 投资的唯一形态是「固定 8000 金币 → +1 声望」（useTrade.investFaction），
  // 回报走 REPUTATION_TIERS 的被动收入（factionTurn.applyPassiveIncome）+ 买价折扣；
  // 旧的 factionStates.invested 已无写入点（读档时一次性折成声望后清零），故这里不再有结算分支。

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
      s.goldLog = [{ turn, amount: -totalDue, reason: "贷款到期扣款", balanceAfter: s.gold }, ...s.goldLog].slice(0, GOLD_LOG_LIMIT);
      s.loans = s.loans.filter((l) => l.remainingTurns > 0);
      if (s.gold < 0 && !s.bankrupt) { s.bankrupt = true; s.bankruptTimer = BANKRUPT_TURNS; }
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
