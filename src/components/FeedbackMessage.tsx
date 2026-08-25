import { memo } from 'react';

interface FeedbackMessageProps {
  message: string;
  type: 'success' | 'error';
  className?: string;
}

// 交易/操作结果消息框（单一样式真值）
// 成功：绿底绿字；失败：红底红字。默认 mb-3，可传 className 覆盖（如遗物区用 mt-3）。
// message 为空时不渲染，调用方无需再包 {msg && ...}。
function FeedbackMessage({ message, type, className = 'mb-3' }: FeedbackMessageProps) {
  if (!message) return null;
  return (
    <div className={`${className} p-3 rounded-lg text-sm text-center ${
      type === 'success'
        ? 'bg-green-900/20 border border-green-700/50 text-green-400'
        : 'bg-red-900/20 border border-red-700/50 text-red-400'
    }`}>
      {message}
    </div>
  );
}

export default memo(FeedbackMessage);
