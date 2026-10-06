import { memo } from 'react';
import type { GraveView } from '@/lib/battle/view';

// ============================================================================
// 墓地条（DEMO 的 .grave）
//   平时只读（让玩家知道损失了什么）；「召回」待选择时该卡变成可点候选
//   （候选来自 st.pending.cands，是**卡 id**，不是场上单位的 uid）。
// ============================================================================

interface GraveBarProps {
  grave: GraveView;
  /** 点选要召回的友舰（仅在 pending.kind === 'revive' 时会有可点的 chip） */
  onPick: (cardId: string) => void;
}

function GraveBarBase({ grave, onPick }: GraveBarProps) {
  if (grave.total === 0) return null;
  const canPick = grave.chips.some((c) => c.pickable);
  return (
    <div className="mt-[7px] flex flex-wrap items-center gap-[5px]">
      <span className="text-[10.5px] font-bold text-slate-500">
        墓地 {grave.total} 艘{canPick ? '（点选要召回的）' : ''}
      </span>
      {grave.chips.map((c) => (
        <span
          key={c.id}
          onClick={() => {
            if (c.pickable) onPick(c.id);
          }}
          className={`rounded-[5px] border px-1.5 py-px text-[10.5px] ${
            c.pickable
              ? 'cursor-pointer border-amber-400 bg-[#2a2412] text-amber-200 hover:bg-[#3a3016]'
              : 'border-[#2b3550] bg-[#161f36] text-slate-400'
          }`}
        >
          {c.name}
          {c.count > 1 ? ` ×${c.count}` : ''}
        </span>
      ))}
    </div>
  );
}

export default memo(GraveBarBase);
