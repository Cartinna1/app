# 航空生涯之旅 · 代码修改准则（附录）

> 本文是 `AGENTS.md` 的附录（第十节）。**改战斗 / 数值 / 存档 / 星图之前必须一并阅读。**
> 正文（§〇–§九）在 `AGENTS.md`；本文收录第十节全文（唯一真值表、10.1 修过的坑、10.2 口径、10.3 魔法数、10.4 未做项）。

---

## 十、2026-08 全代码自检：新增/变更的唯一真值

> 自检结论一律记入本文档，不另建报告文件。下表每条都可用 `src/` 全库 grep 复现：符号出现次数应与"唯一位置"一一对应（除数据结构声明、类型注释与真值定义本身）。改相关逻辑必须从它们取值，别在 hook/UI 里再写一份。

| 逻辑 | 唯一位置 |
|---|---|
| 资源兑换价（合金 1200 / 食物 800 / 1 星尘→5 合金 / 1 合金→2 食物 / 1 星尘→20 食物） | `data/exchangeRates.ts` |
| 星尘集市价格与效果（随机原料 4、兑换金币 2、刷新政策 15、售价加成 8/15 与 5 回合） | `data/exchangeRates.ts` → `STARDUST_SHOP`（UI 条目表只留图标/配色，数值从这里读） |
| 投资与黑市倍率（固定 8000 金币→+1 声望、每回合 10 次；黑市默认 3.2、浮动 1.3） | `data/exchangeRates.ts` → `INVEST_GOLD_PER_REP` / `INVEST_MAX_PER_TURN` / `BLACK_MARKET_DEFAULT` / `BLACK_MARKET_SPREAD` |
| 股票买卖手续费 | `data/gameData.ts` → `getStockFeeMult`（买入）/ `getStockSellFeeMult`（卖出），费率由同一个 `STOCK_FEE_RATE=0.03` 派生（黄金集团 0、万众一心减半 = 0.985）。**显示侧禁止再用 `2 − 买入费率` 反推卖出倍率**（会得到 1.015，与实收差 4.6%） |
| 股票 T+1 冷却 | `hooks/useStock.ts` → `isStockCooling(buyTurn, turn)` / `getStockCooldownHint`（结算 + 桌面/移动面板共用） |
| 金币流水写入与上限 | `lib/turn/goldLog.ts` → `pushGoldLog(ship, turn, amount, reason)`（内部裁到 `GOLD_LOG_LIMIT=200`）。**调用前必须已经改完金币**（函数读当前金币作为 balanceAfter） |
| 事件日志上限 | `data/gameData.ts` → `EVENT_LOG_LIMIT=100`（reducer 与 useTurn 的回合日志都按它裁剪） |
| 破产/饥荒倒计时 | `lib/turn/shipTurn.ts` → `BANKRUPT_TURNS` / `FAMINE_TURNS`（=10） |
| 领袖容量基数与科技加成 | `data/colony/leaders.ts` → `LEADER_CAP_BASE=3`；科技加成读 `techs.ts` 的 `leaderCapBonus` 字段（**勿再按 T23/T24 硬编码**） |
| 停电保护与停电判定 | `lib/colony/colonyTurn.ts` → `resolveBlackout(colony, projectedEnergy, hasProtection, span)`（结算写回计数，`nextTurnHints` 用同一次调用做预告） |
| 建筑返还（取消/拆除） | `lib/colony/costs.ts` → `getBuildingRefundProfile(def, colony)`：按**实付成本**×0.4 金币 / ×0.7 合金与原料 |
| 建筑人口上限 / 克隆中心间隔 | `BuildingDef.popCapBonus`（B1=5 / B2=20）+ `planets.buffs.housingCapDelta`（遗落 B1 +3）/ `BuildingDef.cloneInterval`（B28=2） |
| 建筑效果描述 | `data/colony/buildings.ts` → `getBuildingEffect`（科技解锁提示与建筑卡片共用；`ColonyPanel` 里那份 `getOutputDesc` 已删除） |
| 手动装置的消耗/产出 | `ModuleDefinition.manualCost` / `manualGain`（结算走 `resourceCost` 的 `firstMissing`/`payCost`，面板置灰读同一字段） |
| 原料购买成本 | `data/modules.ts` → `getMaterialBuyCost`（末尾一次 round；实扣与面板显示/置灰共用） |
| 产品卖出单价 | `data/modules.ts` → `getProductSellUnitPrice` |
| 产品保质期与过期回合 | `data/modules.ts` → `PRODUCT_SHELF_LIFE` / `RESERVE_BAY_EXPIRY_BONUS` / `getProductExpiry(turn, installedModuleIds)`（立即完成与队列完成两条路径共用） |
| 产品原料成本快照 | `data/modules.ts` → `computeProductMaterialCost(recipe, materials)`（入库记账与面板展示共用） |
| 「还剩几回合」 | `lib/turn/expiry.ts` → `getTurnsUntil(turn, expiresAt)`；合同用 `lib/turn/contracts.ts` → `getContractRemainingTurns(contract, turn)` |
| buff 连乘倍率 | `lib/turn/factionTurn.ts` → `getBuffMultiplier(list)` |
| 市场库存/需求区间 | `lib/turn/factionTurn.ts` → `rollMarketBuyStock()`（500~800）/ `rollMarketSellDemand()`（500~700）——**开局（SELECT_SHIP）与每回合刷新共用同一套** |
| 奇观阶段投入 | `data/colony/wonders.ts` → `toStageCost(stage)`（11 个扁平字段 → cost 对象），校验/扣减走 `resourceCost`，面板显示同源 |
| 免费人口 | `lib/colony/colonyTurn.ts` → `getFreePopGains(colony, turn)`（结算与「下一回合预告」共用，含人口上限钳制） |
| 远征付费层 | `lib/colony/expeditionTurn.ts` → `isPaidStage(stage)`（B/C/D = 3~5） |
| 走私成功率 | `lib/turn/contracts.ts` → `SMUGGLING_SUCCESS_RATE=0.65`（贸易面板给出口） |
| 原料 id 全集 | `data/materialNames.ts` → `ALL_MATERIAL_IDS` / `BASIC_MATERIAL_IDS` |
| 唯一 id 生成 | `lib/id.ts` → `createUid(prefix)`（建筑/生产/贷款/事件日志/考古日志）。**有意保留的例外**：合同 id `c_回合_势力_序号`（自解释、可定位）与遗落星球赠品 `B7_ruin_1` 等初始化字面量 |
| 总资产百分比收益 / 随机原料数量 / 动态收益清单 | `lib/turn/shipIncome.ts` → `ASSET_INCOME_PCT` / `getAssetPercentIncome` / `DYNAMIC_INCOME_AMOUNTS` / `getDynamicIncomeLines(ship, assets)`（总览文案与结算同源；金币类显示前套 `famineHalveGold`） |
| 读档字段归一化（`galaxy` 子字段兜底） | `lib/save.ts` → `stateFromSave`（**唯一**归一化点：先铺完整 `createGalaxyState(...)` 再覆盖存档字段，末尾单独兜 `archaeology`）。两个 LOAD_SAVE 入口（`useSave.loadSave` / `importSave`）都经过它；`migrateSave` 只做结构/语义改写（`selecting→scouting`、`expeditionVisited` 回填），**勿再加第二处字段级兜底**（死代码，判空永不成立） |

### 10.1 本轮修掉的坑（对应第九节坑表的补充）

| 坑 | 根因 | 防线 |
|---|---|---|
| 极地星球科研回合数"说 3 回合、实际 2 回合" | 动作层提示与面板进度分母读 `tech.researchTurns` 原值，而结算与预告走 `getResearchTargetTurns`（极地 −1） | 全部改读 `colonyTurn.getResearchTargetTurns`（`useColonyResearch` + `ColonyPanel` 三处）。**先问结算那边算的是哪个函数** |
| 停电预告撒谎（保护计数耗尽那一回合） | 预告只判"有没有保护"，不读保护**计数**；结算在计数递减到 0 的那回合会真的停电 | 判定抽成 `colonyTurn.resolveBlackout`，结算与预告共用。**"有没有保护"和"还剩几次"是两件事** |
| 加 import 重复 import 同一符号（TS2300） | 追加符号时文件下方原本已有一行等价 import | 加 import 前 grep 该文件是否已有同一模块的 import；改完检出重复绑定 |
| **出征"回合结束后没开战、界面也没有开战入口"**（2026-08 用户报，1 回合的卡尔戈出征；与 P7 掠夺同一类根因） | `useTurn` 读的是 TICK **之前**的快照，于是 `readyExpedition(state, afterTick=true)` 用"猜一位"（`turnsRemaining <= 1`）代替"已抵达"；TICK 的算式还散在 reducer 里（lib 没有投影函数）。猜一位 = 把抵达判定押在「TICK 与 START_BATTLE 必须同批且真的被派发」上；界面同时因为 `expeditionEtaText` 没有下限而渲染「还有 0 回合抵达」 | `lib/battle/expedition.ts` → **`tickExpedition`（TICK 唯一真值，reducer 与 useTurn 投影共用）/ `expeditionArrived`（`turnsRemaining <= 0`，只看状态）/ `readyExpedition(state)`（删掉 `afterTick` 参数）/ `expeditionView`（界面唯一出口，`turnsRemaining` 显示下限 1）**；`useTurn` 先投影 `tickExpedition`/`tickRaid` 再判；`expeditionEtaText` 内部 `Math.max(1, n)`。断言钉在 check-battle-expedition.cjs 的 [3b]/[3c]/[3d]（投影与 reducer 逐字段一致 / 1 回合出征当回合开战 / 绝不出现「还有 0 回合抵达」/ 与掠夺同时归零两条都对） |
| **"手动点点不了"（点了没反应）**（2026-08 用户报：自动战斗一切正常、手动部署与攻击全无反应） | **组件点击闸门与 DEMO 的"整块棋盘委托"语义分叉**：`BoardSide` 的 `onClick` 首行是 `if (!s.clickable) return`，而 `boardView` 当时只把「待选择候选」与「BOSS 侧合法目标」标成 `clickable` → 玩家侧空格/战舰的 `clickable` **恒假**，手动第一跳就被拦在组件里（reducer / 引擎 / action 派发全是好的）；自动战斗走 `useEffect → sysAction` 直接派发、绕过闸门 → "自动能跑、手动全死"。⚠ 空格当时 `tone='can'` 已高亮（视觉对但点不动），更迷惑 | `lib/battle/view.ts` 的 `boardView`：`clickable` 是**"点得动"**而非视觉分类（tone 只管配色）——己方空格在「已选卡牌 + 玩家回合 + 无 pending」为 true，己方战舰在「玩家回合 + 无 pending」一律 true（**含不能攻击的**，否则信息条说不出"为什么不能攻击"），pending 下己方仍恒 false（铁律③）。断言 = `check-battle-view.cjs` 的 **[3b] 手动操作链** |
| **`useTurn.nextTurn` 的 useCallback 闭包陈旧**（2026-08 用户二次报障：真实存档与测试存档都一样；用户原话"我已经推进了好几个回合了，战斗在哪里"） | 它读状态参数（原名 `_gameState`，看起来像未使用参数），依赖数组却是 `[dispatch, fluctuatePrices, autoSave]` —— 三个引用都稳定 → `useCallback` 永不重建 → 闭包里**永远是首帧状态**（见第三节同名行）。于是 `readyExpedition(投影)` 恒 null、`shouldStartRaid(roll, …)` 恒 false；而 `TICK_BATTLE_STATE` 不读状态、照常派发，倒计时照样减到 **0** 并停在那里，界面又按下限 1 显示 → 看起来就是"一格都没动"。⚠ 两处误导性表象：**① 回合数照加**，所以"守卫把结束回合静默吞了"的推断是错的；**② 显示是 1 而不是 2**，证明 TICK 其实落库了，"TICK 没到 reducer"的推断也是错的 | `hooks/useTurn.ts` → 读状态一律走 `stateRef.current`（每次渲染刷新，**结构性**保证读最新状态，与 `useStableActions` 同一套做法），依赖数组同时保留 `gameState` 把契约写显式；派发计划抽成 `hooks/battleTurnPlan.ts` → `planBattleTurn(state)`（纯函数、不吃随机数），让脚本能用**真实 reducer** 回放整批派发；UI 侧 `endTurnView` 给静默 return 一个可见出口（按钮换「回到战斗」+ 原因）。断言钉在 `check-battle-expedition.cjs` 的 [3f]：结构断言（原生 dispatch / 无 `_gameState` / `stateRef` 刷新 / 依赖含 gameState / 守卫在第一个 dispatch 前）+ 行为回放（倒计时递减、阶段 A 归零转 B、出征归零自动开战、battle 非空时状态逐字段不变且有原因）+ **反向复现**（计划若吃首帧状态则倒计时归零却永不转段） |
| **「上了一艘战舰后指挥度还剩 2/4，却再也上不了任何卡」+ 底部写着「（自动战斗）正在替你行动…」而按钮是「自动战斗」（= 没开自动）**（2026-08 用户截图实证） | 移植时**新加了 DEMO 没有的组件态 `busy`**（"这一跳已派发出去、等状态回来"的节奏位），并把它同时当成 ① 输入闸门（`if (battle.over \|\| busy \|\| battle.active !== 'player') return;`）② 底部文案的分支条件 ③「结束回合」的禁用条件。而 `setBusy(false)` **只写在两条自动推进的 effect 里**（BOSS 回合结束 / 自动战斗出手）→ 玩家在自己回合手动部署一次就 `setBusy(true)`，部署是回合内动作（`active` 仍是 player）、BOSS effect 不触发 → **没有任何代码清它**：之后点谁都被静默吞掉，底部还渲染成"自动战斗正在替你行动"。⚠ 同一形状第三次出现：**同一个值派生了多份判定**（`boardView.clickable` 恒假、机库改名读 `canEdit`）—— 且这一次是"组件态 vs 状态不同源"，脚本够不到、只能靠静态断言钉住 | `lib/battle/view.ts` → **`manualActionView(st, auto)`**（`{ canAct, reason, autoHint }`）："此刻谁在操作"的**唯一真值**。手动输入闸门（`onPoolClick` / `onPlayerSlot` / `onBossTarget` / `endTurn` / `tryResolvePending`）、底部文案、自动提示**五处全读它**；**组件里的 `busy` 整个删除**（组件不再持有任何"谁在行动"的状态）。口径：`canAct = 未结束 && !auto && 无 pending && active==='player'`；被拦时 `reason` **必须非空**（点了没反应是最坏结果）；`autoHint` **未开自动时恒为空串**（渲染串不许撒谎）。断言 = 新增的 `scripts/check-battle-manual.cjs`（静态：代码里不许再有 `busy`／「正在替你行动」只许来自 lib／4 个处理器第一步都读 `manual.canAct`；行为：部署 2 费后指挥度 2/4 那一帧 `canAct` 仍为 true、`autoHint` 为空、`endTurn` 后回到玩家 `canAct` 恢复 true；反向：开自动时 `canAct=false` 且给原因、BOSS 回合/待选择/结束时 `autoHint` 都为空） |
| **灰卡（指挥度不足）点不动 → 该卡的技能在手机上无处可看**（2026-08 用户实测：可上的卡 ✓ 能选中看技能；灰卡 ✗ 只弹一句原因、选不中） | **「能不能读它」与「能不能出它」被合成一个值**：`FleetPool` 把 `playable=false` 的卡设成 `cursor-not-allowed`，`onPoolClick` 首行 `if (!card.playable) { hint(...); return; }` 直接 return → 灰卡永远选不中、信息条永远不显示它的技能；而卡面的 `title` 是**桌面专属的悬浮提示**（手机没有 hover）→ 那张卡的技能在全游戏里**没有任何出口**（铁律①说信息条才是手机端唯一出口） | `lib/battle/view.ts` 的 `CardView` 拆成两个字段：**`selectable`（能不能读 = `!over && active==='player'`，与费用/空位无关）** 与 **`playable`（能不能出 = `canDeploy`）**；`FleetPool` 的 `cursor-pointer` 读 `selectable`、`opacity` 读 `playable`（灰只是"出不去"的视觉，照旧可点）；`onPoolClick` 只过 `manual.canAct` 闸门并**照样选中**（灰卡顺带 flash 一句原因），**出不去改在"点空格部署"那一步拦**并给同一句「指挥度不够（需要 X，现有 Y）」。顺带修掉 `FleetPool` 对已是缩略图路径的 `artSrc` **再套一层 `getThumbPath`** 的重复拼接。断言 = `check-battle-view.cjs` 的 **[3c]**（灰卡 `selectable===true && playable===false`、信息条给出技能全文、`deploy` 被拦且原因非空、可出的卡两个都为 true、模板不许读 `playable` 决定能不能点、不许再套 `getThumbPath`） |

### 10.2 口径补充

- **机库（P6）的四条铁律**：① **技能不上卡面**，机库在标签栏下方留一块**技能详情固定区域**（点选一张卡读全文与数值）——手机端没有 hover，这是机库看技能的唯一出口。拆成四个内部标签后（总览 / 卡库 / 船坞 / 编队），它与「编入当前舰队」操作条一起**在能点卡的三个标签（卡库 / 船坞 / 编队）里渲染同一份**（总览不点卡，故不渲染）；② **动作不可用必须写明原因**（文案来自 `lib/battle/hangar` 的 `reason`，不是只置灰，也不能只有 `title`）；③ **出征中的舰队要有明显标记**，且该队编成/改名/打标签/删除**全部禁用并给出同一条原因**（`canEdit=false`）；④ **卡库网格与编成清单都遍历完整数组**，不许 `slice`/`filter` 静默截断（机库最容易犯：只渲染"可编的"等于把信息藏起来）。**"测试用：填入示例舰队"按钮属卡库，在机库页签**（P8 船坞上线后连同 `DEBUG_FILL_SAMPLE_LIBRARY` 一起删）。
- **卡牌战斗的三条铁律**（都是 DEMO 踩坑换来的，改动前先读 `carddemo/README.md`）：① **信息条是手机端看技能的唯一出口**（卡面只放名字/系列·稀有度/攻盾体与费用，**技能不上卡面**）；② **攻击状态必须三重区分**（可攻击 / 已攻击 / 不能攻击+原因），且**不是这一方的回合时不显示状态**；③ **待选择时只有候选可点**（点本体无效）。
- **「能不能读它」≠「能不能出它」**（通用口径，卡牌战斗只是第一个踩到的）：**可点选（读）**与**可执行（出）**必须是两个值，**合成一个值的后果是信息在手机端彻底没有出口**（`title` 悬浮提示在触屏上等于不存在）。判据：① 一个入口"点得动"只取决于**此刻该不该让玩家操作**（不是费用/资源/上限）；② 资源/上限/条件不足一律推迟到**真正执行那一步**拦，并**写出中文原因**；③ 渲染给玩家的文字不许比状态更乐观（未开自动就不许说"正在替你行动"）。同类先例：`boardView.clickable`（点得动 ≠ 视觉分类 tone）、机库改名（按钮读 `canRenameFleet`，不是 `canEdit`）、`endTurnView`（静默 return 改成按钮换文案 + 原因）。
- **「谁在操作」这类判定不许放组件态**：组件态的库存活（`setXxx(false)`）只在某几条 effect 里，一旦那条 effect 不再触发就**永久卡死**，而且脚本够不到（`check-battle-*` 全是纯函数层）。凡是"能不能操作 / 显示什么"的判据，一律进 `lib/**` 做成纯函数模型（如 `view.manualActionView`），组件只渲染；组件里剩下的 `useState` 只许是**选择态与临时提示**（`selCard` / `selUnit` / `flash` / `auto`）。

- **黑市受迷雾约束**（`TradePanel` 黑市势力选择器）：未探明势力只显示 `?` 锁定占位，不露名称/特产/市场价——与「势力列表」同口径（`lib/galaxy/knowledge.getKnownFactionIds`）。这是第三节迷雾条目的适用面，不是例外。
- **饥荒减半（`famineHalveGold`）消费点补齐**：除股息/誊录仪/招财猫/投资收益/打探/事件外，还有**声望被动收入**（`factionTurn.applyPassiveIncome`）与**量子生物反应器转化**（`useModule`，文案标注"（饥荒减半）"）。**新增任何金币收益都要问一句"饥荒时该不该减半"**。
- **旧投资系统已退役**：`invested` 不再有写入点（读档时一次性折成声望后清零），`shipTurn` 的"投资收益/档位6补给"分支与总览的投资区块已删除；投资回报统一走 `REPUTATION_TIERS` 被动收入与买价折扣。

### 10.3 本轮登记的单点魔法数（改前先出前后对比表）

政策时长 3~5 回合（`factionTurn`）、合同档位表 `[16, 26, 30000, 40000]`（`contracts.ts`）、声望阈值表（`factions.REPUTATION_TIERS`）、`RECRUIT_BASE_COST=2000`、`BLACKOUT_GUARD_TURNS=10`、`PRODUCT_SHELF_LIFE=3`、市场区间 500~800 / 500~700、股票费率 3%（万众一心 1.5%、黄金集团 0）、`EXPEDITION_UNLOCK_COUNT=12`、`GOLD_LOG_LIMIT=200` / `EVENT_LOG_LIMIT=100`、考古成功率常数（第七节）。

**掠夺循环（P7，全部在 `lib/battle/raid.ts`）**：触发概率 `RAID_CHANCE=0.08`、预警窗口 `RAID_WARNING_TURNS=5`（§10.2 原文「5 回合后掠夺成功」）、**抵达后待战窗口 `RAID_ARRIVED_TURNS=5`（2026-08 用户口径；与前者语义不同、故意分成两个常量）**、免疫 `RAID_IMMUNE_TURNS=20`、触发门槛 `RAID_MIN_SHIPS=10`（卡库战舰数）、1-2 支的 `RAID_SQUAD_SPLIT=0.5`、防守合并池上限 `RAID_POOL_CAP = BATTLE_TUNING.fleetSize(30)`（§10.2 未给上限，取 §10.1 编制上限锚点）。
**掠夺队三条裁定（用户 2026-08，优先于 §10.2 原文）**：
① **掠夺队永远存在** —— §10.2 的「从尚未被打败的海盗星系里取（全部打败后不再有掠夺）」**不再实现**（"星际海盗不可能打光"）：`shouldStartRaid` 的四个条件（≥10 舰 / 有殖民地 / 没有在途掠夺 / 不在免疫期）里**没有任何一条**与老巢进度有关，**也不要再加**这道门槛。
② **老巢打光只改名「海盗残兵」** —— 新增存档字段 `defeatedLairs`（`PirateBossId[]`，**SAVE_VERSION 5 → 6**，旧档兜底 `[]` = 一个都没打败）；**写入点唯一** = `hooks/gameReducer.ts` 的 `END_BATTLE` **出征战胜利**分支（判据 = 既有的 `battle.winner === 'player'`，与发奖同一次胜负判定，**不新造一套**），幂等走 `lib/battle/raid.recordDefeatedLair`（已在账本 → 原样返回同一数组；非老巢 id 不记）。**命名唯一真值 = `lib/battle/raid.raidEnemyName(state)`**：平时「海盗旗舰（掠夺队）」（字符串取自 `PIRATE_BOSSES.raid.name`，**不另抄字面量**）、**5 个老巢全被打败后**「海盗残兵」（`RAID_REMNANT_NAME`）。⚠ 判据**数据驱动**：`LAIR_BOSS_IDS_FROM_NODES` = `GALAXY_NODES` 里带 `pirateLair` 标记的节点（**不硬编码 5**）。⚠ **大厅与战场同一份**：大厅卡片 `raidCardView(state).enemyName`（标题行 / 预告行都用它）与战斗界面 BOSS 面板（BattleTab 下发 `raidCard.enemyName` → BattleScreen → BossPanel 的 `nameOverride`）读同一个函数，**组件里不许再写一份名字规则**。引擎自己的战况日志（`BOSS：<名字>`）仍用生成数据里的静态名（逐字对齐 DEMO，对拍脚本按它断言），不受影响。
③ **掠夺队自有卡组 15 张**（减半）且构成本身更偏低阶 —— 数据 = `data/battle/pirates.ts` 的 `RAID_POOL`（由 `scripts/export-battle-data.cjs` 从 DEMO 的 `RAID_POOL` 导出，**勿手改生成物**）；引擎只在 `bossId === 'raid'` 时用它（DEMO 与 `lib/battle/engine.ts` 是同一处分支），5 个老巢仍用 30 张的 `PIRATE_POOL`。

| 池 | 张数 | 构成 | 最高费 | 总战力 Σ(攻+盾+体) | 总费用 Σ费 | 实测下场舰数（20 seed 均值 · 新手编制） |
|---|---|---|---|---|---|---|
| 老巢 `PIRATE_POOL`（b1~b5） | 30 | r1×4 r2×3 r3×3 r4×4 r5×3 r6×3 r7×3 r8×2 r9×4 r10×1 | 6 | 216 | 85 | 30 |
| 掠夺队 `RAID_POOL` | 15 | r1×4 r2×3 r3×2 r4×3 r5×1 r6×1 r7×1 | 4 | 65 | 27 | 15 |

⚠ 两池都「用光不补充」，所以最后一列 = **玩家一局实际要打掉的敌舰数**（15 vs 30，正是"减半"）；掠夺池还砍掉了 r8 海盗头目舰 / r9 嗜血旗舰 / r10 深海阎王号（召唤 / 亡命 / 锁链+贯穿）三个强点，总战力与总费用各降到老巢池的 30% / 32%。要调只改 **DEMO 的 `RAID_POOL`** 再重跑导出与 `node scripts/check-battle.cjs`。
**掠夺损失口径（2026-08 用户裁定，优先于 §10.2 原文）**：只扣 **金币 = 持有量 20%** 与 **原料 = 各自持有 1/3（四舍五入）**，**不动星尘**（§10.2 原文含星尘，已被用户覆盖）。常量：`RAID_LOOT_GOLD_RATIO=0.2` / `RAID_LOOT_MATERIAL_RATIO=1/3`，都在 `lib/battle/raid.ts`，各自一行可改。
**船坞与科技（P8）**：三级船坞 B32/B33/B34 电力 **6 / 10 / 18**（§11 #16，从 `def.powerConsumption` 真进 `computeColonyPower`）；单舰造价基准 白 2000+20+5硅片 / 蓝 6000+100+20硅片 / 紫 15000+300+5量子簇 / 橙 50000+800+10暗物质+10量子簇；基础工期 1/2/3/4 回合；**同时建造 2 艘 + 排队无限**（§11 #5）；稀有度→船坞等级 白1/蓝2/紫3/橙3；科技 T28–T36 共 9 个（科研点 400/1200、2/3 回合）。新增存档字段 `buildQueue`（`SAVE_VERSION 3→4`）。
⚠ **「卡牌系数」是"文档无值"的占位**：V1.5 全文**没有**这一列（grep「系数」零命中）。现取 `max(0.7, round2(1 + (cost − 3) × 0.1))`，锚点是"3 费 = 1.00，正好等于 §8.3 的稀有度基准表"。要改只改这一个函数。
⚠ **每级船坞 `maxCount: 1` 也是文档没写的判断**（三级覆盖低级产出，重复建造无意义）；文档未给船坞的殖民地等级/科技前置 → 未加额外门槛。
⚠ **「船坞入驻才开工」也是"文档无值"的判断**（§8.2 只给了入驻人口列 = `BuildingDef.minPop`；§8.3 通篇没写"开工要不要入驻"）：照**既有模型**办——船坞与其它生产建筑**同口径、同字段**（`assignedPop ≥ minPop`，判据在 `economy.ts`）。唯一真值 = `lib/battle/shipyard.dockStaffGate` / `dockStaffed` / `dockStaffText`，**UI 只渲染 `canBuild` 给的 `reason`**。**口径：等级 ≥ 需要级的船坞里有一座入驻达标即可**。⚠ 入驻**不算** `lockGate.unlocked`；**没入驻 = 按钮禁用 + 一句话原因，不是卡片消失。**

**掠夺奖励与掠夺损失（`lib/battle/rewards.ts` / `lib/battle/raid.ts`）——用户 2026-08 裁定（优先于原占位）**：
① **原料 = 随机 40 个**（`RAID_REWARD_MATERIAL_AMOUNT = 40`，覆盖原占位 5；文案里的数量由该常量拼出，改它文案自动跟着变）；
② **声望只给已探明的势力** —— 候选**只**来自既有唯一真值 `lib/galaxy/knowledge.getKnownFactionIds(ship)`（与黑市 / 势力列表同雾），**不许自己写过滤**；**一个已探明势力都没有时不发声望，回退到金币**（`kind: 'gold'` + `RAID_REWARD_GOLD`，绝不发一条空奖励；旧口径「某个势力的声望 +5」已整条删除）；
③ **掠夺结算的显示出口 = 事件记录**（用户 2026-08 最终口径，原话：「是不是就相当于事件记录了，那干脆不要再战斗页签加东西了，直接放事件记录好了哇，打赢也一样。」）：
  · **战斗页签 / 战斗结算画面都不放结算行**；唯一出口 = `GameState.eventLog`（事件面板底部「事件记录」，本来就在存档清单里，上限 100 条 / 展示最近 30 条）；
  · 打赢 → `event: '掠夺战果'`、`detail = rollRaidReward(...).text`（**四类各自写明类型 + 数量**：`缴获 20000 金币` / `缴获 10 星尘` / `缴获 <原料名> ×40` / `与「<势力名>」的声望 +5`；每次只给抽中的那一类）；
  · 打输（`END_BATTLE` 防守战打输）/ 阶段 B 超时被抢（`APPLY_RAID_LOOT`，玩家什么都没做）→ `event: RAID_LOOT_EVENT`（「殖民地被掠夺」）、`detail = raidLootText(loss)`：**逐项列出实际扣到的资源与数量**（`损失 金币 20000、硅片 100、量子簇 30、黄金 40（各项以当前持有量为上限）`），**扣 0 的项不列**，什么都没扣到就给一句完整的话（`殖民地里已经没什么可抢的了…`）；
  · **同一个 `loss` 既交给 `payCost`/`pushGoldLog` 去扣、也交给 `raidLootText` 拼 detail** → **日志写的 = 账上真扣的**（AGENTS 第九节）；`raidLootLoss` 在 reducer 里**恰好 2 次**（两条失败路各一次，没有"重算一遍给显示用"）；
  · **曾经的 `lastRaidSettlement` 快照字段已整个删除**（仓库硬规矩：不留死字段）：`types/game.ts` 的字段、`SaveData` 清单、`lib/save.ts` 的 `readRaidSettlement`、`raidCardView` 的 `settlementOutcome` / `rewardAwardText` / `settlementLoot`、`BattleScreen` 的 `campaignText` / `settlement` 两个 prop 与那一块 JSX，全部清掉；`rewards.ts` 只剩 `RAID_LOOT_EVENT` / `raidLootItems`（逐项串的唯一产出口）与 `rollRaidReward().text`；
  · ⚠ **`SAVE_VERSION` 保持 8 不动**：用户机器上跑的已是 v8，本次只是**少读一个字段** → 旧档（v8 残留 `lastRaidSettlement`、v7 残留 `lastRaidReward`、v6 及更早没有）**一律照常读入**，残留键在 `stateFromSave` 里**被忽略**，不需要任何迁移分支（断言按 v6/v7/v8 三档逐一验证"不抛错 + 键被忽略 + 既有字段一字不差"）；
  · ⚠ **教训（两次返工都出在"显示位置与状态解耦"上）**：第一版把结算行塞进「殖民地掠夺」卡片 → 免疫期一过卡片消失、玩家什么都看不到（用户报障）；第二版提到卡片外的常驻行 → 用户改主意要"只留事件记录"。**结论：这类"最近一次结算"的正确归宿是事件记录（它天生持久、已在存档、不依赖任何界面分支）**，不要为它新造存档字段与常驻行。
  · 顺带修掉一条显示缺陷：掠夺事件日志原先 `event='击退海盗'` + `detail`（自带「击退海盗：」）在 EventPanel 里并排渲染成**双前缀**「击退海盗：击退海盗：缴获 …」→ 现在 `event` 用中性词**「掠夺战果」**，`detail` 仍是 `reward.text` 原句。
剩余占位：`RAID_REWARD_GOLD = 20000`（**0 已探明势力时的回退奖励也用它**）/ `RAID_REWARD_STARDUST = 10` / `RAID_REWARD_REPUTATION = 5`（四类仍等概率，§10.2 未给数值）。

### 10.4 已知未做项（有意留待）

- **掠夺队的卡池来源（已落地 → 见 10.3「掠夺队三条裁定」）**：§10.2 原文「掠夺队从尚未被打败的海盗星系里取（全部打败后不再有掠夺）」**被用户 2026-08 裁定覆盖**——掠夺队**永远存在**，并有**自己的 15 张低阶卡组**（`data/battle/pirates.ts` 的 `RAID_POOL`，不再与老巢共用 `PIRATE_POOL`）；老巢全被打败只把显示名改成「海盗残兵」（账本字段 `defeatedLairs`，`SAVE_VERSION 6`）。本条从"未做项"移出。
- `hasSave()` 仍每次渲染读一次 localStorage（改动会影响"导入存档后按钮是否立刻刷新"的交互）。
- 星球特性文案（`ColonyPanel.getBuffList`）仍是手写 14 组，与 `planets.buffs` 逐条核对一致但未数据化——**改星球数值时要同步改文案**。
- `TradePanel` 逐条 buff 行未用 `isBuffExpiringSoon` 高亮（只有势力列表徽章有）。
- `permaBonuses.getPermaBonusDef` 暂无调用方（留给将来的"永久加成图鉴"）。
