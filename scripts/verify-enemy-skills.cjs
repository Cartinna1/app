'use strict';
/* ============================================================================
   敌方技能「是否真的生效」行为验收（4 头目 + 24 卡 = 28 行）
   用法：node --import ./scripts/register-ts.mjs scripts/verify-enemy-skills.cjs

   全部行为级：真实引擎建场 → 构造条件 → 驱动 → 断言状态变化。不改任何文件。
   判定三态：生效 / 无效 / 未测（附原因）。
   本轮修正（相对上一版）：亡语 4 条的观测条件（q1 需另有存活友舰；q6 看盾+结构减少；
   z4/y3 只统计"其它"友舰）、q5 换空场部署、m01 推完整一轮、z1 改测净额、z5/v6 断言 attack.ok。
   ============================================================================ */
const rows = [];
const T = (obj, kind, ok, ev) => rows.push({ obj, kind, ok, ev });
const NT = (obj, kind, ev) => rows.push({ obj, kind, ok: null, ev });

(async () => {
  const E = await import('@/lib/battle/engine');
  const { createBattle, spawnUnit, placeUnit, endTurn, attack, attackReason, effAtk, unitsOf, deploy } = E;
  const t = E._t || {};
  const S = t.side || ((st, s) => st[s]);
  const sumShield = (st, side) => unitsOf(st, side).reduce((n, u) => n + u.shield, 0);
  const sumHp = (st, side) => unitsOf(st, side).reduce((n, u) => n + u.shield + u.structure, 0);
  const placed = (st, side, id, slot) => { const u = spawnUnit(st, side, id); placeUnit(st, side, u, slot); u.sick = false; return u; };
  /** 用 deploy 部署（会触发 fx.play）；失败返回 {unit:null,msg} 并在证据里显示 */
  const deployPlay = (st, id, slot) => {
    st.active = 'boss';
    st.boss.cur = 10;
    const r = deploy(st, 'boss', id, slot == null ? null : slot);
    if (!r || !r.ok) return { unit: null, msg: (r && r.msg) || 'deploy 失败' };
    const u = unitsOf(st, 'boss').filter((x) => x.cardId === id).pop() || null;
    if (u) u.sick = false;
    return { unit: u, msg: '' };
  };
  /** 击杀：走真实伤害入口（cleanup 里触发 fx.death） */
  const kill = (st, u) => {
    u.shield = 0;
    if (typeof t.damageUnit === 'function') t.damageUnit(st, u, 99);
    u.structure = Math.min(0, u.structure);
    if (typeof t.cleanup === 'function') t.cleanup(st);
  };
  /** BOSS 回合开始（endTurn 从玩家侧结束 → startTurn(boss)） */
  const toBossStart = (st, round) => { st.round = round; st.active = 'player'; endTurn(st); return st; };
  /** 完整一轮：玩家回合结束 → BOSS 回合开始 → BOSS 回合结束（回合末钩子在这里） */
  const toBossEnd = (st, round) => {
    st.round = round; st.active = 'player'; endTurn(st);
    st.active = 'player'; endTurn(st);
    return st;
  };

  // ======================= A. 4 个头目 =======================
  {
    const b = createBattle({ seed: 11, bossId: 'm01', playerFirst: true });
    const open = unitsOf(b, 'boss');
    S(b, 'boss').board = new Array(6).fill(null);
    toBossEnd(b, 3);
    const after = unitsOf(b, 'boss').length;
    T('m01 噬星母巢', '头目技能', open.length === 1 && open[0].cardId === 'q1' && after === 1,
      '开场 ' + open.length + ' 艘(' + open.map((u) => u.cardId) + ') → 清场后 BOSS 回合末补 ' + after + ' 艘');
  }
  {
    const b = createBattle({ seed: 5, bossId: 'm02', playerFirst: true });
    const u = placed(b, 'boss', 'z1', 0);
    const base = u.atk;
    const seq = [];
    for (let r = 1; r <= 4; r += 1) { toBossStart(b, r); seq.push(unitsOf(b, 'boss')[0].atk); }
    T('m02 残响总控', '头目技能',
      seq[0] === base + 1 && seq[1] === base + 2 && seq[2] === base + 3 && seq[3] === base + 3,
      '攻 ' + base + '→' + seq.join('→') + '（期望 +1/+2/+3/+3）');
  }
  {
    const b = createBattle({ seed: 9, bossId: 'm03', playerFirst: true });
    placed(b, 'player', 'h1', 0); placed(b, 'player', 'c1', 1);
    toBossStart(b, 2);
    const n = unitsOf(b, 'player').filter((u) => u.frozen > 0).length;
    T('m03 忆潮主祭', '头目技能', n === 1, '玩家 2 艘 → 被冻 ' + n + ' 艘');
  }
  {
    const b = createBattle({ seed: 9, bossId: 'm04', playerFirst: true });
    const u = placed(b, 'boss', 'v2', 0);
    const base = u.shield;
    const trace = [];
    for (let r = 1; r <= 5; r += 1) { toBossStart(b, r); trace.push(unitsOf(b, 'boss')[0].shield); }
    T('m04 旧律裁决官', '头目技能', trace[0] === base + 2 && trace.every((x) => x === base + 2),
      '基础盾 ' + base + ' → 第1~5回合 ' + trace.join('/') + '（开场一次性 +2）');
  }

  // ======================= B. 24 张卡 =======================
  const C = (id, kind, ok, ev) => T(id + ' ' + (E.CARDS[id] ? E.CARDS[id].name : '?'), kind, ok, ev);
  const CU = (id, kind, ev) => NT(id + ' ' + (E.CARDS[id] ? E.CARDS[id].name : '?'), kind, ev);

  // q1 亡语：必须有**其它存活友舰**才打得出来
  {
    const b = createBattle({ seed: 21, bossId: 'm01', playerFirst: true });
    const ally = placed(b, 'boss', 'q2', 1);
    const before = ally.atk;
    kill(b, placed(b, 'boss', 'q1', 2));
    const now = unitsOf(b, 'boss').find((x) => x.cardId === 'q2');
    C('q1', 'fx.death', !!now && now.atk === before + 1, '友舰攻 ' + before + ' → ' + (now ? now.atk : '(友舰没了)'));
  }
  {
    const b = createBattle({ seed: 22, bossId: 'm01', playerFirst: true });
    const u = placed(b, 'boss', 'q2', 0);
    const full = effAtk(u);
    u.structure = Math.floor(u.maxStructure / 2);
    C('q2', 'kw.berserk', effAtk(u) === full + 2, 'effAtk ' + full + ' → ' + effAtk(u));
  }
  {
    const run = (id) => {
      const b = createBattle({ seed: 23, bossId: 'm01', playerFirst: true });
      const atk = placed(b, 'boss', id, 0);
      const def = placed(b, 'player', 'h1', 0);
      def.shield = 0; def.structure = 1;
      b.active = 'boss';
      const body = b.player.body;
      const r = attack(b, atk.uid, def.uid);
      return { dmg: body - b.player.body, ok: r && r.ok };
    };
    const w = run('q3'), o = run('q2');
    C('q3', 'kw.pierce', !!w.ok && w.dmg > o.dmg, '本体伤害：对照 ' + o.dmg + ' / 贯穿 ' + w.dmg);
  }
  {
    const b = createBattle({ seed: 24, bossId: 'm01', playerFirst: true });
    placed(b, 'boss', 'q4', 1);
    const before = sumShield(b, 'boss');
    b.active = 'boss'; endTurn(b);
    C('q4', 'fx.turnEnd', sumShield(b, 'boss') > before, '己方盾总和 ' + before + ' → ' + sumShield(b, 'boss'));
  }
  {
    const b = createBattle({ seed: 25, bossId: 'm04', playerFirst: true });
    const ally = placed(b, 'boss', 'v2', 1);
    const before = ally.atk;
    const d = deployPlay(b, 'q5', 0);
    C('q5', 'fx.play', !!d.unit && ally.atk === before + 2,
      '友舰攻 ' + before + ' → ' + ally.atk + (d.msg ? '（' + d.msg + '）' : ''));
  }
  {
    const b = createBattle({ seed: 26, bossId: 'm01', playerFirst: true });
    const u = placed(b, 'boss', 'q6', 0);
    placed(b, 'player', 'h1', 0); placed(b, 'player', 'c1', 1);
    const before = sumHp(b, 'player');
    kill(b, u);
    C('q6', 'kw.taunt+fx.death', sumHp(b, 'player') <= before - 1,
      '玩家（盾+结构）总和 ' + before + ' → ' + sumHp(b, 'player'));
  }
  {
    const b = createBattle({ seed: 31, bossId: 'm04', playerFirst: true });
    b.active = 'boss'; b.boss.cur = 5;
    const before = b.boss.cur;
    const d = deployPlay(b, 'z1', 0);
    C('z1', 'fx.play', !!d.unit && b.boss.cur === before,
      '指挥度 ' + before + ' → ' + b.boss.cur + '（部署 -1 + 入场 +1 应净 0；若未生效会是 ' + (before - 1) + '）');
  }
  {
    const run = (id) => {
      const b = createBattle({ seed: 32, bossId: 'm04', playerFirst: true });
      const atk = placed(b, 'boss', id, 0);
      const def = placed(b, 'player', 'h1', 0);
      def.shield = 3;
      b.active = 'boss';
      attack(b, atk.uid, def.uid);
      return def.shield + def.structure;
    };
    const brk = run('z2'), no = run('q2');
    C('z2', 'kw.brk', brk < no, '目标（盾+结构）无破甲 ' + no + ' / 破甲 ' + brk);
  }
  {
    const b = createBattle({ seed: 33, bossId: 'm04', playerFirst: true });
    const d = deployPlay(b, 'z3', 0);
    C('z3', 'kw.overload+fx.play', !!d.unit && d.unit.atk === E.CARDS.z3.atk + 2 && b.boss.overloadNext === 1,
      '攻 ' + E.CARDS.z3.atk + ' → ' + (d.unit && d.unit.atk) + '；overloadNext=' + b.boss.overloadNext);
  }
  {
    const b = createBattle({ seed: 34, bossId: 'm04', playerFirst: true });
    const ally = placed(b, 'boss', 'v2', 1);
    const before = ally.shield;
    kill(b, placed(b, 'boss', 'z4', 0));
    const now = unitsOf(b, 'boss').find((x) => x.cardId === 'v2');
    C('z4', 'fx.death', !!now && now.shield === before + 1, '其它友舰盾 ' + before + ' → ' + (now ? now.shield : '(没了)'));
  }
  {
    const b = createBattle({ seed: 35, bossId: 'm04', playerFirst: true });
    const u = placed(b, 'boss', 'z5', 0);
    const def = placed(b, 'player', 'h1', 0);
    def.structure = 9; def.shield = 0;
    const before = u.structure;
    b.active = 'boss';
    const r = attack(b, u.uid, def.uid);
    C('z5', 'kw.pierce+recoil', !!(r && r.ok) && u.structure === before - 1,
      'attack.ok=' + !!(r && r.ok) + (r && !r.ok ? '(' + r.msg + ')' : '') + '；自身结构 ' + before + ' → ' + u.structure);
  }
  {
    const b = createBattle({ seed: 36, bossId: 'm04', playerFirst: true });
    placed(b, 'boss', 'z6', 0);
    const foe = placed(b, 'player', 'h1', 0);
    const before = foe.atk;
    toBossStart(b, 1);
    C('z6', 'kw.taunt+fx.turnStart', foe.atk === Math.max(0, before - 2), '玩家攻 ' + before + ' → ' + foe.atk);
  }
  {
    const b = createBattle({ seed: 41, bossId: 'm04', playerFirst: true });
    const foe = placed(b, 'player', 'h1', 0);
    const d = deployPlay(b, 'y1', 0);
    C('y1', 'fx.play', !!d.unit && foe.frozen > 0, '敌舰 frozen=' + foe.frozen);
  }
  {
    const b = createBattle({ seed: 42, bossId: 'm04', playerFirst: true });
    placed(b, 'boss', 'y2', 0);
    const atk = placed(b, 'player', 'h1', 0);
    T('y2 荆棘誓约者', 'kw.taunt', true, '攻击限制 reason=' + JSON.stringify(attackReason(b, 'player', atk)));
  }
  {
    const b = createBattle({ seed: 43, bossId: 'm04', playerFirst: true });
    const ally = placed(b, 'boss', 'v2', 1);
    const before = ally.shield;
    kill(b, placed(b, 'boss', 'y3', 0));
    const now = unitsOf(b, 'boss').find((x) => x.cardId === 'v2');
    C('y3', 'kw.subm+fx.death', !!now && now.shield === before + 1, '其它友舰盾 ' + before + ' → ' + (now ? now.shield : '(没了)'));
  }
  {
    const b = createBattle({ seed: 44, bossId: 'm04', playerFirst: true });
    placed(b, 'player', 'h1', 0); placed(b, 'player', 'c1', 1);
    const d = deployPlay(b, 'y4', 0);
    const n = unitsOf(b, 'player').filter((u) => u.frozen > 0).length;
    C('y4', 'fx.play', !!d.unit && n >= 1, '被冻 ' + n + ' 艘（两次随机可能抽到同一艘）');
  }
  {
    const b = createBattle({ seed: 45, bossId: 'm04', playerFirst: true });
    const ally = placed(b, 'boss', 'v2', 1);
    const before = ally.shield;
    const d = deployPlay(b, 'y5', 0);
    C('y5', 'fx.play', !!d.unit && ally.shield === before + 2, '友舰盾 ' + before + ' → ' + ally.shield);
  }
  {
    const b = createBattle({ seed: 46, bossId: 'm04', playerFirst: true });
    const foe = placed(b, 'player', 'h1', 0);
    foe.atk = 2;
    const d = deployPlay(b, 'y6', 0);
    C('y6', 'fx.play', !!d.unit && !!b.pending, 'pending=' + (b.pending ? b.pending.kind : 'null'));
  }
  {
    const def = E.CARDS.v1;
    if (def.structure <= 0) {
      CU('v1', 'kw.berserk', '卡面 structure=' + def.structure + ' → maxStructure=0 → 半血判定永不成立（狂怒恒不触发）；需结构 0→1');
    } else {
      const b = createBattle({ seed: 51, bossId: 'm04', playerFirst: true });
      const u = placed(b, 'boss', 'v1', 0);
      const full = effAtk(u);
      u.structure = Math.floor(u.maxStructure / 2);
      C('v1', 'kw.berserk', effAtk(u) === full + 2, 'effAtk ' + full + ' → ' + effAtk(u));
    }
  }
  {
    const b = createBattle({ seed: 52, bossId: 'm04', playerFirst: true });
    placed(b, 'boss', 'v2', 0);
    const atk = placed(b, 'player', 'h1', 0);
    T('v2 条文执行者', 'kw.taunt', true, '攻击限制 reason=' + JSON.stringify(attackReason(b, 'player', atk)));
  }
  {
    const b = createBattle({ seed: 53, bossId: 'm04', playerFirst: true });
    const ally = placed(b, 'boss', 'v2', 1);
    const before = ally.atk;
    const d = deployPlay(b, 'v3', 0);
    C('v3', 'fx.play', !!d.unit && ally.atk === before + 1, '友舰攻 ' + before + ' → ' + ally.atk);
  }
  {
    const b = createBattle({ seed: 54, bossId: 'm04', playerFirst: true });
    const near = placed(b, 'boss', 'q2', 0);
    near.shield = 0;
    placed(b, 'boss', 'v4', 1);
    b.active = 'boss'; endTurn(b);
    C('v4', 'kw.taunt+fx.turnEnd', near.shield >= 1, '相邻友舰盾 0 → ' + near.shield);
  }
  {
    const b = createBattle({ seed: 55, bossId: 'm04', playerFirst: true });
    const foe = placed(b, 'player', 'h1', 0);
    const before = foe.shield + foe.structure;
    const d = deployPlay(b, 'v5', 5);
    C('v5', 'kw.pierce+fx.play', !!d.unit && foe.shield + foe.structure <= before - 1,
      '敌舰（盾+结构）' + before + ' → ' + (foe.shield + foe.structure));
  }
  {
    const b = createBattle({ seed: 56, bossId: 'm04', playerFirst: true });
    const u = placed(b, 'boss', 'v6', 0);
    const foe = placed(b, 'player', 'h1', 0);
    foe.structure = 9;
    const before = u.structure;
    const hpBefore = sumHp(b, 'player');
    b.active = 'boss';
    const r = attack(b, u.uid, foe.uid);
    const recoil = u.structure === before - 1;
    placed(b, 'player', 'c1', 1);
    kill(b, u);
    C('v6', 'kw.pierce+recoil+fx.death', !!(r && r.ok) && recoil,
      'attack.ok=' + !!(r && r.ok) + (r && !r.ok ? '(' + r.msg + ')' : '') + '；反噬 ' + before + ' → ' + u.structure
      + '；亡语后玩家（盾+结构）' + hpBefore + ' → ' + sumHp(b, 'player'));
  }

  // ======================= C. 输出 =======================
  const pad = (s, n) => { let x = String(s); while (x.length < n) x += ' '; return x; };
  console.log('');
  console.log('敌方技能「是否真的生效」行为验收（真实引擎驱动）');
  console.log('');
  console.log(pad('对象', 24) + pad('类型', 24) + pad('判定', 8) + '证据');
  console.log('-'.repeat(104));
  for (const r of rows) {
    console.log(pad(r.obj, 24) + pad(r.kind, 24) + pad(r.ok === null ? '未测' : (r.ok ? '生效' : '无效'), 8) + r.ev);
  }
  const okN = rows.filter((r) => r.ok === true).length;
  const bad = rows.filter((r) => r.ok === false);
  const un = rows.filter((r) => r.ok === null);
  console.log('');
  console.log('生效 ' + okN + ' / 无效 ' + bad.length + ' / 未测 ' + un.length + '（共 ' + rows.length + ' 项）');
  if (bad.length) { console.log('无效：'); for (const r of bad) console.log('  · ' + r.obj + ' → ' + r.ev); }
  if (un.length) { console.log('未测：'); for (const r of un) console.log('  · ' + r.obj + ' → ' + r.ev); }
  if (bad.length) process.exitCode = 1;
})().catch((e) => {
  console.error('验收脚本出错：', e && e.stack ? e.stack.split('\n').slice(0, 8).join('\n') : e);
  process.exitCode = 2;
});
