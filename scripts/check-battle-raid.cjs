'use strict';
/* ============================================================================
   P7 验收：掠夺循环（V1.5 §10.2）
   用法：node --import ./scripts/register-ts.mjs scripts/check-battle-raid.cjs
   期望值一律取自 §10.2 原文（不是我的记忆）：
     · 触发条件 = 卡库战舰总数 **≥10 艘** + **存在殖民地**（两者缺一不可）
     · 每回合 **8%**；冷却 **20 回合**；无防守 → **5 回合后**掠夺成功
     · 损失 = 金币 20% + 原料各自 1/3（**不动星尘**，用户 2026-08 裁定），各项以当前持有量为上限、绝不为负
     · 防守池 = 所有带 defending 标签舰队的舰船**合并**（顺序=舰队顺序→队内顺序）
     · 掠夺队 = 无头目技能/无护盾/**20 结构值**的海盗旗舰
   ⚠ **两段窗口**（用户 2026-08 裁定的流程，取代旧的"归零即自动开战"）：
     阶段 A（预警 5 回合）→ 归零只**转入阶段 B**（不自动开战）→ 阶段 B 再给 5 回合，
     玩家点「开战」才打（`readyRaidBattle`），一直不点则**自动失败 = 掠夺成功**。
     本脚本 [4]/[2]/[7]/[8] 的构造与期望已按新流程改写，逐条见交付报告。
   ============================================================================ */
const fails = [];
const check = (ok, label, detail) => {
  if (ok) console.log('  ✓ ' + label);
  else { fails.push(label + (detail ? ' → ' + detail : '')); console.log('  ✗ ' + label + (detail ? '  → ' + detail : '')); }
};
const J = (v) => JSON.stringify(v);

(async () => {
  const { gameReducer, createInitialGameState } = await import('@/hooks/gameReducer');
  const R = await import('@/lib/battle/raid');
  const E = await import('@/lib/battle/engine');
  const fleetsMod = await import('@/data/battle/fleets');
  const hints = await import('@/lib/turn/nextTurnHints');
  const { createMotherships } = await import('@/data/gameData');
  const { applyColonyFounding } = await import('@/lib/colony/colonySetup');

  const need = ['RAID_CHANCE', 'RAID_WARNING_TURNS', 'RAID_ARRIVED_TURNS', 'RAID_IMMUNE_TURNS', 'idleRaidState', 'raidPhase', 'raidStatus', 'raidCardView', 'raidWarningElapsed', 'shouldStartRaid', 'raidResolution', 'readyRaidBattle', 'raidDefensePool', 'raidLootLoss', 'raidBattleFleet', 'raidHintLines'];
  const missing = need.filter((k) => R[k] === undefined);
  if (missing.length) { console.error('raid.ts 缺少导出：' + missing.join(', ') + '（现有：' + Object.keys(R).join(', ') + '）'); process.exit(2); }

  const D = (st, a) => gameReducer(st, a);
  /** raid 状态构造器（**两段窗口**：warning 用 inTurns，arrived 用 arrivedTurns；键序与 idleRaidState 一致） */
  const raidState = (o) => {
    const x = o || {};
    return {
      inTurns: x.inTurns === undefined ? null : x.inTurns,
      arrivedTurns: x.arrivedTurns || 0,
      immuneTurns: x.immuneTurns || 0,
      raiders: x.raiders || 0,
      arrived: !!x.arrived,
    };
  };
  const LIB10 = fleetsMod.FLEET_STARTER.slice(0, 10);   // §10.2：≥10 艘才触发
  /** 有殖民地 + 有卡库（可指定舰队与防守标签） */
  const setup = (opts) => {
    const o = opts || {};
    // ⚠ 修正（P7 实现时发现）：createInitialGameState() 是"还没选船"的初始态（ships 为空、没有殖民地），
    //   直接用它会得到"没有母舰、没有殖民地"的状态 → 下面每一处"有殖民地"的前提都不成立，
    //   [5]/[7] 还会拿到 undefined 母舰而崩。故先 SELECT_SHIP 造出一艘母舰，
    //   殖民地走唯一真值 applyColonyFounding（只塞 {phase, planetType} 的话，
    //   [8] 的 getNextTurnHints 会真去算殖民地经济而崩）。**断言一条未改**。
    let st = D(createInitialGameState(), { type: 'SELECT_SHIP', shipId: createMotherships()[0].id });
    st = { ...st, cardLibrary: (o.lib || LIB10).slice() };
    st.ships = st.ships.map((s, i) => i === 0
      ? { ...s, colony: applyColonyFounding(s.colony || {}, 'terran', '陆地星球') }
      : s);
    const fleetSpecs = o.fleets || [];
    for (let i = 0; i < fleetSpecs.length; i++) st = D(st, { type: 'CREATE_BATTLE_FLEET' });
    fleetSpecs.forEach((spec, i) => {
      for (const id of spec) st = D(st, { type: 'ADD_SHIP_TO_FLEET', fleetId: st.fleets[i].id, shipId: id });
      if (o.defending && o.defending.indexOf(i) >= 0) st = D(st, { type: 'TOGGLE_FLEET_DEFENDING', fleetId: st.fleets[i].id });
    });
    return st;
  };

  // ---------- ① 常量 ----------
  console.log('\n[1] 常量（§10.2 / §11 定案）');
  check(R.RAID_CHANCE === 0.08, '每回合触发概率 = 8%', String(R.RAID_CHANCE));
  check(R.RAID_IMMUNE_TURNS === 20, '免疫回合 = 20', String(R.RAID_IMMUNE_TURNS));
  check(typeof R.RAID_WARNING_TURNS === 'number' && R.RAID_WARNING_TURNS === 5, '无防守时 5 回合后掠夺成功（预警窗口 = 5）', String(R.RAID_WARNING_TURNS));

  // ---------- ② 触发条件（两条前提缺一不可） ----------
  console.log('\n[2] 触发条件：存在殖民地 ＋ 卡库 ≥10 艘');
  {
    const withColony = setup({});
    check(R.shouldStartRaid(0, withColony) === true, '殖民地 + 10 艘 + roll=0 → 触发');
    check(R.shouldStartRaid(0.079, withColony) === true, 'roll=0.079 → 触发（8% 边界内）');
    check(R.shouldStartRaid(0.08, withColony) === false, 'roll=0.08 → 不触发（边界外）');
    check(R.shouldStartRaid(0.99, withColony) === false, 'roll=0.99 → 不触发');
    // 没有殖民地
    const noColony = { ...withColony, ships: withColony.ships.map((s, i) => i === 0 ? { ...s, colony: { ...s.colony, phase: 'inactive', planetType: null } } : s) };
    check(R.shouldStartRaid(0, noColony) === false, '**没有殖民地 → 永不触发**（§10.2「掠夺以存在殖民地为前提」）');
    // 卡库不足 10 艘
    const few = setup({ lib: LIB10.slice(0, 9) });
    check(R.shouldStartRaid(0, few) === false, '**卡库只有 9 艘 → 不触发**（§10.2 触发条件是 ≥10 艘）');
    const nineOrMore = setup({ lib: fleetsMod.FLEET_STARTER.slice(0, 10) });
    check(R.shouldStartRaid(0, nineOrMore) === true, '刚好 10 艘 → 触发');
    // 已在途 / 免疫中
    const raiding = { ...withColony, raid: raidState({ inTurns: 3 }) };
    check(R.shouldStartRaid(0, raiding) === false, '已有掠夺在途（阶段 A）→ 不重复触发');
    const arrived = { ...withColony, raid: raidState({ arrivedTurns: 5, arrived: true, raiders: 1 }) };
    check(R.shouldStartRaid(0, arrived) === false, '掠夺已抵达（阶段 B 待战）→ 也不重复触发');
    const immune = { ...withColony, raid: raidState({ immuneTurns: 7 }) };
    check(R.shouldStartRaid(0, immune) === false, '免疫期内 → 不触发');
    const inBattle = { ...withColony, battle: E.createBattle({ seed: 1, bossId: 'raid' }) };
    check(R.shouldStartRaid(0, inBattle) === false, '战斗中 → 不触发');
  }

  // ---------- ③ 防守池合并 ----------
  console.log('\n[3] 防守池：所有带防守标签的舰队合并');
  {
    // ⚠ 修正（P7 实现时发现）：默认卡库 LIB10 = FLEET_STARTER 前 10 张，里面**没有 g1** →
    //   ADD_SHIP_TO_FLEET 会按"编入份数 ≤ 卡库持有份数"拒绝，第三支队会是空的，
    //   于是"两支防守队共 3 艘"永远不成立。这里显式给出这三支队需要的卡（断言未改）。
    const st = setup({ lib: ['h1', 'h1', 'c1', 'c2', 'g1'], fleets: [['h1', 'h1'], ['c1', 'c2'], ['g1']], defending: [0, 2] });
    const pool = R.raidDefensePool(st);
    check(pool.length === 3, '两支防守队共 3 艘进池（非防守队不进）', J(pool));
    check(pool[0] === 'h1' && pool[1] === 'h1' && pool[2] === 'g1', '顺序 = 舰队顺序 → 队内顺序', J(pool));
    const noDef = setup({ fleets: [['h1']], defending: [] });
    check(R.raidDefensePool(noDef).length === 0, '没有防守标签的舰队 → 空池');
    // 上限
    const many = []; for (let i = 0; i < 40; i++) many.push('c1');
    const big = setup({ lib: many, fleets: [many], defending: [0] });
    const capped = R.raidDefensePool(big);
    check(capped.length <= 30, '防守池不超过 30 艘（编队上限）', String(capped.length));
  }

  // ---------- ④ 两段窗口：阶段 A 归零只转段；阶段 B 等玩家开战 / 超时自动失败 ----------
  console.log('\n[4] 两段窗口：预警归零 → 转入阶段 B（不自动开战）→ 迎战或超时掠夺成功');
  {
    const withDef = setup({ fleets: [['h1']], defending: [0] });
    const noDef = setup({ fleets: [['h1']], defending: [] });

    // --- 阶段 A（warning）：只在倒计时，绝不产出"该开战/该掠夺"的结论 ---
    const warning = { ...withDef, raid: raidState({ inTurns: 3 }) };
    check(R.raidPhase(warning.raid) === 'warning', '阶段 A：raidPhase = warning', R.raidPhase(warning.raid));
    check(R.raidResolution(warning) === 'none' && R.raidResolution(warning, true) === 'none', '阶段 A 还剩 3 回合：都不动');
    // 阶段 A 归零（useTurn 读到的是 TICK 之前的状态 → afterTick=true，等价"本次 TICK 后归零"）
    const lastWarning = { ...withDef, raid: raidState({ inTurns: 1 }) };
    check(R.raidResolution(lastWarning, true) === 'arrived', '阶段 A 倒计时归零（TICK 后）→ **arrived（转入阶段 B）**');
    check(R.raidResolution(lastWarning) === 'none', '同一状态按 TICK 前判：还没到（off-by-one 防线）');
    // tickRaid 把 inTurns 减到 0 后停在 0（不自己跨段）
    check(R.tickRaid(raidState({ inTurns: 1 })).inTurns === 0, 'tickRaid：阶段 A 减到 0 就停在 0（跨段由调用方按 arrived 处理）');

    // --- 阶段 B（arrived）：等玩家点「开战」；不点则到期 looted ---
    const arrived = { ...withDef, raid: raidState({ arrivedTurns: 5, arrived: true, raiders: 1 }) };
    check(R.raidPhase(arrived.raid) === 'arrived', '阶段 B：raidPhase = arrived', R.raidPhase(arrived.raid));
    check(R.raidResolution(arrived) === 'none' && R.raidResolution(arrived, true) === 'none', '阶段 B 还在 5 回合窗口内：**不自动开战、也不结算掠夺**');
    const arrivedLast = { ...withDef, raid: raidState({ arrivedTurns: 1, arrived: true, raiders: 1 }) };
    check(R.raidResolution(arrivedLast, true) === 'looted', '阶段 B 倒计时归零（TICK 后）→ **自动失败 = looted**');
    check(R.raidResolution(arrivedLast) === 'none', '同一状态按 TICK 前判：还有 1 回合（off-by-one 防线）');
    check(R.tickRaid(raidState({ arrivedTurns: 1, arrived: true })).arrivedTurns === 0, 'tickRaid：阶段 B 减到 0 就停在 0');

    // 有防守 / 没防守在阶段 B 都不改"要不要自动开战"的结论（玩家不点就都是 looted）
    const arrivedNoDef = { ...noDef, raid: raidState({ arrivedTurns: 1, arrived: true, raiders: 1 }) };
    check(R.raidResolution(arrivedNoDef, true) === 'looted', '阶段 B 超时：有没有防守舰队都是 looted（空池 = 必输，等价）');

    // --- 玩家点「开战」才走 readyRaidBattle（唯一由玩家主动点开的战斗入口） ---
    const ready = R.readyRaidBattle(arrived);
    check(!!ready && ready.fleet.length === R.raidDefensePool(arrived).length, '阶段 B 有防守池 → readyRaidBattle 给出合并池', J(ready));
    check(R.readyRaidBattle(arrivedNoDef) === null, '阶段 B 空防守池 → 不给开战（按钮禁用，等超时掠夺成功）');
    check(R.readyRaidBattle(warning) === null, '**阶段 A 不给开战入口**（还没到）');
    check(R.readyRaidBattle({ ...arrived, battle: E.createBattle({ seed: 1, bossId: 'raid' }) }) === null, '战斗进行中 → 不给开战');
    const idle = { ...withDef, raid: R.idleRaidState() };
    check(R.raidResolution(idle) === 'none' && R.raidPhase(idle.raid) === 'idle', '没有掠夺在途 → idle / none');
    const inBattle = { ...arrived, battle: E.createBattle({ seed: 1, bossId: 'raid' }) };
    check(R.raidResolution(inBattle) === 'none', '战斗中 → none（掠夺窗口冻结，等战斗结束）');

    // --- raidStatus：UI 与预告共用的那一份视图 ---
    const vs = R.raidStatus(arrived);
    check(vs.phase === 'arrived' && vs.turnsToAutoLoot === 5 && vs.canFight === true, 'raidStatus（阶段 B 有防守）：可开战', J(vs));
    const vs2 = R.raidStatus(arrivedNoDef);
    check(vs2.phase === 'arrived' && vs2.canFight === false, 'raidStatus（阶段 B 空池）：canFight = false', J(vs2));
    const vs3 = R.raidStatus(warning);
    check(vs3.phase === 'warning' && vs3.turnsToArrival === 3 && vs3.turnsToAutoLoot === 0, 'raidStatus（阶段 A）：只有抵达倒计时', J(vs3));
  }

  // ---------- ⑤ 损失：各项以持有量为上限、绝不为负 ----------
  console.log('\n[5] 掠夺成功的损失（各项以持有量为上限、绝不为负）');
  {
    const rich = setup({});
    rich.ships = rich.ships.map((s, i) => i === 0 ? { ...s, gold: 1000000, food: 500, alloy: 500, stardust: 200, materials: { gold_ore: 100 } } : s);
    const loss = R.raidLootLoss(rich);
    check(loss.gold > 0 || loss.food > 0 || loss.alloy > 0 || loss.stardust > 0, '有钱时确实会损失一些东西', J(loss));
    check(loss.food <= 500 && loss.alloy <= 500, '损失不超过持有量');
    // 用户裁定口径：金币 20%（四舍五入）、原料各自 1/3（四舍五入）、**不动星尘**
    check(loss.gold === Math.round(1000000 * 0.2), '金币损失 = 持有量的 20%（四舍五入）', `${loss.gold} vs ${Math.round(1000000 * 0.2)}`);
    check(loss.stardust === 0, '**不动星尘**（用户裁定优先于 §10.2）', String(loss.stardust));
    check((loss.materials.gold_ore || 0) === Math.round(100 / 3), '原料损失 = 各自持有的 1/3（四舍五入）', `${loss.materials.gold_ore} vs ${Math.round(100 / 3)}`);
    check(loss.food === 0 && loss.alloy === 0, '食物/合金不参与损失（§10.2 只列金币+原料+星尘）');
    // 穷光蛋：不能为负
    const poor = setup({});
    poor.ships = poor.ships.map((s, i) => i === 0 ? { ...s, gold: 0, food: 0, alloy: 0, stardust: 0, materials: {} } : s);
    const loss2 = R.raidLootLoss(poor);
    const anyNeg = [loss2.gold, loss2.food, loss2.alloy, loss2.stardust].some((v) => v < 0) || Object.values(loss2.materials || {}).some((v) => v < 0);
    check(!anyNeg, '一无所有时损失不会变成负数', J(loss2));
    check((loss2.food || 0) === 0 && (loss2.alloy || 0) === 0 && (loss2.stardust || 0) === 0, '一无所有时食物/合金/星尘损失为 0');
  }

  // ---------- ⑥ 掠夺战：敌方规格 + 连打两场 ----------
  console.log('\n[6] 掠夺战：20 结构值海盗旗舰；2 支 = 连打两场（本体一条血不重置）');
  {
    const st = setup({ fleets: [['h1']], defending: [0] });
    const pool = R.raidDefensePool(st);
    const one = D(st, { type: 'START_BATTLE', bossId: 'raid', fleet: pool, kind: 'defense', seed: 7 });
    check(!!one.battle && one.battle.bossId === 'raid', '能开掠夺战');
    check(one.battle.boss.body === 20, '掠夺队本体 = 20 结构值（§10.2：无头目技能、无护盾）', String(one.battle.boss.body));
    check(one.battle.player.body === 15, '玩家本体 15 血（BODY_HP）', String(one.battle.player.body));
    check(one.battle.player.pool.length === pool.length, '参战池 = 防守池', J(one.battle.player.pool));
    // 连打两场：第二场的编制由 raidBattleFleet 决定（阶段 B = arrivedTurns>0）
    const two = R.raidBattleFleet({ ...st, raid: raidState({ arrivedTurns: 5, arrived: true, raiders: 2 }) }, pool);
    check(Array.isArray(two) && two.length === pool.length, '连打两场的参战编制 = 第一场幸存舰（长度不少于池）', J(two));
  }

  // ---------- ⑦ reducer：START_RAID / ARRIVE_RAID / APPLY_RAID_LOOT / START_RAID_BATTLE ----------
  console.log('\n[7] reducer：START_RAID → ARRIVE_RAID（转段）→ 开战或 APPLY_RAID_LOOT');
  {
    const st = setup({ fleets: [['h1']], defending: [0] });
    const started = D(st, { type: 'START_RAID', raiders: 2 });
    check(started.raid.inTurns === R.RAID_WARNING_TURNS, `START_RAID → 阶段 A inTurns = ${R.RAID_WARNING_TURNS}`, String(started.raid.inTurns));
    check(started.raid.raiders === 2, 'raiders 记下 2 支');
    check(started.raid.arrivedTurns === 0, 'START_RAID 时阶段 B 倒计时为 0（还没抵达）', String(started.raid.arrivedTurns));
    check(D(started, { type: 'START_RAID', raiders: 1 }) === started, '已有在途掠夺 → START_RAID 原样返回（幂等）');

    // 阶段 A → 阶段 B：只转段，**不建战斗**
    const arrived = D(started, { type: 'ARRIVE_RAID' });
    check(arrived.raid.inTurns === null && arrived.raid.arrivedTurns === R.RAID_ARRIVED_TURNS, `ARRIVE_RAID → 阶段 B arrivedTurns = ${R.RAID_ARRIVED_TURNS}`, J(arrived.raid));
    check(arrived.battle === null, '**ARRIVE_RAID 绝不自动开战**（battle 仍为 null）');
    check(arrived.raid.raiders === 2, '转段保留掠夺队支数');
    check(D(arrived, { type: 'ARRIVE_RAID' }) === arrived, '不在阶段 A 时 ARRIVE_RAID 原样返回（幂等）');

    // 阶段 B 的「开战」：唯一由玩家主动点开的战斗入口
    const fought = D(arrived, { type: 'START_RAID_BATTLE' });
    check(!!fought.battle && fought.battle.bossId === 'raid', 'START_RAID_BATTLE 建起掠夺防守战');
    check(fought.battle.player.pool.length === R.raidDefensePool(arrived).length, '参战池 = 防守合并池', J(fought.battle.player.pool));
    check(fought.raid.arrivedTurns === 0, '开战即离开待战窗口（arrivedTurns = 0）', String(fought.raid.arrivedTurns));
    // 阶段 A / 空池 / 战斗中都不许开战（reducer 守卫 = readyRaidBattle）
    const noDefSt = setup({ fleets: [['h1']], defending: [] });
    const arrivedNoDef = D(D(noDefSt, { type: 'START_RAID', raiders: 1 }), { type: 'ARRIVE_RAID' });
    check(D(arrivedNoDef, { type: 'START_RAID_BATTLE' }) === arrivedNoDef, '**空防守池 → 不给开战**（原样返回，等超时掠夺成功）');
    check(D(started, { type: 'START_RAID_BATTLE' }) === started, '阶段 A → 不给开战（原样返回）');

    // 结算（自动失败 / 打输 / 打赢的收尾都走这一步）
    const rich = { ...arrived, ships: arrived.ships.map((s, i) => i === 0 ? { ...s, gold: 100000, food: 300, alloy: 300, stardust: 100, materials: { gold_ore: 50 } } : s) };
    const loss = R.raidLootLoss(rich);
    const before = rich.ships[0];
    const after = D(rich, { type: 'APPLY_RAID_LOOT' });
    const s0 = after.ships[0];
    check(s0.gold === before.gold - (loss.gold || 0), '金币按实扣值减少', `${before.gold} → ${s0.gold}`);
    check((s0.materials.gold_ore || 0) === (before.materials.gold_ore || 0) - ((loss.materials || {}).gold_ore || 0), '原料按实扣值减少');
    check(s0.food >= 0 && s0.alloy >= 0 && s0.stardust >= 0, '扣完后都不为负（§10.2 硬要求）', J({ f: s0.food, a: s0.alloy, sd: s0.stardust }));
    check(after.raid.inTurns === null && after.raid.arrivedTurns === 0, '结算后两个倒计时都清空', J(after.raid));
    check(after.raid.immuneTurns === R.RAID_IMMUNE_TURNS, `结算后免疫 ${R.RAID_IMMUNE_TURNS} 回合`, String(after.raid.immuneTurns));
    check(after.battle === null, '结算不凭空造一场战斗');
  }

  // ---------- ⑧ 可预告（§10.2 明确要求）· 两段窗口各自一句 ----------
  console.log('\n[8] 必须可预告（§10.2【补完·实现要求】）：阶段 A 与阶段 B 的文案必须能区分');
  {
    const st = setup({ fleets: [['h1']], defending: [0] });
    const raiding = { ...st, raid: raidState({ inTurns: 3 }) };
    const lines = R.raidHintLines(raiding);
    check(Array.isArray(lines) && lines.length > 0, '阶段 A → 有预告行', J(lines));
    check(lines.some((l) => /3|三/.test(l.text)), '阶段 A 预告里写明还有几回合抵达', J(lines.map((l) => l.text)));
    check(lines.some((l) => l.id === 'raid_incoming'), '阶段 A 的行 id = raid_incoming');
    check(lines.some((l) => l.severity === 'danger' || l.severity === 'warn' || l.severity === 'info'), 'severity 属既有三档');
    const noDef = { ...raiding, fleets: raiding.fleets.map((f) => ({ ...f, defending: false })) };
    const lines2 = R.raidHintLines(noDef);
    check(lines2.some((l) => /防守|掠夺/.test(l.text)), '阶段 A 没有防守舰队时预告要提醒会被掠夺', J(lines2.map((l) => l.text)));

    // 阶段 B：文案必须说"已抵达 + 还有 N 回合不迎战就掠夺成功"，且 id 与阶段 A 不同
    const arrivedSt = { ...st, raid: raidState({ arrivedTurns: 4, arrived: true, raiders: 1 }) };
    const lines3 = R.raidHintLines(arrivedSt);
    check(lines3.some((l) => l.id === 'raid_arrived'), '阶段 B 的行 id = raid_arrived（与阶段 A 区分）', J(lines3.map((l) => l.id)));
    check(lines3.some((l) => /已抵达/.test(l.text) && /4/.test(l.text) && /掠夺成功/.test(l.text)), '阶段 B 文案：已抵达 + 还有 4 回合 + 不迎战就掠夺成功', J(lines3.map((l) => l.text)));
    const arrivedNoDefSt = { ...noDef, raid: raidState({ arrivedTurns: 4, arrived: true, raiders: 1 }) };
    const lines4 = R.raidHintLines(arrivedNoDefSt);
    check(lines4.some((l) => /防守/.test(l.text) && /掠夺成功/.test(l.text)), '阶段 B 空池 → danger：会被掠夺成功', J(lines4.map((l) => l.text)));

    check(R.raidHintLines(setup({})).length === 0, '没有掠夺在途 → 不加噪音');
    check(R.raidHintLines({ ...st, raid: raidState({ arrivedTurns: 3, arrived: true, immuneTurns: 6 }) }).length === 2, '阶段 B + 免疫期 → 两行（抵达 + 免疫）');
    // 并进下一回合预告
    const all = hints.getNextTurnHints(raiding);
    check(Array.isArray(all) && all.length > 0, 'getNextTurnHints 能算出来（含掠夺提示）', J(all.map((h) => h.id)));
    const allB = hints.getNextTurnHints(arrivedSt);
    check(allB.some((h) => h.id === 'raid_arrived'), 'getNextTurnHints 在阶段 B 也带上抵达提示', J(allB.map((h) => h.id)));
  }

  // ---------- ⑨ 两段窗口的**转段**与界面模型（P7 回归：用户 2026-08 报"卡在还有 0 回合抵达"） ----------
  //  症状：界面显示「海盗还有 0 回合抵达」，推进多少回合都不变，也永远没有「开战」按钮。
  //  根因有**两半**，这里分别钉住：
  //   ① **状态那一半**：阶段 A 的倒计时被 tickRaid 钳在 0，所以"本次 TICK 后归零"先以
  //      `inTurns: 0` 的形态存在；旧实现把转段押在"ARRIVE_RAID 必须与 TICK 同批且真的被派发"上，
  //      批边界一旦落在两者之间，状态就永久停在 `inTurns: 0 + arrivedTurns: 0`（仍是阶段 A）。
  //      现在转段信号 `raidWarningElapsed` 只看状态本身，与派发时序无关。
  //   ② **界面那一半**：卡片只渲染 raidCardView 给的模型；阶段 A 永远不渲染「开战」按钮、
  //      也永远不显示"还有 0 回合抵达"。
  console.log('\n[9] 两段窗口的转段与开战入口（inTurns 归零必须转阶段 B；界面模型由 lib 定死）');
  {
    const A = setup({ fleets: [['h1']], defending: [0] });      // 有防守池（阶段 B 能开战）
    const N = setup({ fleets: [['h1']], defending: [] });       // 无防守池（阶段 B 按钮禁用）

    // ① 归零本身就是**与 dispatch 时序无关**的转段信号
    const zero = { ...A, raid: raidState({ inTurns: 0, raiders: 1 }) };
    check(R.raidWarningElapsed(zero.raid) === true, '归零判据：raidWarningElapsed(inTurns=0) = true（唯一真值）', J(R.raidWarningElapsed(zero.raid)));
    check(R.raidWarningElapsed({ ...A, raid: raidState({ inTurns: 3 }) }.raid) === false, '未归零：raidWarningElapsed = false（inTurns=3）');
    check(R.raidResolution(zero) === 'arrived', '**inTurns 已归零 → 按 TICK 前判也必须是 arrived**（旧实现这里给 none，转段全靠编排队列）');
    check(R.raidResolution(zero, true) === 'arrived', 'inTurns 已归零 → 按 TICK 后判同样 arrived（两种读法一致）');

    // ② ARRIVE_RAID 的幂等判据 = "已经在阶段 B"（不再用 inTurns === null）
    const zeroSt = D(zero, { type: 'ARRIVE_RAID' });
    check(
      R.raidPhase(zeroSt.raid) === 'arrived' && zeroSt.raid.arrivedTurns === R.RAID_ARRIVED_TURNS,
      '**ARRIVE_RAID 作用于 inTurns=0 的状态也能转段**（不再有"守卫把 0 当成不在阶段 A"的空档）',
      J(zeroSt.raid)
    );
    check(D(zeroSt, { type: 'ARRIVE_RAID' }) === zeroSt, '已在阶段 B → ARRIVE_RAID 原样返回（幂等，重放不重置倒计时）');

    // ③ 完整编排：从 5 起连续结束回合，**倒计时归零的那个回合必须转成阶段 B**
    let lived = D(A, { type: 'START_RAID', raiders: 1 });
    check(lived.raid.inTurns === R.RAID_WARNING_TURNS, '起手：START_RAID 记下阶段 A 倒计时', String(lived.raid.inTurns));
    for (let k = 0; k < 3; k++) lived = D(lived, { type: 'TICK_BATTLE_STATE' });   // 5 → 2（与测试存档同一构造）
    check(lived.raid.inTurns === 2, '三次 TICK 后剩 2 回合（与测试存档同起点）', String(lived.raid.inTurns));

    const phases = [];
    for (let n = 1; n <= 2; n++) {
      const decision = R.raidResolution(lived, true);            // 编排判定（读 TICK 前，与 useTurn 同序）
      lived = D(lived, { type: 'TICK_BATTLE_STATE' });           // ① TICK
      if (decision === 'arrived') lived = D(lived, { type: 'ARRIVE_RAID' });
      else if (decision === 'looted') lived = D(lived, { type: 'APPLY_RAID_LOOT' });
      phases.push(R.raidStatus(lived).phase);
      check(
        R.raidStatus(lived).phase === 'arrived' || lived.raid.inTurns > 0,
        `第 ${n} 个回合结束后**不许停在 inTurns=0 的阶段 A**`,
        J(lived.raid)
      );
    }
    check(phases[0] === 'warning' && phases[1] === 'arrived', '**连续 TICK 到 A 归零后，归零那回合必然转成阶段 B**（off-by-one 防线）', J(phases));
    check(R.raidStatus(lived).turnsToAutoLoot === R.RAID_ARRIVED_TURNS, '转阶段 B 时待战倒计时 = 5', String(R.raidStatus(lived).turnsToAutoLoot));

    // ④ UI 模型：阶段 B ≠ 阶段 A；阶段 A 永远不给开战入口
    const cardA = R.raidCardView({ ...A, raid: raidState({ inTurns: 3, raiders: 1 }) });
    const cardB = R.raidCardView({ ...A, raid: raidState({ arrivedTurns: 5, arrived: true, raiders: 1 }) });
    check(cardA.phase === 'warning' && cardB.phase === 'arrived', 'raidCardView 的 phase 与 raidStatus 同源', J([cardA.phase, cardB.phase]));
    check(
      cardA.headline !== cardB.headline && cardA.detail !== cardB.detail && cardA.tone !== cardB.tone,
      '**阶段 B 的渲染模型 ≠ 阶段 A**（标题 / 正文 / 配色三处都不同）',
      J([cardA.headline, cardB.headline])
    );
    check(cardA.showFightButton === false, '**阶段 A 不渲染「开战」按钮**（还没到，用户 2026-08 裁定）');
    check(cardB.showFightButton === true && cardB.canFight === true, '阶段 B 有防守池 → 渲染「开战」且可点', J({ s: cardB.showFightButton, c: cardB.canFight }));
    check(cardB.fightHint.length > 0, '阶段 B 的开战按钮旁永远有一句话（手机端没有 hover）', cardB.fightHint);
    const cardBEmpty = R.raidCardView({ ...N, raid: raidState({ arrivedTurns: 5, arrived: true, raiders: 1 }) });
    check(cardBEmpty.showFightButton === true && cardBEmpty.canFight === false, '阶段 B 空防守池 → 按钮出现但禁用（并写明原因）', cardBEmpty.fightHint);

    // ⑤ **界面永远不许显示"还有 0 回合抵达"**
    const cardAtZero = R.raidCardView({ ...A, raid: raidState({ inTurns: 0, raiders: 1 }) });
    check(
      cardAtZero.status.turnsToArrival !== 0 || cardAtZero.phase === 'arrived',
      '**inTurns=0 时不许渲染「还有 0 回合抵达」**（要么已转段，要么最少显示 1 回合）',
      J({ phase: cardAtZero.phase, turns: cardAtZero.status.turnsToArrival, headline: cardAtZero.headline })
    );
    check(
      R.raidStatus({ ...A, raid: raidState({ inTurns: 0 }) }).turnsToArrival === 1,
      '阶段 A 的剩余回合数下限为 1（0 只出现在阶段 B 的待战倒计时）',
      String(R.raidStatus({ ...A, raid: raidState({ inTurns: 0 }) }).turnsToArrival)
    );

    // ⑥ 整张卡该不该出现
    check(cardA.showCard === true && cardB.showCard === true, '阶段 A / B 都渲染卡片');
    check(R.raidCardView(setup({})).showCard === false, '没有掠夺在途且不在免疫期 → 不渲染卡片（不加噪音）');
    const idleImmune = R.raidCardView({ ...setup({}), raid: raidState({ immuneTurns: 6 }) });
    check(
      idleImmune.showCard === true && idleImmune.phase === 'idle' && idleImmune.idleText.indexOf('6') >= 0,
      '免疫期 → 渲染卡片并报"还有 N 回合不会再被掠夺"',
      idleImmune.idleText
    );
  }

  console.log('\n=== P7 验收结果 ===');
  if (fails.length === 0) console.log('  全部通过 ✓');
  else { console.log('  ' + fails.length + ' 条失败 ✗'); process.exitCode = 1; }
})().catch((e) => {
  console.error('验收脚本自身出错：', e && e.stack ? e.stack.split('\n').slice(0, 10).join('\n') : e);
  process.exitCode = 2;
});
