'use strict';
/* ============================================================================
   敌池容量扫描（纯测量，不改仓库数据）：每格 100 局 × 3 套编队 × 4 头目 × 4 个容量。
   容量 P24 / P18 / P12 / P06 = 每种卡 4 / 3 / 2 / 1 份（池 24 / 18 / 12 / 6 张）。

   用法：node --import ./scripts/register-ts.mjs scripts/sim-pool-sweep.cjs [每格局数]
   做法：建场后用 `battle.boss.pool` **在内存里**换成目标容量的池（不写任何文件、跑完无残留）。
   ============================================================================ */
const N = Number(process.argv[2] || 100);

(async () => {
  const { gameReducer, createInitialGameState } = await import('@/hooks/gameReducer');
  const { createBattle } = await import('@/lib/battle/engine');
  const { createMotherships } = await import('@/data/gameData');
  const { FLEET_STARTER, FLEET_ALL } = await import('@/data/battle/fleets');
  const { BATTLE_CARDS } = await import('@/data/battle/cards');
  const { MERCENARY_POOLS } = await import('@/data/mercenary/pools');

  const scoreOf = (id) => {
    const c = BATTLE_CARDS[id];
    return c ? (c.atk + c.shield + 2 * c.structure) / Math.max(1, c.cost) : 0;
  };
  const pickBest = (n) => [...new Set(FLEET_ALL)].slice().sort((a, b) => scoreOf(b) - scoreOf(a)).slice(0, n);
  const FLEETS = [FLEET_STARTER.slice(), pickBest(26), pickBest(30)];
  const BOSSES = ['m01', 'm02', 'm03', 'm04'];

  /** 把某个头目的池改成"每种卡 copies 份"（保持原池里的卡种与顺序） */
  const poolWithCopies = (bossId, copies) => {
    const base = MERCENARY_POOLS[bossId] || [];
    const ids = [];
    for (const id of base) if (!ids.includes(id)) ids.push(id);
    const out = [];
    for (const id of ids) for (let i = 0; i < copies; i += 1) out.push(id);
    return out;
  };

  const play = (bossId, fleet, seed, copies) => {
    const base = createInitialGameState();
    const ship = createMotherships()[0];
    const created = createBattle({ seed, bossId });
    let st = {
      ...base,
      phase: 'playing',
      turn: 1,
      ships: [ship],
      battle: {
        ...created,
        player: { ...created.player, pool: fleet.slice() },
        boss: { ...created.boss, pool: poolWithCopies(bossId, copies) },
      },
    };
    let guard = 0;
    while (st.battle && !st.battle.over && guard < 400) {
      st = gameReducer(st, { type: 'BATTLE_ACTION', action: { type: 'autoTurn' } });
      guard += 1;
    }
    return { win: !!st.battle && st.battle.winner === 'player', rounds: st.battle ? st.battle.round : guard };
  };

  const CAPS = [
    { tag: 'P24', copies: 4, total: 24 },
    { tag: 'P18', copies: 3, total: 18 },
    { tag: 'P12', copies: 2, total: 12 },
    { tag: 'P06', copies: 1, total: 6 },
  ];

  const rows = [];
  for (const cap of CAPS) {
    const cell = {};
    for (const bossId of BOSSES) {
      let wins = 0, rounds = 0, games = 0;
      for (const fleet of FLEETS) {
        for (let i = 0; i < N; i += 1) {
          const r = play(bossId, fleet, 1000 + i, cap.copies);
          if (r.win) wins += 1;
          rounds += r.rounds;
          games += 1;
        }
      }
      cell[bossId] = { win: (100 * wins) / games, rounds: rounds / games };
    }
    rows.push({ tag: cap.tag, total: cap.total, cell });
    console.log(cap.tag + ' 完成');
  }

  const pad = (s, n) => String(s).padEnd(n);
  const fmt = (c) => pad(c.win.toFixed(1) + '%', 9) + '/' + pad(c.rounds.toFixed(1), 5);
  console.log('');
  console.log('敌池容量扫描：每格 ' + N + ' 局 × 3 套编队（"胜率 / 均回合"），seed = 1000..' + (999 + N));
  console.log('');
  console.log(pad('池', 6) + pad('m01', 15) + pad('m02', 15) + pad('m03', 15) + 'm04');
  console.log('-'.repeat(68));
  for (const r of rows) {
    console.log(pad(r.tag + '(' + r.total + ')', 6) + pad(fmt(r.cell.m01), 15) + pad(fmt(r.cell.m02), 15)
      + pad(fmt(r.cell.m03), 15) + fmt(r.cell.m04));
  }
  console.log('');

  // 斜率：每少 6 张（copies −1）的胜率变化
  const slope = (bossId) => {
    const a = rows[0].cell[bossId].win;
    const b = rows[1].cell[bossId].win;
    return b - a;
  };
  console.log('斜率（池 24→18，即每种卡 4→3 份）：'
    + BOSSES.map((b) => b + ' ' + (slope(b) >= 0 ? '+' : '') + slope(b).toFixed(1) + ' 点').join(' · '));
})().catch((e) => {
  console.error('池容量扫描出错：', e && e.stack ? e.stack.split('\n').slice(0, 6).join('\n') : e);
  process.exitCode = 1;
});
