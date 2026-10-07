import { memo } from 'react';
import type { GameState } from '@/types/game';
import type { HangarOverview as HangarOverviewModel, FleetRow } from '@/lib/battle/hangar';
import { expeditionView } from '@/lib/battle/expedition';

// ============================================================================
// 机库 · 总览标签（四个内部标签的第一个，**默认落在这里**）
//   ① 概览数字：卡库类型 / 卡库总数 / 舰队数 / 已编入（全部取自 lib/battle/hangar.hangarOverview
//      的 `summary` = hangarSummary，本组件不做任何算术）；
//   ② 船坞概况：当前几级 / 在建几艘 / 队列几项 / 在造的是哪一型（`dockText` 的中文名唯一真值在
//      lib/battle/shipyard.dockLevelText，本组件不写第二份等级判定）；
//   ③ 出征 / 防守状态摘要：出征中那支队 + 还剩几回合抵达，以及"带防守标签"的有几支；
//   ④ **"下一步该去哪"的引导**：句子与目标标签都来自 `hangarOverview().guide`（`hangarGuide`），
//      组件只渲染，不判断"该去船坞还是编队"。
//
// ⚠ 这里**有意不渲染技能详情区**（任务口径：总览不需要）——点卡读技能的出口在卡库 / 船坞 / 编队。
// ⚠ 本组件没有任何回调（全是只读派生值），仍按 AGENTS 第五节 export default memo。
// ============================================================================

interface HangarOverviewProps {
  /** 整份渲染模型（数字 / 船坞概况 / 引导都在里面，本组件只排版） */
  overview: HangarOverviewModel;
  /** 整份存档状态：出征摘要（剩几回合抵达 / 哪支队）从 lib 的 expeditionView 推导 ——
   *  组件**不再单独收 expedition prop**，也不再自己读 turnsRemaining（那会渲染出"剩 0 回合抵达"） */
  state: GameState;
  /** 舰队视图（取名字与防守标签；判定全部来自 hangar.fleetRows） */
  fleets: FleetRow[];
}

function HangarOverviewBase({ overview, state, fleets }: HangarOverviewProps) {
  const statBase = 'rounded-lg border border-[#2b3550] bg-[#0f1729] px-2 py-1.5';
  const boxBase = 'rounded-[10px] border border-[#2b3550] bg-[#141b2e] px-2.5 py-2';

  /** 出征摘要（显示下限 1、文案与目标名都在 lib/battle/expedition.expeditionView 里定死） */
  const expeditionTip = expeditionView(state);
  /** 打了防守标签的队（掠夺来临时会合并成同一个部署池，§10.2） */
  const defendingFleets = fleets.filter((f) => f.defending);

  const guide = overview.guide;
  const guideTone =
    guide.kind === 'no_dock' || guide.kind === 'need_dock'
      ? 'border-amber-600/60 bg-amber-900/15 text-amber-200'
      : 'border-[#2b3550] bg-[#0f1729] text-slate-300';

  return (
    <div className="space-y-2.5">
      {/* ==================== ① 概览数字（与卡库标签同一套口径） ==================== */}
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        <div className={statBase}>
          <p className="text-[10px] text-slate-500">卡库类型</p>
          <p className="text-[15px] font-bold text-slate-100">{overview.summary.cardTypes}</p>
        </div>
        <div className={statBase}>
          <p className="text-[10px] text-slate-500">卡库总数</p>
          <p className="text-[15px] font-bold text-slate-100">{overview.summary.totalShips} 艘</p>
        </div>
        <div className={statBase}>
          <p className="text-[10px] text-slate-500">舰队数</p>
          <p className="text-[15px] font-bold text-slate-100">{overview.summary.fleetCount}</p>
        </div>
        <div className={statBase}>
          <p className="text-[10px] text-slate-500">已编入</p>
          <p className="text-[15px] font-bold text-cyan-300">
            {overview.summary.assignedShips}
            <span className="text-[11px] font-normal text-slate-500"> 艘</span>
          </p>
        </div>
      </div>

      {/* ==================== ② 船坞概况 ==================== */}
      <div className={boxBase}>
        <h3 className="text-[13px] font-bold text-slate-200">船坞概况</h3>
        <p className="mt-1 text-[11.5px] leading-relaxed text-slate-400">
          当前 {overview.dockText} · 在建 {overview.building} 艘 · 队列 {overview.queueTotal} 项
        </p>
        <p className="mt-0.5 text-[11.5px] leading-relaxed text-slate-500">
          {overview.currentCardName
            ? `正在建造：${overview.currentCardName}`
            : overview.dockLevel === 0
              ? '还没有船坞 —— 造船台的入口在「船坞」标签。'
              : '造船台是空的 —— 去「船坞」标签挑一张卡下单。'}
        </p>
      </div>

      {/* ==================== ③ 出征 / 防守状态摘要 ==================== */}
      <div className={boxBase}>
        <h3 className="text-[13px] font-bold text-slate-200">出征与防守</h3>
        <p className="mt-1 text-[11.5px] leading-relaxed text-cyan-200">
          {expeditionTip.onExpedition
            ? `出征中：${expeditionTip.fleetName ? `${expeditionTip.fleetName} ` : ''}${expeditionTip.etaText} —— 抵达开战前这支队不能编成、改名、打标签或删除。`
            : '当前没有舰队在出征途中。'}
        </p>
        <p className="mt-0.5 text-[11.5px] leading-relaxed text-slate-500">
          {defendingFleets.length > 0
            ? `带防守标签：${defendingFleets.map((f) => f.name).join('、')}（掠夺来时合并成同一个部署池；带标签的队不能出征）。`
            : '没有舰队打防守标签 —— 掠夺来临时会没有防守部队，可在「编队」标签给留守的队打上。'}
        </p>
      </div>

      {/* ==================== ④ 下一步该去哪（引导文案来自 hangarOverview().guide） ==================== */}
      <div className={`rounded-[10px] border px-2.5 py-2 ${guideTone}`}>
        <div className="flex flex-wrap items-baseline gap-x-2">
          <b className="text-[12.5px]">引导</b>
          <span className="text-[10.5px] opacity-80">目标标签「{guide.label}」</span>
        </div>
        <p className="mt-0.5 text-[11.5px] leading-relaxed">{guide.text}</p>
      </div>
    </div>
  );
}

export default memo(HangarOverviewBase);
