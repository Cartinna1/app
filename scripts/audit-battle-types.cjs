'use strict';
/* 类型风险扫描（没有 tsc 时的替代手段）：未使用的 import、any、非空断言、TS 禁用指令 */
const fs = require('fs');
const path = require('path');

const FILES = [
  'src/lib/battle/engine.ts',
  'src/lib/battle/rng.ts',
  'src/types/battle.ts',
  'src/data/battle/tuning.ts',
];
const ROOT = path.resolve(__dirname, '..');
let issues = 0;

for (const rel of FILES) {
  const p = path.join(ROOT, rel);
  if (!fs.existsSync(p)) { console.log('  （缺文件 ' + rel + '）'); continue; }
  const src = fs.readFileSync(p, 'utf8');
  const lines = src.split('\n');
  const out = [];

  // 1) 未使用的 import
  const importRe = /^import\s+(?:type\s+)?\{([^}]+)\}\s+from\s+['"]([^'"]+)['"];?/gm;
  let m;
  while ((m = importRe.exec(src))) {
    for (const raw of m[1].split(',')) {
      const name = raw.trim().split(/\s+as\s+/).pop().trim();
      if (!name) continue;
      const uses = (src.match(new RegExp('\\b' + name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '\\b', 'g')) || []).length;
      if (uses <= 1) out.push(`未使用的 import：${name}（来自 ${m[2]}）`);
    }
  }
  // 2) any / 非空断言 / 禁用指令
  lines.forEach((l, i) => {
    const t = l.trim();
    if (/:\s*any\b/.test(l) || /\bas\s+any\b/.test(l)) out.push(`L${i + 1} 出现 any：${t.slice(0, 90)}`);
    if (/@ts-(ignore|nocheck|expect-error)/.test(l)) out.push(`L${i + 1} TS 禁用指令：${t.slice(0, 90)}`);
    if (/eslint-disable/.test(l)) out.push(`L${i + 1} eslint 禁用：${t.slice(0, 90)}`);
  });
  const bang = (src.match(/\w+!\s*[.;,)\]]/g) || []).length;
  // 3) 导出面清单（人工核对类型是否写全）
  const exps = [];
  const expRe = /^export\s+(?:async\s+)?(?:function|const|type|interface)\s+(\w+)/gm;
  while ((m = expRe.exec(src))) exps.push(m[1]);

  console.log('=== ' + rel + '（' + lines.length + ' 行）===');
  console.log('  导出 ' + exps.length + ' 个：' + exps.join(', '));
  console.log('  非空断言(!) 出现 ' + bang + ' 次');
  if (out.length === 0) console.log('  ✓ 未发现未使用 import / any / 禁用指令');
  else { issues += out.length; out.slice(0, 20).forEach((o) => console.log('  ⚠ ' + o)); }
  console.log('');
}
console.log(issues === 0 ? '扫描结论：无风险项 ✓' : '扫描结论：' + issues + ' 项需人工确认 ⚠');
