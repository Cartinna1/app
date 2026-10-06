import { memo } from 'react';
import type { InfoBarView } from '@/lib/battle/view';

// ============================================================================
// 信息条（DEMO 的 #info）—— 手机端没有鼠标悬停，看技能就靠这一条。
//   ① 选中卡牌 → 技能全文 + 费用 + 数值（kind: card）
//   ② 选中己方战舰 → 技能全文 + 关键词 + 能不能攻击（不能则写明原因，kind: unit）
//   ③ 待选择 → 【记忆掠夺者】/【神罚】… + "还需 N 艘（已选 M/N）"（kind: pending）
//   ④ 平时 → 最近一条战况（kind: event，取 st.log 最后一条）
// ============================================================================

/** 战况行的配色（DEMO 的 evClass：—— 回合 / 被击毁 / 【头目技能】/ 【结束】） */
function eventClass(text: string): string {
  if (text.indexOf('——') === 0) return 'font-bold text-sky-400';
  if (text.indexOf('被击毁') >= 0) return 'text-[#fca5a5]';
  if (text.indexOf('【头目技能】') >= 0) return 'text-amber-400';
  if (text.indexOf('【结束】') >= 0) return 'font-bold text-emerald-400';
  return '';
}

interface BattleInfoBarProps {
  info: InfoBarView;
  /** 临时提示（点不动时的原因）；空串表示显示默认提示 */
  flash: string;
  defaultHint: string;
}

function BattleInfoBarBase({ info, flash, defaultHint }: BattleInfoBarProps) {
  return (
    <div>
      {/* 提示条（DEMO 的 .hint）：临时提示优先，2.6 秒后回落默认提示（由调用方计时） */}
      <div
        className="my-1.5 min-h-[26px] rounded-md border border-[#4d3f12] bg-[#2a2410] px-2 py-1 text-[12px] text-amber-400"
        role="status"
      >
        {flash || defaultHint}
      </div>
      {/* 信息条（DEMO 的 .info） */}
      <div className="my-1.5 min-h-[40px] rounded-lg border border-[#2b3550] bg-[#0f1729] px-2.5 py-1.5 text-[12.5px] leading-[1.55] text-slate-400">
        {info.kind === 'event' ? (
          <span className={eventClass(info.body)}>{info.body}</span>
        ) : (
          <>
            <b className="text-slate-100">{info.title}</b>
            {info.stats ? <span className="ml-2 text-slate-300">{info.stats}</span> : null}
            {info.body ? (
              <>
                <br />
                <span className="text-slate-200">{info.body}</span>
              </>
            ) : null}
            {info.hint ? (
              <>
                <br />
                <span className="text-[11.5px] text-slate-500">{info.hint}</span>
              </>
            ) : null}
          </>
        )}
      </div>
    </div>
  );
}

export default memo(BattleInfoBarBase);
