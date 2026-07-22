import { Skull, RotateCcw } from 'lucide-react';

interface GameOverScreenProps {
  reason: string;
  turn: number;
  onRestart: () => void;
}

export default function GameOverScreen({ reason, turn, onRestart }: GameOverScreenProps) {
  return (
    <div className="min-h-screen bg-slate-950 flex items-center justify-center p-4">
      <div className="bg-slate-900/80 border border-red-800/50 rounded-2xl p-6 md:p-10 max-w-md w-full text-center shadow-2xl shadow-red-900/20">
        <Skull size={56} className="mx-auto mb-4 text-red-500" />
        <h1 className="text-2xl md:text-3xl font-bold text-red-400 mb-3">游戏结束</h1>
        <p className="text-slate-300 text-sm md:text-base mb-2 leading-relaxed">{reason}</p>
        <p className="text-slate-500 text-xs md:text-sm mb-6">你坚持了 <span className="text-slate-400 font-bold">{turn}</span> 个回合</p>

        <button
          onClick={onRestart}
          className="w-full py-3 md:py-4 bg-red-700 hover:bg-red-600 rounded-xl font-bold text-white transition-all shadow-lg shadow-red-900/30 flex items-center justify-center gap-2"
        >
          <RotateCcw size={18} />
          重新开始
        </button>
      </div>
    </div>
  );
}
