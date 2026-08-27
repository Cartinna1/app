// ==================== 远征回合推进（纯逻辑，仿 wonderTurn 模式） ====================
// 由 processColonyTurn 在每回合结算时调用；直接改写传入的 colony 草稿（调用方已克隆）。
// 状态机：0准备 → 1降落 → 2A → 3B → 4C → 5D → 6箴言/记录。
// B/C/D 每层需要上回合支付（paidThisTurn）才能推进；未支付则停留在当前层。

import type { Colony } from '@/types/colony';
import { getLeaderExpedition } from '@/data/colony/expeditions';

/** 处理远征每回合的推进（在 processColonyTurn 中调用） */
export function processExpeditionTurn(colony: Colony): void {
  const ex = colony.expedition;
  if (!ex) return;
  const route = getLeaderExpedition(ex.leaderId);
  if (!route) return;

  // 上回合是否已支付当前节点（决定本回合能否推进），随后重置本回合支付标记
  const paid = ex.paidThisTurn;
  ex.paidThisTurn = false;

  // 从节点的 children 中随机选一个后继（数据驱动，未配置返回 null）
  const rollChild = (parentId: string | null): string | null => {
    if (!parentId) return null;
    const parent = route.nodes[parentId];
    if (!parent?.children || parent.children.length === 0) return null;
    return parent.children[Math.floor(Math.random() * parent.children.length)];
  };

  switch (ex.stage) {
    case 0: // 准备 → 降落
      ex.stage = 1;
      break;
    case 1: {
      // 降落 → 随机 A 节点
      ex.stage = 2;
      const aIds = Object.keys(route.nodes).filter((id) => /^A\d+$/.test(id));
      ex.currentNodeId = aIds.length > 0 ? aIds[Math.floor(Math.random() * aIds.length)] : null;
      break;
    }
    case 2:
      // A 已展示（免费），下一回合自动进 B
      ex.stage = 3;
      ex.currentNodeId = rollChild(ex.currentNodeId);
      break;
    case 3:
      // B：上回合支付才进 C
      if (paid) {
        ex.stage = 4;
        ex.currentNodeId = rollChild(ex.currentNodeId);
      }
      break;
    case 4:
      // C：上回合支付才进 D
      if (paid) {
        ex.stage = 5;
        ex.currentNodeId = rollChild(ex.currentNodeId);
        ex.endingId = ex.currentNodeId;
      }
      break;
    case 5:
      // D：上回合支付 → 记录结局，进入箴言终局
      if (paid) {
        const endingId = ex.endingId;
        if (endingId) {
          const list = [...(colony.expeditionEndings?.[ex.leaderId] || [])];
          if (!list.includes(endingId)) list.push(endingId);
          colony.expeditionEndings = { ...(colony.expeditionEndings || {}), [ex.leaderId]: list };
        }
        ex.stage = 6;
      }
      break;
    // case 6: 箴言终局，保持展示；玩家可再次发起新远征覆盖
  }
}
