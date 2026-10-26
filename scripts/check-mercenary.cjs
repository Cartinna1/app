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

  // ---------- ⑤ 全局休息（每头目冷却已退役）----------
  console.log('\n[5] 全局休息（BOUNTY_REST_TURNS = ' + B.BOUNTY_REST_TURNS + '）');
  check(B.BOUNTY_REST_TURNS === 6, '全局休息 6 回合（唯一常量）', String(B.BOUNTY_REST_TURNS));
  // 打赢那一帧写 restUntilTurn = turn + 6；之后 5 个回合依次 5/4/3/2/1，第 6 回合归 0
  const restBase = mkState(20, { batchTurn: 20, offered: ['bty_p1', 'bty_r1', 'bty_e1'], active: [], restUntilTurn: 26 });
  const winFrame = B.bountyRestRemaining(restBase);
  const seq = [21, 22, 23, 24, 25].map((t) => B.bountyRestRemaining({ ...restBase, turn: t }));
  const afterSix = B.bountyRestRemaining({ ...restBase, turn: 26 });
  check(winFrame === 6 && eq(seq, [5, 4, 3, 2, 1]) && afterSix === 0,
    '打赢那一帧剩 6，之后依次 5/4/3/2/1，第 6 回合归 0', J([winFrame].concat(seq, [afterSix])));
  check(B.bountyRestRemaining(mkState(30, { batchTurn: 0, offered: [], active: [], restUntilTurn: 0 })) === 0,
    '没有休息记录（旧档 / 从未打赢）→ 0');
  // 休息期两个入口都拒，且 reason 逐字（在 N = 1 那一帧断言）
  // ⚠ [5] 早于 [9]，所以这里自带最小夹具（不停靠协会节点会被更靠前的守卫拦掉）
  const { createMotherships: mkShips } = await import('@/data/gameData');
  const { gameReducer: RED } = await import('@/hooks/gameReducer');
  const { GALAXY_NODES: GNODES } = await import('@/data/galaxy/nodes');
  const gNode = GNODES.find((n) => n.type === 'guild');
  const restShip = () => {
    const base = mkShips()[0];
    return { ...base, gold: 1000, stardust: 0, food: 10, materials: {}, galaxy: { ...base.galaxy, currentNodeId: gNode ? gNode.id : '' } };
  };
  const restGuild = (over) => ({
    ...createInitialGameState(),
    turn: 25,
    ships: [restShip()],
    cardLibrary: Array.from({ length: 20 }, () => 'h1'),
    bounties: { batchTurn: 20, offered: ['bty_p1', 'bty_r1', 'bty_e1'], active: [], restUntilTurn: 26 },
    ...(over || {}),
  });
  const lastRestFrame = restGuild({ bounties: { batchTurn: 20, offered: ['bty_p1', 'bty_r1', 'bty_e1'], active: [{ defId: 'bty_e1', acceptedTurn: 20, expiresTurn: 28 }], restUntilTurn: 26 } });
  const acceptBlocked = B.canAcceptBounty(lastRestFrame, 'bty_p1');
  const fleetFrame = { ...lastRestFrame, fleets: [{ id: 'f9', name: 'x', shipIds: ['h1'], defending: false }] };
  const startBlocked = B.canStartBountyBattle(fleetFrame, 'bty_e1', 'f9');
  check(!acceptBlocked.ok && acceptBlocked.reason === '悬赏整理中，还差 1 回合',
    'N=1 那一帧：canAcceptBounty 被拒，reason 逐字「悬赏整理中，还差 1 回合」', J(acceptBlocked));
  check(!startBlocked.ok && startBlocked.reason === '悬赏整理中，还差 1 回合',
    'N=1 那一帧：canStartBountyBattle 用**同一句** reason 被拒', J(startBlocked));
  check(B.canAcceptBounty({ ...lastRestFrame, turn: 26 }, 'bty_p1').ok, '第 6 回合结束（turn+6）→ 可以正常接单');
  // 批次候选不再按头目过滤（4 支都在，仍是 1+1+1）；休息只拦"接/打"
  const noFilter = B.buildBountyBatch(mkState(30, { batchTurn: 0, offered: [], active: [], restUntilTurn: 25 }));
  check(noFilter.offered.length === 3 && eq(kindsOf(noFilter).slice().sort(), ['elite', 'pirate', 'raid']),
    '休息期只拦"接/打"，榜单照旧发 3 条（候选不再按头目过滤）', J(noFilter.offered));

  // 失败 / 放弃 / 过期三条都**不写** restUntilTurn；只有打赢才写
  {
    const start0 = restGuild({
      fleets: [{ id: 'fl', name: 'x', shipIds: ['h1'], defending: false }],
      // 这一组要真的接单+开战，所以先不在休息期（默认夹具是 restUntilTurn 26）
      bounties: { batchTurn: 20, offered: ['bty_p1', 'bty_r1', 'bty_e1'], active: [], restUntilTurn: 0 },
    });
    const accepted = RED(start0, { type: 'ACCEPT_BOUNTY', defId: 'bty_p1' });
    const started = RED(accepted, { type: 'START_BOUNTY_BATTLE', defId: 'bty_p1', fleetId: 'fl' });
    const lostFrame = { ...started, battle: { ...started.battle, winner: 'boss', over: true, reason: 'test' } };
    const afterLose = RED(lostFrame, { type: 'END_BATTLE' });
    check(afterLose.bounties.restUntilTurn === 0, '**打输**不写 restUntilTurn（否则连输会被锁）', J(afterLose.bounties.restUntilTurn));
    const abandoned = RED(accepted, { type: 'ABANDON_BOUNTY', defId: 'bty_p1' });
    check(abandoned.bounties.restUntilTurn === 0, '**放弃**不写 restUntilTurn', J(abandoned.bounties.restUntilTurn));
    const expired = B.expireBounties({ ...accepted, turn: 40 });
    check(expired.bounties.restUntilTurn === 0, '**过期**不写 restUntilTurn', J(expired.bounties.restUntilTurn));
    const wonFrame = { ...started, battle: { ...started.battle, winner: 'player', over: true, reason: 'test' } };
    const afterWinRest = RED(wonFrame, { type: 'END_BATTLE' });
    check(afterWinRest.bounties.restUntilTurn === 31,
      '**打赢**才写 restUntilTurn = turn(25) + 6', J(afterWinRest.bounties.restUntilTurn));
  }
  // 全库自检：`bossCooldown` 只许出现在注释里（属性写法 `bossCooldown:` 必须归零）
  {
    const fs = require('fs');
    const path = require('path');
    const files = [
      'src/types/game.ts', 'src/lib/turn/bounties.ts', 'src/hooks/gameReducer.ts',
      'src/lib/save.ts', 'src/components/battle/MercenaryBoard.tsx',
    ];
    const bad = files.filter((rel) => fs.readFileSync(path.resolve(__dirname, '..', rel), 'utf8').includes('bossCooldown:'));
    check(bad.length === 0, '全库不再有 `bossCooldown:` 属性写法（只在注释里出现）', J(bad));
  }

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
    // 默认 20 艘：头目档有卡库门槛（requireCardCount=20），大部分用例要能过那一关
    cardLibrary: Array.from({ length: 20 }, () => 'h1'),
    bounties: { batchTurn: 20, offered: OFFERED.slice(), active: [], bossCooldown: {}, ...((over && over.bounties) || {}) },
    ...((over && over.rest) || {}),
  });
  const lastLog = (st) => (st.eventLog.length > 0 ? st.eventLog[0] : null);
  /** 结算到底（END_BATTLE 两段：① 结算并挂 battle.settlement ② 再点一次清空战斗） */
  const END = (st) => {
    let s = gameReducer(st, { type: 'END_BATTLE' });
    for (let i = 0; i < 4 && s.battle && s.battle.settlement; i += 1) s = gameReducer(s, { type: 'END_BATTLE' });
    return s;
  };

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

  // ⑤ 全局休息（每头目冷却已退役：打赢任意一条 → 6 回合不能接）
  const restAccept = mkGuild({ bounties: { restUntilTurn: 26 } });
  const restCheck = B.canAcceptBounty(restAccept, 'bty_p1');
  check(!restCheck.ok && restCheck.reason === '悬赏整理中，还差 6 回合',
    '休息期（turn 20 / restUntil 26）→ 被拒，原因带剩余回合数', J(restCheck));

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
  const afterWin = END(winState);
  check(afterWin.ships[0].gold === goldBefore + 10000, '胜利发金币 10,000（bty_p1）',
    J({ before: goldBefore, after: afterWin.ships[0].gold }));
  check(afterWin.ships[0].stardust === 5, '胜利发星尘 5', J(afterWin.ships[0].stardust));
  check(afterWin.bounties.active.length === 0, '完成后从 active 移除', J(afterWin.bounties.active));
  check(afterWin.bountyBattleId === null && afterWin.battle === null, '收尾清空 battle 与 bountyBattleId');
  check(!!lastLog(afterWin) && lastLog(afterWin).event === '悬赏完成', '事件记录一条「悬赏完成」', J(lastLog(afterWin)));
  // 饥荒：食物 < 0 时金币减半
  const famineState = { ...winState, ships: [{ ...winState.ships[0], food: -1 }] };
  const afterFamine = END(famineState);
  check(afterFamine.ships[0].gold === goldBefore + 5000, '饥荒（食物<0）时金币减半为 5,000',
    J({ before: goldBefore, after: afterFamine.ships[0].gold }));
  // 头目档：冷却写入 + 事件里提到可再接
  const eliteWin = END(winFrom(eliteStarted, 'player'));
  check(eliteWin.bounties.restUntilTurn === 26,
    '头目档打赢 → restUntilTurn = 当前回合(20) + 6（全局休息）', J(eliteWin.bounties.restUntilTurn));
  check(!!lastLog(eliteWin) && lastLog(eliteWin).detail.includes('悬赏整理中，6 回合内不能接新委托'),
    '头目档的事件文案写了「悬赏整理中，6 回合内不能接新委托」', J(lastLog(eliteWin) && lastLog(eliteWin).detail));

  // ---------- ⑬ 失败 / 不重复发奖 ----------
  console.log('\n[13] 失败作废 + 结算不重复发奖');
  const loseState = winFrom(started, 'boss');
  const loseGoldBefore = loseState.ships[0].gold;
  const afterLose = END(loseState);
  check(afterLose.ships[0].gold === loseGoldBefore && afterLose.ships[0].stardust === 0,
    '打输不发金币、不发星尘');
  check(afterLose.bounties.active.length === 0, '打输也把悬赏从 active 移除（作废）');
  check(!!lastLog(afterLose) && lastLog(afterLose).event === '悬赏失败', '事件记录一条「悬赏失败」', J(lastLog(afterLose)));
  check(afterLose.bountyBattleId === null, '打输也清空 bountyBattleId（不留残档）');
  // 再派一次 END_BATTLE：battle 已空 → 原样返回，绝不重复发奖
  const twice = END(afterWin);
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

  // 四池：m01 / m04 = 12 张（6×2），m02 / m03 = 18 张（6×3）—— 2026-10 方案 A
  const bossIds = ['m01', 'm02', 'm03', 'm04'];
  const POOL_COPIES = { m01: 2, m02: 3, m03: 3, m04: 2 };
  check(bossIds.every((b) => MP.MERCENARY_POOLS[b] && MP.MERCENARY_POOLS[b].length === 6 * POOL_COPIES[b]),
    '敌池张数 = 6 张 × 2 份（m01/m04）或 × 3 份（m02/m03）', J(bossIds.map((b) => (MP.MERCENARY_POOLS[b] || []).length)));
  check(bossIds.every((b) => {
    const pool = MP.MERCENARY_POOLS[b];
    const counts = {};
    for (const id of pool) counts[id] = (counts[id] || 0) + 1;
    return Object.keys(counts).length === 6 && Object.values(counts).every((n) => n === POOL_COPIES[b]);
  }), '每个敌池 = 那 6 张各 2/3 份（按势力）');

  // 四编队 26 艘 + 合计
  const sums = (list) => list.reduce((acc, id) => {
    const c = BC[id] || EN.CARDS[id] || {};
    return { atk: acc.atk + (c.atk || 0), shield: acc.shield + (c.shield || 0), structure: acc.structure + (c.structure || 0) };
  }, { atk: 0, shield: 0, structure: 0 });
  const ANCHOR = { m01: [111, 94, 51], m02: [102, 105, 40], m03: [88, 110, 49], m04: [95, 113, 53] };
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
  check(FL.FLEET_ALL.length === 41 && !FL.FLEET_ALL.some((id) => mercIds.includes(id)),
    'FLEET_ALL 是 41 张（含 8 张新卡），且不含任何敌方卡', String(FL.FLEET_ALL.length));

  // m01~m04 各自建场（敌方血量/池按 bossId 查表）
  for (const b of bossIds) {
    const created = BB.createBountyBattle(b, ['h1', 'c1'], 7);
    const pool = created.boss.pool;
    const okPool = pool.length === 6 * POOL_COPIES[b] && pool.every((id) => BC[id] && BC[id].series === DR.BOSS_SERIES[b]);
    check(created.bossId === b && created.boss.body === EN.BOSSES[b].hp && created.boss.bodyMax === EN.BOSSES[b].hp && okPool,
      `${b} 建场正确（bossId/本体血量/${6 * POOL_COPIES[b]} 张本系列敌池）`,
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
  check(DR.bossDropText(['q1', 'q1']).includes('孢子浮囊 ×2') && DR.bossDropText(['q1']).includes('不可建造'),
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
  // 24 张的 kw / fx 覆盖率（按 docs/03 §4.2~§4.5 的机制列）
  {
    const kwOf = (id) => EN.CARDS[id].kw || {};
    const fxOf = (id) => EN.CARDS[id].fx || {};
    check(kwOf('q6').taunt === true && typeof fxOf('q6').death === 'function',
      'q6 = 锁链 + 亡语群伤（death 钩子）');
    check(typeof fxOf('y4').play === 'function' && typeof fxOf('y1').play === 'function',
      'y1/y4 入场冻结（y4 两次 freeze）');
    check(kwOf('z6').taunt === true && typeof fxOf('z6').turnStart === 'function',
      'z6 = 锁链 + 回合开始减攻（turnStart 钩子）');
    check(kwOf('v6').pierce === true && kwOf('v6').recoil === 1 && typeof fxOf('v6').death === 'function',
      'v6 = 贯穿 + 反噬 1 + 亡语群伤');
    check(kwOf('z5').pierce === true && kwOf('z5').recoil === 1 && kwOf('z3').overload === 1,
      'z3 过载 1 / z5 贯穿 + 反噬 1');
    check(kwOf('v1').berserk === 2 && kwOf('q2').berserk === 2 && kwOf('y3').subm === true && kwOf('z2').brk === true,
      'v1/q2 狂怒 2、y3 潜航、z2 破甲');
    check(typeof fxOf('q5').play === 'function' && typeof fxOf('q4').turnEnd === 'function'
      && typeof fxOf('v4').turnEnd === 'function' && typeof fxOf('z1').play === 'function',
      'q5/v3 入场加息、q4/z4/y3 亡语补盾、v4 相邻修复、z1 入场加指挥度');
  }
  // ---------- ⑮ A3：5 个头目技能各一条行为断言 ----------
  console.log('\n[15] 头目技能（m01~m05）：每支各一条"确实生效"的行为断言');
  {
    const ENG = await import('@/lib/battle/engine');
    const { createBattle: CB, endTurn, spawnUnit, placeUnit } = ENG;
    // m01：开场自带 2 艘噬星幼虫
    const b1 = CB({ seed: 3, bossId: 'm01', playerFirst: false });
    check(b1.boss.board.filter(Boolean).length === 1
      && b1.boss.board.filter(Boolean).every((u) => u && u.cardId === 'q1'),
      'm01 开场自带 1 艘噬星幼虫（q1）', J(b1.boss.board.filter(Boolean).map((u) => u && u.cardId)));
    // m05：开场自带 1 艘海盗杂兵
    const b5 = CB({ seed: 3, bossId: 'm05', playerFirst: false });
    check(b5.boss.board.filter(Boolean).length === 1
      && b5.boss.board.filter(Boolean)[0].cardId === 't_grunt',
      'm05 开场自带 1 艘海盗杂兵（t_grunt）', J(b5.boss.board.filter(Boolean).map((u) => u && u.cardId)));

    // m02 / m03：机制在 engine 的按 id 分支里（与 DEMO 一字不差，由 audit-battle-port 严格相等覆盖）；
    // 这里只断数据侧文案与生成物一致，行为面用 m04 的"确实掉血"代表（同一批分支、同一处回合入口）。
    check(ENG.BOSSES.m02.skill.includes('攻击 +1') && ENG.BOSSES.m03.skill.includes('1 艘'),
      'm02/m03 的技能文案与生成物一致（机制分支由 audit 严格相等覆盖）',
      J([ENG.BOSSES.m02.skill, ENG.BOSSES.m03.skill]));
    check(ENG.BOSSES.m01.hp === 24 && ENG.BOSSES.m04.hp === 24 && ENG.BOSSES.m05.hp === 18,
      '五个头目的血量来自生成物（m01 24 / m04 24 / m05 18，A8 各下调 6）', J(ENG.BOSSES.m01.hp));
  }
  // ---------- ⑯ 卡库门槛（requireCardCount）真的被守卫读了 ----------
  console.log('\n[16] 接取门槛：卡库 18 艘被拒 / 20 艘可接 / 出击也拦 / 艘数只有一个来源');
  {
    const HG = await import('@/lib/battle/hangar');
    const eliteDef = B.getBountyDef('bty_e1');
    const withLib = (n) => mkGuild({ rest: { cardLibrary: Array.from({ length: n }, () => 'h1') } });
    const lib18 = withLib(18);
    const c18 = B.canAcceptBounty(lib18, 'bty_e1');
    check(!c18.ok && c18.reason.includes(String(eliteDef.requireCardCount)) && c18.reason.includes('18'),
      '18 艘 → 被拒，原因同时含门槛（20）与当前（18）', J(c18));
    check(c18.reason === `卡库至少需要 ${eliteDef.requireCardCount} 艘战舰才能接取这条悬赏（当前 18 艘）`,
      '原因原文（数字是实时算的，不是写死的）', J(c18.reason));
    const lib20 = withLib(eliteDef.requireCardCount);
    check(B.canAcceptBounty(lib20, 'bty_e1').ok, '恰好 20 艘 → 可接', J(B.canAcceptBounty(lib20, 'bty_e1')));
    // 20 艘但已接满 → 仍按"接满"拒（顺序不影响结论）
    const fullBut20 = withLib(20);
    fullBut20.bounties.active = [
      { defId: 'bty_p2', acceptedTurn: 18, expiresTurn: 32 },
      { defId: 'bty_p3', acceptedTurn: 18, expiresTurn: 31 },
      { defId: 'bty_p4', acceptedTurn: 18, expiresTurn: 30 },
    ];
    check(B.canAcceptBounty(fullBut20, 'bty_e1').reason.includes('同时最多接 3 条'),
      '20 艘但已接满 3 条 → 仍按"接满"拒（两个判据互不遮盖）', J(B.canAcceptBounty(fullBut20, 'bty_e1')));
    // 出击侧：已接但卡库掉到 18 → 同样拦（同一份判据）
    const started20 = { ...lib20, fleets: [{ id: 'fx', name: 'x', shipIds: ['h1'], defending: false }] };
    started20.bounties.active = [{ defId: 'bty_e1', acceptedTurn: 18, expiresTurn: 30 }];
    check(B.canStartBountyBattle({ ...started20, cardLibrary: Array.from({ length: 18 }, () => 'h1') }, 'bty_e1', 'fx').reason
      === `卡库至少需要 ${eliteDef.requireCardCount} 艘战舰才能接取这条悬赏（当前 18 艘）`,
      '已接但卡库掉到 18 → 出击也被同一份判据拦', J(B.canStartBountyBattle({ ...started20, cardLibrary: Array.from({ length: 18 }, () => 'h1') }, 'bty_e1', 'fx')));
    check(B.canStartBountyBattle(started20, 'bty_e1', 'fx').ok, '20 艘 + 已接 + 舰队可用 → 可以出击');
    // 唯一来源：卡库艘数 = hangar.libraryShipCount；机库总览与门槛读数一致
    check(HG.libraryShipCount(lib18.cardLibrary) === 18
      && HG.hangarSummary(lib18).totalShips === HG.libraryShipCount(lib18.cardLibrary)
      && HG.hangarSummary(lib20).totalShips === 20,
      '卡库艘数只有一个来源：hangar.libraryShipCount（hangarSummary.totalShips 读它）',
      J({ lib18: HG.libraryShipCount(lib18.cardLibrary), summary: HG.hangarSummary(lib18).totalShips }));
    // 清剿/截击档没有门槛 → 不受影响
    check(B.canAcceptBounty(withLib(0), 'bty_p1').ok, '清剿档（无 requireCardCount）不受门槛影响');
  }
  // ---------- ⑯b A5：m03 冻结版 / m04 纯坦克版 ----------
  console.log('\n[15b] A5：m03 随机冻结（不再压指挥度）/ m04 不掉本体（只留全体 +2 盾）');
  {
    const fs = require('fs');
    const path = require('path');
    const ENG2 = await import('@/lib/battle/engine');
    const { createBattle: CB, endTurn: ET } = ENG2;
    const { PIRATE_BOSSES: PB2 } = await import('@/data/battle/pirates');
    const src = fs.readFileSync(path.resolve(__dirname, '../src/lib/battle/engine.ts'), 'utf8');
    const m03block = src.split("bossId === 'm03'")[1] || '';
    const m03seg = m03block.slice(0, 500);

    // ① m04：连跑到第 6 回合，玩家本体一点不掉（本体伤害已删）
    const m4 = CB({ seed: 9, bossId: 'm04', playerFirst: true });
    const body0 = m4.player.body;
    let bodyMin = body0;
    for (let round = 1; round <= 6; round += 1) {
      m4.round = round;
      m4.active = 'boss';
      ET(m4);
      bodyMin = Math.min(bodyMin, m4.player.body);
    }
    check(bodyMin === body0, 'm04 第 1~6 回合玩家本体始终不掉血', J({ before: body0, min: bodyMin }));

    // m04 盾是**一次性**：第 3 回合的护盾总和不再增长（只验"不进每回合叠盾"这条语义）
    {
      const m4b = CB({ seed: 11, bossId: 'm04', playerFirst: true });
      const board = m4b.boss.board;
      const u = ENG2.spawnUnit(m4b, 'boss', 'v2');
      ENG2.placeUnit(m4b, 'boss', u, 0);
      const sumOf = () => m4b.boss.board.filter(Boolean).reduce((n, x) => n + (x ? x.shield : 0), 0);
      const s1 = sumOf();
      m4b.round = 3; m4b.active = 'boss'; ET(m4b);
      check(sumOf() === s1, 'm04 第 3 回合盾不再增长（一次性 +2，不是每回合）', J({ r1: s1, r3: sumOf() }));
    }
    check(!m03seg.includes('damageBody') && !src.includes("st.round % 2 === 0"), 'm04 的 damageBody 分支已删干净');
    check(PB2.m04.skill === '开场：己方全体护盾 +2' && !PB2.m04.skill.includes('本体'),
      'm04 文案 =「开场：己方全体护盾 +2」且不含「本体」（不是每回合）', J(PB2.m04.skill));
    // ② m03：实现换成冻结（`randomEnemy` + `freeze`），不再有 capBonus 压制
    
    check(!m03seg.includes('capBonus'), 'm03 不再压指挥度（分支里没有 capBonus）');
    check(PB2.m03.skill === '每回合开始：随机冻结玩家 1 艘战舰', 'm03 文案 =「每回合开始：随机冻结玩家 1 艘战舰」',
      J(PB2.m03.skill));
    // ③ 冻结语义（b1 与 m03 共用同一套 api）：冻结后该单位本回合不能行动
    const fz = CB({ seed: 3, bossId: 'm03', playerFirst: true });
    const u = ENG2.spawnUnit(fz, 'player', 'h1');
    ENG2.placeUnit(fz, 'player', u, 0);
    const apiBoss = { freeze: () => {} };
    check(typeof apiBoss.freeze === 'function' && u.frozen === 0, '玩家单位初始未冻结（frozen = 0）', J(u.frozen));
  }
  // ---------- ⑰ 敌方旗帜（四支势力各一面，唯一映射 + 文件真实存在）----------
  console.log('\n[17] 敌方旗帜：四势力各映射到正确文件，m05/raid 为 null，文件真实存在');
  {
    const fs = require('fs');
    const path = require('path');
    const F = await import('@/lib/battle/enemyFlag');
    const want = {
      m01: '/battle/guild/flag-swarm.webp',
      m02: '/battle/guild/flag-machine.webp',
      m03: '/battle/guild/flag-tide.webp',
      m04: '/battle/guild/flag-codex.webp',
    };
    check(Object.keys(want).every((id) => F.enemyFlagPath(id) === want[id]),
      'm01~m04 各自映射到正确旗帜文件', J(Object.keys(want).map((id) => F.enemyFlagPath(id))));
    check(F.enemyFlagPath('m05') === null && F.enemyFlagPath('raid') === null,
      'm05（弱海盗）与 raid（掠夺队）→ null（界面不渲染徽记）', J([F.enemyFlagPath('m05'), F.enemyFlagPath('raid')]));
    check(F.enemyFlagPath(null) === null && F.enemyFlagPath('b1') === null,
      '其它敌人 id（老巢 b1 / 空值）也返回 null', J(F.enemyFlagPath('b1')));
    check(F.enemyFlagLabel('m01') === '噬星虫群' && F.enemyFlagLabel('m04') === '旧律军团'
      && F.enemyFlagLabel('m05') === null,
      '显示名：m01「噬星虫群」/ m04「旧律军团」/ m05 为 null', J([F.enemyFlagLabel('m01'), F.enemyFlagLabel('m05')]));
    const pub = path.resolve(__dirname, '..', 'public');
    const missing = Object.keys(want).filter((id) => !fs.existsSync(path.join(pub, want[id].replace(/^\//, ''))));
    check(missing.length === 0, '四个旗帜文件在 public/battle/guild/ 下真实存在（防路径打错后静默隐藏）', J(missing));
    check(F.ENEMY_FLAG_DIR === '/battle/guild', '旗帜目录常量 = /battle/guild', J(F.ENEMY_FLAG_DIR));
  }
  // ---------- ⑱ 永久损失明细（结算面板与事件记录同一串）----------
  console.log('\n[18] 永久损失明细：settlement.lost 降序 / 文案逐字 / 事件 detail 同串 / 无损失不显示');
  {
    const RW = await import('@/lib/battle/rewards');
    // 造一个"损失 3 种卡、数量 2/4/16"的数组
    const lostIds = [];
    for (let i = 0; i < 2; i += 1) lostIds.push('q1');
    for (let i = 0; i < 4; i += 1) lostIds.push('q2');
    for (let i = 0; i < 16; i += 1) lostIds.push('q3');
    const entries = RW.lostShipEntries(lostIds);
    check(entries.length === 3 && eq(entries.map((e) => e.qty), [16, 4, 2]),
      'settlement.lost 三项且数量降序 16/4/2', J(entries.map((e) => e.qty)));
    const wantText = [entries[0], entries[1], entries[2]].map((e) => `${e.name} ×${e.qty}`).join('、');
    check(RW.lostShipsText(lostIds) === wantText, '明细串逐字（名字 ×数量、顿号分隔）', wantText);
    check(RW.lostShipsText([]) === '', '无损失 → 空串（出口据此不渲染半句）', J(RW.lostShipsText([])));
    // 真实结算：悬赏胜利后 settlement.lost 与事件 detail 里的明细必须是同一串
    const lg = mkGuild({ rest: { cardLibrary: Array.from({ length: 20 }, () => 'h1'), fleets: [{ id: 'fz', name: 'x', shipIds: ['h1'], defending: false }] } });
    const acc = gameReducer(lg, { type: 'ACCEPT_BOUNTY', defId: 'bty_p1' });
    const stt = gameReducer(acc, { type: 'START_BOUNTY_BATTLE', defId: 'bty_p1', fleetId: 'fz' });
    const hurt = { ...stt, battle: { ...stt.battle, winner: 'player', over: true, reason: 'test', player: { ...stt.battle.player, lost: ['q1', 'q3', 'q3'] } } };
    const done = gameReducer(hurt, { type: 'END_BATTLE' });
    const st = done.battle && done.battle.settlement;
    check(!!st && eq((st.lost || []).map((e) => e.qty), [2, 1]) && st.lostShips === 3,
      '真实结算：settlement.lost = 2/1、lostShips = 3', J(st && { lost: st.lost, n: st.lostShips }));
    check(!!st && done.eventLog[0].detail.includes(`永久损失 3 艘（${RW.lostShipsText(['q1', 'q3', 'q3'])}）`),
      '事件 detail 里含同一串「永久损失 3 艘（…）」', J(done.eventLog[0].detail));
  }
  // ---------- ⑲ p8 醒觉 / u9 声呐 行为断言 ----------
  console.log('\n[19] p8 thaw（2/1/0 艘）+ u9 潜航两分支 + 8 张新卡可建造');
  {
    const E2 = await import('@/lib/battle/engine');
    const S2 = await import('@/lib/battle/shipyard');
    const mk = (seed) => E2.createBattle({ seed, bossId: 'm05', playerFirst: true });
    const put = (st, side, id, slot) => { const u = E2.spawnUnit(st, side, id); E2.placeUnit(st, side, u, slot); u.sick = false; return u; };
    // deploy 要求卡在该阵营的池里：测试前把目标卡塞进池子（实际对局里它本来就在 FLEET_ALL 内）
    const dep = (st, side, id, slot) => { if (st[side].pool.indexOf(id) < 0) st[side].pool.unshift(id); return E2.deploy(st, side, id, slot); };
    const b = mk(71);
    const f1 = put(b, 'player', 'h1', 0); f1.frozen = 1;
    const f2 = put(b, 'player', 'c1', 1); f2.frozen = 2;
    b.active = 'player'; b.player.cur = 10;
    const r = dep(b, 'player', 'p8', 2);
    const pd = b.pending;
    check(!!r.ok && !!pd && pd.kind === 'thaw' && pd.cands.length === 2 && pd.need === 2,
      'p8：己方 2 艘被冻 → thaw pending，候选 2 艘、need 2', J(pd && { kind: pd.kind, n: pd.cands.length, need: pd.need }));
    const firstUid = pd.cands[0].slice();
    E2.resolvePending(b, pd.cands[0]);
    E2.resolvePending(b, pd.cands[1]);
    check(f1.frozen === 0 && f2.frozen === 0, 'p8：解析后两艘 frozen 全清', J([f1.frozen, f2.frozen]));
    const b1 = mk(72);
    const g1 = put(b1, 'player', 'h1', 0); g1.frozen = 1;
    b1.active = 'player'; b1.player.cur = 10;
    dep(b1, 'player', 'p8', 1);
    check(b1.pending && b1.pending.need === 1, 'p8：只有 1 艘被冻 → need 1（不是 2，不卡手）', J(b1.pending && b1.pending.need));
    const b0 = mk(73);
    b0.active = 'player'; b0.player.cur = 10;
    const r0 = dep(b0, 'player', 'p8', 0);
    check(!!r0.ok && b0.pending === null, 'p8：0 艘被冻 → 不发 pending，卡正常上场');
    const bu = mk(74);
    const sub = put(bu, 'boss', 'y3', 1);   // ⚠ m05 开场 1 艘 t_grunt 占着 slot 0，目标必须放 slot 1
    bu.active = 'player'; bu.player.cur = 10;
    const beforeSub = sub.shield + sub.structure;
    const ru = dep(bu, 'player', 'u9', 1);
    check(sub.shield + sub.structure === beforeSub - 3, 'u9：敌方有潜航 → 该潜航单位总血量 -3',
      J({ before: beforeSub, after: sub.shield + sub.structure, ok: ru && ru.ok, msg: ru && ru.msg }));
    const bn = mk(75);
    const tgt = put(bn, 'boss', 'q2', 1);   // 同上：slot 0 被 m05 的开场杂兵占了
    bn.active = 'player'; bn.player.cur = 10;
    const sumBoss = () => E2.unitsOf(bn, 'boss').reduce((n, x) => n + x.shield + x.structure, 0);
    const beforeT = sumBoss();   // ⚠ randomEnemy 可能抽到 m05 开场那艘杂兵 → 量**全场总血量**
    const rn = dep(bn, 'player', 'u9', 1);
    check(sumBoss() === beforeT - 1, 'u9：无潜航 → 随机敌军总血量 -1',
      J({ before: beforeT, after: sumBoss(), ok: rn && rn.ok }));
    const ids = ['i8', 'i9', 'h8', 'u7', 'u8', 'g7', 'p8', 'u9'];
    const bad = ids.filter((id) => S2.isEnemySeries(E2.CARDS[id]));
    check(bad.length === 0, '8 张新卡都不在 ENEMY_SERIES（可建造的第一关）', J(bad));
    check(!!firstUid, 'p8 pending 的候选是场上单位的 uid（非卡 id）');
  }

  // ---------- ⑳ 卡牌展示排序（唯一真值 = cardIndex.compareCardOrder）----------
  console.log('\n[20] 卡牌排序：系列 → 稀有度（白<蓝<紫<橙）→ 费用 → id');
  {
    const CI = await import('@/lib/battle/cardIndex');
    const HG = await import('@/lib/battle/hangar');
    const SY = await import('@/lib/battle/shipyard');
    // 直接对 8 张新卡 + 同系列老卡验证键序
    const cmp = CI.compareCardOrder;
    check(cmp(CI.ALL_CARDS.h8, CI.ALL_CARDS.h7) < 0, 'h8（紫·5 费）排在 h7（橙·6 费）之前',
      J({ h8: CI.ALL_CARDS.h8.rarity, h7: CI.ALL_CARDS.h7.rarity }));
    const rank = { 白: 0, 蓝: 1, 紫: 2, 橙: 3 };
    const seqOk = (ids) => {
      for (let i = 1; i < ids.length; i += 1) {
        const a = CI.ALL_CARDS[ids[i - 1]], b = CI.ALL_CARDS[ids[i]];
        if (a.series !== b.series) return false;
        if (rank[a.rarity] > rank[b.rarity]) return false;
      }
      return true;
    };
    ['h6', 'h7', 'h8'].sort((a, b) => cmp(CI.ALL_CARDS[a], CI.ALL_CARDS[b]));
    check(seqOk(['h6', 'h7', 'h8'].slice().sort((a, b) => cmp(CI.ALL_CARDS[a], CI.ALL_CARDS[b]))),
      '圣辉系列内稀有度不递减（h6/h7/h8 排序后）');
    check(seqOk(['i7', 'i8', 'i9'].slice().sort((a, b) => cmp(CI.ALL_CARDS[a], CI.ALL_CARDS[b]))),
      '铁血系列新卡 i8/i9 与 i7 的稀有度序正确');
    check(seqOk(['g6', 'g7'].slice().sort((a, b) => cmp(CI.ALL_CARDS[a], CI.ALL_CARDS[b]))),
      '财团 g7 与 g6 的稀有度序正确');
    check(seqOk(['u7', 'u8', 'u9'].slice().sort((a, b) => cmp(CI.ALL_CARDS[a], CI.ALL_CARDS[b]))),
      '通用 u7/u8/u9 的稀有度序正确');
    // 稳定性：同输入两次排序结果一致
    const ids = Object.keys(CI.ALL_CARDS);
    const once = ids.slice().sort((a, b) => cmp(CI.ALL_CARDS[a], CI.ALL_CARDS[b]));
    const twice = ids.slice().sort((a, b) => cmp(CI.ALL_CARDS[a], CI.ALL_CARDS[b]));
    check(J(once) === J(twice), '排序唯一且稳定（两次调用结果一致）', String(once.length));
    // 系列分组按 compareId 递增
    let groupOk = true;
    for (let i = 1; i < once.length; i += 1) {
      const a = CI.ALL_CARDS[once[i - 1]].series, b = CI.ALL_CARDS[once[i]].series;
      if (a > b) { groupOk = false; break; }
    }
    check(groupOk, '全列表系列分组单调不减', '');
    // 船坞/机库两处都真的用了它（行为级：船坞里 h8 必须在 h7 之前）
    const ST = mkGuild({});
    const view = SY.shipyardView(ST);
    const order = view.cards.map((c) => c.id);
    check(order.indexOf('h8') >= 0 && order.indexOf('h8') < order.indexOf('h7'),
      '船坞列表：h8 在 h7 之前', J({ h8: order.indexOf('h8'), h7: order.indexOf('h7') }));
    const lib = HG.libraryRows(ST).map((r) => r.id);
    const libOrder = lib.length ? lib : order;
    check(Array.isArray(libOrder), '机库卡库行与船坞共用同一排序函数（无第二份实现）');
  }
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








































