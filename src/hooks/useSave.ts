import { useCallback } from 'react';
import type { GameState, Mothership } from '@/types/game';
import { SAVE_KEY, validateSaveData, buildSaveData, stateFromSave } from '@/lib/save';

export function useSave(
  dispatch: React.Dispatch<
    | { type: 'LOAD_SAVE'; state: GameState }
    | { type: 'RESET_GAME' }
    | { type: 'FUNCTIONAL_UPDATE'; updater: (state: GameState) => GameState }
  >
) {
  const autoSave = useCallback(() => {
    dispatch({
      type: 'FUNCTIONAL_UPDATE',
      updater: (prev) => {
        try {
          localStorage.setItem(SAVE_KEY, JSON.stringify(buildSaveData(prev)));
        } catch (e) {
          // localStorage 超容量等场景：至少留下痕迹，避免存档静默丢失
          console.warn('[存档] 自动存档失败：', e);
        }
        return prev;
      },
    });
  }, [dispatch]);

  const hasSave = useCallback(() => !!localStorage.getItem(SAVE_KEY), []);

  const loadSave = useCallback((): boolean => {
    const data = localStorage.getItem(SAVE_KEY);
    if (!data) return false;
    try {
      const saveData = JSON.parse(data);
      if (!validateSaveData(saveData)) return false;
      dispatch({ type: 'LOAD_SAVE', state: stateFromSave(saveData) });
      return true;
    } catch { return false; }
  }, [dispatch]);

  /**
   * 导出存档文件下载
   * 命名规则：YYYYMMDDHHMM + 舰队名称 + 回合数 + .json
   * 例：202607151633黄金舰队44.json
   */
  const exportSave = useCallback((ships: Mothership[], turn: number): boolean => {
    const data = localStorage.getItem(SAVE_KEY);
    if (!data) return false;

    try {
      const now = new Date();
      const timeStr = `${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, '0')}${String(now.getDate()).padStart(2, '0')}${String(now.getHours()).padStart(2, '0')}${String(now.getMinutes()).padStart(2, '0')}`;
      const shipName = ships[0]?.name || '舰队';
      const filename = `${timeStr}${shipName}${turn}.json`;

      const blob = new Blob([data], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
      return true;
    } catch { return false; }
  }, []);

  /**
   * 从文件导入存档
   */
  const importSave = useCallback((file: File): Promise<boolean> => {
    return new Promise((resolve) => {
      const reader = new FileReader();
      reader.onload = (e) => {
        try {
          const text = e.target?.result as string;
          const saveData = JSON.parse(text);
          if (!validateSaveData(saveData)) { resolve(false); return; }
          localStorage.setItem(SAVE_KEY, text);
          dispatch({ type: 'LOAD_SAVE', state: stateFromSave(saveData) });
          resolve(true);
        } catch { resolve(false); }
      };
      reader.onerror = () => resolve(false);
      reader.readAsText(file);
    });
  }, [dispatch]);

  const resetGame = useCallback(() => {
    localStorage.removeItem(SAVE_KEY);
        dispatch({ type: 'RESET_GAME' });
  }, [dispatch]);

  return { autoSave, hasSave, loadSave, exportSave, importSave, resetGame };
}
