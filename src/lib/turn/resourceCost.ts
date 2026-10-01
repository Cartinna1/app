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
