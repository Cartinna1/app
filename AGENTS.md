# 航空生涯之旅 · 代码修改准则（AGENTS.md）

> 改代码前通读本文件。只写"被验证过的事实"和"反复踩过的坑"。架构或约定变化时同步修订本文件。

---

## 〇、工作副本与验证流程（先读这条）

- **协作者不跑构建**：不执行 `npm run build` / `tsc` / `npm install`（本机没有 Node）。改完做逻辑级自检——通读改动文件、grep 核对每处符号引用与 import——构建由用户验证。
- 自检最容易漏的（都吃过构建失败）：**① 新增 hook 导出时同步它的显式返回类型接口**（如 `useEvent` 的 `UseEventReturn`，漏了报 TS2353/TS2339）；**② 删改 JSX 分支后不留未读局部变量与未用 import**（`noUnusedLocals`/`noUnusedParameters` 全开）；**③ 新增返回字段时确认消费方的返回类型是否要求额外字段**（如 `gatherIntel` 要求 `goldChange`）；**④ 数组字面量的元组推断**：`[['星球',1],['领袖',2]].map(([k,v]) => …)` 的 `v` 被推断成 `string | number` → TS2345，必须先把字面量标注成 `Array<[string, number]>` 再 map；**⑤ 重构后失去用途的参数要一并处理**：`getSpecialtySellRevenue(factionId, …)` 的 `factionId` 不再被读 → TS6133，要么删参数并同步调用点，要么前缀 `_`。
- **grep 类自检查不出类型错误**：数组 / map / 函数签名 / 新字段接进已有联合类型的改动必须人工再过一遍类型判断。
- 改动逐条过源码确认，不接受"大概没问题"。

## 一、技术栈与架构现状

- React 19 + Vite 7 + TypeScript + Tailwind 3.4 + lucide-react，包管理 npm。
- 状态管理：`useReducer`（`hooks/gameReducer.ts`）+ 业务 hook，无第三方状态库。
- UI 全部自研；shadcn/Radix 及其 `components/ui/`、`cn()` 已删除，**不要重新引入**（残留 `info.md`、`components.json` 也别按它们重建 shadcn）。
- 构建链最小：`vite.config.ts` 只用 `@vitejs/plugin-react`，**不要引入 AI 工具链插件**（曾有 `kimi-plugin-inspect-react` 会重写全部 JSX，已从 `vite.config.ts`／`package.json`／`package-lock.json` 三处移除）。

```
src/
├── components/     # UI：13 个面板（全部 memo）+ GameScreen/GameOverScreen/ShipSelection
│   ├── battle/     # 卡牌战斗 UI（BattleTab/BattleScreen/BossPanel/BoardSide/FleetPool/BattleInfoBar/GraveBar/parts，全部 memo）
│   ├── colony/     # ColonyPanel、WonderPanel
│   ├── GalaxyMapPanel.tsx    # 星图（SVG 50 节点 / 迷雾 / 缩放平移 / 只负责跃迁）
│   └── ArchaeologyPanel.tsx  # 考古（独立页签 / 阶段图片位 / 图鉴）
├── data/           # 静态数据：gameData / factions / modules / relics / materialNames
│                   #   / choiceEvents / resourceEvents / colony/ / galaxy/（nodes·lanes·archaeology·permaBonuses）
├── hooks/          # 业务 hook：gameReducer / useGameState / useTurn / useTrade / useGalaxy / useSave 等
│   └── colony/     # useColony 的 6 个子 hook（Base/Buildings/Pop/Research/Leaders/Expedition）
├── lib/            # 纯函数（无副作用、可独立测试）
│   ├── colony/     # economy.ts（产出结算）、colonyTurn.ts（回合推进）、wonderTurn.ts（奇观推进）、colonySetup.ts（建立初始化）
│   ├── galaxy/     # graph.ts（航道/最短路）、access.ts（通行与封锁）、archaeologyTurn.ts（考古推进）
│   ├── game/       # assets.ts（总资产）
│   ├── turn/       # priceFluctuation / shipTurn / factionTurn / contracts / resourceCost
│   └── save.ts     # 存档序列化 / 反序列化 / 迁移
└── types/          # 全部 TS 类型（galaxy.ts = 星图与考古）
```

## 二、代码放哪

> **页签职责边界（既定规划，勿再混装）**：「星图」**只负责跃迁**——节点/航道/迷雾/母舰位置/点节点看信息/跃迁按钮（+ 缩放平移）。操作类功能一律留在各自页签：交易·合同·黑市·打探·投资 → 「贸易」；建立殖民地 → 「殖民」；遗迹发掘 → 「考古」。**新增功能不要再往星图面板里加操作入口**（信息展示可以，操作不行）。

| 代码性质 | 位置 |
|---|---|
| 纯计算、无副作用 | `lib/` |
| 状态读写、副作用 | `hooks/` |
| 静态数据、常量表 | `data/` |
| UI | `components/` |
| 类型 | `types/` |

殖民地新功能：先判断归属哪个子 hook（`useColonyBase` / `useColonyBuildings` / `useColonyPop` / `useColonyLeaders` / `useColonyResearch`），不要堆回组合器 `useColony.ts`。

## 三、单一真值：禁止拷贝逻辑

同一计算只许存在一份，不要再种回多份拷贝。

| 逻辑 | 唯一位置 |
|---|---|
| 舰队总资产（口径：不含售价加成） | `lib/game/assets.ts` → `getShipTotalAssets` |
| 殖民地经济/电力/食物/产出 | `lib/colony/economy.ts` → `computeColonyEconomy`（含 `leaderPerTurn` 领袖特效明细、`relicPerTurn` 遗物每回合明细、`BuildingEconomyEntry.relicBonus` 遗物每座 +N、`.relicPct` 遗物百分比）/ `computeColonyPower` / `computeColonyFoodCost`。**加成百分比一律存小数**（0.15 = +15%），产出与发电同一口径。**「来源拆解」唯一真值 = `ECO_SOURCE_FIELDS`（字段→显示名一张表）+ `getBuildingSourceBreakdown(entry)`**：大总览「资源收支」、殖民地页签汇总、殖民地建筑卡片**三处都调它**（残差归「建筑」）；**新增加成字段只在这张表加一行**；**禁止 UI 手写 `e.base * e.xxxPct`**。**算值与落字段同源**：每个产出/发电分支只声明一份 `sources: Record<EcoSourceField, number>`，`applySources()` 求和算 `value` 并 `Object.assign(entry, sources)` 落明细——**新增作用点漏写就是编译错误**。⚠ 各分支对象的**插入顺序 = 历史公式的相加顺序**，改顺序可能让 `Math.ceil` 在边界差 1 |
| 殖民地回合推进、人口上限、招募上限 | `lib/colony/colonyTurn.ts` → `processColonyTurn` / `calcPopCap` / `getRecruitCapPerTurn` |
| 远征回合推进（领袖剧情树） | `lib/colony/expeditionTurn.ts` → `processExpeditionTurn`（数据在 `data/colony/expeditions.ts`，节点消耗走 cost 勿硬编码）/ `recordExpeditionEnding`（结局记账）/ `enterExpeditionHistory`（剧情回顾；与支付动作共用，幂等） |
| 奇观回合推进 | `lib/colony/wonderTurn.ts` → `processWonderTurn`（lib 层，勿放回 hooks/useWonder） |
| 游戏初始状态（新开局/重置/选船共用） | `hooks/gameReducer.ts` → `createInitialGameState`（勿在 SELECT_SHIP 另抄字段；嵌套对象由工厂新建防引用共享） |
| 单舰船回合结算、游戏结束判定 | `lib/turn/shipTurn.ts` → `processShipTurn` / `getGameOverReason` / `computeCrewFoodCost` |
| 船员食物消耗（阶梯+遗物保鲜减半） | `lib/turn/shipTurn.ts` → `computeCrewFoodCost`（结算与总览共用，勿就地重写阶梯） |
| 价格波动、市场/政策刷新、合同、被动收入 | `lib/turn/priceFluctuation.ts` / `factionTurn.ts` / `contracts.ts` |
| 合同物品名与持有量 | `lib/turn/contracts.ts` → `getContractItemName` / `getContractItemKind`（产品 vs 特产，`useTrade.completeContract` 扣货同用，**勿再写 `startsWith('p')`**）/ `getContractHeldCount`（采购数读 `ship.products`、走私读 `tradeStatus.inventory`）/ `getContractEarliestExpiry`（产品最早过期回合）——UI 勿再各写命名逻辑 |
| 星图距离与跃迁回合数（贸易折价同源） | `lib/galaxy/graph.ts` → `TURN_UNIT=80`（坐标→回合）、`shortestRoute`/`getGalaxyTurns`（Dijkstra，宿敌节点不可途经）、`MAX_ROUTE_TURNS=9`、`validateGalaxy()`；`data/factions.getDistance` 只是委托，**旧 DISTANCE_MATRIX 已删除**，勿再引回 |
| 跃迁**实际**回合数（减免后）+ 过路费方案 | `lib/galaxy/travel.ts` → `getShipTravel(ship, targetNodeId, blocked)` 返回 `ShipTravelPlan`（`route/turns` 免费方案；**没有免费路线时**才给 `tollRoute/tollTurns/hostileVia/tollGold` 付费方案）/ `applyTravelReduction` / `getTravelReduction`——口径：最短路 → 引力锚定器 −1 → 跃迁加速器（r_010）−1 → 永久加成 `travelTurnReduce` −N，各自钳到下限 1。**实扣（`useTrade.travelToNode`）与显示（星图跃迁按钮）必须共用**。贸易面板**不再显示**距离与回合（要看回合去星图） |
| 宿敌过路费（星图连通性兜底） | `lib/galaxy/access.ts` → `HOSTILE_TOLL_GOLD=20000`（每途经一处宿敌节点）/ `HOSTILE_TOLL_REP=1`（付费给该势力 +1 声望）。**规则**：仅当**不存在免费路线**时提供（星图按钮变琥珀色「付费途经（N 回合 · 过路费 X 金币）」）；**宿敌节点永远不能作为目的地**（`useTrade` 目标节点的 `checkRepBlock` 仍拦），付费只买到**途经**；每势力每回合声望上限 `applyRepChange` 的 `caps.toll=1`——否则孤立的星图与遗物永久不可达 |
| 买卖 buff 剩余回合 | `lib/turn/factionTurn.ts` → `getBuffRemainingTurns(buff, turn)`（= `expiresTurn − 当前回合`，与结算"保留 `expiresTurn >= 下一回合`"同口径）/ `summarizeBuffs(list, turn)`（连乘倍率 + 最晚到期剩余回合）/ `isBuffExpiringSoon(turnsLeft)`（≤3 回合高亮）——贸易面板「势力列表」徽章与特产区逐条显示共用，勿再写 `expiresTurn - currentTurn` |
| 星图通行与"当前势力" | `lib/galaxy/access.ts` → `HOSTILE_REP_THRESHOLD`（宿敌 −91，`useTrade.checkRepBlock` 同源）/ `getBlockedNodeIds` / `getCurrentFactionId(ship)`（停在非势力节点返回 null）/ `canEnterNode` |
| 势力信息可见性（迷雾） | `lib/galaxy/knowledge.ts` → **`isNodeDiscovered(ship, nodeId)`（"某节点是否已探明"的唯一判据；节点配图的迷雾守卫也走它）** / `getKnownFactionIds(ship)`（已探明势力 = `visitedNodes` 里的势力节点）/ `isFactionKnown` / `getKnownRelation(factionId, knownIds)`（只保留已到访的相关势力 + `hiddenCount`）/ **`getNodeDisplayName(ship, nodeId)`**（未到访 → 「未探测星系」；星图信息卡、途经/跃迁中提示、贸易面板目的地、**下一回合预告**共用）——星图信息卡与贸易面板「**势力列表**」共用，**勿再各写内联过滤** |
| 资源成本校验与扣减（远征 + 考古 + 领袖升级共用） | `lib/turn/resourceCost.ts` → `resourceAmount` / `deductResource` / `canAfford` / `firstMissing` / `payCost` / `flattenCost` / `formatCost`——科研点扣殖民地、其余扣母舰，hook 勿再各写一份 |
| 考古成功率与阶段推进 | `lib/galaxy/archaeologyTurn.ts` → `excavationSuccessRate`（唯一公式）/ `resolveStage`（阶段成败·危险·保底·**永久中止**·**抉择折扣**）/ `leaderChangeTurns`（**换驻守领袖耗时**：剩余回合 +1 但不超过「阶段基础耗时 + `FAIL_EXTRA_TURNS`」，防反复更换无限叠加）/ `processArchaeologyTurn`（由 `useTurn` 每回合调用）/ `grantReward`（遗物·永久加成·称号·资源；无殖民地时科研点按 1:10 折金币）。状态四态：`idle` / `digging` / `done` / `collapsed`（**永久封闭**，剧情与配图取 `data` 里的 `haltText`/`haltImage`，守卫在 `canOpenExcavation` + `useGalaxy` 的 4 个动作里）。**阶段小奖励折扣只在本文件算**：`抉择（稳妥 SAFE_BONUS_MULT=0.5 / 冒险 RISKY_BONUS_MULT=2）× 稳妥推进（0.5）`，**最终奖励永不折扣** |
| 殖民地建立初始化 | `lib/colony/colonySetup.ts` → `applyColonyFounding`（星球类型·初始人口·遗落星球赠送 B7/B20/B21）；由殖民面板"建立殖民地"（`foundColony`，星球类型取母舰当前所在的星图节点）触发后**立即建成**；`colonyTurn` 的 `scouting` 分支仅作**旧存档兜底**，勿在新流程里再写等待回合 |
| 考古永久加成取值 | `data/galaxy/permaBonuses.ts` → `getPermaBonusValue(ids, kind)`（foodPct/researchPct/powerPct/blackoutGuardTurns/travelTurnReduce），economy/colonyTurn/graph 勿就地判断 id |
| 母舰每回合**固定**被动收益（装置 + 遗物） | `lib/turn/shipIncome.ts` → `getShipPerTurnIncome(ship)`（返回 `{label, kind, value, phase}` 清单，`phase` 区分船员消耗前/后）/ `sumShipIncome(ship, kind)`——**结算（`processShipTurn`）与总览「资源收支」共用**。动态来源不在其中，仍由 `processShipTurn` 就地结算：誊录仪与万众一心股息（总资产 1% 金币）、深空采矿阵列/奇点探求者/奥得律斯基亚水晶（随机原料） |
| 下一回合预告（确认结束回合弹窗 + 大总览共用） | `lib/turn/nextTurnHints.ts` → `getNextTurnHints(state)`（**只读状态、不加存档字段**；返回 `{id, severity: danger/warn/info, text}`，按"会掉资源 → 会错过机会 → 进度播报"分级）。**铁律：与回合结算重复的算式一律复用结算侧的导出函数**——`computeCrewFoodCost`、`computeColonyPower` + `projectColonyEnergy`、`getContractEarliestExpiry`、`getBuildingCostProfile`、`getResearchTargetTurns`（含极地 −1）、`getRecruitCapPerTurn` / `getRecruitRollCost`；**不要在提示里重写公式**。**不预测股价/原料价波动与随机事件的抽取**；无提示时回落到 `all_quiet` 总述 |
| 特产买卖价格与收益（含黑市） | `lib/turn/tradePrice.ts` → `getSpecialtyBuyUnitPrice`（市场价 → 声望折扣/加价 → 涨价 buff → 讨价还价 AI 9 折，**分步 ceil**）/ `getSpecialtySellRevenue`（收购价 × 数量 × 反垄断 1.1 × 套利凭证 1.05 × 贸易枢纽 1.15 × 售出 buff，**末尾一次 round**）/ `getBlackMarketTotal`（末尾一次 ceil）——**结算（`useTrade`）与贸易面板显示共用**。`data/factions.ts` 只保留静态表与 `getSellPrice`/`calculateSellMultipliers`，**旧 `getBuyPrice` 已删除** |
| 饥荒（食物<0）时金币收益减半 | `lib/turn/shipTurn.ts` → `famineHalveGold(food, amount)`（非正数原样返回）——`shipTurn`（股息/誊录仪/招财猫/投资收入）、`useTrade`（打探）、`useEvent`（事件结算）与事件结果卡显示共用，勿再就地写 |
| **回合结算的调用顺序** | `hooks/useTurn.ts`（编排器，唯一权威） |
| 存档字段清单与迁移 | `lib/save.ts` |
| 原料中文名 | `data/materialNames.ts` → `MATERIAL_NAME_MAP` / `getMaterialName`（gold_ore=黄金、quantum=量子簇、silicon=硅片，禁止硬编码译名） |
| 配方生产回合数 | `data/gameData.ts` 的 `RECIPES`（`INITIAL_PRODUCTS` 不重复维护，由 `createProducts()` 派生） |
| 生产上限加成 | `data/modules.ts` → `getProductionLimitBonus` |
| 殖民地建筑「实际成本与上限」 | `lib/colony/costs.ts` → `getEffectiveMaxCount`（数量上限 = 基础 `maxCount` + 领袖 `levelExtras.buildingMaxCountBonus[建筑id]`，全数据驱动）/ `getEffectiveMaxPop`（含 popCapBonus 覆盖）/ `getBuildingCostProfile`（金币·合金·原料·工期，含星球倍率+领袖减免）/ `getRecruitCostPerPop`（招募单价）/ `RECRUIT_BASE_COST`（2000 基础价锚点）/ `getBuildingRefundProfile`（取消/拆除返还 = 实付 ×0.4 金币、×0.7 合金与原料）；人口上限唯一真值是 `BuildingDef.popCapBonus`（B1=5 / B2=20）+ `planets.buffs.housingCapDelta`（遗落星球 B1 +3）——hook 结算与 UI 显示必须同源，勿就地重算 |
| 产品卖出价加成 | `data/modules.ts` → `getSellPriceBreakdown`（母舰技能+事件套装+联盟，逻辑层与显示层共用；含 multiplier/eventPercent/skillPercent/alliancePercent） |
| 卡牌战斗**规则引擎**（逐字搬移自 `carddemo/engine.js`） | `lib/battle/engine.ts` —— **不许"顺手优化"判定顺序 / 数值 / 随机数消耗次数**；`carddemo/` 是参照实现，改战斗规则先改 DEMO 再搬 |
| 卡牌战斗**数据**（卡牌/海盗首领/编制/数值锚点） | `data/battle/*` —— **由 `scripts/export-battle-data.cjs` 从 DEMO 生成，勿手改** |
| 卡牌战斗**展示逻辑**（信息条 / 攻击状态三重区分 / 待选择时只有候选可点） | `lib/battle/view.ts`（纯函数，**不依赖 React/DOM**；组件只做渲染） |
| 出征可用性 / 出征耗时（殖民地→老巢）/ 老巢是否探明 / 战斗期间能否结束回合 | `lib/battle/expedition.ts` —— 耗时**必须**走 `lib/galaxy/graph.ts` 的 `getGalaxyTurns`（同跃迁与贸易折价，含 `MAX_ROUTE_TURNS=9` 钳制），勿自己写距离或另开不封顶的算法。**老巢展示名 = `lairDisplayName(bossId)`**（= 老巢节点的 `name`，5 个老巢统一写「海盗老巢·<BOSS 简称>」——星图信息卡只有标题位能说明"这是谁的老巢"；代价是出征卡片上 BOSS 名会出现两次，**用户知情并接受**。星图信息卡的类型标签另按 `pirateLair` 取「海盗老巢」四个字（不带名字），见 `GalaxyMapPanel.nodeLabel`；UI 不许自己写「未知星系」或去猜节点名）；**未出发的预览文案 = `travelTurnsText(state, bossId)`（「航行 N 回合」）**，**在途文案 = `expeditionEtaText(expedition.turnsRemaining)`（「还有 N 回合抵达」）** —— 舰队还在港里时写「还有 N 回合抵达」是错的（截图实证），两句话分别对应两个函数，UI 只渲染 |
| 卡牌战斗战利品（老巢 100000 金币 + 40 星尘 / 掠夺胜利的随机四类奖励） | `lib/battle/rewards.ts`（金币收益**必须过 `famineHalveGold`** 并 `pushGoldLog`）。老巢用 `battleRewards` / `grantBattleRewards`（语义与签名冻结，掠夺队恒 0/0）；掠夺胜利的随机奖励用 **`rollRaidReward` / `grantRaidReward`**（声望由 reducer 写回，数值是 §10.2 未给的占位，见 10.3） |
| 掠夺循环（触发前提「卡库 ≥10 舰 + 有殖民地」/ 8% / **两段窗口** / 20 回合免疫 / 防守合并池与池上限 / 掠夺损失 / 掠夺战编制 / 可预告 / TICK 算式） | `lib/battle/raid.ts` → `tickRaid` / `shouldStartRaid` / `raidSquadCount` / `raidPhase` / `raidStatus` / `raidResolution` / `readyRaidBattle` / `idleRaidState` / `raidDefensePool` / `raidBattleFleet` / `raidLootLoss` / `raidLootText` / `raidHintLines`（**两段窗口：A 预警 5 回合 → B 已抵达再 5 回合，B 期间玩家点「开战」才打；B 超时 = 自动失败（掠夺成功）**；A 归零**不**自动开战）——**reducer、`useTurn`、`BattleTab`、`nextTurnHints` 都只调它**，判定与数值不许在别处再写一份（`RAID_IMMUNE_TURNS` 也已从 reducer 迁到这里成为唯一真值） |
| 战斗状态字段与动作（cardLibrary / fleets / expedition / raid / battle） | `hooks/gameReducer.ts` —— 「一船同一时间只能编入一个舰队」按**份数**表达（某 cardId 已编入份数 ≤ 卡库持有份数）；永久损失也按**份**写回 |
| 机库（卡库聚合 / 舰队视图 / 编成守卫「能不能做 + 中文原因」） | `lib/battle/hangar.ts`（`libraryRows` / `fleetRows` / `fleetEditorRows` / `canAddShip` / `canRemoveShip` / `canDeleteFleet` / `canToggleDefending` / `canRenameFleet` / `hangarSummary` / **`hangarOverview`（总览标签的数字 + 船坞概况）/ `hangarGuide`（「下一步该去哪」的引导）/ `HANGAR_TAB_LABEL`（四个标签 id→中文名的唯一真值）**，纯函数、不依赖 React/DOM）。**编成份数、每队 `fleetSize` 上限、出征中的舰队不许动、`onExpedition`/`canEdit` 判定都只在这一份**：reducer 守卫与 `components/hangar/*` 的禁用提示都调它，**不许再写第二份判定**。互斥两个方向都要挡：出征中打不了防守标签（`canToggleDefending`）、带防守标签的出征不了（`expedition.canStartExpedition`） |
| 机库页签的**四个内部标签**（总览 / 卡库 / 船坞 / 编队） | `components/hangar/HangarTab.tsx` —— 标签栏照 `colony/ColonyPanel`（可点 / 当前项高亮 / 手机端横向滚动不换行，标签项固定 4 个），默认落在「总览」。`selectedCardId` 与 `selectedFleetId` 是**页签级 state**（切标签不重置）；**技能详情固定区（铁律①）与「编入当前舰队」操作条抽成 HangarTab 内的同一份**、在能点卡的三个标签（卡库 / 船坞 / 编队）里都渲染 —— 这样"在卡库选卡、切到编队再编入"这条路径不会断（**别再各标签各写一份入口**）。总览标签只读 `hangarOverview`，不点卡 |
| 战斗规则一键复验 | `scripts/check-battle.cjs`（数据校验 / 类型风险 / 未使用参数 / 静态审计 / DEMO 96 条定点断言 / 同 seed 行为对拍含完整日志 / 状态与存档 / 展示逻辑 / **出征闭环** / **机库**）—— **改战斗任何东西都要跑它** |
| 列表/网格缩略图路径 | `lib/assetThumb.ts` → `getThumbPath`（`/<dir>/<rest>/<name>.<ext>` → `/<dir>/thumbs/<rest>/<name>.webp`）——缩略图由脚本生成到 `public/<dir>/thumbs/`，**别在别处手写第二套命名** |

## 四、改 GameState 字段：存档三处同步

加/改字段时（漏一个存档字段就丢过声望）：

1. `types/game.ts` 加声明；
2. `lib/save.ts` 的 `buildSaveData` 写入（`SaveData` 是 `Pick<GameState,…>`，漏字段会编译报错——以构建报错为兜底，但别依赖它）；
3. `lib/save.ts` 的 `stateFromSave` 加读档兜底默认值；
4. 字段结构变化时在 `migrateSave` 写迁移分支（存档带 `saveVersion`，**当前为 5**：v2 把位置/跃迁从 `tradeStatus` 迁入 `ship.galaxy`；v3 加入卡牌战斗状态 `cardLibrary`/`fleets`/`expedition`/`raid`（**卡库初始为空，不赠送战舰**），`battle` **不入档**（战斗可从倒计时推导 → 读档回到战斗前）；v4 加造船队列 `buildQueue`；v5 给 `raid` 加 `arrivedTurns` / `arrived`（掠夺两段窗口，旧档兜底 = 没有掠夺在途）。旧档不做星图进度迁移，只补一份全新星图与 `titles`）。

只影响运行时、不需持久化的字段（如 `factionRepLog`）不进存档清单，但也必须在 `stateFromSave` 里给出初始值。

## 五、渲染性能纪律

- 新增/修改 action：统一进 `hooks/useGameState.ts` 的 `useStableActions` 包装，再把稳定引用传给面板。**禁止**在 App/GameScreen 里写 inline 箭头函数传给已 memo 的面板——会让 memo 失效。
- 新面板组件默认 `export default memo(...)`；props 里的空数组/空对象用模块级常量（参照 `EMPTY_REPUTATION` / `EMPTY_CONTRACTS`）。
- `shipIndex` 恒为 0（单舰队），接口已收敛，组件层不感知该参数。
- **列表/网格里的图一律走缩略图**（`lib/assetThumb.ts` → `getThumbPath`）：解码开销 = 宽×高×4 字节、**与文件大小无关**（1200×675 填 96px 格子每张白解 3 MB）。**只有「详情 / 全宽 / 大图鉴卡」位才用原图**。⚠ 缺缩略图时各面板的 `onError` 会把整块**静默隐藏**，所以**新增一类图片时先出缩略图，再改代码**（archaeology / expeditions / wonders / buildings 四类已建好 thumbs）。判断标准是「**这张图在游戏里最大的那个出口是多大**」：只有 64px 出口的图（母舰、原料图标）直接把源文件改小即可。

## 六、重构纪律（搬移代码时）

- **逐字搬移，只调 import 和编排**：抽函数/拆文件时不许"顺手优化"逻辑，逻辑改动和结构改动必须分开提交。
- 保持原调用顺序（回合结算各步骤有先后依赖）。
- 改完 grep 三查：被移走的符号无旧引用残留、新位置 import 齐全、消费方解构键与返回值一一对应。
- 同步更新指向旧位置的注释。

## 七、数值纪律

改数值前先出表格化方案（前后对比），确认后再动手，改完 grep 自检锚点。易误伤的锚点：

- `30000` 殖民解锁费用（`hooks/colony/useColonyBase.ts` 的 `UNLOCK_COST`；唯一入口是殖民面板的"建立殖民地"→ `foundColony`，星球类型由母舰当前所在的星图节点决定；随机"3 选 1 星球池"已删除）
- 星图与考古数值锚点：`lib/galaxy/graph.ts` 的 `TURN_UNIT=80`（坐标→回合，改它等于同时改跃迁与贸易折价）与 `MAX_ROUTE_TURNS=9`；`lib/galaxy/archaeologyTurn.ts` 的成功率常数（`BASE_SUCCESS_RATE=0.75`、`LEADER_LEVEL_BONUS=0.05`、`DIFFICULTY_PENALTY=0.18`、`SAFE_CHOICE_BONUS=0.10`、`RELIC_SUCCESS_BONUS=0.10`、钳制 0.15~0.90）、`HALT_CHANCE=0.02`（**每次自然失败**独立掷一次、恒 2%：命中则该遗迹永久封闭，走数据里的 `site.haltText` + `halt.webp` 剧情；触发时不再叠加本次危险结算；**「稳妥推进」保底走成功分支、不掷这一项**）、`SAFE_BONUS_MULT=0.5` / `RISKY_BONUS_MULT=2`（抉择对**阶段小奖励**的折扣；与稳妥推进的 0.5 相乘，最终奖励不折扣）、`DISCOVERY_CHANCE=0.3`、`FAIL_EXTRA_TURNS=1`、`DANGER_LOSS_RATIO=0.5`、`RESEARCH_TO_GOLD=10`，以及 `data/galaxy/archaeology.ts` 里每处遗迹的 `turns/difficulty/cost/dangerRate/haltText`（改动前先出前后对比表）
  - 成功率口径（2026 下调后）：难度0 80~90%、难度1 62~72%、难度2 44~54%、难度3 26~36%（低→高领袖等级）；42 阶段平均 51%（按各遗迹门槛等级）/ 59%（Lv3）。**改这几个常数必须重跑"逐难度成功率 + 每处遗迹被封闭的概率"**。⚠ `HALT_CHANCE` 是**单次独立**判定（恒 2%，不随次数变大）；"一处遗迹最终被封闭"是"至少中一次"（`1−(1−p)^失败次数`），蒙特卡洛实测（2 万次/遗迹）用保底平均 **6.1%**（门槛等级）/ 3.9%（Lv3+手稿），不用保底平均 9.5%，单处最高 9.4%~16.6%
- **特产卖出乘数**（`data/factions.ts`）：`DIST_SLOPE=0.05` + `DIST_QUADRATIC=0.015`（距离折价 `1+0.05d+0.015d²`）+ `MAX_SELL_MULTIPLIER=4.0`（距离×政策×波动的上限）。**必须带二次项**：纯线性会让"每回合利润"随距离单调下降（实测 dist9 只有近程的 19%）；改这两个系数前重跑"按距离分桶的每回合利润对比表"（样本 = 90 个势力对 × 10 档政策）。改动**下个回合生效**（乘数每回合算好存入 `factionSellMultipliers`），旧档自愈，无需存档迁移
- `0.4` / `0.7` 建筑取消/拆除返还：**按实付成本算**（唯一真值 `lib/colony/costs.ts` → `getBuildingRefundProfile`：金币 ×0.4、合金与原料 ×0.7；实扣走 `getBuildingCostProfile`），调用点在 `hooks/colony/useColonyBuildings.ts`。**勿按基础价算**——低造价倍率下曾可"建了立刻取消"无限套利
- **星图节点坐标**（`data/galaxy/nodes.ts`）：坐标同时决定跃迁回合数与贸易距离折价，属数值锚点。当前势力间最短路 **2~9 回合、均值 ≈5.87**（`validateGalaxy()` 的断言上限是 `MAX_ROUTE_TURNS=9`）。改坐标前先出"候选位置对比表"，候选必须核四项：与目标节点的新回合数、到最近邻居的距离、势力对 min/max/均值、**该节点其它航道回合数是否被连带改变**（只改目标航道的候选优先）；改完重跑 `validateGalaxy()` + 势力对区间 + 全图最小间距。注意四舍五入边界：`f03–f04` 曾因 119.97/80 = 1.4996 被判成 **1 回合**
  - **出征耗时也吃这条锚点（2026-08 已定口径）**：殖民地 → 海盗老巢的耗时走 `getGalaxyTurns` 的**钳制后**值（上限 9），实测 10 个殖民地取平均 = b4 6.6 / b3 6.9 / b1 6.8 / b5 8.2 / b2 8.2 回合。⚠ V1.5 §7.1 那张表登记的 7.4 / 8.0 / 9.0 / 11.4 / 11.6 是**未钳制的原始最短路**均值（已用独立算法逐位复现；b5/b2 有 8/10 个殖民地的原始距离 > 9）——**文档那两个 11.x 在游戏里不会出现，这是有意接受的**：出征是真实跃迁，若另开一套不封顶的算法就会出现"星图说 9 回合、出征说 16 回合"。**不要再为了对齐文档去改这张图、`MAX_ROUTE_TURNS` 或 `pirateLair` 的挂点。**
- **领袖升级费用**（唯一真值：`data/colony/leaders.ts` 的 `LEADER_UPGRADE_COST` / `getLeaderUpgradeCost`，是 **cost 对象**：**Lv1→2 = 50,000 金币，Lv2→3 = 150 合金**；UI 与 hook 均从该处取，校验/扣减走 `lib/turn/resourceCost` 的 `firstMissing`/`canAfford`/`payCost`，勿就地硬编码数字或另写扣费）
- **开启远征费用**（`data/colony/expeditions.ts` 的 `EXPEDITION_COST`，cost 对象：**20,000 金币 + 50 合金**；同样走 `firstMissing`/`payCost`；`startExpedition` **没有领袖等级门槛**，Lv3 只跟终极技能解锁有关）
- 招募领袖星尘费（基础 10，减领袖 `leaderCostReduction`，下限 1；唯一真值：`data/colony/leaders.ts` 的 `getRecruitRollCost`；UI 与 `useColonyLeaders` 均从该处取，勿就地硬编码）
- 走私合同成功率 65%（`roll > 0.65` 失败；持有遗物 `RELIC_DECIPHERER` 情报破译器时 100% 成功；判定在 `useTrade.ts completeContract`）
- 遗物 ID 一律走 `data/relics.ts` 常量（`RELIC_*`），逻辑层勿硬编码 `'r_xxx'` 字符串
- 兑换码表 `REDEEM_CODES`（`data/gameData.ts`，30 组正常码，无调试码——不要加回 DEBUG 码）
- 远征录入规则（`data/colony/expeditions.ts`）：A 节点全免费（忽略文档 A 的条件）；文档「人口×N」统一改为合金×50；D 结局统一金币×20000；文本一律用模板字符串（反引号）防 ASCII 引号截断；树结构 A×3→B×2→C×2→D×1，可跑 `validateExpeditionTree()` 自检；图片 `/expeditions/<leaderId>/{planet,A1~A3,B1~B6,C1~C12,D1..D12,H*}.webp`（统一 WebP；**阶段图按节点编号命名**，每位领袖 21 张：A1~A3 / B1~B6 / C1~C12，结局图为 D1~D12）；**「图鉴」的阶段图集与降落图格只收录走过的**：跨远征累计在 `colony.expeditionVisited`（领袖 → 节点 id，降落记为 `'planet'`），写入点唯一是 `lib/colony/expeditionTurn.markExpeditionVisited`（由 `enterExpeditionHistory` 与 `processExpeditionTurn` 的 case 0 调用；**写 visited 要放在 `enterExpeditionHistory` 里 history 提前 return 之前**；与每轮重置的 `expedition.history` 故意分开存，**别把 `'planet'` 塞进 history**——「回顾剧情」按 history 去 `route.nodes` 取节点，planet 不是节点），存档三处同步（`types/colony.ts` 声明 + `lib/save.ts` 读档兜底（旧档用进行中那轮的 history 回填，非空即补 `'planet'`）+ `useColonyBase` 建立殖民地初始化）；"走过"的口径 = 该节点文字已解锁（A 免费进入即算，B/C/D 支付后才算）；终极技能= Lv3 产出加成基础上叠加 `ultimateSkill.bonus`（数据驱动，勿新机制），**解锁需 12/12 结局 + 领袖达 Lv3**（`useColonyExpedition.unlockUltimate`）；`freePopEveryTurns`（每 N 回合免费 +1 人口，受上限钳制）由 L13/L15 的 Lv3 使用（4/2 回合）；**原料建筑数量上限**：12 座原料建筑基础 `maxCount: 2`，六位原料领袖（L4 石油 / L5 黄金 / L6 碳块 / L7 暗物质 / L8 量子簇 / L9 硅片）Lv2 给对应**低级**建筑 +1、Lv3 给**低级与高级各 +1**（同用 `buildingMaxCountBonus`；因 levelExtras 按当前等级取档，Lv3 必须写明低级 +1 否则升级会丢失该加成）；有建筑产出加成的领袖（L1/L2/L3/L4/L5/L6/L7/L8/L9/L11/L12）由 `economy.ts` 统一结算叠加到 Lv3 建筑上；其余按主题就地叠加：L13=克隆中心（B28）每回合人口再 +bonus（`ultimateSkill.type: 'cloneCenter'`，`colonyTurn.ts` B28 结算块消费；L13 的 `levelExtras.cloneCenterPop` 让 B28 间隔 2→1 回合并提升每回合人口），L22=电力建筑 levelBonuses（B29/B30）由 `economy.ts` 电力循环统一结算、终极再叠加 +bonus%，L14=人口上限再 +bonus（`type: 'populationCap'`，`colonyTurn.ts` calcPopCap 消费），L15=招募上限 +bonus 且人口上限 +extra.bonus（双目标：`type: 'recruitCap'` 由 getRecruitCapPerTurn 消费、`extra` 指向 populationCap），L20=领袖容量+费用减免（leaderCapBonus/leaderCostReduction），L16=居住建筑人口效果（`levelExtras.housingPopBonusPct` 50/100/150，终极 `type: 'housingPop'` 再叠加）——终极技能用 `type`（+可选 `extra`）标记消费点，取值统一走 `leaders.ts` 的 `getUltimateBonus(ld, target)`，只在对应消费点生效（populationCap/researchPerTurn/freePop/recruitCap/cloneCenter/housingPop/all/allMaterial/randomMats/powerUse 十类），勿通用叠加；L17=每回合随机原料再 +bonus（`type: 'randomMats'`，`economy.ts` 领袖特效块叠加）、L18=全部建筑产出再 +bonus%（`type: 'all'`，`economy.ts` 的 lAll 块叠加）、L19=人口上限再 +bonus（与 L14 同一消费点）、L21=电能消耗再 −bonus%（`type: 'powerUse'`，`economy.ts` 省电计算：多领袖 `powerUseReduction` 取最高值后再叠加终极，上限钳 100%）；L21/L22 电能效果已全数据化：电力建筑加成走 levelBonuses（economy 电力循环消费）、电能消耗减免走 `levelExtras.powerUseReduction`、停电免疫走 `levelExtras.blackoutImmune`——免疫为 **10 回合保护**（`colonyTurn.ts` 的 `BLACKOUT_GUARD_TURNS=10`，连续缺电计数 `colony.blackoutGuardTurns`，耗尽后仍未恢复供电则停电，中途恢复重置；存档字段三处同步：types + save.ts migrateSave 兜底 + useColonyBase 初始化），`colonyTurn.hasBlackoutImmunity` 回合判定与 UI 显示共用，UI 技能文案全数据驱动，勿再硬编码（L16 已全数据化：`housingPopBonusPct`/`b2CostReduction`/`b2FlatCap` 三个 levelExtras 字段，consumers 在 `colonyTurn.calcPopCap` 与 `useColonyBuildings` 造价计算）；**加成一律加算**：电力与食物/合金/原料等口径一致，`产出 × (1 + 各加成%之和)`（星球%+领袖%+循环%…），勿写成逐项相乘（电力曾乘算，已修正为加算）
- 远征 CG 图集（图鉴，纯欣赏与剧情无关）：远征对象加 `hiddenImages: [{id:'H1'},…]`，图片 `/expeditions/<leaderId>/<id>.webp`（如 H1..H11，WebP）；集齐 12 结局自动开放（`GalleryPanel` 判定 `list.length >= EXPEDITION_UNLOCK_COUNT`，每领袖张数自定，勿硬编码 9）；**统一只写 id，不写 title/desc（title 缺省按数组顺序自动显示 CG1/CG2/…）**；id 唯一且按序命名，无图时 `onError` 隐藏；UI 文案一律叫「CG 图集」，勿写「隐藏剧情」

## 八、命名与文案

- **考古阶段文字的收束规则**（`data/galaxy/archaeology.ts`）：**最后一阶段必须是结论，不是钩子**——正面回答该遗迹 `intro` 提出的问题，并把玩家带走的东西（遗物/永久加成）写成答案本身（"奖励即答案"，如七层碑林的「第七层手稿」、折叠回廊的「套利凭证」）。禁止在最后一阶段再抛新疑问或留白。`haltText`（永久封闭分支）也要收住，两条线别互相串味。阶段文字约 100~160 字、单行单引号字符串、**不得出现 ASCII 引号**。
- 真值函数命名 `getXxx` / `computeXxx`；避免 `import { x as y }` 别名（现存一例 `useGameState.ts` 的 `getShipTotalAssets as computeShipTotalAssets`，待清理，勿新增）。
- 原料译名一律走 `getMaterialName()`（事件/建筑的 flavor 文学描述除外）。
- **领袖显示一律用名字**：`getLeaderDef(leaderInstance.id)?.name`（如「诺娃·永昼」）。`LeaderInstance.id` 是内部编号（L1…L22），任何时候都不要直接渲染给玩家。
- **星图节点配图**（唯一真值：`lib/galaxy/nodeImage.ts` → `getNodeLandscapeImage(node, ship)`；**四类图位都要先过 `knowledge.isNodeDiscovered`**）：可殖民星球 `/planet-landscape/<星球类型id>.webp`（10 个类型：desert/ocean/polar/arid/terran/alpine/savannah/tropical/tundra/ruin，1424×800）；遗迹**复用图鉴封面** `/archaeology/<遗迹id>/cover.webp`（不另做一套图）；势力 `/faction-landscape/<势力id>.webp`（f01~f10，**已在位**，共 10 张）；海盗老巢 `/battle/lairs/<bossId>.webp`（b1~b5，**待出图**，1424×800）——**四档统一为 WebP**；星球图还有第二个出口：`ColonyPanel` 头像用 `public/planets/<类型>.webp`（**128×128 列表缩略图**，与 `planet-landscape` 大图是两套文件，别混用）；改格式只改本文件那一行；未开发（empty，且非老巢）节点无图；**未探测节点一律不返回图片**（迷雾，见第九节同名坑）。信息卡配图**宽度跟卡片走、按 16:9 完整显示**：用 `block w-full aspect-video object-cover`（高度=宽度×9/16，手机 ≈342×192、桌面 ≈1360×765；不裁切也不缩成小块）。**不要用固定 `max-h`**（图变扁带、16:9 素材被裁），也别用 `max-w` + `max-h` 成对锁比例（宽屏上只剩 462px 宽）。
- **遗迹封面（cover.webp）的三处出口**：① 考古页签·遗迹列表行左缩略图（移动端 64px / 桌面 96px 宽，16:9，缺图**整块不渲染**，用 `failedCovers` 按 siteId 记失败）；② 考古页签·选中遗迹的详情大图（`max-h-[140px] md:max-h-[220px]`，缺图按本面板约定露出占位框）；③ 考古图鉴卡片（**仅收录已全部完成**的遗迹，图鉴默认收起）。**加新图时先确认它在玩法里真的有出口**。
- **费用文案与按钮行为：现状是有意保留的，别"顺手统一"**——① 领袖页签里招募用原生数字（`{n}星尘/次`）、升级与远征用共用的 `formatCost`（渲染成 `金币×50000`，**不带千分位**；它是考古/远征节点花费共用的函数，改它会连带影响那些地方）；② 升级按钮按 `canAfford` 置灰，**远征按钮不预置灰**（只在进行中禁用，买不起时点一下由 `firstMissing` 给出"资源不足：金币不足（需要 20000）"）。差异只在风格，不影响数值与扣费正确性。
- **图鉴用「手风琴」：同一时刻只展开一位领袖**（`GalleryPanel` 的 `expandedId: string | null`）。一位领袖最多展开 **46 张图**（1 降落 + 12 结局 + ≤12 CG + 21 阶段），解码内存 **宽×高×4 字节 ≈ 3.2 MB/张（1200×675）**、与文件大小无关；改用 `Record<string, boolean>` 允许多位同时展开时，10 位全开约 460 个 `<img>`（≈56 MB 流量），低内存手机会被回收标签页。**别改回多开**。仍卡再叠加：图鉴 `<img>` 加 `loading="lazy" decoding="async"`（7 处），或网格单独出 320×180 缩略图。
- 代码用 ASCII 直引号；游戏文案用中文标点、正常中文句式，非必要不用破折号。
- **科技描述只保留引号台词**（`data/colony/techs.ts`）：格式为 `'"台词。"'`，台词后的技术说明段一律不写（循环科技的效果描述照常）。其余数据（建筑/领袖/星球）描述保持 30~60 字的单段说明。

## 九、历史坑（都修过，勿复现；下列即必须遵守的防线）

- 存档字段：加/改 GameState 字段照第四节做；**存档清单只许一处**（`lib/save.ts`：`SaveData` 写入 + `stateFromSave` 兜底）；迁移放 `stateFromSave`，别放 useSave 预填（预填 `{}` 会让判空永不成立而静默失效）。
- 交互与 dispatch：**同步可判的拦截放 dispatch 之前**（dispatch 异步，updater 里赋的值同步读不到）；updater 不许 mutate prev（返回值纯函数化，参照 `useTrade.applyRepChange`）；**新增 action 后 grep 确认真的有人 dispatch，别留死 action**（事件日志统一走 `useEvent.logEvent(event, detail)` 内部 dispatch `ADD_EVENT_LOG`；`eventLog` 上限 100 条由 reducer 控制，事件面板只展示最近 30 条，大总览那块重复展示已删除、勿加回）。
- 硬编码：生产上限乘加成走 `getProductionLimitBonus`；装置总数用 `MODULE_DEFINITIONS.length` 别写死 n/12；奇观总消耗以 `stages` 为准（Σ 资源×回合）；**新增"每回合 +X"的来源必须确认总览「资源收支」会显示它**（固定值被动收益统一在 `lib/turn/shipIncome.ts`，显示条件用"殖民地 + 母舰 > 0"，明细标来源名）。
- 来源拆解：唯一真值 `economy.getBuildingSourceBreakdown` + `ECO_SOURCE_FIELDS`，三处 UI 全读它（残差归「建筑」保证求和自洽），动态/随机来源单列「其它动态收益（不计入合计）」；**出现在 `entry.value` 公式里的每个加成变量，必须在同一分支里落成 `entry.xxxPct`**。UI 里出现 `总数 − 某一项` 或 `e.base * e.xxxPct` 就要警觉。
- 加成口径：百分比类遗物加成单列 `relicPct`（小数），**不并入** `leaderPct` / `lAll` / `lAllBonus`，明细显示「遗物+10%」；领袖槽位文案：`popCapBonus` 写「XX每座可入驻5人」，数量上限用「XX可建造+N」（`buildingMaxCountBonus`）。
- 价格与结算同源：价格公式一律进 `lib/turn/tradePrice.ts`（买价/卖价/黑市），结算与面板共用，"最大可买数量/是否买得起"也用同一单价；显示侧出现 `×1.1`／`Math.ceil` 之类价格运算时先找对应结算公式。**同一算式第二次出现时立刻抽函数**（`famineHalveGold` 四处共用，卡片显示实收值并标注「(饥荒减半)」）。
- 考古五态派生：`digging` / `idle` / `done` / `collapsed` / 无 state **五态分开**，每个状态都必须能走到"下一步动作"的入口。
- 驻守↔远征双向互斥：唯一真值 `lib/galaxy/archaeologyTurn.findStationedSite`（**`digging` 与 `idle` 都算驻守**，`done`/`collapsed` 视为已释放）；`useGalaxy.checkDigContext` 查远征、`useColonyExpedition.startExpedition` 查驻守；远征页对驻守中的领袖禁用出征并写明原因，考古页三处下拉给出禁用原因。**任何"互斥"规则都要写两个方向——只挡一边等于没挡**。
- 位置要求：**位置只在"首次开始发掘"时要求**——`checkDigContext(siteId, leaderId, requirePresence)` 仅 `startExcavation` 传 `true`；`continueExcavation` / `changeExcavationLeader`（传 `false`）/ 稳妥推进 / 中止 / 抉择**都不要求在场地**；母舰不在场时进度卡显示「考古队在驻守领袖带领下继续作业」。**判据：动作是否要求在场，看"这里是否已经有单位驻守"，而不是"当初是在哪里点的"**。
- 惩罚上限：一律**收敛成"设置到某个上限值"而不是"在原值上累加"**——`leaderChangeTurns(turnsLeft, stageTurns)` = `min(turnsLeft+1, stageTurns+FAIL_EXTRA_TURNS)`；动作层拦同一人（`st.leaderId === leaderId` → 报错不扣时），UI 下拉过滤当前驻守者。**动作里任何 `x + 1` / `x * 1.1` 惩罚，先问"连点 20 次会怎样"**。
- 结算写回：写回状态一律展开**当前**的 `ship.galaxy`（`{ ...ship.galaxy, archaeology }`），别用函数开头的快照 `g` 写回（会覆盖 `grantReward` 刚发的奖励）；缓存的 `g` 只用于读。
- 资源扣减下限：`applyDanger` 等扣减每项以"当前持有量"为上限（`Math.min(want, max(0, resourceAmount(...)))`），**金币例外**（负金币交给破产机制）；日志写明实际扣了什么。
- 风险参数要有 UI 出口：遗迹列表与进度卡显示「危险率 N%」（≥50% 琥珀色），并写明后果「触发则额外损失本阶段投入的一半（与投入相同的资源组合）」；冒险选项措辞「失败必触发意外」。**加任何影响成败/资源的风险参数时同时给它一个 UI 出口**。
- 远征结局记账：`recordExpeditionEnding`/`enterExpeditionHistory` 由支付动作与回合结算共用（幂等；history 重新赋值而非 push）；D 支付后同屏显示结局图+箴言，回合结算即收尾；`stage 6` 分支保留作**旧存档兜底**（删掉会让在途老档卡死）。
- 迷雾：`lib/galaxy/knowledge.ts` 是唯一口径，星图信息卡与贸易面板「势力列表」共用；未探明势力在贸易列表与黑市选择器只显示**占位行**（灰问号 + "跃迁抵达后揭晓"，不露名称/特产/价格/距离/关系），已探明势力的关系仍按"只显示到访过的相关势力"过滤并给出"N 条关系未知"。
- 位置真值：位置与跃迁**只**存 `ship.galaxy`（`tradeStatus` 已删这三个字段）；"当前势力"一律走 `lib/galaxy/access.getCurrentFactionId(ship)`（停在非势力节点返回 null；贸易动作先过 `requireFactionHere` 守卫，跃迁中禁止交易）。
- 跨分支入口：跨分支共用的操作抽成**一个函数**由两处调用（`GalaxyMapPanel.renderTravelAction`）；删改 JSX 分支后确认没有操作入口只活在一个分支里。
- 列表渲染：页签/入口一律遍历**完整数组**，需要分组就用显式清单，**不许 `slice(`/`filter` 静默截断**。
- 移动端底栏（结构上固定行数，别靠换行）：单行 = 左侧**钉住**「结束回合 / 音乐」（各 52px，不参与滚动）+ 右侧 17 个页签**横向滚动**（`w-14` = 56px/个，全部渲染、不许 slice）；滚动条可见（`[&::-webkit-scrollbar]:h-1.5` + track/thumb + `[scrollbar-width:thin]`）、切页签用 `scrollIntoView({inline:'center'})`、右缘渐隐仅在有内容时显示（`tabStripMoreRight`，带 2px 容差防亚像素误判）；栏高 ≈64px → 根容器 `pb-[68px] md:pb-0`，nav 自身带 `pb-[env(safe-area-inset-bottom)]` 避开 iPhone 横条。**栏高与根容器留位是配对的，改任一边都要重算**。
- 事件与股票双向隔绝（既定规划，勿再接通）：事件侧不读 `stocks`/股价、不写任何价格字段，股票侧不读事件字段与情报字段；新增市场影响一律走独立的态势/消息面机制（股票因子的唯一接入点在 `priceFluctuation` 的 `totalChange` 处）。**事件文案也不得承诺市场影响**（别写"股价将暴涨""买入后被套牢"；改写法见 `choiceEvents.ts` 的"把情报转手变现"）。
- 引号：远征/剧情等数据文本一律用模板字符串（反引号）或转义 `\'`（**ASCII 引号会截断字符串**）；录入新文本后 grep `[\u4e00-\u9fff]'[\u4e00-\u9fff]` 自检。
- import：**加 import 前先 grep 该文件是否已有同一模块的 import**；改完遍历 import 绑定检出同一文件的重复绑定（TS2300）。
- 「还剩几回合」：先问结算那边算的是哪个函数——科研统一读 `colonyTurn.getResearchTargetTurns`（含极地 −1）；**"有没有保护"和"还剩几次"是两件事**，停电判定统一走 `colonyTurn.resolveBlackout`（结算与预告共用同一次调用）。
- 迷雾必须落到函数上：`lib/galaxy/nodeImage.ts` 的 `getNodeLandscapeImage` **四类图位（星球/势力/遗迹/老巢）** 都必须先过 `lib/galaxy/knowledge.ts` 的 `isNodeDiscovered(ship, nodeId)`，未探测一律返回 `null`。**曾经四类都无条件返回路径**（星球给 `/planet-landscape/<planetId>.webp`、势力给 factionId、遗迹给 siteId）→ 未探测节点的信息卡照样渲染图片，直接泄露"这是哪类星球/哪个势力/哪处遗迹"。**判据：名字不泄露 ≠ 图片不泄露**（`getNodeDisplayName` 显示「未探测星系」的同时，配图仍把内容说了出来）。**文档里写过不等于代码里有**——本条以前只写在注释里，属"文档撒谎"；新写任何可见性规则时，先确认它有一个**被调用的函数**，再写注释。

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

### 10.1 本轮修掉的三条坑（对应第九节坑表的补充）

| 坑 | 根因 | 防线 |
|---|---|---|
| 极地星球科研回合数"说 3 回合、实际 2 回合" | 动作层提示与面板进度分母读 `tech.researchTurns` 原值，而结算与预告走 `getResearchTargetTurns`（极地 −1） | 全部改读 `colonyTurn.getResearchTargetTurns`（`useColonyResearch` + `ColonyPanel` 三处）。**先问结算那边算的是哪个函数** |
| 停电预告撒谎（保护计数耗尽那一回合） | 预告只判"有没有保护"，不读保护**计数**；结算在计数递减到 0 的那回合会真的停电 | 判定抽成 `colonyTurn.resolveBlackout`，结算与预告共用。**"有没有保护"和"还剩几次"是两件事** |
| 加 import 时重复 import 同一符号（TS2300 构建失败） | 追加符号时文件下方原本已有一行等价 import（不在替换块内） | 加 import 前先 grep 该文件是否已有同一模块的 import；改完遍历 import 绑定检出重复绑定 |

### 10.2 口径补充

- **机库（P6）的四条铁律**：① **技能不上卡面**，机库在标签栏下方留一块**技能详情固定区域**（点选一张卡读全文与数值）——手机端没有 hover，这是机库看技能的唯一出口。拆成四个内部标签后（总览 / 卡库 / 船坞 / 编队），它与「编入当前舰队」操作条一起**在能点卡的三个标签（卡库 / 船坞 / 编队）里渲染同一份**（总览不点卡，故不渲染）；② **动作不可用必须写明原因**（文案来自 `lib/battle/hangar` 的 `reason`，不是只置灰，也不能只有 `title`）；③ **出征中的舰队要有明显标记**，且该队编成/改名/打标签/删除**全部禁用并给出同一条原因**（`canEdit=false`）；④ **卡库网格与编成清单都遍历完整数组**，不许 `slice`/`filter` 静默截断（机库最容易犯：只渲染"可编的"等于把信息藏起来）。**"测试用：填入示例舰队"按钮属卡库，在机库页签**（P8 船坞上线后连同 `DEBUG_FILL_SAMPLE_LIBRARY` 一起删）。
- **卡牌战斗的三条铁律**（都是 DEMO 踩坑换来的，改动前先读 `carddemo/README.md`）：① **信息条是手机端看技能的唯一出口**（卡面只放名字/系列·稀有度/攻盾体与费用，**技能不上卡面**）；② **攻击状态必须三重区分**（可攻击 / 已攻击 / 不能攻击+原因），且**不是这一方的回合时不显示状态**；③ **待选择时只有候选可点**（点本体无效）。

- **黑市受迷雾约束**（`TradePanel` 黑市势力选择器）：未探明势力只显示 `?` 锁定占位，不露名称/特产/市场价——与「势力列表」同口径（`lib/galaxy/knowledge.getKnownFactionIds`）。这是第三节迷雾条目的适用面，不是例外。
- **饥荒减半（`famineHalveGold`）消费点补齐**：除股息/誊录仪/招财猫/投资收益/打探/事件外，还有**声望被动收入**（`factionTurn.applyPassiveIncome`）与**量子生物反应器转化**（`useModule`，文案标注"（饥荒减半）"）。**新增任何金币收益都要问一句"饥荒时该不该减半"**。
- **旧投资系统已退役**：`invested` 不再有写入点（读档时一次性折成声望后清零），`shipTurn` 的"投资收益/档位6补给"分支与总览的投资区块已删除；投资回报统一走 `REPUTATION_TIERS` 被动收入与买价折扣。

### 10.3 本轮登记的单点魔法数（改前先出前后对比表）

政策时长 3~5 回合（`factionTurn`）、合同档位表 `[16, 26, 30000, 40000]`（`contracts.ts`）、声望阈值表（`factions.REPUTATION_TIERS`）、`RECRUIT_BASE_COST=2000`、`BLACKOUT_GUARD_TURNS=10`、`PRODUCT_SHELF_LIFE=3`、市场区间 500~800 / 500~700、股票费率 3%（万众一心 1.5%、黄金集团 0）、`EXPEDITION_UNLOCK_COUNT=12`、`GOLD_LOG_LIMIT=200` / `EVENT_LOG_LIMIT=100`、考古成功率常数（第七节）。

**掠夺循环（P7，全部在 `lib/battle/raid.ts`）**：触发概率 `RAID_CHANCE=0.08`、预警窗口 `RAID_WARNING_TURNS=5`（§10.2 原文「5 回合后掠夺成功」）、**抵达后待战窗口 `RAID_ARRIVED_TURNS=5`（2026-08 用户口径；与前者语义不同、故意分成两个常量）**、免疫 `RAID_IMMUNE_TURNS=20`、触发门槛 `RAID_MIN_SHIPS=10`（卡库战舰数）、1-2 支的 `RAID_SQUAD_SPLIT=0.5`、防守合并池上限 `RAID_POOL_CAP = BATTLE_TUNING.fleetSize(30)`（§10.2 未给上限，取 §10.1 编制上限锚点）。
**掠夺损失口径（2026-08 用户裁定，优先于 §10.2 原文）**：只扣 **金币 = 持有量 20%** 与 **原料 = 各自持有 1/3（四舍五入）**，**不动星尘**（§10.2 原文含星尘，已被用户覆盖）。常量：`RAID_LOOT_GOLD_RATIO=0.2` / `RAID_LOOT_MATERIAL_RATIO=1/3`，都在 `lib/battle/raid.ts`，各自一行可改。
**船坞与科技（P8）**：三级船坞 B32/B33/B34 电力 **6 / 10 / 18**（§11 #16，从 `def.powerConsumption` 真进 `computeColonyPower`）；单舰造价基准 白 2000+20+5硅片 / 蓝 6000+100+20硅片 / 紫 15000+300+5量子簇 / 橙 50000+800+10暗物质+10量子簇；基础工期 1/2/3/4 回合；**同时建造 2 艘 + 排队无限**（§11 #5）；稀有度→船坞等级 白1/蓝2/紫3/橙3；科技 T28–T36 共 9 个（科研点 400/1200、2/3 回合）。新增存档字段 `buildQueue`（`SAVE_VERSION 3→4`）。
⚠ **「卡牌系数」是"文档无值"的占位**：V1.5 全文**没有**这一列（grep「系数」零命中）。现取 `max(0.7, round2(1 + (cost − 3) × 0.1))`，锚点是"3 费 = 1.00，正好等于 §8.3 的稀有度基准表"。要改只改这一个函数。
⚠ **每级船坞 `maxCount: 1` 也是文档没写的判断**（三级覆盖低级产出，重复建造无意义）；文档未给船坞的殖民地等级/科技前置 → 未加额外门槛。

⚠ **掠夺胜利的随机奖励数值（`lib/battle/rewards.ts`：`RAID_REWARD_GOLD=20000` / `RAID_REWARD_STARDUST=10` / `RAID_REWARD_MATERIAL_AMOUNT=5` / `RAID_REWARD_REPUTATION=5`）同样是"文档无值"的占位**（§10.2 只写"随机获得星尘 / 原料 / 金币 / 某势力声望"），占位口径写得比老巢固定战利品（100000 金币 + 40 星尘）低一档。

### 10.4 已知未做项（有意留待）

- **掠夺队的卡池来源（P7 留待 P8/P10）**：§10.2 写"掠夺队从尚未被打败的海盗星系里取（全部打败后不再有掠夺）"，但 `GameState` **没有"已打败的老巢"账本**（P5 起没建）→ 现在掠夺战与老巢共用 `PIRATE_POOL`（30 张海盗池），"所有老巢被打败后不再被掠夺"这条**尚未实现**。要落地需新增一个"已打败老巢 id"集合字段（存档三处同步），或与 P8 的船坞/科技一起做。**不要绕过 engine.ts 硬做**。
- `hasSave()` 仍每次渲染读一次 localStorage（改动会影响"导入存档后按钮是否立刻刷新"的交互）。
- 星球特性文案（`ColonyPanel.getBuffList`）仍是手写 14 组，与 `planets.buffs` 逐条核对一致但未数据化——**改星球数值时要同步改文案**。
- `TradePanel` 逐条 buff 行未用 `isBuffExpiringSoon` 高亮（只有势力列表徽章有）。
- `permaBonuses.getPermaBonusDef` 暂无调用方（留给将来的"永久加成图鉴"）。
