import { useCallback } from 'react';
import type { GameState } from '@/types/game';
import { FACTIONS, getTravelTurns, getSellPrice, RELATION_MATRIX, getReputationTier } from '@/data/factions';
import { RECIPES } from '@/data/gameData';


export function useTrade(
  dispatch: React.Dispatch<{ type: 'FUNCTIONAL_UPDATE'; updater: (state: GameState) => GameState }>
) {
  /** 应用声望变化（带回合上限管控和零和传导） */
  function applyRepChange(
    prev: GameState,
    factionId: string,
    delta: number,
    repLog: Record<string, number>,
    capKey: 'buy' | 'invest' | 'contract' = 'buy'
  ) {
    const rep = { ...prev.factionReputation };
    const log = { ...repLog };
    const caps: Record<string, number> = { buy: 2, invest: 10, contract: 99 };
    const cap = caps[capKey] || 99;
    const logKey = `${factionId}_${capKey}`; // 区分动作类型的独立上限
    const cur = log[logKey] || 0;
    const applied = delta > 0 ? Math.min(delta, cap - cur) : delta;
    if (applied === 0) return;
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
    prev.factionReputation = rep;
    prev.factionRepLog = log;
  }

  function ensureRepFields(prev: GameState) {
    if (!prev.factionReputation) prev.factionReputation = {};
    if (!prev.factionRepLog) prev.factionRepLog = {};
    if (!prev.factionContracts) prev.factionContracts = [];
  }

  function checkRepBlock(prev: GameState, factionId: string, action: string): string | null {
    const rep = (prev.factionReputation || {})[factionId] || 0;
    // 宿敌 -100~-91：拒绝一切操作（含跃迁）
    if (rep <= -91) return '宿敌势力拒绝与你交易';
    // 恶意 -90~-51：可跃迁、可投资，其余拒绝
    if (rep >= -90 && rep <= -51) {
      if (action === 'travel' || action === 'invest') return null;
      return '恶意势力拒绝此项操作';
    }
    // 敌意 -50~-21：可跃迁、可购买、可投资，其余拒绝
    if (rep >= -50 && rep <= -21) {
      if (action === 'buy' || action === 'invest' || action === 'travel') return null;
      return '敌意势力拒绝此项操作';
    }
    if (rep < 0 && action === 'intel') return '该势力不信任你，无法打探消息';
    return null;
  }

  // 跃迁
  const travelToFaction = useCallback(
    (shipIndex: number, targetFactionId: string): { success: boolean; message: string } => {
      let result: { success: boolean; message: string } = { success: false, message: '' };
      dispatch({
        type: 'FUNCTIONAL_UPDATE',
        updater: (prev) => {
          const ships = [...prev.ships]; const s = { ...ships[shipIndex] };
          const repBlockT = checkRepBlock(prev, targetFactionId, 'travel'); if (repBlockT) { result = { success: false, message: repBlockT }; return prev; }
          s.tradeStatus = { ...s.tradeStatus };
          if (s.tradeStatus.travelTurnsRemaining > 0) { result = { success: false, message: '正在跃迁中' }; return prev; }
          if (s.tradeStatus.currentFactionId === targetFactionId) { result = { success: false, message: '已在此势力' }; return prev; }
          let turns = getTravelTurns(s.tradeStatus.currentFactionId, targetFactionId);
          if (s.installedModuleIds.includes('gravity_anchor')) turns = Math.max(1, turns - 1);
          if (s.relics.some((r) => r.id === 'r_010')) turns = Math.max(1, turns - 1);
          s.tradeStatus.targetFactionId = targetFactionId;
          s.tradeStatus.travelTurnsRemaining = turns;
          ships[shipIndex] = s;
          result = { success: true, message: `开始跃迁，预计${turns}回合后抵达` };
          return { ...prev, ships };
        },
      });
      return result;
    }, [dispatch]);

  // 购买特产（含声望折扣）
  const buySpecialty = useCallback(
    (shipIndex: number, quantity: number): { success: boolean; message: string } => {
      let result: { success: boolean; message: string } = { success: false, message: '' };
      dispatch({
        type: 'FUNCTIONAL_UPDATE',
        updater: (prev) => {
          const ships = [...prev.ships]; const s = { ...ships[shipIndex] };
          if (s.gold <= 0) { result = { success: false, message: '金币不足' }; return prev; }
          if (quantity <= 0) { result = { success: false, message: '数量必须大于0' }; return prev; }
          const faction = prev.factions.find((f) => f.id === s.tradeStatus.currentFactionId);
          if (!faction) { result = { success: false, message: '找不到势力' }; return prev; }
          const repBlockB = checkRepBlock(prev, faction.id, 'buy'); if (repBlockB) { result = { success: false, message: repBlockB }; return prev; }
          // 库存校验
          const available = prev.buyStocks?.[faction.id] ?? 0;
          if (quantity > available) { result = { success: false, message: `库存不足，本回合仅剩${available}个` }; return prev; }
          // 价格：市场价 × 声望折扣 × 涨价buff
          const rep = prev.factionReputation?.[faction.id] || 0;
          const tier = getReputationTier(rep);
          let price = prev.factionPrices[faction.id] || faction.basePrice;
          if (rep < -20) price = Math.ceil(price * (1 - tier.discount)); // 负声望涨价
          else if (tier.discount > 0) price = Math.ceil(price * (1 - tier.discount)); // 正声望打折
          const buyBuffMult = (prev.buyBuffs?.[faction.id] || []).reduce((m, b) => m * b.multiplier, 1);
          price = Math.ceil(price * buyBuffMult);
          const totalCost = price * quantity;
          if (s.gold < totalCost) { result = { success: false, message: `金币不足，需${totalCost}` }; return prev; }
          s.gold -= totalCost;
          s.goldLog = [{ turn: prev.turn, amount: -totalCost, reason: `购买「${faction.specialtyName}」x${quantity}`, balanceAfter: s.gold }, ...s.goldLog].slice(0, 200);
          s.tradeStatus = { ...s.tradeStatus };
          s.tradeStatus.inventory = { ...s.tradeStatus.inventory };
          s.tradeStatus.inventory[faction.id] = (s.tradeStatus.inventory[faction.id] || 0) + quantity;
          // 扣库存
          prev.buyStocks = { ...(prev.buyStocks || {}) };
          prev.buyStocks[faction.id] = available - quantity;
          // 触发涨价判定（本回合累计购买 ≥ 初始库存 60%）
          const maxStock = prev.buyStockMax?.[faction.id] || 0;
          const used = maxStock - prev.buyStocks[faction.id];
          const triggered = maxStock > 0 && !prev.buyTriggered?.[faction.id] && used >= maxStock * 0.6;
          if (triggered) {
            prev.buyTriggered = { ...(prev.buyTriggered || {}), [faction.id]: true };
            prev.buyBuffs = { ...(prev.buyBuffs || {}) };
            prev.buyBuffs[faction.id] = [...(prev.buyBuffs[faction.id] || []), { multiplier: 2.5, expiresTurn: prev.turn + 15 }];
          }
          ensureRepFields(prev);
          applyRepChange(prev, faction.id, 2, prev.factionRepLog, 'buy');
          ships[shipIndex] = s;
          result = { success: true, message: `购买${faction.specialtyName} x${quantity}，花费${totalCost}金币${triggered ? '。⚠ 购买量已达本回合库存60%，下回合起购买价×2.5（持续15回合）' : ''}` };
          return { ...prev, ships };
        },
      });
      return result;
    }, [dispatch]);

  // 出售特产
  const sellSpecialty = useCallback(
    (shipIndex: number, factionId: string, quantity: number): { success: boolean; message: string } => {
      let result: { success: boolean; message: string } = { success: false, message: '' };
      dispatch({
        type: 'FUNCTIONAL_UPDATE',
        updater: (prev) => {
          const ships = [...prev.ships]; const s = { ...ships[shipIndex] };
          if (quantity <= 0) { result = { success: false, message: '数量必须大于0' }; return prev; }
          const repBlockS = checkRepBlock(prev, s.tradeStatus.currentFactionId, 'sell'); if (repBlockS) { result = { success: false, message: repBlockS }; return prev; }
          if (s.tradeStatus.currentFactionId === factionId) { result = { success: false, message: '不能在本地势力出售' }; return prev; }
          const curFid = s.tradeStatus.currentFactionId;
          // 需求校验（按停靠势力，不分特产种类）
          const remaining = prev.sellDemands?.[curFid] ?? 0;
          if (quantity > remaining) { result = { success: false, message: `本回合需求已满足，仅剩${remaining}个配额` }; return prev; }
          const invCount = s.tradeStatus.inventory[factionId] || 0;
          if (invCount < quantity) { result = { success: false, message: '库存不足' }; return prev; }
          const faction = prev.factions.find((f) => f.id === factionId);
          if (!faction) { result = { success: false, message: '找不到势力' }; return prev; }
          const sellPrice = getSellPrice(factionId, prev.factionPrices, prev.factionSellMultipliers);
          const sellBuffMult = (prev.sellBuffs?.[curFid] || []).reduce((m, b) => m * b.multiplier, 1);
          const relicBonus = s.relics.some((r) => r.id === 'r_014') ? 1.1 : 1;
          const tradeHubBonus = s.installedModuleIds.includes('trade_hub') ? 1.15 : 1;
          const totalRevenue = Math.round(sellPrice * quantity * relicBonus * tradeHubBonus * sellBuffMult);
          s.gold += totalRevenue;
          if (s.bankrupt && s.gold > 0) s.bankrupt = false;
          s.goldLog = [{ turn: prev.turn, amount: totalRevenue, reason: `卖出「${faction.specialtyName}」x${quantity}`, balanceAfter: s.gold }, ...s.goldLog].slice(0, 200);
          s.tradeStatus = { ...s.tradeStatus };
          s.tradeStatus.inventory = { ...s.tradeStatus.inventory };
          s.tradeStatus.inventory[factionId] = invCount - quantity;
          if (s.tradeStatus.inventory[factionId] === 0) delete s.tradeStatus.inventory[factionId];
          // 扣需求
          prev.sellDemands = { ...(prev.sellDemands || {}) };
          prev.sellDemands[curFid] = remaining - quantity;
          // 触发降价判定（本回合累计卖出 ≥ 初始需求 50%）
          const maxDemand = prev.sellDemandMax?.[curFid] || 0;
          const sold = maxDemand - prev.sellDemands[curFid];
          const triggered = maxDemand > 0 && !prev.sellTriggered?.[curFid] && sold >= maxDemand * 0.5;
          if (triggered) {
            prev.sellTriggered = { ...(prev.sellTriggered || {}), [curFid]: true };
            prev.sellBuffs = { ...(prev.sellBuffs || {}) };
            prev.sellBuffs[curFid] = [...(prev.sellBuffs[curFid] || []), { multiplier: 0.3, expiresTurn: prev.turn + 15 }];
          }
          ships[shipIndex] = s;
          result = { success: true, message: `卖出${faction.specialtyName} x${quantity}，获得${totalRevenue}金币${triggered ? '。⚠ 卖出量已达本回合需求50%，下回合起收购价×0.3（持续15回合）' : ''}` };
          return { ...prev, ships };
        },
      });
      return result;
    }, [dispatch]);

  // 探索
  const exploreFaction = useCallback(
    (shipIndex: number): { success: boolean; message: string } => {
      let result: { success: boolean; message: string } = { success: false, message: '' };
      dispatch({
        type: 'FUNCTIONAL_UPDATE',
        updater: (prev) => {
          const ships = [...prev.ships]; const s = { ...ships[shipIndex] };
          const repBlockEx = checkRepBlock(prev, s.tradeStatus.currentFactionId, 'explore'); if (repBlockEx) { result = { success: false, message: repBlockEx }; return prev; }
          if (s.tradeStatus.exploredThisTurn) { result = { success: false, message: '本回合已探索过' }; return prev; }
          const matIds = ['carbon', 'gold_ore', 'oil', 'dark_matter', 'silicon', 'quantum'];
          const matNames: Record<string, string> = { carbon: '碳块', gold_ore: '黄金矿石', oil: '石油', dark_matter: '暗物质', silicon: '硅片', quantum: '量子簇' };
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
    }, [dispatch]);

  // 声望投资：8000金币=1声望，每回合上限+10
  const investFaction = useCallback(
    (shipIndex: number, amount: number): { success: boolean; message: string } => {
      let result: { success: boolean; message: string } = { success: false, message: '' };
      dispatch({
        type: 'FUNCTIONAL_UPDATE',
        updater: (prev) => {
          const ships = [...prev.ships]; const s = { ...ships[shipIndex] };
          if (amount <= 0) { result = { success: false, message: '投资金额必须大于0' }; return prev; }
          if (s.gold < amount) { result = { success: false, message: '金币不足' }; return prev; }
          const factionId = s.tradeStatus.currentFactionId;
          const repBlockInv = checkRepBlock(prev, factionId, 'invest'); if (repBlockInv) { result = { success: false, message: repBlockInv }; return prev; }
          ensureRepFields(prev);
          const maxPerTurn = 10;
          const used = (prev.factionRepLog || {})[factionId + '_invest'] || 0;
          if (used >= maxPerTurn) { result = { success: false, message: `本回合已投资${maxPerTurn}次，下次回合再来` }; return prev; }
          const repGain = 1; // 每次投资固定 +1 声望
          if (s.gold < 8000) { result = { success: false, message: '至少需要8000金币' }; return prev; }
          const actualAmount = 8000;
          s.gold -= actualAmount;
          const factionName = FACTIONS.find((f) => f.id === factionId)?.name || factionId;
          s.goldLog = [{ turn: prev.turn, amount: -actualAmount, reason: `投资「${factionName}」`, balanceAfter: s.gold }, ...s.goldLog].slice(0, 200);
          applyRepChange(prev, factionId, repGain, prev.factionRepLog, 'invest');
          ships[shipIndex] = s;
          const repNow = prev.factionReputation[factionId] || 0;
          result = { success: true, message: `投资${actualAmount}金币，声望+${repGain}（当前${repNow}）` };
          return { ...prev, ships };
        },
      });
      return result;
    }, [dispatch]);

  // ==================== 打探消息 ====================
  const intelStories: Record<string, string[]> = {
    s1: ['你在一家阴暗的"信息交易所"里，遇到了一位自称"情报之王"的神秘人物。他压低声音告诉你，帝国即将对一片星域进行封锁，某几种原料价格会暴涨。你连夜囤积，三天后价格翻了三倍。','一位穿着太空站维护服的老人悄悄塞给你一张数据卡："这上面的坐标，藏着一个废弃的军工厂，里面有成吨的战略物资。"你带人前去，果然不虚此行。','你在某个不具名的通讯频道里，截获了一段加密对话。破译后发现，两大星际集团即将签署一份天价采购合同。你提前在市场上布局，合同公布那天，你笑得合不拢嘴。'],
    s2: ['当地酒吧里一个喝醉的军官大声嚷嚷着："下个月我们要换装了！旧装备全部低价处理！"你赶紧联系后勤部门，以极低的价格收购了一批还能用的设备，转手就赚了一笔。','一位退役的舰队指挥官与你攀谈起来。他透露某支巡逻舰队即将扩编，对特定型号零件的需求会激增。你连夜进货，果然第二天就有人高价收购。','你的船员在空间站的公告栏上发现了一张内部采购单。虽然大部分信息被涂黑了，但关键的数量和价格区间清晰可见。你据此在期货市场上小赚了一笔。'],
    s3: ['你帮一位迷路的外星商人找到了他的泊位，作为感谢，他告诉你一条"当地人都不一定知道"的贸易路线。那条路上有几颗资源星球，原料价格只有市场价的一半。','船员在废品回收站淘到了一块老旧的导航芯片。读取后发现，芯片上标记着一个未被登记的小行星带，探测器显示那里富含多种稀有矿物。你组织了小规模开采，收获颇丰。','一位与你关系不错的空间站调度员偷偷告诉你："明天有艘货船提前到达，急着卸货，价格可以谈。"你准时到场，以一个相当不错的价格拿下了一船原料。'],
    s4: ['你在茶歇时 overheard 两个贸易商谈论某种原料最近"走俏"。虽然信息不算明确，但你决定小赌一把，买了一批。结果一周后那种原料价格真的涨了一些。','船员在空间站的公告板上看到了一则招工广告。虽然内容平平无奇，但上面列出的待遇和工期暗示了某个大型工程即将开工——这意味着短期内会有大量需求。你小赚了一笔。','一位认识的老船长在告别时拍了拍你的肩膀："老弟，最近那个方向的航线不太平，但走私利润高得吓人。"虽然没有具体细节，但你决定冒险一试，结果还真让你碰上了。','你的导航AI偶然截获了一段货运广播。虽然只是例行公事的物流信息，但你从中推断出了某种商品的供应趋势。你据此调整了自己的库存，赚了一笔小钱。'],
    s5: ['你花了不少金币从一个自称"包打听"的信息贩子那里买到了一份"独家情报"。结果那份情报三天前就在公共频道上免费发布了。你气得想找他理论，但他已经人间蒸发。','一位看起来很专业的分析师给了你一个"稳赚不赔"的投资建议。你照做了，结果市场走势完全相反。后来你才知道，那人是竞争对手派来故意误导你的。','船员兴冲冲地跑来告诉你他"打听到"一个千载难逢的机会。你抱着试试看的态度投了一些金币，结果那根本就是个已经过时的旧消息，钱打了水漂。'],
    s6: ['你收到了一份加密情报，声称某支星际商队将在明天经过这片星域。你做好了"迎接"准备，结果等了一整天什么都没有等到。后来才知道，那份情报的日期印错了，是上周的消息。','你按照一份"可靠线人"提供的市场分析进行操作，结果亏了一大笔。后来那位线人抱歉地告诉你："抱歉，那份数据是三个月前的，我没注意到。"你无言以对。','一家看起来很正规的情报机构卖给你一份"实时市场动态"。你花了大价钱买下，结果发现里面的数据全都是一周前的。等你反应过来，机构已经注销了账户。'],
    s7: ['你收到了一条匿名消息："想知道赚钱的秘诀吗？来老地方找我。"你到了约定的废弃船坞，结果迎接你的是一群持械歹徒。虽然你勉强逃脱，但金币被他们搜刮一空。','一位自称是"星际联盟特派员"的人找到你，声称你涉嫌走私，需要缴纳"保证金"才能洗清嫌疑。你虽然觉得可疑，但不想惹麻烦，交了一笔钱后对方就消失了。你意识到被骗了。','你收到了一封看起来很官方的邮件，说你的银行账户存在异常，需要"验证身份"。你按提示操作后，发现账户里的金币被转走了大半。这是一起精心设计的网络钓鱼骗局。'],
    s8: ['你参加了一个"高回报投资研讨会"。会场上所有人都在谈论赚了多少多少钱，你被气氛感染，投入了所有积蓄。结果第二天，整个组织连同你的钱一起消失得无影无踪。','一位自称是失落文明后裔的神秘人物出现在你的船上，声称掌握着通往"远古宝藏"的星图。你只需要"赞助"他的研究。你鬼迷心窍地答应了，结果换来的是一张画满涂鸦的废纸。'],
  };

  const gatherIntel = useCallback(
    (shipIndex: number): { success: boolean; message: string; goldChange: number } => {
      let result: { success: boolean; message: string; goldChange: number } = { success: false, message: '', goldChange: 0 };
      dispatch({
        type: 'FUNCTIONAL_UPDATE',
        updater: (prev) => {
          const ships = [...prev.ships]; const s = { ...ships[shipIndex] };
          const currentFid = s.tradeStatus.currentFactionId;
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
          const famineHalve = (amt: number): number => { if (amt <= 0) return amt; if (s.food < 0) return Math.floor(amt * 0.5); return amt; };
          const checkBankrupt = () => { if (s.gold < 0 && !s.bankrupt) { s.bankrupt = true; s.bankruptTimer = 10; } };
          const finalGold = famineHalve(goldChange);
          if (finalGold !== 0) { s.gold += finalGold; checkBankrupt(); if (s.gold >= 0 && s.bankrupt) { s.bankrupt = false; s.bankruptTimer = 0; } s.goldLog = [{ turn: prev.turn, amount: finalGold, reason: '打探消息', balanceAfter: s.gold }, ...s.goldLog].slice(0, 200); }
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
    }, [dispatch]);

  // ==================== 合同系统 ====================

  /** 接取合同（接取后从当前回合重新计算完成期限） */
  const acceptContract = useCallback((contractId: string): { success: boolean; message: string } => {
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
  }, [dispatch]);

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

        // 走私合同成功率判定
        if (contract.type === 'smuggling') {
          const roll = Math.random();
          if (roll > 0.65) {
            contracts.splice(idx, 1);
            ensureRepFields(prev);
            const rep = (prev.factionReputation[contract.factionId] || 0) - 5;
            prev.factionReputation = { ...prev.factionReputation };
            prev.factionReputation[contract.factionId] = Math.max(-100, rep);
            result = { success: false, message: `走私失败！声望-5（当前${rep}）` };
            return { ...prev, factionContracts: contracts, ships };
          }
        }

        // 扣除货物
        const isProduct = contract.targetItemId.startsWith('p');
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
        s.goldLog = [{ turn: prev.turn, amount: contract.rewardGold, reason: '合同奖励', balanceAfter: s.gold }, ...s.goldLog].slice(0, 200);
        ensureRepFields(prev);
        applyRepChange(prev, contract.factionId, contract.rewardRep, prev.factionRepLog, 'contract');
        contracts.splice(idx, 1);
        ships[shipIndex] = s;
        result = { success: true, message: `合同完成！+${contract.rewardGold}金币，+${contract.rewardRep}声望` };
        return { ...prev, factionContracts: contracts, ships };
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
        const basePrice = prev.factionPrices[factionId] || faction.basePrice;
        const buyBuffMult = (prev.buyBuffs?.[factionId] || []).reduce((m, b) => m * b.multiplier, 1); // 涨价buff（黑市也继承）
        const mult = prev.blackMarketMultiplier || 3.2; // 黑市倍率（每回合随机 3.2~4.5）
        const cost = Math.ceil(basePrice * buyBuffMult * mult * qty);
        if (s.gold < cost) { result = { success: false, message: `金币不足，需${cost}` }; return prev; }
        s.gold -= cost;
        s.goldLog = [{ turn: prev.turn, amount: -cost, reason: `黑市采购「${faction.specialtyName}」x${qty}`, balanceAfter: s.gold }, ...s.goldLog].slice(0, 200);
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

  return { travelToFaction, buySpecialty, sellSpecialty, exploreFaction, investFaction, gatherIntel, acceptContract, completeContract, blackMarketBuy };
}
