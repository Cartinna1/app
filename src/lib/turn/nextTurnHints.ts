// ==================== 下一回合预告（唯一真值） ====================
// 「确认结束回合」弹窗与「大总览」共用同一份提示（都读 getNextTurnHints）。
//
// 铁律：本文件**只读状态、不写状态、不加存档字段**；凡与回合结算重复的算式一律复用结算侧的函数——
//   computeCrewFoodCost（船员食物）、computeColonyPower + projectColonyEnergy（电力/停电）、
//   getContractEarliestExpiry（合同备货过期）、getBuildingCostProfile（建筑工期）、
//   getResearchTargetTurns（研究目标回合）、getRecruitRollCost（领袖招募费）；
//   注意 getRecruitCapPerTurn 是**人口**招募口径（人口区用），领袖容量是 colony.leaderCap，两者勿混。
//   绝不在这里重写一遍，否则会出现"提示说断电、实际没断"这种显示与结算分叉。
//
// 不做预测的东西：股价/原料价波动、随机事件的抽取 —— 都无法预知，硬报等于撒谎。

import type { GameState } from '@/types/game';
import { computeCrewFoodCost } from '@/lib/turn/shipTurn';
import { getShipPerTurnIncome } from '@/lib/turn/shipIncome';
import { computeColonyPower } from '@/lib/colony/economy';
import { getRecruitCapPerTurn, hasBlackoutImmunity, projectColonyEnergy, getResearchTargetTurns } from '@/lib/colony/colonyTurn';
import { getContractEarliestExpiry, getContractHeldCount, getContractItemName, getContractRequiredTotals } from '@/lib/turn/contracts';
import { getBuildingCostProfile, getRecruitCostPerPop } from '@/lib/colony/costs';
import { checkRepBlock, getCurrentFactionId } from '@/lib/galaxy/access';
import { getBuildingDef } from '@/data/colony/buildings';
import { getLeaderDef, getRecruitRollCost } from '@/data/colony/leaders';
import { getWonderDef } from '@/data/colony/wonders';
import { getArchaeologySite } from '@/data/galaxy/archaeology';
import { getGalaxyNode } from '@/data/galaxy/nodes';
import { getPermaBonusValue } from '@/data/galaxy/permaBonuses';
import { FACTIONS } from '@/data/factions';

export type HintSeverity = 'danger' | 'warn' | 'info';

export interface NextTurnHint {
  id: string;
  severity: HintSeverity;
  text: string;
}

const factionNameOf = (id: string) => FACTIONS.find((f) => f.id === id)?.name || id;
const leaderNameOf = (id: string) => getLeaderDef(id)?.name || id;

/** 下回合（turn+1）将发生的事：危险（会掉资源）→ 提醒（会错过机会）→ 信息（进度播报） */
export function getNextTurnHints(state: GameState): NextTurnHint[] {
  const ship = state.ships[0];
  if (!ship) return [];
  const next = state.turn + 1;
  const out: NextTurnHint[] = [];
  const colony = ship.colony;

  // ==================== A. 危险级：不处理会掉资源/触发惩罚 ====================

  // A1 产品过期（结算口径：shipTurn 用 `p.expiresAt > turn` 过滤，故 expiresAt <= 下回合 即下回合消失）
  const expiring = ship.products.filter((p) => p.expiresAt <= next);
  if (expiring.length > 0) {
    const byId = new Map<string, number>();
    for (const p of expiring) byId.set(p.productId, (byId.get(p.productId) || 0) + 1);
    const list = [...byId.entries()]
      .map(([pid, n]) => `${state.products.find((pr) => pr.id === pid)?.name || pid}×${n}`)
      .join('、');
    out.push({ id: 'products_expiring', severity: 'danger', text: `${expiring.length} 件产品下回合过期：${list}` });
  }

  // A2 食物：**按结算的真实口径**算——结算（processShipTurn）先加 pre 段固定食物产出（厨房/农场/奇点农场），
  //    再扣 computeCrewFoodCost(**当前回合**，注意结算传的是 prev.turn 不是新回合)，随后 post 段（克隆培养皿）还能加食物并解除饥荒。
  const crewFood = computeCrewFoodCost(state.turn, ship);
  const income = getShipPerTurnIncome(ship);
  const preFood = income.filter((l) => l.phase === 'pre' && l.kind === 'food').reduce((n, l) => n + l.value, 0);
  const postFood = income.filter((l) => l.phase === 'post' && l.kind === 'food').reduce((n, l) => n + l.value, 0);
  const endFood = ship.food + preFood + postFood - crewFood;
  if (endFood < 0) {
    out.push({
      id: 'food_shortage',
      severity: 'danger',
      text: `下回合食物将耗尽：库存 ${ship.food}${preFood + postFood > 0 ? ` + 产出 ${preFood + postFood}` : ''} − 船员消耗 ${crewFood} = ${endFood}（进入饥荒，金币收益减半）`,
    });
  } else if (ship.food + preFood - crewFood < 0) {
    out.push({
      id: 'food_transient',
      severity: 'warn',
      text: `下回合船员用餐时食物会短暂为负（之后被产出补回 ${endFood}），该回合金币收益减半`,
    });
  }

  // A2b 叛乱倒计时（结算：famineTimer 减到 0 且食物仍为负 → 船员叛乱，游戏结束）
  if (ship.famineTimer === 1 && endFood < 0 && !ship.isRebellion) {
    out.push({ id: 'rebellion_countdown', severity: 'danger', text: '饥荒已到最后 1 回合：下回合仍没食物，船员将发动叛乱' });
  }

  // A3 断电（电力算式与结算同源）
  if (colony && colony.phase === 'active') {
    const net = computeColonyPower(colony, { relics: ship.relics, permaBonuses: ship.galaxy?.permaBonuses || [] }).net;
    const projected = projectColonyEnergy(colony.energy ?? 0, net);
    if (projected < 0) {
      const permGuard = getPermaBonusValue(ship.galaxy?.permaBonuses, 'blackoutGuardTurns');
      const guarded = hasBlackoutImmunity(colony) || permGuard > 0;
      out.push({
        id: 'blackout',
        severity: guarded ? 'warn' : 'danger',
        text: guarded
          ? `殖民地下回合净电力 ${net}（有停电保护：余晖脉冲 / 永续光，本次不会停电）`
          : `殖民地下回合净电力 ${net} → 将停电（补电力建筑或调低用电）`,
      });
    }
  }

  // A4 合同（到期 / 备货即将过期）——需求按**共享池**汇总（同一物品被多张合同需要时不重复算"已够"）
  const activeContracts = (state.factionContracts || []).filter((c) => c.accepted);
  const { requiredByItem, contractsByItem } = getContractRequiredTotals(activeContracts);
  for (const c of activeContracts) {
    const itemName = getContractItemName(c, state.factions);
    const held = getContractHeldCount(ship, c);
    const needTotal = requiredByItem[c.targetItemId] ?? c.targetQty;
    const shared = (contractsByItem[c.targetItemId] ?? 1) > 1 ? `（${contractsByItem[c.targetItemId]} 张合同共享此物）` : '';
    if (c.expiresTurn <= next) {
      out.push({
        id: `contract_due_${c.id}`,
        severity: 'danger',
        text: `合同「${itemName}」（${factionNameOf(c.factionId)}）下回合截止，备货 ${held}/${needTotal}${shared}`,
      });
    } else {
      const stockExpiry = getContractEarliestExpiry(ship, c); // 特产无过期 → null
      if (stockExpiry !== null && stockExpiry <= next && held < needTotal) {
        out.push({
          id: `contract_stock_expiring_${c.id}`,
          severity: 'warn',
          text: `合同「${itemName}」的备货下回合过期，目前备了 ${held}/${needTotal}${shared}`,
        });
      }
    }
  }

  // A5 贷款到期（结算口径：remainingTurns 先减 1，减到 ≤0 即**一次性还清 totalRepay**，不是按 perTurnPayment 分期）
  for (const l of ship.loans || []) {
    if (l.remainingTurns <= 1) {
      out.push({ id: `loan_due_${l.id}`, severity: 'danger', text: `贷款下回合到期：一次性还清 ${l.totalRepay} 金币` });
    }
  }

  // A6 破产倒计时（结算：gold<0 才会真的破产；gold 回正会清空倒计时）
  if (ship.bankruptTimer === 1 && ship.gold < 0) {
    out.push({ id: 'bankrupt_countdown', severity: 'danger', text: `破产倒计时只剩 1 回合，金币仍为 ${ship.gold}，下回合舰队将解散` });
  }

  // ==================== B. 提醒级：不处理会错过机会 ====================

  const currentFid = getCurrentFactionId(ship);
  // 跃迁中禁止贸易操作（useTrade.requireFactionHere 同源判定），此时不该提醒"你还能探索/打探"
  const canActHere = currentFid !== null && ship.galaxy.travelTurnsRemaining === 0;

  // B1 每回合一次的免费探索没用掉（结算后即作废）；被声望拦截时同样不该提醒
  if (currentFid && canActHere && !ship.tradeStatus.exploredThisTurn && !checkRepBlock(state, currentFid, 'explore')) {
    out.push({
      id: 'free_explore',
      severity: 'warn',
      text: `本回合还没在「${factionNameOf(currentFid)}」探索（每回合一次，可白拿原料）`,
    });
  }

  // B2 每个势力一次的打探没用掉
  if (currentFid && canActHere && ship.tradeStatus.intelGatheredInFaction !== currentFid && !checkRepBlock(state, currentFid, 'intel')) {
    out.push({
      id: 'intel_unused',
      severity: 'warn',
      text: `本回合还没在「${factionNameOf(currentFid)}」打探消息（每个势力限一次）`,
    });
  }

  // B3 贸易政策下回合变化
  if (state.policyRemainingTurns === 1) {
    out.push({ id: 'policy_change', severity: 'warn', text: '贸易政策下回合就会变化，买卖价随政策重算' });
  }

  // B4 买卖 buff 下回合到期（只在当前停靠势力才影响成交价，故按停靠势力过滤）
  if (currentFid) {
    const buyExpire = (state.buyBuffs?.[currentFid] || []).filter((b) => b.expiresTurn <= next);
    if (buyExpire.length > 0) {
      out.push({ id: 'buy_buff_expiring', severity: 'warn', text: `「${factionNameOf(currentFid)}」的涨价 buff 下回合到期，之后买价回落` });
    }
    const sellExpire = (state.sellBuffs?.[currentFid] || []).filter((b) => b.expiresTurn <= next);
    if (sellExpire.length > 0) {
      out.push({ id: 'sell_buff_expiring', severity: 'warn', text: `「${factionNameOf(currentFid)}」的售出加成下回合到期，之后卖价回落` });
    }
  }

  // B5 远征本回合未支付 → 下回合原地停留
  const ex = colony?.expedition;
  if (ex && !ex.paidThisTurn && ex.stage >= 3 && ex.stage <= 5) {
    out.push({
      id: 'expedition_unpaid',
      severity: 'warn',
      text: `远征「${leaderNameOf(ex.leaderId)}」本回合还没推进，下回合会原地停留`,
    });
  }

  // B6 考古在等你抉择（阶段已停滞）
  for (const [siteId, st] of Object.entries(ship.galaxy.archaeology || {})) {
    if (!st.pendingChoice) continue;
    const site = getArchaeologySite(siteId);
    out.push({
      id: `dig_choice_${siteId}`,
      severity: 'warn',
      text: `「${site?.name || siteId}」第 ${st.stageIndex + 1} 阶段在等你抉择，未抉择前不会推进`,
    });
  }

  // B7 考古失败两次后可用「稳妥推进」保底
  for (const [siteId, st] of Object.entries(ship.galaxy.archaeology || {})) {
    if (st.status !== 'digging' || st.pendingChoice || st.fails < 2) continue;
    const site = getArchaeologySite(siteId);
    out.push({
      id: `dig_steady_${siteId}`,
      severity: 'info',
      text: `「${site?.name || siteId}」已失败 ${st.fails} 次，可「稳妥推进」保底成功（奖励减半）`,
    });
  }

  // B8 奇观本回合未提交资源 → 下回合不推进
  if (colony?.wonder && colony.wonder.phase === 'building' && !colony.wonder.submittedThisTurn) {
    out.push({
      id: 'wonder_unsubmitted',
      severity: 'warn',
      text: '奇观本回合没提交资源，下回合进度不会推进',
    });
  }

  // ==================== C. 信息级：进度播报 ====================

  // C1 生产下回合完成
  const finishing = ship.productionQueue.filter((t) => t.remainingTurns <= 1);
  if (finishing.length > 0) {
    const byId = new Map<string, number>();
    for (const t of finishing) byId.set(t.productId, (byId.get(t.productId) || 0) + 1);
    const list = [...byId.entries()]
      .map(([pid, n]) => `${state.products.find((pr) => pr.id === pid)?.name || pid}×${n}`)
      .join('、');
    out.push({ id: 'production_done', severity: 'info', text: `生产下回合完成：${list}` });
  }

  // C2 殖民地建筑下回合完工（工期读 getBuildingCostProfile，与实扣同源）
  if (colony && colony.phase === 'active') {
    const doneNames: string[] = [];
    for (const inst of colony.buildings) {
      const def = getBuildingDef(inst.defId);
      if (!def || inst.active) continue;
      if (inst.buildProgress + 1 >= getBuildingCostProfile(def, colony).turns) doneNames.push(def.name);
    }
    if (doneNames.length > 0) {
      out.push({ id: 'building_done', severity: 'info', text: `殖民地建筑下回合完工：${doneNames.join('、')}` });
    }

    // C3 研究下回合完成（目标回合读 getResearchTargetTurns，含极地 -1）
    const ts = colony.techState;
    if (ts?.currentResearch) {
      const target = getResearchTargetTurns(ts.currentResearch, colony.planetType);
      if (ts.currentProgress + 1 >= target) {
        out.push({ id: 'research_done', severity: 'info', text: '殖民地下回合完成一项研究' });
      }
    }

    // C4 奇观阶段下回合完成（仅在已提交资源时会推进，与 wonderTurn 同源）
    const ws = colony.wonder;
    if (ws && ws.phase === 'building' && ws.selectedWonderId && ws.submittedThisTurn) {
      const wonder = getWonderDef(ws.selectedWonderId);
      const stage = wonder?.stages[ws.currentStage];
      if (stage && ws.stageProgress + 1 >= stage.turns) {
        out.push({ id: 'wonder_stage', severity: 'info', text: `奇观「${wonder?.name || ''}」第 ${ws.currentStage + 1} 阶段下回合完成` });
      }
    }

    // C5 下回合免费人口（每 N 回合一次，与 colonyTurn 的 `_turn % N` 同源）
    for (const l of colony.leaders) {
      const n = getLeaderDef(l.id)?.levelExtras[l.level - 1]?.freePopEveryTurns;
      if (n && next % n === 0) {
        out.push({ id: `free_pop_${l.id}`, severity: 'info', text: `下回合「${leaderNameOf(l.id)}」带来免费人口 +1` });
      }
    }

    // C6 本回合还能招募领袖——条件与动作层同源（useColonyLeaders.rollAndRecruit：容量未满 + 星尘够），
    //    ⚠ 别用 getRecruitCapPerTurn / recruitedThisTurn：那是**人口**招募的口径（useColonyPop + 殖民地面板人口区），
    //    与领袖容量（colony.leaderCap）无关；曾据此误报"还能招募 5 位领袖"（实际 3/3 已满）。
    const rollCost = getRecruitRollCost(colony.leaders);
    if (colony.leaders.length < colony.leaderCap && ship.stardust >= rollCost) {
      out.push({
        id: 'recruit_left',
        severity: 'info',
        text: `还能招募领袖（容量 ${colony.leaders.length}/${colony.leaderCap}，星尘 ${rollCost}/次）`,
      });
    }

    // C7 本回合还能招募多少人口——与 useColonyPop.recruitPop 的四道校验同源，三个限制**取最小**：
    //    ① 每回合上限 getRecruitCapPerTurn − recruitedThisTurn
    //    ② 人口上限剩余位（colony.population.cap − total，动作层也读这个字段）
    //    ③ 金币够招几个人（getRecruitCostPerPop，含星球修正 + 领袖减免）
    const costPerPop = getRecruitCostPerPop(colony);
    const capLeft = getRecruitCapPerTurn(colony) - (colony.recruitedThisTurn || 0);
    const popLeft = colony.population.cap - colony.population.total;
    const goldLeft = costPerPop > 0 ? Math.floor(ship.gold / costPerPop) : 0;
    const canRecruitPop = Math.max(0, Math.min(capLeft, popLeft, goldLeft));
    if (canRecruitPop > 0) {
      out.push({
        id: 'pop_recruit_left',
        severity: 'info',
        text: `本回合还能招募 ${canRecruitPop} 人口（${costPerPop.toLocaleString()} 金币/人，人口 ${colony.population.total}/${colony.population.cap}）`,
      });
    }
  }

  // C7 考古阶段下回合见分晓
  for (const [siteId, st] of Object.entries(ship.galaxy.archaeology || {})) {
    if (st.status !== 'digging' || st.pendingChoice || st.turnsLeft !== 1) continue;
    const site = getArchaeologySite(siteId);
    out.push({
      id: `dig_result_${siteId}`,
      severity: 'info',
      text: `「${site?.name || siteId}」第 ${st.stageIndex + 1} 阶段下回合出结果`,
    });
  }

  // C8 跃迁下回合抵达
  if (ship.galaxy.travelTurnsRemaining === 1) {
    const target = getGalaxyNode(ship.galaxy.targetNodeId || '');
    out.push({ id: 'travel_arrival', severity: 'info', text: `下回合抵达「${target?.name || '目的地'}」` });
  }

  // 兜底：没有任何需要注意的事时，保留原来那句总述
  if (out.length === 0) {
    out.push({ id: 'all_quiet', severity: 'info', text: '没有需要注意的事项。市场价格会波动，生产与建设照常推进。' });
  }

  return out;
}
