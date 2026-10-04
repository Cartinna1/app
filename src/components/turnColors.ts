// ==================== 共享 UI 常量 ====================
// 产品按"生产回合数"分类的标签配色：生产中心（ProductionPanel）与交易集会（ProductMarket）
// 原先各写一份完全相同的表，改配色要改两处 → 收敛到这里。

/** 产品分类标签颜色（键 = 生产回合数 1~6） */
export const TURN_COLORS: Record<number, string> = {
  1: 'bg-green-900/30 text-green-400',
  2: 'bg-yellow-900/30 text-yellow-400',
  3: 'bg-orange-900/30 text-orange-400',
  4: 'bg-red-900/30 text-red-400',
  5: 'bg-purple-900/30 text-purple-400',
  6: 'bg-cyan-900/30 text-cyan-400',
};
