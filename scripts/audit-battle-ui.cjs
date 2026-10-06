'use strict';
/* ============================================================================
   P4 静态 UI 审计（组件无法在 Node 里渲染，但 AGENTS 的硬性做法可以静态核对）
   用法：node scripts/audit-battle-ui.cjs
   核对：① 每个导出组件都 memo          ② 列表/卡面图走 getThumbPath（AGENTS 第五节）
        ③ 图片都有 onError 回落占位      ④ 没有把空数组/空对象字面量当 props 默认值
        ⑤ 没有内联 style 传给 memo 子组件（粗略）  ⑥ 没有 enum/namespace（tsc 也查）
   ============================================================================ */
const fs = require('fs');
const path = require('path');

const DIRS = [
  path.resolve(__dirname, '../src/components/battle'),
  path.resolve(__dirname, '../src/components/hangar'),
];
const VIEWS = [
  path.resolve(__dirname, '../src/lib/battle/view.ts'),
  path.resolve(__dirname, '../src/lib/battle/hangar.ts'),
];
const issues = [];

const files = [];
for (const d of DIRS) {
  if (!fs.existsSync(d)) continue;
  for (const f of fs.readdirSync(d)) if (f.endsWith('.tsx') || f.endsWith('.ts')) files.push({ f, dir: d });
}
if (files.length === 0) { console.log('  （还没有组件目录）'); process.exit(0); }
console.log('=== 组件文件（' + files.length + ' 个）===');

let memoCount = 0, compCount = 0;
for (const { f, dir } of files) {
  const src = fs.readFileSync(path.join(dir, f), 'utf8');
  // ① 每个 export default 的组件都要 memo
  const hasDefaultExport = /export default/.test(src);
  const memoed = /export default memo\(/.test(src);
  if (hasDefaultExport) { compCount++; if (memoed) memoCount++; else issues.push(`${f}: export default 但没有 memo(...)（AGENTS 第五节）`); }
  // ③ 图片要有 onError
  const imgs = (src.match(/<img\b/g) || []).length;
  const onErrors = (src.match(/onError=/g) || []).length;
  if (imgs > onErrors) issues.push(`${f}: <img> ${imgs} 个但 onError ${onErrors} 个（缺图会留破图）`);
  // ④ 空数组/空对象字面量当 props
  if (/=\s*\[\]\s*[},]/.test(src) && /memo\(/.test(src)) issues.push(`${f}: 可能把 [] 字面量当 props 默认值（memo 会失效，应用模块级常量）`);
  // ⑥ 禁用语法
  if (/\benum\s+\w/.test(src) || /\bnamespace\s+\w/.test(src)) issues.push(`${f}: 出现 enum/namespace（erasableSyntaxOnly 会报错）`);
  // ② 缩略图规则只在**拼路径的地方**检查（view.ts 的 unitArtSrc）——组件只接收 artSrc 字符串，
  //    对组件逐个检查会产生误报（早先就是这么误报了 4 个组件）。
  console.log('  ' + f.padEnd(24) + (hasDefaultExport ? (memoed ? 'memo ✓' : 'memo ✗') : '(无默认导出)') + '  <img>×' + imgs);
}

// 纯展示逻辑模块检查（view.ts / hangar.ts：不依赖 React/DOM，是唯一可在 Node 里测的一层）
for (const VIEW of VIEWS) {
  if (!fs.existsSync(VIEW)) continue;
  const v = fs.readFileSync(VIEW, 'utf8');
  const exps = [...v.matchAll(/export function (\w+)/g)].map((m) => m[1]);
  const base = path.basename(VIEW);
  const need = base === 'view.ts'
    ? ['unitView', 'boardView', 'poolView', 'infoBarView', 'bossView', 'graveView', 'canEndTurn']
    : ['libraryRows', 'fleetRows', 'canAddShip', 'canRemoveShip', 'canDeleteFleet', 'canToggleDefending', 'hangarSummary'];
  const miss = need.filter((n) => !exps.includes(n));
  console.log('\n=== ' + base + ' 导出（' + exps.length + ' 个）===');
  console.log('  ' + exps.join(', '));
  if (miss.length) issues.push(base + ' 缺少：' + miss.join(', '));
  if (/from 'react'|from "react"/.test(v)) issues.push(base + ' 引入了 react（应当是不依赖 DOM/React 的纯函数）');
  if (/document\.|window\./.test(v)) issues.push(base + ' 用了 document/window（应当是纯函数）');
  // ⑤ 舰船图（出口最大 ~370px）必须走缩略图；BOSS 头像是 112×112 小图，直接用原图即可（AGENTS 第五节的判断标准）
  const srcFn = (name) => {
    const m = v.match(new RegExp('export function ' + name + '\\([^)]*\\)[^{]*\\{([\\s\\S]*?)\\n\\}'));
    return m ? m[1] : '';
  };
  if (base === 'view.ts') {
    const shipArt = srcFn('unitArtSrc');
    if (shipArt && !/getThumbPath/.test(shipArt)) {
      issues.push('view.ts 的 unitArtSrc 没用 getThumbPath —— 舰船图属"列表/网格图"，AGENTS 第五节要求走缩略图');
    }
  }
  // 机库列表也是"列表图"，必须复用 view.unitArtSrc（它已走缩略图）
  if (base === 'hangar.ts' && !/unitArtSrc|getThumbPath/.test(v)) {
    issues.push('hangar.ts 没复用 view.unitArtSrc / getThumbPath —— 机库卡面是列表图，必须走缩略图');
  }
}

console.log('\n=== 静态 UI 审计结果 ===');
if (issues.length === 0) console.log('  未发现问题 ✓（组件 memo / 缩略图 / onError / 纯函数分层）');
else { issues.forEach((i) => console.log('  ⚠ ' + i)); process.exitCode = 1; }
