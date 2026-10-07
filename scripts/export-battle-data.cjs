'use strict';
/* ============================================================================
   从 carddemo 引擎导出卡牌战斗的静态数据 → src/data/battle/{cards,pirates,fleets}.ts
   用法：node scripts/export-battle-data.cjs
   为什么用脚本而不是手抄：43 张卡 + 6 个敌人 + 3 张编制表要逐字段一致，
   手抄必然出错；导完再跑 verify-battle-data.cjs 逐字段对拍。
   数据与逻辑的分工：本脚本只导出**静态数据**（费/攻/盾/体/系列/稀有度/文案）；
   关键词与技能实现属于逻辑，留在 lib/battle/（P1 阶段搬移）。
   ============================================================================ */
const fs = require('fs');
const path = require('path');

const DEMO = path.resolve(__dirname, '../../carddemo/engine.js');
const OUT_DIR = path.resolve(__dirname, '../src/data/battle');

const E = require(DEMO);
const header = (what) => [
  `// ==================== ${what} ====================`,
  '// 本文件由 scripts/export-battle-data.cjs 从 carddemo/engine.js 生成 —— **请勿手改**。',
  '// 改卡牌数据请改 DEMO 引擎（或 V1.5 后同步 DEMO），然后重跑：',
  '//   node scripts/export-battle-data.cjs && node scripts/verify-battle-data.cjs',
  '',
].join('\n');
const q = (v) => JSON.stringify(v);

// ---------------- cards.ts ----------------
{
  const ids = Object.keys(E.CARDS);
  const lines = [header('舰船卡牌数据（玩家 5 系 + 海盗 + 衍生单位）')];
  lines.push("import type { ShipCardDef } from '@/types/battle';", '');
  lines.push('/** 全部卡牌（含衍生单位；token = true 的不进卡库） */');
  lines.push('export const BATTLE_CARDS: Record<string, ShipCardDef> = {');
  for (const id of ids) {
    const c = E.CARDS[id];
    const parts = [
      `id: ${q(id)}`, `name: ${q(c.name)}`, `cost: ${c.cost}`,
      `atk: ${c.atk}`, `shield: ${c.shield}`, `structure: ${c.structure}`,
      `series: ${q(c.series || '通用')}`,
      // 衍生单位（token）没有稀有度：DEMO 用 '衍' 做本地标记，导出时规范化为 '白'（语义由 token:true 承载）
      `rarity: ${q(c.token ? '白' : (c.rarity || '白'))}`, `text: ${q(c.text || '—')}`,
    ];
    if (c.token) parts.push('token: true');
    lines.push(`  ${q(id)}: { ${parts.join(', ')} },`);
  }
  lines.push('};', '');
  lines.push('/** 卡牌 id 全集（含衍生单位） */');
  lines.push(`export const BATTLE_CARD_IDS: readonly string[] = ${JSON.stringify(ids, null, 0).replace(/","/g, '", "')};`);
  lines.push('');
  lines.push('/** 衍生单位 id（召唤物：不进卡库、被击毁不计入永久损失） */');
  const tokens = ids.filter((id) => E.CARDS[id].token);
  lines.push(`export const BATTLE_TOKEN_IDS: readonly string[] = ${JSON.stringify(tokens)};`);
  lines.push('');
  fs.writeFileSync(path.join(OUT_DIR, 'cards.ts'), lines.join('\n'), 'utf8');
  console.log('  cards.ts    ' + ids.length + ' 张（其中衍生单位 ' + tokens.length + '）');
}

// ---------------- pirates.ts ----------------
{
  const bids = Object.keys(E.BOSSES);
  const lines = [header('海盗敌人（5 个老巢 BOSS + 掠夺队）')];
  lines.push("import type { PirateBossDef } from '@/types/battle';", '');
  lines.push('/** 敌人本体血量与头目技能（掠夺队 = raid，20 血、无头目技能） */');
  lines.push('export const PIRATE_BOSSES: Record<string, PirateBossDef> = {');
  for (const id of bids) {
    const b = E.BOSSES[id];
    lines.push(`  ${q(id)}: { id: ${q(id)}, name: ${q(b.name)}, hp: ${b.hp}, skill: ${q(b.skill)} },`);
  }
  lines.push('};', '');
  lines.push('/** 海盗舰船池（海盗每回合从这里按指挥度出牌，用光不补充；玩家永远不可获得） */');
  lines.push(`export const PIRATE_POOL: readonly string[] = ${JSON.stringify(E.PIRATE_POOL)};`);
  lines.push('');
  lines.push('/** 掠夺队（bossId = raid）自己的舰船池（**用户 2026-08 裁定**：15 艘、构成本身也更偏低阶，');
  lines.push(' *  最高 4 费、不含 r8/r9/r10 头目与旗舰级 —— 与 5 个老巢共用的 PIRATE_POOL 区分开）。 */');
  lines.push(`export const RAID_POOL: readonly string[] = ${JSON.stringify(E.RAID_POOL)};`);
  lines.push('');
  lines.push('/** 老巢敌人 id（5 个 BOSS；掠夺队单列） */');
  lines.push(`export const LAIR_BOSS_IDS: readonly string[] = ${JSON.stringify(bids.filter((b) => b !== 'raid'))};`);
  lines.push('');
  fs.writeFileSync(path.join(OUT_DIR, 'pirates.ts'), lines.join('\n'), 'utf8');
  console.log('  pirates.ts  ' + bids.length + ' 个敌人 + 海盗池 ' + E.PIRATE_POOL.length + ' 张 + 掠夺池 ' + E.RAID_POOL.length + ' 张');
}

// ---------------- fleets.ts ----------------
{
  const lines = [header('编制示例（注意：卡库初始为空，这些只是"一套合理编制长什么样"，不是开局赠送）')];
  lines.push("import type { ShipCardId } from '@/types/battle';", '');
  lines.push('/** V1.5 §5 的新手编制示例（26 艘；文档里的"备用 4 艘"只是占位，未纳入） */');
  lines.push(`export const FLEET_STARTER: readonly ShipCardId[] = ${JSON.stringify(E.FLEET_STARTER)};`);
  lines.push('');
  lines.push('/** 玩家可获得的全部卡牌各一张（用于构筑参考与平衡测试） */');
  lines.push(`export const FLEET_ALL: readonly ShipCardId[] = ${JSON.stringify(E.FLEET_ALL)};`);
  lines.push('');
  // 统计（便于人眼核对曲线）
  const count = (arr) => arr.reduce((m, id) => { m[id] = (m[id] || 0) + 1; return m; }, {});
  const curve = (arr) => {
    const c = count(arr), by = {};
    for (const id of Object.keys(c)) { const k = E.CARDS[id].cost; by[k] = (by[k] || 0) + c[id]; }
    return Object.keys(by).sort((a, b) => a - b).map((k) => k + '费×' + by[k]).join(' / ');
  };
  lines.push('/** 曲线：' + curve(E.FLEET_STARTER) + '（共 ' + E.FLEET_STARTER.length + ' 艘） */');
  lines.push('export const FLEET_STARTER_CURVE = ' + q(curve(E.FLEET_STARTER)) + ';');
  lines.push('');
  fs.writeFileSync(path.join(OUT_DIR, 'fleets.ts'), lines.join('\n'), 'utf8');
  console.log('  fleets.ts   新手 ' + E.FLEET_STARTER.length + ' 艘 / 全集 ' + E.FLEET_ALL.length + ' 艘');
}
console.log('导出完成 → ' + OUT_DIR);
