'use strict';
/* 生成一份「方便测试卡牌战斗」的存档（用真实 reducer + 真实存档 API 构造，保证能导入）
   用法：node --import ./scripts/register-ts.mjs scripts/make-test-save.cjs [输出路径]
   产出：默认写到 Downloads/测试存档-卡牌战斗.json
   ⚠ 2026-08 起 visitedNodes 额外含两个**势力节点**（f07/f01）：掠夺奖励的声望只从
     `getKnownFactionIds`（已探明势力）里挑 —— 一个都没探明时会**回退成金币**，
     所以测试存档必须探明至少一个势力，才能测到"声望只给已探明势力"这条规则。 */
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
  const { getBuildingDef } = await import('@/data/colony/buildings');
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
        visitedNodes: [ruinNode.id, easy.id, hard.id, 'f07', 'f01'],   // 探明两个老巢（一易一难）+ 两个势力（测"声望只给已探明势力"）
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

  // ---- 5.5 船坞：直接给一座「一级船坞」（B32），并**按数据把入驻人口喂够** ----
  //  ① 做法：克隆殖民地已有的一个建筑实例、只换 defId（形状天然正确，不猜字段）。
  //     但 **uid 必须换新的** —— 沿用 proto.uid 会与那座建筑撞号（按 uid 定位的动作会打错人）。
  //  ② 入驻人口 = 数据里的 minPop（B32 = 2 人）：船坞没入驻就造不了舰
  //     （判据 lib/battle/shipyard.dockStaffGate，与 economy.ts 的产出/发电同口径）。
  //     ⚠ 遗落星球的殖民地初始人口是 0（planets.ruin 没有 initialPop），所以这里必须自己把
  //       人口凑够；B1 居住舱的 maxPop 是 0（居住建筑只给人口上限、不能入驻），
  //       "给居住建筑分配人口"在既有模型里根本不成立 —— 要入驻的是**船坞本身**。
  //  ③ 人口字段与入驻自洽：available = total − Σ assignedPop（types/colony.ts 的 Population 注释）。
  st = {
    ...st,
    ships: st.ships.map((s, i) => {
      if (i !== 0 || !s.colony) return s;
      const proto = (s.colony.buildings || [])[0];
      if (!proto) return s;
      const dockDef = getBuildingDef('B32');
      const dock = {
        ...proto,
        defId: 'B32',
        uid: 'B32_test',
        assignedPop: dockDef.minPop,                 // 2 人：船坞的入驻门槛（数据唯一真值）
        buildProgress: dockDef.buildTurns,           // 已完工
        active: true,
      };
      const buildings = [...s.colony.buildings, dock];
      const assigned = buildings.reduce((a, b) => a + (b.assignedPop || 0), 0);
      const total = Math.max(s.colony.population.total, assigned);
      return {
        ...s,
        colony: {
          ...s.colony,
          buildings,
          population: { ...s.colony.population, total, available: total - assigned },
        },
      };
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
  const dockInst = (s0.colony ? s0.colony.buildings : []).find((b) => b.defId === 'B32');
  const dockNeed = getBuildingDef('B32').minPop;
  console.log('  船坞入驻人数：' + (dockInst ? dockInst.assignedPop + '/' + dockNeed + ' 人' : '没有船坞')
    + '（船坞没入驻就不能下单造舰：lib/battle/shipyard.dockStaffGate）');
  // 新规则自检：这份存档**导入后必须立刻能造舰**（否则等于把测试存档改废了）
  const probe = white.length > 0 ? shipyardMod.canBuild(back, white[0].id) : { ok: false, reason: '没有可造的白卡' };
  console.log('  导入后立刻能造舰：' + (probe.ok ? '是 ✓（' + (white[0] ? white[0].name + ' ' + white[0].id : '') + '）' : '否 ✗ ' + (probe.reason || '')));
  console.log('  造船队列：' + back.buildQueue.length + ' 项');
  console.log('  掠夺：阶段=' + raids.raidPhase(back.raid) + ' 还剩 ' + back.raid.inTurns + ' 回合抵达 · 掠夺队 ' + back.raid.raiders + ' 支');
  console.log('  已探明老巢：' + lairs.filter((n) => back.ships[0].galaxy.visitedNodes.indexOf(n.id) >= 0).map((n) => n.name).join(' / '));
  console.log('  往返自检：' + (back.cardLibrary.length === st.cardLibrary.length && back.fleets.length === st.fleets.length ? '通过 ✓' : '不一致 ✗'));

  function raidSquadCountSafe(R) {
    try { return R.raidSquadCount ? R.raidSquadCount(0.1) : 1; } catch { return 1; }
  }
})().catch((e) => { console.error(e && e.stack ? e.stack.split('\n').slice(0, 8).join('\n') : e); process.exitCode = 1; });
