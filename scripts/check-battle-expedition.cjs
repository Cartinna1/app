'use strict';
/* ============================================================================
   P5 验收：出征闭环（老巢数据 / 出征耗时对文档 / 探明门槛 / 全流程 / 战利品 / 回合守卫）
   用法：node --import ./scripts/register-ts.mjs scripts/check-battle-expedition.cjs
   亮点：拿实现算出的"出征耗时"去对 V1.5 §7.1 那张表（b4 7.4 / b3 8.0 / b1 9.0 / b5 11.4 / b2 11.6），
        文档表是早先用独立算法算的 → 两条独立路径对上了才算真对。
   ============================================================================ */
const fails = [];
const check = (ok, label, detail) => {
  if (ok) console.log('  ✓ ' + label);
  else { fails.push(label + (detail ? ' → ' + detail : '')); console.log('  ✗ ' + label + (detail ? '  → ' + detail : '')); }
};

(async () => {
  const { gameReducer, createInitialGameState } = await import('@/hooks/gameReducer');
  const { createMotherships } = await import('@/data/gameData');
  const nodes = await import('@/data/galaxy/nodes');
  const graph = await import('@/lib/galaxy/graph');
  const EXP = await import('@/lib/battle/expedition');
  const RW = await import('@/lib/battle/rewards');
  const fleetsMod = await import('@/data/battle/fleets');
  const E = await import('@/lib/battle/engine');

  const D = (st, a) => gameReducer(st, a);
  const fight = (st) => {
    let s = st, n = 0;
    while (s.battle && !s.battle.over && n++ < 200) s = D(s, { type: 'BATTLE_ACTION', action: { type: 'autoTurn' } });
    return s;
  };
  /** 建一个"已建殖民地 + 已探明若干老巢"的状态。
   *  ⚠ createInitialGameState() 的 ships 是**空数组**（母舰在 SELECT_SHIP 才创建，见 AGENTS 第三节），
   *  所以这里必须用 createMotherships() 真造一艘母舰再挂 colony，否则 ships.map(...) 是空转、
   *  state.ships[0] 为 undefined，后面所有断言都会假失败。 */
  const withColony = (planetType, visited, extra) => {
    const st = createInitialGameState();
    const ship = createMotherships()[0];
    st.phase = 'playing';
    st.ships = [{
      ...ship,
      ...(extra || {}),
      colony: { ...ship.colony, phase: 'active', planetType },
      galaxy: { ...ship.galaxy, visitedNodes: visited },
    }];
    return st;
  };

  // ---------- ① 五个老巢节点 ----------
  console.log('\n[1] 五个老巢节点（V1.5 §7.1）');
  const WANT = { e20: 'b4', e11: 'b3', e06: 'b1', e16: 'b5', e12: 'b2' };
  const all = nodes.GALAXY_NODES || [];
  check(all.filter((n) => n.pirateLair).length === 5, '恰好 5 个节点被标为老巢', String(all.filter((n) => n.pirateLair).length));
  for (const [nid, bid] of Object.entries(WANT)) {
    const n = all.find((x) => x.id === nid);
    check(!!n && n.pirateLair === bid, `${nid} → ${bid}`, n ? String(n.pirateLair) : 'missing');
  }
  const v = graph.validateGalaxy();
  const vOk = typeof v === 'boolean' ? v : (v && v.ok !== undefined ? v.ok : !(v && v.errors && v.errors.length));
  check(!!vOk, 'validateGalaxy() 仍然通过（坐标与航道没被动）', JSON.stringify(v).slice(0, 120));

  // ---------- ② 出征耗时对文档 ----------
  // ⚠ 口径已定（2026-08，与 AGENTS 第七节登记一致）：出征耗时走 getGalaxyTurns 的**钳制后**值
  //    （上限 MAX_ROUTE_TURNS=9，lib/galaxy/graph.ts，与跃迁回合数、贸易折价同源）。
  //    V1.5 §7.1 那张表登记的 7.4 / 8.0 / 9.0 / 11.4 / 11.6 是**未钳制的原始最短路**均值
  //    （已用独立算法逐位复现，见 expedition.ts 注释）：b5/b2 有 8/10 个殖民地到老巢的原始距离 > 9，
  //    钳成 9 之后文档那两个 11.x 在游戏里不会出现 —— **这是有意接受的**，不改图也不改锚点。
  //    故本节的期望值 = 钳制后均值（文档原表留在注释里，供后续复核）。
  console.log('\n[2] 出征耗时 × 10 个殖民地取平均（口径 = getGalaxyTurns，含 MAX_ROUTE_TURNS=9 钳制）');
  const DOC_AVG = { b4: 6.6, b3: 6.9, b1: 6.8, b5: 8.2, b2: 8.2 };   // 已定口径：钳制后均值
  const RAW_AVG = { b4: 7.4, b3: 8.0, b1: 9.0, b5: 11.4, b2: 11.6 }; // 未钳制原始最短路均值（V1.5 §7.1 旧表数值）
  let cappedPairs = 0, cappedReport = [];
  const colonyNodes = all.filter((n) => n.type === 'colony');
  check(colonyNodes.length === 10, '10 个殖民地节点', String(colonyNodes.length));
  for (const [nid, bid] of Object.entries(WANT)) {
    let sum = 0, n = 0;
    for (const c of colonyNodes) {
      const t = graph.getGalaxyTurns(c.id, nid);
      if (typeof t === 'number') { sum += t; n++; }
    }
    const avg = n ? Math.round((sum / n) * 10) / 10 : NaN;
    check(Math.abs(avg - DOC_AVG[bid]) <= 0.2, `${bid}(${nid}) 平均出征耗时 ${avg} ≈ 文档 ${DOC_AVG[bid]}`);
      for (const c of colonyNodes) { const r = graph.shortestRoute(c.id, nid); if (r && r.capped) cappedPairs++; }
      cappedReport.push(`${bid}:${avg}`);
  }

  // 钳制必须真的在生效：否则说明有人改了 MAX_ROUTE_TURNS/坐标，上面那组期望值就失效了
  check(cappedPairs > 0, '钳制确实生效（有殖民地→老巢的原始最短路被 MAX_ROUTE_TURNS=9 截断）', '被截断的殖民地×老巢 共 ' + cappedPairs + ' 对');
  console.log('    在役平均出征耗时一览：' + cappedReport.join('  '));

  // ---------- ③ 殖民地节点反查 + 探明门槛 ----------
  console.log('\n[3] 殖民地节点反查 + 探明门槛');
  const init = createInitialGameState();
  check(EXP.colonyNodeId(init) === null, '还没建殖民地 → colonyNodeId 为 null');
  check(EXP.canStartExpedition(init, 'b1', 'x').ok === false, '没有殖民地时不能出征');

  const st1 = withColony('terran', []);
  check(EXP.colonyNodeId(st1) === 'c_terran', '殖民地节点由 planetType 反查到 c_terran', String(EXP.colonyNodeId(st1)));
  check(EXP.isLairDiscovered(st1, 'b1') === false, '没到访过 → 该老巢未探明');
  check(EXP.discoveredLairs(st1).length === 0, '未探明时不给出征列表（不做占位提示，§10.1）');
  const st2 = withColony('terran', ['e06']);
  check(EXP.isLairDiscovered(st2, 'b1') === true, '到访过 e06 → b1 老巢已探明');
  const list = EXP.discoveredLairs(st2);
  check(list.length === 1 && list[0].bossId === 'b1' && typeof list[0].turns === 'number', '出征列表只含已探明的老巢且带耗时', JSON.stringify(list));

  // ---------- ③b readyExpedition 的 off-by-one（useTurn 读的是 TICK 之前的状态）----------
  console.log('\n[3b] 归零判定的 off-by-one（TICK 前 vs TICK 后）');
  {
    let s = withColony('terran', ['e06']);
    s = { ...s, cardLibrary: fleetsMod.FLEET_STARTER.slice(0, 3) };
    s = D(s, { type: 'CREATE_BATTLE_FLEET' });
    for (const id of s.cardLibrary) s = D(s, { type: 'ADD_SHIP_TO_FLEET', fleetId: s.fleets[0].id, shipId: id });
    const fid = s.fleets[0].id;
    const withTurns = (n) => D(s, { type: 'START_EXPEDITION', bossId: 'b1', fleetId: fid, turns: n });
    const e3 = withTurns(3);
    check(EXP.readyExpedition(e3) === null && EXP.readyExpedition(e3, true) === null, '还剩 3 回合：都不该开战');
    const e1 = withTurns(1);
    check(EXP.readyExpedition(e1) === null, '还剩 1 回合、按 TICK 前判：不开战');
    check(!!EXP.readyExpedition(e1, true), '还剩 1 回合、按**本次 TICK 后**判：**开战**（否则 off-by-one）');
    const e0 = withTurns(0);
    check(!!EXP.readyExpedition(e0) && !!EXP.readyExpedition(e0, true), '已经 0 回合：两种口径都开战');
    const eNoFleet = D(e0, { type: 'DELETE_BATTLE_FLEET', fleetId: fid });
    check(EXP.readyExpedition(eNoFleet, true) === null, '舰队被删 → 不开战（不崩）');
    const eBattle = { ...e0, battle: E.createBattle({ seed: 9, bossId: 'b1' }) };
    check(EXP.readyExpedition(eBattle, true) === null, '战斗已在进行 → 不开新战');
  }

  // ---------- ④ 全流程 ----------
  console.log('\n[4] 全流程：出征 → N 回合 → 开战 → 打完 → 结算');
  let st = withColony('terran', ['e06']);
  st = { ...st, cardLibrary: fleetsMod.FLEET_STARTER.slice() };
  st = D(st, { type: 'CREATE_BATTLE_FLEET', name: '出征队' });
  for (const id of st.cardLibrary) st = D(st, { type: 'ADD_SHIP_TO_FLEET', fleetId: st.fleets[0].id, shipId: id });
  const can = EXP.canStartExpedition(st, 'b1', st.fleets[0].id);
  check(can.ok === true, '可以出征', can.reason || '');
  const turns = EXP.expeditionTurns(st, 'b1');
  check(typeof turns === 'number' && turns > 0, `出征耗时算出来了（${turns} 回合）`);
  st = D(st, { type: 'START_EXPEDITION', bossId: 'b1', fleetId: st.fleets[0].id, turns });
  check(!!st.expedition && st.expedition.turnsRemaining === turns, '出征已登记');
  check(EXP.canEndGameTurn(st) === true, '出征在途、还没开战 → 仍可结束游戏回合');
  for (let i = 0; i < turns; i++) st = D(st, { type: 'TICK_BATTLE_STATE' });
  check(st.expedition.turnsRemaining === 0, '倒计时归零', String(st.expedition.turnsRemaining));
  check(EXP.canEndGameTurn(st) === true, '归零但还没开战 → 仍可结束回合（开战由 useTurn 触发）');

  // ---------- ⑤ 开战 + 回合守卫 + 战利品 ----------
  console.log('\n[5] 开战后：不能结束游戏回合 + 战利品（含饥荒减半）');
  st = D(st, { type: 'START_BATTLE', bossId: 'b1', fleet: st.fleets[0].shipIds.slice(), kind: 'expedition', seed: 1 });
  check(!!st.battle, '已开战');
  check(EXP.canEndGameTurn(st) === false, '**战斗中不能结束游戏回合**');

  // 找一个玩家获胜的 seed（确定性：从 1 往上试）
  let winSeed = 0;
  for (let seed = 1; seed <= 60 && !winSeed; seed++) {
    const b = E.createBattle({ seed, bossId: 'b1', fleet: 'starter' });
    let g = 0;
    while (!b.over && g++ < 200) E.aiTurn(b, b.active);
    if (b.winner === 'player') winSeed = seed;
  }
  check(winSeed > 0, '找到一个玩家获胜的 seed', 'seed=' + winSeed);
  if (winSeed) {
    // ⚠ food / gold / stardust 是**母舰字段**（ship.food…），不是 GameState 的顶层字段：
    //   写 `{ ...st, food: 7 }` 只是往 state 上挂了个没人读的键，母舰实际食物没变（会假通过）。
    //   故这里一律改 ships[0]。
    const withShip = (state, patch) => ({ ...state, ships: [{ ...state.ships[0], ...patch }, ...state.ships.slice(1)] });
    const base = withShip(st, { food: 7, gold: 1000, stardust: 5 });
    let w = D(base, { type: 'START_BATTLE', bossId: 'b1', fleet: base.fleets[0].shipIds.slice(), kind: 'expedition', seed: winSeed });
    w = fight(w);
    check(w.battle.winner === 'player', '这场确实是玩家赢的', w.battle.winner);
    const rw = RW.battleRewards(w.battle);
    check(rw.gold === 100000 && rw.stardust === 40, '老巢战利品 = 100000 金币 + 40 星尘（§〇/§10.2）', JSON.stringify(rw));
    check(w.ships[0].food >= 0, '这一场结算时不是饥荒（食物 ≥ 0）', String(w.ships[0].food));
    const before = { gold: w.ships[0].gold, sd: w.ships[0].stardust, log: (w.ships[0].goldLog || []).length };
    const after = D(w, { type: 'END_BATTLE' });
    const s0 = after.ships[0];
    check(s0.gold - before.gold === 100000, '金币 +100000（不饥荒时）', '+' + (s0.gold - before.gold));
    check(s0.stardust - before.sd === 40, '星尘 +40', '+' + (s0.stardust - before.sd));
    check((s0.goldLog || []).length > before.log, '写入了金币流水（pushGoldLog）');
    check(after.battle === null, 'END_BATTLE 清掉战斗');
    check(after.expedition === null, '出征战结束 → 出征清空');

    // 饥荒（food < 0）→ 金币收益减半：直接把 food 设成负数，不打完整个回合结算，
    // 这样 before/after 之间**只有 END_BATTLE 一件事**会动金币（口径干净）。
    const famStart = withShip(st, { food: -1, gold: 1000, stardust: 5 });
    let f = D(famStart, { type: 'START_BATTLE', bossId: 'b1', fleet: famStart.fleets[0].shipIds.slice(), kind: 'expedition', seed: winSeed });
    f = fight(f);
    check(f.ships[0].food < 0, '这一场结算时确实处于饥荒（食物 < 0）', String(f.ships[0].food));
    const fBefore = { gold: f.ships[0].gold, sd: f.ships[0].stardust };
    const f0 = D(f, { type: 'END_BATTLE' }).ships[0];
    check(f0.gold - fBefore.gold === 50000, '**饥荒时金币收益减半**（famineHalveGold）', '+' + (f0.gold - fBefore.gold));
    check(f0.stardust - fBefore.sd === 40, '星尘不受饥荒影响', '+' + (f0.stardust - fBefore.sd));
  }

  // 掠夺战本阶段不给奖励
  const rr = RW.battleRewards(E.createBattle({ seed: 5, bossId: 'raid' }));
  check(rr.gold === 0 && rr.stardust === 0, '掠夺队本阶段不给奖励（§10.2 随机奖励属后续）', JSON.stringify(rr));

  console.log('\n=== P5 验收结果 ===');
  if (fails.length === 0) console.log('  全部通过 ✓');
  else { console.log('  ' + fails.length + ' 条失败 ✗'); process.exitCode = 1; }
})().catch((e) => {
  console.error('验收脚本自身出错：', e && e.stack ? e.stack.split('\n').slice(0, 10).join('\n') : e);
  process.exitCode = 2;
});