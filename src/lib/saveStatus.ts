import { useSyncExternalStore } from 'react';

/**
 * 存档失败可见化（运行时状态，**不进存档**：不动 lib/save.ts、不加 GameState 字段、不升 saveVersion）
 * 唯一写入点 = hooks/useSave.ts 的自动存档 try/catch；唯一读取点 = App.tsx 顶部的警示条。
 * 手机上 console.warn 等于不存在，所以失败必须落到界面上。
 */

let saveError: string | null = null;
const listeners = new Set<() => void>();

function emit() {
  listeners.forEach((listener) => listener());
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

function getSnapshot(): string | null {
  return saveError;
}

/** 存档失败：同一句话重复上报不重复通知（避免每次自动存档都触发一轮重渲染） */
export function reportSaveError(message: string): void {
  if (saveError === message) return;
  saveError = message;
  emit();
}

/** 存档成功或玩家手动关闭警示条 */
export function clearSaveError(): void {
  if (saveError === null) return;
  saveError = null;
  emit();
}

export function useSaveError(): string | null {
  return useSyncExternalStore(subscribe, getSnapshot);
}
