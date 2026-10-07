import { memo } from 'react';
import type { FleetRow } from '@/lib/battle/hangar';

// ============================================================================
// 机库 · 舰队列表（每队一张卡）
//   每张卡：名字 / 编成摘要 / total·capacity / 防守徽章 / **出征中标记** / 编成入口 / 改名 / 删除 / 防守标签
//   ⚠ 动作不可用时**写明原因**（原因全部来自 lib/battle/hangar 的 canXxx，组件不重算判定）；
//     出征中的舰队：整块操作区打上"出征中"标记，所有按钮禁用并给出同一条原因。
//   ⚠ 「改名」按钮的禁用判据是 `FleetRow.canRename`（= hangar.canRenameFleet 的唯一真值），
//     **不是** `canEdit` —— 后者是"能不能动这支队"的概称，两者语义不同，混用会让改名入口
//     在某天与编成/标签的判据分叉时静默失效（用户 2026-08 报的正是"改名怎么点都没反应"）。
// ============================================================================

interface FleetListProps {
  fleets: FleetRow[];
  /** 当前正在编成的舰队（null = 没有，或列表为空） */
  selectedId: string | null;
  /** 正在改名的那支队（null = 没有） */
  renamingId: string | null;
  renameValue: string;
  onSelect: (fleetId: string) => void;
  onBeginRename: (fleetId: string, currentName: string) => void;
  onChangeRename: (value: string) => void;
  onCommitRename: () => void;
  onCancelRename: () => void;
  onDelete: (fleetId: string) => void;
  onToggleDefending: (fleetId: string) => void;
  /** 每支队"能不能做"的原因：由调用方调 hangar.ts 的纯函数取，这里只显示 */
  deleteReason: (fleetId: string) => string;
  toggleReason: (fleetId: string) => string;
}

function FleetListBase({
  fleets,
  selectedId,
  renamingId,
  renameValue,
  onSelect,
  onBeginRename,
  onChangeRename,
  onCommitRename,
  onCancelRename,
  onDelete,
  onToggleDefending,
  deleteReason,
  toggleReason,
}: FleetListProps) {
  if (fleets.length === 0) {
    return (
      <p className="rounded-lg border border-dashed border-[#33405f] px-3 py-3 text-xs leading-relaxed text-amber-400">
        还没有舰队 —— 用上面的「新建舰队」建一支，然后点「编成」把卡库里的战舰编进去。
      </p>
    );
  }

  return (
    <div className="grid gap-2 md:grid-cols-2">
      {fleets.map((f) => {
        const selected = selectedId === f.id;
        const delReason = deleteReason(f.id);
        const tglReason = toggleReason(f.id);
        // 改名可用性与原因**直接读 FleetRow 上的字段**（= hangar.canRenameFleet 的唯一真值，
        // 由 fleetRows 一次算好）：组件不再自己调判定、也不再读别的字段冒充改名判据。
        const renReason = f.renameReason;
        return (
          <div
            key={f.id}
            className={`rounded-[10px] border bg-[#141b2e] px-2.5 py-2 ${
              selected ? 'border-cyan-500' : 'border-[#2b3550]'
            }`}
          >
            {/* 名字行 + 徽章 */}
            {renamingId === f.id ? (
              <div className="flex items-center gap-1.5">
                <input
                  value={renameValue}
                  onChange={(e) => onChangeRename(e.target.value)}
                  maxLength={16}
                  autoFocus
                  className="min-w-0 flex-1 rounded-md border border-[#3a4767] bg-[#0b1020] px-2 py-1 text-[12.5px] text-slate-100"
                />
                <button
                  type="button"
                  onClick={onCommitRename}
                  className="rounded-[7px] border border-blue-500 bg-blue-700 px-2 py-1 text-[11.5px] font-bold text-white hover:bg-blue-600"
                >
                  确定
                </button>
                <button
                  type="button"
                  onClick={onCancelRename}
                  className="rounded-[7px] border border-[#39507d] bg-[#22304d] px-2 py-1 text-[11.5px] text-slate-200 hover:bg-[#2c3d61]"
                >
                  取消
                </button>
              </div>
            ) : (
              <div className="flex flex-wrap items-center gap-1.5">
                <span className="text-[13px] font-bold text-slate-100">{f.name}</span>
                <span className="text-[11px] text-slate-500">
                  {f.total} / {f.capacity} 艘
                </span>
                {f.defending ? (
                  <span className="rounded border border-amber-600/60 bg-amber-900/30 px-1 text-[10px] font-bold text-amber-300">
                    防守
                  </span>
                ) : null}
                {f.onExpedition ? (
                  <span className="rounded border border-cyan-500/70 bg-cyan-900/40 px-1 text-[10px] font-bold text-cyan-300">
                    出征中
                  </span>
                ) : null}
                {f.capacityLeft === 0 ? (
                  <span className="rounded border border-[#3a4767] px-1 text-[10px] text-slate-400">已编满</span>
                ) : null}
              </div>
            )}

            {/* 编成摘要（按型聚合，保持首次出现顺序） */}
            <div className="mt-1.5 flex flex-wrap gap-1">
              {f.members.length === 0 ? (
                <span className="text-[11px] text-slate-500">这支队还没有编入任何战舰</span>
              ) : (
                f.members.map((m) => (
                  <span
                    key={m.id}
                    className="rounded-[5px] border border-[#2b3550] bg-[#161f36] px-1.5 py-px text-[10.5px] text-slate-400"
                  >
                    {m.name}
                    {m.count > 1 ? ` ×${m.count}` : ''}
                  </span>
                ))
              )}
            </div>

            {/* 操作区 */}
            <div className="mt-2 flex flex-wrap items-center gap-1.5">
              <button
                type="button"
                onClick={() => onSelect(f.id)}
                className={`rounded-[7px] border px-2 py-1 text-[11.5px] font-bold ${
                  selected
                    ? 'border-cyan-500 bg-cyan-900/30 text-cyan-200'
                    : 'border-[#39507d] bg-[#22304d] text-slate-200 hover:bg-[#2c3d61]'
                }`}
              >
                {selected ? '正在编成' : '编成'}
              </button>
              <button
                type="button"
                onClick={() => onBeginRename(f.id, f.name)}
                disabled={!f.canRename}
                title={renReason}
                className="rounded-[7px] border border-[#39507d] bg-[#22304d] px-2 py-1 text-[11.5px] text-slate-200 hover:enabled:bg-[#2c3d61] disabled:cursor-not-allowed disabled:opacity-40"
              >
                改名
              </button>
              <button
                type="button"
                onClick={() => onToggleDefending(f.id)}
                disabled={!f.canEdit}
                title={tglReason}
                className="rounded-[7px] border border-amber-600/70 bg-amber-900/25 px-2 py-1 text-[11.5px] text-amber-200 hover:enabled:bg-amber-900/50 disabled:cursor-not-allowed disabled:opacity-40"
              >
                {f.defending ? '取消防守' : '打防守标签'}
              </button>
              <button
                type="button"
                onClick={() => onDelete(f.id)}
                disabled={!f.canEdit}
                title={delReason}
                className="rounded-[7px] border border-red-700/70 bg-red-900/25 px-2 py-1 text-[11.5px] text-red-200 hover:enabled:bg-red-900/50 disabled:cursor-not-allowed disabled:opacity-40"
              >
                删除
              </button>
            </div>

            {/* 不可用原因逐条写明（不是只置灰） */}
            {f.onExpedition ? (
              <p className="mt-1.5 text-[11px] leading-relaxed text-cyan-300">
                {renReason}。等它抵达开战后（或去战斗页签取消出征）再操作。
              </p>
            ) : f.capacityLeft === 0 ? (
              <p className="mt-1.5 text-[11px] leading-relaxed text-amber-400">
                已编满 {f.capacity} 艘 —— 先卸下一些才能再编入。
              </p>
            ) : (
              <p className="mt-1.5 text-[11px] leading-relaxed text-slate-500">
                还能再编 {f.capacityLeft} 艘
                {f.defending
                  ? '；带防守标签的舰队不能出征。'
                  : f.total === 0
                    ? '；出征前至少要编入 1 艘。'
                    : '。'}
              </p>
            )}
          </div>
        );
      })}
    </div>
  );
}

export default memo(FleetListBase);
