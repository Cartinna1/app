// ==================== 敌方旗帜（雇佣兵协会四支势力的徽记，唯一映射） ====================
// **这是"敌人 id → 旗帜路径"的唯一真值**：UI 不许自己拼 `/battle/guild/flag-*.webp`。
//
// 出口规则：只给**四支敌对势力**（m01~m04）出旗；`m05`（弱海盗杂兵）与 `raid`（掠夺队）
//   **返回 null** —— 它们没有旗帜，界面上**不渲染**徽记，也不许塞占位图（缺图不崩、不留空框）。
//
// ⚠ 图在 `public/battle/guild/`（512×512，**原图直接用**）：最大出口只有 40px，属 AGENTS 第五节
//   的"64px 级出口"→ **不生成缩略图、不进 `gen-thumbs.py` 的默认目录**。
// ⚠ 文件名与势力一一对应（swarm 虫群 / machine 智械 / tide 灵潮 / codex 旧律），
//   改名字只改这张表；`check-mercenary.cjs` 会用 `fs.existsSync` 验四个文件真实存在。

import type { PirateBossId } from '@/types/battle';

/** 敌人 id → 旗帜文件（只覆盖四支势力） */
const FLAG_BY_BOSS: Readonly<Record<string, string>> = {
  m01: 'flag-swarm.webp',
  m02: 'flag-machine.webp',
  m03: 'flag-tide.webp',
  m04: 'flag-codex.webp',
};

/** 敌人 id → 旗帜的**显示名**（给 `alt` / `title` 用；没有旗帜的敌人返回 null） */
const FLAG_LABEL: Readonly<Record<string, string>> = {
  m01: '噬星虫群',
  m02: '残响智械',
  m03: '忆潮灵能者',
  m04: '旧律军团',
};

/** 旗帜目录（供文档/断言引用，勿在业务代码里重复硬编码） */
export const ENEMY_FLAG_DIR = '/battle/guild';

/**
 * 该敌人有没有旗帜；有则返回**可直接放进 `<img src>` 的路径**，没有返回 `null`。
 * ⚠ 返回 null 时界面**不渲染徽记元素**（不占位、不塞问号图）。
 */
export function enemyFlagPath(bossId: PirateBossId | string | null | undefined): string | null {
  if (!bossId) return null;
  const file = FLAG_BY_BOSS[bossId];
  return file ? `${ENEMY_FLAG_DIR}/${file}` : null;
}

/** 旗帜的显示名（`alt` / `title`）；没有旗帜返回 `null`。⚠ 触屏上没有 hover，别只靠 title 传达信息。 */
export function enemyFlagLabel(bossId: PirateBossId | string | null | undefined): string | null {
  if (!bossId) return null;
  return FLAG_LABEL[bossId] || null;
}
