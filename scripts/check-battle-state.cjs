'use strict';
/* ============================================================================
   P3 验收：卡牌战斗状态 + 存档三处同步
   用法：node --import ./scripts/register-ts.mjs scripts/check-battle-state.cjs
   覆盖：
     ① SAVE_VERSION=8 ② 新开局默认值 ③ **新开局与读档默认值必须一致**（AGENTS 反复踩的坑）
     ④ `battle` 不进存档 ⑤ 存档往返一致 ⑥ v2/v3/v5/v6/v7 旧档能读入且拿到默认值
        （含 v4 造船队列、v6 老巢账本、v7→v8 掠夺收尾快照的结构迁移）
     ⑦ 舰队不变量（**按份数**：编入份数≤卡库份数 / 每队 30 / 同型可拆分 / 出征队不能打防守标签 / 同时只能 1 个出征）
     ⑧ reducer 不 mutate prev（快照比对）  ⑨ cloneBattleState 深拷贝
     ⑩ END_BATTLE 写回永久损失（**按份**），且**掠夺战与出征战收尾不同**（V1.5 §10.1 出征 vs §10.2 掠夺）
   构造改动（v5 掠夺两段窗口，**断言逐条等价、只跟着新字段走**）：
     · EMPTY_RAID / 各处手写的 raid 字面量补上 `arrivedTurns: 0, arrived: false`（否则读数会带上 undefined）；
     · `SAVE_VERSION = 4` → `5`（唯一真值就是 lib/save.ts 的常量，期望值必须跟着版本走）；
     · 顶部覆盖清单里 ① 的说明同步改成 5。
   构造改动（v6 已打败的老巢账本，用户 2026-08 裁定）：
     · `SAVE_VERSION = 5` → `6`；新增 `defeatedLairs` 的四处断言（新开局空 / 新开局↔读档一致 /
       存档往返 / 旧档兜底成 `[]`）——**都是"只新增字段"的等价断言，不改既有任何一条**。
   构造改动（v7 掠夺战利品快照，用户 2026-08 裁定「把奖励显著地显示出来」）：
     · `SAVE_VERSION = 6` → `7`；新增 `lastRaidSettlement` 的四处断言（新开局 null / 新开局↔读档一致 /
       存档往返 / v6 旧档兜底成 `null`）——**都是"只新增字段"的等价断言，不改既有任何一条**。
       写入 / 清空时机在 reducer 侧（`END_BATTLE` 写、`START_RAID` 清），由 check-battle-raid 的 [11] 覆盖。
   构造改动（v8 掠夺收尾快照，用户 2026-08 追加裁定「**失败也要显示丢了啥**」）：
     · `SAVE_VERSION = 7` → `8`；字段 `lastRaidReward` **改名扩形**成 `lastRaidSettlement`
       （`{ text, kind }` → `{ outcome: 'win'|'lost', text, awardText, loot }`）。
       **这是 v2 以来第一个真正的字段级结构改写**，故新增 [5e]：v7 旧档（只有旧字段）必须能按 `win`
       转进新形状；[5d] 改为"两个键都没有 → null"。打赢那份的往返断言**逐字等价**（只改字段名）。
   口径说明（踩过的坑）：
     · 损失是**按份**的：同型 2 份损失 1 份 → 卡库与舰队各少 1 份，幸存的那份留在舰队里。
       所以不能断言"舰队里不再出现该 cardId"（那是按卡 id 整类清除，会多删）。
     · V1.5 §10.1「一船同一时间只能编入一个舰队」按**份数**表达：卡库 1 份 → 编进 A 后不能再编 B；
       卡库 2 份 → 可一队一份。
   ============================================================================ */
const fails = [];
const check = (ok, label, detail) => {
  if (ok) console.log('  ✓ ' + label);
  else { fails.push(label + (detail ? ' → ' + detail : '')); console.log('  ✗ ' + label + (detail ? '  → ' + detail : '')); }
};
const J = (v) => JSON.stringify(v);
const eq = (a, b) => J(a) === J(b);

(async () => {
  const { gameReducer, createInitialGameState } = await import('@/hooks/gameReducer');
  const { buildSaveData, stateFromSave, migrateSave, SAVE_VERSION } = await import('@/lib/save');
  const E = await import('@/lib/battle/engine');
  const fleetsMod = await import('@/data/battle/fleets');

  const DISPATCH = (st, action) => gameReducer(st, action);
  const EMPTY_RAID = { inTurns: null, arrivedTurns: 0, immuneTurns: 0, raiders: 0, arrived: false };
  /** 把一场战斗用 autoTurn 打到结束（走 reducer 的 BATTLE_ACTION，全程 clone） */
  const fight = (st) => {
    let s = st, n = 0;
    while (s.battle && !s.battle.over && n++ < 200) s = DISPATCH(s, { type: 'BATTLE_ACTION', action: { type: 'autoTurn' } });
    return s;
  };
  /** 建一支包含全部卡库的舰队（卡库必须先于编入赋值） */
  const fleetOfLibrary = (st, name) => {
    let s = DISPATCH(st, { type: 'CREATE_BATTLE_FLEET', name });
    for (const id of s.cardLibrary) s = DISPATCH(s, { type: 'ADD_SHIP_TO_FLEET', fleetId: s.fleets[s.fleets.length - 1].id, shipId: id });
    return s;
  };

  // ---------- ① 版本 ----------
  console.log('\n[1] 存档版本与新开局默认值');
  check(SAVE_VERSION === 8, 'SAVE_VERSION = 8（v6 = 老巢账本 defeatedLairs，v7 = 掠夺收尾快照，v8 = 赢/输同一形状）', '实际 ' + SAVE_VERSION);

  const init = createInitialGameState();
  check(Array.isArray(init.cardLibrary) && init.cardLibrary.length === 0, '新开局卡库为空（不赠送战舰）');
  check(Array.isArray(init.fleets) && init.fleets.length === 0, '新开局没有舰队');
  check(init.expedition === null, '新开局没有出征');
  check(eq(init.raid, EMPTY_RAID), '新开局掠夺状态为默认', J(init.raid));
  check(eq(init.defeatedLairs, []), '新开局"已打败的老巢"账本为空（v6 字段 = 一个都没打败）', J(init.defeatedLairs));
  check(init.lastRaidSettlement === null, '新开局没有掠夺收尾快照（v7 引入 / v8 扩形；旧档兜底 = null）', J(init.lastRaidSettlement));
  check(init.battle === null, '新开局没有进行中的战斗');
  check(Array.isArray(init.buildQueue) && init.buildQueue.length === 0, '新开局造船队列为空（v4 字段）');

  // ---------- ③ 新开局 ↔ 读档默认值一致 ----------
  console.log('\n[2] 新开局 与 读档默认值 必须一致（AGENTS 的坑）');
  const minimal = { saveVersion: 8, phase: 'playing', turn: 1, ships: init.ships };
  const fromSave = stateFromSave(minimal);
  for (const f of ['cardLibrary', 'fleets', 'expedition', 'raid', 'defeatedLairs', 'lastRaidSettlement', 'battle', 'buildQueue']) {
    check(eq(fromSave[f], init[f]), `stateFromSave 的 ${f} 与新开局一致`, J(fromSave[f]) + ' vs ' + J(init[f]));
  }

  // ---------- ④ battle 不进存档 ----------
  console.log('\n[3] battle 不进存档');
  const save = buildSaveData(init);
  check(!('battle' in save), 'buildSaveData 不含 battle');
  for (const f of ['cardLibrary', 'fleets', 'expedition', 'raid', 'defeatedLairs', 'lastRaidSettlement', 'buildQueue']) check(f in save, `buildSaveData 含 ${f}`);

  // ---------- ⑤ 存档往返 ----------
  console.log('\n[4] 存档往返（含卡库/舰队/出征/掠夺/老巢账本/造船队列）');
  const lib = fleetsMod.FLEET_STARTER.slice(0, 6);
  // ⚠ 卡库必须先赋值：编入校验要查卡库份数（放在循环之后会让舰队恒为空 → 出征往返变成空测）
  let st = { ...DISPATCH(init, { type: 'CREATE_BATTLE_FLEET', name: '测试队' }), cardLibrary: lib.slice() };
  for (const id of lib) st = DISPATCH(st, { type: 'ADD_SHIP_TO_FLEET', fleetId: st.fleets[0].id, shipId: id });
  check(st.fleets[0].shipIds.length === lib.length, '卡库里的舰都编入了（' + st.fleets[0].shipIds.length + '/' + lib.length + '）');
  st = DISPATCH(st, { type: 'START_EXPEDITION', bossId: 'b1', fleetId: st.fleets[0].id, turns: 5 });
  check(!!st.expedition, '出征已登记（往返才有意义）');
  // 掠夺状态往返：用**阶段 A**（预警中）的形状 —— 五个字段全给满，往返才能验到新字段
  st = { ...st, raid: { inTurns: 3, arrivedTurns: 0, immuneTurns: 7, raiders: 2, arrived: false } };
  // 已打败的老巢账本（v6）：手写两项（不靠打赢老巢，避免把"战斗胜负"混进存档往返这一条）
  st = { ...st, defeatedLairs: ['b1', 'b3'] };
  // 掠夺收尾快照（v7 引入 / v8 扩形）：**手写两份**，把"赢/输同一形状"两侧都过一遍存档往返
  // （不靠真的打一场掠夺战，避免把"发奖/扣损失"混进存档往返这一条）。
  st = { ...st, lastRaidSettlement: { outcome: 'win', text: '击退海盗：缴获 10 星尘', awardText: '击退海盗：缴获 10 星尘', loot: { gold: 0, stardust: 0, materials: {} } } };
  // 打输那份另用一个独立 state 单独往返（含 loot 实扣明细 —— 这是"显示值 = 实扣值"的载体，必须存得住）
  const lostSettlement = {
    outcome: 'lost',
    text: '殖民地被掠夺：金币 -20000、硅片 -100、量子簇 -30',
    awardText: '',
    loot: { gold: 20000, stardust: 0, materials: { silicon: 100, quantum: 30 } },
  };
  const lostState = { ...st, lastRaidSettlement: lostSettlement };
  // 造船队列：手写两项（不靠 ENQUEUE_BUILD，避免把"资源/船坞门槛"混进存档往返这一条）
  st = {
    ...st,
    buildQueue: [
      { cardId: 'c1', active: true, turnsLeft: 1, cost: { gold: 1600, alloy: 16, materials: { silicon: 4 } } },
      { cardId: 'c2', active: false, turnsLeft: 1, cost: { gold: 1600, alloy: 16, materials: { silicon: 4 } } },
    ],
  };
  const round = stateFromSave(JSON.parse(JSON.stringify(buildSaveData(st))));
  check(eq(round.cardLibrary, st.cardLibrary), '往返后卡库一致', round.cardLibrary.length + ' vs ' + st.cardLibrary.length);
  check(eq(round.fleets, st.fleets), '往返后舰队一致');
  check(eq(round.expedition, st.expedition), '往返后出征一致', J(round.expedition));
  check(eq(round.raid, st.raid), '往返后掠夺状态一致');
  check(eq(round.defeatedLairs, st.defeatedLairs), '往返后"已打败的老巢"账本一致（v6 字段）', J(round.defeatedLairs));
  check(eq(round.lastRaidSettlement, st.lastRaidSettlement), '往返后"掠夺收尾快照（打赢）"一致（v8 形状）', J(round.lastRaidSettlement));
  const lostRound = stateFromSave(JSON.parse(JSON.stringify(buildSaveData(lostState))));
  check(eq(lostRound.lastRaidSettlement, lostSettlement), '往返后"掠夺收尾快照（被打输）"一致（含 loot 实扣明细）', J(lostRound.lastRaidSettlement));
  check(eq(round.buildQueue, st.buildQueue), '往返后造船队列一致', J(round.buildQueue));
  check(round.battle === null, '往返后 battle 为 null');

  // ---------- ⑥ v2/v3/v5 旧档 ----------
  console.log('\n[5] v2/v3 旧档读入（不该崩，且拿到默认值）');
  const v2 = JSON.parse(JSON.stringify(buildSaveData(st)));
  v2.saveVersion = 2;
  delete v2.cardLibrary; delete v2.fleets; delete v2.expedition; delete v2.raid; delete v2.buildQueue;
  delete v2.defeatedLairs;   // v6 字段：v2 档当然没有
  delete v2.lastRaidSettlement;  // v7 字段：v2 档当然没有
  let oldOk = true, oldState = null;
  try { oldState = migrateSave(stateFromSave(v2)); } catch (e) { oldOk = false; console.log('    抛错：' + e.message); }
  check(oldOk, 'v2 旧档不抛错');
  if (oldState) {
    check(eq(oldState.cardLibrary, []), 'v2 旧档的卡库为空', J(oldState.cardLibrary));
    check(eq(oldState.fleets, []), 'v2 旧档的舰队为空');
    check(oldState.expedition === null, 'v2 旧档无出征');
    check(eq(oldState.raid, EMPTY_RAID), 'v2 旧档掠夺状态为默认');
    check(oldState.battle === null, 'v2 旧档 battle 为 null');
    check(eq(oldState.buildQueue, []), 'v2 旧档的造船队列为空（v4 兜底）', J(oldState.buildQueue));
    check(eq(oldState.defeatedLairs, []), 'v2 旧档的"已打败的老巢"账本为空（v6 兜底 = 一个都没打败）', J(oldState.defeatedLairs));
    check(oldState.lastRaidSettlement === null, 'v2 旧档没有掠夺战利品快照（v7 兜底 = null，不给旧档凭空补战利品）', J(oldState.lastRaidSettlement));
  }

  // v3 → v4：只多一个 buildQueue 字段（不该崩，且兜底成 []）
  console.log('\n[5b] v3 旧档读入（v4 新增 buildQueue 的兜底）');
  const v3 = JSON.parse(JSON.stringify(buildSaveData(st)));
  v3.saveVersion = 3;
  delete v3.buildQueue;
  let v3Ok = true, v3State = null;
  try { v3State = migrateSave(stateFromSave(v3)); } catch (e) { v3Ok = false; console.log('    抛错：' + e.message); }
  check(v3Ok, 'v3 旧档不抛错');
  if (v3State) {
    check(eq(v3State.buildQueue, []), 'v3 旧档的造船队列兜底为 []', J(v3State.buildQueue));
    check(eq(v3State.cardLibrary, st.cardLibrary), 'v3 旧档的卡库原样读入（只新增字段、不改既有语义）');
  }

  // v5 → v6：只多一个 defeatedLairs 字段（不该崩，且兜底成 [] = 一个老巢都没打败）
  console.log('\n[5c] v5 旧档读入（v6 新增 defeatedLairs 的兜底）');
  const v5 = JSON.parse(JSON.stringify(buildSaveData(st)));
  v5.saveVersion = 5;
  delete v5.defeatedLairs;
  let v5Ok = true, v5State = null;
  try { v5State = migrateSave(stateFromSave(v5)); } catch (e) { v5Ok = false; console.log('    抛错：' + e.message); }
  check(v5Ok, 'v5 旧档不抛错');
  if (v5State) {
    check(eq(v5State.defeatedLairs, []), 'v5 旧档的"已打败的老巢"账本兜底为 []（一个都没打败）', J(v5State.defeatedLairs));
    check(eq(v5State.raid, st.raid) && v5State.expedition !== null, 'v5 旧档的掠夺在途与出征原样读入（只新增字段、不改既有语义）');
  }

  // v7 → v8：v7 只有 `lastRaidReward`（旧字段名 + 旧形状 `{ text, kind }`），
  // v8 改名扩形成 `lastRaidSettlement`（赢/输同一形状）→ 旧值按 **win** 转进来（只搬运旧值，不造新值）
  console.log('\n[5e] v7 旧档读入（lastRaidReward → lastRaidSettlement 的结构迁移）');
  const v7 = JSON.parse(JSON.stringify(buildSaveData(st)));
  v7.saveVersion = 7;
  delete v7.lastRaidSettlement;
  v7.lastRaidReward = { text: '击退海盗：缴获 10 星尘', kind: 'stardust' };
  let v7Ok = true, v7State = null;
  try { v7State = migrateSave(stateFromSave(v7)); } catch (e) { v7Ok = false; console.log('    抛错：' + e.message); }
  check(v7Ok, 'v7 旧档不抛错');
  if (v7State) {
    check(v7State.lastRaidSettlement !== null && v7State.lastRaidSettlement.outcome === 'win',
      '**v7 旧档的战利品 → 按 win 收进新形状**', J(v7State.lastRaidSettlement));
    check(v7State.lastRaidSettlement.text === '击退海盗：缴获 10 星尘'
      && v7State.lastRaidSettlement.awardText === '击退海盗：缴获 10 星尘',
      'v7 旧档转换后 text 与 awardText 是同一句（一个字未改）', J(v7State.lastRaidSettlement));
    check(eq(v7State.lastRaidSettlement.loot, { gold: 0, stardust: 0, materials: {} }),
      'v7 旧档转换后 loot 补空明细（旧档没有损失数据，不许凭空造）', J(v7State.lastRaidSettlement.loot));
  }

  // v6 → v7/v8：两个键都没有 → 兜底 null（没有可显示的掠夺结算）
  console.log('\n[5d] v6 旧档读入（v7 新增 lastRaidSettlement 的兜底）');
  const v6 = JSON.parse(JSON.stringify(buildSaveData(st)));
  v6.saveVersion = 6;
  delete v6.lastRaidSettlement;
  delete v6.lastRaidReward;
  let v6Ok = true, v6State = null;
  try { v6State = migrateSave(stateFromSave(v6)); } catch (e) { v6Ok = false; console.log('    抛错：' + e.message); }
  check(v6Ok, 'v6 旧档不抛错');
  if (v6State) {
    check(v6State.lastRaidSettlement === null, 'v6 旧档的"掠夺收尾快照"兜底为 null（没有可显示的奖励或被抢记录）', J(v6State.lastRaidSettlement));
    check(eq(v6State.defeatedLairs, st.defeatedLairs), 'v6 旧档的老巢账本原样读入（只新增字段、不改既有语义）', J(v6State.defeatedLairs));
    check(eq(v6State.raid, st.raid) && v6State.expedition !== null, 'v6 旧档的掠夺在途与出征原样读入');
  }

  // ---------- ⑦ 舰队不变量（按份数） ----------
  console.log('\n[6] 舰队不变量（按份数口径）');
  // 一船一队：卡库只有 1 份
  let a = { ...createInitialGameState(), cardLibrary: ['c1'] };
  a = DISPATCH(a, { type: 'CREATE_BATTLE_FLEET' });
  a = DISPATCH(a, { type: 'CREATE_BATTLE_FLEET' });
  const a0 = a.fleets[0].id, a1 = a.fleets[1].id;
  check(typeof a.fleets[0].name === 'string' && a.fleets[0].name.length > 0, '舰队有默认名字', a.fleets[0].name);
  check(a.fleets.length === 2, '能建多支舰队（数量不限）');
  a = DISPATCH(a, { type: 'ADD_SHIP_TO_FLEET', fleetId: a0, shipId: '不存在的船' });
  check(a.fleets[0].shipIds.length === 0, '卡库里没有的船编不进');
  a = DISPATCH(a, { type: 'ADD_SHIP_TO_FLEET', fleetId: a0, shipId: 'c1' });
  check(a.fleets[0].shipIds.length === 1, '正常编入一艘');
  a = DISPATCH(a, { type: 'ADD_SHIP_TO_FLEET', fleetId: a1, shipId: 'c1' });
  check(a.fleets[1].shipIds.length === 0, '卡库只有 1 份时，这艘船不能同时编入第二支舰队（一船一队）');
  // 同型多份可拆分：卡库有 2 份
  let b = { ...createInitialGameState(), cardLibrary: ['c1', 'c1'] };
  b = DISPATCH(b, { type: 'CREATE_BATTLE_FLEET' });
  b = DISPATCH(b, { type: 'CREATE_BATTLE_FLEET' });
  for (const fid of [b.fleets[0].id, b.fleets[1].id]) b = DISPATCH(b, { type: 'ADD_SHIP_TO_FLEET', fleetId: fid, shipId: 'c1' });
  check(b.fleets[0].shipIds.length === 1 && b.fleets[1].shipIds.length === 1, '卡库有 2 份时可一队一份（同型可拆分）');
  const b2 = DISPATCH(b, { type: 'ADD_SHIP_TO_FLEET', fleetId: b.fleets[0].id, shipId: 'c1' });
  check(eq(b2.fleets, b.fleets), '卡库份数已编满后再编会被拒');
  // 每队 30 上限
  const bigLib = []; for (let i = 0; i < 40; i++) bigLib.push('c1');
  let c = { ...createInitialGameState(), cardLibrary: bigLib.slice() };
  c = DISPATCH(c, { type: 'CREATE_BATTLE_FLEET' });
  c = DISPATCH(c, { type: 'CREATE_BATTLE_FLEET' });
  for (let i = 0; i < 40; i++) c = DISPATCH(c, { type: 'ADD_SHIP_TO_FLEET', fleetId: c.fleets[0].id, shipId: 'c1' });
  check(c.fleets[0].shipIds.length === 30, '每队上限 30 艘', String(c.fleets[0].shipIds.length));
  // 出征与防守标签互斥（两个方向都测）
  c = DISPATCH(c, { type: 'START_EXPEDITION', bossId: 'b1', fleetId: c.fleets[0].id, turns: 3 });
  check(!!c.expedition && c.expedition.fleetId === c.fleets[0].id, '出征已登记');
  const cToggled = DISPATCH(c, { type: 'TOGGLE_FLEET_DEFENDING', fleetId: c.fleets[0].id });
  check(eq(cToggled.fleets[0].defending, c.fleets[0].defending), '出征中的舰队不能打防守标签');
  const cToggled2 = DISPATCH(c, { type: 'TOGGLE_FLEET_DEFENDING', fleetId: c.fleets[1].id });
  check(cToggled2.fleets[1].defending === true, '非出征舰队可以打防守标签');
  const cExp2 = DISPATCH(cToggled2, { type: 'START_EXPEDITION', bossId: 'b2', fleetId: cToggled2.fleets[1].id, turns: 3 });
  check(eq(cExp2.expedition, c.expedition), '同时只能出征 1 个老巢');
  const cExpEmpty = DISPATCH(cToggled2, { type: 'START_EXPEDITION', bossId: 'b2', fleetId: cToggled2.fleets[1].id, turns: 3 });
  check(eq(cExpEmpty.fleets[1].defending, true), '带防守标签的舰队不能出征（已挡住）');

  // ---------- ⑧ reducer 不 mutate prev ----------
  console.log('\n[7] reducer 不 mutate prev（快照比对）');
  let d = { ...createInitialGameState(), cardLibrary: fleetsMod.FLEET_STARTER.slice(0, 8) };
  d = fleetOfLibrary(d, '测试');
  const dFleet = d.fleets[0].shipIds.slice();
  const d4 = DISPATCH(d, { type: 'START_BATTLE', bossId: 'raid', fleet: dFleet, kind: 'defense', seed: 20261006 });
  check(!!d4.battle, 'START_BATTLE 建起了战斗');
  check(d.battle === null, 'START_BATTLE 没往 prev 上写 battle');
  const snapBefore = J({ lib: d.cardLibrary, fleets: d.fleets, exp: d.expedition, raid: d.raid });
  const battleBefore = d4.battle;
  const roundBefore = battleBefore.round;
  const d5 = DISPATCH(d4, { type: 'BATTLE_ACTION', action: { type: 'autoTurn' } });
  check(d5.battle !== battleBefore, 'BATTLE_ACTION 产出了新的 battle 对象（克隆）');
  check(J({ lib: d.cardLibrary, fleets: d.fleets, exp: d.expedition, raid: d.raid }) === snapBefore, 'BATTLE_ACTION 没改 prev 的卡库/舰队');
  check(battleBefore.round === roundBefore, 'BATTLE_ACTION 没改 prev 里那份 battle（原地）');
  check(d4.battle === battleBefore, 'prev.battle 引用未变');

  // ---------- ⑨ cloneBattleState ----------
  console.log('\n[8] cloneBattleState 深拷贝');
  const src = E.createBattle({ seed: 777, bossId: 'b2', fleet: 'starter' });
  const cp = E.cloneBattleState(src);
  cp.round = 99; cp.player.body = 1; cp.log.push('只该出现在副本里'); cp.player.board[0] = null;
  check(src.round === 1 && src.player.body === 15, '改副本不影响原对象（标量）');
  check(src.log.indexOf('只该出现在副本里') < 0, '改副本的 log 不影响原对象');
  check(typeof cp.rnd === 'function', '副本保留了 rnd 函数');
  cp.rnd();
  check(true, '副本的 rnd 可调用');

  // ---------- ⑩ END_BATTLE：掠夺战 vs 出征战 ----------
  console.log('\n[9a] 掠夺防守战（bossId=raid）：只收掠夺，不动在途出征');
  let r = { ...createInitialGameState(), cardLibrary: fleetsMod.FLEET_STARTER.slice(), raid: { inTurns: 2, arrivedTurns: 0, immuneTurns: 0, raiders: 1, arrived: false } };
  r = fleetOfLibrary(r, '防守队');
  r = { ...r, expedition: { bossId: 'b3', fleetId: '在外舰队', turnsRemaining: 4 } };
  const libBefore = r.cardLibrary.length, fleetBefore = r.fleets[0].shipIds.length;
  r = DISPATCH(r, { type: 'START_BATTLE', bossId: 'raid', fleet: r.fleets[0].shipIds.slice(), kind: 'defense', seed: 1001 });
  r = fight(r);
  check(!!r.battle && r.battle.over, '掠夺战打完了（' + r.battle.round + ' 回合）', r.battle && r.battle.reason);
  const lost = (r.battle.player.lost || []).slice();
  const expBefore = r.expedition;
  const r2 = DISPATCH(r, { type: 'END_BATTLE' });
  check(r2.battle === null, 'END_BATTLE 清掉进行中的战斗');
  check(r2.cardLibrary.length === libBefore - lost.length, `卡库按份移除永久损失（-${lost.length}）`, r2.cardLibrary.length + ' vs ' + (libBefore - lost.length));
  check(r2.fleets[0].shipIds.length === fleetBefore - lost.length, `舰队按份移除永久损失（-${lost.length}；同型幸存者留下）`, r2.fleets[0].shipIds.length + ' vs ' + (fleetBefore - lost.length));
  check(eq(r2.expedition, expBefore), '掠夺战结束**不动在途的出征**（§10.1）', J(r2.expedition));
  check(r2.raid.inTurns === null, '掠夺战结束清掉 inTurns');
  check(r2.raid.immuneTurns === 20, '掠夺战结束给 20 回合免疫（§10.2：打赢打输都免疫）', String(r2.raid.immuneTurns));

  console.log('\n[9b] 出征战（bossId=b1）：结束出征，不动掠夺');
  let x = { ...createInitialGameState(), cardLibrary: fleetsMod.FLEET_STARTER.slice(), raid: { inTurns: 3, arrivedTurns: 0, immuneTurns: 2, raiders: 1, arrived: false } };
  x = fleetOfLibrary(x, '出征队');
  x = DISPATCH(x, { type: 'START_EXPEDITION', bossId: 'b1', fleetId: x.fleets[0].id, turns: 0 });
  check(!!x.expedition, '出征已登记');
  const raidBefore = x.raid;
  const xLib = x.cardLibrary.length, xFleet = x.fleets[0].shipIds.length;
  x = DISPATCH(x, { type: 'START_BATTLE', bossId: 'b1', fleet: x.fleets[0].shipIds.slice(), kind: 'expedition', seed: 4242 });
  x = fight(x);
  const xLost = (x.battle.player.lost || []).slice();
  const x2 = DISPATCH(x, { type: 'END_BATTLE' });
  check(x2.expedition === null, '出征战结束 → 出征清空');
  check(eq(x2.raid, raidBefore), '出征战结束**不动掠夺状态**（§10.2）', J(x2.raid));
  check(x2.cardLibrary.length === xLib - xLost.length, '出征战同样按份写回永久损失', x2.cardLibrary.length + ' vs ' + (xLib - xLost.length));
  check(x2.fleets[0].shipIds.length === xFleet - xLost.length, '出征战舰队同样按份移除', x2.fleets[0].shipIds.length + ' vs ' + (xFleet - xLost.length));

  console.log('\n=== P3 验收结果 ===');
  if (fails.length === 0) console.log('  全部通过 ✓');
  else { console.log('  ' + fails.length + ' 条失败 ✗'); process.exitCode = 1; }
})().catch((e) => {
  console.error('验收脚本自身出错：', e && e.stack ? e.stack.split('\n').slice(0, 10).join('\n') : e);
  process.exitCode = 2;
});
