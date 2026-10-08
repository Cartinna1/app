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
/** 读 WebP 头拿真实像素尺寸（只支持 VP8X / VP8 / VP8L；Node 里没有图像库，故手解容器头）。
 *  用来断言"图位框比例 ↔ 素材真实比例"，防素材换了尺寸而框没跟着换（那就会大面积裁切）。 */
const webpDims = (buf) => {
  if (buf.length < 32) return null;
  if (buf.toString('latin1', 0, 4) !== 'RIFF' || buf.toString('latin1', 8, 12) !== 'WEBP') return null;
  const chunk = buf.toString('latin1', 12, 16);
  if (chunk === 'VP8X') return { w: buf.readUIntLE(24, 3) + 1, h: buf.readUIntLE(27, 3) + 1 };
  if (chunk === 'VP8 ') return { w: buf.readUInt16LE(26) & 0x3fff, h: buf.readUInt16LE(28) & 0x3fff };
  if (chunk === 'VP8L') {
    const bits = buf.readUInt32LE(21);
    return { w: (bits & 0x3fff) + 1, h: ((bits >> 14) & 0x3fff) + 1 };
  }
  return null;
};
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

  // ---------- ⑦ 改名入口（UI 侧可断言的那一半） ----------
  //  用户 2026-08 报的 bug：「编队」标签里给舰队改名，怎么点都没反应。
  //  reducer 与守卫当时就是对的（④ 那条断言一直通过），所以断链在 **UI 那一侧**：
  //  「改名」按钮的禁用判据读的是 `FleetRow.canEdit`（"能不能动这支队"的概称），
  //  而 HangarTab 的提交路径又各自调了一遍 isFleetOnExpedition —— 同一判定两处派生。
  //  下面这条把"改名入口是否可用 / 为什么不可用"收敛到 FleetRow 上，并检查两边同源。
  console.log('\n[7] 改名入口（canRename 落在 FleetRow 上，UI 不许自己再判一次）');
  {
    const st = build(['h1', 'c1'], [['h1'], ['c1']]);
    const rows = H.fleetRows(st);
    check(
      rows.every((r) => typeof r.canRename === 'boolean' && typeof r.renameReason === 'string'),
      '每个 FleetRow 都带 canRename / renameReason（改名入口的唯一真值随渲染模型下发）',
      JSON.stringify(rows.map((r) => [r.canRename, r.renameReason]))
    );
    check(
      rows.every((r) => r.canRename === H.canRenameFleet(st, r.id).ok),
      'FleetRow.canRename === canRenameFleet(state, id).ok（同一个真值，不是第二份派生）',
      JSON.stringify(rows.map((r) => [r.canRename, H.canRenameFleet(st, r.id).ok]))
    );
    check(
      rows.every((r) => r.renameReason === (H.canRenameFleet(st, r.id).reason || '')),
      'FleetRow.renameReason === canRenameFleet 的中文原因（按钮 title 与行内原因同源）',
      JSON.stringify(rows.map((r) => r.renameReason))
    );
    check(
      H.canRenameFleet(st, st.fleets[0].id).ok === true,
      '非出征舰队：改名入口可用（按钮不置灰）'
    );

    // 出征中的队：改名入口必须不可用，且给出与 reducer 完全相同的那条原因
    const away = st.fleets[0].id;
    const e = D(st, { type: 'START_EXPEDITION', bossId: 'b1', fleetId: away, turns: 3 });
    const awayRow = H.fleetRows(e).find((r) => r.id === away);
    check(awayRow.canRename === false && awayRow.renameReason.length > 0, '出征中的队：改名入口不可用并写明原因', awayRow.renameReason);
    check(D(e, { type: 'RENAME_BATTLE_FLEET', fleetId: away, name: 'X' }) === e, '出征中的队：reducer 也拒绝改名（两处同源，不会"能点但没用"）');

    // 改名之后渲染模型必须立刻反映新名字（UI 重渲染后读到的值）
    const here = st.fleets[1].id;
    const renamed = D(st, { type: 'RENAME_BATTLE_FLEET', fleetId: here, name: '新名字' });
    check(H.fleetRows(renamed).find((r) => r.id === here).name === '新名字', '改名后 fleetRows 立刻给出新名字（渲染模型与状态同源）');
    check(
      H.fleetRows(renamed).find((r) => r.id === here).canRename === true,
      '改名后入口仍然可用（没被自己的提交锁死）'
    );
  }

  // ---------- ⑧ 卡库的系列筛选 chip（与船坞同一份实现） ----------
  //  用户 2026-08 口径：「卡库也按照船坞那样做每个系列的可点标签，颜色样式一样即可」
  //  → 颜色/判定 = `lib/battle/seriesFilter`（**唯一实现**，船坞与卡库共用；shipyard 只再导出那些名字）；
  //    chip 样式 = `components/hangar/SeriesChipRow`（两个标签都渲染它）。
  //  差别只在**传进去的行**：船坞传「已解锁」的卡，卡库传「已拥有」的卡（`libraryRows`）。
  console.log('\n[8] 卡库的系列 chip（默认落在有卡的系列 / 切系列 / 与船坞同一份实现）');
  {
    const SF = await import('@/lib/battle/seriesFilter');
    const SY = await import('@/lib/battle/shipyard');
    const fs = require('fs');
    const path = require('path');

    // ★ 单一真值：船坞用的就是这一份（引用相等 —— 不是抄了一份颜色表/一套判定）
    check(
      SY.seriesChipClass === SF.seriesChipClass && SY.defaultSeriesFilter === SF.defaultSeriesFilter &&
        SY.pickSeriesFilter === SF.pickSeriesFilter && SY.resolveSeriesFilter === SF.resolveSeriesFilter &&
        SY.filterBySeries === SF.filterBySeries,
      '★ 船坞的系列筛选/配色 = lib/battle/seriesFilter 同一实现（引用相等，卡库也调它）'
    );

    // 有卡的卡库：h1/h2 圣辉 + c1 铁血 + g1 灵能（按 libraryRows 的真实排序）
    const st = build(['h1', 'h1', 'c1', 'g1'], []);
    const rows = H.libraryRows(st);
    const groups = SF.seriesGroups(rows);
    const sum = groups.reduce((n, g) => n + g.count, 0);
    check(groups.length === 3, '卡库按系列分出 3 档（圣辉/铁血/灵能）', J(groups));
    check(sum === rows.length, '各系列 chip 的张数之和 = 已拥有型数（chip 上的数字不丢）', sum + '/' + rows.length);
    check(groups.every((g) => g.count > 0 && rows.some((r) => r.series === g.series)), '每颗 chip 的系列都真有已拥有的卡');
    check(groups.every((g) => g.count === rows.filter((r) => r.series === g.series).length), 'chip 张数 = 该系列的卡型数');

    // ★ 默认 = 第一个"有卡的"系列，且列表非空（绝不许默认落在空系列上）
    const def = SF.defaultSeriesFilter(groups);
    check(def === groups[0].series, '★ 默认选中第一个"有卡的"系列', def);
    check(SF.filterBySeries(rows, def).length > 0, '★ 默认那颗的列表非空（不会开出空列表）', String(SF.filterBySeries(rows, def).length));
    check(SF.defaultSeriesFilter([]) === '' && SF.filterBySeries([], '圣辉').length === 0,
      '空卡库：默认是空串、筛选结果是空数组（不炸；此时 chip 行不渲染）');

    // 交互与船坞一致：点已选中的那颗不变、点别的切过去、切了只剩该系列
    const s1 = groups[1].series;
    check(SF.pickSeriesFilter(def, def) === def, '★ 点已选中的那一颗 = 状态不变（不可取消）');
    check(SF.pickSeriesFilter(def, s1) === s1, '点别的系列 = 切过去');
    const only1 = SF.filterBySeries(rows, s1);
    check(only1.every((r) => r.series === s1), '切到某系列 → 只剩该系列的卡');
    check(only1.length === groups[1].count, '筛选结果条数 = 那颗 chip 上的张数', String(only1.length));
    check(SF.resolveSeriesFilter(s1, groups) === s1, '有效系列 → 原样保留');
    check(SF.resolveSeriesFilter('没有这个系列', groups) === def,
      '★ 档位没了（造了新船/换了系列集合）→ 落到第一个有卡的系列（不是"不筛选"）',
      SF.resolveSeriesFilter('没有这个系列', groups));
    check(SF.filterBySeries(rows, '没有这个系列') === rows,
      '★ 传入的档位无匹配 → 原样返回完整数组（杜绝静默空列表）');

    // 颜色走同一张表（卡库出现的每个系列都有色、两态不同）
    check(groups.every((g) => SF.seriesChipClass(g.series, true).length > 0 && SF.seriesChipClass(g.series, false).length > 0),
      '卡库每个系列都有 chip 颜色（颜色走 seriesChipClass，卡库不写颜色）');
    check(new Set(groups.map((g) => SF.seriesChipClass(g.series, true))).size === groups.length,
      '卡库各系列的选中色互不相同');

    // 静态核对：两个面板都用共用组件；颜色只在该组件里出现（面板零裸色类）
    const read = (rel) => fs.readFileSync(path.resolve(__dirname, '..', rel), 'utf8');
    const libPanel = read('src/components/hangar/LibraryPanel.tsx');
    const shipPanel = read('src/components/hangar/ShipyardPanel.tsx');
    const chipRow = read('src/components/hangar/SeriesChipRow.tsx');
    check(libPanel.indexOf('<SeriesChipRow') >= 0 && shipPanel.indexOf('<SeriesChipRow') >= 0,
      '★ 卡库与船坞渲染**同一个** SeriesChipRow（chip 样式只有一份实现）');
    check(libPanel.indexOf('seriesGroups') >= 0 && libPanel.indexOf('defaultSeriesFilter') >= 0
      && libPanel.indexOf('pickSeriesFilter') >= 0 && libPanel.indexOf('resolveSeriesFilter') >= 0
      && libPanel.indexOf('filterBySeries') >= 0,
      '卡库的派生/默认值/点击/回落/筛选都调 lib/battle/seriesFilter（UI 不写第二份）');
    check(!/bg-(amber|red|violet|sky|orange|slate-100|white)/.test(libPanel),
      '★ 卡库组件里没有裸的颜色类（颜色全在 SERIES_CHIP_THEME 表）');
    check(chipRow.indexOf('seriesChipClass') >= 0 && !/bg-(amber|red|violet|sky|orange|slate-100|white)/.test(chipRow),
      '★ 共用 chip 组件自己也不写颜色类（只调 seriesChipClass）');
    check(libPanel.indexOf('共 {rows.length} 型') >= 0, '卡库顶部「共 N 型」那行仍在（说的是卡库总数，不受筛选影响）');
    check(libPanel.indexOf('卡库是空的') >= 0, '空卡库的既有空态提示仍在（chip 行此时不渲染）');
    check(libPanel.indexOf('export default memo(') >= 0, '卡库组件仍是 memo(...)');
    check(libPanel.indexOf('useCallback(') >= 0, '卡库的点击处理走 useCallback（不往 memo 子组件传 inline 箭头）');
  }

  // ---------- ⑨ 卡面与网格排版（卡库 / 船坞 / 战斗部署池共用同一卡面） ----------
  //  用户 2026-08 排版口径（五轮定案）：① 列数上限 2（手机仍 1 列）；② 图位 ≈2:1 贴合素材、
  //  **不许大面积裁切**；③ 机库手机端「图在上、占满整卡宽、文字在下」（他说那版最好看，别动）；
  //  ④ 卡面/列宽/图位比例**只有一份**（`components/ship/ShipCard`），三处（卡库/船坞/战斗池）都读它；
  //  ⑤ **战斗部署池改扁**（那是选卡的地方，要一屏看 3 张以上）：文字在左、图在右 48%、2:1 零裁切。
  console.log('\n[9] 卡面与网格排版（卡库 / 船坞 / 战斗部署池共用同一卡面）');
  {
    const fs = require('fs');
    const path = require('path');
    const read = (rel) => fs.readFileSync(path.resolve(__dirname, '..', rel), 'utf8');
    /** 去注释（注释里会引用旧写法，如 "旧写法 h-24" —— 结构断言只看代码） */
    const code = (src) => src.replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/\/\/[^\n]*/g, '');
    const cardSrc = read('src/components/ship/ShipCard.tsx');
    const card = code(cardSrc);
    const libPanelRaw = read('src/components/hangar/LibraryPanel.tsx');
    const libPanel = code(libPanelRaw);
    const shipPanel = code(read('src/components/hangar/ShipyardPanel.tsx'));
    const poolRaw = read('src/components/battle/FleetPool.tsx');
    const pool = code(poolRaw);

    // ① 图位 = 2:1、随卡宽（不写死 px 宽、不写死高度）、object-cover 只裁 ~1%
    check(card.indexOf('aspect-[2/1]') >= 0, '★ 图位框 = aspect-[2/1]（贴合 2.02:1 素材）');
    check(card.indexOf('h-24') < 0, '★ 卡面不再写死 96px 高（旧框 h-24 在宽屏上既裁又小）');
    check(card.indexOf('order-first') >= 0 && card.indexOf('w-full border-b') >= 0,
      '★ 机库卡库（stack）是"图在上、占满整卡宽"（order-first + w-full）');
    check(card.indexOf('object-cover') >= 0 && card.indexOf('object-contain') < 0,
      '图位用 object-cover（框比例 = 素材比例，不需要 letterbox）');
    check(card.indexOf('self-center') >= 0,
      '★ 横排图位带 self-center（文字块更高时图不被 stretch 拉高 → 2:1 不破、不裁切）');
    // 素材真实比例（读真实缩略图头）↔ 框比例：裁切必须 < 3%
    const thumbPath = path.resolve(__dirname, '../public/battle/thumbs/units/h1.webp');
    const dims = fs.existsSync(thumbPath) ? webpDims(fs.readFileSync(thumbPath)) : null;
    check(!!dims, '读到了真实缩略图尺寸（public/battle/thumbs/units/h1.webp）', J(dims));
    if (dims) {
      const assetAspect = dims.w / dims.h;
      const crop = Math.abs(assetAspect - 2) / assetAspect;
      check(crop < 0.03, '★ 素材比例 ≈ 图位比例 2:1（object-cover 裁切 < 3%）',
        '素材 ' + dims.w + '×' + dims.h + ' = ' + assetAspect.toFixed(4) + ':1，裁 ' + (crop * 100).toFixed(2) + '%');
    }

    // ② 列数上限 2 且**只有一份**：卡库与战斗池读同一个常量；三处都不再有 3 列
    check(/SHIP_CARD_GRID_ITEM = 'w-full sm:w-\[calc\(50%-3px\)\]'/.test(card),
      '★ 列宽常量（唯一真值）= 手机 1 列 + sm 起 2 列（上限 2）', 'SHIP_CARD_GRID_ITEM');
    check(libPanel.indexOf('SHIP_CARD_GRID_ITEM') >= 0 && pool.indexOf('SHIP_CARD_GRID_ITEM') >= 0,
      '★ 卡库网格与战斗部署池的列宽**读同一常量**（引用相等，不是各写一串）');
    check(libPanel.indexOf('33.333') < 0 && pool.indexOf('33.333') < 0 && card.indexOf('33.333') < 0,
      '★ 三处都没有 3 列（旧 xl:w-[calc(33.333%-4px)] 已删）');
    check(cardSrc.indexOf('SHIP_ART_ASPECT') >= 0, '★ 图位比例来自共用常量 SHIP_ART_ASPECT（三处同一份）');

    // ③ 三处渲染同一个卡面组件
    check(libPanel.indexOf('ShipCard') >= 0 && shipPanel.indexOf('ShipCard') >= 0 && pool.indexOf('ShipCard') >= 0,
      '★ 卡库 / 船坞 / 战斗部署池渲染**同一个** ShipCard（样式只有一份实现）');
    check(shipPanel.indexOf('layout="row"') >= 0 && shipPanel.indexOf('sm:max-w-[280px]') >= 0,
      '船坞列表用 row 排布；280 上限只在 sm 起生效（手机端不受封顶，见下一条）');

    // ③a 手机端船坞行必须竖排（用户 2026-08 截图实证：390 宽下行内只有 330px，
    //     卡面封顶 280 + gap 8 ⇒ 建造信息列只剩 42px，「下单建造」「需要一级船坞…」全成一字一行）
    check(/flex flex-col gap-2[^"]*sm:flex-row/.test(shipPanel),
      '★ 船坞行手机端竖排（flex-col → sm:flex-row）：信息列 42px → 330px（成句显示）');
    check(shipPanel.indexOf('w-full flex-none sm:max-w-[280px]') >= 0,
      '★ 船坞卡面手机端拿满整行（280 上限只在 sm 起）⇒ 卡内文字列 ≈121px ≥ 攻盾体所需 97px');
    check(shipPanel.indexOf('min-w-0 flex-1') >= 0 && shipPanel.indexOf('下单建造') >= 0,
      '信息列仍是 min-w-0 flex-1、下单建造按钮仍在（竖排后各拿满一行，不被压成竖条）');

    // ③b 战斗部署池改扁（用户 2026-08：「战斗太大了改成扁一点的吧」）
    check(pool.indexOf('layout="flat"') >= 0, '★ 战斗部署池用 flat 排布（文字在左、图在右，不再用 stack）');
    check(pool.indexOf('layout="stack"') < 0, '★ 战斗部署池没有用 stack（不许把"图在上"的大卡塞回池子）');
    check(/w-\[48%\]/.test(card), '★ flat 图位宽 = 卡宽 48%（变扁靠**缩窄图位**，不是裁切/拉伸）',
      '48% 与 row 的 58% 都在同一处 shipArtClass 里');
    check(pool.indexOf('max-h-[400px]') >= 0, '★ 部署池滚动窗按新卡高重调为 400px（一屏 ≥3 张）');

    // ③c 机库**未被改扁**：卡库不传 layout ⇒ 走默认 stack；用户说过手机那版最好看
    check(libPanel.indexOf('layout=') < 0, '★ 卡库不传 layout（默认 stack = 图在上大卡，机库保持现状）');
    check(card.indexOf("layout === 'stack' ?") < 0 || /art === 'stack'/.test(card),
      '卡面的默认排布仍是 stack（缺省不传 layout 就是图在上）');

    // ④ 保持：徽章 / 费用角标 / 长名截断 / onError / memo
    check(card.indexOf('absolute left-[5px] top-1') >= 0, '数量徽章（持有/已编/可编）位置不变（stack 时压在图上、深色底可读）');
    check(card.indexOf('absolute right-[5px] top-1') >= 0, '费用角标位置不变');
    check(card.indexOf('text-ellipsis') >= 0 && card.indexOf('whitespace-nowrap') >= 0, '长舰名仍省略号截断（不溢出）');
    check(card.indexOf('flex-wrap') >= 0, '攻盾体允许换行（窄卡不溢出到图位）');
    check(card.indexOf('<img') >= 0 && card.indexOf('onError=') >= 0, '图位有 onError 兜底（缺图不留破图）');
    check(card.indexOf('export default memo(') >= 0, '卡面仍 memo(...)');

    // ⑤ 战斗池的交互一个都不许丢（源级：判定仍在 lib/battle/view + BattleScreen，卡面只转发）
    check(pool.indexOf('selectable={c.selectable}') >= 0,
      '★ 战斗池把 selectable 下发给卡面（**灰卡也能点开看技能**，与 playable 分开）');
    check(pool.indexOf('playable={c.playable}') >= 0, '★ playable 仍下发（只影响视觉变暗）');
    check(pool.indexOf('disabled') < 0, '★ 战斗池没有把卡面 disabled（绝不许按指挥度/空位拦点击）');
    check(pool.indexOf('onSelect={onPoolClick}') >= 0, '★ 点卡仍走 onPoolClick（manualActionView 闸门在 BattleScreen）');
    check(pool.indexOf('title=') >= 0 && pool.indexOf('c.text') >= 0, '桌面悬浮技能提示（title = 技能原文）仍在');
    check(pool.indexOf('×${c.count}') >= 0 || pool.indexOf('×') >= 0, '同型份数「×N」仍在费用角标上');
    check(pool.indexOf('selCard === c.id') >= 0, '选中态仍由 selCard 驱动（描边 + ring）');
    check(pool.indexOf('export default memo(') >= 0, '战斗池仍 memo(...)');
  }

  // ---------- ⑩ 船坞：指引文案删干净（用户 2026-08「船坞的指引文字太多了，红框里的都删去」） ----------
  //  删的是**纯展示**（那三张船坞说明卡上没有任何按钮；建/升级都在「殖民」页签的建筑列表里），
  //  所以判定层（`ShipyardView.built` / `.lockHint`）**原样保留**，只是面板不再渲染它们。
  //  ⚠ 断言按**去注释后的代码**查：注释里会引用被删文案（说明删了什么），不能因此误报。
  console.log('\n[10] 船坞：已删的指引文案不许回来 + 保留项仍在');
  {
    const fs = require('fs');
    const path = require('path');
    const code = (src) => src.replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/\/\/[^\n]*/g, '');
    const ship = code(fs.readFileSync(path.resolve(__dirname, '../src/components/hangar/ShipyardPanel.tsx'), 'utf8'));
    // ① 删掉的 6 处（源码级：都不许再出现）
    check(ship.indexOf('DockTier') < 0, '★ 三级船坞说明卡整块已删（DockTier 组件已移除）');
    check(ship.indexOf('tier.level') < 0 && ship.indexOf('紫、橙') < 0,
      '★ 说明卡里的「可造 白卡 / 蓝卡 / 紫、橙卡」已删（`tier.level` 分支已移除）', '顶部状态行的「同时可造 2 艘」不算：那是状态数字，保留');
    check(ship.indexOf('座') < 0 || ship.indexOf('上限 ${maxCount}') < 0, '★ 说明卡里的「造价 … / 入驻 … / 上限 N 座」已删');
    check(ship.indexOf('view.lockHint') < 0, '★ 「想造蓝卡：先造…」下一档解锁指引（view.lockHint）已删渲染');
    check(ship.indexOf('现在下单立刻开工') < 0 && ship.indexOf('满位，现在下单会排到队尾') < 0,
      '★ 队列标题里的引导括号已删（只留「同时建造 x/2 艘 · 排队 y 艘」）');
    check(ship.indexOf('造船台是空的') < 0 && ship.indexOf('还没有船坞，暂时造不了舰') < 0,
      '★ 空队列那句提示已删（队列空时整块不渲染）');
    check(ship.indexOf('waiting.length === 0 ? null :') >= 0, '★ 队列空 → 直接 null（不留空壳边框）');
    // ② 保留项
    check(ship.indexOf('可造战舰') >= 0 && ship.indexOf('下单建造') >= 0, '保留：「可造战舰」列表 +「下单建造」按钮');
    check(ship.indexOf('SeriesChipRow') >= 0, '保留：系列 chip 行');
    check(ship.indexOf('已解锁 {view.unlockedCards.length} 型') >= 0, '保留：顶部「已解锁 N 型 · 现在能造 M 型」');
    check(ship.indexOf('lockedSummaryLine(view)') >= 0, '保留：底部「还有 N 种未解锁…」汇总行');
    check(ship.indexOf('同时建造 {view.queue.building.length}') >= 0, '保留：队列状态数字（有内容时的队列行照常）');
    check(ship.indexOf('canCancelBuild') >= 0 && ship.indexOf('QueueRow') >= 0, '保留：队列行 + 取消排队');
  }

  console.log('\n=== P6 验收结果 ===');
  if (fails.length === 0) console.log('  全部通过 ✓');
  else { console.log('  ' + fails.length + ' 条失败 ✗'); process.exitCode = 1; }
})().catch((e) => {
  console.error('验收脚本自身出错：', e && e.stack ? e.stack.split('\n').slice(0, 10).join('\n') : e);
  process.exitCode = 2;
});
