'use strict';
/* ============================================================================
   P7 验收：掠夺循环（V1.5 §10.2）
   用法：node --import ./scripts/register-ts.mjs scripts/check-battle-raid.cjs
   期望值一律取自 V1.5 §10.2 原文（不是我的记忆）：
     · 触发条件 = 卡库战舰总数 **≥10 艘** + **存在殖民地**（两者缺一不可）
     · 每回合 **8%**；冷却 **20 回合**；无防守 → **5 回合后**掠夺成功
     · 损失 = 金币 20% + 原料各自 1/3（**不动星尘**，用户 2026-08 裁定），各项以当前持有量为上限、绝不为负
     · 防守池 = 所有带 defending 标签舰队的舰船**合并**（顺序=舰队顺序→队内顺序）
     · 掠夺队 = 无头目技能/无护盾/**20 结构值**的海盗旗舰
   ⚠ **两段窗口**（用户 2026-08 裁定的流程，取代旧的"归零即自动开战"）：
     阶段 A（预警 5 回合）→ 归零只**转入阶段 B**（不自动开战）→ 阶段 B 再给 5 回合，
     玩家点「开战」才打（`readyRaidBattle`），一直不点则**自动失败 = 掠夺成功**。
     本脚本 [4]/[2]/[7]/[8] 的构造与期望已按新流程改写，逐条见交付报告。
   ⚠ **用户 2026-08 三条裁定**（覆盖 §10.2 原文，见 [10]）：
     ① 掠夺队**永远存在**（"星际海盗不可能打光"）→ 触发条件里不许加"还有没打败的老巢"门槛；
     ② 5 个老巢全被打败后掠夺队**改名**「海盗残兵」（判据数据驱动 = GALAXY_NODES 的 pirateLair，不硬编码 5）；
     ③ 掠夺队用**自己的**卡组 = 15 张（减半）且构成本身更偏低阶（比 30 张的老巢池弱）。
   ============================================================================ */
const fails = [];
const fs = require('fs');
const path = require('path');
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

  const need = ['RAID_CHANCE', 'RAID_WARNING_TURNS', 'RAID_ARRIVED_TURNS', 'RAID_IMMUNE_TURNS', 'idleRaidState', 'raidPhase', 'raidStatus', 'raidCardView', 'raidWarningElapsed', 'shouldStartRaid', 'raidResolution', 'readyRaidBattle', 'raidDefensePool', 'raidLootLoss', 'raidBattleFleet', 'raidHintLines', 'raidEnemyName', 'allLairsDefeated', 'recordDefeatedLair', 'LAIR_BOSS_IDS_FROM_NODES', 'RAID_ENEMY_NAME', 'RAID_REMNANT_NAME'];
  const missing = need.filter((k) => R[k] === undefined);
  if (missing.length) { console.error('raid.ts 缺少导出：' + missing.join(', ') + '（现有：' + Object.keys(R).join(', ') + '）'); process.exit(2); }

  const D = (st, a) => gameReducer(st, a);
  /** 把一场战斗用 autoTurn 打到底（走 reducer 的 BATTLE_ACTION，全程 clone） */
  const fightTo = (st) => {
    let x = st, n = 0;
    while (x.battle && !x.battle.over && n++ < 400) x = D(x, { type: 'BATTLE_ACTION', action: { type: 'autoTurn' } });
    return x;
  };
  /** 扫 src/ 下所有 .ts/.tsx 的**代码部分**（去掉注释）里含有某字面量的文件（相对 src 的路径）。 */
  const scanLiteralInSrc = (literal) => {
    const root = path.resolve(__dirname, '../src');
    const out = [];
    const walk = (dir) => {
      for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
        const p = path.join(dir, e.name);
        if (e.isDirectory()) { walk(p); continue; }
        if (!/\.tsx?$/.test(e.name)) continue;
        const code = fs.readFileSync(p, 'utf8')
          .replace(/\/\*[\s\S]*?\*\//g, ' ')     // 块注释
          .replace(/\/\/[^\n]*/g, '');           // 行注释
        if (code.indexOf(literal) >= 0) out.push(path.relative(root, p).replace(/\\/g, '/'));
      }
    };
    walk(root);
    return out;
  };
  /** 读一份源码（相对仓库根，如 'src/lib/battle/rewards.ts'）—— 源码级断言用 */
  const readSrc = (rel) => fs.readFileSync(path.resolve(__dirname, '..', rel), 'utf8');
  /** 去掉注释后的代码（只留代码与字符串）—— 判"组件有没有 import 奖励常量"这类断言必须去注释，
   *  否则解释口径的注释（例如"唯一产出口 = rewards.rollRaidReward"）会命中。保留换行。 */
  const codeOf = (rel) => readSrc(rel)
    .replace(/\/\*[\s\S]*?\*\//g, (m) => m.replace(/[^\n]/g, ' '))
    .replace(/\/\/[^\n]*/g, '');
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

  // ---------- ⑩ 用户 2026-08 三条裁定：掠夺队永远存在 / 老巢打光改名「海盗残兵」/ 自有 15 张低阶卡组 ----------
  //  裁定原文（覆盖 §10.2「全部打败后不再有掠夺」）：
  //   · 掠夺队**永远存在**（"星际海盗不可能打光"）→ shouldStartRaid 的四个条件里不许加"还有没打败的老巢"；
  //   · **5 个老巢全被打败**后掠夺队只**改名**「海盗残兵」（判据数据驱动，不硬编码 5）；
  //   · 掠夺队用**自己的**卡组：15 张（减半）且构成本身更偏低阶（比老巢池弱）。
  console.log('\n[10] 用户 2026-08 三条裁定（永远存在 / 打光改名 / 自有 15 张低阶卡组）');
  {
    const { RAID_POOL, PIRATE_POOL, PIRATE_BOSSES } = await import('@/data/battle/pirates');
    const { GALAXY_NODES } = await import('@/data/galaxy/nodes');
    const { buildSaveData, stateFromSave, migrateSave } = await import('@/lib/save');

    // ---- ① 卡组：15 张、与老巢池不同、更弱，且引擎真的按 bossId 分流 ----
    const costOf = (id) => E.CARDS[id].cost;
    const powerOf = (pool) => pool.reduce((s, id) => s + E.CARDS[id].atk + E.CARDS[id].shield + E.CARDS[id].structure, 0);
    const manaOf = (pool) => pool.reduce((s, id) => s + costOf(id), 0);
    check(RAID_POOL.length === 15, '掠夺队卡组 = **15 张**（裁定：比老巢少一半）', String(RAID_POOL.length));
    check(J(RAID_POOL) !== J(PIRATE_POOL), '掠夺池与老巢池**不是同一个池**（老巢仍是 30 张）', `老巢 ${PIRATE_POOL.length} / 掠夺 ${RAID_POOL.length}`);
    check(!RAID_POOL.some((id) => id === 'r8' || id === 'r9' || id === 'r10'), '掠夺池不含头目 / 旗舰级（r8 头目舰 / r9 嗜血旗舰 / r10 深海阎王号）', J([...new Set(RAID_POOL)]));
    check(Math.max(...RAID_POOL.map(costOf)) < Math.max(...PIRATE_POOL.map(costOf)), '掠夺池最高费 < 老巢池最高费（更偏低阶）', `${Math.max(...RAID_POOL.map(costOf))} vs ${Math.max(...PIRATE_POOL.map(costOf))}`);
    check(powerOf(RAID_POOL) < powerOf(PIRATE_POOL), '掠夺池总战力（Σ 攻+盾+体）< 老巢池', `${powerOf(RAID_POOL)} vs ${powerOf(PIRATE_POOL)}`);
    check(manaOf(RAID_POOL) < manaOf(PIRATE_POOL), '掠夺池总费用 < 老巢池（能花掉的指挥度更少）', `${manaOf(RAID_POOL)} vs ${manaOf(PIRATE_POOL)}`);
    console.log('    卡组对比：掠夺 ' + RAID_POOL.length + ' 张 / 战力 ' + powerOf(RAID_POOL) + ' / 总费 ' + manaOf(RAID_POOL)
      + '　老巢 ' + PIRATE_POOL.length + ' 张 / 战力 ' + powerOf(PIRATE_POOL) + ' / 总费 ' + manaOf(PIRATE_POOL));
    // 实测口径（同 seed、同编制、两边都是引擎的 AI）：一把下来掠夺队到底能下多少艘
    const deployedAvg = (bossId, n) => {
      let sum = 0;
      for (let i = 1; i <= n; i++) {
        const b = E.createBattle({ seed: 900000 + i * 13, bossId });
        let k = 0;
        while (!b.over && k++ < 400) E.aiTurn(b, b.active);
        sum += b.boss.deployed;
      }
      return Math.round((sum / n) * 10) / 10;
    };
    const dRaid = deployedAvg('raid', 20), dLair = deployedAvg('b1', 20);
    check(dRaid < dLair, '实测（20 seed 均值）：掠夺队每场部署舰数 < 老巢 b1', `${dRaid} vs ${dLair}`);
    console.log('    实测部署（20 seed 均值 · 新手编制 · 双方 AI）：掠夺队 ' + dRaid + ' 艘 / 老巢 b1 ' + dLair + ' 艘');
    // 引擎分流（逐字搬自 DEMO 的那一处分支）
    check(J(E.createBattle({ seed: 1, bossId: 'raid' }).boss.pool) === J(RAID_POOL), 'bossId=raid → 敌方池 = RAID_POOL', J(E.createBattle({ seed: 1, bossId: 'raid' }).boss.pool.slice(0, 3)));
    check(J(E.createBattle({ seed: 1, bossId: 'b1' }).boss.pool) === J(PIRATE_POOL), 'bossId=b1 → 敌方池仍 = PIRATE_POOL（老巢不受影响）');

    // ---- ② 名字：数据驱动（GALAXY_NODES 的 pirateLair，不硬编码 5）----
    const lairIds = GALAXY_NODES.filter((n) => n.pirateLair).map((n) => n.pirateLair);
    check(lairIds.length === 5, '老巢来自 GALAXY_NODES 的 `pirateLair` 标记（当前 5 个）', String(lairIds.length));
    check(J(R.LAIR_BOSS_IDS_FROM_NODES) === J(lairIds), 'LAIR_BOSS_IDS_FROM_NODES 逐项 = 星图标记（不是硬编码的 b1..b5）', J(R.LAIR_BOSS_IDS_FROM_NODES));
    const raidSrc = fs.readFileSync(path.resolve(__dirname, '../src/lib/battle/raid.ts'), 'utf8');
    check(/GALAXY_NODES[\s\S]{0,120}pirateLair/.test(raidSrc), '名字判据确实读 GALAXY_NODES 的 pirateLair（源码级核对）');
    const fresh = setup({});
    check(R.raidEnemyName(fresh) === PIRATE_BOSSES.raid.name && R.RAID_ENEMY_NAME === PIRATE_BOSSES.raid.name,
      '未打光老巢 → 名字 = 数据里的静态名「海盗旗舰（掠夺队）」（不另抄一份字面量）', R.raidEnemyName(fresh));
    const four = { ...fresh, defeatedLairs: lairIds.slice(0, 4) };
    check(R.allLairsDefeated(four) === false && R.raidEnemyName(four) === PIRATE_BOSSES.raid.name, '只打败 4/5 → 判定 false、名字**不变**', R.raidEnemyName(four));
    const allDead = { ...fresh, defeatedLairs: lairIds.slice() };
    check(R.allLairsDefeated(allDead) === true, '5 个老巢全被打败 → allLairsDefeated = true');
    check(R.raidEnemyName(allDead) === '海盗残兵' && R.RAID_REMNANT_NAME === '海盗残兵', '5 个老巢全被打败 → 名字 = 「海盗残兵」', R.raidEnemyName(allDead));
    // 「永远存在」：账本与触发无关（四个条件里没有一条与老巢进度有关）
    check(R.shouldStartRaid(0, allDead) === true, '**老巢全打光后掠夺照常触发**（永远存在，没有"还有没打败的老巢"这道门槛）');
    check(R.shouldStartRaid(0, { ...fresh, defeatedLairs: lairIds.slice(0, 2) }) === true, '只打掉部分老巢 → 同样照常触发');
    check(R.shouldStartRaid(0, { ...fresh, defeatedLairs: [] }) === true, '一个老巢都没打 → 同样照常触发');

    // ---- ③ 账本写入点：END_BATTLE 出征战胜利（既有胜负判定），且幂等 ----
    //  舰队用 **FLEET_STARTER**（26 艘的既定编制）：同 seed 行为对拍用的就是它，
    //  胜率与 PARITY 一致（b2 约 1/4 的 seed 玩家赢）→ 循环若干 seed 必能构造出一场胜利。
    //  ⚠ 不要用 FLEET_ALL（每种一张，曲线零散，实测 12 个 seed 全败）——它不适合做"必胜"构造。
    const DECK = fleetsMod.FLEET_STARTER.slice();
    const winFight = (bossId) => {
      for (let seed = 1; seed <= 200; seed++) {
        let s = setup({ lib: DECK, fleets: [DECK] });
        s = D(s, { type: 'START_BATTLE', bossId, fleet: s.fleets[0].shipIds.slice(), kind: 'expedition', seed });
        s = fightTo(s);
        if (s.battle && s.battle.over && s.battle.winner === 'player') return s;
      }
      return null;
    };
    const won = winFight('b2');
    check(!!won, '构造出一场玩家获胜的老巢战（b2 + 26 艘新手编制，200 个 seed 内）');
    if (won) {
      const after = D(won, { type: 'END_BATTLE' });
      check(J(after.defeatedLairs) === J(['b2']), '老巢战胜利 → 账本记下这一场的老巢（唯一写入点 = END_BATTLE）', J(after.defeatedLairs));
      check(D(after, { type: 'END_BATTLE' }) === after, '重复 END_BATTLE（已无战斗）→ 原样返回（不会重复记账）');
      // 同一个老巢再赢一次 → 账本里仍只有一项
      const wonAgain = winFight('b2');
      if (wonAgain) {
        const again = D({ ...wonAgain, defeatedLairs: after.defeatedLairs.slice() }, { type: 'END_BATTLE' });
        check(J(again.defeatedLairs) === J(['b2']), '同一老巢打赢两次 → 账本**只有一项**（幂等）', J(again.defeatedLairs));
      } else {
        check(false, '第二次老巢战没能构造出胜利（200 个 seed 都不赢，异常）');
      }
      // 打输 → 一项都不记（判据与发奖同一次：battleRewards 对打输恒 0/0）
      const lost = D({ ...won, battle: { ...won.battle, winner: 'boss' } }, { type: 'END_BATTLE' });
      check(J(lost.defeatedLairs) === J([]), '老巢战**打输** → 账本一项都不记', J(lost.defeatedLairs));
    }
    // 掠夺战（bossId='raid'）不走这条路：账本一项都不记（与上面是否构造出胜利无关）
    {
      let raidSt = setup({ lib: DECK, fleets: [DECK], defending: [0] });
      raidSt = D(raidSt, { type: 'START_BATTLE', bossId: 'raid', fleet: raidSt.fleets[0].shipIds.slice(), kind: 'defense', seed: 7 });
      raidSt = fightTo(raidSt);
      check(!!raidSt.battle && raidSt.battle.over, '掠夺战能打完（用于验证它不动账本）');
      check(J(D(raidSt, { type: 'END_BATTLE' }).defeatedLairs) === J([]), '掠夺战结束 → 账本不受影响（掠夺队不是老巢）');
    }
    // 纯函数层：幂等按**引用**表达（重复写入返回同一个数组）
    const ledger = ['b1'];
    check(R.recordDefeatedLair(ledger, 'b1') === ledger, 'recordDefeatedLair 重复写入同一老巢 → 原样返回同一个数组（引用相等，幂等）');
    check(R.recordDefeatedLair(ledger, 'raid') === ledger, 'recordDefeatedLair 收到非老巢 id（掠夺队 raid）→ 不记账');
    check(J(R.recordDefeatedLair([], 'b4')) === J(['b4']), 'recordDefeatedLair 首次写入 → 追加一项');
    check(J(R.recordDefeatedLair(['b4'], 'b5')) === J(['b4', 'b5']), 'recordDefeatedLair 顺序 = 首次打败顺序');

    // ---- ④ 旧档（v5）读入：账本兜底为空 ＋ 掠夺照常可触发 ----
    const v5raw = buildSaveData(setup({}));
    delete v5raw.defeatedLairs;        // v5 档里根本没有这个字段
    v5raw.saveVersion = 5;
    const v5 = migrateSave(stateFromSave(JSON.parse(JSON.stringify(v5raw))));
    check(J(v5.defeatedLairs) === J([]), 'v5 旧档读入 → defeatedLairs = 空数组（= 一个都没打败）', J(v5.defeatedLairs));
    check(R.raidEnemyName(v5) === PIRATE_BOSSES.raid.name, 'v5 旧档 → 掠夺队仍叫「海盗旗舰（掠夺队）」（不因缺账本而变名）');
    check(R.shouldStartRaid(0, v5) === true, '**v5 旧档 → 掠夺照常可触发**（账本缺失不影响触发）');

    // ---- ⑤ 大厅与战场读**同一份**名字 ----
    const cardA = R.raidCardView({ ...allDead, raid: raidState({ inTurns: 3, raiders: 1 }) });
    const cardB = R.raidCardView({ ...allDead, raid: raidState({ arrivedTurns: 4, arrived: true, raiders: 1 }) });
    check(cardA.enemyName === '海盗残兵' && cardB.enemyName === '海盗残兵', '大厅掠夺卡片：阶段 A / B 的 enemyName 都是同一个名字', J([cardA.enemyName, cardB.enemyName]));
    check(cardA.headline.indexOf('海盗残兵') === 0 && cardB.headline.indexOf('海盗残兵') === 0, '卡片标题行用的就是这个名字（阶段 A / B）', J([cardA.headline, cardB.headline]));
    check(cardA.enemyName === R.raidEnemyName(allDead) && cardA.enemyName === cardB.enemyName, '卡片名字 = raidEnemyName(state)（同一份，不重算）');
    const hintLines = R.raidHintLines({ ...allDead, raid: raidState({ arrivedTurns: 4, arrived: true, raiders: 1 }) });
    check(hintLines[0].text.indexOf('海盗残兵') === 0, '「下一回合预告」也用同一个名字', hintLines[0].text);
    // 战斗界面：BattleTab 下发 raidCard.enemyName → BattleScreen → BossPanel 只渲染
    const readSrc = (rel) => fs.readFileSync(path.resolve(__dirname, '..', rel), 'utf8');
    check(/board\.bossId === 'raid' \? raidCard\.enemyName : ''/.test(readSrc('src/components/battle/BattleTab.tsx')),
      'BattleTab：掠夺战把 `raidCard.enemyName` 下发给 BattleScreen（出征战给空串回落静态名）');
    check(/nameOverride=\{enemyName\}/.test(readSrc('src/components/battle/BattleScreen.tsx')),
      'BattleScreen：把下发的名字交给 BossPanel（不在这里推导规则）');
    check(/nameOverride \|\| boss\.name/.test(readSrc('src/components/battle/BossPanel.tsx')),
      'BossPanel：只渲染下发的名字，没有名字时才用数据里的静态 BOSS 名');
    const hits = scanLiteralInSrc('海盗残兵');
    check(hits.length === 1 && hits[0] === 'lib/battle/raid.ts', '「海盗残兵」这个字面量全库（去注释后）**只有一处** = lib/battle/raid.ts', J(hits));
  }

  // ---------- ⑪ 用户 2026-08 裁定：原料 5→40 / 声望只给已探明势力 / **掠夺结算的显示出口 = 事件记录** ----------
  //  用户原话：「把奖励显著地显示出来，原料改成随机 40 个原料。还有，声望只能给已探明的势力。」
  //  追加原话：「失败也要显示丢了啥。」→ 再追加「是不是就相当于事件记录了，那干脆不要再战斗页签
  //  加东西了，直接放事件记录好了哇，打赢也一样。」
  //  **最终口径（本脚本按它断言）**：掠夺的"拿到了什么 / 被抢了什么"**只在事件记录里显示** ——
  //    · 打赢 → `event: '掠夺战果'`，`detail` = 奖励路径原话（四类各自写明类型 + 数量）；
  //    · 打输 / 阶段 B 超时被抢 → `event: '殖民地被掠夺'`，`detail` 逐项列出**实际扣到**的资源与数量
  //      （扣 0 的项不列；什么都没扣到就给一句完整的话）；扣减与 detail 同源（同一份 raidLootLoss）。
  //  战斗页签与战斗结算画面**都不放**结算行；曾经的 `lastRaidSettlement` 快照字段与它的三个展示字段
  //  已整个删除（仓库硬规矩：不留死字段），旧档里残留的同名键**被忽略**且 `SAVE_VERSION` 保持 8。
  //  另：原料数量 = 40；声望**只**从 `getKnownFactionIds(ship)` 里挑，0 已探明时回退金币（不发空奖励）。
  console.log('\n[11] 用户 2026-08 裁定（显示出口 = 事件记录 / 原料 40 / 声望只给已探明势力）');
  {
    const { buildSaveData, stateFromSave, migrateSave, SAVE_VERSION } = await import('@/lib/save');
    const RW = await import('@/lib/battle/rewards');
    const { rollRaidReward, canGrantReputationReward, RAID_REWARD_GOLD, RAID_REWARD_MATERIAL_AMOUNT, RAID_GOLD_TEXT, RAID_LOOT_EVENT } = RW;

    // ---- ③ 声望只给已探明势力（复用既有唯一真值 getKnownFactionIds，不许自己写过滤） ----
    const { getKnownFactionIds } = await import('@/lib/galaxy/knowledge');
    const { FACTIONS } = await import('@/data/factions');
    const { getMaterialName } = await import('@/data/materialNames');
    const ALL_FACTION_IDS = FACTIONS.map((f) => f.id);
    const knownIds = ALL_FACTION_IDS.slice(0, 3);
    /** 把母舰的已探明势力设成指定集合（探明判据 = ship.galaxy.visitedNodes 里的势力节点） */
    const withKnown = (st, ids) => ({
      ...st,
      ships: st.ships.map((s, i) => i === 0
        ? { ...s, galaxy: { ...s.galaxy, visitedNodes: ids.slice() } }
        : s),
    });
    const knownState = withKnown(setup({}), knownIds);
    const knownShip = knownState.ships[0];
    check(J([...getKnownFactionIds(knownShip)]) === J(knownIds), '已探明势力 = getKnownFactionIds（唯一真值）', J([...getKnownFactionIds(knownShip)]));

    // 多次掷骰：声望档（kindRoll=0.8）**只出现已探明势力**
    const seenFactions = new Set();
    let notKnown = 0;
    let notRep = 0;
    for (let i = 0; i < 200; i++) {
      const r = rollRaidReward(knownShip, 0.8, i / 200);
      if (r.kind !== 'reputation') { notRep++; continue; }
      seenFactions.add(r.factionId);
      if (!knownIds.includes(r.factionId)) notKnown++;
    }
    check(notRep === 0, 'kindRoll=0.8 → 200 次全是声望类（四类边界未动）', String(notRep));
    check(notKnown === 0, '**未探明势力绝不出现在声望奖励里**（200 次掷骰，0 次越界）', String(notKnown));
    check(seenFactions.size === knownIds.length, '声望候选覆盖全部已探明势力（3 个都出现过）', J([...seenFactions]));
    check([...seenFactions].every((f) => knownIds.includes(f)), '出现过的势力 id 全部 ∈ 已探明集合', J([...seenFactions]));
    // 未探明势力在**没有任何一个**已探明势力时也不会漏出来
    const unknownOnly = withKnown(setup({}), []);
    check(canGrantReputationReward(unknownOnly.ships[0]) === false, '0 个已探明势力 → canGrantReputationReward = false');
    check(canGrantReputationReward(knownShip) === true, '有已探明势力 → canGrantReputationReward = true');
    // 声望文案里的势力名保持不变（「与「XX」的声望 +5」），且名字取自 FACTIONS 静态表
    const rep = rollRaidReward(knownShip, 0.8, 0.5);
    check(rep.kind === 'reputation' && rep.reputation === 5, '声望奖励数值仍是 +5（未改锚点）', J(rep));
    check(
      rep.text === `击退海盗：与「${FACTIONS.find((f) => f.id === rep.factionId).name}」的声望 +5`,
      '**声望文案里的势力名保持不变**（「与「<势力名>」的声望 +5」，名字走 FACTIONS 表）',
      rep.text
    );

    // **0 个已探明 → 不许发空奖励**：回退到金币（kind/gold/text 三处都是金币那条）
    const fallback = rollRaidReward(unknownOnly.ships[0], 0.8, 0.5);
    check(fallback.kind === 'gold', '**0 个已探明势力时不发声望**：kind 回退成 gold', fallback.kind);
    check(fallback.gold === RAID_REWARD_GOLD && fallback.stardust === 0, '0 个已探明势力时回退到**金币**（有实体收益）', J({ gold: fallback.gold, stardust: fallback.stardust }));
    check(fallback.factionId === null && fallback.reputation === 0, '0 个已探明势力时**不带任何势力 id / 声望**', J({ factionId: fallback.factionId, reputation: fallback.reputation }));
    check(fallback.text === RAID_GOLD_TEXT && fallback.text.length > 0, '0 个已探明势力时文案 = 金币那条（**不是空串**）', J(fallback.text));
    // 走完整发奖路径：真的把金币发出去，声望一点没动
    const fallbackShip = unknownOnly.ships[0];
    const goldBefore = fallbackShip.gold;
    const granted = (await import('@/lib/battle/rewards')).grantRaidReward(fallbackShip, fallback, 1);
    check(granted.gold === goldBefore + RAID_REWARD_GOLD, '0 已探明时的回退奖励**真的到账**（金币 +20000）', `${goldBefore} → ${granted.gold}`);
    // 四类边界没动（等概率仍是 0.25 一档）
    check(rollRaidReward(knownShip, 0.24, 0).kind === 'gold' && rollRaidReward(knownShip, 0.25, 0).kind === 'stardust'
      && rollRaidReward(knownShip, 0.5, 0).kind === 'material' && rollRaidReward(knownShip, 0.75, 0).kind === 'reputation',
      '四类等概率的边界不变（0.25 / 0.5 / 0.75）');

    // ---- ② 原料 5 → 40（用户裁定） ----
    check(RAID_REWARD_MATERIAL_AMOUNT === 40, '**掠夺胜利的原料奖励 = 40 个**（用户 2026-08 裁定，覆盖原占位 5）', String(RAID_REWARD_MATERIAL_AMOUNT));
    const mat = rollRaidReward(knownShip, 0.6, 0.42);
    check(mat.kind === 'material' && mat.materialAmount === 40, '原料类奖励数量 = 40', J({ kind: mat.kind, amount: mat.materialAmount }));
    check(mat.text.indexOf('×40') >= 0 && mat.text.indexOf('×5') < 0, '**原料文案里的数量跟着变**（拼出来的「… ×40」，不再是 ×5）', mat.text);
    check(/^击退海盗：缴获 .+ ×40$/.test(mat.text), '原料文案形状不变（击退海盗：缴获 <原料名> ×40）', mat.text);
    const matSrc = fs.readFileSync(path.resolve(__dirname, '../src/lib/battle/rewards.ts'), 'utf8');
    check(/RAID_REWARD_MATERIAL_AMOUNT\s*=\s*40/.test(matSrc), '源码级核对：RAID_REWARD_MATERIAL_AMOUNT = 40 写在 rewards.ts（唯一一处可改）');

    // ---- ① 奖励显著显示：快照字段的写入 / 清空时机 ----
    // 用真实 reducer 走到"掠夺战打赢收尾"这一帧：先把战斗打到 over（双方 AI 全自动，与 [10] 的 fightTo 同型），
    // 再把 winner 改成 'player' —— 本用例只关心 END_BATTLE 的写回，胜负由战斗末态决定。
    const FLEETS10 = fleetsMod.FLEET_STARTER.slice(0, 10);
    const mkRaidAtOver = (o) => {
      let s = setup({ fleets: [FLEETS10.slice()], defending: [0] });
      s = D(s, { type: 'START_RAID', raiders: (o && o.raiders) || 1 });
      for (let k = 0; k < R.RAID_WARNING_TURNS; k++) s = D(s, { type: 'TICK_BATTLE_STATE' });
      s = D(s, { type: 'ARRIVE_RAID' });
      s = D(s, { type: 'START_RAID_BATTLE' });
      return fightTo(s);
    };
    const raidOver = mkRaidAtOver({});
    check(!!raidOver.battle && raidOver.battle.over, '构造出掠夺战的终局帧（双方 AI 全自动打完）', J({ over: raidOver.battle && raidOver.battle.over, winner: raidOver.battle && raidOver.battle.winner }));
    const winRaid = { ...raidOver, battle: { ...raidOver.battle, winner: 'player', over: true } };
    check(!('lastRaidSettlement' in winRaid), '开打前状态里就没有掠夺结算字段（已删）', J(Object.keys(winRaid).filter((k) => /Raid/i.test(k))));

    // 打赢最后一支 → 写入；文案 = 事件日志那条奖励路径的原话
    const rewardByKind = {
      gold: rollRaidReward(winRaid.ships[0], 0.1, 0.5),
      stardust: rollRaidReward(winRaid.ships[0], 0.3, 0.5),
      material: rollRaidReward(winRaid.ships[0], 0.6, 0.5),
      reputation: rollRaidReward(winRaid.ships[0], 0.8, 0.5),
    };
    const raised = (await import('@/lib/battle/rewards')).grantRaidReward(winRaid.ships[0], rewardByKind.material, 1);
    const afterWin = D({ ...winRaid, ships: [raised, ...winRaid.ships.slice(1)] }, { type: 'END_BATTLE' });
    check(afterWin.battle === null && afterWin.raid.immuneTurns === R.RAID_IMMUNE_TURNS, '打赢最后一支 → 战斗收起 + 进入免疫期', J(afterWin.raid));
    // ⚠ `END_BATTLE` 里的奖励由 reducer 取 `Math.random()` 掷、脚本**无法指定类别** → 这里只断言
    //   "detail 就是奖励路径产出的那一句（四类之一）"；四类各自的**逐字基准**由下面确定性的四类样例钉死。
    const winTexts = [rewardByKind.gold.text, rewardByKind.stardust.text, rewardByKind.material.text, rewardByKind.reputation.text];
    check(winTexts.includes(afterWin.eventLog[0].detail),
      '**打赢：事件记录 detail = 四类之一的奖励原话（含类型与数量）**', afterWin.eventLog[0].detail);
    check(afterWin.eventLog[0].detail.startsWith('击退海盗：'),
      '打赢那条 detail 以「击退海盗：」开头（前缀来源唯一 = rewards.ts 的文案）', afterWin.eventLog[0].detail);
    check(!('lastRaidSettlement' in afterWin), '打赢后状态里不再有 lastRaidSettlement 字段');
    // ---- 事件日志的**去重前缀**（用户 2026-08：那行日志是玩家读到的奖励凭证，必须干净）----
    //  渲染口径：EventPanel 是 `第N回合 <event> <detail>` 三个 span 并排 —— 早先 event='击退海盗'
    //  而 detail（reward.text）自带「击退海盗：」→ 玩家读到「击退海盗：击退海盗：缴获 10 星尘」。
    //  修法：**event 改中性词「掠夺战果」**、detail 保留 reward.text 原句。
    const logEventText = (e) => (e.event || '') + '：' + (e.detail || '');
    check(afterWin.eventLog[0].event === '掠夺战果', '**事件日志的 event 是中性词「掠夺战果」**（不再与 detail 重复前缀）', afterWin.eventLog[0].event);
    check(afterWin.eventLog[0].detail.length > 6,
      '**detail = reward.text 原句**（唯一文案产出口，非空）', afterWin.eventLog[0].detail);
    check(!afterWin.eventLog[0].detail.startsWith(afterWin.eventLog[0].event + '：'),
      "**detail 不以 `event + '：'` 开头**（= 拼起来不含重复前缀）", J(logEventText(afterWin.eventLog[0])));
    check(!logEventText(afterWin.eventLog[0]).includes('击退海盗：击退海盗'),
      '**日志条目拼起来不含重复的「击退海盗：」**', logEventText(afterWin.eventLog[0]));
    check((afterWin.eventLog[0].event.match(/击退海盗/g) || []).length === 0,
      'event 里不再出现「击退海盗」（前缀只由 detail 带一次）', afterWin.eventLog[0].event);
    // 四类奖励**逐字**钉死（这就是"改前一致"的基准：谁顺手动了唯一产出口，这里立刻红）
    check(rewardByKind.gold.text === '击退海盗：缴获 20000 金币', '金币奖励文案逐字不变（击退海盗：缴获 20000 金币）', rewardByKind.gold.text);
    check(rewardByKind.stardust.text === '击退海盗：缴获 10 星尘', '星尘奖励文案逐字不变（击退海盗：缴获 10 星尘）', rewardByKind.stardust.text);
    check(rewardByKind.material.text === '击退海盗：缴获 ' + getMaterialName(rewardByKind.material.materialId) + ' ×40',
      '原料奖励文案逐字不变（击退海盗：缴获 <原料名> ×40）', rewardByKind.material.text);
    check(rewardByKind.reputation.text === '击退海盗：与「' + (FACTIONS.find((f) => f.id === rewardByKind.reputation.factionId) || {}).name + '」的声望 +5',
      '声望奖励文案逐字不变（击退海盗：与「<势力名>」的声望 +5）', rewardByKind.reputation.text);
    check(['gold', 'stardust', 'material', 'reputation'].every((k) => rewardByKind[k].text.startsWith('击退海盗：')),
      '四类奖励文案都以「击退海盗：」开头（前缀来源唯一 = rewards.ts 的文案，不由日志补）');
    check(scanLiteralInSrc("event: '击退海盗'").length === 0, '源码里不再有 event 写成「击退海盗」的旧写法（整条消失）', J(scanLiteralInSrc("event: '击退海盗'")));
    check(!/event: *'掠夺战果'[\s\S]{0,40}detail: *'掠夺/.test(readSrc('src/hooks/gameReducer.ts')), '掠夺日志的 event 与 detail 不会同文（源码级）');
    check(/event: '掠夺战果', detail: reward\.text/.test(readSrc('src/hooks/gameReducer.ts')), '日志写入点用的是中性 event + reward.text（源码级）');    // 战斗页签 / 结算徽章渲染的就是 reward.text **原句**（自己不许再加前缀）
    const tabCode0 = codeOf('src/components/battle/BattleTab.tsx');
    const screenCode0 = codeOf('src/components/battle/BattleScreen.tsx');
    check(!/击退海盗/.test(tabCode0) && !/击退海盗/.test(screenCode0),
      '两个 UI 出口都不自己写「击退海盗」前缀（只渲染 reward.text）', J({ tab: /击退海盗/.test(tabCode0), screen: /击退海盗/.test(screenCode0) }));
    // ⚠ **显示出口 = 事件记录**（用户 2026-08 最终口径：「是不是就相当于事件记录了，那干脆不要再战斗
    //   页签加东西了，直接放事件记录好了哇，打赢也一样。」）→ 战斗页签与战斗结算画面**都不放**结算行；
    //   下面全部改成断言**事件记录**里那两条：打赢写「掠夺战果」、打输/被抢写「殖民地被掠夺」。
    //   原先的 `lastRaidSettlement` 快照字段与它的三个展示字段（settlementOutcome / rewardAwardText /
    //   settlementLoot）**已整个删除**（仓库硬规矩：不留死字段）。
    const { raidLootItems } = RW;
    const { raidLootLoss } = R;
    /** 事件记录一行的渲染口径（EventPanel：`第N回合 <event> <detail>`） */
    const logLine = (e) => (e.event || '') + '｜' + (e.detail || '');
    /** 造"资源被抢之前"的状态：给足资源，保证扣得到东西 */
    const richRaid = (st) => ({
      ...st,
      ships: st.ships.map((s, i) => i === 0
        ? { ...s, gold: 100000, stardust: 50, materials: { silicon: 300, quantum: 90, gold_ore: 120 } }
        : s),
    });
    // ① 战斗页签 / 结算画面**都不许再出现**掠夺结算行（静态核对，去注释）
    check(!/rewardText|rewardAwardText|settlementOutcome|settlementLoot|lastRaidSettlement/.test(tabCode0),
      '**战斗页签不再渲染掠夺结算行**（相关字段/属性一个都不出现）', 'BattleTab.tsx');
    check(!/campaignText|settlement\.outcome|lastRaidSettlement/.test(screenCode0),
      '**战斗结算画面不再渲染掠夺奖励/被抢那条**', 'BattleScreen.tsx');
    check(!/上次掠夺战果/.test(tabCode0), '页签里那句「上次掠夺战果：…」已删除', 'BattleTab.tsx');

    // ---- 路径 1：打赢（事件记录必须写出"类型 + 数量"） ----
    check(afterWin.eventLog[0].event === '掠夺战果', '打赢：事件记录 event = 「掠夺战果」', afterWin.eventLog[0].event);
    check(winTexts.includes(afterWin.eventLog[0].detail),
      '**打赢：事件记录 detail = 奖励路径原话（四类之一，含类型与数量）**', afterWin.eventLog[0].detail);
    check(!('lastRaidSettlement' in afterWin), '**打赢后状态里不再有 lastRaidSettlement 字段**（死字段已删）');

    // 2 支掠夺队：第 1 场赢下时**立刻接第 2 场**（事件记录里此时**不该**有奖励那条）
    const twoStarted = D(mkRaidAtOver({ raiders: 2 }), { type: 'FUNCTIONAL_UPDATE', updater: (s) => s });
    const firstWin = { ...twoStarted, battle: { ...twoStarted.battle, winner: 'player', over: true } };
    const midState = D({ ...firstWin, raid: { ...firstWin.raid, raiders: 2 } }, { type: 'END_BATTLE' });
    if (midState.battle) {
      check(midState.eventLog.length === firstWin.eventLog.length,
        '**2 支掠夺队：第 1 场打完不写奖励那条**（奖励只在最后一支打完才发）', String(midState.eventLog.length));
      check(midState.raid.raiders === 1, '第 1 场打完 → 还剩 1 支（连打第二场）', String(midState.raid.raiders));
      check(R.raidCardView(midState).squadsLeft === 1, '正在打的那一帧：raidCardView.squadsLeft = 1（含当前这场）', String(R.raidCardView(midState).squadsLeft));
      check(R.raidCardView(firstWin).squadsLeft === 2, '第 1 场（掠夺队 2 支）→ squadsLeft = 2', String(R.raidCardView(firstWin).squadsLeft));
    } else {
      check(false, '第 1 场赢下后没有接上第二场（2 支掠夺队的连打逻辑异常）');
    }
    // ---- 去重前缀的收尾：打输那条 detail 也不许以 event + '：' 开头 ----
    {
      const forced = { ...richRaid(mkRaidAtOver({})), battle: { ...richRaid(mkRaidAtOver({})).battle, winner: 'boss', over: true } };
      const log = D(forced, { type: 'END_BATTLE' }).eventLog[0];
      check(log.detail.indexOf(log.event + '：') !== 0, '打输那条 detail 不以 `event + 冒号` 开头（无重复前缀）', J(logLine(log)));
      check(logLine(log).indexOf('殖民地被掠夺：') < 0, '打输那条渲染串里没有重复的「殖民地被掠夺：」', logLine(log));
    }
    // ==================== 用户 2026-08 追加口径：**打输/被抢逐项列出实扣，扣 0 的不列** ====================
    //  两条入口都要覆盖：① 防守战打输（END_BATTLE 的 isRaid 分支、winner !== 'player'）
    //                    ② 阶段 B 超时未迎战（APPLY_RAID_LOOT，玩家什么都没做就被抢）
    //  ⚠ 显示出口 = **事件记录**（不是界面行）：下面断言的是 `eventLog[0]` 的 event / detail。

    // ---- ① 防守战打输（END_BATTLE） ----
    {
      const lostBattle = richRaid(mkRaidAtOver({}));
      const forced = { ...lostBattle, battle: { ...lostBattle.battle, winner: 'boss', over: true } };
      const expectLoss = raidLootLoss(forced);                          // 扣减用的那一份（同源）
      const before = forced.ships[0];
      const after = D(forced, { type: 'END_BATTLE' });
      const now = after.ships[0];
      const log = after.eventLog[0];
      check(log.event === RAID_LOOT_EVENT, '**防守战打输 → 事件记录 event = 「殖民地被掠夺」**', log.event);
      check(now.gold === before.gold - expectLoss.gold, '实际扣的金币 = 扣减那一份', `${before.gold} → ${now.gold}（应扣 ${expectLoss.gold}）`);
      const matOk = Object.entries(expectLoss.materials).every(([id, n]) => (now.materials[id] || 0) === (before.materials[id] || 0) - n);
      check(matOk, '实际扣的原料 = 扣减那一份', J({ before: before.materials, after: now.materials, expect: expectLoss.materials }));
      // 逐项：实扣 > 0 的每一项都要在 detail 里出现，且带真实数量（扣 0 的不列）
      const items = raidLootItems({ gold: expectLoss.gold, stardust: expectLoss.stardust, materials: expectLoss.materials }, '');
      check(items.length > 0, '打输后至少列出一样实际扣到的东西', J(items));
      check(items.every((piece) => log.detail.indexOf(piece) >= 0),
        '**打输：事件记录逐项含实扣值（金币 20000 / 硅片 100 …）**', J({ detail: log.detail, items }));
      check(!/星尘/.test(log.detail), '**扣 0 的项不列**（这场没动星尘 → detail 里不出现「星尘」）', log.detail);
      check(!('lastRaidSettlement' in after), '打输后状态里也没有那个死字段');
    }

    // ---- ② 阶段 B 超时未迎战（APPLY_RAID_LOOT：玩家什么都没做就被抢） ----
    {
      const st = richRaid(setup({ fleets: [FLEETS10.slice()], defending: [0] }));
      const arrived = D(D(D(st, { type: 'START_RAID', raiders: 1 }), { type: 'TICK_BATTLE_STATE' }), { type: 'ARRIVE_RAID' });
      const expectLoss = raidLootLoss(arrived);
      const before = arrived.ships[0];
      const after = D(arrived, { type: 'APPLY_RAID_LOOT' });
      const now = after.ships[0];
      const log = after.eventLog[0];
      check(log.event === RAID_LOOT_EVENT,
        '**阶段 B 超时被抢 → 事件记录里也有那条（event = 殖民地被掠夺）**——玩家什么都没做也看得见', log.event);
      check(now.gold === before.gold - expectLoss.gold, '超时被抢：实扣金币 = 扣减那一份', `${before.gold} → ${now.gold}`);
      const items = raidLootItems({ gold: expectLoss.gold, stardust: expectLoss.stardust, materials: expectLoss.materials }, '');
      check(items.length > 0 && items.every((piece) => log.detail.indexOf(piece) >= 0),
        '**超时被抢：事件记录逐项含实扣值**', J({ detail: log.detail, items }));
      check(R.raidPhase(after.raid) === 'idle', '被抢后掠夺状态回到 idle（掠夺队消失）', R.raidPhase(after.raid));
      check(after.eventLog[0] === log, '事件记录那条就是唯一出口（状态里不再有别的结算字段）');
    }

    // ---- 逐项串本身：扣 0 不列 + 什么都没扣到时给一句完整的话 ----
    {
      check(J(raidLootItems({ gold: 1234, stardust: 0, materials: { silicon: 0 } }, '')) === J(['金币 1234']),
        '**扣 0 的项不列**（只有金币时串里不出现硅片）', J(raidLootItems({ gold: 1234, stardust: 0, materials: { silicon: 0 } }, '')));
      check(J(raidLootItems({ gold: 100, stardust: 0, materials: { quantum: 30, silicon: 0, gold_ore: 0 } }, ''))
        === J(['金币 100', '量子簇 30']), '多项时按"金币 → 星尘 → 原料"列，且只列实扣 > 0 的',
        J(raidLootItems({ gold: 100, stardust: 0, materials: { quantum: 30, silicon: 0, gold_ore: 0 } }, '')));
      check(J(raidLootItems({ gold: 0, stardust: 0, materials: {} }, '')) === J([]),
        '全 0 时逐项串为空数组（调用方据此给"没什么可抢"那句）');
      // 真跑一场"没东西可抢"的：detail 必须是一句完整的话（不是半句）
      const poorSt = (() => {
        let s = D(setup({ fleets: [FLEETS10.slice()], defending: [0] }), { type: 'START_RAID', raiders: 1 });
        for (let k = 0; k < 5; k++) s = D(s, { type: 'TICK_BATTLE_STATE' });
        s = D(s, { type: 'ARRIVE_RAID' });
        return { ...s, ships: s.ships.map((x, i) => i === 0 ? { ...x, gold: 0, stardust: 0, materials: {} } : x) };
      })();
      const poorLog = D(poorSt, { type: 'APPLY_RAID_LOOT' }).eventLog[0];
      check(poorLog.event === RAID_LOOT_EVENT && poorLog.detail.indexOf('没什么可抢') >= 0 && poorLog.detail.indexOf('损失 ') < 0,
        '**什么都没扣到时给一句完整的话**（不是"损失 "这样的半句）', J(logLine(poorLog)));
    }

    // ---- 打老巢：掠夺卡片与事件记录都不受影响（不在掠夺战里） ----
    {
      const lairOnly = setup({});
      check(R.raidCardView(lairOnly).outcomeText === '' && R.raidCardView(lairOnly).squadsLeft === 0,
        '打老巢：卡片不给掠夺战果旁注', J([R.raidCardView(lairOnly).outcomeText, R.raidCardView(lairOnly).squadsLeft]));
      check(!('lastRaidSettlement' in lairOnly), '打老巢：状态里也没有那个死字段');
    }


    // 战果旁注（结算画面那行）：只在与掠夺队的战斗里非空
    const inRaidCard = R.raidCardView({ ...firstWin, battle: { ...firstWin.battle, over: true, winner: 'player' } });
    check(inRaidCard.outcomeText.indexOf('掠夺队') >= 0, '**中途那行"还有 N 支掠夺队"**（赢下第 1 场、还剩 1 支时给出）', J(inRaidCard.outcomeText));
    const lostCard = R.raidCardView({ ...firstWin, battle: { ...firstWin.battle, over: true, winner: 'boss' } });
    check(lostCard.outcomeText.indexOf('没顶住') >= 0, '打输那一帧给出"会被抢走一部分"的战果说明', J(lostCard.outcomeText));
    const lairBattleSt = { ...setup({}), battle: E.createBattle({ seed: 5, bossId: 'b1' }) };
    check(R.raidCardView(lairBattleSt).outcomeText === '' && R.raidCardView(lairBattleSt).squadsLeft === 0,
      '**打老巢时战果旁注恒为空**（结算画面与从前逐字一样）', J([R.raidCardView(lairBattleSt).outcomeText, R.raidCardView(lairBattleSt).squadsLeft]));

    const need2 = ['rollRaidReward', 'grantRaidReward', 'RAID_LOOT_EVENT', 'raidLootItems', 'canGrantReputationReward', 'RAID_REWARD_MATERIAL_AMOUNT', 'RAID_GOLD_TEXT'];
    const missing2 = need2.filter((k) => RW[k] === undefined);
    check(missing2.length === 0, 'rewards.ts 的掠夺半部分导出齐全（删掉的不会再被引用）', J({ missing: missing2 }));
    // 删掉的导出**必须彻底消失**（仓库硬规矩：不留死字段/死导出）
    const removedExports = ['raidRewardView', 'raidLootView', 'raidSettlementLostText', 'raidLootDetailEmpty', 'RAID_NO_LOOT_TEXT', 'RAID_LOOT_PREFIX', 'EMPTY_RAID_LOOT_DETAIL'];
    const stillThere = removedExports.filter((k) => RW[k] !== undefined);
    check(stillThere.length === 0, '**已删除的导出一个不剩**（raidRewardView / raidLootView / raidSettlementLostText / raidLootDetailEmpty / RAID_NO_LOOT_TEXT / RAID_LOOT_PREFIX / EMPTY_RAID_LOOT_DETAIL）', J(stillThere));

    // ---- 存档：SAVE_VERSION 保持 8；掠夺结算不再有独立字段；旧档照常读 ----
    check(SAVE_VERSION === 8, '**SAVE_VERSION 保持 8 不动**（本次只是少读一个字段）', String(SAVE_VERSION));
    const save = buildSaveData(afterWin);
    check(save.saveVersion === 8 && !('lastRaidSettlement' in save) && !('lastRaidReward' in save),
      'buildSaveData 不再写掠夺结算字段（存档清单干净）', J(Object.keys(save).filter((k) => /Raid/i.test(k))));
    const roundTrip = migrateSave(stateFromSave(JSON.parse(JSON.stringify(save))));
    check(roundTrip.eventLog.length === afterWin.eventLog.length && roundTrip.eventLog[0].detail === afterWin.eventLog[0].detail,
      '**往返后事件记录那条原样读入**（显示出口本身就在存档里）', roundTrip.eventLog[0].detail);
    // v8/v7/v6 旧档里若残留同名键 → 直接忽略，读档不崩、eventLog 照常
    const legacyCases = [
      [8, { lastRaidSettlement: { outcome: 'lost', text: '旧 v8 残留', awardText: '', loot: { gold: 1, stardust: 0, materials: {} } } }],
      [7, { lastRaidReward: { text: '旧 v7 残留', kind: 'gold' } }],
      [6, {}],
    ];
    for (const [ver, extra] of legacyCases) {
      const raw = buildSaveData(setup({}));
      raw.saveVersion = ver;
      Object.assign(raw, extra);
      let ok = true, back = null;
      try { back = migrateSave(stateFromSave(JSON.parse(JSON.stringify(raw)))); } catch (e) { ok = false; console.log('    抛错：' + e.message); }
      check(ok && back !== null, `v${ver} 旧档不抛错`, String(ok));
      if (back) {
        check(!('lastRaidSettlement' in back) && !('lastRaidReward' in back),
          `v${ver} 旧档里残留的掠夺结算键被忽略`, J(Object.keys(back).filter((k) => /Raid/i.test(k))));
        check(Array.isArray(back.eventLog), `v${ver} 旧档的 eventLog 照常读入`, J(back.eventLog.length));
      }
    }
    const junk = buildSaveData({ ...setup({}), lastRaidSettlement: { outcome: 'lost' } });
    check(!('lastRaidSettlement' in stateFromSave(JSON.parse(JSON.stringify(junk)))),
      '改档：残留的坏快照同样被忽略（不影响读档）');

    // ---- 源码级：旧口径整条消失；显示出口 = 事件记录；组件不许自己算 ----
    const oldFallbackHits = scanLiteralInSrc('某个势力的声望');
    check(oldFallbackHits.length === 0, '**旧口径"某个势力的声望 +5"整条已删除**（0 已探明不再发声望）', J(oldFallbackHits));
    const rewardSrc = readSrc('src/lib/battle/rewards.ts');
    check(/getKnownFactionIds\(ship\)/.test(rewardSrc), '声望候选**复用唯一真值** getKnownFactionIds(ship)（源码级核对）', 'rewards.ts');
    check(!/visitedNodes/.test(rewardSrc), 'rewards.ts 不自己写迷雾过滤（不许出现 visitedNodes）');
    const reducerCode = codeOf('src/hooks/gameReducer.ts');
    check((reducerCode.match(/settleRaidLoot\(/g) || []).length === 3,
      'settleRaidLoot 定义 1 + 两处失败路调用 2（返回值里不再有 settlement）', String((reducerCode.match(/settleRaidLoot\(/g) || []).length));
    check(/const loss = raidLootLoss\(base\)/.test(reducerCode) && /const loss = raidLootLoss\(state\)/.test(reducerCode),
      '两条失败路各自**只算一次** raidLootLoss（同一份交给扣减与日志）', 'gameReducer.ts');
    check((reducerCode.match(/raidLootLoss\(/g) || []).length === 2,
      'reducer 里 raidLootLoss 恰好 2 次（没有第三处"重算一遍给显示用"）', String((reducerCode.match(/raidLootLoss\(/g) || []).length));
    check(/event: RAID_LOOT_EVENT, detail: `\$\{prefix\}\$\{detail\}`/.test(reducerCode)
      && /event: RAID_LOOT_EVENT, detail \}/.test(reducerCode),
      '两条失败路的日志写入点都用 RAID_LOOT_EVENT + 实扣 detail（源码级）', 'gameReducer.ts');
    // 全库零引用：死字段 / 死字段名 / 死导出（去注释后）
    const deadNames = ['lastRaidSettlement', 'lastRaidReward', 'settlementOutcome', 'rewardAwardText', 'settlementLoot', 'RaidSettlement', 'RaidOutcomeKind', 'campaignText', 'BattleSettlementLine'];
    const srcFiles = ['src/types/game.ts', 'src/lib/save.ts', 'src/lib/battle/rewards.ts', 'src/lib/battle/raid.ts',
      'src/hooks/gameReducer.ts', 'src/components/battle/BattleTab.tsx', 'src/components/battle/BattleScreen.tsx'];
    for (const name of deadNames) {
      const hits = srcFiles.filter((f) => new RegExp('\\b' + name + '\\b').test(codeOf(f)));
      check(hits.length === 0, `**死字段/死导出「${name}」全库零引用**（去注释后）`, J(hits));
    }
    // 显示出口 = 事件记录：两个组件都不许自己拼奖励/损失
    const screenCode = codeOf('src/components/battle/BattleScreen.tsx');
    const tabCode = codeOf('src/components/battle/BattleTab.tsx');
    check(!/rollRaidReward|RAID_REWARD_|grantRaidReward|raidLootLoss|raidLootItems/.test(screenCode),
      '**BattleScreen 不算奖励也不算损失**（显示出口已改为事件记录）', 'BattleScreen.tsx');
    check(!/rollRaidReward|RAID_REWARD_GOLD|RAID_REWARD_STARDUST|RAID_REWARD_MATERIAL_AMOUNT|raidLootLoss|raidLootItems/.test(tabCode),
      '**BattleTab 不持有任何奖励/损失数值或文案**', 'BattleTab.tsx');
    check(!/击退海盗|殖民地被掠夺/.test(tabCode) && !/击退海盗|殖民地被掠夺/.test(screenCode),
      '两个组件都不自己写事件记录那条的文案（前缀/措辞都只来自 lib 与 reducer）',
      J({ tab: /击退海盗|殖民地被掠夺/.test(tabCode), screen: /击退海盗|殖民地被掠夺/.test(screenCode) }));
  }

  console.log('\n=== P7 验收结果 ===');
  if (fails.length === 0) console.log('  全部通过 ✓');
  else { console.log('  ' + fails.length + ' 条失败 ✗'); process.exitCode = 1; }
})().catch((e) => {
  console.error('验收脚本自身出错：', e && e.stack ? e.stack.split('\n').slice(0, 10).join('\n') : e);
  process.exitCode = 2;
});
