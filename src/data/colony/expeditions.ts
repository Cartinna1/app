// ==================== 领袖远征数据（剧情树） ====================
// 每领袖一条路线，数据按领袖拆分在 ./expeditions/<leaderId>.ts（如 L1.ts/L2.ts），
// 本文件只做聚合与工具函数，避免单文件膨胀（22 领袖全量约 1 万行）。
// 资源消耗 key：gold/food/alloy/stardust/原料id(silicon/quantum/carbon/dark_matter等)/researchPoints。
// 图片规则：public/expeditions/<leaderId>/planet.webp（降落）、<D节点id>.webp（结局，如 D7.webp），统一 WebP。
// ⚠ 录入故事文本时：文档里的 'xxx'（ASCII 单引号，如「叫'回头青'」）会截断单引号字符串，
//   请用模板字符串（反引号）或转义 \'；录入后 grep `[\u4e00-\u9fff]'[\u4e00-\u9fff]` 自检。

import type { LeaderExpedition } from '@/types/colony';
import { expeditionL1 } from './expeditions/L1';
import { expeditionL2 } from './expeditions/L2';
import { expeditionL13 } from './expeditions/L13';
import { expeditionL22 } from './expeditions/L22';

/** 远征启动星尘费（唯一数字锚点） */
export const EXPEDITION_COST = 30;

/** 节点消耗资源 → 中文显示名（hook 报错与 UI 消耗明细共用） */
export const RESOURCE_LABELS: Record<string, string> = {
  gold: '金币',
  food: '食物',
  alloy: '合金',
  stardust: '星尘',
  silicon: '硅片',
  quantum: '量子簇',
  carbon: '碳块',
  dark_matter: '暗物质',
  gold_ore: '黄金',
  oil: '石油',
  researchPoints: '科研点',
};

/** 全部领袖远征路线（key = leaderId） */
export const LEADER_EXPEDITIONS: Record<string, LeaderExpedition> = {
  L1: expeditionL1,
  L2: expeditionL2,
  L13: expeditionL13,
  L22: expeditionL22,
};

/** 获取领袖远征路线（未开发返回 undefined，UI 提示"敬请期待"） */
export function getLeaderExpedition(leaderId: string): LeaderExpedition | undefined {
  return LEADER_EXPEDITIONS[leaderId];
}

/** 数据自检：A 恰 2 个 B、B 恰 2 个 C、C 恰 1 个 D（开发期防手误） */
export function validateExpeditionTree(): boolean {
  for (const route of Object.values(LEADER_EXPEDITIONS)) {
    const ids = Object.keys(route.nodes);
    const isA = (id: string) => /^A\d+$/.test(id);
    const isB = (id: string) => /^B\d+$/.test(id);
    const isC = (id: string) => /^C\d+$/.test(id);
    const isD = (id: string) => /^D\d+$/.test(id);
    for (const id of ids) {
      const node = route.nodes[id];
      if (!node.children || node.children.length === 0) {
        if (!isD(id)) return false; // 非 D 节点必须有后继
        continue;
      }
      if (isA(id) && node.children.length !== 2) return false;
      if (isB(id) && node.children.length !== 2) return false;
      if (isC(id) && node.children.length !== 1) return false;
    }
  }
  return true;
}
