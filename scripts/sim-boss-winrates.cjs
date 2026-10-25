'use strict';
/* ============================================================================
   全敌人胜率模拟（11 个：m01~m05 / b1~b5 / raid）—— 只测量，不改任何仓库数据。

   用法：node --import ./scripts/register-ts.mjs scripts/sim-boss-winrates.cjs [每格局数] [seed 起点]
   默认每格 300 局、seed 1000..1000+N-1。换 seed 起点可复核（同一格换一批随机数看是否稳定）。

   怎么打：走真实引擎 —— 建场用 `engine.createBattle`，之后每一手都走真实的
   `gameReducer(BATTLE_ACTION autoTurn)`（与 check-battle-expedition / sim-bounty-bosses 同口径，
   双方 AI 都由引擎自己决策），不写简化战斗。
   ============================================================================ */
const N = Number(process.argv[2] || 300);
const SEED0 = Number(process.argv[3] || 1000);

(async () => {
  const { gameReducer, createInitialGameState } = await import('@/hooks/gameReducer');
  const { createBattle } = await import('@/lib/battle/engine');
  const { createMotherships } = await import('@/data/gameData');
  const { FLEET_STARTER } = await import('@/data/battle/fleets');
  const { PIRATE_BOSSES } = await import('@/data/battle/pirates');

  /** 两套基准编队（2026-10 方案 A 起）：
   *  · starter 26 = 设计口径（FLEET_STARTER，4/4/7/3/5/3）
   *  · 满编 30 = STARTER + i2/c3/i4/i5（4/5/8/4/6/3，保留重复；取代原来那套"按身材 top30"的不科学配法） */
  const FLEETS = [
    { key: 'starter', label: '新手 26 艘', ships: FLEET_STARTER.slice() },
    { key: 'full', label: '满编 30 艘', ships: FLEET_STARTER.concat(['i2', 'c3', 'i4', 'i5']) },
  ];

  /** 11 个敌人：五个雇佣兵头目 + 五个老巢 + 掠夺队（顺序即表内顺序） */
  const ENEMIES = ['m01', 'm02', 'm03', 'm04', 'm05', 'b1', 'b2', 'b3', 'b4', 'b5', 'raid'];

  const playOne = (bossId, fleet, seed) => {
    const base = createInitialGameState();
    const ship = createMotherships()[0];
    const created = createBattle({ seed, bossId });
    let st = {
      ...base,
      phase: 'playing',
      turn: 1,
      ships: [ship],
      battle: { ...created, player: { ...created.player, pool: fleet.slice() } },
    };
    let guard = 0;
    while (st.battle && !st.battle.over && guard < 400) {
      st = gameReducer(st, { type: 'BATTLE_ACTION', action: { type: 'autoTurn' } });
      guard += 1;
    }
    const b = st.battle;
    if (!b) return { win: false, rounds: guard, body: 0, lost: 0 };
    return {
      win: b.winner === 'player',
      rounds: b.round,
      body: Math.max(0, b.player.body),
      lost: b.player.lost.length,
    };
  };

  // ---------------- 跑格子 ----------------
  const cells = new Map();   // `${enemy}:${fleet}` → stats
  const t0 = Date.now();
  let done = 0;
  const total = ENEMIES.length * FLEETS.length;
  for (const id of ENEMIES) {
    for (const fleet of FLEETS) {
      const s = { wins: 0, rounds: 0, body: 0, lost: 0, maxRounds: 0 };
      for (let i = 0; i < N; i += 1) {
        const r = playOne(id, fleet.ships, SEED0 + i);
        if (r.win) s.wins += 1;
        s.rounds += r.rounds;
        s.body += r.body;
        s.lost += r.lost;
        if (r.rounds > s.maxRounds) s.maxRounds = r.rounds;
      }
      s.winRate = (100 * s.wins) / N;
      s.avgRounds = s.rounds / N;
      s.avgBody = s.body / N;
      s.avgLost = s.lost / N;
      cells.set(id + ':' + fleet.key, s);
      done += 1;
    }
    process.stdout.write('\r已完成 ' + done + '/' + total + ' 格');
  }
  process.stdout.write('\n');

  // ---------------- 汇总（每个敌人跨两套编队） ----------------
  const summary = ENEMIES.map((id) => {
    const per = FLEETS.map((f) => cells.get(id + ':' + f.key).winRate);
    const mean = per.reduce((a, b) => a + b, 0) / per.length;
    // 分层均值标准误：Var(mean) = (1/F²)·Σ p(1−p)/n（各编队胜率不同，所以不用 600 局的合并二项）
    const variance = per.reduce((acc, p) => {
      const q = p / 100;
      return acc + (q * (1 - q)) / N;
    }, 0) / (per.length * per.length);
    const ci = 1.96 * Math.sqrt(variance) * 100;
    const rounds = FLEETS.map((f) => cells.get(id + ':' + f.key).avgRounds);
    const body = FLEETS.map((f) => cells.get(id + ':' + f.key).avgBody);
    return {
      id,
      name: (PIRATE_BOSSES[id] && PIRATE_BOSSES[id].name) || id,
      hp: PIRATE_BOSSES[id] ? PIRATE_BOSSES[id].hp : null,
      per,
      mean,
      ci,
      avgRounds: rounds.reduce((a, b) => a + b, 0) / rounds.length,
      avgBody: body.reduce((a, b) => a + b, 0) / body.length,
    };
  });

  // 中文按 2 列宽对齐（padEnd 只数 code point，不数显示宽度）
  const width = (s) => [...String(s)].reduce((n, ch) => n + (ch.codePointAt(0) > 0x2e7f ? 2 : 1), 0);
  const pad = (s, n) => String(s) + ' '.repeat(Math.max(0, n - width(s)));

  console.log('');
  console.log('全敌人胜率模拟：11 个敌人 × 2 套编队 × 每格 ' + N + ' 局（共 ' + total * N + ' 局）');
  console.log('seed = ' + SEED0 + '..' + (SEED0 + N - 1) + '（所有格子同一序列）· 用时 ' + ((Date.now() - t0) / 1000).toFixed(1) + 's');
  console.log('');
  console.log(pad('敌人', 26) + pad('血', 5) + pad('新手26', 9) + pad('满编30', 9)
    + pad('均值', 8) + pad('±95%', 8) + pad('均回合', 8) + '均剩本体');
  console.log('-'.repeat(88));
  for (const r of summary) {
    const label = r.id + ' ' + r.name;
    console.log(
      pad(label, 26) + pad(r.hp == null ? '-' : r.hp, 5)
      + pad(r.per[0].toFixed(1), 9) + pad(r.per[1].toFixed(1), 9)
      + pad(r.mean.toFixed(1), 8) + pad('±' + r.ci.toFixed(1), 8)
      + pad(r.avgRounds.toFixed(1), 8) + r.avgBody.toFixed(1)
    );
  }
  console.log('');

  const sorted = summary.slice().sort((a, b) => a.mean - b.mean);
  console.log('难度排序（两套平均，从难到易）：');
  console.log('  ' + sorted.map((r) => r.id + ' ' + r.mean.toFixed(1) + '%').join('  <  '));
  console.log('');

  // 明细（每敌人 × 每编队）
  console.log('明细：');
  console.log(pad('敌人', 7) + pad('编队', 12) + pad('胜率%', 9) + pad('均回合', 9) + pad('均剩本体', 11) + '均永久损失');
  for (const id of ENEMIES) {
    for (const f of FLEETS) {
      const s = cells.get(id + ':' + f.key);
      console.log(pad(id, 7) + pad(f.label, 12)
        + pad(s.winRate.toFixed(1), 9) + pad(s.avgRounds.toFixed(1), 9)
        + pad(s.avgBody.toFixed(2), 11) + s.avgLost.toFixed(2));
    }
  }
  console.log('');
})().catch((e) => {
  console.error('模拟脚本出错：', e && e.stack ? e.stack.split('\n').slice(0, 8).join('\n') : e);
  process.exitCode = 1;
});

