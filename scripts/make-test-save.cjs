'use strict';
/* 生成一份「方便测试卡牌战斗」的存档（用真实 reducer + 真实存档 API 构造，保证能导入）
   用法：node --import ./scripts/register-ts.mjs scripts/make-test-save.cjs [输出路径]
   产出：默认写到 Downloads/测试存档-卡牌战斗.json */
const fs = require('fs');
const path = require('path');

(async () => {
  const { gameReducer, createInitialGameState } = await import('@/hooks/gameReducer');
  const { buildSaveData, stateFromSave, SAVE_VERSION } = await import('@/lib/save');
  const { applyColonyFounding } = await import('@/lib/colony/colonySetup');
  const { GALAXY_NODES } = await import('@/data/galaxy/nodes');
  const cardsMod = await import('@/data/battle/cards');
  const raids = await import('@/lib/battle/raid');
  const shipyardMod = await import('@/lib/battle/shipyard');
  const fleetsMod = await import('@/data/battle/fleets');
  const D = (st, a) => gameReducer(st, a);

  // ---- 1. 开局 + 母舰 ----
  //  ⚠ 不要用 SELECT_SHIP：它在本环境里不产出母舰（实测 ships 仍为空 → 存出来不可导入）。
  //     直接用数据层工厂 createMotherships()，与既有验收脚本同一路径。
  const { createMotherships } = await import('@/data/gameData');
  let st = { ...createInitialGameState(), ships: [createMotherships()[0]] };

  // ---- 2. 建殖民地：选「遗落星球」节点 —— 它紧邻卡尔戈老巢（e20，1 回合可达），测试最快 ----
  const ruinNode = GALAXY_NODES.find((n) => n.type === 'colony' && n.planetId === 'ruin')
    || GALAXY_NODES.find((n) => n.type === 'colony');
  const lairs = GALAXY_NODES.filter((n) => n.pirateLair);
  const easy = lairs.find((n) => n.pirateLair === 'b4');   // 卡尔戈：最易的入门位
  const hard = lairs.find((n) => n.pirateLair === 'b2');   // 玛拉：全图最难
  st = {
    ...st,
    ships: st.ships.map((s, i) => i !== 0 ? s : ({
      ...s,
      colony: applyColonyFounding(s.colony, ruinNode.planetId, '测试星'),
      galaxy: {
        ...s.galaxy,
        currentNodeId: ruinNode.id,
        travelTurnsRemaining: 0,
        visitedNodes: [ruinNode.id, easy.id, hard.id],      // 探明两个老巢：一易一难
      },
    })),
  };

  // ---- 3. 资源：够建船坞 + 造各种稀有度的舰 + 研发科技 ----
  st = {
    ...st,
    ships: st.ships.map((s, i) => i !== 0 ? s : ({
      ...s,
      gold: 800000, food: 3000, alloy: 8000, stardust: 200,
      materials: { ...(s.materials || {}), silicon: 600, quantum: 200, dark_matter: 100, gold_ore: 200, oil: 200 },
      colony: { ...s.colony, researchPoints: 4000 },
    })),
  };

  // ---- 4. 卡库：14 艘（白卡为主 + 两艘蓝卡，供编队/出征用；≥10 艘才会触发掠夺）----
  const buildable = Object.values(cardsMod.BATTLE_CARDS)
    .filter((c) => !c.token && c.series !== '海盗')
    .sort((a, b) => a.cost - b.cost || (a.id < b.id ? -1 : 1));
  const picks = [...buildable.filter((c) => c.rarity === '白').slice(0, 12), ...buildable.filter((c) => c.rarity === '蓝').slice(0, 2)];
  let lib = picks.map((c) => c.id);
  if (lib.length < 14) lib = fleetsMod.FLEET_STARTER.slice(0, 14);   // 兜底
  st = { ...st, cardLibrary: lib };

  // ---- 5. 两支舰队：10 艘出征队 + 4 艘防守队 ----
  const mkFleet = (s, name, ships, defending) => {
    let x = D(s, { type: 'CREATE_BATTLE_FLEET', name });
    const fid = x.fleets[x.fleets.length - 1].id;
    for (const id of ships) x = D(x, { type: 'ADD_SHIP_TO_FLEET', fleetId: fid, shipId: id });
    if (defending) x = D(x, { type: 'TOGGLE_FLEET_DEFENDING', fleetId: fid });
    return x;
  };
  st = mkFleet(st, '出征队', lib.slice(0, 10), false);
  st = mkFleet(st, '防守队', lib.slice(10, 14), true);

  // ---- 5.5 船坞：直接给一座「一级船坞」（B32），这样导入后立刻能造舰 ----
  //  做法：克隆殖民地已有的一个建筑实例、只换 defId + id（形状天然正确，不猜字段）
  st = {
    ...st,
    ships: st.ships.map((s, i) => {
      if (i !== 0 || !s.colony) return s;
      const proto = (s.colony.buildings || [])[0];
      if (!proto) return s;
      const dock = { ...proto, defId: 'B32', id: 'B32_test' };
      return { ...s, colony: { ...s.colony, buildings: [...s.colony.buildings, dock] } };
    }),
  };

  // ---- 6. 造船队列：2 艘在建（看队列 UI；白卡 1 回合即完工）----
  const white = buildable.filter((c) => c.rarity === '白' && c.cost <= 3).slice(0, 2);
  for (const c of white) st = D(st, { type: 'ENQUEUE_BUILD', cardId: c.id });

  // ---- 7. 掠夺：阶段 A、还剩 2 回合抵达（先看预警 → 2 回合后进入阶段 B → 点「开战」）----
  st = D(st, { type: 'START_RAID', raiders: 1 });
  for (let k = 0; k < 3; k++) st = D(st, { type: 'TICK_BATTLE_STATE' });   // 5 → 2

  // ---- 8. 走真实存档 API 往返一次，确保可导入 ----
  const save = buildSaveData(st);
  const back = stateFromSave(JSON.parse(JSON.stringify(save)));
  const out = process.argv[2] || 'C:/Users/Master/Downloads/测试存档-卡牌战斗.json';
  fs.writeFileSync(out, JSON.stringify(save, null, 2), 'utf8');

  // ---- 自检 ----
  const s0 = back.ships[0];
  console.log('已生成：' + out);
  console.log('  存档版本 ' + save.saveVersion + '（当前 SAVE_VERSION=' + SAVE_VERSION + '）');
  console.log('  殖民地：' + (s0.colony ? s0.colony.planetName + '（' + s0.colony.planetType + '，' + s0.colony.phase + '）' : '无 ✗'));
  console.log('  所在节点：' + s0.galaxy.currentNodeId + '（' + ruinNode.name + '）· 已探明 ' + s0.galaxy.visitedNodes.length + ' 个节点');
  console.log('  资源：金币 ' + s0.gold + ' / 合金 ' + s0.alloy + ' / 星尘 ' + s0.stardust + ' / 硅片 ' + (s0.materials.silicon || 0) + ' / 量子簇 ' + (s0.materials.quantum || 0) + ' / 暗物质 ' + (s0.materials.dark_matter || 0));
  console.log('  殖民地科研点：' + (s0.colony && s0.colony.researchPoints) + '（够研发 T28–T36：各 400/1200）');
  console.log('  卡库：' + back.cardLibrary.length + ' 艘 ' + JSON.stringify(back.cardLibrary));
  console.log('  舰队：' + back.fleets.map((f) => f.name + '(' + f.shipIds.length + (f.defending ? '·防守' : '') + ')').join(' / '));
  console.log('  船坞等级：' + shipyardMod.dockLevel(back) + '（0=没建，1=一级；已给一座 B32）');
  console.log('  造船队列：' + back.buildQueue.length + ' 项');
  console.log('  掠夺：阶段=' + raids.raidPhase(back.raid) + ' 还剩 ' + back.raid.inTurns + ' 回合抵达 · 掠夺队 ' + back.raid.raiders + ' 支');
  console.log('  已探明老巢：' + lairs.filter((n) => back.ships[0].galaxy.visitedNodes.indexOf(n.id) >= 0).map((n) => n.name).join(' / '));
  console.log('  往返自检：' + (back.cardLibrary.length === st.cardLibrary.length && back.fleets.length === st.fleets.length ? '通过 ✓' : '不一致 ✗'));

  function raidSquadCountSafe(R) {
    try { return R.raidSquadCount ? R.raidSquadCount(0.1) : 1; } catch { return 1; }
  }
})().catch((e) => { console.error(e && e.stack ? e.stack.split('\n').slice(0, 8).join('\n') : e); process.exitCode = 1; });
