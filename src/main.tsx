import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import './index.css';
import App from './App.tsx';
import ErrorBoundary from './components/ErrorBoundary';

// React 19 根级错误回调（createRoot 第二参数，签名已核对 @types/react-dom 19.2.3 的 RootOptions）：
//   onUncaughtError    (error: unknown, errorInfo: { componentStack?: string }) 未捕获（无边界接住 → 卸载根树 → 白屏）
//   onCaughtError      (error: unknown, errorInfo: { componentStack?: string; errorBoundary?: Component }) 被错误边界接住
//   onRecoverableError (error: unknown, errorInfo: ErrorInfo) 可恢复错误（hydration 不匹配等）
// 三个都打全，不静默吞掉，方便手机端远程调试时从控制台一眼看出原因。
// ⚠ 参数与对象本身都不写类型注解：由 RootOptions 上下文推断，签名上不做任何断言。
const rootErrorHandlers = {
  onUncaughtError: (error, errorInfo) => {
    console.error('[根级] 未捕获的渲染错误：', error);
    console.error('[根级] 组件栈：', errorInfo.componentStack ?? '');
  },
  onCaughtError: (error, errorInfo) => {
    console.error('[根级] 错误已被边界接住：', error);
    console.error('[根级] 组件栈：', errorInfo.componentStack ?? '');
  },
  onRecoverableError: (error, errorInfo) => {
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
