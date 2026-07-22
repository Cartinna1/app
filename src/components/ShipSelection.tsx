import { useState } from 'react';
import { MOTHERSHIP_TEMPLATES } from '@/data/gameData';
import { Rocket, Shield, Zap, Crown, Star, Atom, Check } from 'lucide-react';

interface ShipSelectionProps {
  onSelect: (shipId: number) => void;
  onLoad: () => void;
  hasSave: boolean;
}

const shipIcons = [Rocket, Zap, Crown, Star, Atom, Shield];

const shipColors = [
  { border: 'border-red-500', bg: 'bg-red-500/10', icon: 'text-red-400', hover: 'hover:border-red-400' },
  { border: 'border-purple-500', bg: 'bg-purple-500/10', icon: 'text-purple-400', hover: 'hover:border-purple-400' },
  { border: 'border-yellow-500', bg: 'bg-yellow-500/10', icon: 'text-yellow-400', hover: 'hover:border-yellow-400' },
  { border: 'border-green-500', bg: 'bg-green-500/10', icon: 'text-green-400', hover: 'hover:border-green-400' },
  { border: 'border-blue-500', bg: 'bg-blue-500/10', icon: 'text-blue-400', hover: 'hover:border-blue-400' },
  { border: 'border-orange-500', bg: 'bg-orange-500/10', icon: 'text-orange-400', hover: 'hover:border-orange-400' },
];

export default function ShipSelection({ onSelect, onLoad, hasSave }: ShipSelectionProps) {
  const [selectedShipId, setSelectedShipId] = useState<number | null>(null);
  const [error, setError] = useState('');

  const handleStart = () => {
    setError('');

    if (selectedShipId === null) {
      setError('请先选择一艘母舰');
      return;
    }

    onSelect(selectedShipId);
  };

  return (
    <div className="min-h-screen bg-gradient-to-b from-slate-950 via-indigo-950 to-slate-950 text-slate-100 flex flex-col items-center justify-center px-3 py-8">
      {/* 标题 */}
      <div className="text-center mb-4 md:mb-8">
        <h1 className="text-3xl md:text-5xl font-bold bg-gradient-to-r from-cyan-400 via-blue-400 to-purple-400 bg-clip-text text-transparent mb-2 md:mb-3">
          航空生涯之旅
        </h1>
        <p className="text-slate-400 text-sm md:text-lg">选择你的舰队，开启星际金融征程</p>
      </div>

      {/* 母舰选择 */}
      <div className="w-full max-w-5xl mb-4 md:mb-8 px-3 md:px-0">
        <p className="text-center text-sm text-slate-400 mb-3 md:mb-4">
          选择一艘母舰 <span className="text-red-400">*</span>
          {selectedShipId !== null && (
            <span className="text-green-400 ml-2 flex items-center gap-1 inline-flex">
              <Check size={14} />
              已选择: {MOTHERSHIP_TEMPLATES.find(s => s.id === selectedShipId)?.name}
            </span>
          )}
        </p>

        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3 md:gap-4">
          {MOTHERSHIP_TEMPLATES.map((ship, index) => {
            const Icon = shipIcons[index];
            const colors = shipColors[index];
            const isSelected = selectedShipId === ship.id;

            return (
              <button
                key={ship.id}
                onClick={() => { setSelectedShipId(ship.id); setError(''); }}
                className={`relative rounded-xl border-2 p-4 md:p-5 text-left transition-all duration-200 ${
                  isSelected
                    ? `${colors.border} ${colors.bg} shadow-lg scale-[1.01] md:scale-[1.02]`
                    : `border-slate-700 bg-slate-900/60 ${colors.hover} hover:border-slate-500 hover:bg-slate-800/60`
                }`}
              >
                {isSelected && (
                  <div className={`absolute top-2 right-2 md:top-3 md:right-3 w-5 h-5 md:w-6 md:h-6 rounded-full ${colors.bg} ${colors.border} border-2 flex items-center justify-center`}>
                    <Check size={12} className={colors.icon} />
                  </div>
                )}

                <div className="flex items-center gap-2 md:gap-3 mb-2 md:mb-3">
                  <div className={`p-1.5 md:p-2 rounded-lg ${isSelected ? colors.bg : 'bg-slate-800'}`}>
                    <Icon size={20} className={isSelected ? colors.icon : 'text-slate-400'} />
                  </div>
                  <h3 className="text-lg md:text-xl font-bold text-slate-100">{ship.name}</h3>
                </div>
                <p className="text-xs md:text-sm text-slate-400 mb-2 md:mb-3">{ship.description}</p>
                <div className="border-t border-slate-700 pt-2 md:pt-3">
                  <p className={`text-xs font-semibold mb-0.5 md:mb-1 ${isSelected ? colors.icon : 'text-slate-500'}`}>
                    {ship.skill.name}
                  </p>
                  <p className="text-[10px] md:text-xs text-slate-500">{ship.skill.description}</p>
                </div>
              </button>
            );
          })}
        </div>
      </div>

      {/* 错误提示 */}
      {error && (
        <div className="mb-4 bg-red-900/30 border border-red-700/50 rounded-lg px-4 py-2 text-red-400 text-sm">
          {error}
        </div>
      )}

      {/* 按钮 */}
      <div className="flex flex-col sm:flex-row gap-3 md:gap-4 w-full max-w-md px-4 md:px-0">
        <button
          onClick={handleStart}
          className="flex-1 px-6 md:px-10 py-3 md:py-3.5 bg-gradient-to-r from-cyan-600 to-blue-600 hover:from-cyan-500 hover:to-blue-500 text-white font-bold rounded-lg transition-all duration-200 shadow-lg shadow-cyan-900/40 text-base md:text-lg"
        >
          开始新游戏
        </button>
        {hasSave && (
          <button
            onClick={onLoad}
            className="flex-1 px-6 md:px-10 py-3 md:py-3.5 bg-slate-700 hover:bg-slate-600 text-slate-200 font-bold rounded-lg transition-all duration-200 border border-slate-600 text-base md:text-lg"
          >
            继续游戏
          </button>
        )}
      </div>
    </div>
  );
}
