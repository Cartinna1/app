'use strict';
/* ============================================================================
   舰船卡牌战斗 · 一键复验（改规则/改数据后都跑它）
   用法：node scripts/check-battle.cjs
   依次跑：
     1. 数据校验    src/data/battle/*.ts ↔ carddemo/engine.js 逐字段
     2. 静态审计    导出面 / 每张卡的 kw·fx / 敌人 / 编制 / 常量 ↔ DEMO
     3. 规则断言    DEMO 的 96 处定点断言跑在【移植版引擎】上
     4. 行为对拍    同 seed 逐场比对（含完整战斗日志）
   样本量：PARITY_N=200（默认），例如 PARITY_N=50 node scripts/check-battle.cjs
   ============================================================================ */
const path = require('path');
const { spawnSync } = require('child_process');

const ROOT = path.resolve(__dirname, '..');
const NODE = process.execPath;
const IMP = ['--import', './scripts/register-ts.mjs'];

const STEPS = [
  ['数据校验（data/battle ↔ DEMO 引擎）', ['scripts/verify-battle-data.cjs'], false],
  ['类型风险扫描（未使用 import / any / 非空断言 / 未使用参数）', ['scripts/audit-battle-types.cjs'], false],
  ['参数扫描（noUnusedParameters）', ['scripts/audit-battle-params.cjs'], false],
  ['静态审计（导出面 / 卡牌行为 / 常量）', ['scripts/audit-battle-port.cjs'], true],
  ['规则断言（DEMO 的 96 处定点断言 → 移植版）', ['scripts/parity-rules-test.cjs'], true],
  ['行为对拍（同 seed 逐场 + 完整日志）', ['scripts/parity-battle-engine.cjs'], true],
  ['战斗状态与存档（版本 / 默认值一致 / 往返 / 旧档 / 舰队不变量 / 不改 prev / 损失写回）', ['scripts/check-battle-state.cjs'], true],
  ['战斗界面展示逻辑（信息条 / 攻击状态三重区分 / 待选择只有候选可点 / 费用 / 墓地）', ['scripts/check-battle-view.cjs'], true],
  ['出征闭环（五个老巢节点 / 出征耗时 / 探明门槛 / 全流程 / 战利品与饥荒减半 / 回合守卫）', ['scripts/check-battle-expedition.cjs'], true],
];

let bad = 0;
for (const [name, args, needLoader] of STEPS) {
  console.log('\n########## ' + name + ' ##########');
  const argv = (needLoader ? IMP : []).concat(args);
  const r = spawnSync(NODE, argv, { stdio: 'inherit', cwd: ROOT });
  if (r.status !== 0) {
    console.log('  ✗ 失败（exit ' + (r.status === null ? 'spawn 失败' : r.status) + '）—— 后续步骤跳过');
    bad++;
    break;
  }
  console.log('  ✓ 通过');
}
console.log('\n=== 复验' + (bad ? '未通过 ✗' : '全部通过 ✓') + ' ===');
if (bad) process.exitCode = 1;
