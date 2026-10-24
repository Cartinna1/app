'use strict';
/* ============================================================================
   雇佣兵协会 · 头目胜率模拟（只测量，不调参）
   用法：node --import ./scripts/register-ts.mjs scripts/sim-bounty-bosses.cjs [样本数]
   默认每格 200 局，seed 固定为 1000..1000+N-1（同一 seed 序列跑所有格子 → 可复现、可横向比较）。

   怎么打：**走真实引擎**——建场用 `engine.createBattle`，逐手用真实的
   `gameReducer(BATTLE_ACTION autoTurn)`（与 check-battle-expedition 的 autoTurn 口径一致，
   两侧 AI 都由引擎自己决策），不写简化战斗。
   ============================================================================ */
const N = Number(process.argv[2] || 200);

(async () => {
  const { gameReducer, createInitialGameState } = await import('@/hooks/gameReducer');
  const { createBattle } = await import('@/lib/battle/engine');
  const { createMotherships } = await import('@/data/gameData');
  const { FLEET_STARTER, FLEET_ALL } = await import('@/data/battle/fleets');
  const { BATTLE_CARDS } = await import('@/data/battle/cards');

  /** 单张卡的"性价比"：攻 + 盾 + 2×结构，再按费用归一（只用来排序挑弱卡，不参与战斗） */
  const scoreOf = (id) => {
    const c = BATTLE_CARDS[id];
    if (!c) return 0;
    return (c.atk + c.shield + 2 * c.structure) / Math.max(1, c.cost);
  };
  /** 从全集里按性价比从高到低取 n 张（弱的自然被丢掉） */
  const pickBest = (n) => {
    const uniq = [...new Set(FLEET_ALL)];
    return uniq.slice().sort((a, b) => scoreOf(b) - scoreOf(a)).slice(0, n);
  };

  const FLEETS = [
    { key: 'starter26', label: 'FLEET_STARTER 26 艘（新手线）', ships: FLEET_STARTER.slice() },
    { key: 'mid26', label: '中期 26 艘（全集按性价比取前 26）', ships: pickBest(26) },
    { key: 'full30', label: '满编 30 艘（全集按性价比取前 30）', ships: pickBest(30) },
  ];
  const ENEMIES = [
    { id: 'm01', label: 'm01 噬星母巢' },
    { id: 'm02', label: 'm02 残响总控' },
    { id: 'm03', label: 'm03 忆潮主祭' },
    { id: 'm04', label: 'm04 旧律裁决官' },
    { id: 'm05', label: 'm05 弱海盗（对照）' },
    { id: 'b1', label: 'b1 红胡子（老巢基准）' },
  ];

  /** 跑一局：返回 {win, rounds, body, lost} */
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

  const rows = [];
  for (const enemy of ENEMIES) {
    for (const fleet of FLEETS) {
      const stats = { wins: 0, rounds: 0, body: 0, lost: 0, maxRounds: 0 };
      for (let i = 0; i < N; i += 1) {
        const r = playOne(enemy.id, fleet.ships, 1000 + i);
        if (r.win) stats.wins += 1;
        stats.rounds += r.rounds;
        stats.body += r.body;
        stats.lost += r.lost;
        if (r.rounds > stats.maxRounds) stats.maxRounds = r.rounds;
      }
      rows.push({
        enemy: enemy.label,
        fleet: fleet.key,
        winRate: (100 * stats.wins) / N,
        avgRounds: stats.rounds / N,
        avgBody: stats.body / N,
        avgLost: stats.lost / N,
        maxRounds: stats.maxRounds,
      });
    }
  }

  // ---------------- 输出 ----------------
  const pad = (s, n) => String(s).padEnd(n, ' ');
  const num = (v, d) => v.toFixed(d);
  console.log('');
  console.log('雇佣兵头目胜率模拟：每格 ' + N + ' 局，seed = 1000..' + (999 + N) + '（所有格子同一序列）');
  console.log('');
  console.log(pad('敌人', 22) + pad('玩家编队', 10) + pad('胜率%', 8) + pad('均回合', 8)
    + pad('均剩本体', 10) + pad('均永久损失', 12) + '最长一局');
  console.log('-'.repeat(80));
  for (const r of rows) {
    console.log(
      pad(r.enemy, 22) + pad(r.fleet, 10) + pad(num(r.winRate, 1), 8) + pad(num(r.avgRounds, 1), 8)
      + pad(num(r.avgBody, 2), 10) + pad(num(r.avgLost, 2), 12) + String(r.maxRounds)
    );
  }
  console.log('');

  // 结论用的几个数：每个敌人跨三套编队的平均胜率
  const avgByEnemy = ENEMIES.map((e) => {
    const list = rows.filter((r) => r.enemy === e.label);
    return { label: e.label, win: list.reduce((s, r) => s + r.winRate, 0) / list.length };
  });
  const byWin = avgByEnemy.slice().sort((a, b) => a.win - b.win);
  const at = (label) => avgByEnemy.find((x) => x.label.indexOf(label) === 0);
  console.log('结论（三套编队平均胜率）');
  console.log('  最难：' + byWin[0].label + '（' + byWin[0].win.toFixed(1) + '%）'
    + '；最易：' + byWin[byWin.length - 1].label + '（' + byWin[byWin.length - 1].win.toFixed(1) + '%）');
  for (const id of ['m01', 'm02', 'm03', 'm04']) {
    const m = at(id);
    const base = at('b1');
    const weak = at('m05');
    console.log('  ' + id + '：' + m.win.toFixed(1) + '% · 比 b1（' + base.win.toFixed(1) + '%）低 '
      + (base.win - m.win).toFixed(1) + ' 点 · 比 m05（' + weak.win.toFixed(1) + '%）低 '
      + (weak.win - m.win).toFixed(1) + ' 点');
  }
})().catch((e) => {
  console.error('模拟脚本出错：', e && e.stack ? e.stack.split('\n').slice(0, 8).join('\n') : e);
  process.exitCode = 1;
});
