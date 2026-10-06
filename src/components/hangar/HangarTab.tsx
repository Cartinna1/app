import { memo, useCallback, useMemo, useState } from 'react';
import type { GameState } from '@/types/game';
import type { BattleExpedition, BattleFleet, ShipCardId } from '@/types/battle';
import { BATTLE_TUNING } from '@/data/battle/tuning';
import { BATTLE_CARDS } from '@/data/battle/cards';
import {
  canAddShip,
  canDeleteFleet,
  canRenameFleet,
  canToggleDefending,
  fleetEditorRows,
  fleetRows,
  hangarSummary,
  isFleetOnExpedition,
  libraryRows,
} from '@/lib/battle/hangar';
import { dockLevel } from '@/lib/battle/shipyard';
import LibraryPanel from './LibraryPanel';
import ShipyardPanel from './ShipyardPanel';
import ShipSkillDetail from './ShipSkillDetail';
import FleetList from './FleetList';
import FleetEditor from './FleetEditor';

// ============================================================================
// 机库页签（V1.5 §8 船坞与造舰 / §10.1 机库 / 编队 / 防守标签 / 出征）
//   上：**技能详情固定区域**（ShipSkillDetail，卡库与船坞**共用同一块** —— 点哪边的卡都读它）
//   中：船坞（ShipyardPanel：三级船坞状态 + 建造队列 + 可造卡列表）
//   中：卡库（LibraryPanel：总览 + 卡面网格）
//   下：舰队列表（编成 / 改名 / 删除 / 防守标签 / 出征中标记）
//   再下：选中舰队的编成界面（逐型 ±）
//
// ⚠ 顺序有意而为：**卡库为空时船坞排在最前**（新玩家一进机库先看到"去哪造船"），
//   有船之后卡库在前（编队是高频操作，造舰是低频）。
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
  expedition: BattleExpedition | null;
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

function HangarTabBase({
  state,
  fleets,
  cardLibrary,
  expedition,
  onCreateFleet,
  onDeleteFleet,
  onRenameFleet,
  onAddShip,
  onRemoveShip,
  onToggleDefending,
  onEnqueueBuild,
  onCancelBuild,
}: HangarTabProps) {
  /** 点选的卡（卡库与船坞共用这一份状态 —— 技能详情区只有一块） */
  const [selectedCardId, setSelectedCardId] = useState<string | null>(null);
  /** 正在编成的舰队 */
  const [selectedFleetId, setSelectedFleetId] = useState<string | null>(null);
  /** 正在改名的那支队 + 输入框内容 */
  const [renamingFleetId, setRenamingFleetId] = useState<string | null>(null);
  const [renameValue, setRenameValue] = useState('');

  const summary = useMemo(() => hangarSummary(state), [state]);
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

  /** 编入按钮的两句话：能编时给说明，不能编时给原因（原因来自 canAddShip，判定不在这里重算） */
  const assign = useMemo(() => {
    if (!selectedFleet) return { ok: false, reason: '还没有舰队 —— 先在下面新建一支舰队', hint: '' };
    if (!selectedCardId) return { ok: false, reason: '先在卡库或船坞里点选一张卡', hint: '' };
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
  const renameReason = useCallback((id: string) => reasonOf(id, canRenameFleet), [reasonOf]);

  // ---------------- 动作 ----------------

  const newFleet = useCallback(() => {
    onCreateFleet();
  }, [onCreateFleet]);

  /** 点卡：卡库与船坞都写进同一份选中状态（技能详情区只有一块） */
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
    const fleet = fleets.find((f) => f.id === renamingFleetId);
    if (!fleet) {
      setRenamingFleetId(null);
      return;
    }
    // 改名也归"操作"：出征中的舰队不许动（判据复用 hangar.ts 的纯函数）
    if (isFleetOnExpedition(state, renamingFleetId)) return;
    const name = renameValue.trim();
    if (name && name !== fleet.name) onRenameFleet(renamingFleetId, name);
    setRenamingFleetId(null);
  }, [renamingFleetId, fleets, state, onRenameFleet]);

  /** 出征中的那支队（用于顶部一句提示；找不到就当名字缺失） */
  const expeditionFleet = expedition ? fleets.find((f) => f.id === expedition.fleetId) || null : null;
  const expTip = expedition
    ? `${expeditionFleet ? `${expeditionFleet.name} ` : ''}剩 ${expedition.turnsRemaining} 回合抵达`
    : '';

  /** 卡库为空时先看船坞（新玩家一进机库就该看到"去哪造船"） */
  const shipyardFirst = lib.length === 0;

  const shipyard = (
    <ShipyardPanel
      state={state}
      onSelect={selectCard}
      onBuild={enqueueBuild}
      onCancelBuild={onCancelBuild}
    />
  );

  const library = (
    <LibraryPanel
      rows={lib}
      summary={summary}
      selectedId={selectedCardId}
      onSelect={selectCard}
      canAssign={assign.ok}
      assignReason={assign.reason}
      assignHint={assign.hint}
      onAssign={assignToFleet}
    />
  );

  return (
    <div className="mx-auto max-w-4xl">
      <h2 className="mb-1 text-lg font-bold text-slate-100">机库</h2>
      <p className="mb-3 text-xs leading-relaxed text-slate-400">
        战舰全部来自<strong className="text-slate-200">船坞建造</strong>（卡库初始为空，V1.5 §8）：
        先建船坞（B32/B33/B34），再造舰 —— 建造完成的当回合自动进入卡库。
        编成按<strong className="text-slate-200">份数</strong>算：同一型有几份就只能同时编进去几份。
        每队编制上限 {BATTLE_TUNING.fleetSize} 艘；带防守标签的舰队留守、不能出征，出征中的舰队也不能打防守标签（V1.5 §10.1）。
      </p>

      {/* 出征提示（出征中的舰队在舰队列表里也有标记，这里给一句总览） */}
      <div className="mb-2.5 rounded-[10px] border border-cyan-800/60 bg-cyan-900/20 px-2.5 py-2">
        <p className="text-[12px] leading-relaxed text-cyan-200">
          {expedition ? `出征中：${expTip} —— 这支队在抵达开战前不能编成、改名、打标签或删除。` : '当前没有舰队在出征途中。'}
        </p>
      </div>

      {/* ==================== 技能详情（固定区域，手机端看技能的唯一出口） ====================
          卡库与船坞**共用这一块**：点哪边的卡都写进它（V1.5 §10.2 铁律①「技能不上卡面」）。 */}
      <div className="mb-2.5 rounded-[10px] border border-[#2b3550] bg-[#0f1729] px-2.5 py-2">
        <ShipSkillDetail
          card={detailCard}
          emptyHint="点一张卡看它的技能全文与数值（卡面不放技能）。卡库与船坞共用这块区域：点卡库里的舰看它现在能编多少，点船坞里的舰看它要多少造价、还需哪个科技。"
          owned={detailRow ? detailRow.owned : 0}
          assigned={detailRow ? detailRow.assigned : 0}
          available={detailRow ? detailRow.available : 0}
        />
      </div>

      {/* ==================== 船坞 / 卡库（卡库为空时船坞在前） ==================== */}
      {shipyardFirst ? (
        <>
          {shipyard}
          <div className="mt-3">{library}</div>
        </>
      ) : (
        <>
          {library}
          <div className="mt-3">{shipyard}</div>
        </>
      )}

      {/* ==================== 舰队 ==================== */}
      <div className="mt-3 flex flex-wrap items-center gap-2">
        <h3 className="text-[13px] font-bold text-slate-200">舰队</h3>
        <span className="text-[11px] text-slate-500">共 {summary.fleetCount} 支</span>
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
          renameReason={renameReason}
        />
      </div>

      {/* ==================== 编成 ==================== */}
      {selectedFleet ? (
        <div className="mt-3">
          <FleetEditor
            fleet={selectedFleet}
            rows={editorRows}
            onAdd={editorAdd}
            onRemove={editorRemove}
          />
        </div>
      ) : null}
    </div>
  );
}

export default memo(HangarTabBase);
