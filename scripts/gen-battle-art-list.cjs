'use strict';
/* 生成《战斗美术图位清单》—— 从数据层读出全部需要的文件名，输出到 Downloads（与其它方案文档同处）
   用法：node --import ./scripts/register-ts.mjs scripts/gen-battle-art-list.cjs
   覆盖四类**新增**图位（卡牌战斗 + P8 船坞/科技），并对比 public/ 报出真实缺口。 */
const fs = require('fs');
const path = require('path');
const APP = 'E:/生涯之旅游戏/app';
const PUB = APP + '/public';

const listArt = (d, exts) => fs.existsSync(d) ? fs.readdirSync(d).filter((f) => new RegExp('\\.(' + exts + ')$', 'i').test(f)) : [];
const has = (dir, name) => listArt(dir, 'webp|png|jpg|jpeg').indexOf(name) >= 0;

(async () => {
  const cardsMod = await import('@/data/battle/cards');
  const piratesMod = await import('@/data/battle/pirates');
  const nodesMod = await import('@/data/galaxy/nodes');
  const buildingsMod = await import('@/data/colony/buildings');
  const techsMod = await import('@/data/colony/techs');

  const CARDS = cardsMod.BATTLE_CARDS;
  const BOSSES = piratesMod.PIRATE_BOSSES;
  const all = Object.values(CARDS);
  const byId = Object.fromEntries(all.map((c) => [c.id, c]));
  const shipIds = all.map((c) => c.id).sort();
  const bossIds = Object.keys(BOSSES).sort();
  const lairByBoss = {};
  for (const n of (nodesMod.GALAXY_NODES || [])) if (n.pirateLair) lairByBoss[n.pirateLair] = n.id;

  // P8 新增：只列**数据里已有、但 public 里还没有**的建筑/科技（即真正需要补的）
  const builds = (buildingsMod.FULL_BUILDINGS || []);
  const techs = (techsMod.ALL_TECHS || []);
  const repeatableTechs = (techsMod.REPEATABLE_TECHS || []);   // 循环科技（RP_*）：已有图，一并核对防止漏报
  const bDir = path.join(PUB, 'buildings'), bThumb = path.join(PUB, 'buildings', 'thumbs'), tDir = path.join(PUB, 'techs');
  const missingBuilds = builds.filter((b) => !has(bDir, b.id + '.jpg') || !has(bThumb, b.id + '.webp'));
  const missingTechs = techs.concat(repeatableTechs).filter((t) => !has(tDir, t.id + '.png'));
  const battleCount = shipIds.length * 2 + bossIds.length + Object.keys(lairByBoss).length;
  const total = battleCount + missingBuilds.length * 2 + missingTechs.length;

  const L = [];
  const P = (s) => L.push(s);
  P('# 战斗美术图位清单（唯一真值 = 代码里的数据层）');
  P('');
  P('> 本文由 `scripts/gen-battle-art-list.cjs` **从数据层生成**（`data/battle/*`、`data/galaxy/nodes.ts`、`data/colony/{buildings,techs}.ts`），');
  P('> 并且**会比对 `public/` 报出真实缺口** —— 所以文件名不会漏、缺口不会算错。');
  P('> 重新生成：`node --import ./scripts/register-ts.mjs scripts/gen-battle-art-list.cjs`');
  P('> 核对进度：`node scripts/check-battle-art.cjs`（加 `--strict` 时缺图返回非 0）');
  P('');
  P('## 一、总览：本次共需补 **' + total + '** 个文件');
  P('');
  P('| 类别 | 需补 | 目录 | 尺寸/格式 | 命名 | 备注 |');
  P('| --- | --- | --- | --- | --- | --- |');
  P('| 舰船图（卡面 + 场上横条，同图两处用） | ' + shipIds.length + ' | `public/battle/units/` | 出图 **640×320**（2:1，舰体居中）· WebP | `<cardId>.webp` | 全新 |');
  P('| 舰船缩略图（卡库/舰队池列表位） | ' + shipIds.length + ' | `public/battle/thumbs/units/` | 宽 **192** · WebP | `<cardId>.webp` | **必须与原图同批产出** |');
  P('| BOSS 头像 | ' + bossIds.length + ' | `public/battle/bosses/` | **112×112** · WebP | `<bossId>.webp` | 含掠夺队 `raid` |');
  P('| 海盗老巢景观（星图信息卡详情大图） | ' + Object.keys(lairByBoss).length + ' | `public/battle/lairs/` | **1424×800**（16:9）· WebP | `<bossId>.webp` | 不需缩略图 |');
  P('| **三级船坞**（P8 新增建筑） | ' + (missingBuilds.length * 2) + ' | 原图 `public/buildings/` · 缩略图 `public/buildings/thumbs/` | 原图 **JPG**（与既有 31 座一致）· 缩略图 **WebP** | 原图 `B32.jpg` · 缩略图 `B32.webp` | 既有建筑是 `.jpg` + `thumbs/*.webp`，**照此惯例** |');
  P('| **战舰科技**（P8 新增 T28–T36） | ' + missingTechs.length + ' | `public/techs/` | **PNG**（与既有 33 张一致，单尺寸小图标，无缩略图） | `T28.png` | — |');
  P('');
  P('> 合计 = ' + battleCount + '（战斗专属） + ' + (missingBuilds.length * 2) + '（船坞 原图+缩略图） + ' + missingTechs.length + '（科技） = **' + total + '**');
  P('');
  P('## 二、命名与路径规则（必须严格照做，否则代码找不到图）');
  P('');
  P('1. **文件名 = 数据层里的 id**：卡牌 `h3` / BOSS `raid` / 建筑 `B32` / 科技 `T28`。');
  P('2. **扩展名按类别固定，不能混**（代码里的路径是写死的）：');
  P('   - 战斗四类：`.webp`');
  P('   - 建筑**原图**：`.jpg`（`/buildings/<id>.jpg`）；建筑**缩略图**：`.webp`（`/buildings/thumbs/<id>.webp`）');
  P('   - 科技：`.png`（`/techs/<id>.png`）');
  P('3. **缩略图不是另起一套命名**，而是把同样文件名放进 `thumbs/` 子目录（规则唯一实现在 `lib/assetThumb.ts` 的 `getThumbPath`，**别在别处手写第二套**）：');
  P('   `public/buildings/B32.jpg` → `public/buildings/thumbs/B32.webp`；`public/battle/units/h3.webp` → `public/battle/thumbs/units/h3.webp`');
  P('4. ⚠ **缩略图必须与原图同批产出**：列表位走的是缩略图路径，缺缩略图时组件的 `onError` 会把**整块静默隐藏**（看起来像布局坏了，其实是没图）。');
  P('5. **缺图不会崩**：任何缺失都会回落到占位块，占位块上写着建议尺寸。');
  P('');
  P('## 三、舰船图清单（' + shipIds.length + ' 张，每张需要 原图 + 缩略图 两处）');
  P('');
  P('| # | cardId | 舰名 | 系列 | 稀有度 | 费 | 攻/盾/体 | 文件名（两处同名） |');
  P('| --- | --- | --- | --- | --- | --- | --- | --- |');
  shipIds.forEach((id, i) => {
    const c = byId[id];
    P(`| ${i + 1} | \`${id}\` | ${c.name} | ${c.series} | ${c.rarity}${c.token ? '（衍生，永不建造）' : ''} | ${c.cost} | ${c.atk}/${c.shield}/${c.structure} | \`${id}.webp\` |`);
  });
  P('');
  P('## 四、BOSS 头像清单（' + bossIds.length + ' 张，112×112）');
  P('');
  P('| # | bossId | 名称 | 本体血量 | 文件名 |');
  P('| --- | --- | --- | --- | --- |');
  bossIds.forEach((id, i) => { const b = BOSSES[id]; P(`| ${i + 1} | \`${id}\` | ${b.name} | ${b.hp} | \`${id}.webp\` |`); });
  P('');
  P('> `raid` = 掠夺队旗舰（**无头目技能、无护盾、20 结构值**），只在「殖民地掠夺」防守战里出场。');
  P('');
  P('## 五、海盗老巢景观清单（' + Object.keys(lairByBoss).length + ' 张，1424×800，16:9）');
  P('');
  P('| # | bossId | 名称 | 星图节点 | 文件名 |');
  P('| --- | --- | --- | --- | --- |');
  Object.keys(lairByBoss).sort().forEach((bid, i) => { const b = BOSSES[bid] || {}; P(`| ${i + 1} | \`${bid}\` | ${b.name || '—'} | \`${lairByBoss[bid]}\` | \`${bid}.webp\` |`); });
  P('');
  P('> 老巢挂在**空星系**节点上（复用节点、不改坐标与航道）。属"详情位"大图，**不需要缩略图**；未探测的老巢节点不返回图片（迷雾）。');
  P('');
  P('## 六、新增建筑图（船坞，' + missingBuilds.length + ' 座 × 2 = ' + (missingBuilds.length * 2) + ' 个文件）');
  P('');
  P('| # | 建筑 id | 名称 | 原图 | 缩略图 |');
  P('| --- | --- | --- | --- | --- |');
  missingBuilds.forEach((b, i) => { P(`| ${i + 1} | \`${b.id}\` | ${b.name} | \`public/buildings/${b.id}.jpg\` | \`public/buildings/thumbs/${b.id}.webp\` |`); });
  P('');
  P('> 既有 31 座建筑是 `.jpg` 原图 + `thumbs/*.webp` 缩略图，**新船坞照此惯例**（代码里 `/buildings/<id>.jpg` 是写死的）。');
  P('> 建筑卡片有多处出口：殖民地页签建筑列表、建造/拆除卡片、总览 —— 缺缩略图会整块隐藏。');
  P('');
  P('## 七、新增科技图（' + missingTechs.length + ' 张）');
  P('');
  P('| # | 科技 id | 名称 | 文件名 |');
  P('| --- | --- | --- | --- |');
  missingTechs.forEach((t, i) => { P(`| ${i + 1} | \`${t.id}\` | ${t.name} | \`public/techs/${t.id}.png\` |`); });
  P('');
  P('> 科技图标是 **PNG、单尺寸小图标**（无缩略图），与既有 33 张一致。');
  P('> 既有存量 = 27 个常规科技（T1–T27）+ 6 个**循环科技**（RP_FOOD / RP_ALLOY / RP_MATERIAL / RP_RESEARCH / RP_STARDUST / RP_TRADE）= 33 张，**一个都不缺**；本次只需补上面这 ' + missingTechs.length + ' 张。');
  P('');
  P('## 八、出图优先级建议');
  P('');
  P('1. **舰船图 + 缩略图**（收益最大：卡面、场上横条、卡库、舰队池全用它；代码零改动，文件放进去就生效）');
  P('2. **三级船坞图**（不建船坞就造不了舰 —— 是整条卡牌战斗链路的起点）');
  P('3. **BOSS 头像 + 科技图**（战斗界面与科技面板）');
  P('4. **老巢景观**（让新加的老巢在星图上"看得见"）');
  P('');
  P('## 九、放好之后怎么确认');
  P('');
  P('```bash');
  P('node scripts/check-battle-art.cjs            # 只看清单，不报错');
  P('node scripts/check-battle-art.cjs --strict   # 缺图返回非 0（出图收尾时用）');
  P('```');
  P('');

  const out = 'C:/Users/Master/Downloads/战斗美术图位清单.md';
  fs.writeFileSync(out, L.join('\n'), 'utf8');
  console.log('已生成：' + out);
  console.log('  舰船 ' + shipIds.length + '×2 + BOSS ' + bossIds.length + ' + 老巢 ' + Object.keys(lairByBoss).length
    + ' + 船坞 ' + (missingBuilds.length * 2) + ' + 科技 ' + missingTechs.length + ' = **' + total + '** 个文件');
  console.log('  缺船坞：' + missingBuilds.map((b) => b.id).join(', '));
  console.log('  缺科技：' + missingTechs.map((t) => t.id).join(', '));
})().catch((e) => { console.error(e && e.stack ? e.stack.split('\n').slice(0, 6).join('\n') : e); process.exitCode = 1; });
