import { memo, useState } from 'react';

// ============================================================================
// 战斗界面 · 共享图位（照抄 carddemo 的「美术未就位时的占位块」）
//   · .ph  = 斜纹底 + 虚线边 + 文字，尺寸与图片位完全一致（不撑破布局）
//   · 图片一律走 onError 回落占位块：同名文件放进 public/ 即可，无需改代码
// 导出组件一律 memo（AGENTS 第五节）；props 里的空数组/空对象请用模块级常量。
// ============================================================================

/** 占位块（DEMO 的 .ph） */
function ArtPh({ text, className }: { text: string; className?: string }) {
  return (
    <div
      className={`flex items-center justify-center overflow-hidden rounded-md border border-dashed border-[#33405f] p-0.5 text-center text-[9px] font-bold leading-[1.35] text-[#5c6d92] ${className || ''}`}
      style={{ background: 'repeating-linear-gradient(45deg,#131b2e,#131b2e 5px,#18213a 5px,#18213a 10px)' }}
    >
      {text}
    </div>
  );
}

/** 场上单位的横条图位（DEMO：宽 100% · 高 72px · object-cover） */
function UnitArtBase({ src }: { src: string }) {
  const [failed, setFailed] = useState(false);
  if (failed) return <ArtPh text="舰船图 370×144" className="mt-auto h-[72px] w-full" />;
  return (
    <img
      src={src}
      alt=""
      loading="lazy"
      onError={() => setFailed(true)}
      className="mt-auto block h-[72px] w-full rounded-[5px] border border-[#2b3550] object-cover object-center"
    />
  );
}

/** BOSS 头像（DEMO：56×56 圆角 8） */
function BossAvatarBase({ src }: { src: string }) {
  const [failed, setFailed] = useState(false);
  if (failed) return <ArtPh text={'BOSS 头像\n112×112'} className="h-14 w-14 flex-none whitespace-pre-line" />;
  return (
    <img
      src={src}
      alt=""
      onError={() => setFailed(true)}
      className="block h-14 w-14 flex-none rounded-lg object-cover"
    />
  );
}

// ⚠ 这里曾导出 `CardArt`（舰船卡面图位，右侧 42% 宽 / 高 96px）——卡面改大后已搬到共用组件
//   `components/ship/ShipCard.tsx`（那边自己渲染图位、比例不同），本文件里**零引用**，已删除
//   （仓库硬规矩：不留死导出）。
export const UnitArt = memo(UnitArtBase);
export const BossAvatar = memo(BossAvatarBase);
