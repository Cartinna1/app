import { Component, type ErrorInfo, type ReactNode } from 'react';

/**
 * 渲染期错误边界（全库唯一）：React 19 下渲染期未捕获异常会卸载整棵根树 → 整屏白屏（只剩 body 底色）。
 * 用法：
 *   · 顶层兜底（main.tsx）：完整版，带可复制的 componentStack
 *   · 页签内容区（GameScreen.tsx）：紧凑版，**不传 key**
 * 恢复方式 = 错误卡上的「重试」（清自身 error state 后重渲染）。
 * ⚠ 不要用 key={activeTab} 之类的方式重挂页签区来"顺手恢复"：key 变化会卸载重挂整棵子树，
 *   把页签内的 useState（事件结果卡、机库选中项……）全清空（2026-08 的回归原因）。
 *   本组件自己也不写 key 逻辑，重置时机由调用方决定。
 */

interface ErrorBoundaryProps {
  children: ReactNode;
  /** 出错卡片的标题：顶层用「出错了」，游戏内页签用「这个页面出错了」 */
  title?: string;
  /** 是否展示可复制的组件栈：顶层 true，页签内 false */
  showStack?: boolean;
}

interface ErrorBoundaryState {
  error: Error | null;
  componentStack: string;
}

interface ErrorCardProps {
  title: string;
  showStack: boolean;
  fallbackStack: string;
  error: Error | null;
  onRetry: () => void;
}

function ErrorCard({ title, showStack, fallbackStack, error, onRetry }: ErrorCardProps) {
  const message = error?.message || '未知错误';

  const copy = () => {
    const text = [`${title}：${message}`, fallbackStack].filter(Boolean).join('\n\n');
    try {
      void navigator.clipboard?.writeText(text)?.catch(() => {});
    } catch {
      // 剪贴板不可用（非 HTTPS / 权限被拒）：静默，不打断玩家
    }
  };

  return (
    <div className="mx-auto my-4 w-full max-w-xl rounded-xl border border-amber-700/60 bg-slate-900/95 p-4 text-slate-200 shadow-lg">
      <h2 className="text-base font-bold text-amber-300">{title}</h2>
      <p className="mt-1 whitespace-pre-wrap break-all text-xs leading-relaxed text-rose-300 select-all">{message}</p>
      {showStack && fallbackStack && (
        <pre className="mt-3 max-h-40 overflow-auto rounded-lg border border-slate-700/60 bg-slate-950/80 p-2 text-[10.5px] leading-snug text-slate-400 select-all">
          {fallbackStack}
        </pre>
      )}
      <div className="mt-3 flex flex-wrap gap-2">
        <button
          type="button"
          onClick={onRetry}
          className="rounded-lg border border-cyan-600/50 bg-cyan-600/20 px-3 py-1.5 text-xs font-bold text-cyan-300 hover:bg-cyan-600/30"
        >
          重试
        </button>
        <button
          type="button"
          onClick={() => window.location.reload()}
          className="rounded-lg border border-slate-600/60 bg-slate-800 px-3 py-1.5 text-xs font-bold text-slate-200 hover:bg-slate-700"
        >
          重新载入
        </button>
        <button
          type="button"
          onClick={copy}
          className="rounded-lg border border-slate-600/60 bg-slate-800 px-3 py-1.5 text-xs font-bold text-slate-200 hover:bg-slate-700"
        >
          复制错误信息
        </button>
      </div>
      <p className="mt-3 text-[11px] leading-relaxed text-slate-400">
        存档在结束回合时已自动保存，重新载入不会丢失上一回合的进度。
      </p>
    </div>
  );
}

class ErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
  state: ErrorBoundaryState = { error: null, componentStack: '' };

  // ⚠ 本机没有 node_modules（构建在用户侧），参数类型必须写死：React 基类签名是
  //    static getDerivedStateFromError(error: any) / componentDidCatch(error: Error, errorInfo: ErrorInfo)
  static getDerivedStateFromError(error: Error) {
    return { error };
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error('[ErrorBoundary] 渲染出错：', error);
    console.error('[ErrorBoundary] 组件栈：', errorInfo.componentStack);
    this.setState({ componentStack: errorInfo.componentStack || '' });
  }

  handleRetry = () => {
    this.setState({ error: null, componentStack: '' });
  };

  render() {
    const { children, title = '出错了', showStack = true } = this.props;
    const { error, componentStack } = this.state;

    if (error) {
      return (
        <ErrorCard
          title={title}
          showStack={showStack}
          fallbackStack={componentStack}
          error={error}
          onRetry={this.handleRetry}
        />
      );
    }

    return children;
  }
}

export default ErrorBoundary;
