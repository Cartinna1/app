'use strict';
/* ============================================================================
   移植版静态结构审计：导出面 + 每张卡的 kw/fx/dynamicCost 是否与 DEMO 一一对应
   用法：node --import ./scripts/register-ts.mjs scripts/audit-battle-port.cjs
   它是"行为对拍"的前置检查：行为对拍只跑得出"某场不一样"，
   本脚本能直接指出"哪张卡的哪个技能没搬过来"。
   ============================================================================ */
const path = require('path');
const DEMO = require(path.resolve(__dirname, '../../carddemo/engine.js'));

(async () => {
  const mod = await import('@/lib/battle/engine');
  const PORT = mod.default && mod.default.createBattle ? mod.default : mod;
  const fails = [];

  // ---------- 1. 导出面 ----------
  const dKeys = Object.keys(DEMO).sort();
  const pKeys = Object.keys(PORT).sort();
  const missing = dKeys.filter((k) => !(k in PORT));
  console.log('=== 导出面 ===');
  console.log('  DEMO ' + dKeys.length + ' 个 / 移植 ' + pKeys.length + ' 个');
  if (missing.length) console.log('  ✗ 缺少：' + missing.join(', '));
  else console.log('  ✓ DEMO 的导出面全部具备');
  const extra = pKeys.filter((k) => !dKeys.includes(k));
  if (extra.length) console.log('  · 移植版额外导出：' + extra.join(', '));
  if (missing.length) fails.push('缺导出：' + missing.join(', '));

  // ---------- 2. 每张卡的 kw / fx / dynamicCost ----------
  console.log('');
  console.log('=== 卡牌行为对齐（kw / fx / dynamicCost）===');
  const dIds = Object.keys(DEMO.CARDS);
  const pIds = Object.keys(PORT.CARDS || {});
  if (dIds.length !== pIds.length) fails.push(`卡牌数量 ${dIds.length} vs ${pIds.length}`);
  let kwDiff = 0, fxDiff = 0, dcDiff = 0, textDiff = 0;
  for (const id of dIds) {
    const a = DEMO.CARDS[id], b = (PORT.CARDS || {})[id];
    if (!b) { fails.push('缺卡：' + id); continue; }
    for (const f of ['name', 'cost', 'atk', 'shield', 'structure']) {
      if (a[f] !== b[f]) fails.push(`卡 ${id}.${f}: ${a[f]} vs ${b[f]}`);
    }
    if ((a.series || '通用') !== (b.series || '通用')) fails.push(`卡 ${id}.series`);
    // 衍生单位的 rarity 在导出边界被规范化（DEMO 的 '衍' → '白'），故只比对非 token 卡
    if (!a.token && (a.rarity || '白') !== (b.rarity || '白')) fails.push(`卡 ${id}.rarity`);
    if ((a.text || '') !== (b.text || '')) { textDiff++; fails.push(`卡 ${id}.text 不一致`); }
    const akw = Object.keys(a.kw || {}).sort().join(','), bkw = Object.keys(b.kw || {}).sort().join(',');
    if (akw !== bkw) { kwDiff++; fails.push(`卡 ${id}(${a.name}) 关键词 ${akw || '无'} vs ${bkw || '无'}`); }
    const afx = Object.keys(a.fx || {}).filter((k) => typeof a.fx[k] === 'function').sort().join(',');
    const bfx = Object.keys(b.fx || {}).filter((k) => typeof b.fx[k] === 'function').sort().join(',');
    if (afx !== bfx) { fxDiff++; fails.push(`卡 ${id}(${a.name}) 技能钩子 ${afx || '无'} vs ${bfx || '无'}`); }
    const adc = typeof a.dynamicCost === 'function', bdc = typeof b.dynamicCost === 'function';
    if (adc !== bdc) { dcDiff++; fails.push(`卡 ${id}(${a.name}) dynamicCost ${adc} vs ${bdc}`); }
  }
  console.log('  卡牌 ' + dIds.length + ' 张：关键词差异 ' + kwDiff + ' / 技能钩子差异 ' + fxDiff + ' / dynamicCost 差异 ' + dcDiff + ' / 文案差异 ' + textDiff);

  // ---------- 3. 敌人与编制表 ----------
  console.log('');
  console.log('=== 敌人 / 编制表 ===');
  for (const id of Object.keys(DEMO.BOSSES)) {
    const a = DEMO.BOSSES[id], b = (PORT.BOSSES || {})[id];
    if (!b) { fails.push('缺敌人：' + id); continue; }
    if (a.hp !== b.hp || a.name !== b.name || a.skill !== b.skill) fails.push(`敌人 ${id} 不一致`);
  }
  const same = (x, y) => JSON.stringify(x) === JSON.stringify(y);
  if (!same(DEMO.FLEET_STARTER, PORT.FLEET_STARTER)) fails.push('FLEET_STARTER 不一致');
  if (!same(DEMO.FLEET_ALL, PORT.FLEET_ALL)) fails.push('FLEET_ALL 不一致');
  if (!same(DEMO.PIRATE_POOL, PORT.PIRATE_POOL)) fails.push('PIRATE_POOL 不一致');
  console.log('  敌人 ' + Object.keys(DEMO.BOSSES).length + ' 个 / 新手编制 ' + DEMO.FLEET_STARTER.length + ' / 全集 ' + DEMO.FLEET_ALL.length + ' / 海盗池 ' + DEMO.PIRATE_POOL.length);
  console.log('  BOARD_SIZE ' + DEMO.BOARD_SIZE + ' vs ' + PORT.BOARD_SIZE + '；BODY_HP ' + DEMO.BODY_HP + ' vs ' + PORT.BODY_HP + '；MANA_CAP ' + DEMO.MANA_CAP + ' vs ' + PORT.MANA_CAP + '；TURN_LIMIT ' + DEMO.TURN_LIMIT + ' vs ' + PORT.TURN_LIMIT);
  for (const k of ['BOARD_SIZE', 'BODY_HP', 'MANA_CAP', 'TURN_LIMIT']) {
    if (DEMO[k] !== PORT[k]) fails.push(`${k} 不一致：${DEMO[k]} vs ${PORT[k]}`);
  }

  // ---------- 4. _t（测试/UI 用到的内部函数集合） ----------
  console.log('');
  console.log('=== _t 内部函数集合 ===');
  if (!DEMO._t) console.log('  （DEMO 无 _t，跳过）');
  else if (!PORT._t) { fails.push('缺 _t'); console.log('  ✗ 移植版没有 _t'); }
  else {
    const dt = Object.keys(DEMO._t).sort(), pt = Object.keys(PORT._t).sort();
    const missT = dt.filter((k) => !(k in PORT._t));
    console.log('  DEMO ' + dt.length + ' 个 / 移植 ' + pt.length + ' 个');
    if (missT.length) { fails.push('_t 缺：' + missT.join(', ')); console.log('  ✗ 缺：' + missT.join(', ')); }
    else console.log('  ✓ 全部具备');
  }

  console.log('');
  console.log('=== 静态审计结果 ===');
  if (fails.length === 0) console.log('  导出面 / 卡牌行为 / 敌人 / 编制 / 常量：全部对齐 ✓');
  else {
    console.log('  ' + fails.length + ' 处不一致 ✗（最多列 30 条）');
    fails.slice(0, 30).forEach((f) => console.log('   - ' + f));
    process.exitCode = 1;
  }
})().catch((e) => {
  console.error('审计脚本自身出错：', e && e.stack ? e.stack.split('\n').slice(0, 8).join('\n') : e);
  process.exitCode = 2;
});
