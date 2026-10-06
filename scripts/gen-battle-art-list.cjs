'use strict';
/* 生成《战斗美术图位清单》—— 从数据层读出全部需要的文件名，输出到 Downloads（与其它方案文档同处）
   用法：node --import ./scripts/register-ts.mjs scripts/gen-battle-art-list.cjs */
const fs = require('fs');
const path = require('path');

(async () => {
  const cardsMod = await import('@/data/battle/cards');
  const piratesMod = await import('@/data/battle/pirates');
  const nodesMod = await import('@/data/galaxy/nodes');

  const CARDS = cardsMod.BATTLE_CARDS;
  const BOSSES = piratesMod.PIRATE_BOSSES;
  const all = Object.values(CARDS);
  const byId = Object.fromEntries(all.map((c) => [c.id, c]));
  const shipIds = all.map((c) => c.id).sort();
  const bossIds = Object.keys(BOSSES).sort();
  const lairByBoss = {};
  for (const n of (nodesMod.GALAXY_NODES || [])) if (n.pirateLair) lairByBoss[n.pirateLair] = n.id;

  const L = [];
  const P = (s) => L.push(s);
  P('# 战斗美术图位清单（唯一真值 = 代码里的数据层）');
  P('');
  P('> 本文由 `scripts/gen-battle-art-list.cjs` **从数据层生成**（`data/battle/cards.ts` / `pirates.ts` / `data/galaxy/nodes.ts`），');
  P('> 所以文件名不会漏、也不会和代码脱节。**重新生成**：`node --import ./scripts/register-ts.mjs scripts/gen-battle-art-list.cjs`');
  P('> **核对进度**（缺哪些一眼可见）：`node scripts/check-battle-art.cjs`（加 `--strict` 时缺图返回非 0）');
  P('');
  P('## 一、总览：共 ' + (shipIds.length * 2 + bossIds.length + Object.keys(lairByBoss).length) + ' 个文件');
  P('');
  P('| 类别 | 数量 | 目录 | 尺寸 | 命名 |');
  P('| --- | --- | --- | --- | --- |');
  P('| 舰船图（卡面 + 场上横条，同图两处用） | ' + shipIds.length + ' | `public/battle/units/` | 出图 **640×320**（2:1，舰体居中） | `<cardId>.webp` |');
  P('| 舰船缩略图（卡库/舰队池列表位） | ' + shipIds.length + ' | `public/battle/thumbs/units/` | 宽 **192**（同比例，16:9 或 2:1 与上一致即可） | `<cardId>.webp` |');
  P('| BOSS 头像 | ' + bossIds.length + ' | `public/battle/bosses/` | **112×112**（方图） | `<bossId>.webp` |');
  P('| 海盗老巢景观（星图信息卡详情大图） | ' + Object.keys(lairByBoss).length + ' | `public/battle/lairs/` | **1424×800**（16:9） | `<bossId>.webp` |');
  P('');
  P('**格式**：一律 WebP（四档统一，与既有星球/势力/遗迹图一致）。');
  P('');
  P('## 二、命名与路径规则（必须严格照做，否则代码找不到图）');
  P('');
  P('1. **文件名 = 卡牌 id / BOSS id**，全小写、下划线分隔，扩展名 `.webp`。例：`h3.webp`、`t_monk.webp`、`raid.webp`。');
  P('2. **目录必须完全一致**（区分大小写）：`public/battle/units/`、`public/battle/thumbs/units/`、`public/battle/bosses/`、`public/battle/lairs/`。');
  P('3. **缩略图不是"另起一套命名"**，而是把同样文件名放进 `thumbs/` 子目录：');
  P('   `public/battle/units/h3.webp` → `public/battle/thumbs/units/h3.webp`');
  P('   （规则唯一实现在 `lib/assetThumb.ts` 的 `getThumbPath`，**别在别处手写第二套**）');
  P('4. ⚠ **缩略图必须与原图同批产出**：列表位走的是缩略图路径，缺缩略图时组件的 `onError` 会把**整块静默隐藏**（看起来像布局坏了，其实是没图）。');
  P('5. **缺图不会崩**：任何缺失都会回落到斜纹占位块，占位块上写着该图的建议尺寸。');
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
  bossIds.forEach((id, i) => {
    const b = BOSSES[id];
    P(`| ${i + 1} | \`${id}\` | ${b.name} | ${b.hp} | \`${id}.webp\` |`);
  });
  P('');
  P('> `raid` = 掠夺队旗舰（**没有头目技能、无护盾、20 结构值**），只在「殖民地掠夺」防守战里出场。');
  P('');
  P('## 五、海盗老巢景观清单（' + Object.keys(lairByBoss).length + ' 张，1424×800，16:9）');
  P('');
  P('| # | bossId | 名称 | 星图节点 | 文件名 |');
  P('| --- | --- | --- | --- | --- |');
  Object.keys(lairByBoss).sort().forEach((bid, i) => {
    const b = BOSSES[bid] || {};
    P(`| ${i + 1} | \`${bid}\` | ${b.name || '—'} | \`${lairByBoss[bid]}\` | \`${bid}.webp\` |`);
  });
  P('');
  P('> 说明：老巢挂在**空星系**节点上（复用节点、不改坐标与航道）。这些图是**星图信息卡**里的详情大图，属"详情位"，**不需要缩略图**；未探测的老巢节点不返回图片（迷雾）。');
  P('');
  P('## 六、出图优先级建议');
  P('');
  P('1. **舰船图 + 缩略图**（收益最大：卡面、场上横条、卡库、舰队池全用它；代码零改动，文件放进去就生效）');
  P('2. **BOSS 头像**（战斗界面 BOSS 面板 + 图鉴位）');
  P('3. **老巢景观**（让新加的老巢在星图上"看得见"）');
  P('');
  P('## 七、放好之后怎么确认');
  P('');
  P('```bash');
  P('# 只看清单（不报错）：');
  P('node scripts/check-battle-art.cjs');
  P('# 严格模式：缺图返回非 0，适合出图收尾时用');
  P('node scripts/check-battle-art.cjs --strict');
  P('```');
  P('');

  const out = 'C:/Users/Master/Downloads/战斗美术图位清单.md';
  fs.writeFileSync(out, L.join('\n'), 'utf8');
  console.log('已生成：' + out);
  console.log('  舰船图 ' + shipIds.length + ' + 缩略图 ' + shipIds.length + ' + BOSS ' + bossIds.length + ' + 老巢 ' + Object.keys(lairByBoss).length
    + ' = ' + (shipIds.length * 2 + bossIds.length + Object.keys(lairByBoss).length) + ' 个文件');
  console.log('  行数：' + L.length);
})().catch((e) => { console.error(e && e.stack ? e.stack.split('\n').slice(0, 6).join('\n') : e); process.exitCode = 1; });
