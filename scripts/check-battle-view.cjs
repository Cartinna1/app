'use strict';
/* ============================================================================
   P4 验收：战斗 UI 的**展示逻辑**（纯函数，不需要 React/DOM）
   用法：node --import ./scripts/register-ts.mjs scripts/check-battle-view.cjs
   为什么测这一层：组件本身没法在 Node 里渲染（本机没装 React），
   但"显示什么"这件事是可判定的 —— DEMO 踩坑换来的三条行为都在这一层：
     ① 信息条是手机端看技能的唯一出口  ② 攻击状态三重区分  ③ 待选择时只有候选可点
   外加一条 2026-08 补的防线（[3b]）：**手动操作链的第一跳**——己方战舰 / 已选卡牌的空格
   必须 `clickable = true`，否则组件（`BoardSide`）在 onClick 第一行就 return，玩家点哪都没反应。
   ============================================================================ */
const fails = [];
const fs = require('fs');
const path = require('path');
const check = (ok, label, detail) => {
  if (ok) console.log('  ✓ ' + label);
  else { fails.push(label + (detail ? ' → ' + detail : '')); console.log('  ✗ ' + label + (detail ? '  → ' + detail : '')); }
};

(async () => {
  const E = await import('@/lib/battle/engine');
  const V = await import('@/lib/battle/view');
  const T = E._t;

  const need = ['unitView', 'boardView', 'poolView', 'infoBarView', 'bossView', 'graveView', 'canEndTurn', 'manualActionView'];
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

  // ---------- ③b 手动操作链的第一跳：clickable 必须是「点得动」而非「视觉分类」 ----------
  // 2026-08 用户报「自动战斗能跑，手动点了没反应」：`BoardSide` 的 onClick 第一行是
  // `if (!s.clickable) return;`（DEMO 是把事件委托挂在整块棋盘上的，没有这道闸门），
  // 而 boardView 当时只把「待选择候选」与「BOSS 侧合法目标」标成 clickable
  // → 点己方战舰、点自己场上空格**永远进不到处理器**，部署与攻击两条手动路径一起死。
  console.log('\n[3b] 手动操作链：己方战舰 / 部署空格必须 clickable（点了没反应的根因防线）');
  {
    // 点卡（组件里的 setSelCard）→ 点自己场上空格 → 该格必须可点
    const st = fresh(['h1', 'c5']);
    const selCard = st.player.pool[0];
    check(E.canDeploy(st, 'player', selCard) === true, '前置：选中的卡确实买得起/有空位（canDeploy）', selCard);
    const slots = V.boardView(st, 'player', null, selCard);
    const empties = slots.filter((s) => !s.unit);
    check(empties.length === 6, '开始空场：6 个空格');
    check(empties.every((s) => s.tone === 'can'), '已选卡牌 → 空格 tone = can（视觉）');
    check(empties.every((s) => s.clickable), '已选卡牌 → 空格 clickable = true（否则点了没反应）',
      JSON.stringify(empties.map((s) => s.clickable)));
    // 没选卡时空格不可点（点了只能是那句提示）
    check(V.boardView(st, 'player', null, null).every((s) => !s.clickable), '没选卡时空格不可点');

    // 点己方场上战舰（能攻击的 / 不能攻击的都要能点：信息条要说明原因）
    const mine = T.spawnUnit(st, 'player', 'c5'); T.placeUnit(st, 'player', mine, 0); mine.sick = false;
    const idle = T.spawnUnit(st, 'player', 'c5'); T.placeUnit(st, 'player', idle, 1); idle.sick = true; // 召唤失调
    const pv = V.boardView(st, 'player', null, null);
    check(pv[0].tone === 'act' && pv[0].clickable === true, '可攻击的己方战舰 clickable = true（能选中）',
      pv[0].tone + '/' + pv[0].clickable);
    check(pv[1].clickable === true, '不能攻击的己方战舰也要 clickable = true（选了才能看到"召唤失调"的原因）',
      String(pv[1].clickable));

    // 选中己方战舰 → 敌方合法目标可点（点敌目标才派发 attack）
    const foe = T.spawnUnit(st, 'boss', 'c5'); T.placeUnit(st, 'boss', foe, 0);
    const bs = V.boardView(st, 'boss', mine.uid, null);
    check(bs[0].clickable === true && bs[0].tone === 'tgt', '选中己方舰 → 敌方目标可点', bs[0].clickable + '/' + bs[0].tone);
    check(V.boardView(st, 'boss', null, null)[0].clickable === false, '没选己方舰时敌方目标不可点（先选攻击者）');

    // 不是玩家回合 / 战斗已结束：己方格子一律不可点（点了也不该有任何反应）
    const stTurn = fresh(['h1']);
    const u1 = T.spawnUnit(stTurn, 'player', 'c5'); T.placeUnit(stTurn, 'player', u1, 0); u1.sick = false;
    stTurn.active = 'boss';
    check(V.boardView(stTurn, 'player', null, stTurn.player.pool[0]).every((s) => !s.clickable),
      '不是玩家回合 → 己方格子全部不可点（含空格）');
    const stOver = fresh(['h1']);
    const u2 = T.spawnUnit(stOver, 'player', 'c5'); T.placeUnit(stOver, 'player', u2, 0); u2.sick = false;
    stOver.over = true;
    check(V.boardView(stOver, 'player', null, null).every((s) => !s.clickable), '战斗已结束 → 己方格子全部不可点');
  }

  // ---------- ③c 「能不能读」≠「能不能出」（2026-08 用户报：灰卡的技能在手机上无处可看） ----------
  // 用户实测：点可上的卡 ✓ 能选中、信息条给技能全文；点灰卡（指挥度不足）✗ 只弹一句原因、**选不中**
  // → `FleetPool` 的 title 是桌面专属的悬浮提示，手机没有 hover ⇒ 那张卡的技能在全游戏里没有出口。
  // 口径：`selectable`（能不能读）与 `playable`（能不能出）**必须分开**；出不去时在**部署那一步**给原因。
  console.log('\n[3c] 灰卡照样能选中读技能；出不去在部署那一步给原因（两个值必须分开）');
  {
    const st = fresh();
    st.player.pool = ['h1', 'h7'];   // 1 费（可出）与 6 费（指挥度不足）
    st.player.cur = 3;
    const pool = V.poolView(st);
    const cheap = pool.find((c) => c.id === 'h1');
    const pricey = pool.find((c) => c.id === 'h7');
    check(!!cheap && !!pricey, '前置：池里有可出与不可出各一张', pool.map((c) => c.id + ':' + c.cost).join(','));
    check(cheap.selectable === true && cheap.playable === true, '可出的卡：selectable 与 playable 都为 true',
      JSON.stringify([cheap.selectable, cheap.playable]));
    check(pricey.selectable === true, '★ 指挥度不足的卡仍然 selectable = true（能点开看技能）',
      String(pricey.selectable));
    check(pricey.playable === false, '★ 指挥度不足的卡 playable = false（出不去）',
      String(pricey.playable));
    check(pricey.playable !== pricey.selectable, '★ 两个值分开了（合成一个值的后果 = 灰卡技能无处可看）');
    // ① 选中的灰卡必须能在信息条里读到技能全文
    const greyInfo = V.infoBarView(st, 'h7', null);
    check(greyInfo.kind === 'card', '灰卡被选中 → 信息条 kind = card（技能出口在信息条）', greyInfo.kind);
    check(greyInfo.body === E.CARDS.h7.text, '★ 信息条给出该灰卡的**技能全文**',
      JSON.stringify(greyInfo.body).slice(0, 40));
    check(greyInfo.stats.indexOf('费用') < 0 && greyInfo.stats.indexOf('费') >= 0,
      '信息条带费用与数值（系列·稀有度 / 攻盾体）', greyInfo.stats);
    // ② 部署灰卡被引擎拦住，且原因就是那句"指挥度不够"
    check(E.canDeploy(st, 'player', 'h7') === false, '引擎层：灰卡 canDeploy = false');
    const blocked = E.deploy(st, 'player', 'h7', 0);
    check(blocked.ok === false && typeof blocked.msg === 'string' && blocked.msg.length > 0,
      '★ 部署灰卡被拦且有非空原因', blocked.msg || '');
    check(st.player.board[0] === null && st.player.pool.indexOf('h7') >= 0, '被拦时场上与池子都没变');
    // ③ 可出的卡照常出得去
    check(E.canDeploy(st, 'player', 'h1') === true, '可出的卡 canDeploy = true');
    check(E.deploy(st, 'player', 'h1', 0).ok === true, '可出的卡能正常部署');
    // ④ title 不是技能出口（手机没有 hover）：组件不得把 title 当成"看过技能了"
    const fp = fs.readFileSync(path.resolve(__dirname, '../src/components/battle/FleetPool.tsx'), 'utf8');
    check(fp.indexOf('title=') >= 0, '（现状）卡面仍带 title 作桌面冗余提示');
    check(/c\.selectable/.test(fp), '★ FleetPool 的点选可用性读 selectable（不是 playable）');
    check(!/import \{[^}]*getThumbPath/.test(fp), 'FleetPool 不再重复套 getThumbPath（artSrc 已是缩略图路径）');
    // ⑤ 非玩家回合：连读都没必要（信息条那时在说明"为什么点不动"）
    const stBoss = fresh();
    stBoss.active = 'boss';
    check(V.poolView(stBoss).every((c) => c.selectable === false && c.playable === false),
      'BOSS 回合：selectable 与 playable 都为 false（点开也没意义）');
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
