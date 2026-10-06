// ==================== 编制示例（注意：卡库初始为空，这些只是"一套合理编制长什么样"，不是开局赠送） ====================
// 本文件由 scripts/export-battle-data.cjs 从 carddemo/engine.js 生成 —— **请勿手改**。
// 改卡牌数据请改 DEMO 引擎（或 V1.5 后同步 DEMO），然后重跑：
//   node scripts/export-battle-data.cjs && node scripts/verify-battle-data.cjs

import type { ShipCardId } from '@/types/battle';

/** V1.5 §5 的新手编制示例（26 艘；文档里的"备用 4 艘"只是占位，未纳入） */
export const FLEET_STARTER: readonly ShipCardId[] = ["h1","h1","c1","c1","h2","h2","c2","c2","h3","h3","c3","c3","c4","c4","h4","h4","p4","g3","h6","h6","c5","c5","i5","h7","c6","c6"];

/** 玩家可获得的全部卡牌各一张（用于构筑参考与平衡测试） */
export const FLEET_ALL: readonly ShipCardId[] = ["h1","h2","h3","h4","h5","h6","h7","i1","i2","i3","i4","i5","i6","i7","p1","p2","p3","p4","p5","p6","p7","g1","g2","g3","g4","g5","g6","c1","c2","c3","c4","c5","c6"];

/** 曲线：1费×4 / 2费×4 / 3费×7 / 4费×3 / 5费×5 / 6费×3（共 26 艘） */
export const FLEET_STARTER_CURVE = "1费×4 / 2费×4 / 3费×7 / 4费×3 / 5费×5 / 6费×3";
