'use strict';
/* ============================================================================
   P8 验收：船坞与造舰（V1.5 §8 / §9）
   用法：node --import ./scripts/register-ts.mjs scripts/check-battle-shipyard.cjs
   覆盖：
     ① 造价公式（稀有度基准 × 卡牌系数，§8.3 四档基准逐条断言）
     ② 建造回合数（白 1 / 蓝 2 / 紫 3 / 橙 4）
     ③ 稀有度 → 船坞等级（白 1 / 蓝 2 / 紫 3 / 橙 3，§8.2）
     ④ canBuild 的五道门槛（无殖民地 / 无船坞 / 等级不够 / 科技没研 / 资源不足）
     ⑤ 同时建造 2 艘 + 排队无限（advanceQueue 的推进与补位）
     ⑥ 只有未开工的排队项能取消（canCancelBuild）
     ⑦ ENQUEUE_BUILD / CANCEL_BUILD 走 reducer：扣费、入队、返还
     ⑧ 船坞电力 6/10/18 真的进 computeColonyPower 的耗电结算
   ============================================================================ */
const fails = [];
const check = (ok, label, detail) => {
  if (ok) console.log('  ✓ ' + label);
  else { fails.push(label + (detail ? ' → ' + detail : '')); console.log('  ✗ ' + label + (detail ? '  → ' + detail : '')); }
};
const eq = (a, b) => JSON.stringify(a) === JSON.stringify(b);

(async () => {
  const SY = await import('@/lib/battle/shipyard');
  const { gameReducer, createInitialGameState } = await import('@/hooks/gameReducer');
  const { computeColonyPower } = await import('@/lib/colony/economy');
  const { getBuildingDef } = await import('@/data/colony/buildings');
  const { ALL_TECHS } = await import('@/data/colony/techs');
  const D = (st, action) => gameReducer(st, action);

  /** 造一份"有殖民地 + 有船坞 + 科技已研 + 资源充足"的状态 */
  const docked = (level, opts) => {
    const o = opts || {};
    const buildings = [];
    for (let i = 1; i <= level; i++) buildings.push({ defId: 'B3' + (i + 1), uid: 'u' + i, assignedPop: 2, buildProgress: 9, active: true });    return {
      ...createInitialGameState(),
      phase: 'playing',
      turn: 5,
      ships: [{
        id: 1,
        gold: 999999,
        alloy: 99999,
        food: 9999,
        stardust: 9999,
        materials: { silicon: 9999, quantum: 9999, dark_matter: 9999, carbon: 9999 },
        relics: [],
        galaxy: { permaBonuses: [] },
        colony: {
          phase: 'active',
          planetType: 'terran',
          buildings,
          // 人口 4：够三级船坞（入驻需求 2/3/4 人）全部满足 —— 不满足时船坞虽仍耗电（economy 的耗电
          // 循环不看入驻），但"已建成且在运转"的语义要成立（与 UI 的 dockLevel 口径一致）。
          population: { total: 4, available: 4, cap: 20 },
          leaders: [],
          leaderCap: 3,
          energy: 100,
          techState: { researched: (o.techs || []), currentResearch: null, currentProgress: 0, researchPoints: 0, researchSeed: 1, repeatableLevels: {} },
        },
      }],
    };
  };
  const noRes = (st) => {
    const s = JSON.parse(JSON.stringify(st));
    s.ships[0].gold = 0; s.ships[0].alloy = 0; s.ships[0].materials = {};
    return s;
  };

  // ---------- ① 造价（§8.3 基准 × 系数） ----------
  console.log('\n[1] 造价公式（§8.3 稀有度基准 × 卡牌系数）');
  // 3 费 → 系数 1.00，正好等于 §8.3 表里的基准价（这是"基准表是锚"的证明）
  check(eq(SY.cardCoefficient({ id: 'x', name: 'x', cost: 3, atk: 1, shield: 1, structure: 0, series: '通用', rarity: '白', text: '' }), 1), '3 费卡系数 = 1.00（锚点）');
  check(eq(SY.cardCoefficient({ id: 'x', name: 'x', cost: 1, atk: 1, shield: 1, structure: 0, series: '通用', rarity: '白', text: '' }), 0.8), '1 费卡系数 = 0.80');
  check(eq(SY.cardCoefficient({ id: 'x', name: 'x', cost: 6, atk: 1, shield: 1, structure: 0, series: '通用', rarity: '橙', text: '' }), 1.3), '6 费卡系数 = 1.30');
  // 白卡 1 费（h1 圣火巡逻艇）：基准 2000/20/5硅片 × 0.8 = 1600/16/4
  check(eq(SY.buildCost('h1'), { gold: 1600, alloy: 16, materials: { silicon: 4 } }), '白卡 1 费造价 = 1600 金币 + 16 合金 + 4 硅片', JSON.stringify(SY.buildCost('h1')));
  // 蓝卡 3 费（h3 审判巡洋舰）：基准 6000/100/20硅片 × 1.0
  check(eq(SY.buildCost('h3'), { gold: 6000, alloy: 100, materials: { silicon: 20 } }), '蓝卡 3 费造价 = 6000 金币 + 100 合金 + 20 硅片（= §8.3 基准）', JSON.stringify(SY.buildCost('h3')));
  // 橙卡 6 费（h7 圣光方舟）：基准 50000/800/10暗物质+10量子簇 × 1.3
  check(eq(SY.buildCost('h7'), { gold: 65000, alloy: 1040, materials: { dark_matter: 13, quantum: 13 } }), '橙卡 6 费造价 = 65000/1040/13+13', JSON.stringify(SY.buildCost('h7')));

  // ---------- ② 建造回合数 ----------
  console.log('\n[2] 单艘建造回合数（§8.3 基础生产回合）');
  check(SY.buildTurns('h1') === 1 && SY.buildTurns('h2') === 1, '白卡 1 回合');
  check(SY.buildTurns('h3') === 2 && SY.buildTurns('c4') === 2, '蓝卡 2 回合');
  check(SY.buildTurns('h5') === 3 && SY.buildTurns('g4') === 3, '紫卡 3 回合');
  check(SY.buildTurns('h7') === 4 && SY.buildTurns('i7') === 4, '橙卡 4 回合');

  // ---------- ③ 稀有度 → 船坞等级 ----------
  console.log('\n[3] 稀有度 → 船坞等级（§8.2）');
  check(SY.requiredDockLevel('h1') === 1 && SY.requiredDockLevel('c5') === 1, '白卡需要一级船坞');
  check(SY.requiredDockLevel('h3') === 2 && SY.requiredDockLevel('c6') === 2, '蓝卡需要二级船坞');
  check(SY.requiredDockLevel('h5') === 3 && SY.requiredDockLevel('g4') === 3, '紫卡需要三级船坞');
  check(SY.requiredDockLevel('h7') === 3 && SY.requiredDockLevel('g6') === 3, '橙卡需要三级船坞');

  // ---------- ④ canBuild 五道门槛 ----------
  console.log('\n[4] canBuild 的门槛与中文原因');
  const noColony = { ...createInitialGameState(), phase: 'playing', ships: [{ id: 1, gold: 1e9, alloy: 1e6, materials: {}, relics: [], galaxy: {} }] };
  check(SY.dockLevel(noColony) === 0, '没殖民地时 dockLevel = 0');
  check(!SY.canBuild(noColony, 'h1').ok, '没殖民地不能造');
  check(/殖民地/.test(SY.canBuild(noColony, 'h1').reason || ''), '原因里写明缺殖民地', SY.canBuild(noColony, 'h1').reason);
  check(!SY.canBuild(docked(0), 'h1').ok, '有殖民地但没船坞不能造');
  check(/船坞/.test(SY.canBuild(docked(0), 'h1').reason || ''), '原因里写明缺船坞', SY.canBuild(docked(0), 'h1').reason);
  check(!SY.canBuild(docked(1), 'h3').ok, '一级船坞造不了蓝卡');
  check(/二级船坞/.test(SY.canBuild(docked(1), 'h3').reason || ''), '原因里写明需要二级船坞', SY.canBuild(docked(1), 'h3').reason);
  check(!SY.canBuild(docked(2), 'h3').ok, '二级船坞 + 没研科技还是造不了蓝卡');
  check(/T28|圣辉蓝图解析/.test(SY.canBuild(docked(2), 'h3').reason || ''), '原因里写明缺哪个科技', SY.canBuild(docked(2), 'h3').reason);
  check(SY.canBuild(docked(2, { techs: ['T28'] }), 'h3').ok, '二级船坞 + T28 → 能造圣辉蓝卡');
  check(SY.canBuild(docked(3, { techs: ['T28', 'T29'] }), 'h7').ok, '三级船坞 + T28+T29 → 能造圣辉橙卡');
  check(!SY.canBuild(docked(3, { techs: ['T28'] }), 'h7').ok, '只研了蓝图解析还造不了橙卡（要精锐改装）');
  check(!SY.canBuild(docked(1), 'r1').ok, '海盗卡玩家不能造');
  check(!SY.canBuild(docked(1), 't_monk').ok, '衍生单位不能造');
  check(/资源不足/.test(SY.canBuild(noRes(docked(1)), 'h1').reason || ''), '资源不足时写明原因', SY.canBuild(noRes(docked(1)), 'h1').reason);

  // ---------- ⑤ 同时 2 艘 + 排队无限 ----------
  console.log('\n[5] 队列推进（同时建造 2 艘 + 排队无限）');
  const st3 = docked(3, { techs: ['T28', 'T29', 'T30', 'T31', 'T32', 'T33', 'T34', 'T35', 'T36'] });
  let q = [];
  let r = SY.enqueueBuild(st3, q, 'h1');
  check(r.started === true, '第 1 艘立刻开工');
  q = r.queue;
  r = SY.enqueueBuild(st3, q, 'h1');
  check(r.started === true, '第 2 艘立刻开工');
  q = r.queue;
  r = SY.enqueueBuild(st3, q, 'h1');
  check(r.started === false, '第 3 艘排队（同时只 2 艘）');
  q = r.queue;
  check(q.length === 3, '排队无限：第 3 艘也进队列');
  for (let i = 0; i < 8; i++) q = SY.enqueueBuild(st3, q, 'h1').queue;
  check(q.length === 11, '可以任意长度排队（11 项）', String(q.length));
  check(SY.activeBuildCount(q) === 2, '任何时候开工数都是 2', String(SY.activeBuildCount(q)));

  // 推进：白卡 1 回合 —— 第 1 次推进，两艘在建完工，两个排队项补位开工
  let adv = SY.advanceQueue(q, 3);
  check(eq(adv.completed, ['h1', 'h1']), '第 1 回合完工 2 艘（白卡 1 回合）', JSON.stringify(adv.completed));
  check(adv.queue.length === q.length - 2, '完工项从队列移除', String(adv.queue.length));
  check(SY.activeBuildCount(adv.queue) === 2, '补位后仍有 2 艘在建');
  check(adv.queue[0].turnsLeft === 1, '本回合新开工的不扣本回合工期（turnsLeft 仍 = 1）', String(adv.queue[0].turnsLeft));
  // 再推进一次 → 又完工 2 艘
  adv = SY.advanceQueue(adv.queue, 3);
  check(adv.completed.length === 2, '第 2 回合再完工 2 艘', String(adv.completed.length));
  // 拆掉船坞（dockLv=0）：不再开新工，但已开工的照常完工
  const adv0 = SY.advanceQueue(adv.queue, 0);
  check(adv0.completed.length === 2, '船坞没了（dockLv=0）：已开工的照常完工', String(adv0.completed.length));
  check(SY.activeBuildCount(adv0.queue) === 0, '船坞没了：不再开新工', String(SY.activeBuildCount(adv0.queue)));
  // 蓝卡 2 回合：开工后要推进两次才完工
  let q2 = SY.enqueueBuild(st3, [], 'h3').queue;
  check(SY.advanceQueue(q2, 2).completed.length === 0, '蓝卡开工后第 1 次推进不完工');
  q2 = SY.advanceQueue(q2, 2).queue;
  check(eq(SY.advanceQueue(q2, 2).completed, ['h3']), '蓝卡第 2 次推进完工');

  // ---------- ⑥ 取消 ----------
  console.log('\n[6] 取消排队（只有未开工的可取消）');
  const q3 = SY.enqueueBuild(st3, SY.enqueueBuild(st3, SY.enqueueBuild(st3, [], 'h1').queue, 'h1').queue, 'h1').queue;
  check(SY.canCancelBuild(q3, 0).ok === false, '已开工的第 1 项不能取消');
  check(/开工/.test(SY.canCancelBuild(q3, 0).reason || ''), '给出"已开工不能取消"的原因', SY.canCancelBuild(q3, 0).reason);
  check(SY.canCancelBuild(q3, 2).ok === true, '排队的第 3 项可以取消');
  check(SY.canCancelBuild(q3, 99).ok === false, '下标越界不能取消');
  const refund = SY.buildRefund(q3[2]);
  check(refund.gold === Math.floor(q3[2].cost.gold * 0.4), '返还金币 = 实付 × 0.4', String(refund.gold));
  check(refund.alloy === Math.floor(q3[2].cost.alloy * 0.7), '返还合金 = 实付 × 0.7', String(refund.alloy));

  // ---------- ⑦ reducer 的 ENQUEUE_BUILD / CANCEL_BUILD ----------
  console.log('\n[7] reducer：ENQUEUE_BUILD / CANCEL_BUILD');
  const base = docked(1);
  const before = base.ships[0].gold;
  const after = D(base, { type: 'ENQUEUE_BUILD', cardId: 'h1' });
  check(after.buildQueue.length === 1 && after.buildQueue[0].active === true, 'ENQUEUE_BUILD 入队并开工');
  check(after.ships[0].gold === before - 1600, 'ENQUEUE_BUILD 按造价扣金币（2000×0.8=1600）', String(before - after.ships[0].gold));
  check(after.ships[0].alloy === base.ships[0].alloy - 16, 'ENQUEUE_BUILD 按造价扣合金');
  check(after.ships[0].materials.silicon === base.ships[0].materials.silicon - 4, 'ENQUEUE_BUILD 按造价扣硅片');
  check(base.buildQueue.length === 0, 'ENQUEUE_BUILD 不改 prev（队列）');
  check(base.ships[0].gold === before, 'ENQUEUE_BUILD 不改 prev（金币）');
  const denied = D(noRes(base), { type: 'ENQUEUE_BUILD', cardId: 'h1' });
  check(denied.buildQueue.length === 0, '资源不足时 ENQUEUE_BUILD 不改状态');
  const denied2 = D(docked(0), { type: 'ENQUEUE_BUILD', cardId: 'h1' });
  check(denied2.buildQueue.length === 0, '没有船坞时 ENQUEUE_BUILD 不改状态');
  // 取消排队项：金币返回 40%
  const two = D(after, { type: 'ENQUEUE_BUILD', cardId: 'h1' });
  const three = D(two, { type: 'ENQUEUE_BUILD', cardId: 'h1' });
  check(three.buildQueue.length === 3 && three.buildQueue[2].active === false, '第 3 项排队');
  const goldBeforeCancel = three.ships[0].gold;
  const cancelled = D(three, { type: 'CANCEL_BUILD', index: 2 });
  check(cancelled.buildQueue.length === 2, 'CANCEL_BUILD 移除排队项');
  check(cancelled.ships[0].gold === goldBeforeCancel + Math.floor(1600 * 0.4), 'CANCEL_BUILD 返还 40% 金币（640）', String(cancelled.ships[0].gold - goldBeforeCancel));
  const noCancel = D(three, { type: 'CANCEL_BUILD', index: 0 });
  check(noCancel === three, '已开工的项取消：CANCEL_BUILD 原样返回（reducer 守卫）');

  // ---------- ⑧ 船坞电力进结算 ----------
  console.log('\n[8] 船坞电力 6/10/18 真的进 computeColonyPower 的耗电');
  const powerOf = (level) => {
    const st = docked(level);
    // docked() 用 B32/B33/B34（B3 + (i+1)：i=1 → B32 ✅）
    return computeColonyPower(st.ships[0].colony, { relics: [], permaBonuses: [] }).use;
  };
  const p0 = powerOf(0), p1 = powerOf(1), p2 = powerOf(2), p3 = powerOf(3);
  // 地球开局只有船坞（这个夹具没有别的建筑），故 use 就是船坞合计 × 星球耗电倍率（terran 无倍率）
  check(p1 - p0 === 6, '一级船坞耗电 6（§8.2）', String(p1 - p0));
  check(p2 - p1 === 10, '二级船坞耗电 10（§8.2）', String(p2 - p1));
  check(p3 - p2 === 18, '三级船坞耗电 18（§8.2）', String(p3 - p2));
  check(p3 === 34, '三级船坞合计耗电 6+10+18 = 34', String(p3));
  check(getBuildingDef('B32').powerConsumption === 6, 'B32 数据里写的电力 = 6（不是 economy 硬编码）');
  check(getBuildingDef('B32').category === 'shipyard' && getBuildingDef('B34').category === 'shipyard', 'B32/B34 的 category = shipyard');
  check(getBuildingDef('B32').maxCount === 1 && getBuildingDef('B34').maxCount === 1, '每级船坞上限 1 座');
  check(eq(SY.SHIPYARD_BUILDING_TIERS, ['B32', 'B33', 'B34']), '船坞建筑编号 = B32/B33/B34（§8.2）');

  // ---------- ⑨ 科技 T28–T36 ----------
  console.log('\n[9] 科技 T28–T36（§9.1 的 9 个）');
  const ids = ['T28', 'T29', 'T30', 'T31', 'T32', 'T33', 'T34', 'T35', 'T36'];
  for (const id of ids) {
    const t = ALL_TECHS.find((x) => x.id === id);
    check(!!t, `存在 ${id}`);
  }
  const t29 = ALL_TECHS.find((x) => x.id === 'T29');
  const t28 = ALL_TECHS.find((x) => x.id === 'T28');
  check(t28.costRP === 400 && t28.researchTurns === 2, 'T28 = 400 科研点 / 2 回合');
  check(t29.costRP === 1200 && t29.researchTurns === 3 && eq(t29.prerequisites, ['T28']), 'T29 = 1200 科研点 / 3 回合，前置 T28');
  check(t29.description === '"把圣坛搬上战舰，让每一发炮弹都算一次布道。"', 'T29 描述只保留引号台词（AGENTS 第八节）');
  const t36 = ALL_TECHS.find((x) => x.id === 'T36');
  check(t36.costRP === 400 && eq(t36.prerequisites, []), 'T36 = 通用系蓝图解析（无前置、无精锐改装）');
  for (const id of ids) {
    const t = ALL_TECHS.find((x) => x.id === id);
    check(t.description.startsWith('"') && t.description.endsWith('"'), `${id} 描述是 '"台词。"' 格式`);
  }

  // ---------- ⑩ shipyardView 遍历完整数组 ----------
  console.log('\n[10] 面板渲染模型（完整数组 + 队列视图）');
  const view = SY.shipyardView(docked(1));
  check(view.cards.length === 33, '可造卡列表 = 33 型（50 张卡 − 10 张海盗 − 7 张衍生单位）', String(view.cards.length));
  check(view.cards.every((c) => c.reason !== undefined || c.ok), '每张不能造的卡都有中文原因');
  check(view.built.length === 3, '三级船坞状态都有（含没建的）');
  check(view.dockLevel === 1, 'dockLevel = 1');
  const qv = SY.queueView(D(D(base, { type: 'ENQUEUE_BUILD', cardId: 'h1' }), { type: 'ENQUEUE_BUILD', cardId: 'h1' }));
  check(qv.building.length === 2 && qv.waiting.length === 0 && qv.maxConcurrent === 2, 'queueView：在建 2 格 / 上限 2');
  check(SY.formatBuildCost({ gold: 1600, alloy: 16, materials: { silicon: 4 } }) === '金币 1600 + 合金 16 + 硅片 4', '造价中文一行', SY.formatBuildCost({ gold: 1600, alloy: 16, materials: { silicon: 4 } }));

  console.log('\n=== P8 船坞验收结果 ===');
  if (fails.length === 0) console.log('  全部通过 ✓');
  else { console.log('  ' + fails.length + ' 条失败 ✗'); process.exitCode = 1; }
})().catch((e) => {
  console.error('验收脚本自身出错：', e && e.stack ? e.stack.split('\n').slice(0, 12).join('\n') : e);
  process.exitCode = 2;
});
