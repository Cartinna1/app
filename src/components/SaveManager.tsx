import { useRef, useState } from 'react';
import { Save, Download, Upload, AlertTriangle, FileUp } from 'lucide-react';

interface SaveManagerProps {
  onExport: () => boolean;
  onImport: (file: File) => Promise<boolean>;
  onReset: () => void;
}

export default function SaveManager({ onExport, onImport, onReset }: SaveManagerProps) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [message, setMessage] = useState('');
  const [msgType, setMsgType] = useState<'success' | 'error'>('success');
  const [showResetConfirm, setShowResetConfirm] = useState(false);

  const handleExport = () => {
    const success = onExport();
    if (success) {
      setMessage('存档文件已下载！');
      setMsgType('success');
    } else {
      setMessage('没有可导出的存档');
      setMsgType('error');
    }
    setTimeout(() => setMessage(''), 4000);
  };

  const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (!file.name.endsWith('.json')) {
      setMessage('请选择 .json 格式的存档文件');
      setMsgType('error');
      setTimeout(() => setMessage(''), 4000);
      return;
    }

    setMessage('正在导入...');
    setMsgType('success');

    const success = await onImport(file);
    if (success) {
      setMessage(`存档「${file.name}」导入成功！`);
      setMsgType('success');
    } else {
      setMessage('存档文件无效，导入失败');
      setMsgType('error');
    }

    // 重置input以便可以重复选择同一个文件
    if (fileInputRef.current) fileInputRef.current.value = '';
    setTimeout(() => setMessage(''), 4000);
  };

  const handleImportClick = () => {
    fileInputRef.current?.click();
  };

  const handleReset = () => {
    onReset();
    setShowResetConfirm(false);
  };

  return (
    <div>
      <h2 className="text-2xl font-bold text-white mb-4 flex items-center gap-2">
        <Save size={24} className="text-blue-400" />
        存档管理
      </h2>
      <p className="text-sm text-slate-400 mb-6">
        游戏每回合自动保存到浏览器。你也可以导出存档文件备份，或从文件恢复进度。
      </p>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {/* 导出存档 */}
        <div className="bg-slate-900/60 border border-slate-700 rounded-xl p-5">
          <h3 className="text-lg font-bold text-slate-200 mb-4 flex items-center gap-2">
            <Download size={18} className="text-cyan-400" />
            导出存档
          </h3>
          <p className="text-sm text-slate-500 mb-4">
            下载存档文件到本地。文件名格式：时间+舰队名+回合数。
          </p>
          <button
            onClick={handleExport}
            className="w-full py-2.5 bg-cyan-600 hover:bg-cyan-500 rounded-lg font-bold text-white transition-colors flex items-center justify-center gap-2"
          >
            <Download size={16} />
            导出存档文件
          </button>
        </div>

        {/* 导入存档 */}
        <div className="bg-slate-900/60 border border-slate-700 rounded-xl p-5">
          <h3 className="text-lg font-bold text-slate-200 mb-4 flex items-center gap-2">
            <Upload size={18} className="text-green-400" />
            导入存档
          </h3>
          <p className="text-sm text-slate-500 mb-4">
            选择之前下载的 .json 存档文件，恢复游戏进度。
          </p>
          {/* 隐藏的文件输入 */}
          <input
            ref={fileInputRef}
            type="file"
            accept=".json"
            onChange={handleFileSelect}
            className="hidden"
          />
          <button
            onClick={handleImportClick}
            className="w-full py-2.5 bg-green-600 hover:bg-green-500 rounded-lg font-bold text-white transition-colors flex items-center justify-center gap-2"
          >
            <FileUp size={16} />
            选择存档文件
          </button>
        </div>
      </div>

      {/* 重置游戏 */}
      <div className="mt-6 bg-slate-900/60 border border-red-900/30 rounded-xl p-5">
        <h3 className="text-lg font-bold text-red-400 mb-4 flex items-center gap-2">
          <AlertTriangle size={18} />
          重置游戏
        </h3>
        <p className="text-sm text-slate-500 mb-4">清除所有进度，重新开始。此操作不可撤销！</p>
        {!showResetConfirm ? (
          <button
            onClick={() => setShowResetConfirm(true)}
            className="px-6 py-2 bg-red-900/50 hover:bg-red-800/50 border border-red-700/50 rounded-lg text-red-400 font-bold transition-colors"
          >
            重置游戏
          </button>
        ) : (
          <div className="flex items-center gap-3">
            <span className="text-sm text-red-400">确定要重置吗？</span>
            <button
              onClick={handleReset}
              className="px-4 py-2 bg-red-600 hover:bg-red-500 rounded-lg text-white font-bold text-sm"
            >
              确认重置
            </button>
            <button
              onClick={() => setShowResetConfirm(false)}
              className="px-4 py-2 bg-slate-700 hover:bg-slate-600 rounded-lg text-slate-300 font-bold text-sm"
            >
              取消
            </button>
          </div>
        )}
      </div>

      {/* 消息 */}
      {message && (
        <div className={`mt-4 p-3 border rounded-lg text-sm text-center ${
          msgType === 'success'
            ? 'bg-green-900/20 border-green-700/50 text-green-400'
            : 'bg-red-900/20 border-red-700/50 text-red-400'
        }`}>
          {message}
        </div>
      )}

      <div className="mt-6 text-xs text-slate-600">
        <p>提示：浏览器 localStorage 会自动保存游戏进度。清除浏览器数据会导致存档丢失，建议定期导出存档文件备份。</p>
      </div>
    </div>
  );
}
