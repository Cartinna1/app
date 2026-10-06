import { memo } from 'react';
import type { ReactNode } from 'react';
import type { BossView } from '@/lib/battle/view';
import { BossAvatar } from './parts';

// ============================================================================
// BOSS 面板（DEMO 的 .boss-hd + .body + #boardBoss）
//   头像 56×56 + 名称 + 头目技能，本体血条（红渐变色），下面挂战场（由调用方传入 BoardSide）。
//   「本体」那一行点击 = 命令已选战舰攻击 BOSS 本体（无锁链在场时合法）。
// ============================================================================

interface BossPanelProps {
  boss: BossView;
  /** 本体是否可点（已选己方攻击者、且没有待选择效果） */
  bodyClickable: boolean;
  onBodyClick: () => void;
  children?: ReactNode;
}

function BossPanelBase({ boss, bodyClickable, onBodyClick, children }: BossPanelProps) {
  const pct = `${boss.hpPct}%`;
  return (
    <div className="mb-2.5 rounded-[10px] border border-[#2b3550] bg-[#141b2e] px-2.5 py-2">
      <div className="mb-[6px] flex items-start gap-2">
        <BossAvatar src={boss.artSrc} />
        <div className="min-w-0 flex-1">
          <h2 className="mb-[3px] flex items-center gap-1.5 text-[13px] font-bold">
            BOSS <span className="text-[11px] font-normal text-slate-500">{boss.name}</span>
          </h2>
          <div className="text-[11px] leading-relaxed text-slate-500">头目技能：{boss.skill}</div>
        </div>
      </div>
      <div
        onClick={onBodyClick}
        title={bodyClickable ? '点击此处 = 命令已选战舰攻击 BOSS 本体' : '先点一艘己方战舰，再点这里攻击 BOSS 本体'}
        className={`mb-[7px] flex items-center gap-2 ${bodyClickable ? 'cursor-pointer' : ''}`}
      >
        <span className="text-[13px] font-bold">本体</span>
        <div className="relative h-3.5 flex-1 overflow-hidden rounded-[7px] border border-[#2b3550] bg-[#0d1424]">
          <i
            className="block h-full bg-gradient-to-r from-red-800 to-red-500 transition-[width] duration-300"
            style={{ width: pct }}
          />
          <span className="absolute inset-0 text-center text-[10px] leading-[12px] text-white [text-shadow:0_1px_2px_#000]">
            {boss.hp} / {boss.hpMax}
          </span>
        </div>
      </div>
      {children}
    </div>
  );
}

export default memo(BossPanelBase);
