import { memo, useCallback, useMemo, useState } from 'react';
import type { GameState } from '@/types/game';
import type { BuildQueueRow, ShipyardCardRow, ShipyardView } from '@/lib/battle/shipyard';
import { canCancelBuild, formatBuildCost, dockLevelText, shipyardView } from '@/lib/battle/shipyard';
import { getBuildingDef } from '@/data/colony/buildings';
import { getEffectiveMaxCount, getBuildingCostProfile } from '@/lib/colony/costs';
import { MATERIAL_NAME_MAP } from '@/data/materialNames';
import HangarCard from './HangarCard';

// ============================================================================
// 机库 · 船坞面板（V1.5 §8「殖民地建筑与战舰生产」/ §9「战舰科技树」）
//   ① 三级船坞状态：B32/B33/B34 各自的造价、工期、入驻人口、电力 6/10/18、可产稀有度，
//      以及"已建成 / 建造中 / 还没建"三种状态（没建的直接给殖民地页签的建法指引）；
//   ② 建造队列：**在建 2 格**（同时建造数上限的唯一真值 = MAX_CONCURRENT_BUILDS）+ 排队列表
//      （§11 #5 排队无限）+ 取消（**只有未开工的排队项可取消**，已开工的一律挡并写明原因）；
//   ③ 可造卡列表：**遍历完整数组**（不 slice / 不 filter 静默截断），逐张给出
//      造价 / 需要几级船坞 / 需要哪个科技 / 单艘工期；不能造时**行内写中文原因**（不只置灰）。
//
// 判定与数值**一律来自 lib/battle/shipyard 的纯函数**（canBuild / buildCost / buildTurns /
// requiredDockLevel / dockLevel / advanceQueue / canCancelBuild），本组件只做渲染与转发。
// 技能全文不在这里：点一张卡后由 HangarTab 的共用详情区（ShipSkillDetail）显示（铁律①）。
// ============================================================================

/** 稀有度 → 左边条配色（与 HangarCard 同一套语言，列表行用） */
function rarityBorder(rarity: string): string {
  if (rarity === '蓝') return 'border-l-[3px] border-l-sky-400';
  if (rarity === '紫') return 'border-l-[3px] border-l-violet-400';
  if (rarity === '橙') return 'border-l-[3px] border-l-amber-400';
  return 'border-l-[3px] border-l-slate-300';
}

/** 队列一行的显示（在建 / 排队） */
function QueueRow({
  row,
  onCancel,
  cancelReason,
}: {
  row: BuildQueueRow;
  onCancel: (index: number) => void;
  cancelReason: (index: number) => string;
}) {
  const reason = row.tone === 'waiting' ? cancelReason(row.index) : '';
  const canCancel = row.tone === 'waiting' && reason === '';
  return (
    <div className={`rounded-lg border border-[#2b3550] bg-[#161f36] px-2 py-1.5 ${rarityBorder(row.rarity)}`}>
      <div className="flex items-center gap-2">
        <img
          src={row.artSrc}
          alt=""
          loading="lazy"
          decoding="async"
          onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }}
          className="h-9 w-16 flex-none rounded border border-[#2b3550] object-cover"
        />
        <span className="min-w-0 flex-1">
          <span className="block truncate text-[12.5px] font-bold text-slate-100">
            {row.name}
            <span className="ml-1 text-[10.5px] font-normal text-slate-500">
              {row.series} · {row.rarity}
            </span>
          </span>
          <span className="mt-0.5 block text-[10.5px] text-slate-400">
            {row.tone === 'building'
              ? `在建 · 还剩 ${row.turnsLeft} 回合（共 ${row.totalTurns} 回合）`
              : `排队中 · 轮到它之后还需 ${row.totalTurns} 回合`}
          </span>
        </span>
        {row.tone === 'waiting' ? (
          <button
            type="button"
            onClick={() => onCancel(row.index)}
            disabled={!canCancel}
            className="flex-none rounded-[7px] border border-red-700 bg-red-900/40 px-2 py-1 text-[11px] font-bold text-red-200 hover:enabled:bg-red-900/70 disabled:cursor-not-allowed disabled:opacity-40"
          >
            取消排队
          </button>
        ) : (
          <span className="flex-none text-[10.5px] text-cyan-300">造船台上</span>
        )}
      </div>
      {/* 不可取消的原因写在行内（手机端没有 hover） */}
      {row.tone === 'waiting' && !canCancel ? (
        <p className="mt-1 text-[10.5px] leading-tight text-amber-400">{reason}</p>
      ) : null}
      {row.tone === 'building' ? (
        <p className="mt-1 text-[10.5px] leading-tight text-slate-500">已开工的战舰不能取消（V1.5 §8 没有中途终止生产的规则）。</p>
      ) : null}
    </div>
  );
}

/** 三级船坞状态的一段（已建成 / 建造中 / 还没建） */
function DockTier({ state, tier }: { state: GameState; tier: ShipyardView['built'][number] }) {
  const def = getBuildingDef(tier.id);
  const colony = state.ships[0]?.colony;
  const buildingCount = colony ? colony.buildings.filter((b) => !b.active && b.defId === tier.id).length : 0;
  const cost = def && colony ? getBuildingCostProfile(def, colony) : null;
  const built = tier.count > 0;
  const status = built ? '已建成' : buildingCount > 0 ? '建造中' : '还没建';
  const statusClass = built ? 'text-emerald-300' : buildingCount > 0 ? 'text-yellow-300' : 'text-slate-500';
  const maxCount = def && colony ? getEffectiveMaxCount(def, colony) : undefined;
  return (
    <div className={`rounded-lg border px-2 py-1.5 ${built ? 'border-emerald-800/60 bg-emerald-900/10' : 'border-[#2b3550] bg-[#0f1729]'}`}>
      <div className="flex flex-wrap items-baseline gap-x-2">
        <b className="text-[12.5px] text-slate-100">{tier.name}</b>
        <span className={`text-[11px] font-bold ${statusClass}`}>{status}</span>
        {def ? <span className="text-[10.5px] text-slate-500">可造 {tier.level === 3 ? '紫、橙' : tier.level === 2 ? '蓝' : '白'}卡</span> : null}
      </div>
      {def ? (
        <p className="mt-0.5 text-[10.5px] leading-relaxed text-slate-500">
          造价 {cost ? `${cost.gold.toLocaleString()} 金币` : `${def.costGold.toLocaleString()} 金币`}
          {def.costAlloy ? ` + ${def.costAlloy} 合金` : ''}
          {Object.entries(def.costMaterials || {}).map(([id, n]) => ` + ${n} ${MATERIAL_NAME_MAP[id] || id}`).join('')}
          {' · '}{cost ? cost.turns : def.buildTurns} 回合
          {' · '}入驻 {def.minPop}-{def.maxPop} 人
          {' · '}⚡ {def.powerConsumption}
          {maxCount ? ` · 上限 ${maxCount} 座` : ''}
        </p>
      ) : null}
    </div>
  );
}

interface ShipyardPanelProps {
  /** 整份存档状态：船坞等级（殖民地建筑列表）与队列都在里面 */
  state: GameState;
  /** 点选一张卡 → 写进 HangarTab 的共用技能详情区 */
  onSelect: (cardId: string) => void;
  /** 下单建造（dispatch ENQUEUE_BUILD） */
  onBuild: (cardId: string) => void;
  /** 取消未开工的排队项（dispatch CANCEL_BUILD，入参是队列下标） */
  onCancelBuild: (index: number) => void;
}

function ShipyardPanelBase({ state, onSelect, onBuild, onCancelBuild }: ShipyardPanelProps) {
  /** 本面板自己的高亮（共用详情区由 HangarTab 持有，这里只管哪张卡被点过） */
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const view = useMemo(() => shipyardView(state), [state]);

  const pick = useCallback(
    (cardId: string) => {
      setSelectedId(cardId);
      onSelect(cardId);
    },
    [onSelect],
  );

  /** 取消排队可用性由纯函数判（canCancelBuild 同时被 reducer 用作守卫，判定只有一份） */
  const cancelReason = useCallback(
    (index: number) => {
      const check = canCancelBuild(state.buildQueue, index);
      return check.ok ? '' : check.reason || '';
    },
    [state.buildQueue],
  );

  const selectedDockLevel = view.dockLevel;
  const nextLevel: 1 | 2 | 3 | null = selectedDockLevel >= 3 ? null : ((selectedDockLevel + 1) as 1 | 2 | 3);
  const nextTier = nextLevel ? view.built.find((t) => t.level === nextLevel) || null : null;

  return (
    <div className="rounded-[10px] border border-[#2b3550] bg-[#141b2e] px-2.5 py-2.5">
      <div className="flex flex-wrap items-baseline gap-2">
        <h3 className="text-[13px] font-bold text-slate-200">船坞</h3>
        <span className="text-[11px] text-slate-500">
          当前 {dockLevelText(view.dockLevel)} · 同时可造 {view.queue.maxConcurrent} 艘（排队不限）
        </span>
      </div>

      {/* ==================== ① 三级船坞状态 ==================== */}
      <div className="mt-2 grid gap-1.5 md:grid-cols-3">
        {view.built.map((tier) => (
          <DockTier key={tier.id} state={state} tier={tier} />
        ))}
      </div>

      {view.dockLevel === 0 ? (
        <p className="mt-2 rounded-lg border border-dashed border-[#33405f] px-2.5 py-2 text-[11.5px] leading-relaxed text-amber-400">
          {view.hasColony
            ? '还没有船坞 —— 去「殖民」页签的「建造新建筑」里造一座（一级船坞 8000 金币 + 100 合金，2 回合，用电 6）。船坞建成后的下一个回合就能在这里下单造舰。'
            : '还没有殖民地 —— 先跃迁到一颗星球，在「殖民」页签建立殖民地，再建造船坞（V1.5 §8）。'}
        </p>
      ) : null}
      {view.hasColony && nextTier && nextLevel === 2 ? (
        <p className="mt-1.5 text-[10.5px] leading-relaxed text-slate-500">
          想造蓝卡：先在「殖民」页签造「{nextTier.name}」，再研发对应系列的「蓝图解析」科技
          （每系列 400 科研点 / 2 回合，T28–T36，V1.5 §9.1）。下面每张卡的"需要"一行都写明了它属于哪个科技。
        </p>
      ) : null}
      {view.hasColony && nextTier && nextLevel === 3 ? (
        <p className="mt-1.5 text-[10.5px] leading-relaxed text-slate-500">
          想造紫卡与橙卡：先造「{nextTier.name}」，再研发对应系列的「精锐改装」科技
          （每系列 1200 科研点 / 3 回合，前置 = 本系蓝图解析）。能造哪个系列由科技决定，不由船坞决定（换系列不用重建船坞）。
        </p>
      ) : null}

      {/* ==================== ② 建造队列（在建 2 格 + 排队列表） ==================== */}
      <div className="mt-3">
        <div className="flex flex-wrap items-baseline gap-2">
          <h4 className="text-[12.5px] font-bold text-slate-200">造船队列</h4>
          <span className="text-[11px] text-slate-500">
            同时建造 {view.queue.building.length}/{view.queue.maxConcurrent} 艘 · 排队 {view.queue.waiting.length} 艘
            {view.queue.freeSlots > 0 ? `（还有 ${view.queue.freeSlots} 个空位，现在下单立刻开工）` : '（满位，现在下单会排到队尾）'}
          </span>
        </div>
        {view.queue.building.length === 0 && view.queue.waiting.length === 0 ? (
          <p className="mt-1.5 text-[11.5px] text-slate-500">
            {view.dockLevel === 0 ? '还没有船坞，暂时造不了舰。' : '造船台是空的 —— 在下面挑一张卡下单。'}
          </p>
        ) : (
          <div className="mt-1.5 space-y-1.5">
            {view.queue.building.map((row) => (
              <QueueRow key={`b-${row.index}`} row={row} onCancel={onCancelBuild} cancelReason={cancelReason} />
            ))}
            {view.queue.waiting.length > 0 ? (
              <>
                <p className="pt-0.5 text-[10.5px] text-slate-500">排队中（前面的造完就依次开工）：</p>
                {view.queue.waiting.map((row) => (
                  <QueueRow key={`w-${row.index}`} row={row} onCancel={onCancelBuild} cancelReason={cancelReason} />
                ))}
              </>
            ) : null}
          </div>
        )}
      </div>

      {/* ==================== ③ 可造卡列表（全部渲染，不截断） ==================== */}
      <div className="mt-3 flex flex-wrap items-baseline gap-2">
        <h4 className="text-[12.5px] font-bold text-slate-200">可造战舰</h4>
        <span className="text-[11px] text-slate-500">
          共 {view.cards.length} 型（按数据顺序全列，能造 {view.cards.filter((c) => c.ok).length} 型）；点一张卡看技能全文
        </span>
      </div>
      {view.cards.length === 0 ? (
        <p className="mt-1.5 text-[11.5px] text-amber-400">卡牌数据为空（不该发生：检查 data/battle/cards.ts）。</p>
      ) : (
        <div className="mt-1.5 space-y-1.5">
          {view.cards.map((card) => (
            <ShipyardCardLine key={card.id} card={card} selected={selectedId === card.id} onSelect={pick} onBuild={onBuild} />
          ))}
        </div>
      )}

      {/* 队列视图的完整文案出口：把"在建 2 格"的槽位也用文字说清楚（手机端不会漏读） */}
      <p className="mt-2 text-[10.5px] leading-relaxed text-slate-500">
        船坞每回合推进一次：已开工的每回合减 1，减到 0 即完工并**自动进入卡库**（卡库才是"拥有什么"的真值，
        V1.5 §8.3）。同时只能造 {view.queue.maxConcurrent} 艘，其余按顺序排队（排队不限长度）。
      </p>
    </div>
  );
}

/** 可造卡的一行（**不与卡库卡片共用**：这里要显示造价、所需船坞、所需科技与不能造的原因） */
function ShipyardCardLine({
  card,
  selected,
  onSelect,
  onBuild,
}: {
  card: ShipyardCardRow;
  selected: boolean;
  onSelect: (cardId: string) => void;
  onBuild: (cardId: string) => void;
}) {
  const costText = formatBuildCost(card.price);
  return (
    <div
      className={`flex gap-2 rounded-lg border bg-[#0f1729] px-2 py-1.5 ${rarityBorder(card.rarity)} ${
        selected ? 'border-amber-400 ring-2 ring-amber-400/30' : 'border-[#2b3550]'
      }`}
    >
      {/* 图位复用机库卡面（内部已走 getThumbPath 缩略图） */}
      <div className="w-full max-w-[260px] flex-none">
        <HangarCard
          id={card.id}
          name={card.name}
          series={card.series}
          rarity={card.rarity}
          cost={card.cost}
          atk={card.atk}
          shield={card.shield}
          structure={card.structure}
          artSrc={card.artSrc}
          selected={selected}
          onSelect={onSelect}
        />
      </div>

      <div className="min-w-0 flex-1">
        <p className="text-[11px] leading-relaxed text-slate-300">
          造价 {costText} · 工期 {card.turns} 回合
        </p>
        <p className="mt-0.5 text-[10.5px] leading-relaxed text-slate-500">
          需要 {dockLevelText(card.dockLevel)}
          {card.techName ? ` + 科技「${card.techName}」` : '（白卡默认可造，无需科技）'}
        </p>
        <div className="mt-1 flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={() => onBuild(card.id)}
            disabled={!card.ok}
            className="rounded-[7px] border border-cyan-600 bg-cyan-800 px-2.5 py-1 text-[11.5px] font-bold text-white hover:enabled:bg-cyan-700 disabled:cursor-not-allowed disabled:opacity-40"
          >
            下单建造
          </button>
          {/* 不能造的原因写在行内（不只置灰 / 不只 title）——AGENTS 第十节机库铁律② */}
          <span className={`text-[10.5px] leading-relaxed ${card.ok ? 'text-slate-500' : 'text-amber-400'}`}>
            {card.ok
              ? `可以建造（下单后${card.turns}回合完工，完工进卡库）`
              : card.reason}
          </span>
        </div>
      </div>
    </div>
  );
}

export default memo(ShipyardPanelBase);
