// ==================== 存档序列化 / 反序列化 / 迁移 ====================
// 存档字段清单的唯一维护点：GameState 新增需要持久化的字段时，只改 buildSaveData / stateFromSave。
// 旧存档兼容补丁集中在 migrateSave（由 gameReducer 的 LOAD_SAVE 统一调用）。

import type { GameState, SaveData, Mothership } from '@/types/game';
import { FACTIONS, POLICY_EFFECTS, refreshFactionPrices } from '@/data/factions';
import { createGalaxyState } from '@/data/galaxy/nodes';
import { BLACK_MARKET_DEFAULT } from '@/data/exchangeRates';

export const SAVE_KEY = 'aviation_career_save';
/** 音乐静音开关的 localStorage key（与存档同处声明，避免组件里写裸字符串） */
export const BGM_MUTED_KEY = 'bgm_muted';
/** 2：位置与跃迁迁入 ship.galaxy（星图）；旧档不做星图进度迁移，只补一份全新星图。
 *  3：卡牌战斗（V1.5 §10）新增 cardLibrary / fleets / expedition / raid 四个存档字段；
 *     **只新增字段、不改任何既有字段的结构与语义**，故没有结构迁移（老档缺字段一律由 stateFromSave 兜底）。
 *     ⚠ 卡库初始为空，**不赠送战舰**（战舰只能靠船坞建造，V1.5 §8）。
 *     ⚠ `battle`（进行中的战斗）**故意不进存档**：读档一律为 null（V1.5 §〇「战斗中不能保存」）。
 *  4：船坞与科技（V1.5 §8.2 造船建筑 / §8.3 生产规则 / §9 科技树 T28–T36）新增造船队列
 *     `buildQueue`。⚠ 同样**只新增字段、不改既有字段的结构与语义** → **无需 v3→v4 结构迁移**：
 *       老档缺 `buildQueue` 由 stateFromSave 兜底成 `[]`（队列为空 = 什么都没有在造，语义正确）。
 *     ⚠ 建筑（船坞 B32/B33/B34）与科技（T28–T36）都是纯数据追加，存量存档里的
 *       `colony.buildings` / `colony.techState.researched` 照常读，不需要迁移。
 *  5：掠夺改成**两段窗口**（用户 2026-08 裁定：预警 CD → 抵达后待战再 5 回合 → 玩家点「开战」，
 *     不点则自动失败）→ `raid` 内**新增** `arrivedTurns`（阶段 B 倒计时）与 `arrived`（阶段 B 标记）。
 *     ⚠ 只新增字段、不改既有字段的结构与语义 → **无需 v4→v5 结构迁移**：
 *       老档缺这两项由 stateFromSave 兜底成 `arrivedTurns: 0` / `arrived: false`，
 *       **读出来就是"没有掠夺在途"（idle）**，与"旧存档不该凭空多一场掠夺"一致。
 *  6：新增**已打败的老巢账本** `defeatedLairs`（用户 2026-08 裁定：5 个老巢全被打败后掠夺队改名
 *     「海盗残兵」；掠夺本身**永远存在**，不受该账本影响）。
 *     ⚠ 同样**只新增字段、不改既有字段的结构与语义** → **无需 v5→v6 结构迁移**：
 *       老档缺该字段由 stateFromSave 兜底成 `[]` = 一个老巢都没打败，
 *       于是掠夺队仍叫「海盗旗舰（掠夺队）」、掠夺照常可触发（与"旧档不该凭空少一场掠夺"一致）。
 *  7：新增**掠夺战利品快照** `lastRaidReward`（用户 2026-08 裁定「把奖励显著地显示出来」）。
 *     ⚠ 同样**只新增字段、不改既有字段的结构与语义** → **无需 v6→v7 结构迁移**：
 *       老档缺该字段由 stateFromSave 兜底成 `null` = 没有可显示的掠夺战利品
 *       （**不能凭空给旧档补一条"缴获 10 星尘"**）。
 *  8：把 v7 的战利品快照 `lastRaidReward` 改名扩形成 `lastRaidSettlement`
 *     （`outcome: 'win' | 'lost'` + `text` + `awardText` + `loot` 实扣明细）。
 *     ⚠ **该字段随后被整个删除**（用户 2026-08 最终口径：「直接放事件记录好了哇，打赢也一样」）：
 *       掠夺结算的显示出口改成**事件记录**（`eventLog`，本来就在存档清单里），
 *       另存一份快照纯属重复（仓库硬规矩：不留死字段）。
 *     ⚠ **`SAVE_VERSION` 保持 8 不动**：用户机器上跑的已经是 v8 存档，而这次只是**少读一个字段** ——
 *       v8 存档里若还留着 `lastRaidSettlement` 键，**直接忽略**；v7 的 `lastRaidReward`、v6 及更早的缺失
 *       同样无所谓 → **旧档一律照常读入，不需要任何迁移分支**（少读一个纯展示字段不改任何既有字段的
 *       结构与语义，也不影响游戏进度）。刻意**不**回退版本号：回退会让"已在用户机器上的 v8 档"
 *       看起来比 `SAVE_VERSION` 还新，反而给读档加不必要的歧义。 */
export const SAVE_VERSION = 8;

/** 存档结构校验（防止损坏/恶意存档导致崩溃） */
export function validateSaveData(data: unknown): data is Record<string, unknown> {
  if (!data || typeof data !== 'object' || Array.isArray(data)) return false;
  const d = data as Record<string, unknown>;
  // 必需字段存在性检查
  if (typeof d.turn !== 'number') return false;
  if (!Array.isArray(d.ships)) return false;
  return true;
}

/** 从运行时状态提取存档字段（唯一字段清单） */
export function buildSaveData(prev: GameState): SaveData {
  return {
    saveVersion: SAVE_VERSION,
    ships: prev.ships,
    stocks: prev.stocks,
    materials: prev.materials,
    products: prev.products,
    turn: prev.turn,
    currentShipIndex: prev.currentShipIndex,
    eventLog: prev.eventLog,
    redeemedCodes: prev.redeemedCodes,
    factions: prev.factions,
    factionPrices: prev.factionPrices,
    factionSellMultipliers: prev.factionSellMultipliers,
    blackMarketMultiplier: prev.blackMarketMultiplier,
    buyStocks: prev.buyStocks,
    buyStockMax: prev.buyStockMax,
    sellDemands: prev.sellDemands,
    sellDemandMax: prev.sellDemandMax,
    buyTriggered: prev.buyTriggered,
    sellTriggered: prev.sellTriggered,
    buyBuffs: prev.buyBuffs,
    sellBuffs: prev.sellBuffs,
    factionPolicy: prev.factionPolicy,
    policyRemainingTurns: prev.policyRemainingTurns,
    stardustMarket: prev.stardustMarket,
    gameWon: prev.gameWon,
    wonWonderName: prev.wonWonderName,
    factionReputation: prev.factionReputation,
    factionContracts: prev.factionContracts,
    // 卡牌战斗（V1.5 §10）：battle（进行中的战斗）**故意不写入**（读档一律为 null）
    cardLibrary: prev.cardLibrary,
    fleets: prev.fleets,
    expedition: prev.expedition,
    raid: prev.raid,
    // 已打败的老巢账本（v6）：掠夺队的显示名（「海盗残兵」）读它，必须存档
    defeatedLairs: prev.defeatedLairs,
    // ⚠ 掠夺结算**没有**独立存档字段：显示出口 = `eventLog`（在清单里，见上）——
    //   v7/v8 曾经存过的 `lastRaidReward` / `lastRaidSettlement` 已随用户 2026-08 最终口径删除
    //   （「直接放事件记录好了哇，打赢也一样」），旧档里残留的同名键在 stateFromSave 里被**忽略**。
    // 船坞与科技（v4）：造船队列
    buildQueue: prev.buildQueue,
  };
}

/** 旧投资迁移：每5000金币投资→+1声望，每势力上限+15 */
function reputationFromLegacyInvestments(ships: Mothership[] | undefined): Record<string, number> {
  const rep: Record<string, number> = {};
  const factionStates = ships?.[0]?.tradeStatus?.factionStates;
  if (factionStates) {
    for (const [fid, fs] of Object.entries(factionStates)) {
      rep[fid] = Math.min(15, Math.floor((fs.invested || 0) / 5000));
    }
  }
  return rep;
}

/** 存档 JSON → GameState（缺失字段用默认值兜底） */
export function stateFromSave(d: Record<string, any>): GameState {
  return {
    phase: 'playing',
    turn: d.turn || 1,
    currentShipIndex: d.currentShipIndex || 0,
    ships: (d.ships || []).map((s: Mothership) => ({
      ...s,
      // galaxy 归一化：先铺一份**完整**默认星图（保留已到达的节点），再覆盖存档里实际存在的字段。
      // 只兜「galaxy 整键缺失」是不够的：老档/改档可能 galaxy 存在却缺 visitedNodes/permaBonuses/titles，
      // 而 shipTurn（到达即探明）与 archaeologyTurn（写称号）是裸读 → 读档即 TypeError 白屏。
      galaxy: {
        ...createGalaxyState(s.galaxy?.currentNodeId),
        ...(s.galaxy || {}),
        archaeology: s.galaxy?.archaeology || {},
      },
      // 旧投资系统已退役（投资 = 8000 金币 → +1 声望，回报走 REPUTATION_TIERS 被动收入）：
      // 旧的 factionStates.invested 在上面的声望迁移里已一次性折算，这里**清零**，
      // 使 shipTurn 不再有"投资收益/档位6补给"这条永不可达的分支（自检报告 🔴R6）。
      tradeStatus: { ...s.tradeStatus, factionStates: {} },
    })),
    stocks: d.stocks || [],
    materials: d.materials || [],
    products: d.products || [],
    eventLog: d.eventLog || [],
    redeemedCodes: d.redeemedCodes || [],
    factions: d.factions || FACTIONS,
    factionPrices: d.factionPrices || refreshFactionPrices(),
    factionSellMultipliers: d.factionSellMultipliers || {},
    blackMarketMultiplier: d.blackMarketMultiplier || BLACK_MARKET_DEFAULT,
    buyStocks: d.buyStocks || {},
    buyStockMax: d.buyStockMax || {},
    sellDemands: d.sellDemands || {},
    sellDemandMax: d.sellDemandMax || {},
    buyTriggered: d.buyTriggered || {},
    sellTriggered: d.sellTriggered || {},
    buyBuffs: d.buyBuffs || {},
    sellBuffs: d.sellBuffs || {},
    factionPolicy: d.factionPolicy || { type: 'normal', effect: POLICY_EFFECTS['normal'] },
    policyRemainingTurns: d.policyRemainingTurns || 0,
    stardustMarket: d.stardustMarket || { currentRelicId: null, soldRelicIds: [] },
    gameWon: d.gameWon || false,
    wonWonderName: d.wonWonderName || '',
    // 旧存档无声望字段时从投资记录迁移（原逻辑在 reducer 里，因 useSave 预填 {} 从未生效，此处修复）
    factionReputation: d.factionReputation || reputationFromLegacyInvestments(d.ships),
    factionRepLog: {},
    factionContracts: d.factionContracts || [],
    // ===== 卡牌战斗（V1.5 §10）=====
    // v3 新增字段的**唯一兜底点**（旧档没有这些字段，一律在这里补默认值）。
    // ⚠ 这里的 5 个默认值必须与 gameReducer.createInitialGameState 的初值**逐一一致**（尤其 battle: null）。
    // ⚠ v3 的卡库**初始为空、不赠送战舰**（V1.5 §8：战舰只能靠船坞建造）。
    cardLibrary: d.cardLibrary || [],
    fleets: d.fleets || [],
    expedition: d.expedition || null,
    // 缺 raid 整键时给一份全新对象（不用模块级常量：避免和别处共享同一个可变对象）；
    // 键序保持 inTurns / arrivedTurns / immuneTurns / raiders / arrived，
    // 便于与 createInitialGameState 的 idleRaidState() 做值比较。
    // v5：新增 arrivedTurns（阶段 B 待战倒计时）与 arrived（阶段 B 标记）——
    //   v4 及更早的存档没有这两项 → 兜底成 0 / false，即"没有掠夺在途"（idle）。
    raid: { inTurns: null, arrivedTurns: 0, immuneTurns: 0, raiders: 0, arrived: false, ...(d.raid || {}) },
    // v6：已打败的老巢账本。v5 及更早的存档没有这个字段 → 兜底成 []（一个都没打败），
    //   于是掠夺队仍叫「海盗旗舰（掠夺队）」、掠夺**照常可触发**（用户 2026-08 裁定：永远存在）。
    defeatedLairs: d.defeatedLairs || [],
    // ⚠ 掠夺结算**没有字段级兜底**：显示出口 = `eventLog`（上面已读）。v7 的 `lastRaidReward` /
    //   v8 的 `lastRaidSettlement` 若还留在旧档里，**这里有意不读**（纯展示字段，删了不影响进度）。
    // 进行中的战斗**不进存档**：即使存档里混入了 battle 也一律丢弃（V1.5 §〇「战斗中不能保存」）
    battle: null,
    // ===== 船坞与科技（V1.5 §8，v4 新增）=====
    // v4 新增字段的**唯一兜底点**（v3 及更早的存档没有这个字段，一律在这里补默认值）。
    // ⚠ 这个默认值必须与 gameReducer.createInitialGameState 的初值**逐一一致**（都是 []）。
    buildQueue: d.buildQueue || [],
  };
}

/** 旧存档兼容补丁（由 gameReducer 的 LOAD_SAVE 统一调用）。
 *  ⚠ 职责分工：**字段级默认值一律由 stateFromSave 负责**（它是唯一兜底点，LOAD_SAVE 的两个入口
 *  都先过它），本函数只做「结构/语义改写」——旧字段缺失的补写在这里属于死代码（判空永不成立）。
 *  v3：只**新增**卡牌战斗字段（cardLibrary / fleets / expedition / raid），不改任何既有字段的结构与语义
 *  → **无需 v2→v3 结构迁移**（故这里没有对应分支）：老档缺这四个字段由 stateFromSave 补默认值，
 *    `battle`（进行中的战斗）读档一律为 null。
 *  v4：只**新增**造船队列字段（buildQueue），不改任何既有字段的结构与语义
 *  → **同样无需 v3→v4 结构迁移**：老档缺该字段由 stateFromSave 补 `[]`（队列为空 = 没有在造，
 *    与"新开局还没有船坞"的语义一致）。船坞建筑（B32–B34）与科技（T28–T36）是纯数据追加，
 *    存量的 `colony.buildings` / `colony.techState.researched` 原样可读。
 *  v5：掠夺改成两段窗口（用户 2026-08 裁定），`raid` 只**新增** arrivedTurns / arrived 两个字段
 *  → **同样无需 v4→v5 结构迁移**：老档缺这两项由 stateFromSave 兜底成 0 / false，
 *    读出来即"没有掠夺在途"（idle），不会给旧档凭空补一场掠夺。
 *  v6：新增已打败的老巢账本 `defeatedLairs`（用户 2026-08 裁定：老巢打光后掠夺队改名「海盗残兵」）
 *  → **同样无需 v5→v6 结构迁移**：老档缺该字段由 stateFromSave 兜底成 `[]`，
 *    读出来即"一个老巢都没打败"（掠夺队仍叫「海盗旗舰（掠夺队）」、掠夺照常可触发）。
 *  v7：新增掠夺战利品快照 `lastRaidReward`（用户 2026-08 裁定「把奖励显著地显示出来」）
 *  → **同样无需 v6→v7 结构迁移**：老档缺该字段由 stateFromSave 兜底成 `null`（没有可显示的战利品），
 *    不给旧档凭空补一条战利品文案。 */
export function migrateSave(loaded: GameState): GameState {
  // 兼容旧存档：补充破产/饥荒/叛乱字段（这几个字段不在 stateFromSave 的清单里，故仍需在此兜底）
  if (loaded.ships) {
    loaded.ships = loaded.ships.map((s: Mothership) => ({
      ...s,
      bankruptTimer: s.bankruptTimer || 0,
      famineTimer: s.famineTimer || 0,
      isRebellion: s.isRebellion || false,
      colony: s.colony ? {
        ...s.colony,
        recruitedThisTurn: s.colony.recruitedThisTurn || 0,
        expeditionEndings: s.colony.expeditionEndings || {},
        // 图鉴的阶段图集与降落图格只收录走过的；旧档没有该字段时，用**进行中那一轮**的 history 回填
        // （history 非空说明已降落过，故补一个 'planet'；已收尾的旧轮次没有 history，只能从本次更新后重新累计）
        expeditionVisited: s.colony.expeditionVisited
          || (s.colony.expedition
            ? { [s.colony.expedition.leaderId]: [...((s.colony.expedition.history || []).length ? ['planet'] : []), ...(s.colony.expedition.history || [])] }
            : {}),
        expeditionUnlocks: s.colony.expeditionUnlocks || [],
        blackoutGuardTurns: s.colony.blackoutGuardTurns || 0,
        // v2：殖民地不再有 selecting 阶段（星球在星图上确定）。
        // 旧档若停在 selecting，退回建设期并在下一回合按随机星球建成。
        ...((s.colony.phase as string) === 'selecting'
          ? {
              phase: 'scouting' as const,
              scoutTurnsRemaining: 1,
              planetType: s.colony.planetType || 'terran' as const,
            }
          : {}),
      } : s.colony,
    }));
  }
  return loaded;
}
