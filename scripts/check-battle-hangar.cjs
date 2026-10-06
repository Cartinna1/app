'use strict';
/* ============================================================================
   P6 验收：机库（卡库聚合 / 舰队视图 / 编成守卫 / reducer 不许动出征舰队 / 内部标签模型）
   用法：node --import ./scripts/register-ts.mjs scripts/check-battle-hangar.cjs
   为什么测这些：机库是全新 UI（没有 DEMO 可对拍），组件渲染验证不了，
   但"能不能编、显示什么数字、点了会不会出错"全在纯函数与 reducer 守卫里 —— 那是可判定的。
   重点盯三条既有口径：① 编成按**份数** ② 每队上限 30（唯一来源 tuning） ③ **出征中的舰队一个字都不许动**
   ＋ ④ 机库拆成四个内部标签后新加的派生模型（总览数字 / 船坞概况 / "下一步该去哪"的引导）
   ============================================================================ */
const fails = [];
const check = (ok, label, detail) => {
  if (ok) console.log('  ✓ ' + label);
  else { fails.push(label + (detail ? ' → ' + detail : '')); console.log('  ✗ ' + label + (detail ? '  → ' + detail : '')); }
};
const J = (v) => JSON.stringify(v);

(async () => {
  const { gameReducer, createInitialGameState } = await import('@/hooks/gameReducer');
  const H = await import('@/lib/battle/hangar');
  const fleetsMod = await import('@/data/battle/fleets');
  const { BATTLE_TUNING } = await import('@/data/battle/tuning');

  const need = ['libraryRows', 'fleetRows', 'canAddShip', 'canRemoveShip', 'canDeleteFleet', 'canToggleDefending', 'hangarSummary', 'hangarOverview', 'hangarGuide'];
  const missing = need.filter((k) => typeof H[k] !== 'function');
  if (missing.length) { console.error('hangar.ts 缺少导出：' + missing.join(', ') + '（现有：' + Object.keys(H).join(', ') + '）'); process.exit(2); }

  const D = (st, a) => gameReducer(st, a);
  const CAP = BATTLE_TUNING.fleetSize;
  /** 造一个"有 n 支舰队、卡库=给定多重集"的状态 */
  const build = (lib, fleetSpecs) => {
    let st = { ...createInitialGameState(), cardLibrary: lib.slice() };
    for (let i = 0; i < fleetSpecs.length; i++) st = D(st, { type: 'CREATE_BATTLE_FLEET' });
    fleetSpecs.forEach((ships, i) => {
      for (const id of ships) st = D(st, { type: 'ADD_SHIP_TO_FLEET', fleetId: st.fleets[i].id, shipId: id });
    });
    return st;
  };

  // ---------- ① 卡库聚合 ----------
  console.log('\n[1] 卡库聚合（按份数：owned / assigned / available）');
  {
    check(H.libraryRows(createInitialGameState()).length === 0, '空卡库 → 没有行');
    const st = build(['h1', 'h1', 'c1'], [['h1']]);
    const rows = H.libraryRows(st);
    check(rows.length === 2, '同型多份聚合成一行（2 种卡）', String(rows.length));
    const h1 = rows.find((r) => r.id === 'h1');
    const c1 = rows.find((r) => r.id === 'c1');
    check(h1.owned === 2 && h1.assigned === 1 && h1.available === 1, 'h1：持有 2 / 已编 1 / 可编 1', J({ o: h1.owned, a: h1.assigned, v: h1.available }));
    check(c1.owned === 1 && c1.assigned === 0 && c1.available === 1, 'c1：持有 1 / 已编 0 / 可编 1');
    check(typeof h1.name === 'string' && h1.name.length > 0 && typeof h1.series === 'string' && typeof h1.rarity === 'string', '行里带名字/系列/稀有度');
    check(typeof h1.atk === 'number' && typeof h1.shield === 'number' && typeof h1.structure === 'number' && typeof h1.cost === 'number', '行里带攻/盾/体/费');
    check(typeof h1.text === 'string' && h1.text.length > 0, '行里带技能文案（机库要靠它显示，手机端无 hover）');
    // ⚠ AGENTS 第五节：列表图必须走缩略图
    check(typeof h1.artSrc === 'string' && h1.artSrc.indexOf('/battle/thumbs/units/') === 0, '图位走缩略图 /battle/thumbs/units/...', h1.artSrc);
    // 排序稳定性：系列 → 费用 → id
    const keys = rows.map((r) => [r.series, r.cost, r.id]);
    const sorted = keys.slice().sort((a, b) => (a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : a[1] - b[1] || (a[2] < b[2] ? -1 : a[2] > b[2] ? 1 : 0)));
    check(J(keys) === J(sorted), '排序稳定（系列 → 费用 → id）', J(keys));
    check(J(H.libraryRows(st)) === J(rows), '同一状态重复调用结果一致');
  }

  // ---------- ② 舰队视图 ----------
  console.log('\n[2] 舰队视图（按型聚合 / 容量 / 出征标记）');
  {
    const st = build(['h1', 'h1', 'c1', 'c1'], [['h1', 'c1'], ['h1']]);
    const rows = H.fleetRows(st);
    check(rows.length === 2, '两支舰队两行', String(rows.length));
    const f0 = rows[0];
    check(f0.total === 2 && f0.capacity === CAP && f0.capacityLeft === CAP - 2, `第一队 2/${CAP}，余 ${CAP - 2}`, J({ t: f0.total, c: f0.capacity }));
    check(f0.members.length === 2 && f0.members[0].id === 'h1' && f0.members[0].count === 1 && f0.members[1].id === 'c1', '成员按型聚合且保持首次出现顺序', J(f0.members.map((m) => [m.id, m.count])));
    check(f0.members[0].artSrc.indexOf('/battle/thumbs/units/') === 0, '成员图位走缩略图');
    check(f0.onExpedition === false && f0.canEdit === true, '没出征 → 可编辑');
    // 出征标记
    let e = D(st, { type: 'START_EXPEDITION', bossId: 'b1', fleetId: st.fleets[0].id, turns: 3 });
    const rows2 = H.fleetRows(e);
    check(rows2[0].onExpedition === true && rows2[0].canEdit === false, '出征中的舰队 onExpedition=true 且 canEdit=false');
    check(rows2[1].onExpedition === false && rows2[1].canEdit === true, '另一队不受影响');
    // 满队
    const big = []; for (let i = 0; i < CAP + 3; i++) big.push('c1');
    const full = build(big, [big.slice(0, CAP)]);
    check(H.fleetRows(full)[0].total === CAP && H.fleetRows(full)[0].capacityLeft === 0, `编满 ${CAP} 艘后余量为 0`);
  }

  // ---------- ③ 编成守卫（can* 的 reason 要给玩家看） ----------
  console.log('\n[3] 编成守卫（能不能编 + 中文原因）');
  {
    const st = build(['h1', 'c1'], [['h1']]);
    const f0 = st.fleets[0].id, f1 = D(st, { type: 'CREATE_BATTLE_FLEET' }).fleets[1].id;
    check(H.canAddShip(st, f0, 'c1').ok === true, '卡库有 1 份可编 → 可以编');
    check(H.canAddShip(st, f1, 'h1').ok === false, 'h1 的唯一 1 份已编进另一队 → 不能再编', H.canAddShip(st, f1, 'h1').reason);
    check(typeof H.canAddShip(st, f1, 'h1').reason === 'string' && H.canAddShip(st, f1, 'h1').reason.length > 0, '被拒时给出中文原因');
    check(H.canAddShip(st, f0, '不存在的卡').ok === false, '卡库没有的卡不能编');
    // 满队
    const big = []; for (let i = 0; i < CAP + 2; i++) big.push('c1');
    const full = build(big, [big.slice(0, CAP)]);
    check(H.canAddShip(full, full.fleets[0].id, 'c1').ok === false, `队满 ${CAP} 不能再编`, H.canAddShip(full, full.fleets[0].id, 'c1').reason);
    // 出征中：全部动作都不许
    const e = D(st, { type: 'START_EXPEDITION', bossId: 'b1', fleetId: f0, turns: 3 });
    check(H.canAddShip(e, f0, 'c1').ok === false, '出征中不能编入', H.canAddShip(e, f0, 'c1').reason);
    check(H.canRemoveShip(e, f0, 'h1').ok === false, '出征中不能卸下', H.canRemoveShip(e, f0, 'h1').reason);
    check(H.canDeleteFleet(e, f0).ok === false, '**出征中不能删除舰队**（删了会停在 0 回合永不开战）', H.canDeleteFleet(e, f0).reason);
    check(H.canToggleDefending(e, f0).ok === false, '出征中不能打防守标签', H.canToggleDefending(e, f0).reason);
    check(H.canRemoveShip(st, f0, 'c1').ok === false, '队里没有的型不能卸', H.canRemoveShip(st, f0, 'c1').reason);
    check(H.canDeleteFleet(st, f0).ok === true && H.canToggleDefending(st, f0).ok === true, '没出征时删除/打标签都允许');
  }

  // ---------- ④ reducer 守卫：点了也不许改（P3 遗留的空档） ----------
  console.log('\n[4] reducer 守卫（出征舰队：派发了也不许改状态）');
  {
    const st = build(['h1', 'h1', 'c1'], [['h1'], ['c1']]);
    const away = st.fleets[0].id, here = st.fleets[1].id;
    const e = D(st, { type: 'START_EXPEDITION', bossId: 'b1', fleetId: away, turns: 3 });
    const snap = J({ lib: e.cardLibrary, fleets: e.fleets, exp: e.expedition });
    for (const [label, action] of [
      ['删除出征舰队', { type: 'DELETE_BATTLE_FLEET', fleetId: away }],
      ['改出征舰队名', { type: 'RENAME_BATTLE_FLEET', fleetId: away, name: 'X' }],
      ['给出征舰队编入', { type: 'ADD_SHIP_TO_FLEET', fleetId: away, shipId: 'h1' }],
      ['从出征舰队卸下', { type: 'REMOVE_SHIP_FROM_FLEET', fleetId: away, shipId: 'h1' }],
      ['给出征舰队打防守标签', { type: 'TOGGLE_FLEET_DEFENDING', fleetId: away }],
    ]) {
      const after = D(e, action);
      check(J({ lib: after.cardLibrary, fleets: after.fleets, exp: after.expedition }) === snap, '征中：' + label + ' → 状态不变');
      check(after === e, '征中：' + label + ' → 直接返回原对象（没有多余渲染）');
    }
    // 正常舰队照常可动（避免"守卫写成一律拒绝"）
    const renamed = D(e, { type: 'RENAME_BATTLE_FLEET', fleetId: here, name: '留守队' });
    check(renamed.fleets[1].name === '留守队', '非出征舰队改名照常生效');
    const toggled = D(e, { type: 'TOGGLE_FLEET_DEFENDING', fleetId: here });
    check(toggled.fleets[1].defending === true, '非出征舰队打防守标签照常生效');
    const added = D(e, { type: 'ADD_SHIP_TO_FLEET', fleetId: here, shipId: 'h1' });
    check(added.fleets[1].shipIds.length === 2, '非出征舰队编入照常生效');
    const removed = D(added, { type: 'REMOVE_SHIP_FROM_FLEET', fleetId: here, shipId: 'h1' });
    check(removed.fleets[1].shipIds.length === 1, '非出征舰队卸下照常生效');
    const del = D(removed, { type: 'DELETE_BATTLE_FLEET', fleetId: here });
    check(del.fleets.length === 1, '非出征舰队删除照常生效');
    check(del.cardLibrary.length === 3, '删除舰队**不动卡库**（船回到卡库而不是消失）', String(del.cardLibrary.length));
  }

  // ---------- ⑤ 概览 ----------
  console.log('\n[5] 机库概览');
  {
    const st = build(['h1', 'h1', 'c1'], [['h1'], ['c1']]);
    const s = H.hangarSummary(st);
    check(s.cardTypes === 2 && s.totalShips === 3, '卡库：2 种 / 3 艘', J(s));
    check(s.fleetCount === 2 && s.assignedShips === 2, '舰队 2 支 / 已编 2 艘');
    const e = D(st, { type: 'START_EXPEDITION', bossId: 'b1', fleetId: st.fleets[0].id, turns: 2 });
    check(H.hangarSummary(e).fleetCount === 2, '出征中舰队仍计入概览');
  }

  // ---------- ⑥ 内部四个标签的派生模型（总览 / 引导） ----------
  //  拆标签后新加的两个纯函数：`hangarOverview`（总览标签的数字与船坞概况）与
  //  `hangarGuide`（"下一步该去哪"）。组件渲染验证不了，但"引导指向哪个标签、说了什么"
  //  是可判定的 —— 而它正好是"卡库为空 → 去船坞 / 有船没编队 → 去编队"这条新手路径的唯一出口。
  console.log('\n[6] 内部标签模型（总览数字 / 船坞概况 / 下一步引导）');
  {
    // 空卡库 + 没殖民地（= 也没有船坞）→ 引导去船坞，且是"连船坞都没有"那一类
    const empty = createInitialGameState();
    const g0 = H.hangarGuide(empty);
    check(g0.tab === 'shipyard' && g0.label === H.HANGAR_TAB_LABEL.shipyard, '空卡库 → 引导去船坞', J(g0));
    check(g0.kind === 'no_dock', '空卡库 + 没船坞 → 引导文案写"先把船坞建起来"', g0.text);
    check(/船坞/.test(g0.text) && g0.text.length > 0, '引导文案里点名了目标标签', g0.text);

    // 有船没编队 → 引导去编队（"兵在手上却没上阵"）
    const idle = build(['h1', 'c1'], []);
    const g1 = H.hangarGuide(idle);
    check(g1.tab === 'fleet' && g1.kind === 'need_assign', '有船没编队 → 引导去编队', J(g1));
    check(g1.text.indexOf('2 艘') >= 0, '引导里报出卡库艘数（2 艘）', g1.text);

    // 有编制 → ready（中性状态，仍指向编队做微调）
    const ready = build(['h1', 'c1'], [['h1']]);
    const g2 = H.hangarGuide(ready);
    check(g2.kind === 'ready' && g2.tab === 'fleet', '已有编制 → ready', J(g2));

    // 四个标签的中文名各一份（标签栏与引导共读这张表，不许两边各写一套）
    check(
      H.HANGAR_TAB_LABEL.overview === '总览' && H.HANGAR_TAB_LABEL.library === '卡库' &&
        H.HANGAR_TAB_LABEL.shipyard === '船坞' && H.HANGAR_TAB_LABEL.fleet === '编队',
      '四个标签的中文名 = 总览 / 卡库 / 船坞 / 编队（唯一真值）',
      J(H.HANGAR_TAB_LABEL)
    );

    // 总览派生的数字与 shipyard.dockLevelText 同源（不写第二份等级名）
    const ov = H.hangarOverview(idle);
    check(ov.summary.totalShips === 2 && ov.summary.fleetCount === 0 && ov.summary.assignedShips === 0, '总览数字与 hangarSummary 一致', J(ov.summary));
    check(ov.dockLevel === 0 && ov.dockText === '未建造船坞', '没船坞 → dockText = 未建造船坞（读 shipyard.dockLevelText）', ov.dockText);
    check(ov.building === 0 && ov.currentCardName === null && ov.queueTotal === 0, '空队列：在建 0 / 无在造卡型 / 队列 0 项', J(ov));
    check(ov.guide.tab === g1.tab && ov.guide.text === g1.text, '总览里的引导与 hangarGuide 同一份');

    // 队列：2 艘开工 + 1 项排队 → 在建 2 / 队列 3 项 / 在造的是第一项
    const q = [{ cardId: 'h1', active: true, turnsLeft: 1, cost: { gold: 1600, alloy: 16, materials: {} } },
               { cardId: 'c1', active: true, turnsLeft: 1, cost: { gold: 1600, alloy: 16, materials: {} } },
               { cardId: 'h1', active: false, turnsLeft: 1, cost: { gold: 1600, alloy: 16, materials: {} } }];
    const ov2 = H.hangarOverview({ ...idle, buildQueue: q });
    check(ov2.building === 2 && ov2.queueTotal === 3, '在建 2 艘 / 队列 3 项（遍历完整队列，不截断）', J({ b: ov2.building, t: ov2.queueTotal }));
    check(typeof ov2.currentCardName === 'string' && ov2.currentCardName.length > 0, '在造卡型给出名字（不是内部 id）', ov2.currentCardName);
    check(ov2.currentCardName !== 'h1', '在造卡型渲染的是卡名而不是 cardId', ov2.currentCardName);
  }

  console.log('\n=== P6 验收结果 ===');
  if (fails.length === 0) console.log('  全部通过 ✓');
  else { console.log('  ' + fails.length + ' 条失败 ✗'); process.exitCode = 1; }
})().catch((e) => {
  console.error('验收脚本自身出错：', e && e.stack ? e.stack.split('\n').slice(0, 10).join('\n') : e);
  process.exitCode = 2;
});
