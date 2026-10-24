'use strict';
/* ============================================================================
   雇佣兵头目 · 敏感度扫描（不改仓库数据）：V0 现状 / V1 池 5→4 份 / V2 = V1+m04 盾+2→+1 /
   V3 = V2+m01 开场 2→1 艘 / V4 = V3+q1·v1 结构 0→1

   用法：node --import ./scripts/register-ts.mjs scripts/sim-boss-sweep.cjs [每格局数]
   默认每格 100 局，seed = 1000..1000+N-1（所有配置同一序列）。

   ⚠ 做到"不改仓库数据"的方式：
     · 池子 5→4：建场后**在内存里**把 `battle.boss.pool` 换成 4 份副本的池（24 张）——不改任何文件；
     · 结构 0→1：**在内存里**改 `ENG.CARDS[id].structure`（CARDS 是运行期表，spawnUnit 现取）；
     · m04 盾 +2→+1、m01 开场 2→1：这是**代码级**杠杆 → 脚本把 `engine.ts` 复制成
       `src/lib/battle/__sweep_vN.ts` 并做两处文本替换后动态 import；**跑完在 finally 里删掉这些副本**。
   ============================================================================ */
const N = Number(process.argv[2] || 100);
const fs = require('fs');
const path = require('path');

const ENGINE = path.resolve(__dirname, '../src/lib/battle/engine.ts');
const VARIANTS = {
  v2: [
    ["api(st, 'boss').allies(null).forEach(a => { a.shield += 2; });", "api(st, 'boss').allies(null).forEach(a => { a.shield += 1; });"],
  ],
  v3: [
    ["api(st, 'boss').allies(null).forEach(a => { a.shield += 2; });", "api(st, 'boss').allies(null).forEach(a => { a.shield += 1; });"],
    ["  if (bossId === 'm01') {\n    for (let i = 0; i < 2; i++) {", "  if (bossId === 'm01') {\n    for (let i = 0; i < 1; i++) {"],
  ],
};

(async () => {
  const { gameReducer, createInitialGameState } = await import('@/hooks/gameReducer');
  const { createMotherships } = await import('@/data/gameData');
  const { FLEET_STARTER, FLEET_ALL } = await import('@/data/battle/fleets');
  const { BATTLE_CARDS } = await import('@/data/battle/cards');
  const { MERCENARY_POOLS } = await import('@/data/mercenary/pools');

  /** 临时变体文件（跑完删） */
  const tmpFiles = [];
  const makeVariant = (tag, subs) => {
    const src = fs.readFileSync(ENGINE, 'utf8');
    let out = src;
    for (const [a, b] of subs) {
      if (out.indexOf(a) < 0) throw new Error('变体替换失败：' + tag);
      out = out.replace(a, b);
    }
    // ⚠ 子进程写不了 `src/**`（EPERM），所以变体放 `scripts/` 并把相对 import 改成别名导入
    out = out.replace("from './rng'", "from '@/lib/battle/rng'");
    const abs = path.resolve(__dirname, '__sweep_' + tag + '.ts');
    fs.writeFileSync(abs, out, 'utf8');
    tmpFiles.push(abs);
    return './__sweep_' + tag + '.ts';
  };

  const scoreOf = (id) => {
    const c = BATTLE_CARDS[id];
    return c ? (c.atk + c.shield + 2 * c.structure) / Math.max(1, c.cost) : 0;
  };
  const pickBest = (n) => [...new Set(FLEET_ALL)].slice().sort((a, b) => scoreOf(b) - scoreOf(a)).slice(0, n);
  const FLEETS = [FLEET_STARTER.slice(), pickBest(26), pickBest(30)];
  const BOSSES = ['m01', 'm02', 'm03', 'm04'];

  /** 池子 5 份 → 4 份（保持原顺序：每种卡连续 5 份 → 取前 4 份） */
  // ⚠ 敌池是**循环排列**（q1..q6,q1..q6,...），不是连续 5 份；按"每种卡累计前 4 份"来缩
  const shrinkPool = (pool) => {
    const seen = new Map();
    const out = [];
    for (const id of pool) {
      const n = (seen.get(id) || 0) + 1;
      seen.set(id, n);
      if (n <= 4) out.push(id);
    }
    return out;
  };

  const play = (E, bossId, fleet, seed, opts) => {
    const base = createInitialGameState();
    const ship = createMotherships()[0];
    const created = E.createBattle({ seed, bossId });
    const bossPool = opts.shrink ? shrinkPool(created.boss.pool) : created.boss.pool;
    let st = {
      ...base,
      phase: 'playing',
      turn: 1,
      ships: [ship],
      battle: { ...created, player: { ...created.player, pool: fleet.slice() }, boss: { ...created.boss, pool: bossPool } },
    };
    let guard = 0;
    while (st.battle && !st.battle.over && guard < 400) {
      st = gameReducer(st, { type: 'BATTLE_ACTION', action: { type: 'autoTurn' } });
      guard += 1;
    }
    return st.battle ? st.battle.winner === 'player' : false;
  };

  const configs = [
    { tag: 'V0', mod: null, shrink: false, struct: false, desc: '现状基准' },
    { tag: 'V1', mod: null, shrink: true, struct: false, desc: '敌池 5→4 份' },
    // ⚠ 下面三条是**代码级杠杆**（m04 盾、m01 开场数）：`gameReducer` 内部走的是**原始 engine**
    //   模块，变体文件只能影响"建场"，之后的回合全在原始 engine 里跑 → 测不出来（本脚本实测 5 行全同）。
    //   故只保留可经战斗状态注入的杠杆（敌池 / CARDS 结构值），其余必须走"补丁→重导出→再模拟"的流水线。
    { tag: 'V4', mod: null, shrink: true, struct: true, desc: 'V1 + q1/v1 结构 0→1' },
  ];

  const rows = [];
  try {
    for (const cfg of configs) {
      const E = cfg.mod ? await import(makeVariant(cfg.mod + '_' + cfg.tag, VARIANTS[cfg.mod])) : await import('@/lib/battle/engine');
      if (cfg.struct) {
        E.CARDS.q1.structure = 1;
        E.CARDS.v1.structure = 1;
      }
      const cell = {};
      for (const bossId of BOSSES) {
        let wins = 0;
        for (const fleet of FLEETS) {
          for (let i = 0; i < N; i += 1) {
            if (play(E, bossId, fleet, 1000 + i, { shrink: cfg.shrink })) wins += 1;
          }
        }
        cell[bossId] = (100 * wins) / (N * FLEETS.length);
      }
      rows.push({ tag: cfg.tag, desc: cfg.desc, cell });
      console.log(cfg.tag + ' 完成');
    }
  } finally {
    for (const f of tmpFiles) {
      try { fs.unlinkSync(f); } catch (e) { /* 忽略 */ }
    }
    const left = tmpFiles.filter((f) => fs.existsSync(f));
    console.log(left.length === 0 ? '[✓] 临时变体已全部删除' : '[x] 仍残留：' + left.join(','));
  }

  const pad = (s, n) => String(s).padEnd(n, ' ');
  console.log('');
  console.log('头目敏感度扫描：每格 ' + N + ' 局 × 3 套编队，seed = 1000..' + (999 + N));
  console.log('');
  console.log(pad('配置', 6) + pad('说明', 26) + pad('m01', 8) + pad('m02', 8) + pad('m03', 8) + 'm04');
  console.log('-'.repeat(64));
  for (const r of rows) {
    console.log(pad(r.tag, 6) + pad(r.desc, 26)
      + pad(r.cell.m01.toFixed(1), 8) + pad(r.cell.m02.toFixed(1), 8)
      + pad(r.cell.m03.toFixed(1), 8) + r.cell.m04.toFixed(1));
  }
})().catch((e) => {
  console.error('扫描脚本出错：', e && e.stack ? e.stack.split('\n').slice(0, 6).join('\n') : e);
  process.exitCode = 1;
});


