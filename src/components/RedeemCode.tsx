import { useState } from 'react';
import { Gift, Check, AlertCircle } from 'lucide-react';

interface RedeemCodeProps {
  shipIndex: number;
  redeemedCodes: string[];
  onRedeem: (shipIndex: number, code: string) => { success: boolean; message: string };
}

export default function RedeemCode({ shipIndex, redeemedCodes, onRedeem }: RedeemCodeProps) {
  const [code, setCode] = useState('');
  const [result, setResult] = useState<{ success: boolean; message: string } | null>(null);

  const handleRedeem = () => {
    if (!code.trim()) {
      setResult({ success: false, message: '请输入兑换码' });
      return;
    }
    const res = onRedeem(shipIndex, code.trim());
    setResult(res);
    if (res.success) {
      setCode('');
    }
    setTimeout(() => setResult(null), 4000);
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      handleRedeem();
    }
  };

  return (
    <div>
      <h2 className="text-2xl font-bold text-white mb-4 flex items-center gap-2">
        <Gift size={24} className="text-pink-400" />
        金币券兑换
      </h2>
      <p className="text-sm text-slate-400 mb-6">
        输入6位数字兑换码获取金币奖励或远古遗物。金币码和遗物码每局游戏只能用一次，重新开始后恢复可用。
      </p>

      <div className="max-w-md">
        <div className="bg-slate-900/60 border border-slate-700 rounded-xl p-6">
          <label className="block text-sm text-slate-400 mb-2">兑换码</label>
          <div className="flex gap-2 mb-4">
            <input
              type="text"
              value={code}
              onChange={(e) => setCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
              onKeyDown={handleKeyDown}
              placeholder="输入6位数字兑换码"
              className="flex-1 bg-slate-800 border border-slate-600 rounded-lg px-4 py-2.5 text-sm text-slate-200 placeholder-slate-600 focus:outline-none focus:border-pink-500 text-center tracking-widest"
            />
            <button
              onClick={handleRedeem}
              className="px-6 py-2.5 bg-gradient-to-r from-pink-600 to-purple-600 hover:from-pink-500 hover:to-purple-500 rounded-lg font-bold text-white transition-all"
            >
              兑换
            </button>
          </div>

          {result && (
            <div
              className={`flex items-center gap-2 p-3 rounded-lg ${
                result.success
                  ? 'bg-green-900/20 border border-green-700/50 text-green-400'
                  : 'bg-red-900/20 border border-red-700/50 text-red-400'
              }`}
            >
              {result.success ? <Check size={16} /> : <AlertCircle size={16} />}
              <span className="text-sm">{result.message}</span>
            </div>
          )}
        </div>

        {/* 本局已使用的兑换码 */}
        {redeemedCodes.length > 0 && (
          <div className="mt-6 bg-slate-900/60 border border-slate-700 rounded-xl p-4">
            <h3 className="text-sm font-bold text-slate-400 mb-3">
              本局已使用兑换码（{redeemedCodes.length}/35）
            </h3>
            <div className="flex flex-wrap gap-2">
              {redeemedCodes.map((c) => (
                <span
                  key={c}
                  className="text-xs bg-slate-800 text-slate-500 px-3 py-1.5 rounded border border-slate-700 line-through"
                >
                  {c}
                </span>
              ))}
            </div>
          </div>
        )}

        <div className="mt-6 bg-slate-900/40 border border-slate-800 rounded-xl p-4">
          <h3 className="text-sm font-bold text-slate-400 mb-2">说明</h3>
          <ul className="text-xs text-slate-500 space-y-1">
            <li>兑换码为6位纯数字</li>
            <li>每个兑换码一局游戏内只能用一次（任意舰队使用后全局锁定）</li>
            <li>点击「重置游戏」开始新游戏后，所有兑换码恢复可用</li>
            <li>输入错误不会扣减任何资源</li>
          </ul>
        </div>
      </div>
    </div>
  );
}
