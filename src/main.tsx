import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import './index.css';
import App from './App.tsx';
import ErrorBoundary from './components/ErrorBoundary';

// React 19 根级错误回调（createRoot 第二参数，签名已核对 @types/react-dom 19.2.3 的 RootOptions）：
//   onUncaughtError    (error: unknown, errorInfo: { componentStack?: string }) 未捕获（无边界接住 → 卸载根树 → 白屏）
//   onCaughtError      (error: unknown, errorInfo: { componentStack?: string; errorBoundary?: Component }) 被错误边界接住
//   onRecoverableError (error: unknown, errorInfo: ErrorInfo) 可恢复错误（hydration 不匹配等）
// ⚠ 本机没有 node_modules（构建在用户侧），所以这里**显式写参数类型**，不依赖上下文推断。
// 形状照 @types/react-dom 的 RootOptions：error 一律 unknown，errorInfo 只带 componentStack（可为 null）。
type RootErrorInfo = { componentStack?: string | null };
const rootErrorHandlers = {
  onUncaughtError: (error: unknown, errorInfo: RootErrorInfo) => {
    console.error('[根级] 未捕获的渲染错误：', error);
    console.error('[根级] 组件栈：', errorInfo.componentStack ?? '');
  },
  onCaughtError: (error: unknown, errorInfo: RootErrorInfo) => {
    console.error('[根级] 错误已被边界接住：', error);
    console.error('[根级] 组件栈：', errorInfo.componentStack ?? '');
  },
  onRecoverableError: (error: unknown, errorInfo: RootErrorInfo) => {
    console.error('[根级] 可恢复错误：', error);
    console.error('[根级] 组件栈：', errorInfo.componentStack ?? '');
  },
};

createRoot(document.getElementById('root')!, rootErrorHandlers).render(
  <StrictMode>
    <ErrorBoundary>
      <App />
    </ErrorBoundary>
  </StrictMode>,
);
