'use strict';
/* ============================================================================
   战斗美术 · 图位清单核对（**信息型**：默认不拦复验/CI）
   用法：node scripts/check-battle-art.cjs            缺文件也返回 0
         node scripts/check-battle-art.cjs --strict   缺文件返回 1（P9 收尾用）
   权威 id：`src/data/battle/cards.ts` 的 BATTLE_CARDS + `src/data/battle/pirates.ts` 的 PIRATE_BOSSES
           —— 本脚本**不抄 id 列表**，一律从数据层的 TS 源码里解析顶层字面量键，
           以后加卡 / 加敌人自动纳入核对。
   落地规范（唯一真值）：carddemo/美术清单.md 的 §五~§六。
   ============================================================================ */
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const CARDS_FILE = 'src/data/battle/cards.ts';
const PIRATES_FILE = 'src/data/battle/pirates.ts';

/**
 * 取出 `export const <declName> = { … }` 的**顶层键**。
 * 做法：从 `=` 后的 `{` 起逐字符走，遇到字符串/模板串就整段跳过（否则卡牌文案里的 `{`/`}` 会把深度算错），
 * 只在 depth === 1 时按 `"id":` / `'id':` / `id:` 收键，depth 回到 0 即对象结束。
 */
function topLevelKeys(file, declName) {
  const src = fs.readFileSync(path.join(ROOT, file), 'utf8');
  const head = new RegExp('(?:export\\s+)?const\\s+' + declName + '\\b[^=]*=\\s*\\{').exec(src);
  if (!head) throw new Error(`在 ${file} 里找不到 ${declName} 的字面量定义`);
  let i = head.index + head[0].length;
  const keys = [];
  let depth = 1;
  while (i < src.length && depth > 0) {
    const c = src[i];
    if (c === '"' || c === "'" || c === '`') {
      const quote = c;
      const start = i + 1;
      i++;
      // 字符串里的花括号一律不算深度
      while (i < src.length && src[i] !== quote) i += src[i] === '\\' ? 2 : 1;
      const closed = i < src.length;
      // 引号串后面紧跟冒号 → 这里的 key 就是它的内容
      let j = i + 1;
      while (j < src.length && /\s/.test(src[j])) j++;
      if (closed && src[j] === ':' && depth === 1) keys.push(src.slice(start, i));
      i++;
      continue;
    }
    if (c === '{') depth++;
    else if (c === '}') depth--;
    else if (depth === 1 && /[A-Za-z_$]/.test(c) && (i === 0 || !/[\w$]/.test(src[i - 1]))) {
      const m = /^[A-Za-z_$][\w$]*/.exec(src.slice(i));
      let j = i + m[0].length;
      while (j < src.length && /\s/.test(src[j])) j++;
      if (src[j] === ':') {
        keys.push(m[0]);
        i = j + 1;
        continue;
      }
    }
    i++;
  }
  if (!keys.length) throw new Error(`${file} 的 ${declName} 没解析出任何键`);
  return keys;
}

/** 目录里的 .webp 文件名（不含扩展名）；目录不存在时也算"一个都没有" */
function existingIds(dir) {
  const abs = path.join(ROOT, dir);
  if (!fs.existsSync(abs)) return { ids: new Set(), dirMissing: true };
  return {
    ids: new Set(
      fs.readdirSync(abs).filter((f) => f.toLowerCase().endsWith('.webp')).map((f) => f.replace(/\.webp$/i, ''))
    ),
    dirMissing: false,
  };
}

/** 把 id 列表压成 `h1~h7, t_claw` 这种紧凑串（同前缀 + 尾号连续才合并），长列表才看得清 */
function condense(ids) {
  const plain = [];
  const groups = new Map();
  for (const id of ids) {
    const m = /^(.*?)(\d+)$/.exec(id);
    if (!m) { plain.push(id); continue; }
    if (!groups.has(m[1])) groups.set(m[1], []);
    groups.get(m[1]).push(Number(m[2]));
  }
  const out = [...plain];
  for (const [prefix, nums] of groups) {
    nums.sort((a, b) => a - b);
    let i = 0;
    while (i < nums.length) {
      let j = i;
      while (j + 1 < nums.length && nums[j + 1] === nums[j] + 1) j++;
      out.push(j - i >= 1 ? `${prefix}${nums[i]}~${nums[j]}` : `${prefix}${nums[i]}`);
      i = j + 1;
    }
  }
  return out.join(', ');
}

const cardIds = topLevelKeys(CARDS_FILE, 'BATTLE_CARDS');
const bossIds = topLevelKeys(PIRATES_FILE, 'PIRATE_BOSSES');
// 掠夺队（raid）没有星图节点 → 不出老巢景观图；其余 5 个才是老巢（V1.5 §7.1）
const lairIds = bossIds.filter((id) => id !== 'raid');

const GROUPS = [
  { label: '舰船图（卡面 + 场上横条，同图两处用）', dir: 'public/battle/units', want: cardIds, size: '640×320（2:1，舰体居中）' },
  { label: '舰船图缩略图（舰队池卡面走 getThumbPath）', dir: 'public/battle/thumbs/units', want: cardIds, size: '宽 192、与原图同比例' },
  { label: 'BOSS 头像（含掠夺队 raid）', dir: 'public/battle/bosses', want: bossIds, size: '112×112' },
  { label: '海盗老巢景观（星图信息卡详情大图）', dir: 'public/battle/lairs', want: lairIds, size: '1424×800（16:9）' },
];

console.log('战斗美术图位核对（落地规范唯一真值：carddemo/美术清单.md §五~§六）');
console.log(`数据层应有：卡牌 ${cardIds.length} / 敌人 ${bossIds.length}（含掠夺队 raid）/ 老巢 ${lairIds.length}\n`);

let expectedTotal = 0;
let missingTotal = 0;
for (const g of GROUPS) {
  const { ids: have, dirMissing } = existingIds(g.dir);
  const missing = g.want.filter((id) => !have.has(id));
  const extra = [...have].filter((id) => !g.want.includes(id));
  expectedTotal += g.want.length;
  missingTotal += missing.length;
  console.log(`[${g.label}]  出图规格 ${g.size}`);
  console.log(`  目录 ${g.dir}${dirMissing ? '   ⚠ 目录不存在（缺图时组件自动回落占位块/隐藏，不影响运行）' : ''}`);
  console.log(`  已有 ${g.want.length - missing.length} / 应有 ${g.want.length}`);
  if (missing.length) console.log(`  缺（${missing.length}）：${condense(missing)}`);
  if (extra.length) console.log(`  多出 ${extra.length} 个用不上的文件（仅提示，不算问题）：${condense(extra)}`);
  console.log('');
}

console.log(`=== 合计：应有 ${expectedTotal} 个文件，已有 ${expectedTotal - missingTotal} 个，缺 ${missingTotal} 个 ===`);
if (missingTotal === 0) {
  console.log('  美术图位齐全 ✓');
} else if (process.argv.includes('--strict')) {
  console.log('  --strict：缺文件 → 退出码 1 ✗');
  process.exitCode = 1;
} else {
  console.log('  缺文件属正常（美术尚未出图）；要让缺图报错就加 --strict（P9 收尾用）');
}
