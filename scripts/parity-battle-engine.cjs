'use strict';
/* ============================================================================
   P1 对拍测试：DEMO 的 JS 引擎 ↔ 主游戏的 TS 引擎
   用法：node --import ./scripts/register-ts.mjs scripts/parity-battle-engine.cjs
   判据：同一 seed、同一敌人、同一编制下，**胜负 / 回合数 / 结束原因 / 双方永久损失 /
        双方本体剩余 / 完整战斗日志** 必须逐场一致。
   为什么比对"完整日志"：它是规则执行的完整轨迹，比只看胜负更能抓出细微走样
        （实现细节差异引起的数值/顺序偏差都会在某一行的文本上暴露）。
   ============================================================================ */
const path = require('path');

const DEMO = require(path.resolve(__dirname, '../../carddemo/engine.js'));

const BOSSES = ['b1', 'b2', 'b3', 'b4', 'b5', 'raid'];
const FLEETS = ['starter', 'all'];
const N_PER_GROUP = Number(process.env.PARITY_N || 200);

(async () => {
  // PARITY_SELF=1 时用 DEMO 自己跟自己拍 —— 用于自检对拍脚本本身（应当 100% 一致）
  let PORT;
  if (process.env.PARITY_SELF === '1') {
    PORT = DEMO;
    console.log('  （自检模式 PARITY_SELF=1：两边都是 DEMO 引擎）');
  } else {
    const mod = await import('@/lib/battle/engine');
    PORT = mod.default && mod.default.createBattle ? mod.default : mod;
  }

  const missing = ['createBattle', 'aiTurn'].filter((k) => typeof PORT[k] !== 'function');
  if (missing.length) {
    console.error('移植版缺少导出：' + missing.join(', ') + '（现有导出：' + Object.keys(PORT).join(', ') + '）');
    process.exit(2);
  }

  const fails = [];
  let compared = 0;

  const run = (E, seed, bossId, fleet) => {
    const st = E.createBattle({ seed, bossId, fleet });
    let guard = 0;
    while (!st.over && guard++ < 500) E.aiTurn(st, st.active);
    return st;
  };
  const snap = (st) => ({
    winner: st.winner,
    rounds: st.round,
    reason: st.reason,
    pLost: (st.player.lost || []).join(','),
    bLost: (st.boss.lost || []).join(','),
    pBody: st.player.body,
    bBody: st.boss.body,
    log: (st.log || []).join('\n'),
  });

  for (const fleet of FLEETS) {
    for (const bossId of BOSSES) {
      let groupFail = 0;
      for (let i = 0; i < N_PER_GROUP; i++) {
        const seed = 900001 + i * 13;
        let a, b;
        try {
          a = snap(run(DEMO, seed, bossId, fleet));
        } catch (e) {
          fails.push(`${fleet}/${bossId}/seed${seed}: DEMO 抛错 ${e.message}`);
          groupFail++;
          continue;
        }
        try {
          b = snap(run(PORT, seed, bossId, fleet));
        } catch (e) {
          fails.push(`${fleet}/${bossId}/seed${seed}: 移植版抛错 ${e.message}`);
          groupFail++;
          continue;
        }
        compared++;
        const diffs = Object.keys(a).filter((k) => a[k] !== b[k]);
        if (diffs.length) {
          groupFail++;
          if (fails.length < 12) {
            const k = diffs[0];
            let detail = '';
            if (k === 'log') {
              const la = a.log.split('\n'), lb = b.log.split('\n');
              const at = la.findIndex((l, idx) => l !== lb[idx]);
              detail = `日志第 ${at + 1} 行起不同：DEMO「${(la[at] || '').trim()}」vs 移植「${(lb[at] || '').trim()}」`;
            } else {
              detail = `${k}: DEMO ${JSON.stringify(a[k])} vs 移植 ${JSON.stringify(b[k])}`;
            }
            fails.push(`${fleet}/${bossId}/seed${seed}: ${detail}`);
          }
        }
      }
      console.log('  ' + fleet.padEnd(8) + bossId.padEnd(6) + (groupFail === 0 ? '一致 ✓' : groupFail + ' / ' + N_PER_GROUP + ' 场不一致 ✗'));
    }
  }

  console.log('');
  console.log('=== P1 对拍结果 ===');
  console.log('  比对场次：' + compared + '（' + FLEETS.length + ' 编制 × ' + BOSSES.length + ' 敌人 × ' + N_PER_GROUP + ' seed）');
  if (fails.length === 0 && compared > 0) {
    console.log('  结论：DEMO 与移植版逐场完全一致（含完整战斗日志）✓');
  } else {
    console.log('  结论：' + fails.length + ' 处不一致 ✗（最多列 12 条）');
    fails.slice(0, 12).forEach((f) => console.log('   - ' + f));
    process.exitCode = 1;
  }
})().catch((e) => {
  console.error('对拍脚本自身出错：', e && e.stack ? e.stack.split('\n').slice(0, 6).join('\n') : e);
  process.exitCode = 2;
});
