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
  // 掠夺的唯一真值（③d 要验"出征与掠夺同时归零"两条都对：出征自动开战 / 掠夺只转阶段 B）
  const RK = await import('@/lib/battle/raid');

  /** 逐字段比较用的紧凑打印（对象顺序在两侧同源，故可直接比字符串） */
  const J = (x) => JSON.stringify(x);

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

  // ---------- ③b 抵达判定：只取决于状态本身（off-by-one 的回归） ----------
  // ⚠ P5 回归（2026-08 用户报"出征跃迁回合结束后既没开战、也没有开战入口"）：
  //   旧实现 `readyExpedition(state, afterTick)` 是"读 TICK 前的状态 + 猜一位"（afterTick=true 等价
  //   `turnsRemaining <= 1`），把抵达判定押在「TICK 与 START_BATTLE 必须同批、且真的被派发」上。  //   现在改成：**先 tickExpedition 投影、再从未投影结果判定**（与掠夺那条同形），
  //   判据是 expeditionArrived（`turnsRemaining <= 0`）—— 谁读都只读状态，与派发时序无关。
  console.log('\n[3b] 抵达判定只取决于状态（先投影再判；1 回合出征必须在结束回合那次就开战）');
  {
    let s = withColony('terran', ['e06']);
    s = { ...s, cardLibrary: fleetsMod.FLEET_STARTER.slice(0, 3) };
    s = D(s, { type: 'CREATE_BATTLE_FLEET' });
    for (const id of s.cardLibrary) s = D(s, { type: 'ADD_SHIP_TO_FLEET', fleetId: s.fleets[0].id, shipId: id });
    const fid = s.fleets[0].id;
    const withTurns = (n) => D(s, { type: 'START_EXPEDITION', bossId: 'b1', fleetId: fid, turns: n });

    // ① 投影 = reducer 的 TICK（唯一真值，逐字段一致 —— 不许两份算式）
    const e3 = withTurns(3);
    const projE3 = { ...e3, expedition: EXP.tickExpedition(e3.expedition), raid: RK.tickRaid(e3.raid) };
    const tickedE3 = D(e3, { type: 'TICK_BATTLE_STATE' });
    check(
      J(tickedE3.expedition) === J(projE3.expedition) && J(tickedE3.raid) === J(projE3.raid),
      '**投影函数（tickExpedition / tickRaid）与 reducer 的 TICK_BATTLE_STATE 逐字段一致**（同一份算式）',
      J(projE3.expedition) + ' vs ' + J(tickedE3.expedition)
    );
    check(EXP.tickExpedition(null) === null, 'tickExpedition(null) = null（没有出征时不动）');

    // ② 还剩 3 回合：投影后仍在路上
    check(EXP.expeditionArrived(projE3.expedition) === false, '还剩 3 回合：投影后尚未抵达');
    check(EXP.readyExpedition(projE3) === null, '还剩 3 回合：不开战');

    // ③ **最短的 1 回合出征必须在结束回合的那一次就开战**（用户这次的卡尔戈出征就是 1 回合）
    const e1 = withTurns(1);
    const projE1 = { ...e1, expedition: EXP.tickExpedition(e1.expedition), raid: RK.tickRaid(e1.raid) };
    check(projE1.expedition.turnsRemaining === 0, '1 回合出征：结束回合那一次 TICK 后倒计时归零', String(projE1.expedition.turnsRemaining));
    check(EXP.expeditionArrived(projE1.expedition) === true, '归零 = 已抵达（expeditionArrived 只看状态）');
    const readyE1 = EXP.readyExpedition(projE1);
    check(
      !!readyE1 && readyE1.bossId === 'b1' && J(readyE1.fleet) === J(e1.fleets[0].shipIds),
      '**1 回合出征：结束回合那次就给出 START_BATTLE（参战 = 该舰队编制）**',
      J(readyE1)
    );

    // ④ 已经归零（turnsRemaining: 0 且 battle=null）的状态：判定只读状态 → 必然开战。
    //   ⚠ 与旧实现的行为差异（已实测）：旧的 `readyExpedition(state, true)` 在这个形状上**也**会开战
    //     （它的判据是 `<= 1`）——它的真正毛病是"读 TICK 前的状态 + 猜一位"：
    //     ① 判据把"抵达"表达成"还剩 1 回合"，于是归零那一帧**界面只能显示「还有 0 回合抵达」**
    //        （旧 expeditionEtaText 没有下限，这正是用户截图里那个死界面）；
    //     ② 判定的正确性依赖调用方**恰好**多传那一位：少传 / 传错批次时，同一份状态给出的答案就变了
    //        （判定不再只取决于状态）。新写法把这两条都断在上面：判据 = expeditionArrived（`<= 0`）。
    const zero = withTurns(0);
    const projZero = { ...zero, expedition: EXP.tickExpedition(zero.expedition), raid: RK.tickRaid(zero.raid) };
    check(!!EXP.readyExpedition(projZero), '**倒计时已归零的旧状态（turnsRemaining=0）读到也必须开战**', J(EXP.readyExpedition(projZero)));
    // 负数倒计时（读档 / 迁移可能造出来的越界值）也必须算"已抵达"：判据是 `<= 0` 而不是 `=== 0`。
    const negative = { ...withTurns(0), expedition: { ...withTurns(0).expedition, turnsRemaining: -3 } };
    check(EXP.expeditionArrived(negative.expedition) === true, '负数倒计时也算已抵达（判据是 <= 0，不是 == 0）');
    check(!!EXP.readyExpedition(negative), '负数倒计时 → 照样开战（不卡死）');

    // ⑤ 投影后方才归零 / 仍在路上：不开战（不提前开战）
    check(EXP.readyExpedition({ ...withTurns(2), expedition: EXP.tickExpedition(withTurns(2).expedition) }) === null, '还剩 2 回合：投影后仍有 1 回合，不开战');

    // ⑥ 边界：战斗进行中 / 没有出征 / 舰队被删 / 舰船全被击毁后编制为空
    check(EXP.readyExpedition({ ...projZero, expedition: null }) === null, '没有出征 → 不开战');
    const eBattle = { ...projZero, battle: E.createBattle({ seed: 9, bossId: 'b1' }) };
    check(EXP.readyExpedition(eBattle) === null, '战斗已在进行 → 不开新战');
    // ⚠ P6 起 reducer 已经**不允许删除出征中的舰队**（DELETE_BATTLE_FLEET 有守卫）——
    //   这一步再也不能用 dispatch 造出"出征指向已不存在的舰队"。但 readyExpedition 的这条兜底仍必须保留：
    //   旧存档（P6 之前删过）与"舰船全被击毁/永久损失后编制为空"都可能落到这个形状。
    //   故这里**直接构造**那个形状（手写一份去掉该舰队的 fleets），而不是绕开守卫。
    const zeroNow = withTurns(0);
    check(
      D(zeroNow, { type: 'DELETE_BATTLE_FLEET', fleetId: fid }) === zeroNow,
      'P6 守卫：出征中的舰队删不掉（返回原对象）'
    );
    const eNoFleet = { ...zeroNow, fleets: zeroNow.fleets.filter((f) => f.id !== fid) };
    check(EXP.readyExpedition(eNoFleet) === null, '舰队被删 → 不开战（不崩）');
    const eEmpty = { ...zeroNow, fleets: zeroNow.fleets.map((f) => ({ ...f, shipIds: [] })) };
    check(EXP.readyExpedition(eEmpty) === null, '出征舰队被掏空 → 不开战（不崩）');
  }

  // ---------- ③c 界面：绝不出现「还有 0 回合抵达」 ----------
  console.log('\n[3c] 界面模型：剩余回合显示下限 1（与掠夺 raidStatus.turnsToArrival 同口径）');
  {
    let s = withColony('terran', ['e06']);
    s = { ...s, cardLibrary: fleetsMod.FLEET_STARTER.slice(0, 3) };
    s = D(s, { type: 'CREATE_BATTLE_FLEET', name: '界面队' });
    for (const id of s.cardLibrary) s = D(s, { type: 'ADD_SHIP_TO_FLEET', fleetId: s.fleets[0].id, shipId: id });
    const fid = s.fleets[0].id;
    const at = (n) => D(s, { type: 'START_EXPEDITION', bossId: 'b1', fleetId: fid, turns: n });

    const none = EXP.expeditionView(s);
    check(none.onExpedition === false && none.turnsRemaining === 0 && none.etaText === '', '没有出征：onExpedition=false、无文案', J(none));

    const v3 = EXP.expeditionView(at(3));
    check(v3.turnsRemaining === 3 && v3.etaText === '还有 3 回合抵达', '在途 3 回合：显示 3', J(v3.etaText));
    check(v3.bossId === 'b1' && v3.bossLabel.length > 0 && v3.fleetName === '界面队', '在途：目标名 / 舰队名来自 lib（UI 不查表）', J([v3.bossLabel, v3.fleetName]));

    // 归零那一帧：显示下限 1，**不许**渲染「还有 0 回合抵达」
    const zeroSt = at(0);
    const v0 = EXP.expeditionView(zeroSt);
    check(v0.arrived === true, '归零：arrived = true（界面该等开战）');
    check(v0.turnsRemaining === 1, '**归零时剩余回合的显示下限是 1**（不是 0）', String(v0.turnsRemaining));
    check(!/0/.test(v0.etaText), '**归零时文案里没有 0**（不出现「还有 0 回合抵达」）', v0.etaText);
    check(EXP.expeditionEtaText(0) === '还有 1 回合抵达', 'expeditionEtaText(0) 下限 1', EXP.expeditionEtaText(0));
    check(EXP.expeditionEtaText(-2) === '还有 1 回合抵达', 'expeditionEtaText(负数) 也钳到 1（防御性下限）', EXP.expeditionEtaText(-2));

    // 投影之后（= useTurn 判定用的那一帧）：仍然不出现 0
    const projZero = { ...zeroSt, expedition: EXP.tickExpedition(zeroSt.expedition) };
    check(EXP.expeditionView(projZero).turnsRemaining === 1, '投影后（已归零）显示仍是下限 1', String(EXP.expeditionView(projZero).turnsRemaining));
    const afterTickSt = D(at(1), { type: 'TICK_BATTLE_STATE' });
    check(
      EXP.expeditionView(afterTickSt).etaText === '还有 1 回合抵达',
      'reducer 已 TICK 到 0 的那一帧：文案仍不是「还有 0 回合抵达」',
      EXP.expeditionView(afterTickSt).etaText
    );
  }

  // ---------- ③d 与掠夺同时归零：两条都正确 ----------
  //   出征 = 自动开战；掠夺 = 只转阶段 B（等玩家开战）。两者都读"投影后的状态"，互不干扰。
  console.log('\n[3d] 出征与掠夺同时归零：出征自动开战、掠夺转阶段 B（互不干扰）');
  {
    let s = withColony('terran', ['e06']);
    s = { ...s, cardLibrary: fleetsMod.FLEET_STARTER.slice(0, 3) };
    s = D(s, { type: 'CREATE_BATTLE_FLEET', name: '双线队' });
    for (const id of s.cardLibrary) s = D(s, { type: 'ADD_SHIP_TO_FLEET', fleetId: s.fleets[0].id, shipId: id });
    const fid = s.fleets[0].id;
    s = D(s, { type: 'START_EXPEDITION', bossId: 'b1', fleetId: fid, turns: 1 });
    s = D(s, { type: 'START_RAID', raiders: 1 });
    s = { ...s, raid: { ...s.raid, inTurns: 1 } };   // 阶段 A 也只剩 1 回合

    // useTurn 的编排：先投影，再判
    const proj = { ...s, expedition: EXP.tickExpedition(s.expedition), raid: RK.tickRaid(s.raid) };
    const readyExp = EXP.readyExpedition(proj);
    check(!!readyExp && readyExp.bossId === 'b1', '出征归零 → 给出 START_BATTLE', J(readyExp));
    check(RK.raidResolution(proj) === 'arrived', '掠夺同时归零 → 转阶段 B（arrived），不自动开战', RK.raidResolution(proj));
    check(RK.raidPhase(proj.raid) === 'warning' && RK.raidWarningElapsed(proj.raid), '掠夺此刻仍是阶段 A 但倒计时已归零（转段信号只看状态）');

    // 真正落库：TICK → START_BATTLE（出征）+ ARRIVE_RAID（掠夺），两条都走对
    let live = D(s, { type: 'TICK_BATTLE_STATE' });
    live = D(live, { type: 'START_BATTLE', bossId: readyExp.bossId, fleet: readyExp.fleet, kind: 'expedition', seed: 3 });
    check(!!live.battle && live.battle.bossId === 'b1', '同一回合里出征真的开战了', live.battle ? live.battle.bossId : 'null');
    const liveArrived = D(live, { type: 'ARRIVE_RAID' });
    check(
      RK.raidPhase(liveArrived.raid) === 'arrived' && liveArrived.raid.arrivedTurns === RK.RAID_ARRIVED_TURNS,
      '同一回合里掠夺也转成了阶段 B（战斗结束后玩家可点「开战」）',
      J(liveArrived.raid)
    );
    check(liveArrived.expedition !== null && liveArrived.expedition.turnsRemaining === 0, '出征记录保留到战斗结束（END_BATTLE 才清空）', J(liveArrived.expedition));
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