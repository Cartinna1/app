import { memo, useCallback, useMemo, useState } from 'react';
import { LayoutGrid, Layers, Hammer, Flag } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import type { GameState } from '@/types/game';
import type { BattleFleet, ShipCardId } from '@/types/battle';
import { BATTLE_CARDS } from '@/data/battle/cards';
import {
  HANGAR_TAB_LABEL,
  canAddShip,
  canDeleteFleet,
  canRenameFleet,
  canToggleDefending,
  fleetEditorRows,
  fleetRows,
  hangarOverview,
  libraryRows,
} from '@/lib/battle/hangar';
import type { HangarTabId } from '@/lib/battle/hangar';
import { expeditionView } from '@/lib/battle/expedition';
import { dockLevel } from '@/lib/battle/shipyard';
import HangarOverviewPanel from './HangarOverview';
import LibraryPanel from './LibraryPanel';
import ShipyardPanel from './ShipyardPanel';
import ShipSkillDetail from './ShipSkillDetail';
import FleetList from './FleetList';
import FleetEditor from './FleetEditor';

// ============================================================================
// 机库页签（V1.5 §8 船坞与造舰 / §10.1 机库 / 编队 / 防守标签 / 出征）
//
// 「机库」标题正下方是**四个内部大标签**（照 ColonyPanel 的标签栏：可点、当前项高亮、
// 手机端横向滚动不换行）：**总览 / 卡库 / 船坞 / 编队**，默认落在「总览」。
//   · 总览：概览数字 + 船坞概况 + 出征/防守摘要 + 「下一步该去哪」的引导（HangarOverviewPanel）；
//   · 卡库：卡面网格（LibraryPanel）；
//   · 船坞：三级船坞状态 + 造船队列 + 可造列表 + 未解锁汇总（ShipyardPanel）；
//   · 编队：舰队列表 + 选中舰队的编成界面（FleetList + FleetEditor）。
//
// ⚠ **跨标签操作不能断**（拆标签最容易犯的错）：
//   `selectedCardId` 与 `selectedFleetId` 都是**页签级状态**（本组件持有，切标签不重置）。
//   点卡（卡库 / 船坞）与点舰队（编队）只写这两个 state；「编入当前舰队」的操作条
//   （HangarAssignBar）**在能点卡的三个标签里都渲染同一份**，所以在卡库选了卡、切到编队
//   照样能把它编进当前舰队 —— 不会出现"选好了卡却切不到能点的按钮"。
//
// ⚠ **技能详情固定区域**（ShipSkillDetail）同样在标签栏下方统一渲染，在能点卡的三个标签里都可见：
//   卡库 / 船坞 / 编队（总览不点卡，故不渲染）—— V1.5 §10.2 铁律①「技能不上卡面」，
//   手机端没有 hover，这是机库看技能全文的唯一出口。
//
// ⚠ 那句出征状态文案（「当前没有舰队在出征中。」）**照旧保留**，位置改到标签栏下方（用户 2026-08
//   澄清：圆框没有别的意思，标签栏插在标题下方即可）。舰队列表里也另有逐队的「出征中」标记（铁律③）。
//
// 一切"能不能做"都来自 lib/battle/hangar 与 lib/battle/shipyard 的纯函数
//   （本文件与 reducer 共用同一份判定），组件只负责渲染 + 派生局部 UI 状态。
// 所有回调都是 useStableActions 出来的稳定引用（AGENTS 第五节），本文件不再用 inline 箭头穿透 memo。
// ============================================================================

interface HangarTabProps {
  /** 整份存档状态：卡库 / 舰队 / 出征 / 船坞 / 造船队列都在里面
   *  （渲染模型与判定都由 hangar.ts 与 shipyard.ts 从它推导） */
  state: GameState;
  fleets: BattleFleet[];
  cardLibrary: ShipCardId[];
  onCreateFleet: (name?: string) => void;
  onDeleteFleet: (fleetId: string) => void;
  onRenameFleet: (fleetId: string, name: string) => void;
  onAddShip: (fleetId: string, shipId: ShipCardId) => void;
  onRemoveShip: (fleetId: string, shipId: ShipCardId) => void;
  onToggleDefending: (fleetId: string) => void;
  /** 造舰（V1.5 §8.3）：dispatch ENQUEUE_BUILD，校验与扣费在 reducer 里走 shipyard/resourceCost */
  onEnqueueBuild: (cardId: ShipCardId) => void;
  /** 取消未开工的排队项：dispatch CANCEL_BUILD，入参是队列下标 */
  onCancelBuild: (index: number) => void;
}

/** 标签栏的四个标签（图标与 ColonyPanel 的标签栏同一套语言；顺序 = 需求给定的顺序） */
const HANGAR_TABS: { id: HangarTabId; icon: LucideIcon }[] = [
  { id: 'overview', icon: LayoutGrid },
  { id: 'library', icon: Layers },
  { id: 'shipyard', icon: Hammer },
  { id: 'fleet', icon: Flag },
];

/**
 * 「编入当前舰队」操作条（**跨标签共用同一份**）。
 * 为什么做成模块级组件而不是 HangarTab 里的一段 JSX：它要出现在能点卡的三个标签里，
 * 抽出来才能保证"只有一份按钮、一个原因文案"（AGENTS 第九节：跨分支入口抽成一个函数由多处调用）。
 * 它不是 memo 组件（没有 export default，也不是性能热点），props 由 HangarTab 用稳定引用传。
 */
function HangarAssignBar({
  cardName,
  fleetName,
  ok,
  message,
  onAssign,
}: {
  /** 当前点选的卡名（null = 还没选卡） */
  cardName: string | null;
  /** 当前选中的舰队名（null = 一支舰队都没有） */
  fleetName: string | null;
  ok: boolean;
  /** 能编时是说明、不能编时是原因（**永远有一句话**，手机端没有 hover —— 铁律②） */
  message: string;
  onAssign: () => void;
}) {
  return (
    <div className="rounded-[10px] border border-[#2b3550] bg-[#0f1729] px-2.5 py-2">
      <div className="flex flex-wrap items-center gap-2">
        <button
          type="button"
          onClick={onAssign}
          disabled={!ok}
          className="rounded-[7px] border border-blue-500 bg-blue-700 px-2.5 py-1 text-[12px] font-bold text-white hover:enabled:bg-blue-600 disabled:cursor-not-allowed disabled:opacity-40"
        >
          编入当前舰队
        </button>
        <span className="text-[11px] text-slate-500">
          {cardName ? `已选卡：${cardName}` : '还没选卡'}
          {fleetName ? ` · 当前舰队：${fleetName}` : ' · 当前没有舰队'}
        </span>
      </div>
      {/* 原因 / 说明写在行内（不只 title/置灰）——手机端没有 hover，AGENTS-附录.md 10.2 机库铁律② */}
      <p className={`mt-1 text-[11px] leading-relaxed ${ok ? 'text-slate-500' : 'text-amber-400'}`}>{message}</p>
    </div>
  );
}

function HangarTabBase({
  state,
  // ⚠ 曾解构 leets 但组件内一律走 leetList（由 state 派生），该 prop 从未被读 →
  cardLibrary,
  onCreateFleet,
  onDeleteFleet,
  onRenameFleet,
  onAddShip,
  onRemoveShip,
  onToggleDefending,
  onEnqueueBuild,
  onCancelBuild,
}: HangarTabProps) {
  /** 当前标签（默认「总览」；用户 2026-08 口径） */
  const [tab, setTab] = useState<HangarTabId>('overview');
  /** 点选的卡（卡库与船坞共用这一份状态 —— 技能详情区与操作条都读它，且**切标签不重置**） */
  const [selectedCardId, setSelectedCardId] = useState<string | null>(null);
  /** 正在编成的舰队（同上：页签级状态，切标签不丢） */
  const [selectedFleetId, setSelectedFleetId] = useState<string | null>(null);
  /** 正在改名的那支队 + 输入框内容 */
  const [renamingFleetId, setRenamingFleetId] = useState<string | null>(null);
  const [renameValue, setRenameValue] = useState('');

  const overview = useMemo(() => hangarOverview(state), [state]);
  const lib = useMemo(() => libraryRows(state), [state]);
  const fleetList = useMemo(() => fleetRows(state), [state]);
  const dock = useMemo(() => dockLevel(state), [state]);

  // 选中的舰队失效（被删）时回落到第一支；没有舰队则为 null
  const selectedFleet = fleetList.find((f) => f.id === selectedFleetId) ?? fleetList[0] ?? null;
  const editorRows = useMemo(
    () => (selectedFleet ? fleetEditorRows(state, selectedFleet.id) : []),
    [state, selectedFleet]
  );

  /**
   * 共用技能详情区的取值。⚠ 卡型走 `data/battle/cards` 的完整卡表（不是"卡库里有哪些"）——
   * 船坞里点一张**还没造出来**的卡也要能读技能全文（这是机库看技能的唯一出口，铁律①）。
   * 持有 / 已编 / 可编三个数从 libraryRows 取（卡库才是"拥有什么"的真值；没有的型按 0）。
   */
  const detailCard = selectedCardId ? BATTLE_CARDS[selectedCardId] || null : null;
  const detailRow = selectedCardId ? lib.find((r) => r.id === selectedCardId) || null : null;

  /** 操作条的两句话：能编时给说明，不能编时给原因（原因来自 canAddShip，判定不在这里重算） */
  const assign = useMemo(() => {
    if (!selectedFleet) return { ok: false, reason: '还没有舰队 —— 先在「编队」标签新建一支舰队', hint: '' };
    if (!selectedCardId) return { ok: false, reason: '先在「卡库」或「船坞」标签里点选一张卡', hint: '' };
    const check = canAddShip(state, selectedFleet.id, selectedCardId);
    if (!check.ok) return { ok: false, reason: check.reason || '', hint: '' };
    return { ok: true, reason: '', hint: `会编入「${selectedFleet.name}」（还能再编 ${selectedFleet.capacityLeft} 艘）` };
  }, [state, selectedFleet, selectedCardId]);

  /** 舰队列表里的逐条原因（判定全部来自 hangar.ts，这里只做"取一句字符串"） */
  const reasonOf = useCallback(
    (fleetId: string, check: (s: GameState, id: string) => { ok: boolean; reason?: string }): string => {
      const r = check(state, fleetId);
      return r.ok ? '' : r.reason || '';
    },
    [state]
  );
  const deleteReason = useCallback((id: string) => reasonOf(id, canDeleteFleet), [reasonOf]);
  const toggleReason = useCallback((id: string) => reasonOf(id, canToggleDefending), [reasonOf]);
  // 改名可用性与原因**不在这里再算一遍**：fleetRows 已经把 canRenameFleet 的结果落在
  // FleetRow.canRename / .renameReason 上（消除"同一判定两处派生"——用户 2026-08 报的
  // "改名怎么点都没反应"就是这条链上的重复派生造成的）。

  // ---------------- 动作 ----------------

  const pickTab = useCallback((id: HangarTabId) => {
    setTab(id);
  }, []);

  const newFleet = useCallback(() => {
    onCreateFleet();
  }, [onCreateFleet]);

  /** 点卡：卡库与船坞都写进同一份选中状态（技能详情区与操作条只有一块） */
  const selectCard = useCallback((cardId: string) => {
    setSelectedCardId(cardId);
  }, []);

  const selectFleet = useCallback((fleetId: string) => {
    setSelectedFleetId(fleetId);
  }, []);

  const assignToFleet = useCallback(
    (cardId: string) => {
      if (!selectedFleet) return;
      onAddShip(selectedFleet.id, cardId);
    },
    [selectedFleet, onAddShip]
  );

  /** 操作条的点击：编入"当前选中的那张卡"（stable 引用，不往 memo 子组件传 inline 箭头） */
  const assignSelected = useCallback(() => {
    if (selectedCardId) assignToFleet(selectedCardId);
  }, [selectedCardId, assignToFleet]);

  const editorAdd = useCallback(
    (cardId: string) => {
      if (!selectedFleet) return;
      onAddShip(selectedFleet.id, cardId);
    },
    [selectedFleet, onAddShip]
  );

  const editorRemove = useCallback(
    (cardId: string) => {
      if (!selectedFleet) return;
      onRemoveShip(selectedFleet.id, cardId);
    },
    [selectedFleet, onRemoveShip]
  );

  const toggleDefending = useCallback(
    (fleetId: string) => {
      onToggleDefending(fleetId);
    },
    [onToggleDefending]
  );

  const enqueueBuild = useCallback(
    (cardId: string) => {
      onEnqueueBuild(cardId);
    },
    [onEnqueueBuild]
  );

  /** 删除舰队：同步可判的拦截放在 dispatch 之前（AGENTS 第九节） */
  const removeFleet = useCallback(
    (fleetId: string) => {
      if (!canDeleteFleet(state, fleetId).ok) return;
      onDeleteFleet(fleetId);
      setSelectedFleetId((cur) => (cur === fleetId ? null : cur));
      setRenamingFleetId((cur) => (cur === fleetId ? null : cur));
    },
    [state, onDeleteFleet]
  );

  const beginRename = useCallback(
    (fleetId: string, currentName: string) => {
      const check = canRenameFleet(state, fleetId);
      if (!check.ok) return;
      setRenamingFleetId(fleetId);
      setRenameValue(currentName);
    },
    [state]
  );

  const changeRename = useCallback((value: string) => {
    setRenameValue(value);
  }, []);

  const cancelRename = useCallback(() => {
    setRenamingFleetId(null);
  }, []);

  const commitRename = useCallback(() => {
    if (renamingFleetId === null) return;
    const row = fleetList.find((r) => r.id === renamingFleetId);
    if (!row) {
      setRenamingFleetId(null);
      return;
    }
    // 改名也归"操作"：出征中的舰队不许动。
    // ⚠ 判据**只**读 FleetRow.canRename（= hangar.canRenameFleet 唯一真值）——
    //   这里早先调 isFleetOnExpedition、与按钮的可用性各自算一次，属"同一判定两处派生"：
    //   两处一旦分叉，就会出现"按钮能点、点下去被静默吞掉（名字不变）"即用户报的现象。
    if (!row.canRename) return;
    const name = renameValue.trim();
    if (name && name !== row.name) onRenameFleet(renamingFleetId, name);
    setRenamingFleetId(null);
  }, [renamingFleetId, fleetList, renameValue, onRenameFleet]);

  /** 出征状态行的渲染模型（唯一真值在 lib/battle/expedition.expeditionView）：
   *  「剩 N 回合抵达」的**显示下限 1** 与文案都从它取 —— 组件不读 `expedition.turnsRemaining` 原值
   *  （原值归零时会渲染出"剩 0 回合抵达"那个死界面）。 */
  const expeditionTip = useMemo(() => expeditionView(state), [state]);

  /** 能点卡的三个标签（技能详情区 + 操作条在这三个标签里都渲染） */
  const cardTab = tab === 'library' || tab === 'shipyard' || tab === 'fleet';
  /** 操作条那一句话：能编给说明、不能编给原因 */
  const assignMessage = assign.ok ? assign.hint : assign.reason;

  return (
    <div className="mx-auto max-w-4xl">
      <h2 className="mb-1.5 text-lg font-bold text-slate-100">机库</h2>

      {/* ==================== 四个内部标签（照 ColonyPanel 的标签栏：可点 / 当前项高亮 /
           手机端横向滚动不换行；标签项固定 4 个，正常屏宽下不会真的需要滚动） ==================== */}
      <div className="mb-2 flex gap-1.5 overflow-x-auto scrollbar-hide">
        {HANGAR_TABS.map((t) => {
          const Icon = t.icon;
          const on = tab === t.id;
          return (
            <button
              key={t.id}
              type="button"
              onClick={() => pickTab(t.id)}
              className={`flex flex-shrink-0 items-center gap-1.5 rounded-lg px-3 py-1.5 text-sm font-bold transition-all ${
                on ? 'bg-cyan-600 text-white' : 'bg-slate-800/60 text-slate-400 hover:bg-slate-700'
              }`}
            >
              <Icon size={14} />
              {HANGAR_TAB_LABEL[t.id]}
            </button>
          );
        })}
      </div>

      {/* ==================== 出征状态文案（画红框的那句，照旧保留；舰队列表里另有逐队标记） ==================== */}
      <div className="mb-2.5 rounded-[10px] border border-cyan-800/60 bg-cyan-900/20 px-2.5 py-2">
        <p className="text-[12px] leading-relaxed text-cyan-200">
          {expeditionTip.onExpedition
            ? `出征中：${expeditionTip.fleetName ? `${expeditionTip.fleetName} ` : ''}${expeditionTip.etaText} —— 这支队在抵达开战前不能编成、改名、打标签或删除。`
            : '当前没有舰队在出征途中。'}
        </p>
      </div>

      {/* ==================== 技能详情（固定区域，手机端看技能的唯一出口） ====================
          卡库 / 船坞 / 编队**共用这一块**：点哪边的卡都写进它（V1.5 §10.2 铁律①「技能不上卡面」）。
          总览标签不点卡，故不渲染（任务口径：总览不需要）。 */}
      {cardTab ? (
        <div className="mb-2.5 rounded-[10px] border border-[#2b3550] bg-[#0f1729] px-2.5 py-2">
          <ShipSkillDetail
            card={detailCard}
            owned={detailRow ? detailRow.owned : 0}
            assigned={detailRow ? detailRow.assigned : 0}
            available={detailRow ? detailRow.available : 0}
          />
        </div>
      ) : null}

      {/* ==================== 「编入当前舰队」操作条（**跨标签同一份**） ====================
          它读的是页签级的 selectedCardId / selectedFleetId，所以在卡库选了卡、切到编队/船坞，
          这个按钮照样在、照样能点（拆标签最容易断的就是这条路径）。 */}
      {cardTab ? (
        <div className="mb-2.5">
          <HangarAssignBar
            cardName={detailCard ? detailCard.name : null}
            fleetName={selectedFleet ? selectedFleet.name : null}
            ok={assign.ok}
            message={assignMessage}
            onAssign={assignSelected}
          />
        </div>
      ) : null}

      {/* ==================== ① 总览 ==================== */}
      {tab === 'overview' ? (
        <HangarOverviewPanel overview={overview} state={state} fleets={fleetList} />
      ) : null}

      {/* ==================== ② 卡库 ==================== */}
      {tab === 'library' ? (
        <div className="rounded-[10px] border border-[#2b3550] bg-[#141b2e] px-2.5 py-2.5">
          <LibraryPanel rows={lib} selectedId={selectedCardId} onSelect={selectCard} />
        </div>
      ) : null}

      {/* ==================== ③ 船坞 ==================== */}
      {tab === 'shipyard' ? (
        <div className="rounded-[10px] border border-[#2b3550] bg-[#141b2e] px-2.5 py-2.5">
          <ShipyardPanel
            state={state}
            onSelect={selectCard}
            onBuild={enqueueBuild}
            onCancelBuild={onCancelBuild}
          />
        </div>
      ) : null}

      {/* ==================== ④ 编队（舰队列表 + 选中舰队的编成界面） ==================== */}
      {tab === 'fleet' ? (
        <div className="rounded-[10px] border border-[#2b3550] bg-[#141b2e] px-2.5 py-2.5">
          <div className="flex flex-wrap items-center gap-2">
            <h3 className="text-[13px] font-bold text-slate-200">舰队</h3>
            <span className="text-[11px] text-slate-500">共 {overview.summary.fleetCount} 支</span>
            <button
              type="button"
              onClick={newFleet}
              className="rounded-[7px] border border-blue-500 bg-blue-700 px-3 py-1 text-[12px] font-bold text-white hover:bg-blue-600"
            >
              新建舰队
            </button>
            <span className="text-[11px] text-slate-500">
              卡库共 {cardLibrary.length} 艘 · 船坞{dock === 0 ? '未建' : ` ${dock} 级`}
            </span>
          </div>
          <div className="mt-2">
            <FleetList
              fleets={fleetList}
              selectedId={selectedFleet ? selectedFleet.id : null}
              renamingId={renamingFleetId}
              renameValue={renameValue}
              onSelect={selectFleet}
              onBeginRename={beginRename}
              onChangeRename={changeRename}
              onCommitRename={commitRename}
              onCancelRename={cancelRename}
              onDelete={removeFleet}
              onToggleDefending={toggleDefending}
              deleteReason={deleteReason}
              toggleReason={toggleReason}
            />
          </div>
          {/* 编成界面：没有舰队时给一句可执行的话（不静默留白） */}
          {selectedFleet ? (
            <div className="mt-3">
              <FleetEditor
                fleet={selectedFleet}
                rows={editorRows}
                onAdd={editorAdd}
                onRemove={editorRemove}
              />
            </div>
          ) : (
            <p className="mt-3 rounded-lg border border-dashed border-[#33405f] px-3 py-3 text-xs leading-relaxed text-amber-400">
              还没有舰队 —— 点上面的「新建舰队」建一支，再点它的「编成」按钮把卡库里的战舰编进去。
            </p>
          )}
        </div>
      ) : null}
    </div>
  );
}

export default memo(HangarTabBase);
