'use strict';
/* ============================================================================
   P4 静态 UI 审计（组件无法在 Node 里渲染，但 AGENTS 的硬性做法可以静态核对）
   用法：node scripts/audit-battle-ui.cjs
   核对：① 每个导出组件都 memo          ② 列表/卡面图走 getThumbPath（AGENTS 第五节）
        ③ 图片都有 onError 回落占位      ④ 没有把空数组/空对象字面量当 props 默认值
        ⑤ 没有内联 style 传给 memo 子组件（粗略）  ⑥ 没有 enum/namespace（tsc 也查）
        ⑦ **渲染字符串里不许出现 `V1.5 §`**（components/** 与组件直接渲染的 lib/data 文案源**都硬失败**）
        ⑧ **AGENTS.md ≤ 60000 字节**（防 workspace 指令预算 65536 从尾部静默截断，超限即红）
        ⑨ **战斗「谁在操作」只许有一份判定**（manualActionView）：组件不许再用组件态闸门，
           也不许在代码里写死「（自动战斗）正在替你行动…」——否则就是"按钮说手动、底部说自动"的分叉
        ⑩ **信息条（点卡看技能）位置**：必须在「你的舰队」标题之后、`<FleetPool>` 卡片列表之前，
           且**只渲染一份**（用户 2026-08：满编 30 张时不该拉到最底下才看得到技能）
   ============================================================================ */
// ⑦ 口径（用户 2026-08）：界面只讲"现在什么情况、能做什么"，不许把文档出处（V1.5 §x.y）
//    写进玩家看见的文案；注释里的出处保留。实现见下面的 auditRenderStrings。
const fs = require('fs');
const path = require('path');

const DIRS = [
  path.resolve(__dirname, '../src/components/battle'),
  path.resolve(__dirname, '../src/components/hangar'),
  // 共用卡面目录（卡库 / 船坞 / 战斗部署池共用）—— 新目录同样要被这套审计覆盖（memo / <img> onError）
  path.resolve(__dirname, '../src/components/ship'),
];
const VIEWS = [
  path.resolve(__dirname, '../src/lib/battle/view.ts'),
  path.resolve(__dirname, '../src/lib/battle/hangar.ts'),
];
const issues = [];

// ---------------------------------------------------------------------------
// ⑦ 渲染字符串里不许出现「V1.5 §」（用户 2026-08 口径，**两批全硬失败**）
//    判据沿用本轮既定口径：**解释界面/机制怎么运作的旁白 → 删**；**告诉玩家现在什么情况 /
//    能做什么 → 留**。文档出处（V1.5 §x.y）属于前者，只许留在代码注释里。
//    范围：① src/components/**（组件自己写的串）② **组件直接渲染的 lib / data 文案源**
//    （那条横幅来自 lib/battle/expedition.ts 的 endTurnView.reason、船坞原因来自 shipyard.ts、
//     建筑效果来自 data/colony/buildings.ts —— 只查 components 会漏掉这些源头）。
// ---------------------------------------------------------------------------
const COMPONENT_DIRS = [
  path.resolve(__dirname, '../src/components'),
  path.resolve(__dirname, '../src/components/battle'),
  path.resolve(__dirname, '../src/components/hangar'),
  path.resolve(__dirname, '../src/components/colony'),
  path.resolve(__dirname, '../src/components/ship'),
];
const TEXT_LIB_FILES = [
  path.resolve(__dirname, '../src/lib/battle/expedition.ts'),
  path.resolve(__dirname, '../src/lib/battle/raid.ts'),
  path.resolve(__dirname, '../src/lib/battle/hangar.ts'),
  path.resolve(__dirname, '../src/lib/battle/shipyard.ts'),
  path.resolve(__dirname, '../src/lib/battle/rewards.ts'),
  path.resolve(__dirname, '../src/lib/battle/view.ts'),
  path.resolve(__dirname, '../src/data/colony/buildings.ts'),
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
  // ① 组件自己写的渲染串
  const compFiles = [];
  for (const d of COMPONENT_DIRS) {
    if (!fs.existsSync(d)) continue;
    for (const f of fs.readdirSync(d)) {
      if (f.endsWith('.tsx') || f.endsWith('.ts')) compFiles.push(path.join(d, f));
    }
  }
  const compHits = scanRenderStrings(compFiles);
  // ② 这些 lib / data 文件的字符串**会被上面这些组件直接渲染**（横幅 = expedition.endTurnView.reason、
  //    船坞不可用原因 = shipyard、建筑效果 = data/colony/buildings）——**同样硬失败**，
  //    否则"出处进渲染串"还会从这个源头回来。
  const textFiles = TEXT_LIB_FILES.filter((f) => fs.existsSync(f));
  const libHits = scanRenderStrings(textFiles);
  console.log('\n=== 渲染字符串里的「V1.5 §」（两批都硬失败） ===');
  console.log('  ① components/**：' + compFiles.length + ' 个文件 → ' + (compHits.length ? compHits.length + ' 处 ✗' : '未发现 ✓'));
  console.log('  ② 组件直接渲染的 lib / data 文案源：' + textFiles.length + ' 个文件 → '
    + (libHits.length ? libHits.length + ' 处 ✗' : '未发现 ✓'));
  for (const h of compHits.concat(libHits)) issues.push(h);
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
    ? ['unitView', 'boardView', 'poolView', 'infoBarView', 'bossView', 'graveView', 'canEndTurn', 'manualActionView']
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

// ---------------------------------------------------------------------------
// ⑧ AGENTS.md 体积守卫（防复发：文档被 workspace 指令预算截断，尾部静默丢失）
//    背景：会话的 workspace 指令预算上限 = 65536 字节，超了系统**从尾部截断**——
//    而尾部正是「§十 唯一真值表 / 10.1 修过的坑」这一块，丢了没有任何提示（属文档损坏）。
//    口径：AGENTS.md（§〇–§九 操作性规则 + 指向附录的指针）**必须显著低于预算**；
//    §十 那类"查表型"内容一律放 AGENTS-附录.md（不进 workspace 预算）。
//    实测：2026-10 拆分前 AGENTS.md 66354 字节 → 已被截断；拆分后 ≈49500 字节（余量 ≈24%）。
//    超限时：**别再压缩语义内容**，照本文件的拆法把大块内容搬去 AGENTS-附录.md，正文留指针。
// ---------------------------------------------------------------------------
const AGENTS_BUDGET = 60000;   // 目录里的硬上限（工作区提示预算 65536 − 余量）
const AGENTS_WARN = 45000;     // 目标线：超过只是提醒，不算失败
function auditAgentsSize() {
  const agents = path.resolve(__dirname, '../AGENTS.md');
  console.log('\n=== AGENTS.md 体积守卫（≤ ' + AGENTS_BUDGET + ' 字节，防尾部被截断） ===');
  if (!fs.existsSync(agents)) {
    issues.push('AGENTS.md 不存在（改代码前的准则文档，必须保留）');
    console.log('  ✗ 不存在：' + agents);
    return;
  }
  const bytes = fs.statSync(agents).size;
  const pct = ((bytes / AGENTS_BUDGET) * 100).toFixed(1);
  console.log('  实测字节数（fs.statSync.size，与预算同一口径）= ' + bytes
    + ' / 上限 ' + AGENTS_BUDGET + '（' + pct + '%）');
  if (bytes > AGENTS_BUDGET) {
    issues.push('AGENTS.md 实测 ' + bytes + ' 字节 > 上限 ' + AGENTS_BUDGET
      + ' —— 会被 workspace 指令预算（65536）从尾部截断、且没人知道丢了什么。'
      + '别压缩语义内容：把大块查表型内容（如 §十 唯一真值表）搬到 AGENTS-附录.md，正文只留指针。');
    console.log('  ✗ 超出 ' + (bytes - AGENTS_BUDGET) + ' 字节（余量 ' + (65536 - bytes) + ' 字节@65536）');
  } else if (bytes > AGENTS_WARN) {
    console.log('  ⚠ 已过目标线 ' + AGENTS_WARN + ' 字节（未超上限，未算失败）；'
      + '注意 workspace 指令预算 65536 的余量只剩 ' + (65536 - bytes) + ' 字节');
  } else {
    console.log('  ✓ 未超限（余量 ' + (AGENTS_BUDGET - bytes) + ' 字节；@65536 余量 ' + (65536 - bytes) + ' 字节）');
  }
}
auditAgentsSize();

// ---------------------------------------------------------------------------
// ⑨ 战斗「谁在操作」的唯一真值（manualActionView）
//    2026-08 用户报「上了一艘战舰后指挥度还剩 2/4，却再也上不了任何卡；底部还写着
//    「（自动战斗）正在替你行动…」而按钮是「自动战斗」（= 没开自动）」。
//    根因：DEMO 没有 `busy` 这个组件态，移植时新加了它，却把它同时当成输入闸门 + 文案分支 +
//    「结束回合」禁用条件，而清除它的代码只活在两条自动推进的 effect 里 → 手动出一手就永久卡死。
//    判据（两条都硬失败）：
//      ① BattleScreen 的**代码**里不许再出现 `busy`（注释里解释坑可以留）；
//      ② 「正在替你行动」这句话只许出现在 lib/battle/view.ts（组件不许写死），
//         且组件必须引入 manualActionView。
// ---------------------------------------------------------------------------
function auditManualGate() {
  const screen = path.resolve(__dirname, '../src/components/battle/BattleScreen.tsx');
  console.log('\n=== 战斗「谁在操作」唯一真值（manualActionView / 无组件态闸门） ===');
  if (!fs.existsSync(screen)) { issues.push('BattleScreen.tsx 不存在（战斗主板没了？）'); return; }
  const raw = fs.readFileSync(screen, 'utf8');
  const code = stripComments(raw);
  const busyHits = code.split('\n')
    .map((l, i) => ({ l, i: i + 1 }))
    .filter((x) => /\bbusy\b/.test(x.l));
  if (busyHits.length) {
    busyHits.forEach((h) => issues.push(
      `components/battle/BattleScreen.tsx:${h.i}: 出现组件态 busy —— 它曾被当成输入闸门，`
      + '清除它的代码只活在自动推进的 effect 里，是"点了没反应 + 底部谎称自动"的根因。'
      + '「谁在操作」请读 lib/battle/view.manualActionView'));
  }
  if (code.indexOf('manualActionView') < 0) {
    issues.push('BattleScreen.tsx 没读 lib/battle/view.manualActionView —— 输入闸门与底部文案必须同源');
  }
  if (code.indexOf('正在替你行动') >= 0) {
    issues.push('BattleScreen.tsx 里写死了「正在替你行动」—— 这句话只许来自 lib/battle/view.ts 的 manualActionView.autoHint（未开自动时它恒为空串）');
  }
  console.log('  ① BattleScreen 代码里的组件态 busy：' + (busyHits.length ? busyHits.length + ' 处 ✗' : '未发现 ✓'));
  console.log('  ② 读 manualActionView：' + (code.indexOf('manualActionView') >= 0 ? '是 ✓' : '否 ✗'));
  console.log('  ③ 组件里写死「正在替你行动」：' + (code.indexOf('正在替你行动') >= 0 ? '有 ✗' : '未发现 ✓'));
}
auditManualGate();

// ---------------------------------------------------------------------------
// ⑩ 信息条位置（用户 2026-08 口径：「这个点卡看技能的信息条应该放到『你的舰队 …点卡看技能』
//    这段话的下面，战舰卡的上面，不然 30 个满编的，还得拉到最下面看技能」）
//    判据（两条都硬失败）：
//      ① **只有一份**：`<BattleInfoBar>` 在 BattleScreen 里只许出现 1 次（上移是移动，不是复制）；
//      ② **位置**：在「你的舰队」标题之后、`<FleetPool>`（卡片列表）之前 —— 部署池的
//         `max-h-[400px] overflow-auto` 只包住卡片，信息条在滚动窗上方常驻，满编也不用滚。
//    待选择态（`battle.pending`）不需要额外守卫：舰队池那一整块**没有条件包裹**，
//    信息条跟它一起永远在渲染路径上（`info.kind === 'pending'` 由组件内部渲染）。
// ---------------------------------------------------------------------------
function auditInfoBarPlacement() {
  const screen = path.resolve(__dirname, '../src/components/battle/BattleScreen.tsx');
  console.log('\n=== 信息条位置（点卡看技能：在卡片列表之前，且只有一份） ===');
  if (!fs.existsSync(screen)) { issues.push('BattleScreen.tsx 不存在（战斗主板没了？）'); return; }
  const src = stripComments(fs.readFileSync(screen, 'utf8'));
  const hits = src.split('<BattleInfoBar').length - 1;
  const at = src.indexOf('<BattleInfoBar');
  const title = src.indexOf('你的舰队');
  const pool = src.indexOf('<FleetPool');
  const ordered = title >= 0 && at > title && pool > at;
  console.log('  ① <BattleInfoBar> 出现次数：' + hits + (hits === 1 ? ' ✓' : ' ✗'));
  console.log('  ② 标题(' + title + ') → 信息条(' + at + ') → 卡片列表(' + pool + ')：' + (ordered ? '顺序正确 ✓' : '✗'));
  if (hits !== 1) {
    issues.push('BattleScreen.tsx 里 <BattleInfoBar> 出现 ' + hits + ' 次 —— 信息条只许渲染一份（上移是移动，不是复制）');
  }
  if (!ordered) {
    issues.push('信息条不在「你的舰队」标题之后、<FleetPool> 卡片列表之前 —— 满编 30 张时用户又得拉到底才能看技能');
  }
}
auditInfoBarPlacement();

console.log('\n=== 静态 UI 审计结果 ===');
if (issues.length === 0) console.log('  未发现问题 ✓（组件 memo / 缩略图 / onError / 纯函数分层 / 渲染串无 V1.5 § / 手动闸门唯一真值 / 信息条位置唯一 / AGENTS.md 体积）');
else { issues.forEach((i) => console.log('  ⚠ ' + i)); process.exitCode = 1; }
