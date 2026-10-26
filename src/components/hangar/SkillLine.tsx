import { memo } from 'react';

// ============================================================================
// 技能行内直显（机库·卡库 / 机库·编队共用，唯一实现）
//
// 背景（用户 2026-10）：卡库的技能只在**列表上方**的固定详情区里，往下翻着点卡时
// 技能出现在上面、得滚回去看；编队标签则完全看不到技能。
// 结论：两处都补一行"行内技能"，同时**保留**顶部固定详情区（它还有 攻/盾/体 与编入按钮）。
//
// ⚠ 两处的样式必须完全一致 —— 改这里等于同时改两个标签，不要在任何一侧再写一份
//   （AGENTS §三 单一真值：同段 JSX 只许一处）。
// ============================================================================

interface SkillLineProps {
  /** 技能全文；空串 = 该卡无技能 → 整行不渲染（不出现「技能：—」） */
  text: string;
}

function SkillLineBase({ text }: SkillLineProps) {
  if (!text) return null;
  return (
    <span className="mt-1 block whitespace-normal break-words text-[11px] leading-relaxed text-slate-400">
      技能：{text}
    </span>
  );
}

export default memo(SkillLineBase);
