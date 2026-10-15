import { useEffect, useRef, memo } from 'react';

interface StockPriceChartProps {
  /** 价格序列（数据层已保留最近 30 个点，组件内部再 slice(-30) 兜底） */
  prices: number[];
  /** 可选样式（缺省 = 桌面与手机详情区通用的满宽深底） */
  className?: string;
}

const DEFAULT_CLASS = 'w-full rounded-lg bg-slate-950 mb-4';

/** 股票走势图（网格 + 折线 + 渐变填充，涨青跌红）
 *  桌面详情区与手机详情区**各渲染一次**、各自持有 canvas / ref / 绘制 effect（不要共用 ref）。 */
function StockPriceChart({ prices, className = DEFAULT_CLASS }: StockPriceChartProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const draw = () => {
      const ctx = canvas.getContext('2d');
      if (!ctx) return;
      const values = prices.slice(-30);
      const w = canvas.width;
      const h = canvas.height;
      const padding = 20;
      ctx.clearRect(0, 0, w, h);
      if (values.length < 2) return;
      const min = Math.min(...values) * 0.95;
      const max = Math.max(...values) * 1.05;
      const range = max - min || 1;
      const getX = (i: number) => padding + (i / (values.length - 1)) * (w - padding * 2);
      const getY = (p: number) => h - padding - ((p - min) / range) * (h - padding * 2);
      ctx.strokeStyle = '#1e293b';
      ctx.lineWidth = 1;
      for (let i = 0; i <= 4; i++) {
        const y = padding + (i / 4) * (h - padding * 2);
        ctx.beginPath();
        ctx.moveTo(padding, y);
        ctx.lineTo(w - padding, y);
        ctx.stroke();
      }
      const isUp = values[values.length - 1] >= values[0];
      ctx.strokeStyle = isUp ? '#22d3ee' : '#f87171';
      ctx.lineWidth = 2;
      ctx.beginPath();
      values.forEach((p, i) => {
        if (i === 0) ctx.moveTo(getX(i), getY(p));
        else ctx.lineTo(getX(i), getY(p));
      });
      ctx.stroke();
      const gradient = ctx.createLinearGradient(0, padding, 0, h - padding);
      gradient.addColorStop(0, isUp ? 'rgba(34,211,238,0.15)' : 'rgba(248,113,113,0.15)');
      gradient.addColorStop(1, 'rgba(0,0,0,0)');
      ctx.fillStyle = gradient;
      ctx.beginPath();
      ctx.moveTo(getX(0), h - padding);
      values.forEach((p, i) => ctx.lineTo(getX(i), getY(p)));
      ctx.lineTo(getX(values.length - 1), h - padding);
      ctx.closePath();
      ctx.fill();
      values.forEach((p, i) => {
        ctx.fillStyle = i === values.length - 1 ? (isUp ? '#22d3ee' : '#f87171') : '#475569';
        ctx.beginPath();
        ctx.arc(getX(i), getY(p), i === values.length - 1 ? 4 : 2, 0, Math.PI * 2);
        ctx.fill();
      });
      ctx.fillStyle = '#94a3b8';
      ctx.font = '11px sans-serif';
      ctx.textAlign = 'right';
      ctx.fillText(`当前: ${values[values.length - 1]}`, w - padding, 14);
    };

    draw();
    // 窗口尺寸变化时重绘（切换股票时本 effect 依赖 prices 重建，顺带重绘）
    window.addEventListener('resize', draw);
    return () => window.removeEventListener('resize', draw);
  }, [prices]);

  return <canvas ref={canvasRef} width={280} height={140} className={className} />;
}

export default memo(StockPriceChart);
