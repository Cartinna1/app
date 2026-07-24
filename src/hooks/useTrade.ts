import { useCallback } from 'react';
import type { GameState } from '@/types/game';
import { FACTIONS, getTravelTurns, getBuyPrice, getSellPrice, getInvestmentTier } from '@/data/factions';
import { rng } from '@/utils/prng';

export function useTrade(
  _gameState: GameState,
  dispatch: React.Dispatch<{ type: 'FUNCTIONAL_UPDATE'; updater: (state: GameState) => GameState }>
) {
  // 跃迁
  const travelToFaction = useCallback(
    (shipIndex: number, targetFactionId: string): { success: boolean; message: string } => {
      let result: { success: boolean; message: string } = { success: false, message: '' };
      dispatch({
        type: 'FUNCTIONAL_UPDATE',
        updater: (prev) => {
          const ships = [...prev.ships];
          const s = { ...ships[shipIndex] };
          s.tradeStatus = { ...s.tradeStatus };
          if (s.tradeStatus.travelTurnsRemaining > 0) {
            result = { success: false, message: '正在跃迁中，无法再次跃迁' };
            return prev;
          }
          if (s.tradeStatus.currentFactionId === targetFactionId) {
            result = { success: false, message: '已经在此势力' };
            return prev;
          }
          let turns = getTravelTurns(s.tradeStatus.currentFactionId, targetFactionId);
          // 引力锚定器：跃迁-1（最少1回合）
          if (s.installedModuleIds.includes('gravity_anchor')) turns = Math.max(1, turns - 1);
          // 跃迁加速器遗物：额外-1（最少1回合，可与引力锚定器叠加）
          if (s.relics.some((r) => r.id === 'r_010')) turns = Math.max(1, turns - 1);
          s.tradeStatus.targetFactionId = targetFactionId;
          s.tradeStatus.travelTurnsRemaining = turns;
          ships[shipIndex] = s;
          const targetFaction = FACTIONS.find((f) => f.id === targetFactionId);
          result = { success: true, message: `开始跃迁至${targetFaction?.name || '未知'}，预计${turns}回合后抵达` };
          return { ...prev, ships };
        },
      });
      return result;
    },
    [dispatch]
  );

  // 购买特产
  const buySpecialty = useCallback(
    (shipIndex: number, quantity: number): { success: boolean; message: string } => {
      let result: { success: boolean; message: string } = { success: false, message: '' };
      dispatch({
        type: 'FUNCTIONAL_UPDATE',
        updater: (prev) => {
          const ships = [...prev.ships];
          const s = { ...ships[shipIndex] };
          if (s.gold <= 0) { result = { success: false, message: '金币不足无法购买' }; return prev; }
          if (quantity <= 0) { result = { success: false, message: '数量必须大于0' }; return prev; }
          const faction = prev.factions.find((f) => f.id === s.tradeStatus.currentFactionId);
          if (!faction) { result = { success: false, message: '找不到当前势力' }; return prev; }
          const fs = s.tradeStatus.factionStates[faction.id];
          const invested = fs ? fs.invested : 0;
          const price = getBuyPrice(faction.id, invested, prev.factionPrices);
          const totalCost = price * quantity;
          if (s.gold < totalCost) { result = { success: false, message: `金币不足，需要${totalCost}金币` }; return prev; }
          s.gold -= totalCost;
          s.goldLog = [{ turn: prev.turn, amount: -totalCost, reason: `购买特产「${faction.specialtyName}」x${quantity}`, balanceAfter: s.gold }, ...s.goldLog].slice(0, 200);
          s.tradeStatus = { ...s.tradeStatus };
          s.tradeStatus.inventory = { ...s.tradeStatus.inventory };
          s.tradeStatus.inventory[faction.id] = (s.tradeStatus.inventory[faction.id] || 0) + quantity;
          ships[shipIndex] = s;
          result = { success: true, message: `购买${faction.specialtyName} x${quantity}，花费${totalCost}金币` };
          return { ...prev, ships };
        },
      });
      return result;
    },
    [dispatch]
  );

  // 出售特产
  const sellSpecialty = useCallback(
    (shipIndex: number, factionId: string, quantity: number): { success: boolean; message: string } => {
      let result: { success: boolean; message: string } = { success: false, message: '' };
      dispatch({
        type: 'FUNCTIONAL_UPDATE',
        updater: (prev) => {
          const ships = [...prev.ships];
          const s = { ...ships[shipIndex] };
          if (quantity <= 0) { result = { success: false, message: '数量必须大于0' }; return prev; }
          if (s.tradeStatus.currentFactionId === factionId) { result = { success: false, message: '不能在本地势力出售本地特产，请跃迁到其他势力再出售' }; return prev; }
          const invCount = s.tradeStatus.inventory[factionId] || 0;
          if (invCount < quantity) { result = { success: false, message: '库存不足' }; return prev; }
          const faction = prev.factions.find((f) => f.id === factionId);
          if (!faction) { result = { success: false, message: '找不到势力' }; return prev; }
          const sellPrice = getSellPrice(factionId, prev.factionPrices, prev.factionSellMultipliers);
          // 反垄断法案遗物：特产卖出+10%
          const relicBonus = s.relics.some((r) => r.id === 'r_014') ? 1.1 : 1;
          // 贸易枢纽协议：特产卖出+15%
          const tradeHubBonus = s.installedModuleIds.includes('trade_hub') ? 1.15 : 1;
          const totalRevenue = Math.round(sellPrice * quantity * relicBonus * tradeHubBonus);
          s.gold += totalRevenue;
          if (s.bankrupt && s.gold > 0) s.bankrupt = false;
          s.goldLog = [{ turn: prev.turn, amount: totalRevenue, reason: `卖出特产「${faction.specialtyName}」x${quantity}`, balanceAfter: s.gold }, ...s.goldLog].slice(0, 200);
          s.tradeStatus = { ...s.tradeStatus };
          s.tradeStatus.inventory = { ...s.tradeStatus.inventory };
          s.tradeStatus.inventory[factionId] = invCount - quantity;
          if (s.tradeStatus.inventory[factionId] === 0) delete s.tradeStatus.inventory[factionId];
          ships[shipIndex] = s;
          result = { success: true, message: `卖出特产「${faction.specialtyName}」x${quantity}，获得${totalRevenue}金币` };
          return { ...prev, ships };
        },
      });
      return result;
    },
    [dispatch]
  );

  // 探索
  const exploreFaction = useCallback(
    (shipIndex: number): { success: boolean; message: string } => {
      let result: { success: boolean; message: string } = { success: false, message: '' };
      dispatch({
        type: 'FUNCTIONAL_UPDATE',
        updater: (prev) => {
          const ships = [...prev.ships];
          const s = { ...ships[shipIndex] };
          if (s.tradeStatus.exploredThisTurn) { result = { success: false, message: '本回合已探索过，结束回合后可再次探索' }; return prev; }
          const matIds = ['carbon', 'gold_ore', 'oil', 'dark_matter', 'silicon', 'quantum'];
          const matNames: Record<string, string> = { carbon: '碳块', gold_ore: '黄金矿石', oil: '石油', dark_matter: '暗物质', silicon: '硅片', quantum: '量子簇' };
          const dropCount = Math.floor(rng() * 3) + 1;
          s.materials = { ...s.materials };
          const drops: string[] = [];
          for (let i = 0; i < dropCount; i++) {
            const mat = matIds[Math.floor(rng() * matIds.length)];
            const amount = Math.floor(rng() * 4) + 1;
            s.materials[mat] = (s.materials[mat] || 0) + amount;
            drops.push(`${amount}单位${matNames[mat]}`);
          }
          const exploreMsg = `探索获得原料：${drops.join('、')}`;
          s.tradeStatus = { ...s.tradeStatus, exploredThisTurn: true, lastExploreResult: exploreMsg };
          ships[shipIndex] = s;
          result = { success: true, message: exploreMsg };
          return { ...prev, ships };
        },
      });
      return result;
    },
    [dispatch]
  );

  // 投资
  const investFaction = useCallback(
    (shipIndex: number, amount: number): { success: boolean; message: string } => {
      let result: { success: boolean; message: string } = { success: false, message: '' };
      dispatch({
        type: 'FUNCTIONAL_UPDATE',
        updater: (prev) => {
          const ships = [...prev.ships];
          const s = { ...ships[shipIndex] };
          if (amount <= 0) { result = { success: false, message: '投资金额必须大于0' }; return prev; }
          if (s.gold < amount) { result = { success: false, message: '金币不足' }; return prev; }
          const factionId = s.tradeStatus.currentFactionId;
          const fs = s.tradeStatus.factionStates[factionId] || { factionId, invested: 0, investmentTier: 0 };
          const newInvested = Math.min(80000, fs.invested + amount);
          const actualAmount = newInvested - fs.invested;
          if (actualAmount <= 0) { result = { success: false, message: '投资已达上限（80000金币）' }; return prev; }
          s.gold -= actualAmount;
          const investFactionName = FACTIONS.find((f) => f.id === factionId)?.name || '未知';
          s.goldLog = [{ turn: prev.turn, amount: -actualAmount, reason: `投资「${investFactionName}」建设`, balanceAfter: s.gold }, ...s.goldLog].slice(0, 200);
          s.tradeStatus = { ...s.tradeStatus };
          s.tradeStatus.factionStates = { ...s.tradeStatus.factionStates };
          s.tradeStatus.factionStates[factionId] = { factionId, invested: newInvested, investmentTier: getInvestmentTier(newInvested) };
          ships[shipIndex] = s;
          const tier = getInvestmentTier(newInvested);
          const pct = Math.round((newInvested / 50000) * 100);
          result = { success: true, message: `投资${actualAmount}金币，累计${newInvested}（${pct}%），档位${tier}` };
          return { ...prev, ships };
        },
      });
      return result;
    },
    [dispatch]
  );

  // ==================== 打探消息小故事库 ====================
  const intelStories: Record<string, string[]> = {
    s1: [ // 绝密商机 +2000~5000
      '你在一家阴暗的"信息交易所"里，遇到了一位自称"情报之王"的神秘人物。他压低声音告诉你，帝国即将对一片星域进行封锁，某几种原料价格会暴涨。你连夜囤积，三天后价格翻了三倍。',
      '一位穿着太空站维护服的老人悄悄塞给你一张数据卡："这上面的坐标，藏着一个废弃的军工厂，里面有成吨的战略物资。"你带人前去，果然不虚此行。',
      '你在某个不具名的通讯频道里，截获了一段加密对话。破译后发现，两大星际集团即将签署一份天价采购合同。你提前在市场上布局，合同公布那天，你笑得合不拢嘴。',
    ],
    s2: [ // 军购大单 +1000~2000
      '当地酒吧里一个喝醉的军官大声嚷嚷着："下个月我们要换装了！旧装备全部低价处理！"你赶紧联系后勤部门，以极低的价格收购了一批还能用的设备，转手就赚了一笔。',
      '一位退役的舰队指挥官与你攀谈起来。他透露某支巡逻舰队即将扩编，对特定型号零件的需求会激增。你连夜进货，果然第二天就有人高价收购。',
      '你的船员在空间站的公告栏上发现了一张内部采购单。虽然大部分信息被涂黑了，但关键的数量和价格区间清晰可见。你据此在期货市场上小赚了一笔。',
    ],
    s3: [ // 稀有原料 +500~1000
      '你帮一位迷路的外星商人找到了他的泊位，作为感谢，他告诉你一条"当地人都不一定知道"的贸易路线。那条路上有几颗资源星球，原料价格只有市场价的一半。',
      '船员在废品回收站淘到了一块老旧的导航芯片。读取后发现，芯片上标记着一个未被登记的小行星带，探测器显示那里富含多种稀有矿物。你组织了小规模开采，收获颇丰。',
      '一位与你关系不错的空间站调度员偷偷告诉你："明天有艘货船提前到达，急着卸货，价格可以谈。"你准时到场，以一个相当不错的价格拿下了一船原料。',
    ],
    s4: [ // 小道消息 +200~500
      '你在茶歇时 overheard 两个贸易商谈论某种原料最近"走俏"。虽然信息不算明确，但你决定小赌一把，买了一批。结果一周后那种原料价格真的涨了一些。',
      '船员在空间站的公告板上看到了一则招工广告。虽然内容平平无奇，但上面列出的待遇和工期暗示了某个大型工程即将开工——这意味着短期内会有大量需求。你小赚了一笔。',
      '一位认识的老船长在告别时拍了拍你的肩膀："老弟，最近那个方向的航线不太平，但走私利润高得吓人。"虽然没有具体细节，但你决定冒险一试，结果还真让你碰上了。',
      '你的导航AI偶然截获了一段货运广播。虽然只是例行公事的物流信息，但你从中推断出了某种商品的供应趋势。你据此调整了自己的库存，赚了一笔小钱。',
    ],
    s5: [ // 假消息 -100~300
      '你花了不少金币从一个自称"包打听"的信息贩子那里买到了一份"独家情报"。结果那份情报三天前就在公共频道上免费发布了。你气得想找他理论，但他已经人间蒸发。',
      '一位看起来很专业的分析师给了你一个"稳赚不赔"的投资建议。你照做了，结果市场走势完全相反。后来你才知道，那人是竞争对手派来故意误导你的。',
      '船员兴冲冲地跑来告诉你他"打听到"一个千载难逢的机会。你抱着试试看的态度投了一些金币，结果那根本就是个已经过时的旧消息，钱打了水漂。',
    ],
    s6: [ // 过时情报 -300~600
      '你收到了一份加密情报，声称某支星际商队将在明天经过这片星域。你做好了"迎接"准备，结果等了一整天什么都没有等到。后来才知道，那份情报的日期印错了，是上周的消息。',
      '你按照一份"可靠线人"提供的市场分析进行操作，结果亏了一大笔。后来那位线人抱歉地告诉你："抱歉，那份数据是三个月前的，我没注意到。"你无言以对。',
      '一家看起来很正规的情报机构卖给你一份"实时市场动态"。你花了大价钱买下，结果发现里面的数据全都是一周前的。等你反应过来，机构已经注销了账户。',
    ],
    s7: [ // 陷阱 -600~1000
      '你收到了一条匿名消息："想知道赚钱的秘诀吗？来老地方找我。"你到了约定的废弃船坞，结果迎接你的是一群持械歹徒。虽然你勉强逃脱，但金币被他们搜刮一空。',
      '一位自称是"星际联盟特派员"的人找到你，声称你涉嫌走私，需要缴纳"保证金"才能洗清嫌疑。你虽然觉得可疑，但不想惹麻烦，交了一笔钱后对方就消失了。你意识到被骗了。',
      '你收到了一封看起来很官方的邮件，说你的银行账户存在异常，需要"验证身份"。你按提示操作后，发现账户里的金币被转走了大半。这是一起精心设计的网络钓鱼骗局。',
    ],
    s8: [ // 诈骗圈套 -1000~1500
      '你参加了一个"高回报投资研讨会"。会场上所有人都在谈论赚了多少多少钱，你被气氛感染，投入了所有积蓄。结果第二天，整个组织连同你的钱一起消失得无影无踪。',
      '一位自称是失落文明后裔的神秘人物出现在你的船上，声称掌握着通往"远古宝藏"的星图。你只需要"赞助"他的研究。你鬼迷心窍地答应了，结果换来的是一张画满涂鸦的废纸。',
    ],
  };

  // 打探消息
  const gatherIntel = useCallback(
    (shipIndex: number): { success: boolean; message: string; goldChange: number } => {
      let result: { success: boolean; message: string; goldChange: number } = { success: false, message: '', goldChange: 0 };
      dispatch({
        type: 'FUNCTIONAL_UPDATE',
        updater: (prev) => {
          const ships = [...prev.ships];
          const s = { ...ships[shipIndex] };
          const currentFid = s.tradeStatus.currentFactionId;
          if (s.tradeStatus.intelGatheredInFaction === currentFid) { result = { success: false, message: '在此势力已打探过消息，跃迁到新势力后可再次打探', goldChange: 0 }; return prev; }
          s.tradeStatus = { ...s.tradeStatus, intelGatheredInFaction: currentFid };
          const turnMultiplier = 1 + prev.turn * 0.08;
          const roll = rng() * 100;
          let goldChange = 0;
          let story = '';
          const pick = (arr: string[]) => arr[Math.floor(rng() * arr.length)];
          if (roll < 2) { goldChange = Math.round((Math.floor(rng() * 3001) + 2000) * turnMultiplier); story = pick(intelStories.s1); }
          else if (roll < 10) { goldChange = Math.round((Math.floor(rng() * 1001) + 1000) * turnMultiplier); story = pick(intelStories.s2); }
          else if (roll < 25) { goldChange = Math.round((Math.floor(rng() * 501) + 500) * turnMultiplier); story = pick(intelStories.s3); }
          else if (roll < 55) { goldChange = Math.round((Math.floor(rng() * 301) + 200) * turnMultiplier); story = pick(intelStories.s4); }
          else if (roll < 75) { goldChange = -Math.round((Math.floor(rng() * 201) + 100) * turnMultiplier); story = pick(intelStories.s5); }
          else if (roll < 90) { goldChange = -Math.round((Math.floor(rng() * 301) + 300) * turnMultiplier); story = pick(intelStories.s6); }
          else if (roll < 98) { goldChange = -Math.round((Math.floor(rng() * 401) + 600) * turnMultiplier); story = pick(intelStories.s7); }
          else { goldChange = -Math.round((Math.floor(rng() * 501) + 1000) * turnMultiplier); story = pick(intelStories.s8); }

          // 饥荒buff：金币收益减半
          const famineHalve = (amt: number): number => {
            if (amt <= 0) return amt;
            if (s.food < 0) return Math.floor(amt * 0.5);
            return amt;
          };
          const checkBankrupt = () => { if (s.gold < 0 && !s.bankrupt) { s.bankrupt = true; s.bankruptTimer = 10; } };
          const finalGold = famineHalve(goldChange);

          if (finalGold !== 0) {
            s.gold += finalGold;
            checkBankrupt();
            if (s.gold >= 0 && s.bankrupt) { s.bankrupt = false; s.bankruptTimer = 0; }
            s.goldLog = [{ turn: prev.turn, amount: finalGold, reason: `打探消息`, balanceAfter: s.gold }, ...s.goldLog].slice(0, 200);
          }

          // 额外合金奖励：70%概率给3-5合金
          let alloyText = '';
          if (rng() < 0.7) {
            const alloyGain = Math.floor(rng() * 3) + 3; // 3-5
            s.alloy += alloyGain;
            alloyText = `顺便回收了 ${alloyGain} 个合金。`;
          }

          const goldText = finalGold > 0 ? `获得了 +${finalGold} 金币。` : finalGold < 0 ? `损失了 ${finalGold} 金币。` : '';
          const message = `${story}${alloyText ? ' ' + alloyText : ''} ${goldText}`;

          s.tradeStatus = { ...s.tradeStatus, intelGatheredInFaction: currentFid, lastIntelResult: { message, goldChange: finalGold } };
          ships[shipIndex] = s;
          result = { success: true, message, goldChange: finalGold };
          return { ...prev, ships };
        },
      });
      return result;
    },
    [dispatch]
  );
  return { travelToFaction, buySpecialty, sellSpecialty, exploreFaction, investFaction, gatherIntel };
}
