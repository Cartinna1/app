'use strict';
/* ============================================================================
   P7 验收：掠夺循环（V1.5 §10.2）
   用法：node --import ./scripts/register-ts.mjs scripts/check-battle-raid.cjs
   期望值一律取自 §10.2 原文（不是我的记忆）：
     · 触发条件 = 卡库战舰总数 **≥10 艘** + **存在殖民地**（两者缺一不可）
     · 每回合 **8%**；冷却 **20 回合**；无防守 → **5 回合后**掠夺成功
     · 损失 = 金币+原料+星尘，**各项以当前持有量为上限、绝不为负**
     · 防守池 = 所有带 defending 标签舰队的舰船**合并**（顺序=舰队顺序→队内顺序）
     · 掠夺队 = 无头目技能/无护盾/**20 结构值**的海盗旗舰
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

  const need = ['RAID_CHANCE', 'RAID_WARNING_TURNS', 'RAID_IMMUNE_TURNS', 'shouldStartRaid', 'raidResolution', 'raidDefensePool', 'raidLootLoss', 'raidBattleFleet', 'raidHintLines'];
  const missing = need.filter((k) => R[k] === undefined);
  if (missing.length) { console.error('raid.ts 缺少导出：' + missing.join(', ') + '（现有：' + Object.keys(R).join(', ') + '）'); process.exit(2); }

  const D = (st, a) => gameReducer(st, a);
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
    const raiding = { ...withColony, raid: { inTurns: 3, immuneTurns: 0, raiders: 1 } };
    check(R.shouldStartRaid(0, raiding) === false, '已有掠夺在途 → 不重复触发');
    const immune = { ...withColony, raid: { inTurns: null, immuneTurns: 7, raiders: 0 } };
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

  // ---------- ④ 归零时的走向 ----------
  console.log('\n[4] 倒计时归零：有防守 → 战斗；没防守 → 掠夺成功');
  {
    const def = { ...setup({ fleets: [['h1']], defending: [0] }), raid: { inTurns: 0, immuneTurns: 0, raiders: 1 } };
    check(R.raidResolution(def) === 'defense', '有防守舰队 → defense');
    const none = { ...setup({ fleets: [['h1']], defending: [] }), raid: { inTurns: 0, immuneTurns: 0, raiders: 1 } };
    check(R.raidResolution(none) === 'looted', '无防守舰队 → looted');
    const waiting = { ...def, raid: { inTurns: 3, immuneTurns: 0, raiders: 1 } };
    check(R.raidResolution(waiting) === 'none', '还在倒计时 → none');
    const idle = { ...def, raid: { inTurns: null, immuneTurns: 0, raiders: 0 } };
    check(R.raidResolution(idle) === 'none', '没有掠夺在途 → none');
    const inBattle = { ...def, battle: E.createBattle({ seed: 1, bossId: 'raid' }) };
    check(R.raidResolution(inBattle) === 'none', '战斗中 → none');
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
    // 连打两场：第二场的编制由 raidBattleFleet 决定
    const two = R.raidBattleFleet({ ...st, raid: { inTurns: 0, immuneTurns: 0, raiders: 2 } }, pool);
    check(Array.isArray(two) && two.length === pool.length, '连打两场的参战编制 = 第一场幸存舰（长度不少于池）', J(two));
  }

  // ---------- ⑦ reducer：开始掠夺 / 结算损失 ----------
  console.log('\n[7] reducer：START_RAID / APPLY_RAID_LOOT');
  {
    const st = setup({});
    const started = D(st, { type: 'START_RAID', raiders: 2 });
    check(started.raid.inTurns === R.RAID_WARNING_TURNS, `START_RAID → inTurns = ${R.RAID_WARNING_TURNS}`, String(started.raid.inTurns));
    check(started.raid.raiders === 2, 'raiders 记下 2 支');
    // 结算
    const rich = { ...started, ships: started.ships.map((s, i) => i === 0 ? { ...s, gold: 100000, food: 300, alloy: 300, stardust: 100, materials: { gold_ore: 50 } } : s) };
    const loss = R.raidLootLoss(rich);
    const before = rich.ships[0];
    const after = D(rich, { type: 'APPLY_RAID_LOOT' });
    const s0 = after.ships[0];
    check(s0.gold === before.gold - (loss.gold || 0), '金币按实扣值减少', `${before.gold} → ${s0.gold}`);
    check((s0.materials.gold_ore || 0) === (before.materials.gold_ore || 0) - ((loss.materials || {}).gold_ore || 0), '原料按实扣值减少');
    check(s0.food >= 0 && s0.alloy >= 0 && s0.stardust >= 0, '扣完后都不为负（§10.2 硬要求）', J({ f: s0.food, a: s0.alloy, sd: s0.stardust }));
    check(after.raid.inTurns === null, '结算后清掉倒计时');
    check(after.raid.immuneTurns === R.RAID_IMMUNE_TURNS, `结算后免疫 ${R.RAID_IMMUNE_TURNS} 回合`, String(after.raid.immuneTurns));
    check(after.battle === null, '结算不凭空造一场战斗');
  }

  // ---------- ⑧ 可预告（§10.2 明确要求） ----------
  console.log('\n[8] 必须可预告（§10.2【补完·实现要求】）');
  {
    const st = setup({ fleets: [['h1']], defending: [0] });
    const raiding = { ...st, raid: { inTurns: 3, immuneTurns: 0, raiders: 1 } };
    const lines = R.raidHintLines(raiding);
    check(Array.isArray(lines) && lines.length > 0, '有掠夺在途 → 有预告行', J(lines));
    check(lines.some((l) => /3|三/.test(l.text)), '预告里写明还有几回合', J(lines.map((l) => l.text)));
    check(lines.some((l) => l.severity === 'danger' || l.severity === 'warn' || l.severity === 'info'), 'severity 属既有三档');
    const noDef = { ...raiding, fleets: raiding.fleets.map((f) => ({ ...f, defending: false })) };
    const lines2 = R.raidHintLines(noDef);
    check(lines2.some((l) => /防守|掠夺/.test(l.text)), '没有防守舰队时预告要提醒会被掠夺', J(lines2.map((l) => l.text)));
    check(R.raidHintLines(setup({})).length === 0, '没有掠夺在途 → 不加噪音');
    // 并进下一回合预告
    const all = hints.getNextTurnHints(raiding);
    check(Array.isArray(all) && all.length > 0, 'getNextTurnHints 能算出来（含掠夺提示）', J(all.map((h) => h.id)));
  }

  console.log('\n=== P7 验收结果 ===');
  if (fails.length === 0) console.log('  全部通过 ✓');
  else { console.log('  ' + fails.length + ' 条失败 ✗'); process.exitCode = 1; }
})().catch((e) => {
  console.error('验收脚本自身出错：', e && e.stack ? e.stack.split('\n').slice(0, 10).join('\n') : e);
  process.exitCode = 2;
});
