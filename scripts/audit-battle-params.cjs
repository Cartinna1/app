'use strict';
/* ============================================================================
   未使用【参数】扫描（noUnusedParameters 是构建失败的高风险源，而 grep 查不出）
   做法：找所有带块体函数（方法简写 / function / 带块体的箭头函数）→ 大括号配平取函数体
        → 逐个参数检查名字是否在函数体里出现。控制关键字（if/for/while/switch/catch）跳过。
   用法：node scripts/audit-battle-params.cjs [文件…]   （默认扫 lib/battle 与 types/battle.ts）
   ============================================================================ */
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const FILES = process.argv.slice(2).length
  ? process.argv.slice(2)
  : ['src/lib/battle/engine.ts', 'src/lib/battle/rng.ts', 'src/types/battle.ts', 'src/data/battle/tuning.ts'];

const CONTROL = new Set(['if', 'for', 'while', 'switch', 'catch', 'return', 'typeof', 'function', 'with', 'do', 'else']);

/** 从 `(` 开始找到匹配的 `)` */
function matchParen(s, open) {
  let d = 0;
  for (let i = open; i < s.length; i++) {
    if (s[i] === '(') d++;
    else if (s[i] === ')') { d--; if (d === 0) return i; }
  }
  return -1;
}
/** 从 `{` 开始找到匹配的 `}` */
function matchBrace(s, open) {
  let d = 0;
  for (let i = open; i < s.length; i++) {
    if (s[i] === '{') d++;
    else if (s[i] === '}') { d--; if (d === 0) return i; }
  }
  return -1;
}

let total = 0;
for (const rel of FILES) {
  const p = path.join(ROOT, rel);
  if (!fs.existsSync(p)) continue;
  const src = fs.readFileSync(p, 'utf8');
  const lines = src.split('\n');
  const lineOf = (idx) => src.slice(0, idx).split('\n').length;
  const findings = [];

  const re = /([A-Za-z_$][\w$]*)?\s*\(([^()]*)\)\s*(?::[^={;]*)?(?:=>\s*)?\{/g;
  let m;
  while ((m = re.exec(src))) {
    const name = m[1] || '';
    if (CONTROL.has(name)) continue;
    const openParen = src.indexOf('(', m.index);
    const closeParen = matchParen(src, openParen);
    if (closeParen < 0) continue;
    const paramsRaw = src.slice(openParen + 1, closeParen);
    if (!paramsRaw.trim()) continue;
    const braceIdx = src.indexOf('{', closeParen);
    if (braceIdx < 0 || braceIdx - closeParen > 60) continue;   // 太远说明不是这个函数的函数体
    const end = matchBrace(src, braceIdx);
    if (end < 0) continue;
    const body = src.slice(braceIdx, end);
    const params = paramsRaw.split(',').map((x) => x.trim()).filter(Boolean);
    for (const prm of params) {
      // 去掉类型注解、默认值、rest、解构（解构不查）
      if (prm.startsWith('{') || prm.startsWith('[')) continue;
      let nm = prm.replace(/^\.\.\./, '').split(':')[0].split('=')[0].trim();
      if (!nm || nm === 'this') continue;
      if (!/^[A-Za-z_$][\w$]*$/.test(nm)) continue;
      if (nm.startsWith('_')) continue;   // _ 前缀 = 有意不用（noUnusedParameters 也忽略它）
      const used = new RegExp('\\b' + nm.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '\\b').test(body);
      if (!used) findings.push({ line: lineOf(openParen), sig: (name ? name : '') + '(' + paramsRaw.trim().slice(0, 50) + ')', param: nm });
    }
    re.lastIndex = end;   // 跳到函数体末尾继续
  }

  console.log('=== ' + rel + ' ===');
  if (!findings.length) console.log('  ✓ 未发现未使用参数');
  else {
    total += findings.length;
    for (const f of findings) console.log(`  ⚠ L${f.line} 参数 "${f.param}" 未使用   ${f.sig}`);
  }
  console.log('');
}
console.log(total === 0 ? '扫描结论：无未使用参数 ✓' : '扫描结论：' + total + ' 处未使用参数（noUnusedParameters 会报错，需修）✗');
if (total) process.exitCode = 1;
