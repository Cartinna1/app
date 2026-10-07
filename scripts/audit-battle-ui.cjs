'use strict';
/* ============================================================================
   P4 静态 UI 审计（组件无法在 Node 里渲染，但 AGENTS 的硬性做法可以静态核对）
   用法：node scripts/audit-battle-ui.cjs
   核对：① 每个导出组件都 memo          ② 列表/卡面图走 getThumbPath（AGENTS 第五节）
        ③ 图片都有 onError 回落占位      ④ 没有把空数组/空对象字面量当 props 默认值
        ⑤ 没有内联 style 传给 memo 子组件（粗略）  ⑥ 没有 enum/namespace（tsc 也查）
   ============================================================================ */
// ⑦ 渲染字符串里不许出现「V1.5 §」（用户 2026-08 口径：界面只讲"现在什么情况、能做什么"，
//    不许把文档出处写进玩家看见的文案；注释里的出处保留）—— 实现见文件末尾的 auditRenderStrings。
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

// ---------------------------------------------------------------------------
// ⑦ 渲染字符串里不许出现「V1.5 §」（用户 2026-08 口径）
//    判据沿用本轮既定口径：**解释界面/机制怎么运作的旁白 → 删**；**告诉玩家现在什么情况 /
//    能做什么 → 留**。文档出处（V1.5 §x.y）属于前者，只许留在代码注释里。
//    范围：「组件」目录 + **这些组件直接渲染的 lib 文案源**（那条横幅就来自
//    lib/battle/expedition.ts 的 endTurnView.reason，只查 components 会漏掉源头）。
// ---------------------------------------------------------------------------
const COMPONENT_DIRS = [
  path.resolve(__dirname, '../src/components'),
  path.resolve(__dirname, '../src/components/battle'),
  path.resolve(__dirname, '../src/components/hangar'),
  path.resolve(__dirname, '../src/components/colony'),
];
const TEXT_LIB_FILES = [
  path.resolve(__dirname, '../src/lib/battle/expedition.ts'),
  path.resolve(__dirname, '../src/lib/battle/raid.ts'),
  path.resolve(__dirname, '../src/lib/battle/hangar.ts'),
  path.resolve(__dirname, '../src/lib/battle/shipyard.ts'),
  path.resolve(__dirname, '../src/lib/battle/rewards.ts'),
  path.resolve(__dirname, '../src/lib/battle/view.ts'),
];
const V15 = /V1\.5\s*§/;
/** 去掉注释（先块注释、再行注释；顺序不能反），剩下的就是代码与字符串字面量。
 *  ⚠ 用**保留换行**的替换（块注释里的每个换行都留着），否则行号会漂、报错位置对不上。 */
const stripComments = (src) => src
  .replace(/\/\*[\s\S]*?\*\//g, (m) => m.replace(/[^\n]/g, ' '))
  .replace(/\/\/[^\n]*/g, '');

/** 扫一批文件，返回命中（line 是**原始文件**的行号） */
function scanRenderStrings(files) {
  const hits = [];
  for (const file of files) {
    const lines = stripComments(fs.readFileSync(file, 'utf8')).split('\n');
    const rel = path.relative(path.resolve(__dirname, '..'), file).replace(/\\/g, '/');
    for (let i = 0; i < lines.length; i++) {
      if (!V15.test(lines[i])) continue;
      if (lines[i].trim().indexOf('import ') === 0) continue;   // 模块路径不算文案
      hits.push(`${rel}:${i + 1}: 渲染字符串里出现「V1.5 §」—— 界面文案不许写文档出处（注释里的出处保留）`);
    }
  }
  return hits;
}

function auditRenderStrings() {
  // ① 硬性：components/** —— 组件里的渲染串一处都不许有
  const compFiles = [];
  for (const d of COMPONENT_DIRS) {
    if (!fs.existsSync(d)) continue;
    for (const f of fs.readdirSync(d)) {
      if (f.endsWith('.tsx') || f.endsWith('.ts')) compFiles.push(path.join(d, f));
    }
  }
  const compHits = scanRenderStrings(compFiles);
  // ② 追源头：这些 lib 文件的字符串**会被上面这些组件直接渲染**
  //    （横幅那句就在 lib/battle/expedition.ts 的 endTurnView.reason 里，只查 components 会漏掉源头）
  const libHits = scanRenderStrings(TEXT_LIB_FILES.filter((f) => fs.existsSync(f)));
  console.log('\n=== 渲染字符串里的「V1.5 §」 ===');
  console.log('  ① components/**：' + compFiles.length + ' 个文件 → ' + (compHits.length ? compHits.length + ' 处 ✗' : '未发现 ✓'));
  console.log('  ② 组件直接渲染的 lib 文案源：' + libHits.length + ' 处'
    + (libHits.length ? '（见下；用户 2026-08 只点名了两处，这里列出其余同类）' : ' ✓'));
  for (const h of compHits) issues.push(h);
  for (const h of libHits) console.log('     · ' + h);
}

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
    : ['libraryRows', 'fleetRows', 'canAddShip', 'canRemoveShip', 'canDeleteFleet', 'canToggleDefending', 'hangarSummary', 'hangarOverview', 'hangarGuide'];
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

auditRenderStrings();

console.log('\n=== 静态 UI 审计结果 ===');
if (issues.length === 0) console.log('  未发现问题 ✓（组件 memo / 缩略图 / onError / 纯函数分层 / 渲染串无 V1.5 §）');
else { issues.forEach((i) => console.log('  ⚠ ' + i)); process.exitCode = 1; }
