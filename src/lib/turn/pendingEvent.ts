// ==================== 未处理事件（跃迁守卫的唯一真值） ====================
// 「有未处理事件 → 禁止跃迁」这条规则的**判据与文案**都只在本文件写一次，消费方：
//   ① hooks/useTrade.travelToNode —— dispatch **之前**的同步拦截（返回失败 + PENDING_EVENT_TRAVEL_BLOCK）
//   ② components/GalaxyMapPanel.renderTravelAction —— 跃迁按钮置灰 + 旁边显示同一句原因
//   ③ components/GameScreen 的「确认结束回合」弹窗 —— 未处理事件会随回合推进消失（只提示、不拦）
// ⚠ UI 里**不许**再写 `activeEvent !== null` 之类的第二份判断：按钮只读 useGameState 下发的布尔值。
//
// 为什么要注入而不是直接读：activeEvent 是 useEvent 的 useState（**不在 GameState 上**、不进存档），
//   useTrade 拿不到它；而 useEvent 与 useTrade **不许互相 import**。所以由组合点 hooks/useGameState
//   把这个判据包成 `() => boolean` 注入给 useTrade（详见那里的 hasUnresolvedEventGuard）。

/** 跃迁被未处理事件拦下时的中文原因（守卫返回值 + 星图按钮旁边那句话的唯一出处） */
export const PENDING_EVENT_TRAVEL_BLOCK = '请先处理当前事件（事件页签）';

/** 未处理事件的来源开关：由组合点 useGameState 把 useEvent 的组件态翻译成这个结构后传入 */
export interface UnresolvedEventFlags {
  /** 普通事件卡还等着玩家处理（= useEvent.activeEvent !== null） */
  activeEvent: boolean;
  /** 剧情链卡还有未处理的阶段（= visionChain.pendingStage !== null；**未上线**，暂时不传） */
  visionChainStage?: boolean;
}

/** 是否有未处理的（玩家必须先处理掉的）事件 */
export function hasUnresolvedEvent(flags: UnresolvedEventFlags): boolean {
  // ⚠ 剧情链卡上线后，这里要把 `visionChain.pendingStage !== null` 一起并进来（同一判据，不要再开第二个）：
  //   入参字段 visionChainStage 已经留好，只需在组合点 useGameState 的 hasUnresolvedEventGuard 里
  //   把 `visionChain.pendingStage !== null` 传进来 —— 本函数体不用改，但**必须**确认它真的被接上。
  return flags.activeEvent || flags.visionChainStage === true;
}
