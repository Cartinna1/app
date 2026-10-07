# 航空生涯之旅 · 代码修改准则

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
| **回合结算的调用顺序** | `hooks/useTurn.ts`（编排器，唯一权威）；其中**战斗侧派发计划**（TICK 后的自动开战 + 掠夺转段/结算）= `hooks/battleTurnPlan.ts` → `planBattleTurn(state)`（纯函数、不吃随机数，script 可用真实 reducer 回放整批派发）。⚠ `nextTurn` 读状态**必须**走 `stateRef.current`（每次渲染刷新）—— 它原先用 `_gameState` 参数、依赖数组又漏了它，`useCallback` 永不重建（见 `AGENTS-附录.md` 10.1 末行） |
| 存档字段清单与迁移 | `lib/save.ts` |
| 原料中文名 | `data/materialNames.ts` → `MATERIAL_NAME_MAP` / `getMaterialName`（gold_ore=黄金、quantum=量子簇、silicon=硅片，禁止硬编码译名） |
| 配方生产回合数 | `data/gameData.ts` 的 `RECIPES`（`INITIAL_PRODUCTS` 不重复维护，由 `createProducts()` 派生） |
| 生产上限加成 | `data/modules.ts` → `getProductionLimitBonus` |
| 殖民地建筑「实际成本与上限」 | `lib/colony/costs.ts` → `getEffectiveMaxCount`（数量上限 = 基础 `maxCount` + 领袖 `levelExtras.buildingMaxCountBonus[建筑id]`，全数据驱动）/ `getEffectiveMaxPop`（含 popCapBonus 覆盖）/ `getBuildingCostProfile`（金币·合金·原料·工期，含星球倍率+领袖减免）/ `getRecruitCostPerPop`（招募单价）/ `RECRUIT_BASE_COST`（2000 基础价锚点）/ `getBuildingRefundProfile`（取消/拆除返还 = 实付 ×0.4 金币、×0.7 合金与原料）；人口上限唯一真值是 `BuildingDef.popCapBonus`（B1=5 / B2=20）+ `planets.buffs.housingCapDelta`（遗落星球 B1 +3）——hook 结算与 UI 显示必须同源，勿就地重算 |
| 产品卖出价加成 | `data/modules.ts` → `getSellPriceBreakdown`（母舰技能+事件套装+联盟，逻辑层与显示层共用；含 multiplier/eventPercent/skillPercent/alliancePercent） |
| 卡牌战斗**规则引擎**（逐字搬移自 `carddemo/engine.js`） | `lib/battle/engine.ts` —— **不许"顺手优化"判定顺序 / 数值 / 随机数消耗次数**；`carddemo/` 是参照实现，改战斗规则先改 DEMO 再搬 |
| 卡牌战斗**数据**（卡牌/海盗首领/编制/数值锚点） | `data/battle/*` —— **由 `scripts/export-battle-data.cjs` 从 DEMO 生成，勿手改** |
| 卡牌战斗**展示逻辑**（信息条 / 攻击状态三重区分 / 待选择时只有候选可点 / **谁在操作 + 手动闸门 + 底部文案**） | `lib/battle/view.ts`（纯函数，**不依赖 React/DOM**；组件只做渲染）。**「此刻谁在操作」唯一真值 = `manualActionView(st, auto)`**（`{ canAct, reason, autoHint }`）：手动输入闸门、底部文案、自动提示**都读它**，**组件不许再持有"谁在行动"的组件态**（曾用 `busy`，见 `AGENTS-附录.md` 10.1）。**「能不能读」与「能不能出」必须分开**：`CardView.selectable`（点开看技能全文）≠ `.playable`（= `canDeploy`）；出不去在**部署那一步**拦并给中文原因 |
| 出征（可用性 / 耗时 / 探明 / **倒计时 TICK** / **抵达即开战** / 界面模型 / 战斗期间能否结束回合） | `lib/battle/expedition.ts` —— 耗时**必须**走 `lib/galaxy/graph.ts` 的 `getGalaxyTurns`（同跃迁与贸易折价，含 `MAX_ROUTE_TURNS=9` 钳制），勿自己写距离或另开不封顶的算法。**老巢展示名 = `lairDisplayName(bossId)`**（= 老巢节点的 `name`，统一写「海盗老巢·<BOSS 简称>」；代价是出征卡片上 BOSS 名出现两次，**用户知情并接受**；星图信息卡的类型标签另按 `pirateLair` 取「海盗老巢」四个字，见 `GalaxyMapPanel.nodeLabel`；UI 不许自己写「未知星系」或去猜节点名）；**未出发预览 = `travelTurnsText(state, bossId)`（「航行 N 回合」）**，**在途文案 = `expeditionEtaText(...)`（「还有 N 回合抵达」，内部 `Math.max(1, n)` 下限 1 —— 归零那一帧起就是"到了"，界面绝不许出现「还有 0 回合抵达」）** —— 舰队还在港里时写「还有 N 回合抵达」是错的（截图实证），UI 只渲染。⚠ **出征与掠夺同一套写法**：TICK 唯一真值 = `tickExpedition`（reducer 与 `useTurn` 投影共用，不许两份算式）；**抵达判据 = `expeditionArrived`（`turnsRemaining <= 0`，只看状态）**；`readyExpedition(state)` **没有 `afterTick` 参数**（旧的"读 TICK 前状态 + 猜一位"已删除），`useTurn` 先 `tickExpedition`/`tickRaid` 投影、再从未投影结果判。**界面唯一出口 = `expeditionView(state)`**（`onExpedition`/`bossLabel`/`lairName`/`fleetName`/`turnsRemaining`（下限 1，**只在途时有意义**）/`etaText`（**已抵达时一律为空串**）/`headline`（主行文案）/`detailText`/`arrived`/**`showFightButton`（= `readyExpedition(state) !== null`）/`fightHint`（入口旁那句话；不可用时是原因）**），BattleTab 与机库状态行只读它，**UI 不许再读 `state.expedition.turnsRemaining` 原值、也不许自己判 `turnsRemaining === 0`**（那会渲染出「还有 0/N 回合抵达」死界面，用户 2026-08 二次报障）。**已抵达 + 没有战斗时的「开战」入口 = reducer 的 `START_EXPEDITION_BATTLE`**（无参 action）：`battle` 不入档 → 读档回到这一帧时这是唯一出路；判定走 `readyExpedition`（**与 useTurn 的自动开战同一份判据**，幂等）；**倒计时归零那一回合仍自动 START_BATTLE，那条不许丢**。**结束回合的可用性与原因 = `endTurnView(state)`**（`{ ok, reason }`，判据 = `canEndGameTurn`）：战斗进行中时 GameScreen 的结束回合按钮换成「回到战斗」并显示 `reason`（以前是静默 return，点了什么都没发生）。**战斗主板判据 = `battleBoard(state)`**（= `state.battle` 非空就必须整屏渲染 BattleScreen，BattleTab 因此**不再收 `battle` prop** —— prop 与 state 一旦不同源就是"战斗在内存里、界面却没有战斗"）。**结束回合的战斗派发计划 = `hooks/battleTurnPlan.ts` → `planBattleTurn(state)`**（纯函数、不吃随机数：先投影 TICK、再给出 `startBattle` 与 `raidStep`），`useTurn.nextTurn` 只执行它、不重算；抽出来是为了 check 脚本能用真实 reducer 回放整批派发 |
| 卡牌战斗战利品 / 掠夺结算的显示（老巢 100000 金币 + 40 星尘 / 掠夺胜利的随机四类奖励 / **打赢与被打劫都只在事件记录里显示**） | `lib/battle/rewards.ts`（金币收益**必须过 `famineHalveGold`** 并 `pushGoldLog`）。老巢用 `battleRewards` / `grantBattleRewards`（语义与签名冻结，掠夺队恒 0/0）；掠夺胜利的随机奖励用 **`rollRaidReward` / `grantRaidReward`**（声望由 reducer 写回）＋ **`raidLootItems`（实扣明细 → 逐项串的唯一产出口：金币→星尘→原料、扣 0 不列）/ `RAID_LOOT_EVENT`（失败那条日志的 event 名）/ `canGrantReputationReward`**；**奖励文案的唯一产出口 = `rollRaidReward` 的 `text`**。⚠ **显示出口 = 事件记录**（用户 2026-08 最终口径：「直接放事件记录好了哇，打赢也一样」）——战斗页签与战斗结算画面**都不放**结算行，**不许为此新建存档字段或常驻行**（见 `AGENTS-附录.md` 10.3） |
| 掠夺循环（触发前提「卡库 ≥10 舰 + 有殖民地」/ 8% / **两段窗口** / 20 回合免疫 / 防守合并池与池上限 / 掠夺损失 / 掠夺战编制 / 可预告 / TICK 算式） | `lib/battle/raid.ts` → `tickRaid` / `shouldStartRaid` / `raidSquadCount` / `raidPhase` / `raidStatus` / **`raidCardView`（掠夺卡片的整份渲染模型：显示哪一段 / 标题 / 正文 / 配色 / 开战按钮出不出来 + 能不能点 / 旁边那句原因 / `squadsLeft` + `outcomeText`（"这一波还剩 N 支掠夺队"那两行））** / **`raidWarningElapsed`（"阶段 A 倒计时已归零"的唯一判据）** / `raidResolution` / `readyRaidBattle` / `idleRaidState` / `raidDefensePool` / `raidBattleFleet` / `raidLootLoss` / `raidLootText`（**事件记录那条失败 detail 的唯一产出口**，逐项串复用 `rewards.raidLootItems`）/ `raidHintLines`（**A 预警 5 回合 → B 已抵达再 5 回合，B 期间玩家点「开战」才打；B 超时 = 自动失败**）/ **`raidEnemyName`（掠夺队显示名的唯一真值：平时「海盗旗舰（掠夺队）」、5 个老巢全被打败后「海盗残兵」；判据 = `GALAXY_NODES` 里带 `pirateLair` 的节点，账本字段 `defeatedLairs`，见 `AGENTS-附录.md` 10.3）**——**reducer、`useTurn`、`BattleTab`、`nextTurnHints` 都只调它**，判定与数值不许再写第二份（`RAID_IMMUNE_TURNS` 也在这里）。⚠ **转段只取决于状态本身，与派发时序无关**：阶段 A 的 `inTurns` 被 `tickRaid` 钳在 0，"本次 TICK 后归零"会先以 `inTurns: 0` 存在 —— `raidWarningElapsed` 让这一刻就成为转段信号、`raidStatus.turnsToArrival` 阶段 A 下限 1，`useTurn` 也改成先 `tickRaid` 投影再判（不再靠 `afterTick` 猜一位）。否则批边界落在 TICK 与 ARRIVE_RAID 之间就会永久卡在「还有 0 回合抵达」且没有开战按钮（2026-08 用户截图实证，与 P5 出征同类 off-by-one） |
| 战斗状态字段与动作（cardLibrary / fleets / expedition / raid / battle） | `hooks/gameReducer.ts` —— 「一船同一时间只能编入一个舰队」按**份数**表达（某 cardId 已编入份数 ≤ 卡库持有份数）；永久损失也按**份**写回 |
| 机库（卡库聚合 / 舰队视图 / 编成守卫「能不能做 + 中文原因」） | `lib/battle/hangar.ts`（`libraryRows` / `fleetRows` / `canAddShip` / `canRemoveShip` / `canDeleteFleet` / `canToggleDefending` / `canRenameFleet` / `hangarSummary` / **`hangarOverview`（总览标签的数字 + 船坞概况）/ `hangarGuide`（「下一步该去哪」的引导）/ `HANGAR_TAB_LABEL`（四个标签 id→中文名的唯一真值）**，纯函数、不依赖 React/DOM）。**编成份数、每队 `fleetSize` 上限、出征中的舰队不许动、`onExpedition`/`canEdit`/`canRename` 判定都只在这一份**：reducer 守卫与 `components/hangar/*` 都调它，**不许再写第二份**。互斥两个方向都要挡：出征中打不了防守标签（`canToggleDefending`）、带防守标签的出征不了（`expedition.canStartExpedition`）。⚠ **改名入口的可用性随渲染模型下发**：`FleetRow.canRename` / `.renameReason` = `canRenameFleet` 的结果，`FleetList` 的「改名」按钮只读它（**不是 `canEdit`**），`HangarTab.commitRename` 与 reducer 的 `RENAME_BATTLE_FLEET` 守卫也走同一个 `canRenameFleet` —— 早先按钮读 `canEdit`、提交路径各自再判一次 `isFleetOnExpedition`，同一判定两处派生，一旦分叉就是用户 2026-08 报的「改名怎么点都没反应」 |
| 机库页签的**四个内部标签**（总览 / 卡库 / 船坞 / 编队） | `components/hangar/HangarTab.tsx` —— 标签栏照 `colony/ColonyPanel`（可点 / 当前项高亮 / 手机端横向滚动不换行，标签项固定 4 个），默认落在「总览」。`selectedCardId` 与 `selectedFleetId` 是**页签级 state**（切标签不重置）；**技能详情固定区（铁律①）与「编入当前舰队」操作条抽成 HangarTab 内的同一份**、在能点卡的三个标签（卡库 / 船坞 / 编队）里都渲染 —— 这样"在卡库选卡、切到编队再编入"这条路径不会断（**别再各标签各写一份入口**）。总览标签只读 `hangarOverview`，不点卡 |
| 战斗规则一键复验 | `scripts/check-battle.cjs`（14 步：数据校验 / 类型风险 / 未使用参数 / 静态审计 / DEMO 96 条定点断言 / 同 seed 行为对拍含完整日志 / 状态与存档 / 展示逻辑 / **手动操作闸门** / **出征闭环** / **机库** / 掠夺 / 船坞 / 星图老巢）—— **改战斗任何东西都要跑它** |
| 列表/网格缩略图路径 | `lib/assetThumb.ts` → `getThumbPath`（`/<dir>/<rest>/<name>.<ext>` → `/<dir>/thumbs/<rest>/<name>.webp`）——缩略图由 **`scripts/gen-thumbs.py`** 生成到 `public/<dir>/thumbs/`（`python scripts/gen-thumbs.py` 补缺、`--force` 覆盖、`--dir`/`--width`/`--exclude` 可指定；默认目录 = archaeology / expeditions / wonders / buildings / battle/units），**别在别处手写第二套命名** |

## 四、改 GameState 字段：存档三处同步

加/改字段时（漏一个存档字段就丢过声望）：

1. `types/game.ts` 加声明；
2. `lib/save.ts` 的 `buildSaveData` 写入（`SaveData` 是 `Pick<GameState,…>`，漏字段会编译报错——以构建报错为兜底，但别依赖它）；
3. `lib/save.ts` 的 `stateFromSave` 加读档兜底默认值；
4. 字段结构变化时在 `migrateSave` 写迁移分支（存档带 `saveVersion`，**当前为 8**：v2 把位置/跃迁从 `tradeStatus` 迁入 `ship.galaxy`；v3 加入卡牌战斗状态 `cardLibrary`/`fleets`/`expedition`/`raid`（**卡库初始为空，不赠送战舰**），`battle` **不入档**（战斗可从倒计时推导 → 读档回到战斗前）；v4 加造船队列 `buildQueue`；v5 给 `raid` 加 `arrivedTurns` / `arrived`（掠夺两段窗口，旧档兜底 = 没有掠夺在途）；v6 加已打败的老巢账本 `defeatedLairs`（旧档兜底 = 空数组 = 一个都没打败，掠夺照常可触发，见 `AGENTS-附录.md` 10.3）；v7/v8 曾加过"掠夺收尾快照"（`lastRaidReward` → `lastRaidSettlement`），**该字段随后按用户最终口径整个删除**（显示出口 = 事件记录 `eventLog`，本来就在清单里）：**版本号仍停在 8**，旧档里残留的同名键在 `stateFromSave` 里**被忽略**、不需要迁移分支，见 10.3）。旧档不做星图进度迁移，只补一份全新星图与 `titles`）。

只影响运行时、不需持久化的字段（如 `factionRepLog`）不进存档清单，但也必须在 `stateFromSave` 里给出初始值。

## 五、渲染性能纪律

- 新增/修改 action：统一进 `hooks/useGameState.ts` 的 `useStableActions` 包装，再把稳定引用传给面板。**禁止**在 App/GameScreen 里写 inline 箭头函数传给已 memo 的面板——会让 memo 失效。
- 新面板组件默认 `export default memo(...)`；props 里的空数组/空对象用模块级常量（参照 `EMPTY_REPUTATION` / `EMPTY_CONTRACTS`）。
- `shipIndex` 恒为 0（单舰队），接口已收敛，组件层不感知该参数。
- **列表/网格里的图一律走缩略图**（`lib/assetThumb.ts` → `getThumbPath`）：解码开销 = 宽×高×4 字节、**与文件大小无关**（1200×675 填 96px 格子每张白解 3 MB）。**只有「详情 / 全宽 / 大图鉴卡」位才用原图**。⚠ 缺缩略图时各面板的 `onError` 会把整块**静默隐藏**，所以**新增一类图片时先出缩略图，再改代码**；缩略图统一由 **`scripts/gen-thumbs.py`** 生成（`python scripts/gen-thumbs.py` 补缺 / `--force` 覆盖 / `--dir`、`--width`、`--exclude` 指定；默认目录 = archaeology / expeditions / wonders / buildings / battle/units，默认宽度 192 / 480 / 256 / 160 / 192）。判断标准是「**这张图在游戏里最大的那个出口是多大**」：只有 64px 级出口的图（BOSS 头像 112px、母舰、原料图标）直接用原图、**不生成缩略图**（脚本里叫 `NO_THUMBS_DIRS` + `TINY_SOURCE_MAX`）。

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
  - **出征耗时也吃这条锚点（2026-08 已定口径）**：殖民地 → 海盗老巢的耗时走 `getGalaxyTurns` 的**钳制后**值（上限 9），实测 10 个殖民地取平均 = b4 6.6 / b3 6.9 / b1 6.8 / b5 8.2 / b2 8.2 回合。⚠ V1.5 §7.1 登记的 7.4 / 8.0 / 9.0 / 11.4 / 11.6 是**未钳制的原始最短路**均值（b5/b2 有 8/10 个殖民地的原始距离 > 9）——**那两个 11.x 在游戏里不会出现，这是有意接受的**：出征是真实跃迁，若另开一套不封顶的算法就会出现"星图说 9 回合、出征说 16 回合"。**不要再为了对齐文档去改这张图、`MAX_ROUTE_TURNS` 或 `pirateLair` 的挂点。**
- **领袖升级费用**（唯一真值：`data/colony/leaders.ts` 的 `LEADER_UPGRADE_COST` / `getLeaderUpgradeCost`，是 **cost 对象**：**Lv1→2 = 50,000 金币，Lv2→3 = 150 合金**；UI 与 hook 均从该处取，校验/扣减走 `lib/turn/resourceCost` 的 `firstMissing`/`canAfford`/`payCost`，勿就地硬编码数字或另写扣费）
- **开启远征费用**（`data/colony/expeditions.ts` 的 `EXPEDITION_COST`，cost 对象：**20,000 金币 + 50 合金**；同样走 `firstMissing`/`payCost`；`startExpedition` **没有领袖等级门槛**，Lv3 只跟终极技能解锁有关）
- 招募领袖星尘费（基础 10，减领袖 `leaderCostReduction`，下限 1；唯一真值：`data/colony/leaders.ts` 的 `getRecruitRollCost`；UI 与 `useColonyLeaders` 均从该处取，勿就地硬编码）
- 走私合同成功率 65%（`roll > 0.65` 失败；持有遗物 `RELIC_DECIPHERER` 情报破译器时 100% 成功；判定在 `useTrade.ts completeContract`）
- 遗物 ID 一律走 `data/relics.ts` 常量（`RELIC_*`），逻辑层勿硬编码 `'r_xxx'` 字符串
- 兑换码表 `REDEEM_CODES`（`data/gameData.ts`，30 组正常码，无调试码——不要加回 DEBUG 码）
- 远征录入规则（`data/colony/expeditions.ts`）：A 节点全免费；文档「人口×N」统一改为合金×50；D 结局统一金币×20000；文本一律用模板字符串（反引号）防 ASCII 引号截断；树结构 A×3→B×2→C×2→D×1，可跑 `validateExpeditionTree()` 自检；图片 `/expeditions/<leaderId>/{planet,A1~A3,B1~B6,C1~C12,D1..D12,H*}.webp`（统一 WebP；**阶段图按节点编号命名**，每位领袖 21 张：A1~A3 / B1~B6 / C1~C12，结局图为 D1~D12）；**「图鉴」只收录走过的**：`colony.expeditionVisited`（领袖 → 节点 id，降落记 `'planet'`），写入点唯一 = `lib/colony/expeditionTurn.markExpeditionVisited`（**写 visited 要在 `enterExpeditionHistory` 的提前 return 之前**；与 `expedition.history` 分开存，**别把 `'planet'` 塞进 history**——「回顾剧情」按 history 去 `route.nodes` 取节点），存档三处同步（`types/colony.ts` + `lib/save.ts` 兜底 + `useColonyBase` 初始化）；"走过" = 该节点文字已解锁（A 免费进入即算，B/C/D 支付后才算）；终极技能 = Lv3 产出加成上再叠 `ultimateSkill.bonus`（数据驱动，勿新机制），**解锁需 12/12 结局 + 领袖 Lv3**（`useColonyExpedition.unlockUltimate`）；**加成一律加算**：`产出 × (1 + 各加成%之和)`（星球%+领袖%+循环%…），勿逐项相乘（电力曾乘算，已修正）。⚠ **每位领袖的 `levelExtras`/`ultimateSkill` 数值与消费点（`type` + 可选 `extra`，十类：populationCap/researchPerTurn/freePop/recruitCap/cloneCenter/housingPop/all/allMaterial/randomMats/powerUse）一律读数据文件与消费点代码**（`economy.ts` / `colonyTurn.ts`），取值统一走 `leaders.ts` 的 `getUltimateBonus(ld, target)`，只在对应消费点生效、勿通用叠加。⚠ **原料建筑数量上限**：六位原料领袖 Lv2 给低级 +1、Lv3 给低级与高级各 +1（`buildingMaxCountBonus`；**Lv3 必须写明低级 +1，否则升级丢加成**）。
- 远征 CG 图集（图鉴，纯欣赏与剧情无关）：远征对象加 `hiddenImages: [{id:'H1'},…]`，图片 `/expeditions/<leaderId>/<id>.webp`（如 H1..H11，WebP）；集齐 12 结局自动开放（`GalleryPanel` 判定 `list.length >= EXPEDITION_UNLOCK_COUNT`，每领袖张数自定，勿硬编码 9）；**统一只写 id，不写 title/desc（title 缺省按数组顺序自动显示 CG1/CG2/…）**；id 唯一且按序命名，无图时 `onError` 隐藏；UI 文案一律叫「CG 图集」，勿写「隐藏剧情」

## 八、命名与文案

- **考古阶段文字的收束规则**（`data/galaxy/archaeology.ts`）：**最后一阶段必须是结论，不是钩子**——正面回答该遗迹 `intro` 提出的问题，并把玩家带走的东西（遗物/永久加成）写成答案本身（"奖励即答案"，如七层碑林的「第七层手稿」、折叠回廊的「套利凭证」）。禁止在最后一阶段再抛新疑问或留白。`haltText`（永久封闭分支）也要收住，两条线别互相串味。阶段文字约 100~160 字、单行单引号字符串、**不得出现 ASCII 引号**。
- 真值函数命名 `getXxx` / `computeXxx`；避免 `import { x as y }` 别名（现存一例 `useGameState.ts` 的 `getShipTotalAssets as computeShipTotalAssets`，待清理，勿新增）。
- 原料译名一律走 `getMaterialName()`（事件/建筑的 flavor 文学描述除外）。
- **领袖显示一律用名字**：`getLeaderDef(leaderInstance.id)?.name`（如「诺娃·永昼」）。`LeaderInstance.id` 是内部编号（L1…L22），任何时候都不要直接渲染给玩家。
- **星图节点配图**（唯一真值：`lib/galaxy/nodeImage.ts` → `getNodeLandscapeImage(node, ship)`；**四类图位都要先过 `knowledge.isNodeDiscovered`**）：可殖民星球 `/planet-landscape/<星球类型id>.webp`（10 个类型，1424×800）；遗迹**复用图鉴封面** `/archaeology/<遗迹id>/cover.webp`；势力 `/faction-landscape/<势力id>.webp`（f01~f10，**已在位**）；海盗老巢 `/battle/lairs/<bossId>.webp`（b1~b5，**待出图**）——**四档统一为 WebP**；星球图还有第二个出口：`ColonyPanel` 头像用 `public/planets/<类型>.webp`（**128×128 列表缩略图**，与 `planet-landscape` 大图是两套文件，别混用）；改格式只改本文件那一行；未开发（empty，且非老巢）节点无图；**未探测节点一律不返回图片**（迷雾，见第九节同名坑）。信息卡配图**宽度跟卡片走、按 16:9 完整显示**：用 `block w-full aspect-video object-cover`（不裁切也不缩成小块）。**不要用固定 `max-h`**（图变扁带、16:9 素材被裁），也别用 `max-w` + `max-h` 成对锁比例（宽屏上只剩 462px 宽）。
- **遗迹封面（cover.webp）的三处出口**：① 考古页签·遗迹列表行左缩略图（移动端 64px / 桌面 96px 宽，16:9，缺图**整块不渲染**，用 `failedCovers` 按 siteId 记失败）；② 考古页签·选中遗迹的详情大图（`max-h-[140px] md:max-h-[220px]`，缺图按本面板约定露出占位框）；③ 考古图鉴卡片（**仅收录已全部完成**的遗迹，图鉴默认收起）。**加新图时先确认它在玩法里真的有出口**。
- **费用文案与按钮行为：现状是有意保留的，别"顺手统一"**——① 领袖页签里招募用原生数字（`{n}星尘/次`）、升级与远征用共用的 `formatCost`（渲染成 `金币×50000`，**不带千分位**；它是考古/远征节点花费共用的函数，改它会连带影响那些地方）；② 升级按钮按 `canAfford` 置灰，**远征按钮不预置灰**（只在进行中禁用，买不起时点一下由 `firstMissing` 给出"资源不足：金币不足（需要 20000）"）。差异只在风格，不影响数值与扣费正确性。
- **图鉴用「手风琴」：同一时刻只展开一位领袖**（`GalleryPanel` 的 `expandedId: string | null`）。一位领袖最多展开 **46 张图**（1 降落 + 12 结局 + ≤12 CG + 21 阶段），解码内存 **宽×高×4 字节 ≈ 3.2 MB/张（1200×675）**、与文件大小无关；改用 `Record<string, boolean>` 允许多位同时展开时，10 位全开约 460 个 `<img>`（≈56 MB 流量），低内存手机会被回收标签页。**别改回多开**。仍卡再叠加：图鉴 `<img>` 加 `loading="lazy" decoding="async"`（7 处），或网格单独出 320×180 缩略图。
- 代码用 ASCII 直引号；游戏文案用中文标点、正常中文句式，非必要不用破折号。
- **科技描述只保留引号台词**（`data/colony/techs.ts`）：格式为 `'"台词。"'`，台词后的技术说明段一律不写（循环科技的效果描述照常）。其余数据（建筑/领袖/星球）描述保持 30~60 字的单段说明。

## 九、历史坑（都修过，勿复现；下列即必须遵守的防线）

- 存档字段：加/改 GameState 字段照第四节做；**存档清单只许一处**（`lib/save.ts`：`SaveData` 写入 + `stateFromSave` 兜底）；迁移放 `stateFromSave`，别放 useSave 预填（预填 `{}` 会让判空永不成立而静默失效）。
- 交互与 dispatch：**同步可判的拦截放 dispatch 之前**（dispatch 异步，updater 里赋的值同步读不到）；updater 不许 mutate prev（返回值纯函数化，参照 `useTrade.applyRepChange`）；**新增 action 后 grep 确认真的有人 dispatch，别留死 action**（事件日志统一走 `useEvent.logEvent(event, detail)` 内部 dispatch `ADD_EVENT_LOG`；`eventLog` 上限 100 条由 reducer 控制，事件面板只展示最近 30 条，大总览那块重复展示已删除、勿加回）。
- **「谁在操作 / 能不能点」不许放组件态**：组件态的库存活只写在某几条 effect 里（`setXxx(false)`），那条 effect 一旦不再触发就**永久卡死**，而 check 脚本全是纯函数层、够不到它。凡是"能不能操作 / 显示什么"的判据一律进 `lib/**` 做成纯函数模型（战斗 = `lib/battle/view.ts` 的 `manualActionView`，见 `AGENTS-附录.md` 10.1），组件只渲染，剩下的 `useState` 只许是选择态与临时提示。
- **「能不能读」≠「能不能出」**：可点选（读技能/看详情）与可执行（花资源做动作）**必须是两个值**，合成一个的后果是信息在手机端彻底没有出口（`title` 悬浮提示在触屏上等于不存在）。资源/条件不足一律推迟到**真正执行那一步**拦并写出中文原因。
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

## 十、唯一真值表 / 修过的坑 / 魔法数 / 未做项 → 已移到 `AGENTS-附录.md`

> **本节全文已搬到同目录的 `AGENTS-附录.md`（第十节），一个字都没删。** 那边的小节号照旧：
> **10.1** 本轮修掉的坑 ｜ **10.2** 口径补充 ｜ **10.3** 单点魔法数（改前先出前后对比表）｜ **10.4** 已知未做项。
>
> **这些时候必须去读附录**：① 改战斗、数值（含 `lib/battle/raid.ts` / `shipyard.ts` 的常量）、存档、星图；
> ② 新增任何计算/展示/文案之前，先在附录的**唯一真值表**里找它该落在哪个文件；
> ③ 动手改一个已有锚点之前，先看 10.3（魔法数）与 10.1/10.2（修过的坑与口径）。
> 正文里凡是写"见 `AGENTS-附录.md` 10.x"的地方，都指本文档附录的对应小节。

---
