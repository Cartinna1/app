/**
 * Node ESM 解析钩子：让 `node` 直接运行本仓库的 .ts 时能解析
 *   ① `@/xxx` 别名（→ src/xxx.ts）
 *   ② 不带扩展名的相对导入（→ 补 .ts）
 * 用途：对拍测试 / 数据校验等"零依赖、直接用 Node 跑 TS"的场景。
 * 用法：node --import ./scripts/register-ts.mjs <脚本>
 */
import { existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const SRC = pathToFileURL(path.join(ROOT, 'src') + path.sep).href;

const HAS_EXT = /\.(ts|tsx|mts|cts|js|mjs|cjs|json)$/;

function withTs(href) {
  return HAS_EXT.test(href) ? href : href + '.ts';
}

export async function resolve(specifier, context, nextResolve) {
  // ① @/xxx → src/xxx.ts
  if (specifier.startsWith('@/')) {
    return nextResolve(withTs(new URL(specifier.slice(2), SRC).href), context);
  }
  // ② ./xxx、../xxx 没写扩展名 → 补 .ts（存在才补，避免破坏 node_modules 裸包与目录导入）
  if ((specifier.startsWith('./') || specifier.startsWith('../')) && context.parentURL && !HAS_EXT.test(specifier)) {
    const cand = withTs(new URL(specifier, context.parentURL).href);
    if (existsSync(fileURLToPath(cand))) return nextResolve(cand, context);
  }
  return nextResolve(specifier, context);
}

/**
 * 给每个 .ts 模块前置一句 `import.meta.env ??= {…}`：
 * 仓库里有代码读 `import.meta.env.DEV`（Vite 注入的），纯 Node 下没有这个对象会直接抛错。
 * 这是"让仓库代码能在 Node 里直接跑"的最小 shim，不改变任何业务逻辑。
 */
export async function load(url, context, nextLoad) {
  const r = await nextLoad(url, context);
  const isTs = url.endsWith('.ts') || url.endsWith('.mts') || url.endsWith('.tsx');
  if (!isTs || typeof r.source === 'undefined') return r;
  const src = typeof r.source === 'string' ? r.source : Buffer.from(r.source).toString('utf8');
  const prelude =
    "import.meta.env ??= { DEV: false, PROD: true, MODE: 'test', SSR: false, BASE_URL: '/' };\n";
  return { ...r, source: prelude + src, format: r.format || 'module' };
}
