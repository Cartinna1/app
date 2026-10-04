import { useCallback } from 'react';
import type { GameState, Mothership } from '@/types/game';
import { FACTIONS, getSellPrice, RELATION_MATRIX } from '@/data/factions';
import { RECIPES } from '@/data/gameData';
import { getContractItemKind, SMUGGLING_SUCCESS_RATE } from '@/lib/turn/contracts';
import { getBuffMultiplier } from '@/lib/turn/factionTurn';
import { INVEST_GOLD_PER_REP, INVEST_MAX_PER_TURN, BLACK_MARKET_DEFAULT } from '@/data/exchangeRates';
import { getShipTravel } from '@/lib/galaxy/travel';
import { checkRepBlock, getBlockedNodeIds, getCurrentFactionId, HOSTILE_TOLL_REP } from '@/lib/galaxy/access';
import { firstMissing, payCost } from '@/lib/turn/resourceCost';
import { getGalaxyNode } from '@/data/galaxy/nodes';
import { MATERIAL_NAME_MAP, ALL_MATERIAL_IDS } from '@/data/materialNames';
import { RELIC_DECIPHERER } from '@/data/relics';
import { famineHalveGold, BANKRUPT_TURNS } from '@/lib/turn/shipTurn';
import { getSpecialtyBuyUnitPrice, getSpecialtySellRevenue, getBlackMarketTotal } from '@/lib/turn/tradePrice';
import { pushGoldLog } from '@/lib/turn/goldLog';


export function useTrade(
  gameState: GameState,
  dispatch: React.Dispatch<{ type: 'FUNCTIONAL_UPDATE'; updater: (state: GameState) => GameState }>
) {
  /** 应用声望变化（带回合上限管控和零和传导）。纯函数：返回更新后的字段，无变化返回 null */
  function applyRepChange(
    factionReputation: Record<string, number> | undefined,
    factionRepLog: Record<string, number> | undefined,
    factionId: string,
    delta: number,
    capKey: 'buy' | 'invest' | 'contract' | 'toll' = 'buy'
  ): { factionReputation: Record<string, number>; factionRepLog: Record<string, number> } | null {
    const rep = { ...(factionReputation || {}) };
    const log = { ...(factionRepLog || {}) };
    // toll：宿敌过路费给的 +1 声望，每势力每回合最多 +1（付费本身受 20,000 金币/次 限制）
    const caps: Record<string, number> = { buy: 2, invest: 10, contract: 99, toll: 1 };
    const cap = caps[capKey] || 99;
    const logKey = `${factionId}_${capKey}`; // 区分动作类型的独立上限
    const cur = log[logKey] || 0;
    const applied = delta > 0 ? Math.min(delta, cap - cur) : delta;
    if (applied === 0) return null;
    log[logKey] = cur + applied;
    rep[factionId] = Math.max(-100, Math.min(100, (rep[factionId] || 0) + applied));
    // 零和传导：敌人惩罚（按动作类型区分单次值与回合上限）
    const enemyConf: Record<string, { per: number; cap: number | null }> = {
      buy: { per: -4, cap: -4 },
      invest: { per: -2, cap: -20 },
      contract: { per: -8, cap: null },
    };
    const conf = enemyConf[capKey] || { per: -1, cap: -5 };
    const rel = RELATION_MATRIX[factionId];
    if (rel && applied > 0) {
      for (const enemyId of rel.enemies) {
        const enemyLogKey = `${enemyId}_penalty_${capKey}`;
        const eCur = log[enemyLogKey] || 0;
        let eApplied = conf.per;
        if (conf.cap !== null) {
          eApplied = Math.max(conf.cap - eCur, conf.per);
          if (eApplied >= 0) continue;
        }
        log[enemyLogKey] = eCur + eApplied;
        rep[enemyId] = Math.max(-100, Math.min(100, (rep[enemyId] || 0) + eApplied));
      }
    }
    return { factionReputation: rep, factionRepLog: log };
  }

  // 声望拦截的唯一真值已移到 lib/galaxy/access.ts（checkRepBlock），与 HOSTILE_REP_THRESHOLD 同处，
  // 「下一回合预告」的探索/打探提醒共用同一判定。

  // 跃迁（目标可以是任意星系节点；回合数由星图最短路给出）
  const travelToNode = useCallback(
    (shipIndex: number, targetNodeId: string): { success: boolean; message: string } => {
      const targetNode = getGalaxyNode(targetNodeId);
      if (!targetNode) return { success: false, message: '目标星系不存在' };
      // 宿敌势力封锁边境：不可进入
      if (targetNode.factionId) {
        const repBlockT = checkRepBlock(gameState, targetNode.factionId, 'travel');
        if (repBlockT) return { success: false, message: repBlockT };
      }
      let result: { success: boolean; message: string } = { success: false, message: '' };
      dispatch({
        type: 'FUNCTIONAL_UPDATE',
        updater: (prev) => {
          const ships = [...prev.ships]; const s = { ...ships[shipIndex] };
          if (targetNode.factionId) {
            const repBlockT2 = checkRepBlock(prev, targetNode.factionId, 'travel');
            if (repBlockT2) { result = { success: false, message: repBlockT2 }; return prev; }
          }
          const g = { ...s.galaxy };
          if (g.travelTurnsRemaining > 0) { result = { success: false, message: '正在跃迁中' }; return prev; }
          if (g.currentNodeId === targetNodeId) { result = { success: false, message: '已在此星系' }; return prev; }
          // 最短路 + 减免 +（无免费路线时的）宿敌过路费——唯一真值 lib/galaxy/travel.ts（星图按钮同源）
          const plan = getShipTravel(s, targetNodeId, getBlockedNodeIds(prev.factionReputation));
          if (!plan.route && !plan.tollRoute) { result = { success: false, message: '无法抵达：航线被封锁的势力割断，可先提升该势力声望' }; return prev; }
          const useToll = !plan.route;
          const turns = useToll ? plan.tollTurns : plan.turns;
          // 付费途经宿敌：一次性扣过路费（每处 20,000 金币），并给该势力 +1 声望（宿敌下唯一的自救通道）
          let repPatched: { factionReputation: Record<string, number>; factionRepLog: Record<string, number> } | null = null;
          if (useToll) {
            const tollCost: Record<string, number> = { gold: plan.tollGold };
            const missing = firstMissing(s, s.colony, tollCost);
            if (missing) { result = { success: false, message: `过路费不足：${missing}` }; return prev; }
            payCost(s, s.colony, tollCost);
            pushGoldLog(s, prev.turn, -plan.tollGold, `宿敌过路费（途经 ${plan.hostileVia.length} 处）`);
            let repCur = prev.factionReputation;
            let logCur = prev.factionRepLog;
            for (const fid of plan.hostileVia) {
              const repRes = applyRepChange(repCur, logCur, fid, HOSTILE_TOLL_REP, 'toll');
              if (!repRes) continue;
              repCur = repRes.factionReputation; logCur = repRes.factionRepLog; repPatched = repRes;
            }
          }
          g.targetNodeId = targetNodeId;
          g.travelTurnsRemaining = turns;
          s.galaxy = g;
          ships[shipIndex] = s;
          // 迷雾：未探测过的目的地不暴露名称（抵达后才揭晓）
          const targetKnown = (s.galaxy.visitedNodes || []).includes(targetNodeId);
          const tollNote = useToll ? `（途经宿敌 ${plan.hostileVia.length} 处，过路费 ${plan.tollGold.toLocaleString()} 金币）` : '';
          result = {
            success: true,
            message: (targetKnown ? `开始跃迁，预计${turns}回合后抵达「${targetNode.name}」` : `开始跃迁，预计${turns}回合后抵达目标星系`) + tollNote,
          };
          return { ...prev, ships, ...(repPatched || {}) };
        },
      });
      return result;
    }, [gameState, dispatch]);

  /** 贸易操作前置守卫：跃迁中不可操作，且必须停泊在势力星系 */
  const requireFactionHere = (ship: Mothership | undefined): string | null => {
    if (!ship) return '舰队不存在';
    if (ship.galaxy.travelTurnsRemaining > 0) return '跃迁中，抵达后才能进行贸易操作';
    return getCurrentFactionId(ship) ? null : '此处没有可交易的势力，请先跃迁到势力星系';
  };

  // 购买特产（含声望折扣）
  const buySpecialty = useCallback(
    (shipIndex: number, quantity: number): { success: boolean; message: string } => {
      const ship0 = gameState.ships?.[shipIndex];
      const hereBlockB = requireFactionHere(ship0);
      if (hereBlockB) return { success: false, message: hereBlockB };
      const curFid0 = getCurrentFactionId(ship0);
      if (curFid0) {
        const repBlockB0 = checkRepBlock(gameState, curFid0, 'buy');
        if (repBlockB0) return { success: false, message: repBlockB0 };
      }
      let result: { success: boolean; message: string } = { success: false, message: '' };
      dispatch({
        type: 'FUNCTIONAL_UPDATE',
        updater: (prev) => {
          const ships = [...prev.ships]; const s = { ...ships[shipIndex] };
          if (s.gold <= 0) { result = { success: false, message: '金币不足' }; return prev; }
          if (quantity <= 0) { result = { success: false, message: '数量必须大于0' }; return prev; }
          const faction = prev.factions.find((f) => f.id === getCurrentFactionId(s));
          if (!faction) { result = { success: false, message: '找不到势力' }; return prev; }
          const repBlockB = checkRepBlock(prev, faction.id, 'buy'); if (repBlockB) { result = { success: false, message: repBlockB }; return prev; }
          // 库存校验
          const available = prev.buyStocks?.[faction.id] ?? 0;
          if (quantity > available) { result = { success: false, message: `库存不足，本回合仅剩${available}个` }; return prev; }
          // 价格：市场价 × 声望折扣 × 涨价buff × 讨价还价AI（唯一真值 lib/turn/tradePrice.ts，贸易面板显示同源）
          const rep = prev.factionReputation?.[faction.id] || 0;
          const buyBuffMult = getBuffMultiplier(prev.buyBuffs?.[faction.id]);
          const price = getSpecialtyBuyUnitPrice(faction.id, prev.factionPrices, rep, buyBuffMult, s.relics.map((r) => r.id));
          const totalCost = price * quantity;
          if (s.gold < totalCost) { result = { success: false, message: `金币不足，需${totalCost}` }; return prev; }
          s.gold -= totalCost;
          pushGoldLog(s, prev.turn, -totalCost, `购买「${faction.specialtyName}」x${quantity}`);
          s.tradeStatus = { ...s.tradeStatus };
          s.tradeStatus.inventory = { ...s.tradeStatus.inventory };
          s.tradeStatus.inventory[faction.id] = (s.tradeStatus.inventory[faction.id] || 0) + quantity;
          // 扣库存（不可变更新）
          const buyStocks = { ...(prev.buyStocks || {}), [faction.id]: available - quantity };
          // 触发涨价判定（本回合累计购买 ≥ 初始库存 60%）
          const maxStock = prev.buyStockMax?.[faction.id] || 0;
          const used = maxStock - buyStocks[faction.id];
          const triggered = maxStock > 0 && !prev.buyTriggered?.[faction.id] && used >= maxStock * 0.6;
          const buyTriggered = triggered ? { ...(prev.buyTriggered || {}), [faction.id]: true } : prev.buyTriggered;
          const buyBuffs = triggered
            ? { ...(prev.buyBuffs || {}), [faction.id]: [...(prev.buyBuffs?.[faction.id] || []), { multiplier: 2.5, expiresTurn: prev.turn + 15 }] }
            : prev.buyBuffs;
          const repResult = applyRepChange(prev.factionReputation, prev.factionRepLog, faction.id, 2, 'buy');
          ships[shipIndex] = s;
          result = { success: true, message: `购买${faction.specialtyName} x${quantity}，花费${totalCost}金币${triggered ? '。⚠ 购买量已达本回合库存60%，下回合起购买价×2.5（持续15回合）' : ''}` };
          return { ...prev, ships, buyStocks, buyTriggered, buyBuffs, ...(repResult || {}) };
        },
      });
      return result;
    }, [gameState, dispatch]);

  // 出售特产
  const sellSpecialty = useCallback(
    (shipIndex: number, factionId: string, quantity: number): { success: boolean; message: string } => {
      const ship0 = gameState.ships?.[shipIndex];
      const hereBlockB = requireFactionHere(ship0);
      if (hereBlockB) return { success: false, message: hereBlockB };
      const curFid0 = getCurrentFactionId(ship0);
      if (curFid0) {
        const repBlockS0 = checkRepBlock(gameState, curFid0, 'sell');
        if (repBlockS0) return { success: false, message: repBlockS0 };
      }
      let result: { success: boolean; message: string } = { success: false, message: '' };
      dispatch({
        type: 'FUNCTIONAL_UPDATE',
        updater: (prev) => {
          const ships = [...prev.ships]; const s = { ...ships[shipIndex] };
          if (quantity <= 0) { result = { success: false, message: '数量必须大于0' }; return prev; }
          const repBlockS = checkRepBlock(prev, getCurrentFactionId(s) || '', 'sell'); if (repBlockS) { result = { success: false, message: repBlockS }; return prev; }
          if (getCurrentFactionId(s) === factionId) { result = { success: false, message: '不能在本地势力出售' }; return prev; }
          const curFid = getCurrentFactionId(s) || '';
          // 需求校验（按停靠势力，不分特产种类）
          const remaining = prev.sellDemands?.[curFid] ?? 0;
          if (quantity > remaining) { result = { success: false, message: `本回合需求已满足，仅剩${remaining}个配额` }; return prev; }
          const invCount = s.tradeStatus.inventory[factionId] || 0;
          if (invCount < quantity) { result = { success: false, message: '库存不足' }; return prev; }
          const faction = prev.factions.find((f) => f.id === factionId);
          if (!faction) { result = { success: false, message: '找不到势力' }; return prev; }
          const sellPrice = getSellPrice(factionId, prev.factionPrices, prev.factionSellMultipliers);
          const sellBuffMult = getBuffMultiplier(prev.sellBuffs?.[curFid]);
          // 收益加成（反垄断 1.1 / 套利凭证 1.05 / 贸易枢纽 1.15）唯一真值 lib/turn/tradePrice.ts
          const totalRevenue = getSpecialtySellRevenue(quantity, sellPrice, sellBuffMult, s.relics.map((r) => r.id), s.installedModuleIds);
          s.gold += totalRevenue;
          if (s.bankrupt && s.gold > 0) s.bankrupt = false;
          pushGoldLog(s, prev.turn, totalRevenue, `卖出「${faction.specialtyName}」x${quantity}`);
          s.tradeStatus = { ...s.tradeStatus };
          s.tradeStatus.inventory = { ...s.tradeStatus.inventory };
          s.tradeStatus.inventory[factionId] = invCount - quantity;
          if (s.tradeStatus.inventory[factionId] === 0) delete s.tradeStatus.inventory[factionId];
          // 扣需求（不可变更新）
          const sellDemands = { ...(prev.sellDemands || {}), [curFid]: remaining - quantity };
          // 触发降价判定（本回合累计卖出 ≥ 初始需求 50%）
          const maxDemand = prev.sellDemandMax?.[curFid] || 0;
          const sold = maxDemand - sellDemands[curFid];
          const triggered = maxDemand > 0 && !prev.sellTriggered?.[curFid] && sold >= maxDemand * 0.5;
          const sellTriggered = triggered ? { ...(prev.sellTriggered || {}), [curFid]: true } : prev.sellTriggered;
          const sellBuffs = triggered
            ? { ...(prev.sellBuffs || {}), [curFid]: [...(prev.sellBuffs?.[curFid] || []), { multiplier: 0.3, expiresTurn: prev.turn + 15 }] }
            : prev.sellBuffs;
          ships[shipIndex] = s;
          result = { success: true, message: `卖出${faction.specialtyName} x${quantity}，获得${totalRevenue}金币${triggered ? '。⚠ 卖出量已达本回合需求50%，下回合起收购价×0.3（持续15回合）' : ''}` };
          return { ...prev, ships, sellDemands, sellTriggered, sellBuffs };
        },
      });
      return result;
    }, [gameState, dispatch]);

  // 探索
  const exploreFaction = useCallback(
    (shipIndex: number): { success: boolean; message: string } => {
      const ship0 = gameState.ships?.[shipIndex];
      const hereBlockB = requireFactionHere(ship0);
      if (hereBlockB) return { success: false, message: hereBlockB };
      const curFid0 = getCurrentFactionId(ship0);
      if (curFid0) {
        const repBlockEx0 = checkRepBlock(gameState, curFid0, 'explore');
        if (repBlockEx0) return { success: false, message: repBlockEx0 };
      }
      let result: { success: boolean; message: string } = { success: false, message: '' };
      dispatch({
        type: 'FUNCTIONAL_UPDATE',
        updater: (prev) => {
          const ships = [...prev.ships]; const s = { ...ships[shipIndex] };
          const repBlockEx = checkRepBlock(prev, getCurrentFactionId(s) || '', 'explore'); if (repBlockEx) { result = { success: false, message: repBlockEx }; return prev; }
          if (s.tradeStatus.exploredThisTurn) { result = { success: false, message: '本回合已探索过' }; return prev; }
          const matIds = ALL_MATERIAL_IDS;
          const matNames: Record<string, string> = MATERIAL_NAME_MAP;
          const dropCount = Math.floor(Math.random() * 3) + 1;
          s.materials = { ...s.materials };
          const drops: string[] = [];
          for (let i = 0; i < dropCount; i++) {
            const mat = matIds[Math.floor(Math.random() * matIds.length)];
            const amount = Math.floor(Math.random() * 4) + 1;
            s.materials[mat] = (s.materials[mat] || 0) + amount;
            drops.push(`${amount}单位${matNames[mat]}`);
          }
          s.tradeStatus = { ...s.tradeStatus, exploredThisTurn: true, lastExploreResult: `探索获得原料：${drops.join('、')}` };
          ships[shipIndex] = s;
          result = { success: true, message: `探索获得原料：${drops.join('、')}` };
          return { ...prev, ships };
        },
      });
      return result;
    }, [gameState, dispatch]);

  // 声望投资：8000金币=1声望，每回合上限+10
  const investFaction = useCallback(
    (shipIndex: number, amount: number): { success: boolean; message: string } => {
      const ship0 = gameState.ships?.[shipIndex];
      const hereBlockInv = requireFactionHere(ship0);
      if (hereBlockInv) return { success: false, message: hereBlockInv };
      const factionId0 = getCurrentFactionId(ship0);
      if (factionId0) {
        const repBlockInv0 = checkRepBlock(gameState, factionId0, 'invest');
        if (repBlockInv0) return { success: false, message: repBlockInv0 };
      }
      let result: { success: boolean; message: string } = { success: false, message: '' };
      dispatch({
        type: 'FUNCTIONAL_UPDATE',
        updater: (prev) => {
          const ships = [...prev.ships]; const s = { ...ships[shipIndex] };
          if (amount <= 0) { result = { success: false, message: '投资金额必须大于0' }; return prev; }
          if (s.gold < amount) { result = { success: false, message: '金币不足' }; return prev; }
          const factionId = getCurrentFactionId(s) || '';
          const repBlockInv = checkRepBlock(prev, factionId, 'invest'); if (repBlockInv) { result = { success: false, message: repBlockInv }; return prev; }
          const maxPerTurn = INVEST_MAX_PER_TURN;
          const used = (prev.factionRepLog || {})[factionId + '_invest'] || 0;
          if (used >= maxPerTurn) { result = { success: false, message: `本回合已投资${maxPerTurn}次，下次回合再来` }; return prev; }
          const repGain = 1; // 每次投资固定 +1 声望
          if (s.gold < INVEST_GOLD_PER_REP) { result = { success: false, message: `至少需要${INVEST_GOLD_PER_REP}金币` }; return prev; }
          const actualAmount = INVEST_GOLD_PER_REP;
          s.gold -= actualAmount;
          const factionName = FACTIONS.find((f) => f.id === factionId)?.name || factionId;
          pushGoldLog(s, prev.turn, -actualAmount, `投资「${factionName}」`);
          const repResult = applyRepChange(prev.factionReputation, prev.factionRepLog, factionId, repGain, 'invest');
          ships[shipIndex] = s;
          const repNow = (repResult?.factionReputation ?? prev.factionReputation ?? {})[factionId] || 0;
          result = { success: true, message: `投资${actualAmount}金币，声望+${repGain}（当前${repNow}）` };
          return { ...prev, ships, ...(repResult || {}) };
        },
      });
      return result;
    }, [gameState, dispatch]);

  // ==================== 打探消息 ====================
  const intelStories: Record<string, string[]> = {
    s1: ['你在信息交易所蹲守了几天，终于等到一条能用的线索：某个势力正在秘密收购一批指定物资。你没有去赌行情，而是把这条线索连同货源一起转手卖给了一位着急交货的中间商，当场结清。','一位穿着太空站维护服的老人悄悄塞给你一张数据卡："这上面的坐标，藏着一个废弃的军工厂。"你把坐标转手卖给了专做 salvage 的回收商，换了一笔干净利落的介绍费。','你在某个不具名的通讯频道里截获了一段加密对话。破译后发现是两家星际集团的采购谈判——你没有跟价，而是把这份谈判纪要卖给了对手阵营的商务代表。'],
    s2: ['当地酒吧里一个喝醉的军官大声嚷嚷着换装计划。你没有去囤积装备，而是把"旧装备将集中处理"这条消息转给了做二手军械的商人，收了信息费。','一位退役的舰队指挥官与你攀谈，透露某支巡逻舰队即将扩编。你把这份需求预测转手卖给了一家零件代理商，价格公道、当场付款。','你的船员在空间站的公告栏上发现了一张内部采购单。你没有去碰期货，而是把它卖给了那家中标概率最大的供应商。'],
    s3: ['你帮一位迷路的外星商人找到了泊位。作为感谢，他告诉你一条"当地人都不一定知道"的贸易路线——你把路线信息转卖给了一家想开新航线的运输公司。','船员在废品回收站淘到一块老旧导航芯片，上面标记着一个未登记的小行星带。你把这份矿点数据转手卖给了采矿公会。','一位与你关系不错的空间站调度员偷偷告诉你明天会有货船提前到达。你把这个时间窗口卖给了等着抢首单的批发商。'],
    s4: ['你在茶歇时听到两个贸易商谈论某种原料最近走俏。你没有下注，而是把这份"市场情绪"整理成一页简报，卖给了做咨询的情报贩子，赚了一笔小钱。','船员在公告板上看到一则招工广告，待遇与工期暗示某个大工程即将开工。你把这条推断写成消息卖给了建材供应商。','一位老船长在告别时提醒你那个方向的航线不太平。你没去冒险，而是把这条航道风险提示卖给了保险公司。','你的导航AI截获了一段例行物流广播。你从里面推出一份供应趋势简报，转手卖给了需要它的人。'],
    s5: ['你花了不少金币从一个自称"包打听"的信息贩子那里买到了一份"独家情报"。结果那份情报三天前就在公共频道上免费发布了。你气得想找他理论，但他已经人间蒸发。','一位看起来很专业的分析师给了你一个"稳赚不赔"的投资建议。你照做了，结果市场走势完全相反。后来你才知道，那人是竞争对手派来故意误导你的。','船员兴冲冲地跑来告诉你他"打听到"一个千载难逢的机会。你抱着试试看的态度投了一些金币，结果那根本就是个已经过时的旧消息，钱打了水漂。'],
    s6: ['你收到了一份加密情报，声称某支星际商队将在明天经过这片星域。你做好了"迎接"准备，结果等了一整天什么都没有等到。后来才知道，那份情报的日期印错了，是上周的消息。','你按照一份"可靠线人"提供的市场分析进行操作，结果亏了一大笔。后来那位线人抱歉地告诉你："抱歉，那份数据是三个月前的，我没注意到。"你无言以对。','一家看起来很正规的情报机构卖给你一份"实时市场动态"。你花了大价钱买下，结果发现里面的数据全都是一周前的。等你反应过来，机构已经注销了账户。'],
    s7: ['你收到了一条匿名消息："想知道赚钱的秘诀吗？来老地方找我。"你到了约定的废弃船坞，结果迎接你的是一群持械歹徒。虽然你勉强逃脱，但金币被他们搜刮一空。','一位自称是"星际联盟特派员"的人找到你，声称你涉嫌走私，需要缴纳"保证金"才能洗清嫌疑。你虽然觉得可疑，但不想惹麻烦，交了一笔钱后对方就消失了。你意识到被骗了。','你收到了一封看起来很官方的邮件，说你的银行账户存在异常，需要"验证身份"。你按提示操作后，发现账户里的金币被转走了大半。这是一起精心设计的网络钓鱼骗局。'],
    s8: ['你参加了一个"高回报投资研讨会"。会场上所有人都在谈论赚了多少多少钱，你被气氛感染，投入了所有积蓄。结果第二天，整个组织连同你的钱一起消失得无影无踪。','一位自称是失落文明后裔的神秘人物出现在你的船上，声称掌握着通往"远古宝藏"的星图。你只需要"赞助"他的研究。你鬼迷心窍地答应了，结果换来的是一张画满涂鸦的废纸。'],
  };

  const gatherIntel = useCallback(
    (shipIndex: number): { success: boolean; message: string; goldChange: number } => {
      const ship0 = gameState.ships?.[shipIndex];
      const hereBlockB = requireFactionHere(ship0);
      if (hereBlockB) return { success: false, message: hereBlockB, goldChange: 0 };
      const curFid0 = getCurrentFactionId(ship0);
      if (curFid0) {
        const repBlockI0 = checkRepBlock(gameState, curFid0, 'intel');
        if (repBlockI0) return { success: false, message: repBlockI0, goldChange: 0 };
      }
      let result: { success: boolean; message: string; goldChange: number } = { success: false, message: '', goldChange: 0 };
      dispatch({
        type: 'FUNCTIONAL_UPDATE',
        updater: (prev) => {
          const ships = [...prev.ships]; const s = { ...ships[shipIndex] };
          const currentFid = getCurrentFactionId(s) || '';
          const repBlockI = checkRepBlock(prev, currentFid, 'intel'); if (repBlockI) { result = { success: false, message: repBlockI, goldChange: 0 }; return prev; }
          if (s.tradeStatus.intelGatheredInFaction === currentFid) { result = { success: false, message: '在此势力已打探过消息，跃迁到新势力后可再次打探', goldChange: 0 }; return prev; }
          s.tradeStatus = { ...s.tradeStatus, intelGatheredInFaction: currentFid };
          const turnMultiplier = 1 + prev.turn * 0.08;
          const roll = Math.random() * 100;
          let goldChange = 0; let story = '';
          const pick = (arr: string[]) => arr[Math.floor(Math.random() * arr.length)];
          if (roll < 2) { goldChange = Math.round((Math.floor(Math.random() * 3001) + 2000) * turnMultiplier); story = pick(intelStories.s1); }
          else if (roll < 10) { goldChange = Math.round((Math.floor(Math.random() * 1001) + 1000) * turnMultiplier); story = pick(intelStories.s2); }
          else if (roll < 25) { goldChange = Math.round((Math.floor(Math.random() * 501) + 500) * turnMultiplier); story = pick(intelStories.s3); }
          else if (roll < 55) { goldChange = Math.round((Math.floor(Math.random() * 301) + 200) * turnMultiplier); story = pick(intelStories.s4); }
          else if (roll < 75) { goldChange = -Math.round((Math.floor(Math.random() * 201) + 100) * turnMultiplier); story = pick(intelStories.s5); }
          else if (roll < 90) { goldChange = -Math.round((Math.floor(Math.random() * 301) + 300) * turnMultiplier); story = pick(intelStories.s6); }
          else if (roll < 98) { goldChange = -Math.round((Math.floor(Math.random() * 401) + 600) * turnMultiplier); story = pick(intelStories.s7); }
          else { goldChange = -Math.round((Math.floor(Math.random() * 501) + 1000) * turnMultiplier); story = pick(intelStories.s8); }
          // 饥荒减半的唯一真值在 lib/turn/shipTurn.ts（勿就地再写一份）
          const checkBankrupt = () => { if (s.gold < 0 && !s.bankrupt) { s.bankrupt = true; s.bankruptTimer = BANKRUPT_TURNS; } };
          const finalGold = famineHalveGold(s.food, goldChange);
          if (finalGold !== 0) { s.gold += finalGold; checkBankrupt(); if (s.gold >= 0 && s.bankrupt) { s.bankrupt = false; s.bankruptTimer = 0; } pushGoldLog(s, prev.turn, finalGold, '打探消息'); }
          let alloyText = '';
          if (Math.random() < 0.7) { const alloyGain = Math.floor(Math.random() * 3) + 3; s.alloy += alloyGain; alloyText = `回收了${alloyGain}个合金。`; }
          const message = `${story}${alloyText?' '+alloyText:''} ${finalGold>0?'获得+'+finalGold+'金币':finalGold<0?'损失'+finalGold+'金币':''}`.trim();
          s.tradeStatus = { ...s.tradeStatus, intelGatheredInFaction: currentFid, lastIntelResult: { message, goldChange: finalGold } };
          ships[shipIndex] = s;
          result = { success: true, message, goldChange: finalGold };
          return { ...prev, ships };
        },
      });
      return result;
    }, [gameState, dispatch]);

  // ==================== 合同系统 ====================

  /** 接取合同（接取后从当前回合重新计算完成期限） */
  const acceptContract = useCallback((contractId: string): { success: boolean; message: string } => {
    const contract0 = (gameState.factionContracts || []).find((c) => c.id === contractId);
    if (contract0) {
      const repBlockC0 = checkRepBlock(gameState, contract0.factionId, 'contract');
      if (repBlockC0) return { success: false, message: repBlockC0 };
    }
    let result: { success: boolean; message: string } = { success: false, message: '' };
    dispatch({
      type: 'FUNCTIONAL_UPDATE',
      updater: (prev) => {
        const contracts = [...(prev.factionContracts || [])];
        const idx = contracts.findIndex((c) => c.id === contractId);
        if (idx === -1) { result = { success: false, message: '找不到合同' }; return prev; }
        const contract = contracts[idx];
        if (!contract) { result = { success: false, message: '找不到合同' }; return prev; }
        const repBlockC = checkRepBlock(prev, contract.factionId, 'contract'); if (repBlockC) { result = { success: false, message: repBlockC }; return prev; }
        // 接取后独立计算完成期限
        let newExpires: number;
        if (contract.type === 'procurement') {
          const recipe = RECIPES.find((r) => r.id === contract.targetItemId);
          const prodTurns = recipe?.productionTurns || 1;
          // 完成期限 = 生产回合×数量 + 4~7 缓冲（覆盖生产 + 跃迁交付）
          newExpires = prev.turn + prodTurns * contract.targetQty + Math.floor(Math.random() * 4) + 4;
        } else {
          // 走私：接取后 7~10 回合完成
          newExpires = prev.turn + Math.floor(Math.random() * 4) + 7;
        }
        contracts[idx] = { ...contracts[idx], accepted: true, expiresTurn: newExpires };
        result = { success: true, message: '已接取合同，完成期限已重新计算' };
        return { ...prev, factionContracts: contracts };
      },
    });
    return result;
  }, [gameState, dispatch]);

  /** 提交合同（交付货物） */
  const completeContract = useCallback((shipIndex: number, contractId: string): { success: boolean; message: string } => {
    let result = { success: false, message: '' };
    dispatch({
      type: 'FUNCTIONAL_UPDATE',
      updater: (prev) => {
        const ships = [...prev.ships]; const s = { ...ships[shipIndex] };
        const contracts = [...(prev.factionContracts || [])];
        const idx = contracts.findIndex((c) => c.id === contractId);
        if (idx === -1) { result = { success: false, message: '合同不存在' }; return prev; }
        const contract = contracts[idx];
        if (!contract.accepted) { result = { success: false, message: '请先接取合同' }; return prev; }
        if (prev.turn > contract.expiresTurn) { result = { success: false, message: '合同已过期' }; return prev; }

        // 走私合同成功率判定（情报破译器 r_009 使走私必定成功）
        if (contract.type === 'smuggling') {
          const hasDecipherer = s.relics.some((r) => r.id === RELIC_DECIPHERER);
          const roll = Math.random();
          if (!hasDecipherer && roll > SMUGGLING_SUCCESS_RATE) {
            contracts.splice(idx, 1);
            const rep = ((prev.factionReputation || {})[contract.factionId] || 0) - 5;
            const factionReputation = { ...(prev.factionReputation || {}), [contract.factionId]: Math.max(-100, rep) };
            result = { success: false, message: `走私失败！声望-5（当前${rep}）` };
            return { ...prev, factionContracts: contracts, ships, factionReputation };
          }
        }

        // 扣除货物
        const isProduct = getContractItemKind(contract) === 'product';
        if (isProduct) {
          let remaining = contract.targetQty;
          s.products = s.products.filter((p) => {
            if (remaining <= 0) return true;
            if (p.productId === contract.targetItemId) { remaining--; return false; }
            return true;
          });
          if (remaining > 0) { result = { success: false, message: `库存不足，还需${remaining}个` }; return prev; }
        } else {
          // 特产库存
          const inv = (s.tradeStatus.inventory[contract.targetItemId] || 0);
          if (inv < contract.targetQty) { result = { success: false, message: `特产库存不足，需要${contract.targetQty}个` }; return prev; }
          s.tradeStatus.inventory = { ...s.tradeStatus.inventory };
          s.tradeStatus.inventory[contract.targetItemId] = inv - contract.targetQty;
          if (s.tradeStatus.inventory[contract.targetItemId] === 0) delete s.tradeStatus.inventory[contract.targetItemId];
        }

        // 发放奖励
        s.gold += contract.rewardGold;
        pushGoldLog(s, prev.turn, contract.rewardGold, '合同奖励');
        const repResult = applyRepChange(prev.factionReputation, prev.factionRepLog, contract.factionId, contract.rewardRep, 'contract');
        contracts.splice(idx, 1);
        ships[shipIndex] = s;
        result = { success: true, message: `合同完成！+${contract.rewardGold}金币，+${contract.rewardRep}声望` };
        return { ...prev, factionContracts: contracts, ships, ...(repResult || {}) };
      },
    });
    return result;
  }, [dispatch]);

  /** 黑市采购（仅走私合同可用） */
  const blackMarketBuy = useCallback((shipIndex: number, factionId: string, _itemId: string, qty: number): { success: boolean; message: string } => {
    let result = { success: false, message: '' };
    dispatch({
      type: 'FUNCTIONAL_UPDATE',
      updater: (prev) => {
        const ships = [...prev.ships]; const s = { ...ships[shipIndex] };
        const faction = prev.factions.find((f) => f.id === factionId);
        if (!faction) { result = { success: false, message: '势力不存在' }; return prev; }
        const buyBuffMult = getBuffMultiplier(prev.buyBuffs?.[factionId]); // 涨价buff（黑市也继承）
        // 黑市总价唯一真值 lib/turn/tradePrice.ts（末尾一次 ceil，显示侧同源）
        const cost = getBlackMarketTotal(factionId, prev.factionPrices, buyBuffMult, prev.blackMarketMultiplier || BLACK_MARKET_DEFAULT, qty);
        if (s.gold < cost) { result = { success: false, message: `金币不足，需${cost}` }; return prev; }
        s.gold -= cost;
        pushGoldLog(s, prev.turn, -cost, `黑市采购「${faction.specialtyName}」x${qty}`);
        s.tradeStatus = { ...s.tradeStatus };
        s.tradeStatus.inventory = { ...s.tradeStatus.inventory };
        s.tradeStatus.inventory[factionId] = (s.tradeStatus.inventory[factionId] || 0) + qty;
        ships[shipIndex] = s;
        result = { success: true, message: `黑市采购${faction.specialtyName} x${qty}，花费${cost}金币` };
        return { ...prev, ships };
      },
    });
    return result;
  }, [dispatch]);

  return { travelToNode, buySpecialty, sellSpecialty, exploreFaction, investFaction, gatherIntel, acceptContract, completeContract, blackMarketBuy };
}
