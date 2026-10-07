'use strict';
/* ============================================================================
   校验 src/data/battle/*.ts 与 carddemo/engine.js 逐字段一致（0 差异）
   用法：node scripts/verify-battle-data.cjs
   做法：本机 Node 24 原生支持直接加载 TypeScript（类型擦除），因此
        直接 require 生成的 .ts 与引擎逐字段对拍 —— 顺带证明生成的 TS 语法合法。
        （不需要 esbuild / tsx / typescript，本仓库按约定不装依赖也能跑。）
   注意：.ts 里只允许"可擦除"语法（import type / 类型注解 / 接口）；
        不要用 enum / namespace / 参数属性，否则 Node 无法擦除。
   ============================================================================ */
const fs = require('fs');
const path = require('path');

const APP = path.resolve(__dirname, '..');
const E = require(path.resolve(__dirname, '../../carddemo/engine.js'));
const DATA = path.join(APP, 'src/data/battle');

/** 直接加载 .ts（Node 24 原生类型擦除） */
function loadTs(file) {
  return require(path.join(DATA, file));
}

const fails = [];
const check = (ok, label, detail) => { if (!ok) fails.push(label + (detail ? ' → ' + detail : '')); };

// ---------------- cards ----------------
const cards = loadTs('cards.ts');
const engIds = Object.keys(E.CARDS);
check(Object.keys(cards.BATTLE_CARDS).length === engIds.length,
  '卡牌数量一致', Object.keys(cards.BATTLE_CARDS).length + ' vs ' + engIds.length);
for (const id of engIds) {
  const a = E.CARDS[id], b = cards.BATTLE_CARDS[id];
  if (!b) { fails.push('缺卡：' + id); continue; }
  for (const k of ['name', 'cost', 'atk', 'shield', 'structure', 'text']) {
    check(a[k] === b[k], `卡 ${id}.${k}`, JSON.stringify(a[k]) + ' vs ' + JSON.stringify(b[k]));
  }
  check((a.series || '通用') === b.series, `卡 ${id}.series`, a.series + ' vs ' + b.series);
  // 衍生单位的 rarity 在导出边界被规范化（DEMO 的 '衍' → '白'），故只比对非 token 卡
  if (!a.token) check((a.rarity || '白') === b.rarity, `卡 ${id}.rarity`, a.rarity + ' vs ' + b.rarity);
  check(!!a.token === !!b.token, `卡 ${id}.token`);
}

// ---------------- pirates ----------------
const pir = loadTs('pirates.ts');
for (const id of Object.keys(E.BOSSES)) {
  const a = E.BOSSES[id], b = pir.PIRATE_BOSSES[id];
  if (!b) { fails.push('缺敌人：' + id); continue; }
  check(a.name === b.name, `敌人 ${id}.name`);
  check(a.hp === b.hp, `敌人 ${id}.hp`, a.hp + ' vs ' + b.hp);
  check(a.skill === b.skill, `敌人 ${id}.skill`);
}
check(JSON.stringify(pir.PIRATE_POOL) === JSON.stringify(E.PIRATE_POOL), '海盗池一致');
check(JSON.stringify(pir.RAID_POOL) === JSON.stringify(E.RAID_POOL), '掠夺池一致');
check(pir.RAID_POOL.length === 15, '掠夺池 15 张（用户 2026-08 裁定：与老巢池区分、减半）', String(pir.RAID_POOL.length));
check(JSON.stringify(pir.RAID_POOL) !== JSON.stringify(pir.PIRATE_POOL), '掠夺池与老巢池不是同一个池');

// ---------------- fleets ----------------
const fl = loadTs('fleets.ts');
check(JSON.stringify(fl.FLEET_STARTER) === JSON.stringify(E.FLEET_STARTER), '新手编制一致',
  fl.FLEET_STARTER.length + ' vs ' + E.FLEET_STARTER.length);
check(JSON.stringify(fl.FLEET_ALL) === JSON.stringify(E.FLEET_ALL), '全集编制一致',
  fl.FLEET_ALL.length + ' vs ' + E.FLEET_ALL.length);

// ---------------- tuning 与文档口径 ----------------
const tun = loadTs('tuning.ts').BATTLE_TUNING;
check(tun.bodyHp === 15, 'tuning.bodyHp = 15');
check(tun.firstCap === 3 && tun.secondCap === 4, 'tuning 指挥度起点 3/4');
check(tun.manaCap === 10 && tun.boardSize === 6 && tun.turnLimit === 20, 'tuning 上限 10 / 场上 6 / 回合 20');
check(tun.fleetSize === 30, 'tuning 编制上限 30');
check(tun.raidHp === E.BOSSES.raid.hp, 'tuning.raidHp 与 raid 敌人血量一致');

console.log('=== 数据校验：src/data/battle vs carddemo/engine.js ===');
console.log('  卡牌 ' + engIds.length + ' 张 / 敌人 ' + Object.keys(E.BOSSES).length + ' 个 / 新手编制 ' + E.FLEET_STARTER.length + ' 艘');
if (fails.length === 0) {
  console.log('  结果：逐字段一致（0 差异）✓');
} else {
  console.log('  结果：' + fails.length + ' 处不一致 ✗');
  fails.slice(0, 25).forEach((f) => console.log('   - ' + f));
  process.exitCode = 1;
}