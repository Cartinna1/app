import { memo, useCallback, useMemo, useState } from 'react';
import type { GameState } from '@/types/game';
import type { BuildQueueRow, ShipyardCardRow, ShipyardLockedTier, ShipyardView } from '@/lib/battle/shipyard';
import { canCancelBuild, defaultSeriesFilter, filterBySeries, formatBuildCost, dockLevelText, pickSeriesFilter, resolveSeriesFilter, shipyardView } from '@/lib/battle/shipyard';
import ShipCard from '@/components/ship/ShipCard';
import SeriesChipRow from './SeriesChipRow';

// ============================================================================
// 机库 · 船坞面板（V1.5 §8「殖民地建筑与战舰生产」/ §9「战舰科技树」）
//   ① 顶部一行状态（`当前 一级船坞 · 同时可造 2 艘（排队不限）`）；
//      ⚠ **三级船坞的三张说明卡已按用户 2026-08 口径删除**（那是纯展示：船坞三级是「殖民」页签的
//        B32/B33/B34，那三张卡上没有任何按钮，建/升级都在殖民地页签做）；
//   ② 建造队列：**在建 2 格**（同时建造数上限的唯一真值 = MAX_CONCURRENT_BUILDS）+ 排队列表
//      （§11 #5 排队无限）+ 取消（**只有未开工的排队项可取消**，已开工的一律挡并写明原因）；
//      ⚠ 队列**空时不显示任何东西**（原「造船台是空的 —— 在下面挑一张卡下单。」已删）；
//   ③ 可造卡列表：**只列已解锁的卡**（解锁门槛 = 船坞等级 + 科技，判定全在 lib/battle/shipyard.lockGate；
//      **资源够不够不算门槛** —— 买不起也看得见，只是按钮禁用 + 行内中文原因）。
//      ⚠ 未解锁的卡**绝不静默隐藏**（AGENTS 第九节）：列表末尾给一行汇总（数量与分档由
//        shipyard.lockedSummary 从卡牌数据算出，本面板只把里面的科技 id 收成「相应科技」）。
//      ⚠ 「想造蓝卡：先造…」那句下一档解锁指引（`view.lockHint`）也已按用户口径删除渲染
//        （模型字段保留，其余消费者仍可读）。
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

/** 稀有度 → 左边条配色（与共用卡面 ShipCard 同一套语言，列表行用） */
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

  /** 可造列表的系列筛选：**默认 = 第一个"有已解锁卡"的系列**（用户 2026-08 二次口径，
   *  进面板就只看该系列；以前是"默认不筛选"，已废）。初值由 `shipyard.defaultSeriesFilter` 算，
   *  **不硬编码系列名**——将来换卡/换档也不会开出空列表。
   *  ⚠ 计数标在每颗 chip 上、顶部「已解锁 N 型」与底部未解锁汇总行都不受它影响。 */
  const [seriesFilter, setSeriesFilter] = useState<string>(() => defaultSeriesFilter(view.seriesFilters));

  /** 系列标签的点击处理（**useCallback 保持稳定引用**，不往渲染里塞 inline 箭头 —— AGENTS 第五节）。
   *  ⚠ **点已选中的那一颗什么都不发生**（`shipyard.pickSeriesFilter` 原样返回），**没有"取消筛选"**
   *    —— 永远恰好选中一个系列（用户 2026-08 二次口径）。 */
  const pickSeries = useCallback((series: string) => {
    setSeriesFilter((prev) => pickSeriesFilter(prev, series));
  }, []);

  /** 当前筛选在现有档位里还有效吗（造出更高档船坞 / 换存档后可能没有该系列的已解锁卡了）→
   *  落到**第一个有已解锁卡的系列**（不是"不筛选"）。判定在 shipyard.resolveSeriesFilter。
   *  配合 filterBySeries 的"无匹配 → 完整数组"防线，任何路径都不会给出空列表。 */
  const activeSeries = resolveSeriesFilter(seriesFilter, view.seriesFilters);
  const visibleCards = filterBySeries(view.unlockedCards, activeSeries);

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

      {/* ⚠ 用户 2026-08 口径「船坞的指引文字太多了，红框里的都删去」：
          ① 三级船坞的「已建成 / 可造 白卡 / 造价 … / 上限 1 座」三张信息卡 —— **整块删除**
             （它们是**纯展示**：船坞三级是「殖民」页签的建筑 B32/B33/B34，这三张卡上**没有任何按钮**，
              建/升级都在殖民地页签做，所以删掉不影响任何操作）；
          ② `view.lockHint`（「想造蓝卡：先造「二级船坞」，再研发…」）—— 删除渲染。
             ⚠ 模型里的 `ShipyardView.lockHint` / `.built` 仍保留（其余消费者与 check 脚本还在读），
               只是本面板不再显示。 */}

      {view.dockLevel === 0 ? (
        <p className="mt-2 rounded-lg border border-dashed border-[#33405f] px-2.5 py-2 text-[11.5px] leading-relaxed text-amber-400">
          {view.hasColony
            ? '还没有船坞 —— 去「殖民」页签的「建造新建筑」里造一座（一级船坞 8000 金币 + 100 合金，2 回合，用电 6）。船坞建成后的下一个回合就能在这里下单造舰。'
            : '还没有殖民地 —— 先跃迁到一颗星球，在「殖民」页签建立殖民地，再建造船坞。'}
        </p>
      ) : null}
      {/* 下一档解锁指引（`view.lockHint`，如「想造蓝卡：先造「二级船坞」，再研发…」）**已按用户 2026-08 口径删除渲染** ——
          门槛文案仍在 `lib/battle/shipyard.lockHintText` 里（模型不变），只是船坞面板不再显示这一行。 */}

      {/* ==================== ② 建造队列（在建 2 格 + 排队列表） ==================== */}
      <div className="mt-3">
        <div className="flex flex-wrap items-baseline gap-2">
          <h4 className="text-[12.5px] font-bold text-slate-200">造船队列</h4>
          {/* ⚠ 用户口径：删掉「（还有 N 个空位，现在下单立刻开工）/（满位，现在下单会排到队尾）」那句引导，
              只留「同时建造 x/2 艘 · 排队 y 艘」的**状态**数字。 */}
          <span className="text-[11px] text-slate-500">
            同时建造 {view.queue.building.length}/{view.queue.maxConcurrent} 艘 · 排队 {view.queue.waiting.length} 艘
          </span>
        </div>
        {/* ⚠ 队列空时**什么都不显示**（原「造船台是空的 —— 在下面挑一张卡下单。」已按用户口径删除）；
            队列非空时这里的行照常显示（含「在建 · 还剩 N 回合」/「排队中 · 轮到它之后还需 N 回合」）。 */}
        {view.queue.building.length === 0 && view.queue.waiting.length === 0 ? null : (
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
      {/* 系列标签（chip）：**与卡库共用同一个组件**（`SeriesChipRow`，颜色/尺寸/横滑只有一份实现）；
          档位与计数来自 `view.seriesFilters`（= 已解锁卡按系列分组），判定在 lib/battle/seriesFilter。
          默认选中第一个系列，点已选中的那颗什么都不发生（那颗「全部」已按用户口径删除）；
          **未解锁汇总行不受筛选影响**（它说的是总数）。 */}
      <SeriesChipRow
        groups={view.seriesFilters}
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
    /* ⚠ 手机端**竖排**（卡面在上、建造信息在下）—— 用户 2026-08 截图实证：
       原来"卡面(封顶 280px) + 信息列"并排，390 宽下行内只有 330px ⇒ 信息列只剩 **42px**，
       「造价 … / 需要一级船坞… / 技能：… / 下单建造 / 入驻人口…」全部**一字一行竖排**。
       `flex-col sm:flex-row`：手机端两段各拿满整行（信息列 42px → 330px），sm 起恢复并排。 */
    <div
      className={`flex flex-col gap-2 rounded-lg border bg-[#0f1729] px-2 py-1.5 sm:flex-row ${rarityBorder(card.rarity)} ${
        selected ? 'border-amber-400 ring-2 ring-amber-400/30' : 'border-[#2b3550]'
      }`}
    >
      {/* 图位复用**共用卡面**（`components/ship/ShipCard`：卡库 / 船坞 / 战斗部署池同一个组件）。
          这里用 `layout="row"`（文字在左、图在右 58%）：
          · 手机端卡面拿满整行（**不加 280 上限**）⇒ 330 宽、图位 191×96、卡内文字列 ≈121px（攻盾体只需 97px ✓）；
          · `sm` 起才恢复 280 上限 ⇒ 图位 162×81 时卡内文字列仍放得下「攻盾体」，建造信息列另有 ≈268px。
          （不做"手机端图在上"：那样每行会从 ≈190px 撑到 ≈390px，33 行多滚一倍，而信息列挪到卡片下方已经够读。） */}
      <div className="w-full flex-none sm:max-w-[280px]">
        <ShipCard
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
          layout="row"
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
