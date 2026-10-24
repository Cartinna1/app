'use strict';
/* ============================================================================
   雇佣兵协会 · 第 2a 步验收（数据表 + 批次生成 + 冷却 + 期限 + 文案，纯函数层）
   用法：node --import ./scripts/register-ts.mjs scripts/check-mercenary.cjs
   覆盖：
     ① 数据表：14 条齐全 / 三类数量 5·5·4 / id 唯一 / 必需字段齐全 / enemyId 与档位匹配
     ② 唯一查询口：allBountyDefs / getBountyDef（未知 id → undefined）
     ③ **确定性**：同一个 state 连续两次 buildBountyBatch 结果完全一致（不含 Math.random）
     ④ 换批：turn 跨过 BOUNTY_REFRESH_TURNS 后批次不同；未到刷新点原样沿用旧榜单
     ⑤ 头目冷却：冷却中的头目不进候选池；四支全冷却 → 本批 2 条 + 兜底提示文案
     ⑥ 期限：expireBounties 只删超期项、不动未超期项、无过期时原引用返回
     ⑦ 文案：bountyExpiryText 最后 1 回合显示「剩 1 回合」；bountyRewardText 三档
   说明：本步**不接线**（没有 UI、没有 reducer action、没有 dispatch）——只验纯函数。
   ============================================================================ */
const fails = [];
const check = (ok, label, detail) => {
  if (ok) console.log('  ✓ ' + label);
  else { fails.push(label + (detail ? ' → ' + detail : '')); console.log('  ✗ ' + label + (detail ? '  → ' + detail : '')); }
};
const J = (v) => JSON.stringify(v);
const eq = (a, b) => J(a) === J(b);

(async () => {
  const { createInitialGameState } = await import('@/hooks/gameReducer');
  const B = await import('@/lib/turn/bounties');
  const DATA = await import('@/data/mercenary/bounties');
  const BOSSES = await import('@/data/mercenary/bosses');

  /** 造一个只改 turn / bounties 的 state（其余用新开局） */
  const mkState = (turn, bounties) => ({
    ...createInitialGameState(),
    turn,
    bounties: bounties || { batchTurn: 0, offered: [], active: [], bossCooldown: {} },
  });

  // ---------- ① 数据表 ----------
  console.log('\n[1] 悬赏数据表（14 条 / 5·5·4 / id 唯一 / 字段齐全）');
  const defs = B.allBountyDefs();
  check(defs.length === 14, '共 14 条悬赏定义', String(defs.length));
  const byKind = { pirate: 0, raid: 0, elite: 0 };
  for (const d of defs) byKind[d.kind] += 1;
  check(byKind.pirate === 5 && byKind.raid === 5 && byKind.elite === 4,
    '三类数量是 清剿 5 / 截击 5 / 头目 4', J(byKind));
  const ids = defs.map((d) => d.id);
  check(new Set(ids).size === ids.length, 'id 全表唯一', J(ids.filter((x, i) => ids.indexOf(x) !== i)));
  // id 前缀与 kind 必须一一对应（bty_p* / bty_r* / bty_e*）
  const prefixOf = { pirate: 'bty_p', raid: 'bty_r', elite: 'bty_e' };
  check(defs.every((d) => d.id.startsWith(prefixOf[d.kind])), 'id 前缀与 kind 一一对应（bty_p / bty_r / bty_e）',
    J(defs.filter((d) => !d.id.startsWith(prefixOf[d.kind])).map((d) => d.id)));
  // 必需字段
  const fieldOk = (d) => typeof d.title === 'string' && d.title.length > 0
    && typeof d.desc === 'string' && d.desc.length > 0
    && d.difficulty >= 1 && d.difficulty <= 4
    && typeof d.enemyId === 'string' && d.enemyId.length > 0
    && typeof d.deadlineTurns === 'number' && d.deadlineTurns >= 8 && d.deadlineTurns <= 15
    && typeof d.rewardGold === 'number' && d.rewardGold > 0
    && typeof d.rewardStardust === 'number' && d.rewardStardust > 0;
  check(defs.every(fieldOk), '每条都有 title/desc/difficulty/enemyId/deadlineTurns/reward*',
    J(defs.filter((d) => !fieldOk(d)).map((d) => d.id)));
  check(defs.every((d) => d.kind !== 'elite' || d.requireCardCount === 20), '头目档四条的接取门槛都是卡库 20 艘',
    J(defs.filter((d) => d.kind === 'elite').map((d) => d.requireCardCount)));
  check(defs.every((d) => d.kind === 'elite' || d.requireCardCount === undefined), '其余两档没有接取门槛');
  check(defs.every((d) => d.deadlineTurns >= 8 && d.deadlineTurns <= 15), '期限都落在 8~15 回合（文档区间）',
    J(defs.map((d) => d.deadlineTurns)));
  // enemyId 与档位匹配：清剿 → m05、截击 → raid、头目 → m01~m04
  check(defs.filter((d) => d.kind === 'pirate').every((d) => d.enemyId === 'm05'), '清剿档的敌人全是 m05');
  check(defs.filter((d) => d.kind === 'raid').every((d) => d.enemyId === 'raid'), '截击档的敌人全是 raid');
  check(eq(defs.filter((d) => d.kind === 'elite').map((d) => d.enemyId).sort(), ['m01', 'm02', 'm03', 'm04']),
    '头目档四条分别对应 m01~m04', J(defs.filter((d) => d.kind === 'elite').map((d) => d.enemyId)));

  // ---------- ② 唯一查询口 ----------
  console.log('\n[2] 唯一查询口（allBountyDefs / getBountyDef）');
  check(B.getBountyDef('bty_e1') !== undefined && B.getBountyDef('bty_e1').title === '巢要挪窝了',
    'getBountyDef 能取到定义', J(B.getBountyDef('bty_e1') && B.getBountyDef('bty_e1').title));
  check(B.getBountyDef('bty_不存在') === undefined, '未知 id 返回 undefined（不抛）');
  check(eq(DATA.BOUNTY_DEFS, defs), '数据文件与查询口是同一份（allBountyDefs 就是 BOUNTY_DEFS）');

  // ---------- ③ 确定性 ----------
  console.log('\n[3] 批次确定性（同 state → 完全一致，不吃 Math.random）');
  const s20 = mkState(20);
  const a1 = B.buildBountyBatch(s20);
  const a2 = B.buildBountyBatch(s20);
  check(eq(a1, a2), '同一 state 连续两次 buildBountyBatch 结果完全相同', J(a1) + ' vs ' + J(a2));
  check(a1.offered.length === 3 && a1.batchTurn === 20, '首批发 3 条且 batchTurn = 当前回合',
    J({ n: a1.offered.length, batchTurn: a1.batchTurn }));
  // 三个档次各 1 条，且互不重复
  const kindsOf = (batch) => batch.offered.map((id) => B.getBountyDef(id).kind);
  check(eq(kindsOf(a1).slice().sort(), ['elite', 'pirate', 'raid']), '每批构成 = 1 清剿 + 1 截击 + 1 头目',
    J(kindsOf(a1)));
  check(new Set(a1.offered).size === 3, '同一批里没有重复条目', J(a1.offered));
  // 用 Math.random 的"反面证据"：把 Math.random 换成抛错，整批仍能算出来
  const realRandom = Math.random;
  let randomCalled = false;
  Math.random = () => { randomCalled = true; return realRandom(); };
  let pureOk = true;
  try { B.buildBountyBatch(mkState(40)); } catch (e) { pureOk = false; console.log('    抛错：' + e.message); }
  Math.random = realRandom;
  check(pureOk && !randomCalled, '生成批次时一次都没调 Math.random（纯函数）');

  // ---------- ④ 换批 ----------
  console.log('\n[4] 换批（BOUNTY_REFRESH_TURNS = ' + B.BOUNTY_REFRESH_TURNS + '）');
  const b20 = B.buildBountyBatch(mkState(20));
  const b30 = B.buildBountyBatch(mkState(30));
  check(!eq(b20.offered, b30.offered), '跨过刷新周期后批次发生变化', J(b20.offered) + ' → ' + J(b30.offered));
  // 未到刷新点：沿用已有榜单（batchTurn 不为 0 且未满 10 回合）
  const kept = mkState(25, { batchTurn: 20, offered: b20.offered.slice(), active: [], bossCooldown: {} });
  const keptBatch = B.buildBountyBatch(kept);
  check(eq(keptBatch.offered, b20.offered) && keptBatch.batchTurn === 20,
    '没到刷新点 → 原样沿用旧榜单（不换榜）', J(keptBatch));
  check(B.shouldRefreshBounties(kept.bounties, 25) === false, 'shouldRefreshBounties：第 25 回合对第 20 批为 false');
  check(B.shouldRefreshBounties(kept.bounties, 30) === true, 'shouldRefreshBounties：第 30 回合对第 20 批为 true');
  // ensureBountyBatch：不刷新时原引用返回；该刷新时给新对象
  check(B.ensureBountyBatch(kept) === kept.bounties, 'ensureBountyBatch 不刷新时原样返回（同一引用）');
  const ensured = B.ensureBountyBatch(mkState(20));
  check(ensured.batchTurn === 20 && eq(ensured.offered, b20.offered) && ensured.offered !== b20.offered,
    'ensureBountyBatch 刷新时给出新对象（batchTurn/offered 正确）', J(ensured));
  check(kept.bounties.batchTurn === 20, 'ensureBountyBatch 没 mutate 传入的 state');

  // ---------- ⑤ 头目冷却 ----------
  console.log('\n[5] 头目冷却（BOSS_COOLDOWN_TURNS = ' + B.BOSS_COOLDOWN_TURNS + '）');
  const cdState = mkState(30, { batchTurn: 0, offered: [], active: [], bossCooldown: { m01: 25 } });
  const cdBatch = B.buildBountyBatch(cdState);
  check(cdBatch.offered.length === 3, '只冷却一支时仍有 3 条', J(cdBatch.offered));
  check(!cdBatch.offered.includes('bty_e1'), '冷却中的 m01（bty_e1）不在候选池里', J(cdBatch.offered));
  check(cdBatch.notice === '', '正常批次没有提示文案', J(cdBatch.notice));
  check(B.bossCooldownRemaining('m01', { m01: 25 }, 30) === 5, '冷却剩余 = 10 - (30-25) = 5');
  check(B.bossCooldownRemaining('m01', { m01: 20 }, 30) === 0, '冷却到期（10 回合整）→ 0，可再出场');
  check(B.bossCooldownRemaining('m02', { m01: 25 }, 30) === 0, '没有记录的头目 → 0（从未打赢过）');
  // 四支全冷却 → 只剩 2 条 + 兜底提示
  const allCd = mkState(30, {
    batchTurn: 0, offered: [], active: [],
    bossCooldown: { m01: 25, m02: 25, m03: 25, m04: 25 },
  });
  const allBatch = B.buildBountyBatch(allCd);
  check(allBatch.offered.length === 2, '四支全冷却 → 本批只剩 2 条', J(allBatch.offered));
  check(!allBatch.offered.some((id) => B.getBountyDef(id).kind === 'elite'), '这 2 条里没有头目',
    J(allBatch.offered));
  check(allBatch.notice === B.BOUNTY_ALL_COOLING_NOTICE,
    '兜底提示文案 = 「' + B.BOUNTY_ALL_COOLING_NOTICE + '」', J(allBatch.notice));
  check(eq(kindsOf(allBatch).slice().sort(), ['pirate', 'raid']), '剩下的 2 条正好是清剿 + 截击', J(kindsOf(allBatch)));

  // ---------- ⑥ 期限 ----------
  console.log('\n[6] 期限（expireBounties / isBountyExpired）');
  const expiredOne = { defId: 'bty_p1', acceptedTurn: 1, expiresTurn: 9 };
  const aliveOne = { defId: 'bty_r1', acceptedTurn: 5, expiresTurn: 15 };
  const expState = mkState(10, { batchTurn: 0, offered: [], active: [expiredOne, aliveOne], bossCooldown: {} });
  const afterExp = B.expireBounties(expState);
  check(eq(afterExp.bounties.active, [aliveOne]), '只删掉超期的那条，未超期的原样保留',
    J(afterExp.bounties.active));
  check(expState.bounties.active.length === 2, 'expireBounties 没 mutate 传入的 state');
  check(B.expireBounties(expState) !== expState, '有条目过期时返回新的 state（引用变了）');
  const noExpState = mkState(10, { batchTurn: 0, offered: [], active: [aliveOne], bossCooldown: {} });
  check(B.expireBounties(noExpState) === noExpState, '没有任何过期时原样返回（同一引用）');
  // 到期回合当天仍然有效
  const lastDay = { defId: 'bty_p2', acceptedTurn: 1, expiresTurn: 10 };
  const lastState = mkState(10, { batchTurn: 0, offered: [], active: [lastDay], bossCooldown: {} });
  check(B.isBountyExpired(lastDay, 10) === false, 'expiresTurn === turn（到期当天）不算过期');
  check(B.expireBounties(lastState) === lastState, '到期当天不会被删掉');
  check(B.isBountyExpired({ defId: 'bty_p2', acceptedTurn: 1, expiresTurn: 9 }, 10) === true,
    'expiresTurn < turn 才算过期');
  check(afterExp.bounties.offered.length === 0 && afterExp.bounties.batchTurn === 0,
    'expireBounties 不动榜单（只动 active）', J(afterExp.bounties));

  // ---------- ⑦ 文案 ----------
  console.log('\n[7] 文案（bountyExpiryText / bountyRewardText）');
  check(B.bountyExpiryText(lastDay, 10) === '剩 1 回合', '最后 1 回合显示「剩 1 回合」（不是 0）',
    J(B.bountyExpiryText(lastDay, 10)));
  check(B.bountyExpiryText(aliveOne, 10) === '剩 5 回合', '还剩 5 回合时显示 5', J(B.bountyExpiryText(aliveOne, 10)));
  check(B.bountyExpiryText(expiredOne, 10) === '已过期', '已过期显示「已过期」', J(B.bountyExpiryText(expiredOne, 10)));
  check(B.bountyExpiryText(lastDay, 1) === '剩 9 回合', '第 1 回合看第 10 回合到期 → 剩 9 回合',
    J(B.bountyExpiryText(lastDay, 1)));
  const tPirate = B.bountyRewardText(B.getBountyDef('bty_p1'));
  const tRaid = B.bountyRewardText(B.getBountyDef('bty_r1'));
  const tElite = B.bountyRewardText(B.getBountyDef('bty_e1'));
  check(tPirate === '10,000 金币 + 5 星尘', '清剿档报酬文案', J(tPirate));
  check(tRaid === '18,000 金币 + 8 星尘 + 随机原料 ×30', '截击档报酬文案', J(tRaid));
  check(tElite === '60,000 金币 + 25 星尘 + 暗物质 ×2', '头目档报酬文案（独特材料暂用暗物质 ×2）', J(tElite));

  // ---------- ⑧ 敌人数据（本步只落 m05）----------
  console.log('\n[8] 敌人数据（m01~m05 全部就位）');
  check(eq(BOSSES.MERCENARY_BOSS_IDS.slice().sort(), ['m01', 'm02', 'm03', 'm04', 'm05']), '五个雇佣兵敌人全部就位', J(BOSSES.MERCENARY_BOSS_IDS));
  const m05 = BOSSES.MERCENARY_BOSSES.m05;
  check(m05 && m05.hp === 18 && m05.id === 'm05' && m05.name === '海盗杂兵头目' && m05.skill.length > 0,
    'm05 形状符合 PirateBossDef（hp 18 / 有名字 / 有技能文案）', J(m05));


  // ---------- ⑨ 接单守卫 ----------
  console.log('\n[9] 接单守卫（六个原因 + 成功路径）');
  const { createMotherships } = await import('@/data/gameData');
  const { gameReducer } = await import('@/hooks/gameReducer');
  const { GALAXY_NODES } = await import('@/data/galaxy/nodes');
  // 协会节点**按类型找**（不写死 id：guild 类型已落地，位置可换）
  const guildNode = GALAXY_NODES.find((n) => n.type === 'guild');
  const otherNode = GALAXY_NODES.find((n) => n.type === 'faction');
  /** 停在协会节点的一艘母舰（金币/食物/材料都给最小可用值） */
  const guildShip = () => {
    const base = createMotherships()[0];
    return { ...base, gold: 1000, stardust: 0, food: 10, materials: {}, galaxy: { ...base.galaxy, currentNodeId: guildNode ? guildNode.id : '' } };
  };
  const OFFERED = ['bty_p1', 'bty_r1', 'bty_e1'];
  /** 协会节点 + 本批已生成（batchTurn = turn，不会触发换批）+ 可选覆盖 */
  const mkGuild = (over) => ({
    ...createInitialGameState(),
    turn: 20,
    ships: [guildShip()],
    bounties: { batchTurn: 20, offered: OFFERED.slice(), active: [], bossCooldown: {}, ...((over && over.bounties) || {}) },
    ...((over && over.rest) || {}),
  });
  const lastLog = (st) => (st.eventLog.length > 0 ? st.eventLog[0] : null);

  // ① 不在协会节点（判据是**类型**：随便挑一个非 guild 节点）
  const offNodeBase = mkGuild();
  const offNode = { ...offNodeBase, ships: [{ ...offNodeBase.ships[0], galaxy: { ...offNodeBase.ships[0].galaxy, currentNodeId: otherNode ? otherNode.id : 'f01' } }] };
  check(B.isAtGuildNode(guildShip()) === true, 'isAtGuildNode：停在 guild 节点 → true', J(!!guildNode));
  check(B.isAtGuildNode(offNode.ships[0]) === false, 'isAtGuildNode：停在非 guild 节点 → false', J(otherNode && otherNode.id));
  const offNodeCheck = B.canAcceptBounty(offNode, 'bty_p1');
  const offNodeState = gameReducer(offNode, { type: 'ACCEPT_BOUNTY', defId: 'bty_p1' });
  check(!offNodeCheck.ok && offNodeCheck.reason === '需停靠在银河雇佣兵协会才能接悬赏',
    '不在协会节点 → 被拒（原因：需停靠…）', J(offNodeCheck));
  check(offNodeState.bounties.active.length === 0 && !!lastLog(offNodeState)
    && lastLog(offNodeState).event === '悬赏被拒' && lastLog(offNodeState).detail === offNodeCheck.reason,
    '被拒时原样不动 active，但**写了事件记录**（不静默失败）', J(lastLog(offNodeState)));

  // ② 不在本批榜单
  const notInBatch = B.canAcceptBounty(mkGuild(), 'bty_p2');
  check(!notInBatch.ok && notInBatch.reason === '这一批已经换榜了，这条悬赏不在了',
    '不在本批榜单 → 被拒（原因：这一批已经换榜了…）', J(notInBatch));

  // ③ 已接
  const already = mkGuild({ bounties: { active: [{ defId: 'bty_p1', acceptedTurn: 18, expiresTurn: 32 }] } });
  const alreadyCheck = B.canAcceptBounty(already, 'bty_p1');
  check(!alreadyCheck.ok && alreadyCheck.reason === '这条已经接了', '同一 defId 重复接 → 被拒', J(alreadyCheck));

  // ④ 已接 3 条
  const fullActive = [
    { defId: 'bty_p2', acceptedTurn: 18, expiresTurn: 32 },
    { defId: 'bty_p3', acceptedTurn: 18, expiresTurn: 31 },
    { defId: 'bty_p4', acceptedTurn: 18, expiresTurn: 30 },
  ];
  const fullState = mkGuild({ bounties: { active: fullActive } });
  const fullCheck = B.canAcceptBounty(fullState, 'bty_p1');
  check(!fullCheck.ok && fullCheck.reason === '同时最多接 3 条悬赏，先完成一条，或者等一条过期',
    '已接满 3 条 → 被拒', J(fullCheck));

  // ⑤ 头目冷却
  const cdAccept = mkGuild({ bounties: { bossCooldown: { m01: 15 } } });
  const cdCheck = B.canAcceptBounty(cdAccept, 'bty_e1');
  check(!cdCheck.ok && cdCheck.reason === '该头目正在冷却，剩 5 回合',
    '头目冷却中 → 被拒（原因带剩余回合数）', J(cdCheck));

  // ⑥ 战斗中
  const inBattle = mkGuild({ rest: { battle: { over: false } } });
  const inBattleCheck = B.canAcceptBounty(inBattle, 'bty_p1');
  check(!inBattleCheck.ok && inBattleCheck.reason === '战斗还没打完', '战斗进行中 → 被拒', J(inBattleCheck));

  // 成功路径
  const accepted = gameReducer(mkGuild(), { type: 'ACCEPT_BOUNTY', defId: 'bty_p1' });
  const acceptedProgress = accepted.bounties.active[0];
  check(accepted.bounties.active.length === 1 && acceptedProgress && acceptedProgress.defId === 'bty_p1',
    '接单成功：active 多一条', J(accepted.bounties.active));
  check(acceptedProgress && acceptedProgress.acceptedTurn === 20 && acceptedProgress.expiresTurn === 34,
    '接单写入 acceptedTurn=20 / expiresTurn=20+14（bty_p1 期限 14）', J(acceptedProgress));
  check(!!lastLog(accepted) && lastLog(accepted).event === '接取悬赏', '接单也写一条事件记录', J(lastLog(accepted)));

  // ---------- ⑩ 放弃 ----------
  console.log('\n[10] 放弃悬赏（只移除该条、不扣任何东西）');
  const twoActive = mkGuild({
    bounties: {
      active: [
        { defId: 'bty_p1', acceptedTurn: 18, expiresTurn: 32 },
        { defId: 'bty_r1', acceptedTurn: 18, expiresTurn: 32 },
      ],
    },
  });
  const abandoned = gameReducer(twoActive, { type: 'ABANDON_BOUNTY', defId: 'bty_p1' });
  check(abandoned.bounties.active.length === 1 && abandoned.bounties.active[0].defId === 'bty_r1',
    '放弃只移除指定那条，别的条目不动', J(abandoned.bounties.active));
  check(abandoned.ships[0].gold === twoActive.ships[0].gold
    && abandoned.ships[0].stardust === twoActive.ships[0].stardust,
    '放弃不扣钱、不扣星尘');
  check(!!lastLog(abandoned) && lastLog(abandoned).event === '放弃悬赏', '放弃写一条事件记录');
  const notAcceptedRef = mkGuild();
  check(gameReducer(notAcceptedRef, { type: 'ABANDON_BOUNTY', defId: 'bty_p1' }) === notAcceptedRef,
    '放弃一条没接过的 → 返回同一引用（不造日志噪音）');

  // ---------- ⑪ 出击 ----------
  console.log('\n[11] 出击（START_BOUNTY_BATTLE）');
  const withFleet = (st) => ({
    ...st,
    fleets: [{ id: 'fleet_test', name: '测试队', shipIds: ['h1', 'c1'], defending: false }],
  });
  // 未接就出击
  const notAccepted = withFleet(mkGuild());
  const notAcceptedCheck = B.canStartBountyBattle(notAccepted, 'bty_p1', 'fleet_test');
  check(!notAcceptedCheck.ok && notAcceptedCheck.reason === '这条还没接，先接单再来',
    '未接就出击 → 被拒', J(notAcceptedCheck));
  // 已接 → 出击成功
  const readyState = withFleet(gameReducer(mkGuild(), { type: 'ACCEPT_BOUNTY', defId: 'bty_p1' }));
  const started = gameReducer(readyState, { type: 'START_BOUNTY_BATTLE', defId: 'bty_p1', fleetId: 'fleet_test' });
  check(!!started.battle, '出击后创建了战斗（state.battle 非空 → battleBoard 自动整屏）', J(!!started.battle));
  check(started.bountyBattleId === 'bty_p1', 'bountyBattleId 记下了是哪条悬赏', J(started.bountyBattleId));
  check(started.battle && eq(started.battle.player.pool.slice().sort(), ['c1', 'h1']),
    '参战池 = 该舰队编制（不是 FLEET_STARTER）', J(started.battle && started.battle.player.pool));
  check(started.battle && started.battle.bossId === 'm05', '清剿档的敌方是 m05（BountyDef.enemyId）',
    J(started.battle && started.battle.bossId));
  // 头目档 → 占位敌人常量（不许字面量 raid 散落）
  const eliteReady = withFleet(gameReducer(mkGuild(), { type: 'ACCEPT_BOUNTY', defId: 'bty_e1' }));
  const eliteStarted = gameReducer(eliteReady, { type: 'START_BOUNTY_BATTLE', defId: 'bty_e1', fleetId: 'fleet_test' });
  check(!!eliteStarted.battle && eliteStarted.battle.bossId === 'm01',
    '头目档直接打真实敌人 m01（占位常量只作兜底）',
    J({ placeholder: B.ELITE_PLACEHOLDER_BOSS, bossId: eliteStarted.battle && eliteStarted.battle.bossId }));
  // 带防守标签 / 空舰队被拒
  const defFleet = { ...readyState, fleets: [{ id: 'fleet_test', name: '测试队', shipIds: ['h1'], defending: true }] };
  const defCheck = B.canStartBountyBattle(defFleet, 'bty_p1', 'fleet_test');
  check(!defCheck.ok && defCheck.reason === '带防守标签的舰队留守，不能出击', '带防守标签 → 被拒', J(defCheck));
  const emptyFleet = { ...readyState, fleets: [{ id: 'fleet_test', name: '测试队', shipIds: [], defending: false }] };
  const emptyCheck = B.canStartBountyBattle(emptyFleet, 'bty_p1', 'fleet_test');
  check(!emptyCheck.ok && emptyCheck.reason === '这支舰队没有战舰，出击不能空手', '空舰队 → 被拒', J(emptyCheck));

  // ---------- ⑫ 胜利结算 ----------
  console.log('\n[12] 胜利结算（END_BATTLE：报酬 / 移除 / 冷却 / 事件 / 清 bountyBattleId）');
  const winFrom = (st, winner) => ({ ...st, battle: { ...st.battle, winner, over: true, reason: 'test' } });
  const winState = winFrom(started, 'player');
  const goldBefore = winState.ships[0].gold;
  const afterWin = gameReducer(winState, { type: 'END_BATTLE' });
  check(afterWin.ships[0].gold === goldBefore + 10000, '胜利发金币 10,000（bty_p1）',
    J({ before: goldBefore, after: afterWin.ships[0].gold }));
  check(afterWin.ships[0].stardust === 5, '胜利发星尘 5', J(afterWin.ships[0].stardust));
  check(afterWin.bounties.active.length === 0, '完成后从 active 移除', J(afterWin.bounties.active));
  check(afterWin.bountyBattleId === null && afterWin.battle === null, '收尾清空 battle 与 bountyBattleId');
  check(!!lastLog(afterWin) && lastLog(afterWin).event === '悬赏完成', '事件记录一条「悬赏完成」', J(lastLog(afterWin)));
  // 饥荒：食物 < 0 时金币减半
  const famineState = { ...winState, ships: [{ ...winState.ships[0], food: -1 }] };
  const afterFamine = gameReducer(famineState, { type: 'END_BATTLE' });
  check(afterFamine.ships[0].gold === goldBefore + 5000, '饥荒（食物<0）时金币减半为 5,000',
    J({ before: goldBefore, after: afterFamine.ships[0].gold }));
  // 头目档：冷却写入 + 事件里提到可再接
  const eliteWin = gameReducer(winFrom(eliteStarted, 'player'), { type: 'END_BATTLE' });
  check(eliteWin.bounties.bossCooldown && eliteWin.bounties.bossCooldown.m01 === 20,
    '头目档打赢 → bossCooldown[m01] = 当前回合（20）', J(eliteWin.bounties.bossCooldown));
  check(!!lastLog(eliteWin) && lastLog(eliteWin).detail.includes('回合后可再接'),
    '头目档的事件文案写了「N 回合后可再接」', J(lastLog(eliteWin) && lastLog(eliteWin).detail));

  // ---------- ⑬ 失败 / 不重复发奖 ----------
  console.log('\n[13] 失败作废 + 结算不重复发奖');
  const loseState = winFrom(started, 'boss');
  const loseGoldBefore = loseState.ships[0].gold;
  const afterLose = gameReducer(loseState, { type: 'END_BATTLE' });
  check(afterLose.ships[0].gold === loseGoldBefore && afterLose.ships[0].stardust === 0,
    '打输不发金币、不发星尘');
  check(afterLose.bounties.active.length === 0, '打输也把悬赏从 active 移除（作废）');
  check(!!lastLog(afterLose) && lastLog(afterLose).event === '悬赏失败', '事件记录一条「悬赏失败」', J(lastLog(afterLose)));
  check(afterLose.bountyBattleId === null, '打输也清空 bountyBattleId（不留残档）');
  // 再派一次 END_BATTLE：battle 已空 → 原样返回，绝不重复发奖
  const twice = gameReducer(afterWin, { type: 'END_BATTLE' });
  check(twice === afterWin && twice.ships[0].gold === afterWin.ships[0].gold,
    '重复派发 END_BATTLE 不会重复发奖（battle 已空 → 原样返回）');
  // 已完成后想再打同一条：它已不在 active，出击被拒
  const replay = B.canStartBountyBattle(afterWin, 'bty_p1', 'fleet_test');
  check(!replay.ok && replay.reason === '这条还没接，先接单再来',
    '同一条已完成后再出击 → 被拒（不能靠重打重复领奖）', J(replay));

  // ---------- ⑭ A1：24 张敌人专属卡 / 四池 / 四编队 / 掉落 / 不可建造 ----------
  console.log('\n[14] 四支势力：24 张卡 / 4 个 30 张敌池 / 4 套 26 艘编队 / 掉落 / 不可建造');
  const MC = await import('@/data/mercenary/cards');
  const MP = await import('@/data/mercenary/pools');
  const DR = await import('@/lib/turn/bossDrops');
  const SY = await import('@/lib/battle/shipyard');
  const EN = await import('@/lib/battle/engine');
  const FL = await import('@/data/battle/fleets');
  const BB = await import('@/lib/battle/bountyBattle');

  const BC = (await import('@/data/battle/cards')).BATTLE_CARDS;
  const mercIds = MC.MERCENARY_CARD_IDS.slice();
  check(mercIds.length === 24 && new Set(mercIds).size === 24, '24 张敌人专属卡且 id 唯一', String(mercIds.length));
  const bySeries = { 虫群: [], 智械: [], 灵潮: [], 旧律: [] };
  for (const id of mercIds) bySeries[BC[id].series].push(id);
  check(Object.values(bySeries).every((list) => list.length === 6), '每个系列恰好 6 张（4×6=24）',
    J(Object.fromEntries(Object.entries(bySeries).map(([k, v]) => [k, v.length]))));
  check(mercIds.every((id) => ['q', 'z', 'y', 'v'].includes(id[0])), '四支势力的 id 前缀是 q/z/y/v', J(mercIds));
  check(mercIds.every((id) => typeof BC[id].text === 'string' && BC[id].text.length > 0),
    '24 张卡都有技能文案（A2 起与 engine 的 BEHAVIOR 一致）');

  // 四池 30 张
  const bossIds = ['m01', 'm02', 'm03', 'm04'];
  check(bossIds.every((b) => MP.MERCENARY_POOLS[b] && MP.MERCENARY_POOLS[b].length === 30),
    '四个敌池各 30 张', J(bossIds.map((b) => (MP.MERCENARY_POOLS[b] || []).length)));
  check(bossIds.every((b) => {
    const pool = MP.MERCENARY_POOLS[b];
    const counts = {};
    for (const id of pool) counts[id] = (counts[id] || 0) + 1;
    return Object.keys(counts).length === 6 && Object.values(counts).every((n) => n === 5);
  }), '每个敌池 = 那 6 张各 5 份');

  // 四编队 26 艘 + 合计
  const sums = (list) => list.reduce((acc, id) => {
    const c = BC[id] || EN.CARDS[id] || {};
    return { atk: acc.atk + (c.atk || 0), shield: acc.shield + (c.shield || 0), structure: acc.structure + (c.structure || 0) };
  }, { atk: 0, shield: 0, structure: 0 });
  const ANCHOR = { m01: [111, 98, 36], m02: [102, 105, 40], m03: [88, 110, 49], m04: [95, 113, 45] };
  const STARTER = sums(FL.FLEET_STARTER);
  const starterTotal = STARTER.atk + STARTER.shield + STARTER.structure;
  for (const b of bossIds) {
    const fleet = MP.MERCENARY_FLEETS[b];
    const s = sums(fleet);
    const total = s.atk + s.shield + s.structure;
    const want = ANCHOR[b];
    check(fleet.length === 26, `${b} 编队 26 艘`, String(fleet.length));
    check(s.atk === want[0] && s.shield === want[1] && s.structure === want[2],
      `${b} 编队合计 = 攻${want[0]}/盾${want[1]}/结构${want[2]}（与设计锚点一致）`, J(s));
    check(Math.abs(total - starterTotal) / starterTotal <= 0.05,
      `${b} 三围总量与新手编制（${starterTotal}）相差在 ±5% 内`,
      `${total} vs ${starterTotal} = ${(100 * (total - starterTotal) / starterTotal).toFixed(1)}%`);
  }

  // 引擎真的认识这 24 张 + 5 个敌人（data 合并进 CARDS / BOSSES）
  check(mercIds.every((id) => !!EN.CARDS[id]), '引擎 CARDS 认得全部 24 张', String(mercIds.filter((id) => !EN.CARDS[id]).length));
  check(mercIds.every((id) => EN.CARDS[id].series === BC[id].series), '引擎里的 series 与数据一致');
  check(['m01', 'm02', 'm03', 'm04', 'm05'].every((b) => !!EN.BOSSES[b] && EN.BOSSES[b].hp > 0),
    '引擎 BOSSES 认得 m01~m05', J(['m01', 'm02', 'm03', 'm04', 'm05'].map((b) => EN.BOSSES[b] && EN.BOSSES[b].hp)));
  check(FL.FLEET_ALL.length === 33 && !FL.FLEET_ALL.some((id) => mercIds.includes(id)),
    'FLEET_ALL 仍是 33 张，且不含任何敌方卡', String(FL.FLEET_ALL.length));

  // m01~m04 各自建场（敌方血量/池按 bossId 查表）
  for (const b of bossIds) {
    const created = BB.createBountyBattle(b, ['h1', 'c1'], 7);
    const pool = created.boss.pool;
    const okPool = pool.length === 30 && pool.every((id) => BC[id] && BC[id].series === DR.BOSS_SERIES[b]);
    check(created.bossId === b && created.boss.body === EN.BOSSES[b].hp && created.boss.bodyMax === EN.BOSSES[b].hp && okPool,
      `${b} 建场正确（bossId/本体血量/30 张本系列敌池）`,
      J({ bossId: created.bossId, body: created.boss.body, pool: pool.length }));
  }

  // 掉落：范围只在本系列、1~2 张、可累加
  const drops = [];
  for (let i = 0; i < 200; i += 1) drops.push(...DR.rollBossDrop('m01', (i % 10) / 10, (i % 7) / 7));
  check(drops.length > 0 && drops.every((id) => bySeries['虫群'].includes(id)),
    'm01 的掉落只落在虫群那 6 张里（200 次抽样）', J([...new Set(drops)]));
  const sizes = new Set();
  for (let i = 0; i < 50; i += 1) sizes.add(DR.rollBossDrop('m01', i / 50, 0.3).length);
  check([...sizes].every((n) => n >= 1 && n <= 2), '每次掉落 1~2 张', J([...sizes]));
  check(DR.rollBossDrop('m05', 0.1, 0.1).length === 0, 'm05（弱海盗）不掉卡');
  check(DR.rollBossDrop('b1', 0.1, 0.1).length === 0, '老巢不掉敌方卡（掉落只属于四支势力头目）');
  const lib0 = ['h1'];
  const lib1 = DR.mergeDrops(lib0, ['q1']);
  const lib2 = DR.mergeDrops(lib1, ['q1']);
  check(lib1.length === 2 && lib2.length === 3 && lib2.filter((id) => id === 'q1').length === 2,
    '同一张卡掉两次 = 卡库两份（份数累加，不是去重）', J(lib2));
  check(DR.bossDropText(['q1', 'q1']).includes('噬星幼虫 ×2') && DR.bossDropText(['q1']).includes('不可建造'),
    '掉落文案写明张数与「不可建造」', DR.bossDropText(['q1', 'q1']));

  // 不可建造（ENEMY_SERIES 三处接线）
  check(SY.ENEMY_SERIES.includes('虫群') && SY.ENEMY_SERIES.includes('智械')
    && SY.ENEMY_SERIES.includes('灵潮') && SY.ENEMY_SERIES.includes('旧律') && SY.ENEMY_SERIES.includes('海盗'),
    'ENEMY_SERIES 含海盗 + 四支势力', J(SY.ENEMY_SERIES));
  const buildQ1 = SY.canBuild(createInitialGameState(), 'q1');
  check(!buildQ1.ok && buildQ1.reason === '该舰为敌方战利品，不可建造',
    'canBuild(q1) 被拦，原因 = 「该舰为敌方战利品，不可建造」', J(buildQ1));
  const TU = await import('@/lib/battle/techUnlocks');
  const allUnlockIds = Object.values(TU.techUnlockList ? TU.techUnlockList() : {}).flatMap((x) => x.cardIds || []);
  check(!allUnlockIds.some((id) => mercIds.includes(id)), '科技解锁清单里不出现任何敌方卡', String(allUnlockIds.length));
  // ---------- 结果 ----------
  console.log('\n=== 雇佣兵协会（数据 + 批次 + 接单/出击/结算）验收结果 ===');
  if (fails.length === 0) {
    console.log('  全部通过 ✓（13 组）');
  } else {
    console.log('  失败 ' + fails.length + ' 条：');
    for (const f of fails) console.log('    · ' + f);
    process.exitCode = 1;
  }
})().catch((e) => {
  console.error('脚本异常：', e);
  process.exitCode = 1;
});

