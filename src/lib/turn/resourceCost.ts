// ==================== 资源成本校验与扣减（唯一真值） ====================
// 远征节点支付与考古阶段投入共用：扣减口径一致（科研点扣殖民地，其余扣母舰）。
// ⚠ 逻辑改动必须同时惠及两个消费方，勿在任何 hook 里另写一份。

import type { Mothership } from '@/types/game';
import type { Colony } from '@/types/colony';
import { RESOURCE_LABELS } from '@/data/colony/expeditions';

/** 当前持有量（按资源 key） */
export function resourceAmount(ship: Mothership, colony: Colony | undefined, key: string): number {
  switch (key) {
    case 'gold': return ship.gold;
    case 'food': return ship.food;
    case 'alloy': return ship.alloy;
    case 'stardust': return ship.stardust;
    case 'researchPoints': return colony?.techState?.researchPoints || 0;
    default: return (ship.materials && ship.materials[key]) || 0; // silicon/quantum/carbon/dark_matter 等
  }
}

/** 扣减（调用方已克隆 ship 与 colony，直接改写） */
export function deductResource(ship: Mothership, colony: Colony | undefined, key: string, amount: number): void {
  switch (key) {
    case 'gold': ship.gold -= amount; break;
    case 'food': ship.food -= amount; break;
    case 'alloy': ship.alloy -= amount; break;
    case 'stardust': ship.stardust -= amount; break;
    case 'researchPoints':
      if (colony?.techState) {
        colony.techState = { ...colony.techState, researchPoints: colony.techState.researchPoints - amount };
      }
      break;
    default:
      ship.materials = { ...ship.materials, [key]: ((ship.materials && ship.materials[key]) || 0) - amount };
      break;
  }
}

/** 是否付得起（cost 为扁平的 资源key → 数量） */
export function canAfford(ship: Mothership, colony: Colony | undefined, cost: Record<string, number>): boolean {
  return Object.entries(cost).every(([key, amount]) => resourceAmount(ship, colony, key) >= amount);
}

/** 首个不足的资源提示文案；都够则返回 null */
export function firstMissing(ship: Mothership, colony: Colony | undefined, cost: Record<string, number>): string | null {
  for (const [key, amount] of Object.entries(cost)) {
    if (resourceAmount(ship, colony, key) < amount) {
      return `资源不足：${RESOURCE_LABELS[key] || key}不足（需要 ${amount}）`;
    }
  }
  return null;
}

/** 扣减整份成本（调用前应先用 firstMissing/canAfford 校验） */
export function payCost(ship: Mothership, colony: Colony | undefined, cost: Record<string, number>): void {
  for (const [key, amount] of Object.entries(cost)) deductResource(ship, colony, key, amount);
}

/** 把嵌套的 materials 成本摊平成"资源key → 数量"（考古 ArchaeologyCost → 统一口径） */
export function flattenCost(cost: {
  gold?: number; food?: number; alloy?: number; stardust?: number; researchPoints?: number;
  materials?: Record<string, number>;
}): Record<string, number> {
  const flat: Record<string, number> = {};
  if (cost.gold) flat.gold = cost.gold;
  if (cost.food) flat.food = cost.food;
  if (cost.alloy) flat.alloy = cost.alloy;
  if (cost.stardust) flat.stardust = cost.stardust;
  if (cost.researchPoints) flat.researchPoints = cost.researchPoints;
  if (cost.materials) {
    for (const [id, amount] of Object.entries(cost.materials)) {
      if (amount) flat[id] = (flat[id] || 0) + amount;
    }
  }
  return flat;
}

/** 成本的中文展示（如「金币×5000 + 科研点×150」） */
export function formatCost(cost: Record<string, number>): string {
  return Object.entries(cost).map(([k, v]) => `${RESOURCE_LABELS[k] || k}×${v}`).join(' + ');
}

// ==================== 取消/拆除的返还比例（唯一真值） ====================
// 两个消费方必须同源：殖民地取消建造 / 拆除建筑（lib/colony/costs.getBuildingRefundProfile）
// 与船坞取消造舰（lib/battle/shipyard.buildRefund）。历史上两处各写一遍 0.4 / 0.7，
// 注释都写着"与殖民地一致"——一致性靠人记着，改一处就分叉。
// ⚠ 一律按**实付成本**算（含星球/领袖修正），不是基础价：按基础价会在低倍率配置下产生套利。

/** 金币返还比例 */
export const REFUND_GOLD_RATIO = 0.4;
/** 合金与原料返还比例 */
export const REFUND_MATERIAL_RATIO = 0.7;

/** 按**实付** cost 对象算返还（金币/合金/原料逐项向下取整）。
 *  `paid` 必须是玩家真正付出去的数额（如 `getBuildingCostProfile` 的结果、`BuildQueueItem.cost`）。 */
export function refundFromPaid(paid: {
  gold?: number;
  alloy?: number;
  materials?: Record<string, number>;
}): { gold: number; alloy: number; materials: Record<string, number> } {
  const materials: Record<string, number> = {};
  for (const [matId, amount] of Object.entries(paid.materials || {})) {
    materials[matId] = Math.floor(amount * REFUND_MATERIAL_RATIO);
  }
  return {
    gold: Math.floor((paid.gold || 0) * REFUND_GOLD_RATIO),
    alloy: paid.alloy ? Math.floor(paid.alloy * REFUND_MATERIAL_RATIO) : 0,
    materials,
  };
}
