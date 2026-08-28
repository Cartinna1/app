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
  if (!ex.history) ex.history = [];

  // 记入剧情历史（供「回顾剧情」）：A 节点免费、进入即记；B/C/D 付费节点在支付后才记，
  // 未支付前回顾看不到正文（防白嫖付费剧情）
  const enterNode = (nodeId: string | null): void => {
    if (nodeId && !ex.history!.includes(nodeId)) ex.history!.push(nodeId);
  };

  // 从节点的 children 中随机选一个后继（数据驱动，未配置返回 null）
  const rollChild = (parentId: string | null): string | null => {
    if (!parentId) return null;
    const parent = route.nodes[parentId];
    if (!parent?.children || parent.children.length === 0) return null;
    return parent.children[Math.floor(Math.random() * parent.children.length)];
  };

  // ===== 收集导向（方案 B）：随机时优先"未收集结局"的分支，集齐 12 后回退纯随机 =====
  const collectedSet = new Set(colony.expeditionEndings?.[ex.leaderId] || []);
  // C 节点 → 其唯一 D 结局 id
  const dOfC = (cId: string): string | null => {
    const c = route.nodes[cId];
    return c?.children && c.children.length === 1 ? c.children[0] : null;
  };
  // C 分支是否通向未收集结局
  const cFresh = (cId: string): boolean => {
    const d = dOfC(cId);
    return d ? !collectedSet.has(d) : true;
  };
  // A 分支是否还有未收集结局可达（A→B→C→D 全展开）
  const aFresh = (aId: string): boolean =>
    (route.nodes[aId]?.children || []).some((bId) =>
      (route.nodes[bId]?.children || []).some(cFresh)
    );
  const pickFrom = (ids: string[]): string | null => ids.length > 0 ? ids[Math.floor(Math.random() * ids.length)] : null;
  // 随机选 A：优先还有新结局的 A
  const rollA = (): string | null => {
    const aIds = Object.keys(route.nodes).filter((id) => /^A\d+$/.test(id));
    const fresh = aIds.filter(aFresh);
    return pickFrom(fresh.length > 0 ? fresh : aIds);
  };
  // B → C：优先 C 的 D 未收集
  const rollFreshC = (parentId: string | null): string | null => {
    if (!parentId) return null;
    const parent = route.nodes[parentId];
    if (!parent?.children || parent.children.length === 0) return null;
    const fresh = parent.children.filter(cFresh);
    return pickFrom(fresh.length > 0 ? fresh : parent.children);
  };

  switch (ex.stage) {
    case 0: // 准备 → 降落
      ex.stage = 1;
      break;
    case 1: {
      // 降落 → 随机 A 节点（收集导向：优先未收集结局的 A）
      ex.stage = 2;
      ex.currentNodeId = rollA();
      enterNode(ex.currentNodeId);
      break;
    }
    case 2:
      // A 已展示（免费），下一回合自动进 B（B 为付费层，进入时不记 history，支付后才记）
      ex.stage = 3;
      ex.currentNodeId = rollChild(ex.currentNodeId);
      break;
    case 3:
      // B：上回合支付才进 C（收集导向：优先 C 的 D 未收集）。支付后先记 B，再进 C（不记）
      if (paid) {
        enterNode(ex.currentNodeId);
        ex.stage = 4;
        ex.currentNodeId = rollFreshC(ex.currentNodeId);
      }
      break;
    case 4:
      // C：上回合支付才进 D。支付后先记 C，再进 D（不记）
      if (paid) {
        enterNode(ex.currentNodeId);
        ex.stage = 5;
        ex.currentNodeId = rollChild(ex.currentNodeId);
        ex.endingId = ex.currentNodeId;
      }
      break;
    case 5:
      // D：上回合支付 → 记录结局，进入箴言终局（支付后先记 D）
      if (paid) {
        enterNode(ex.currentNodeId);
        const endingId = ex.endingId;
        if (endingId) {
          const list = [...(colony.expeditionEndings?.[ex.leaderId] || [])];
          if (!list.includes(endingId)) list.push(endingId);
          colony.expeditionEndings = { ...(colony.expeditionEndings || {}), [ex.leaderId]: list };
        }
        ex.stage = 6;
      }
      break;
    case 6:
      // 箴言回合已展示完毕，结束远征（回到选领袖界面；结局已记录在 expeditionEndings）
      colony.expedition = undefined;
      break;
  }
}
