const fs = require('fs');
const APP = 'E:\\生涯之旅游戏\\app';
const SRC = APP + '\\src';

// ---------- 数据 ----------
const raw = fs.readFileSync(SRC + '\\data\\galaxy\\archaeology.ts', 'utf8');
let js = raw.replace(/^\s*import\s+type[^;]+;\s*$/m, '').replace(/export\s+const\s+ARCHAEOLOGY_SITES\s*:\s*ArchaeologySite\[\]\s*=/, 'const ARCHAEOLOGY_SITES =');
js = js.slice(js.indexOf('const ARCHAEOLOGY_SITES ='));
js = js.slice(0, js.indexOf('\n];') + 3);
const sites = eval(js + '\n;ARCHAEOLOGY_SITES;');

// 遗物 / 永久加成 名称
const relSrc = fs.readFileSync(SRC + '\\data\\relics.ts', 'utf8');
const relicName = {};
for (const m of relSrc.matchAll(/id: (RELIC_\w+),\s*\n\s*name: '([^']+)'/g)) {
  const idm = new RegExp(m[1] + " = '(r_\\d+)'").exec(relSrc);
  if (idm) relicName[idm[1]] = m[2];
}
const permaSrc = fs.readFileSync(SRC + '\\data\\galaxy\\permaBonuses.ts', 'utf8');
const permaName = {};
for (const m of permaSrc.matchAll(/id: (PERMA_\w+),\s*\n\s*name: '([^']+)'/g)) {
  const idm = new RegExp(m[1] + " = '([^']+)'").exec(permaSrc);
  if (idm) permaName[idm[1]] = m[2];
}
const MAT_CN = { carbon: '碳块', gold_ore: '黄金', oil: '石油', dark_matter: '暗物质', silicon: '硅片', quantum: '量子簇' };
const RES_CN = { gold: '金币', food: '食物', alloy: '合金', stardust: '星尘', researchPoints: '科研点' };

const fmtNum = (n) => Number(n).toLocaleString('en-US');
const fmtRes = (r) => {
  if (!r) return '—';
  const parts = [];
  for (const k of ['gold', 'food', 'alloy', 'stardust', 'researchPoints']) if (r[k]) parts.push(RES_CN[k] + ' ' + fmtNum(r[k]));
  if (r.materials) for (const [m, v] of Object.entries(r.materials)) parts.push((MAT_CN[m] || m) + ' ' + fmtNum(v));
  return parts.length ? parts.join(' + ') : '—';
};
const fmtReward = (r) => {
  const parts = [];
  for (const id of r.relics || []) parts.push('遗物「' + (relicName[id] || '?') + '」' + id);
  for (const id of r.permaBonuses || []) parts.push('永久加成「' + (permaName[id] || '?') + '」' + id);
  if (r.title) parts.push('称号「' + r.title + '」');
  const res = fmtRes(r);
  if (res !== '—') parts.push(res);
  return parts.join(' + ');
};
const exists = (p) => fs.existsSync(APP + '\\public' + p.replace(/\//g, '\\'));

const L = [];
const csv = ['遗迹id,遗迹名,文明,门槛,图片类型,阶段id,阶段标题,耗时,难度,图片文件,路径,状态,剧情文字'];
const q = (s) => '"' + String(s == null ? '' : s).replace(/"/g, '""') + '"';
const mdSafe = (s) => String(s).replace(/\|/g, '／');

// ---------- 一、命名规则 ----------
L.push('# 考古遗迹：阶段文字与配图清单');
L.push('');
L.push('> 数据唯一真值：`src/data/galaxy/archaeology.ts`（本文件由脚本从该文件导出，共 **10 处遗迹 / 42 个阶段**）。');
L.push('> 阶段文字即配图的画面依据；`image` / `galleryImage` / `haltImage` 字段已写死在数据里，图片文件按下面的路径放即可生效。');
L.push('');
L.push('> **本轮更新（2026-10-03）**：10 处遗迹的**最后一个阶段文字已按"结尾必须揭晓谜底"重写**（原来 8 处收在悬念上）。');
L.push('> 影响面：**只有每处的最后一张图（结局图）**；`cover`、`halt`、前面阶段的图全部不受影响。');
L.push('> 已核对：`bell_tower/S3.webp` 与新文本逐项吻合（八弦、白霜、收取样品），**不用改**；');
L.push('> `mirror_graveyard/S3.webp` 画的是旧结尾（透镜阵列 + 激光直射天顶），**需按新文本重画**。');
L.push('');
L.push('## 一、图片放置与命名规则');
L.push('');
L.push('| 项目 | 规则 |');
L.push('|---|---|');
L.push('| 格式 | **WebP**（`.webp`） |');
L.push('| 存放目录 | `public/archaeology/<遗迹id>/`（已有 `bell_tower`、`mirror_graveyard` 两处） |');
L.push('| 阶段图命名 | `S1.webp`、`S2.webp`……（与阶段 id 完全一致，大小写敏感） |');
L.push('| 结局图 | 就是**最后一个阶段**那张（最后一阶段即结束阶段），命名同上 |');
L.push('| 图鉴封面命名 | `cover.webp`（每处遗迹一张，用于「考古图鉴」卡片，同时被星图信息卡、考古列表缩略图与详情大图复用） |');
L.push('| 中止图命名 | `halt.webp`（每处遗迹一张，发掘被永久封闭时展示，配 `haltText` 剧情） |');
L.push('| 页面引用路径 | `/archaeology/<遗迹id>/S1.webp` —— `public/` 目录在构建后映射到站点根路径，所以**不要**在代码或数据里写 `public/` |');
L.push('| 画面比例 | **16:9**（UI 用 `aspect-video` + `object-cover`：**非 16:9 的图会被居中裁切**） |');
L.push('| 建议尺寸 | 1280×720 或 1920×1080；单张建议 ≤ 300 KB（移动端流量）。现有图为 1200×673 |');
L.push('| 缺图表现 | 封面：考古列表该行不显示缩略图、详情与图鉴显示占位框；阶段图与中止图：`onError` 隐藏并露出占位框（「阶段图片位（S1）」），**不会出现破图**，可以分批补 |');
L.push('| 可辨识度 | 阶段图在手机上是整宽显示（约 340px 宽），主体尽量居中、避免细密小字 |');
L.push('');
L.push('完整路径示例：');
L.push('');
L.push('```');
L.push('E:\\生涯之旅游戏\\app\\public\\archaeology\\bell_tower\\cover.webp');
L.push('E:\\生涯之旅游戏\\app\\public\\archaeology\\bell_tower\\S1.webp');
L.push('E:\\生涯之旅游戏\\app\\public\\archaeology\\bell_tower\\S2.webp');
L.push('E:\\生涯之旅游戏\\app\\public\\archaeology\\bell_tower\\halt.webp');
L.push('```');
L.push('');
let totalAll = 0, doneAll = 0;
const progress = [];
for (const s of sites) {
  const items = [{ kind: '封面', file: 'cover.webp', p: s.galleryImage, note: '图鉴封面：' + s.name, text: s.intro }];
  s.stages.forEach((st, i) => {
    const isLast = i === s.stages.length - 1;
    items.push({ kind: isLast ? '结局图' : '阶段图', file: st.id + '.webp', p: st.image, note: st.id + ' ' + st.title, text: st.text, stage: st, isLast });
  });
  items.push({ kind: '中止图', file: 'halt.webp', p: s.haltImage, note: '中止剧情', text: s.haltText });
  let done = 0;
  for (const it of items) { totalAll++; if (exists(it.p)) { doneAll++; done++; } }
  progress.push({ s, items, done });
}
L.push('合计需要 **10 张封面 + 42 张阶段图 + 10 张中止图 = ' + totalAll + ' 张**；当前已有 **' + doneAll + ' 张**，待补 **' + (totalAll - doneAll) + ' 张**。');
L.push('');
L.push('## 二、逐遗迹清单');
L.push('');
progress.forEach(({ s, items, done }, si) => {
  L.push('### ' + (si + 1) + '. ' + s.name + '（id: `' + s.id + '`）');
  L.push('');
  L.push('- 文明：' + s.civilization);
  L.push('- 驻守门槛：' + (s.minLeaderLevel > 0 ? '需 Lv' + s.minLeaderLevel + ' 领袖' : '无要求'));
  L.push('- 阶段数：' + s.stages.length + '　危险率：' + s.dangerRate);
  L.push('- 图鉴封面：`' + s.galleryImage + '`');
  L.push('- 遗迹简介（图鉴与信息卡文案）：' + s.intro);
  L.push('- 最终奖励：' + fmtReward(s.reward));
  L.push('- 图片进度：' + done + '/' + items.length + ' 张已有' + (done === items.length ? '（已齐）' : ''));
  L.push('');
  L.push('| 图片文件 | 阶段 | 标题 | 耗时 | 难度 | 阶段投入 | 阶段小奖励 | 抉择 |');
  L.push('|---|---|---|---|---|---|---|---|');
  for (const st of s.stages) {
    const choice = st.choice ? '有（' + st.choice.options.map((o) => o.label).join(' / ') + '）' : '无';
    L.push('| `' + st.id + '.webp` | ' + st.id + ' | ' + st.title + ' | ' + st.turns + ' 回合 | ' + st.difficulty + ' | ' + fmtRes(st.cost) + ' | ' + fmtRes(st.bonus) + ' | ' + choice + ' |');
  }
  L.push('| `halt.webp` | — | 永久封闭 | — | — | — | — | — |');
  L.push('');
  for (const st of s.stages) {
    const isLast = st === s.stages[s.stages.length - 1];
    L.push('#### ' + st.id + '｜' + st.title + (isLast ? '（结局图）' : ''));
    L.push('');
    L.push('> 图片：`' + st.image + '`');
    L.push('');
    L.push(mdSafe(st.text));
    L.push('');
  }
  L.push('#### 中止剧情（halt.webp）');
  L.push('');
  L.push('> 图片：`' + s.haltImage + '`');
  L.push('');
  L.push(mdSafe(s.haltText));
  L.push('');
  // CSV 行
  csv.push([s.id, q(s.name), q(s.civilization), s.minLeaderLevel ? 'Lv' + s.minLeaderLevel : '无', q('封面'), q('-'), q('图鉴封面'), '', '', 'cover.webp', q(s.galleryImage), exists(s.galleryImage) ? '已有' : '待补', q(s.intro)].join(','));
  for (const st of s.stages) {
    const isLast = st === s.stages[s.stages.length - 1];
    csv.push([s.id, q(s.name), q(s.civilization), s.minLeaderLevel ? 'Lv' + s.minLeaderLevel : '无', q(isLast ? '结局图' : '阶段图'), q(st.id), q(st.title), st.turns, st.difficulty, st.id + '.webp', q(st.image), exists(st.image) ? '已有' : '待补', q(st.text)].join(','));
  }
  csv.push([s.id, q(s.name), q(s.civilization), s.minLeaderLevel ? 'Lv' + s.minLeaderLevel : '无', q('中止图'), q('-'), q('永久封闭'), '', '', 'halt.webp', q(s.haltImage), exists(s.haltImage) ? '已有' : '待补', q(s.haltText)].join(','));
});

// ---------- 三、核对清单 ----------
L.push('## 三、图片文件核对清单');
L.push('');
L.push('放好一张勾一张（路径相对 `public/`）：');
L.push('');
L.push('```');
for (const { s, items } of progress) {
  for (const it of items) {
    const mark = exists(it.p) ? '[x]' : '[ ]';
    L.push(mark + ' ' + it.p.replace(/^\//, '') + '   （' + it.note + '）');
  }
}
L.push('```');
L.push('');

fs.writeFileSync(APP + '\\考古图片清单.md', L.join('\n'), 'utf8');
fs.writeFileSync(APP + '\\考古图片清单.csv', '\ufeff' + csv.join('\n'), 'utf8');
console.log('生成：考古图片清单.md（' + L.length + ' 行）/ .csv（' + csv.length + ' 行，含表头）');
console.log('图片总计 ' + totalAll + ' 张，已有 ' + doneAll + ' 张，待补 ' + (totalAll - doneAll) + ' 张');
console.log('阶段文字块数：' + progress.reduce((n, p) => n + p.s.stages.length, 0) + '（阶段）+ 10（中止）= ' + (progress.reduce((n, p) => n + p.s.stages.length, 0) + 10));
