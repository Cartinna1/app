'use strict';
/* ============================================================================
   手动操作闸门验收（2026-08 用户报「上了一艘战舰后指挥度还剩 2，却再也上不了任何卡」）
   用法：node --import ./scripts/register-ts.mjs scripts/check-battle-manual.cjs

   用户实证的两条同时成立、互相矛盾的表象：
     · 顶栏「回合 1/20 指挥度 2/4 行动方 玩家」（还剩 2 点，池里还有 1 费卡）
     · 底部「（自动战斗）正在替你行动…」，而按钮写着「自动战斗」（= 没开自动）

   根因：DEMO 里**没有** `busy` 这个组件态，`auto` 开关也是移植时新加的。原先 `busy` 同时被当成
     ① 输入闸门（`if (battle.over || busy || battle.active !== 'player') return;`）
     ② 底部文案的分支条件  ③「结束回合」的禁用条件
   而 `setBusy(false)` **只写在两条自动推进的 effect 里**（BOSS 回合结束 / 自动战斗出手）。
   → 玩家在自己回合手动部署一次就 `setBusy(true)`，之后轮到玩家时**没有任何代码清它**：
     点击被静默吞掉，底部还渲染成"自动战斗正在替你行动"。

   本脚本两部分：
     [A] 静态：`busy` 不得再作为闸门/文案存在；闸门与文案必须读同一个 lib 判定（manualActionView）。
     [B] 行为（真引擎 + 真状态）：复现"手动出一手 → BOSS 回合 → 回到玩家"这条链，
         并断言 manualActionView 在**未开自动 + 轮到玩家**时说 canAct=true、且不说"正在替你行动"；
         同时反向钉住：开自动时手动**必须**被屏蔽（这是对的），但那是 auto 判的，不是 busy。
   ============================================================================ */
const fs = require('fs');
const path = require('path');

const fails = [];
const check = (ok, label, detail) => {
  if (ok) console.log('  ✓ ' + label);
  else { fails.push(label + (detail ? ' → ' + detail : '')); console.log('  ✗ ' + label + (detail ? '  → ' + detail : '')); }
};

const ROOT = path.resolve(__dirname, '..');
const screenSrc = fs.readFileSync(path.join(ROOT, 'src/components/battle/BattleScreen.tsx'), 'utf8');
const viewSrc = fs.readFileSync(path.join(ROOT, 'src/lib/battle/view.ts'), 'utf8');

(async () => {
  const E = await import('@/lib/battle/engine');
  const V = await import('@/lib/battle/view');
  const T = E._t;

  // ---------- [A] 静态：闸门不许再是组件态 ----------
  console.log('\n[A] 静态：输入闸门与底部文案必须同源（不许再用组件态 busy）');
  {
    // 去注释后再判，避免把"解释坑的注释"当成代码
    const code = screenSrc
      .replace(/\/\*[\s\S]*?\*\//g, '')
      .replace(/\/\/[^\n]*/g, '');
    check(!/\bbusy\b/.test(code), 'BattleScreen.tsx 的代码里不再出现 busy（组件态已删除）',
      (code.match(/.*\bbusy\b.*/) || [''])[0].trim().slice(0, 80));
    check(!/useState[^\n]*busy/.test(code), '没有 busy 的 useState');
    check(screenSrc.indexOf('manualActionView') >= 0, 'BattleScreen 读 lib 的 manualActionView');
    const gateUses = (code.match(/manual\.canAct/g) || []).length;
    check(gateUses >= 4, '4 个输入处理器都读同一个 manual.canAct（实测 ' + gateUses + ' 处）');
    check(/defaultHint[\s\S]{0,400}manual\.autoHint/.test(code) && /manual\.reason/.test(code),
      '底部文案读 manual.autoHint / manual.reason（唯一真值）');
    // 旧的两条分叉判据不许复活
    check(!/'（自动战斗）正在替你行动…'/.test(code),
      'BattleScreen 里不再有写死的「（自动战斗）正在替你行动…」（它只许来自 lib）');
    // 组件只许把 battle.active 用于**视觉**（行动方配色）；输入闸门必须读 manual.canAct
    const handlers = ['onPoolClick', 'onPlayerSlot', 'onBossTarget', 'endTurn'];
    const badHandlers = handlers.filter((name) => {
      const m = code.match(new RegExp('const ' + name + ' = \\([^)]*\\) => \\{([\\s\\S]*?)\\n  \\};'));
      if (!m) return true;
      return m[1].indexOf('manual.canAct') < 0;
    });
    check(badHandlers.length === 0,
      '4 个输入处理器（' + handlers.join(' / ') + '）的第一步都读 manual.canAct',
      badHandlers.join(', '));
    check(viewSrc.indexOf('export function manualActionView') >= 0, 'view.ts 导出 manualActionView');
    check(/if \(auto\)/.test(viewSrc) || /auto\)\s*\{/.test(viewSrc),
      'view.ts 的 auto 分支存在（开自动时手动被屏蔽）');
  }

  // ---------- [B] 行为：真状态 + 真展示模型 ----------
  console.log('\n[B] 行为：手动出一手后回到玩家，闸门必须是开的（复现用户那一帧）');
  {
    // 用户那一帧：后手开局的玩家第 1 回合指挥度 4/4，池里有 2 费与 1 费卡
    const st = E.createBattle({ seed: 20260815, bossId: 'b2', playerFirst: true });
    st.player.pool = ['g2', 'c1', 'g1'];   // 2 费（雇佣兵炮舰）+ 两张 1 费
    st.player.ownTurns = 1;
    st.player.cap = 4; st.player.cur = 4;  // 后手的 4 指挥度
    check(st.active === 'player' && !st.over, '前置：轮到玩家、战斗未结束',
      st.active + '/' + String(st.over));

    // 手动部署 2 费（= 用户截图里的「雇佣兵炮舰」）→ 指挥度 2/4
    const before = V.manualActionView(st, false);
    check(before.canAct === true, '部署前：未开自动 + 轮到玩家 → canAct = true');
    check(before.autoHint === '', '部署前：未开自动 → autoHint 为空串（不许说"正在替你行动"）');
    const r = E.deploy(st, 'player', 'g2', 0);
    check(r.ok === true, '引擎接受这次部署', r.msg || '');
    check(st.player.cur === 2, '指挥度剩 2/4（与用户截图一致）', String(st.player.cur));
    check(st.active === 'player', '部署是"回合内动作"，部署后行动方仍是玩家（DEMO 口径）', st.active);

    // 这一帧：闸门必须是开的（旧代码在这里被 busy 永久锁死）
    const stuck = V.manualActionView(st, false);
    check(stuck.canAct === true, '部署后（未开自动）：canAct 仍为 true —— 还能继续上 1 费卡',
      JSON.stringify(stuck));
    check(stuck.autoHint === '', '部署后（未开自动）：autoHint 仍为空串');
    check(stuck.reason.indexOf('正在替你行动') < 0, '底部文案里绝不许出现"正在替你行动"', stuck.reason);
    // 池里还有 1 费卡 → 引擎层面确实还能出牌（证明"不是本来就不该出牌"）
    check(E.canDeploy(st, 'player', 'c1') === true, '引擎层面 1 费卡仍可部署（canDeploy）');

    // 旧闸门（busy=true 的那一帧）与"同一个值派生了多份"的对照：busy 只活在两条自动 effect 里
    const autoEffects = (screenSrc.match(/setBusy\(false\)/g) || []).length;
    check(autoEffects === 0, '已删除的 setBusy(false) 不会再回来（旧代码只有 2 处，全在自动推进的 effect 里）',
      String(autoEffects));

    // 打完这一手 → 结束回合 → BOSS 回合 → 回到玩家：闸门必须重新是开的
    E.endTurn(st);                                  // 玩家结束回合（引擎内部交给 BOSS）
    check(st.over || st.active === 'boss', '玩家结束回合后行动方变成 BOSS', st.active);
    if (!st.over) {
      E.aiTurn(st, 'boss');
      check(st.active === 'player' || st.over, 'BOSS 回合结束后回到玩家（或战斗结束）', st.active);
      if (!st.over) {
        const back = V.manualActionView(st, false);
        check(back.canAct === true, '回到玩家后：canAct = true（新的一回合照常能手动操作）',
          JSON.stringify(back));
        check(back.autoHint === '', '回到玩家后：autoHint 仍为空串');
      }
    }
  }

  // ---------- [B2] 反向复现：把旧的 `busy` 状态机照搬进来跑同一帧（证明"修前确实卡死"） ----------
  // 组件无法在 Node 里渲染（本机没装 React），但 `busy` 的**状态机只有 3 处写入**，可以逐字照搬：
  //   · userAction（任何一次手动点击）→ busy = true
  //   · BOSS 回合的 effect 收尾 → busy = false
  //   · 自动战斗出手 → busy = false
  // 把这三条编成"演示器"，与新的 lib 判定逐帧对比：修前点击被吞、底部谎称自动；修后两者一致。
  console.log('\n[B2] 反向复现：旧 busy 状态机 vs 新 manualActionView（同一帧）');
  {
    const busyWrites = [
      { where: 'userAction（玩家手动点击）', value: true },
      { where: 'BOSS 回合 effect 收尾', value: false },
      { where: '自动战斗出手 effect', value: false },
    ];
    // 复现：轮到玩家 → 手动点一次（deploy）→ 这一帧的 active 仍是 player（部署是回合内动作）
    let busy = false;
    busy = busyWrites[0].value;                 // 玩家点了"部署"
    const st = E.createBattle({ seed: 1, bossId: 'b2', playerFirst: true });
    st.player.pool = ['g2', 'c1']; st.player.ownTurns = 1; st.player.cap = 4; st.player.cur = 4;
    E.deploy(st, 'player', 'g2', 0);
    const idle = busyWrites.slice(1);           // 还没触发的两条（都在自动推进路径上，此刻 active 仍是 player）
    check(busy === true, '复现：手动点击后 busy = true（照搬旧代码的写入）');
    check(st.active === 'player',
      '复现：部署是回合内动作 → active 仍是 player → 后面两条清 busy 的 effect 都不会触发（' + idle.map((x) => x.where).join(' / ') + '）');
    // 旧口径：输入闸门 + 底部文案
    const oldGateBlocks = st.over || busy || st.active !== 'player';
    const oldBottomText = oldGateBlocks && st.active === 'player' ? '（自动战斗）正在替你行动…' : '';
    check(oldGateBlocks === true, '★ 修前：旧闸门 `over || busy || active!==player` = true → 点谁都进不到处理器');
    check(oldBottomText === '（自动战斗）正在替你行动…',
      '★ 修前：底部渲染出「（自动战斗）正在替你行动…」（而按钮读 auto = 未开自动）', oldBottomText);
    // 新口径：同一帧
    const now = V.manualActionView(st, false);
    check(now.canAct === true, '★ 修后：同一帧 manualActionView.canAct = true → 手动可点（还能继续上 1 费卡）');
    check(now.autoHint === '', '★ 修后：底部绝不出现"正在替你行动"（未开自动）');
    check(E.canDeploy(st, 'player', 'c1') === true, '★ 修后：引擎层面 1 费卡确实可出（证明不是"本来就不该出牌"）');
    check(!(st.over || st.active !== 'player'),
      '★ 旧闸门里真正拦人的是 busy（`over` 为假、`active` 是 player → 另外两项都不拦）');
    check(E.canDeploy(st, 'player', 'c1') === true && now.canAct === true && oldGateBlocks === true,
      '★ 结论：引擎说"这张卡能出"、新判定说"能点"，而旧闸门说"拦死" —— 这一帧就是用户看到的"看起来在玩家回合、实际点不动"');
  }

  // ---------- [C] 自动模式：手动确实该被屏蔽（这是对的），但判据是 auto 不是 busy ----------
  console.log('\n[C] 开自动时手动被屏蔽（对的），且文案由同一份判定给出');
  {
    const st = E.createBattle({ seed: 5, bossId: 'b2', playerFirst: true });
    st.player.pool = ['g2', 'c1'];
    st.player.cur = 4;
    const on = V.manualActionView(st, true);
    check(on.canAct === false, '开自动 + 轮到玩家 → canAct = false（手动被屏蔽，符合预期）');
    check(on.reason.length > 0, '被屏蔽时**必须**有中文原因（不是静默 return）', on.reason);
    check(on.autoHint.indexOf('正在替你行动') >= 0, '开自动时 autoHint 才说"正在替你行动"', on.autoHint);
    // BOSS 回合：不受 auto 影响，一律不可手动
    const st2 = E.createBattle({ seed: 6, bossId: 'b2', playerFirst: false });
    const bossTurn = V.manualActionView(st2, false);
    check(bossTurn.canAct === false, 'BOSS 回合 → canAct = false（未开自动也一样）');
    check(bossTurn.autoHint === '', 'BOSS 回合且未开自动 → autoHint 为空串（别谎称自动）');
    check(bossTurn.reason.length > 0, 'BOSS 回合有原因文案', bossTurn.reason);
    // 战斗结束
    st2.over = true; st2.reason = '玩家本体结构值 ≤ 0';
    const over = V.manualActionView(st2, false);
    check(over.canAct === false && over.reason.indexOf('战斗已结束') >= 0, '战斗结束 → 不可操作并给出结束原因', over.reason);
    // 待选择
    const st3 = E.createBattle({ seed: 9, bossId: 'b2', playerFirst: true });
    st3.player.pool = ['h3'];
    st3.player.cur = 9;
    const e1 = T.spawnUnit(st3, 'boss', 't_grunt'); T.placeUnit(st3, 'boss', e1, 0);
    const e2 = T.spawnUnit(st3, 'boss', 't_grunt'); T.placeUnit(st3, 'boss', e2, 1);
    E.deploy(st3, 'player', 'h3', 0);
    const pend = V.manualActionView(st3, false);
    check(!!st3.pending && pend.canAct === false, '待选择时 canAct = false（先选完目标）');
    check(pend.reason.indexOf('点选目标') >= 0, '待选择的原因写明"点选目标"', pend.reason);
    check(pend.autoHint === '', '待选择且未开自动 → autoHint 为空串');
  }

  console.log('\n=== 手动闸门验收结果 ===');
  if (fails.length === 0) console.log('  全部通过 ✓');
  else { console.log('  ' + fails.length + ' 条失败 ✗'); process.exitCode = 1; }
})().catch((e) => {
  console.error('验收脚本自身出错：', e && e.stack ? e.stack.split('\n').slice(0, 10).join('\n') : e);
  process.exitCode = 2;
});
