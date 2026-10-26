'use strict';
/* ============================================================================
   纯代码导出《舰船与 BOSS 数据总表》——不写任何手写注记，数据全部来自代码。

   用法：node --import ./scripts/register-ts.mjs scripts/export-data-table.cjs [输出路径]
   默认输出到桌面 `舰船与BOSS数据总表-代码导出-YYYY-MM-DD.md`。
   ============================================================================ */
const fs = require('fs');
const os = require('os');
const path = require('path');

(async () => {
  const { BATTLE_CARDS } = await import('@/data/battle/cards');
  const { PIRATE_BOSSES, PIRATE_POOL, RAID_POOL } = await import('@/data/battle/pirates');
  const { MERCENARY_POOLS, MERCENARY_FLEETS } = await import('@/data/mercenary/pools');
  const { FLEET_ALL, FLEET_STARTER } = await import('@/data/battle/fleets');
  const { BATTLE_TUNING } = await import('@/data/battle/tuning');
  const { CARDS, TURN_LIMIT, BOARD_SIZE, BODY_HP, MANA_CAP } = await import('@/lib/battle/engine');

  const now = new Date();
  const pad2 = (n) => String(n).padStart(2, '0');
  const date = now.getFullYear() + '-' + pad2(now.getMonth() + 1) + '-' + pad2(now.getDate());
  const stamp = date + ' ' + pad2(now.getHours()) + ':' + pad2(now.getMinutes());
  const outPath = process.argv[2] || path.join(os.homedir(), 'Desktop', '舰船与BOSS数据总表-代码导出-' + date + '.md');

  // ---------------- 工具 ----------------
  const esc = (s) => String(s == null ? '' : s).replace(/\|/g, '\\|').replace(/\n/g, ' ');
  const stats = (c) => c.atk + '/' + c.shield + '/' + c.structure;
  const kwOf = (id) => {
    const kw = (CARDS[id] && CARDS[id].kw) || {};
    const keys = Object.keys(kw);
    if (!keys.length) return '—';
    return keys.map((k) => (kw[k] === true ? k : k + ':' + kw[k])).join(' ');
  };
  const poolOf = (bossId) => {
    if (MERCENARY_POOLS[bossId]) return { name: 'MERCENARY_POOLS.' + bossId, list: MERCENARY_POOLS[bossId] };
    if (bossId === 'raid') return { name: 'RAID_POOL', list: RAID_POOL };
    return { name: 'PIRATE_POOL', list: PIRATE_POOL };
  };
  const composition = (list) => {
    const m = new Map();
    for (const id of list) m.set(id, (m.get(id) || 0) + 1);
    return [...m.entries()]
      .sort((a, b) => (BATTLE_CARDS[a[0]].cost - BATTLE_CARDS[b[0]].cost) || a[0].localeCompare(b[0]))
      .map(([id, n]) => id + '×' + n)
      .join(' ');
  };
  const maxCost = (list) => Math.max(...list.map((id) => BATTLE_CARDS[id].cost));

  // ---------------- 分组 ----------------
  const PLAYER_SERIES = ['圣辉', '铁血', '灵能', '财团', '通用'];
  const ENEMY_SERIES = ['海盗', '虫群', '智械', '灵潮', '旧律'];
  const allCards = Object.values(BATTLE_CARDS);
  const tokenCards = allCards.filter((c) => c.token);
  const bySeries = (s) => allCards.filter((c) => c.series === s && !c.token)
    .sort((a, b) => (a.cost - b.cost) || a.id.localeCompare(b.id));

  const L = [];
  const push = (s) => L.push(s);
  const table = (head, rows) => {
    push('| ' + head.join(' | ') + ' |');
    push('|' + head.map(() => '---').join('|') + '|');
    for (const r of rows) push('| ' + r.join(' | ') + ' |');
    push('');
  };

  // ---------------- 头部 ----------------
  push('# 舰船与 BOSS 数据总表（代码导出）');
  push('');
  push('> 本文件由 `scripts/export-data-table.cjs` **自动生成**，请勿手改；数据以代码为准。');
  push('> 生成时间：' + stamp + '　·　数据来源：`src/data/battle/{cards,pirates,tuning}.ts`、`src/data/mercenary/pools.ts`、`src/data/battle/fleets.ts`、`src/lib/battle/engine.ts`（关键词在此）。');
  push('');

  // ---------------- 统计 ----------------
  push('## 0. 统计与校验');
  push('');
  table(['项', '值'], [
    ['卡牌总数', String(allCards.length)],
    ['其中衍生单位（token）', String(tokenCards.length)],
    ['BOSS 数', String(Object.keys(PIRATE_BOSSES).length)],
    ['玩家卡（FLEET_ALL）', String(FLEET_ALL.length)],
    ['新手编制（FLEET_STARTER）', String(FLEET_STARTER.length)],
    ['老巢池（PIRATE_POOL）', PIRATE_POOL.length + ' 张'],
    ['掠夺池（RAID_POOL）', RAID_POOL.length + ' 张'],
    ['雇佣兵池', ['m01', 'm02', 'm03', 'm04'].map((k) => k + '=' + MERCENARY_POOLS[k].length).join(' / ')],
    ['玩家本体（BODY_HP）', String(BODY_HP)],
    ['回合上限（TURN_LIMIT）', String(TURN_LIMIT)],
    ['场上上限（BOARD_SIZE）', String(BOARD_SIZE)],
    ['指挥度上限（MANA_CAP）', String(MANA_CAP)],
    ['舰队编制上限', String(BATTLE_TUNING.fleetSize)],
  ]);

  // ---------------- A. BOSS ----------------
  push('## A. BOSS（' + Object.keys(PIRATE_BOSSES).length + ' 个）');
  push('');
  const bossGroups = [
    ['A1. 海盗老巢（b1~b5）', ['b1', 'b2', 'b3', 'b4', 'b5']],
    ['A2. 掠夺队', ['raid']],
    ['A3. 雇佣兵协会（m01~m05）', ['m01', 'm02', 'm03', 'm04', 'm05']],
  ];
  for (const [title, ids] of bossGroups) {
    push('### ' + title);
    push('');
    table(['id', '名称', '本体血量', '敌池', '敌池张数', '技能（`pirates.ts` 原文）'],
      ids.map((id) => {
        const b = PIRATE_BOSSES[id];
        const pool = poolOf(id);
        return [id, esc(b.name), String(b.hp), '`' + pool.name + '`', String(pool.list.length), esc(b.skill)];
      }));
  }

  // ---------------- B. 敌池构成 ----------------
  push('## B. 敌池构成');
  push('');
  table(['池', '张数', '构成（用光不补充）', '最高费'],
    [['老巢 `PIRATE_POOL`', PIRATE_POOL.length, composition(PIRATE_POOL), maxCost(PIRATE_POOL)],
      ['掠夺队 `RAID_POOL`', RAID_POOL.length, composition(RAID_POOL), maxCost(RAID_POOL)],
      ...['m01', 'm02', 'm03', 'm04'].map((k) => ['`MERCENARY_POOLS.' + k + '`', MERCENARY_POOLS[k].length, composition(MERCENARY_POOLS[k]), maxCost(MERCENARY_POOLS[k])]),
    ].map((r) => r.map((x) => String(x))));

  // ---------------- C. 卡牌 ----------------
  push('## C. 卡牌全表（' + allCards.length + ' 张）');
  push('');
  push('列说明：`kw` 取自 `engine.ts` 的 `CARDS[id].kw`（布尔关键词写键名，数值关键词写 `键:值`）；`text` 为 `cards.ts` 原文。');
  push('');
  push('### C1. 玩家（五系 + 通用）');
  push('');
  for (const s of PLAYER_SERIES) {
    const list = bySeries(s);
    if (!list.length) continue;
    push('**' + s + '系（' + list.length + ' 张）**');
    push('');
    table(['id', '名称', '费', '攻/盾/体', '稀有', 'kw', '技能（`text` 原文）'],
      list.map((c) => [c.id, esc(c.name), String(c.cost), stats(c), c.rarity, kwOf(c.id), esc(c.text)]));
  }
  push('### C2. 敌方（海盗 + 雇佣兵四系）');
  push('');
  for (const s of ENEMY_SERIES) {
    const list = bySeries(s);
    if (!list.length) continue;
    push('**' + s + '系（' + list.length + ' 张）**');
    push('');
    table(['id', '名称', '费', '攻/盾/体', '稀有', 'kw', '技能（`text` 原文）'],
      list.map((c) => [c.id, esc(c.name), String(c.cost), stats(c), c.rarity, kwOf(c.id), esc(c.text)]));
  }
  push('### C3. 衍生单位（token，不进卡库）');
  push('');
  table(['id', '名称', '攻/盾/体', '稀有', 'kw'],
    tokenCards.sort((a, b) => a.id.localeCompare(b.id)).map((c) => [c.id, esc(c.name), stats(c), c.rarity, kwOf(c.id)]));

  // ---------------- D. 编制 ----------------
  push('## D. 编制');
  push('');
  table(['编制', '艘数', '费用曲线', '总攻', '总盾', '总结构'],
    [
      ['FLEET_STARTER', FLEET_STARTER.length, curve(FLEET_STARTER)].concat(sums(FLEET_STARTER)),
      ['FLEET_ALL', FLEET_ALL.length, curve(FLEET_ALL)].concat(sums(FLEET_ALL)),
      ...['m01', 'm02', 'm03', 'm04'].map((k) => ['MERCENARY_FLEETS.' + k, MERCENARY_FLEETS[k].length, curve(MERCENARY_FLEETS[k])].concat(sums(MERCENARY_FLEETS[k]))),
    ].map((r) => r.map((x) => String(x))));

  // ---------------- E. 数值锚点 ----------------
  push('## E. 数值锚点（`BATTLE_TUNING`）');
  push('');
  table(['键', '值'], Object.entries(BATTLE_TUNING).map(([k, v]) => ['`' + k + '`', String(v)]));

  // ---------------- F. 关键词使用 ----------------
  push('## F. 关键词使用（`engine.ts` 的 `CARDS[*].kw`）');
  push('');
  const kwMap = new Map();
  for (const c of allCards) {
    const kw = (CARDS[c.id] && CARDS[c.id].kw) || {};
    for (const [k, v] of Object.entries(kw)) {
      if (!kwMap.has(k)) kwMap.set(k, []);
      kwMap.get(k).push(c.id + (v === true ? '' : ':' + v));
    }
  }
  table(['关键词键', '出现的卡（id，数值关键词带 :值）'],
    [...kwMap.entries()].sort((a, b) => a[0].localeCompare(b[0]))
      .map(([k, list]) => ['`' + k + '`', list.join(' ')]));

  function curve(list) {
    const m = new Map();
    for (const id of list) m.set(BATTLE_CARDS[id].cost, (m.get(BATTLE_CARDS[id].cost) || 0) + 1);
    return [...m.entries()].sort((a, b) => a[0] - b[0]).map(([c, n]) => c + '费×' + n).join(' ');
  }
  function sums(list) {
    const s = list.reduce((acc, id) => {
      const c = BATTLE_CARDS[id];
      return { atk: acc.atk + c.atk, shield: acc.shield + c.shield, structure: acc.structure + c.structure };
    }, { atk: 0, shield: 0, structure: 0 });
    return [s.atk, s.shield, s.structure];
  }

  // ---------------- G. 行为探针 ----------------
  push('## G. 行为探针（运行时实测，非手写）');
  push('');
  const E = await import('@/lib/battle/engine');
  const probeBattle = () => E.createBattle({ seed: 1, bossId: 'b1' });
  const rowsG = [];
  {
    const st = probeBattle();
    const u = E.spawnUnit(st, 'player', 't_grunt');
    E.placeUnit(st, 'player', u, 0);
    const r = E.damageUnit(st, u, 1, true);
    rowsG.push(['击毁判据：无视护盾 1 点打 1体1盾的 `t_grunt`',
      'destroyed=' + r.destroyed + '；结构=' + u.structure + '；护盾=' + u.shield]);
  }
  {
    const st = probeBattle();
    const u = E.spawnUnit(st, 'player', 'h4');
    E.placeUnit(st, 'player', u, 0);
    E.damageUnit(st, u, 2);
    const before = u.shield;
    E.startTurn(st, 'player');
    rowsG.push(['护盾回充：`h4`（6 盾）挨 2 点后过一回合',
      before + ' → ' + u.shield + '（上限 ' + u.maxShield + '）']);
  }
  table(['探针', '实测结果'], rowsG);

  const md = L.join('\n') + '\n';
  fs.writeFileSync(outPath, md, 'utf8');
  console.log('已生成：' + outPath);
  console.log('行数：' + md.split('\n').length + '　字节：' + Buffer.byteLength(md, 'utf8'));
})().catch((e) => { console.error(e && e.stack ? e.stack : e); process.exitCode = 1; });
