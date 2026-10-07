import { memo, useCallback, useMemo, useState } from 'react';
import type { GameState } from '@/types/game';
import type { BuildQueueRow, ShipyardCardRow, ShipyardLockedTier, ShipyardSeriesFilter, ShipyardView } from '@/lib/battle/shipyard';
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
//   ③ 可造卡列表：**只列已解锁的卡**（解锁门槛 = 船坞等级 + 科技，判定全在 lib/battle/shipyard.lockGate；
//      **资源够不够不算门槛** —— 买不起也看得见，只是按钮禁用 + 行内中文原因）。
//      ⚠ 未解锁的卡**绝不静默隐藏**（AGENTS 第九节）：列表末尾给一行汇总（数量与分档由
//        shipyard.lockedSummary 从卡牌数据算出，本面板只把里面的科技 id 收成「相应科技」），
//        另给一句下一档解锁指引（`view.lockHint`）。
//
// 判定与数值**一律来自 lib/battle/shipyard 的纯函数**（lockGate / canBuild / buildCost / buildTurns /
// requiredDockLevel / dockLevel / advanceQueue / canCancelBuild），本组件只做渲染与转发，不写第二份门槛。
//
// ⚠ 技能文字（用户 2026-08 口径：可造战舰那一行的右侧文字区也要能直接读到技能）：
//   · **唯一来源 = `ShipyardCardRow.text`**，它由 `lib/battle/shipyard.shipyardView` 从
//     `data/battle/cards.ts` 的 `ShipCardDef.text` 逐字带出来（`shipyard.ts` 里 `text: card.text`）；
//     机库顶部的技能详情固定区（`ShipSkillDetail`）读的是 `BATTLE_CARDS[id].text` —— **同一处字段**。
//   · 本组件**不得**自己拼技能句子（不许写"攻+X/盾+Y"之类的转述），只渲染 `card.text`：
//     两处措辞不可能漂移。
//   · 位置：只加在**已解锁**的行（`view.unlockedCards` 才是主列表；未解锁的卡只有末尾汇总行），
//     加在右侧文字区（说明文字的位置），**左侧卡面不加**（铁律①「技能不上卡面」）。
//     卡库的紧凑网格与编队的编成清单都不加（没位置，技能详情区已覆盖）。
// ⚠ 本组件**不带自己的外框**：它整块嵌在 HangarTab 的「船坞」标签容器里（外框与内边距由那一层给），
//   故这里只有内容，没有 border/bg/px —— 免得出现"框里再套一层框"。
// ============================================================================

/** 稀有度 → 左边条配色（与 HangarCard 同一套语言，列表行用） */
function rarityBorder(rarity: string): string {
  if (rarity === '蓝') return 'border-l-[3px] border-l-sky-400';
  if (rarity === '紫') return 'border-l-[3px] border-l-violet-400';
  if (rarity === '橙') return 'border-l-[3px] border-l-amber-400';
  return 'border-l-[3px] border-l-slate-300';
}

/**
 * 未解锁的一档：`蓝卡 9 种（需二级船坞 + 相应科技）`。
 * 分档、型数、稀有度与"要不要科技"全部来自 shipyard.lockedSummary（判定不在这里），
 * 本函数只把**科技 id 换成人话**：「相应科技」——内部编号不给玩家看，具体是哪个科技
 * 由逐张卡的禁用原因写明（那一处仍写具体科技名，如「圣辉蓝图解析」）。
 */
function lockedTierText(tier: ShipyardLockedTier): string {
  const label = `${tier.rarities.join('')}卡 ${tier.cardCount} 种`;
  const dock = dockLevelText(tier.dockLevel);
  return tier.techIds.length > 0
    ? `${label}（需${dock} + 相应科技）`
    : `${label}（需${dock}）`;
}

/** 未解锁汇总行：`还有 21 种未解锁 · 蓝卡 9 种（需二级船坞 + 相应科技）· 紫橙卡 12 种（需三级船坞 + 相应科技）` */
function lockedSummaryLine(view: ShipyardView): string {
  const parts = view.locked.tiers.map((tier) => lockedTierText(tier));
  const head = `还有 ${view.locked.total} 种未解锁`;
  return parts.length > 0 ? `${head} · ${parts.join(' · ')}` : head;
}

/**
 * 可造列表上面那排系列标签（chip）：`全部 14 / 圣辉 3 / 铁血 3 / …`。
 * · 档位、顺序与计数全部来自 `shipyard.ShipyardSeriesFilter`（从卡牌数据算）；
 * · **选中的档位只在组件内生效**（onPick 是 useCallback，不往 memo 子组件传 inline 箭头）；
 * · 只有一个档（或一个都没有）时**不渲染** —— 那时没有任何东西可筛，多一排标签只是噪音。
 */
function ShipyardSeriesChips({
  filters,
  totalCount,
  active,
  onPick,
}: {
  filters: ShipyardSeriesFilter[];
  totalCount: number;
  active: string;
  onPick: (series: string) => void;
}) {
  if (filters.length <= 1) return null;
  const chipClass = (on: boolean) =>
    `rounded-full border px-2 py-0.5 text-[11px] font-bold transition-colors ${
      on ? 'border-cyan-500 bg-cyan-800/60 text-white' : 'border-[#33405f] bg-[#161f36] text-slate-400 hover:bg-[#1d2740]'
    }`;
  return (
    <div className="mt-1.5 flex flex-wrap gap-1.5">
      <button type="button" onClick={() => onPick('all')} className={chipClass(active === 'all')}>
        全部 {totalCount}
      </button>
      {filters.map((f) => (
        <button key={f.series} type="button" onClick={() => onPick(f.series)} className={chipClass(active === f.series)}>
          {f.series} {f.unlockedCount}
        </button>
      ))}
    </div>
  );
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
        <p className="mt-1 text-[10.5px] leading-tight text-slate-500">已开工的战舰不能取消。</p>
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
  /** 可造列表的系列筛选（'all' = 全部，**默认「全部」**）。
   *  ⚠ 这是**用户自己点的**筛选，不是 AGENTS 第九节禁止的"静默截断"：默认不缩、计数标在标签上、
   *    未解锁汇总行不受它影响；档位与计数由 lib/battle/shipyard.seriesFilters 从卡牌数据算。 */
  const [seriesFilter, setSeriesFilter] = useState<string>('all');

  const view = useMemo(() => shipyardView(state), [state]);

  /** 系列标签的点击处理（**useCallback 保持稳定引用**，不往渲染里塞 inline 箭头 —— AGENTS 第五节） */
  const pickSeries = useCallback((series: string) => {
    setSeriesFilter(series);
  }, []);

  /** 当前选中的档还在不在（造出更高档船坞 / 换存档后可能没有该系列的已解锁卡了）→ 回落到「全部」。
   *  这样不会出现"标签不见了、列表却还被筛着"的空列表。 */
  const activeSeries = seriesFilter === 'all' || view.seriesFilters.some((f) => f.series === seriesFilter)
    ? seriesFilter
    : 'all';
  const visibleCards = activeSeries === 'all'
    ? view.unlockedCards
    : view.unlockedCards.filter((c) => c.series === activeSeries);

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

  return (
    <div>
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
            : '还没有殖民地 —— 先跃迁到一颗星球，在「殖民」页签建立殖民地，再建造船坞。'}
        </p>
      ) : null}
      {/* 下一档解锁指引：门槛文案（几级船坞 + 哪些科技 + 哪些系列）全部由 shipyard.shipyardView 生成，
          本面板只渲染 —— UI 里不写第二份等级/科技判断。 */}
      {view.lockHint ? (
        <p className="mt-1.5 text-[10.5px] leading-relaxed text-slate-500">{view.lockHint}</p>
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

      {/* ==================== ③ 可造卡列表（**只列已解锁的**；未解锁的折成下面那行汇总） ==================== */}
      <div className="mt-3 flex flex-wrap items-baseline gap-2">
        <h4 className="text-[12.5px] font-bold text-slate-200">可造战舰</h4>
        <span className="text-[11px] text-slate-500">
          已解锁 {view.unlockedCards.length} 型（白卡默认可造；蓝/紫/橙要建成对应船坞并研发对应科技）
          {view.unlockedCards.length > 0 ? ` · 现在能造 ${view.unlockedCards.filter((c) => c.ok).length} 型` : ''}
        </span>
      </div>
      {/* 系列标签（chip）：档位与计数从卡牌数据算（view.seriesFilters），只列出"有已解锁卡"的系列；
          默认「全部」，点了才缩到某系列。**未解锁汇总行不受筛选影响**（它说的是总数）。 */}
      <ShipyardSeriesChips
        filters={view.seriesFilters}
        totalCount={view.unlockedCards.length}
        active={activeSeries}
        onPick={pickSeries}
      />
      {view.cards.length === 0 ? (
        <p className="mt-1.5 text-[11.5px] text-amber-400">卡牌数据为空（不该发生：检查 data/battle/cards.ts）。</p>
      ) : view.unlockedCards.length === 0 ? (
        <p className="mt-1.5 text-[11.5px] leading-relaxed text-amber-400">
          还没有解锁任何战舰 —— 白卡默认解锁，先建成一级船坞就能造第一批。
        </p>
      ) : (
        <div className="mt-1.5 space-y-1.5">
          {visibleCards.map((card) => (
            <ShipyardCardLine key={card.id} card={card} selected={selectedId === card.id} onSelect={pick} onBuild={onBuild} />
          ))}
        </div>
      )}
      {/* 未解锁的**一行汇总**（AGENTS 第九节：不许静默隐藏）——数量与分档全部由
          shipyard.lockedSummary 从卡牌数据算出，本面板不硬编码任何数字，也不把科技 id 渲染给玩家。 */}
      {view.locked.total > 0 ? (
        <div className="mt-2 rounded-lg border border-dashed border-[#33405f] px-2.5 py-1.5">
          <p className="text-[11px] leading-relaxed text-slate-400">{lockedSummaryLine(view)}</p>
        </div>
      ) : null}
    </div>
  );
}

/**
 * 可造战舰行里的**技能全文**（铁律①：技能不上卡面，但这一行的说明区要能直接读到它）。
 *
 * ⚠ 唯一真值：`text` **只能**是 `ShipyardCardRow.text`（来自 `ShipCardDef.text`，
 *   `lib/battle/shipyard.shipyardView` 的 `text: card.text`），与机库顶部技能详情区
 *   （`ShipSkillDetail` 读 `BATTLE_CARDS[id].text`）是**同一处**。这里不拼任何技能句子。
 *
 * ⚠ 不许省略号截断 —— 截断的技能等于没有：盒子取整行全宽 + `line-clamp-3` 兜底
 *   （`line-clamp` 只 clip、不加省略号；最长的一条技能 39 字，10.5px 下全宽也就 1~2 行，
 *   钳 3 行等于留了一行余量 —— 将来真出了超长技能，行高也不会被撑破）
 *   ＋ `title` 兜底（桌面端悬停可直接看全文）。
 */
function ShipyardSkillLine({ text }: { text: string }) {
  return (
    <p
      title={text}
      className="mt-0.5 line-clamp-3 text-[10.5px] leading-relaxed text-slate-400"
    >
      <span className="text-slate-500">技能：</span>
      {text}
    </p>
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
        {/* ⚠ 技能全文放**这一行的全宽**（不在右侧窄列里）：右侧文字区右边还挨着卡面，
            手机上只剩两三百像素，最长的那条技能（39 字）挤进去会被折成 4~5 行、把整行撑高；
            全宽一行才装得下（10.5px 下 39 字 ≈1~2 行），行高不变。 */}
        <ShipyardSkillLine text={card.text} />
        <div className="mt-1 flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={() => onBuild(card.id)}
            disabled={!card.ok}
            className="rounded-[7px] border border-cyan-600 bg-cyan-800 px-2.5 py-1 text-[11.5px] font-bold text-white hover:enabled:bg-cyan-700 disabled:cursor-not-allowed disabled:opacity-40"
          >
            下单建造
          </button>
          {/* 不能造的原因写在行内（不只置灰 / 不只 title）——AGENTS-附录.md 10.2 机库铁律② */}
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
