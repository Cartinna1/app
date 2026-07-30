import { Skull, RotateCcw, Trophy } from 'lucide-react';

interface GameOverScreenProps {
  reason: string;
  turn: number;
  onRestart: () => void;
  isVictory?: boolean;
}

export default function GameOverScreen({ reason, turn, onRestart, isVictory = false }: GameOverScreenProps) {
  const victory = isVictory || reason.includes('🎉') || reason.includes('胜利');
  return (
    <div className="min-h-screen bg-slate-950 flex items-center justify-center p-4">
      <div className={`bg-slate-900/80 border rounded-2xl p-6 md:p-10 max-w-md w-full text-center shadow-2xl ${victory ? 'border-amber-700/50 shadow-amber-900/20' : 'border-red-800/50 shadow-red-900/20'}`}>
        {victory ? (
          <Trophy size={56} className="mx-auto mb-4 text-amber-400" />
        ) : (
          <Skull size={56} className="mx-auto mb-4 text-red-500" />
        )}
        <h1 className={`text-2xl md:text-3xl font-bold mb-3 ${victory ? 'text-amber-400' : 'text-red-400'}`}>
          {victory ? '游戏胜利' : '游戏结束'}
        </h1>
        <p className="text-slate-300 text-sm md:text-base mb-2 leading-relaxed">{reason}</p>
        <p className="text-slate-500 text-xs md:text-sm mb-6">
          {victory ? '历经' : '你坚持了'} <span className="text-slate-400 font-bold">{turn}</span> 个回合
        </p>
        <button
          onClick={onRestart}
          className={`w-full py-3 md:py-4 rounded-xl font-bold text-white transition-all shadow-lg flex items-center justify-center gap-2 ${victory ? 'bg-amber-600 hover:bg-amber-500 shadow-amber-900/30' : 'bg-red-700 hover:bg-red-600 shadow-red-900/30'}`}
        >
          <RotateCcw size={18} />
          重新开始
        </button>
      </div>
    </div>
  );
}
