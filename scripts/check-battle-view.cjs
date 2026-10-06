'use strict';
/* ============================================================================
   P4 验收：战斗 UI 的**展示逻辑**（纯函数，不需要 React/DOM）
   用法：node --import ./scripts/register-ts.mjs scripts/check-battle-view.cjs
   为什么测这一层：组件本身没法在 Node 里渲染（本机没装 React），
   但"显示什么"这件事是可判定的 —— DEMO 踩坑换来的三条行为都在这一层：
     ① 信息条是手机端看技能的唯一出口  ② 攻击状态三重区分  ③ 待选择时只有候选可点
   ============================================================================ */
const fails = [];
const check = (ok, label, detail) => {
  if (ok) console.log('  ✓ ' + label);
  else { fails.push(label + (detail ? ' → ' + detail : '')); console.log('  ✗ ' + label + (detail ? '  → ' + detail : '')); }
};

(async () => {
  const E = await import('@/lib/battle/engine');
  const V = await import('@/lib/battle/view');
  const T = E._t;

  const need = ['unitView', 'boardView', 'poolView', 'infoBarView', 'bossView', 'graveView', 'canEndTurn'];
  const missing = need.filter((k) => typeof V[k] !== 'function');
  if (missing.length) { console.error('view.ts 缺少导出：' + missing.join(', ') + '（现有：' + Object.keys(V).join(', ') + '）'); process.exit(2); }

  const fresh = (pool) => {
    const st = E.createBattle({ seed: 7, bossId: 'b2', playerFirst: true });
    if (pool) st.player.pool = pool.slice();
    st.player.cur = 99;
    return st;
  };

  // ---------- ① 信息条：手机端看技能的唯一出口 ----------
  console.log('\n[1] 信息条（手机端看技能的唯一出口）');
  {
    const st = fresh();
    const ev = V.infoBarView(st, null, null);
    check(ev.kind === 'event', '未选中 → kind=event（显示最近战况）', ev.kind);
    check(ev.body === st.log[st.log.length - 1], 'body = 日志最后一条', JSON.stringify(ev.body).slice(0, 60));

    const card = V.infoBarView(st, 'h4', null);
    check(card.kind === 'card', '选中卡牌 → kind=card', card.kind);
    check(card.body === E.CARDS.h4.text, 'body = 该卡技能全文', JSON.stringify(card.body).slice(0, 60));
    check(/攻|盾|体/.test(card.stats), 'stats 含攻/盾/体', card.stats);
    check(card.hint.indexOf('部署') >= 0, 'hint 提示"点空格部署"', card.hint);

    // 选中己方战舰 → 技能 + 关键词 + 能不能攻击
    const u = T.spawnUnit(st, 'player', 'c2');   // 哨戒无人机：锁链
    T.placeUnit(st, 'player', u, 0);
    const uv = V.infoBarView(st, null, u.uid);
    check(uv.kind === 'unit', '选中战舰 → kind=unit', uv.kind);
    check(uv.body.indexOf('锁链') >= 0, 'body 含该舰技能/关键词', JSON.stringify(uv.body).slice(0, 60));
    check(uv.hint.indexOf('不能攻击') >= 0 || uv.hint.indexOf('失调') >= 0 || uv.hint.indexOf('可') >= 0, 'hint 说明能不能攻击', uv.hint);

    // 待选择（单选）
    const st2 = fresh(['h3']);
    const e1 = T.spawnUnit(st2, 'boss', 't_grunt'); T.placeUnit(st2, 'boss', e1, 0);
    T.spawnUnit(st2, 'boss', 't_grunt');
    const e2 = T.spawnUnit(st2, 'boss', 't_grunt'); T.placeUnit(st2, 'boss', e2, 1);
    E.deploy(st2, 'player', 'h3', 0);
    const pv = V.infoBarView(st2, null, null);
    check(pv.kind === 'pending', '待选择 → kind=pending', pv.kind);
    check(pv.title.indexOf('神罚') >= 0, 'title 用 PENDING_LABEL', pv.title);
    check(pv.hint.indexOf('1') >= 0, 'hint 写明还需几艘', pv.hint);

    // 待选择（多选，冻结 2）
    const st3 = fresh(['p2']);
    for (let i = 0; i < 3; i++) { const t = T.spawnUnit(st3, 'boss', 't_grunt'); T.placeUnit(st3, 'boss', t, i); }
    E.deploy(st3, 'player', 'p2', 0);
    const pv2 = V.infoBarView(st3, null, null);
    check(pv2.hint.indexOf('2') >= 0 && pv2.hint.indexOf('0/2') >= 0, '多选时 hint 显示"还需 2 艘（已选 0/2）"', pv2.hint);
    E.resolvePending(st3, st3.boss.board[0].uid);
    const pv3 = V.infoBarView(st3, null, null);
    check(pv3.hint.indexOf('1') >= 0 && pv3.hint.indexOf('1/2') >= 0, '选 1 艘后 hint 变成"还需 1 艘（已选 1/2）"', pv3.hint);
  }

  // ---------- ② 攻击状态三重区分 ----------
  console.log('\n[2] 攻击状态三重区分');
  {
    const st = fresh();
    const a = T.spawnUnit(st, 'player', 'c5'); T.placeUnit(st, 'player', a, 0);
    const b = T.spawnUnit(st, 'player', 'c5'); T.placeUnit(st, 'player', b, 1);
    const c = T.spawnUnit(st, 'player', 'c5'); T.placeUnit(st, 'player', c, 2);
    const foe = T.spawnUnit(st, 'boss', 'c5'); T.placeUnit(st, 'boss', foe, 0);
    a.sick = false; b.sick = false; c.sick = false;
    // ready
    check(V.unitView(st, a, 'player', false).attackState === 'ready', '未攻击过 → ready');
    check(V.unitView(st, a, 'player', false).attackStateLabel === '可攻击', 'label = 可攻击', V.unitView(st, a, 'player', false).attackStateLabel);
    // used
    E.attack(st, a.uid, foe.uid);
    check(V.unitView(st, a, 'player', false).attackState === 'used', '攻击过 → used');
    check(V.unitView(st, a, 'player', false).attackStateLabel === '已攻击', 'label = 已攻击');
    // blocked: 冻结 / 召唤失调
    b.frozen = 1;
    check(V.unitView(st, b, 'player', false).attackState === 'blocked', '被冻结 → blocked');
    check(V.unitView(st, b, 'player', false).attackStateLabel === '冻结', 'label = 冻结', V.unitView(st, b, 'player', false).attackStateLabel);
    c.sick = true;
    check(V.unitView(st, c, 'player', false).attackStateLabel === '召唤失调', '刚部署 → label = 召唤失调', V.unitView(st, c, 'player', false).attackStateLabel);
    // idle：不是这一方的回合
    const st4 = fresh();
    const mine = T.spawnUnit(st4, 'player', 'c5'); T.placeUnit(st4, 'player', mine, 0);
    mine.sick = false;
    st4.active = 'boss';
    const iv = V.unitView(st4, mine, 'player', false);
    check(iv.attackState === 'idle', '不是自己回合 → idle', iv.attackState);
    check(iv.attackStateLabel === '', 'idle 时不显示状态文案', JSON.stringify(iv.attackStateLabel));
    // 徽章
    const st5 = fresh();
    const t1 = T.spawnUnit(st5, 'player', 'c2'); T.placeUnit(st5, 'player', t1, 0);   // 锁链
    check(V.unitView(st5, t1, 'player', false).badges.some((x) => x.kind === 'taunt'), '锁链徽章');
  }

  // ---------- ③ 待选择时只有候选可点 ----------
  console.log('\n[3] 待选择时只有候选可点（不会误点自己的船）');
  {
    const st = fresh(['h3', 'c5']);
    const mine = T.spawnUnit(st, 'player', 'c5'); T.placeUnit(st, 'player', mine, 0);
    const foe1 = T.spawnUnit(st, 'boss', 't_grunt'); T.placeUnit(st, 'boss', foe1, 0);
    const foe2 = T.spawnUnit(st, 'boss', 't_grunt'); T.placeUnit(st, 'boss', foe2, 1);
    E.deploy(st, 'player', 'h3', 1);
    check(!!st.pending, '已进入待选择');
    const pb = V.boardView(st, 'player', null);
    const bb = V.boardView(st, 'boss', null);
    check(pb.every((s) => !s.clickable), '待选择时**己方棋盘没有可点格子**', JSON.stringify(pb.map((s) => s.clickable)));
    const clickableBoss = bb.filter((s) => s.clickable);
    check(clickableBoss.length === 2, '敌方棋盘恰好 2 个可点（= 候选数）', String(clickableBoss.length));
    check(clickableBoss.every((s) => s.tone === 'tgt'), '候选格子的 tone = tgt');
    check(clickableBoss.every((s) => s.unit && st.pending.cands.indexOf(s.unit.uid) >= 0), '可点的都是候选');
    // 候选之外的单位不可点
    const other = T.spawnUnit(st, 'boss', 't_grunt'); T.placeUnit(st, 'boss', other, 2);
    const bb2 = V.boardView(st, 'boss', null);
    const otherSlot = bb2[2];
    check(otherSlot.clickable === false, '不在候选里的敌方单位不可点');
  }

  // ---------- ④ 舰队池 / BOSS / 墓地 / 结束回合 ----------
  console.log('\n[4] 舰队池 / BOSS 面板 / 墓地 / 结束回合');
  {
    const st = fresh();
    T.spawnUnit(st, 'player', 'h1'); // 先造个墓地素材
    const pool = V.poolView(st);
    check(pool.length > 0, 'poolView 返回卡牌', String(pool.length));
    const first = pool[0];
    check(typeof first.cost === 'number' && typeof first.playable === 'boolean' && typeof first.count === 'number', '卡牌含 cost/playable/count');
    check(typeof first.text === 'string' && first.text.length > 0, '卡牌含技能文案（供信息条用）');
    check(typeof first.artSrc === 'string' && first.artSrc.length > 0, '卡牌含图位路径', first.artSrc);
    // 费用：财团主席舰降费后 pool 的 cost 要跟着变
    const cheap = fresh();
    cheap.costReduce = 2;
    const p2 = V.poolView(cheap).find((c) => c.id === 'h4');
    check(!!p2 && p2.cost === E.costOf(cheap, 'player', 'h4'), '卡牌费用取 E.costOf（会随降费变化）', p2 ? String(p2.cost) : 'missing');

    const bv = V.bossView(st);
    check(bv.hp === st.boss.body && bv.hpMax === st.boss.bodyMax, 'BOSS 血量与状态一致');
    check(bv.hpPct > 0 && bv.hpPct <= 100, 'hpPct 在 0~100', String(bv.hpPct));
    check(typeof bv.artSrc === 'string' && bv.artSrc.indexOf('b2') >= 0, 'BOSS 头像路径含 bossId', bv.artSrc);

    const st6 = fresh();
    const dead = T.spawnUnit(st6, 'player', 'c1'); T.placeUnit(st6, 'player', dead, 0);
    T.damageUnit(st6, dead, 99, false); T.cleanup(st6);
    const gv = V.graveView(st6);
    check(gv.total === 1 && gv.chips.length === 1, '墓地条显示阵亡友舰', JSON.stringify(gv.chips));
    check(gv.chips[0].pickable === false, '非"召回"待选择时墓地不可点');
    const st7 = fresh(['h6']);
    const d2 = T.spawnUnit(st7, 'player', 'c1'); T.placeUnit(st7, 'player', d2, 0);
    T.damageUnit(st7, d2, 99, false); T.cleanup(st7);
    E.deploy(st7, 'player', 'h6', 1);
    check(st7.pending && st7.pending.kind === 'revive', '已进入"召回"待选择');
    const gv2 = V.graveView(st7);
    check(gv2.chips.length === 1 && gv2.chips[0].pickable === true, '"召回"待选择时墓地可点', JSON.stringify(gv2.chips));

    check(V.canEndTurn(fresh()) === true, '玩家回合且无待选择 → 可以结束回合');
    const st8 = fresh(); st8.active = 'boss';
    check(V.canEndTurn(st8) === false, '非玩家回合 → 不能结束回合');
    const st9 = fresh(['h3']);
    const g1 = T.spawnUnit(st9, 'boss', 't_grunt'); T.placeUnit(st9, 'boss', g1, 0);
    E.deploy(st9, 'player', 'h3', 0);
    check(V.canEndTurn(st9) === false, '有待选择 → 不能结束回合（避免误跳过）');
    const st10 = fresh(); st10.over = true;
    check(V.canEndTurn(st10) === false, '战斗已结束 → 不能结束回合');
  }

  console.log('\n=== P4 展示逻辑验收结果 ===');
  if (fails.length === 0) console.log('  全部通过 ✓');
  else { console.log('  ' + fails.length + ' 条失败 ✗'); process.exitCode = 1; }
})().catch((e) => {
  console.error('验收脚本自身出错：', e && e.stack ? e.stack.split('\n').slice(0, 10).join('\n') : e);
  process.exitCode = 2;
});
