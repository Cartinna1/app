'use strict';
/* ============================================================================
   把 DEMO 的定点规则断言（rules-test.js，96 处 check）**原样跑在移植版引擎上**
   用法：node --import ./scripts/register-ts.mjs scripts/parity-rules-test.cjs
   做法：读 DEMO 的 rules-test.js，只把 `require('./engine.js')` 换成移植版引擎
        （经 globalThis 注入，避免 CJS require ESM 的不确定性），其余一字不改。
   ============================================================================ */
const fs = require('fs');
const os = require('os');
const path = require('path');

const SRC = path.resolve(__dirname, '../../carddemo/rules-test.js');

(async () => {
  const mod = await import('@/lib/battle/engine');
  globalThis.__PARITY_ENGINE__ = mod.default && mod.default.createBattle ? mod.default : mod;

  const src = fs.readFileSync(SRC, 'utf8');
  const patched = src.replace(
    /const E = require\(['"]\.\/engine\.js['"]\);/,
    'const E = globalThis.__PARITY_ENGINE__;'
  );
  if (patched === src) {
    console.error('没能替换 rules-test.js 里的引擎引用（源文件格式变了？）');
    process.exit(2);
  }
  const tmp = path.join(os.tmpdir(), 'parity-rules-' + process.pid + '.cjs');
  fs.writeFileSync(tmp, patched, 'utf8');
  console.log('=== 把 DEMO 的定点规则断言跑在【移植版引擎】上 ===');
  try {
    require(tmp);
  } finally {
    try { fs.unlinkSync(tmp); } catch {}
  }
})().catch((e) => {
  console.error('脚本自身出错：', e && e.stack ? e.stack.split('\n').slice(0, 8).join('\n') : e);
  process.exitCode = 2;
});
