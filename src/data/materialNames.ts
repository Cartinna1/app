// ==================== 原料中文名（唯一真值） ====================
// 全项目原料 id → 中文名 的唯一映射来源。
// 统一口径：gold_ore=黄金 / quantum=量子簇 / silicon=硅片 / carbon=碳块 / oil=石油 / dark_matter=暗物质。
// 任何界面要显示原料中文名，一律从 MATERIAL_NAME_MAP 取，不要再就地硬编码，避免同一原料多种译名。

export const MATERIAL_NAME_MAP: Record<string, string> = {
  carbon: '碳块',
  gold_ore: '黄金',
  oil: '石油',
  dark_matter: '暗物质',
  silicon: '硅片',
  quantum: '量子簇',
};

/** 取原料中文名；未知 id 原样返回，便于排查脏数据。 */
export function getMaterialName(materialId: string): string {
  return MATERIAL_NAME_MAP[materialId] ?? materialId;
}
