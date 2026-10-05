# 航空生涯之旅 · 代码修改准则（AGENTS.md）

> 改代码前通读本文件。本文件只写"被验证过的事实"和"反复踩过的坑"，不写愿望清单。
> 架构或约定变化时，同步修订本文件。

---

## 〇、工作副本与验证流程（先读这条）

- **协作者不跑构建**：不执行 `npm run build` / `tsc` / `npm install`（本机也没有 Node 环境）。改完后做逻辑级自检——通读改动文件、grep 核对每一处符号引用与 import——构建验证由用户执行。
- 自检清单里最容易漏的（都因此吃过构建失败）：**① 新增 hook 导出时同步它的显式返回类型接口**（如 `useEvent` 的 `UseEventReturn`，漏了会报 TS2353/TS2339）；② 删改 JSX 分支后是否留下未读的局部变量与未用的 import（`noUnusedLocals`/`noUnusedParameters` 全开）；③ 新增返回字段时确认消费方的**返回类型是否要求额外字段**（如 `gatherIntel` 要求 `goldChange`）；**④ 数组字面量的元组推断**：`[['星球', 1], ['领袖', 2]].map(([k, v]) => Math.round(v))` 里的 `v` 会被推断成 `string | number` → 报 TS2345，必须先把字面量标注成 `Array<[string, number]>` 再 map（总览产出拆解曾因此报错）；**⑤ 重构后参数失去用途要一并处理**：`getSpecialtySellRevenue(factionId, …)` 里的 `factionId` 不再被读 → TS6133，要么删参数并同步所有调用点，要么前缀 `_`。
- **grep 类自检查不出类型错误**：涉及"数组 / map / 函数签名 / 新字段接进已有联合类型"的改动，必须人工再过一遍类型判断，别只靠括号与未使用符号扫描。
- 改动逐条过源码确认，不接受"大概没问题"。

## 一、技术栈与架构现状

- React 19 + Vite 7 + TypeScript + Tailwind 3.4 + lucide-react，包管理 npm。
- 状态管理：`useReducer`（`hooks/gameReducer.ts`）+ 业务 hook，无第三方状态库。
- UI 全部自研；shadcn/Radix 及其 `components/ui/`、`cn()` 工具已删除，**不要重新引入**（脚手架残留 `info.md`、`components.json` 也一并删除，别按它们重建 shadcn）。
- 构建链保持最小：`vite.config.ts` 只用 `@vitejs/plugin-react`，**不要引入 AI 工具链插件**（曾有 `kimi-plugin-inspect-react`，会重写全部 JSX，已从 `vite.config.ts`／`package.json`／`package-lock.json` 三处移除）。

```
src/
├── components/     # UI：13 个面板（全部 memo）+ GameScreen/GameOverScreen/ShipSelection
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

> **页签职责边界（既定规划，勿再混装）**：「星图」**只负责跃迁**——节点/航道/迷雾/母舰位置/点节点看信息/跃迁按钮（+ 缩放平移）。
> 操作类功能一律留在各自页签：交易·合同·黑市·打探·投资 → 「贸易」；建立殖民地 → 「殖民」；遗迹发掘 → 「考古」。
> **新增功能不要再往星图面板里加操作入口**（信息展示可以，操作不行）。历史上星图曾内嵌贸易面板与"建立殖民地"按钮，已按此原则移出。

| 代码性质 | 位置 |
|---|---|
| 纯计算、无副作用 | `lib/` |
| 状态读写、副作用 | `hooks/` |
| 静态数据、常量表 | `data/` |
| UI | `components/` |
| 类型 | `types/` |

殖民地新功能：先判断归属哪个子 hook（`useColonyBase` / `useColonyBuildings` / `useColonyPop` / `useColonyLeaders` / `useColonyResearch`），不要堆回组合器 `useColony.ts`。

## 三、单一真值：禁止拷贝逻辑

同一计算只许存在一份。历史上产出结算曾有 4 份拷贝、存档字段曾有 3 份拷贝，均已收敛——不要再种回去。

| 逻辑 | 唯一位置 |
|---|---|
| 舰队总资产（口径：不含售价加成） | `lib/game/assets.ts` → `getShipTotalAssets` |
| 殖民地经济/电力/食物/产出 | `lib/colony/economy.ts` → `computeColonyEconomy`（含 `leaderPerTurn` 领袖特效明细、`relicPerTurn` 遗物每回合明细、`BuildingEconomyEntry.relicBonus` 遗物每座 +N、`.relicPct` 遗物百分比）/ `computeColonyPower` / `computeColonyFoodCost`。**加成百分比一律存小数**（0.15 = +15%；产出与发电同一口径——发电曾存百分数，逼得 UI 两套 ×100，是漏显示的根因）。**「来源拆解」的唯一真值 = `ECO_SOURCE_FIELDS`（字段→显示名一张表）+ `getBuildingSourceBreakdown(entry)`**：大总览「资源收支」、殖民地页签汇总、殖民地建筑卡片**三处都调它**（残差归「建筑」保证求和自洽）。**新增任何加成字段只在这张表加一行**，三处明细自动跟随；**禁止再在 UI 里手写 `e.base * e.xxxPct`**（历史上拆解被手写三份，加 `permPct` 时只补了两处 → 农业遗产的食物 +15% 被并进「建筑」，数字对来源错） |
| 殖民地回合推进、人口上限、招募上限 | `lib/colony/colonyTurn.ts` → `processColonyTurn` / `calcPopCap` / `getRecruitCapPerTurn` |
| 远征回合推进（领袖剧情树） | `lib/colony/expeditionTurn.ts` → `processExpeditionTurn`（数据在 `data/colony/expeditions.ts`，节点消耗走 cost 勿硬编码）/ `recordExpeditionEnding`（结局记账）/ `enterExpeditionHistory`（剧情回顾，两者均由支付动作与回合结算共用，幂等） |
| 奇观回合推进 | `lib/colony/wonderTurn.ts` → `processWonderTurn`（lib 层，勿放回 hooks/useWonder） |
| 游戏初始状态（新开局/重置/选船共用） | `hooks/gameReducer.ts` → `createInitialGameState`（勿在 SELECT_SHIP 另抄字段，嵌套对象由工厂新建防引用共享） |
| 单舰船回合结算、游戏结束判定 | `lib/turn/shipTurn.ts` → `processShipTurn` / `getGameOverReason` / `computeCrewFoodCost` |
| 船员食物消耗（阶梯+遗物保鲜减半） | `lib/turn/shipTurn.ts` → `computeCrewFoodCost`（结算与总览显示共用，勿就地重写阶梯） |
| 价格波动、市场/政策刷新、合同、被动收入 | `lib/turn/priceFluctuation.ts` / `factionTurn.ts` / `contracts.ts` |
| 合同物品名与持有量（大总览「进行中的合同」与贸易面板共用） | `lib/turn/contracts.ts` → `getContractItemName`（物品名）/ `getContractItemKind`（产品 vs 特产，`useTrade.completeContract` 扣货同用，勿再写 `startsWith('p')`）/ `getContractHeldCount`（采购数 `ship.products` 条目、走私读 `tradeStatus.inventory`）/ `getContractEarliestExpiry`（产品最早过期回合）——UI 勿再各写一份命名逻辑（曾有两份） |
| 星图距离与跃迁回合数（贸易折价同源） | `lib/galaxy/graph.ts` → `TURN_UNIT=80`（坐标→回合）、`shortestRoute`/`getGalaxyTurns`（Dijkstra，宿敌节点不可途经）、`MAX_ROUTE_TURNS=9`（全程上限，与原距离矩阵量级一致）、`validateGalaxy()`；`data/factions.getDistance` 只是委托，**旧 DISTANCE_MATRIX 已删除**，勿再引回 |
| 跃迁**实际**回合数（减免后）+ 宿敌过路费方案 | `lib/galaxy/travel.ts` → `getShipTravel(ship, targetNodeId, blocked)` 返回 `ShipTravelPlan`（`route/turns` 免费方案；**没有免费路线时**才给 `tollRoute/tollTurns/hostileVia/tollGold` 付费方案）/ `applyTravelReduction` / `getTravelReduction`——口径：最短路 → 引力锚定器 −1 → 跃迁加速器（r_010）−1 → 永久加成 `travelTurnReduce` −N，各自钳到下限 1。**实扣（`useTrade.travelToNode`）与显示（星图跃迁按钮）必须共用**：历史上只有实扣算了减免、UI 显示原始回合数 → 装了装置后界面多报 1~3 回合（玩家反馈"引力锚定器显示有分叉"）。贸易面板**不再显示**距离与回合（要看回合去星图） |
| 宿敌过路费（星图连通性兜底） | `lib/galaxy/access.ts` → `HOSTILE_TOLL_GOLD=20000`（每途经一处宿敌节点）/ `HOSTILE_TOLL_REP=1`（付费给该势力 +1 声望）。**规则**：仅当**不存在免费路线**时提供（星图按钮变琥珀色「付费途经（N 回合 · 过路费 X 金币）」）；**宿敌节点永远不能作为目的地**（`useTrade` 里目标节点的 `checkRepBlock` 仍然拦），付费只买到**途经**；每势力每回合声望上限 `applyRepChange` 的 `caps.toll=1`。**为什么必须有**：5/10 势力是星图割点（f01 封锁会切掉无声钟楼+空白神像厅两处遗迹），而宿敌拒绝买/投/合同 → 声望无任何回升通道 → 那部分星图与遗物**永久不可达**；过路费是唯一自救通道 |
| 买卖 buff 剩余回合 | `lib/turn/factionTurn.ts` → `getBuffRemainingTurns(buff, turn)`（= `expiresTurn − 当前回合`，与结算"保留 `expiresTurn >= 下一回合`"同口径）/ `summarizeBuffs(list, turn)`（连乘倍率 + 最晚到期剩余回合）/ `isBuffExpiringSoon(turnsLeft)`（≤3 回合高亮）——贸易面板「势力列表」徽章与特产区逐条显示共用，勿再写 `expiresTurn - currentTurn` |
| 星图通行与"当前势力" | `lib/galaxy/access.ts` → `HOSTILE_REP_THRESHOLD`（宿敌 −91，`useTrade.checkRepBlock` 同源）/ `getBlockedNodeIds` / `getCurrentFactionId(ship)`（停在非势力节点返回 null）/ `canEnterNode` |
| 势力信息可见性（迷雾） | `lib/galaxy/knowledge.ts` → `getKnownFactionIds(ship)`（已探明势力 = `visitedNodes` 里的势力节点）/ `isFactionKnown` / `getKnownRelation(factionId, knownIds)`（只保留已到访的相关势力 + `hiddenCount`）/ **`getNodeDisplayName(ship, nodeId)`**（未到访 → 「未探测星系」；星图信息卡与"途经/跃迁中"提示、贸易面板目的地、**下一回合预告**共用——提示曾直接读节点真名，提前泄露了目标星系的类型）——星图信息卡与贸易面板「**势力列表**」共用，**勿再各写内联过滤**（曾出现星图过滤 / 贸易面板全露的分叉） |
| 资源成本校验与扣减（远征 + 考古 + 领袖升级共用） | `lib/turn/resourceCost.ts` → `resourceAmount` / `deductResource` / `canAfford` / `firstMissing` / `payCost` / `flattenCost` / `formatCost`——科研点扣殖民地、其余扣母舰，hook 里勿再各写一份 |
| 考古成功率与阶段推进 | `lib/galaxy/archaeologyTurn.ts` → `excavationSuccessRate`（唯一公式）/ `resolveStage`（阶段成败·危险·保底·**永久中止**·**抉择折扣**）/ `leaderChangeTurns`（**换驻守领袖的耗时规则**：剩余回合 +1 但不超过「阶段基础耗时 + FAIL_EXTRA_TURNS」，防反复更换无限叠加）/ `processArchaeologyTurn`（由 `useTurn` 每回合调用）/ `grantReward`（遗物·永久加成·称号·资源；无殖民地时科研点按 1:10 折金币）。状态四态：`idle`（待投入）/ `digging`（倒计时）/ `done`（完成）/ `collapsed`（**永久封闭**，剧情与配图取 `data` 里的 `haltText`/`haltImage`，守卫在 `canOpenExcavation` + `useGalaxy` 的 4 个动作里）。**阶段小奖励的折扣系数只在本文件算**：`抉择（稳妥 SAFE_BONUS_MULT=0.5 / 冒险 RISKY_BONUS_MULT=2）× 稳妥推进（0.5）`，**最终奖励永不折扣** |
| 殖民地建立初始化 | `lib/colony/colonySetup.ts` → `applyColonyFounding`（星球类型·初始人口·遗落星球赠送 B7/B20/B21）；由殖民面板的"建立殖民地"（`foundColony`，星球类型取母舰当前所在的星图节点）触发后**立即建成**（母舰已停泊在该星球，无建设等待期）；`colonyTurn` 的 `scouting` 分支仅作**旧存档兜底**（曾是 2 回合建设期），勿在新流程里再写等待回合 |
| 考古永久加成取值 | `data/galaxy/permaBonuses.ts` → `getPermaBonusValue(ids, kind)`（foodPct/researchPct/powerPct/blackoutGuardTurns/travelTurnReduce），economy/colonyTurn/graph 勿就地判断 id |
| 母舰每回合**固定**被动收益（装置 + 遗物） | `lib/turn/shipIncome.ts` → `getShipPerTurnIncome(ship)`（返回 `{label, kind, value, phase}` 清单，`phase` 区分船员消耗前/后）/ `sumShipIncome(ship, kind)`——**结算（`processShipTurn`）与总览「资源收支」共用**，故两边永远不会对不上。动态来源不在其中，仍由 `processShipTurn` 就地结算：誊录仪与万众一心股息（总资产 1% 金币）、深空采矿阵列/奇点探求者/奥得律斯基亚水晶（随机原料），其效果文字由总览「遗物BUFF」说明 |
| 下一回合预告（确认结束回合弹窗 + 大总览共用） | `lib/turn/nextTurnHints.ts` → `getNextTurnHints(state)`（**只读状态、不加存档字段**；返回 `{id, severity: danger/warn/info, text}`，按"会掉资源 → 会错过机会 → 进度播报"分级）。**铁律：与回合结算重复的算式一律复用结算侧的导出函数**——`computeCrewFoodCost`（船员食物）、`computeColonyPower` + `projectColonyEnergy`（电力/停电）、`getContractEarliestExpiry`（合同备货过期）、`getBuildingCostProfile`（建筑工期）、`getResearchTargetTurns`（研究目标回合，含极地 −1）、`getRecruitCapPerTurn` / `getRecruitRollCost`（招募）；后两者就为此从 `colonyTurn.ts` 抽出，**不要在提示里重写公式**，否则会出现"提示说断电、实际没断"。**不预测股价/原料价波动与随机事件的抽取**（无法预知，硬报等于撒谎）；一条提示都没有时回落到那句总述（`all_quiet`） |
| 特产买卖价格与收益（含黑市） | `lib/turn/tradePrice.ts` → `getSpecialtyBuyUnitPrice`（市场价 → 声望折扣/加价 → 涨价 buff → 讨价还价 AI 9 折，**分步 ceil**）/ `getSpecialtySellRevenue`（收购价 × 数量 × 反垄断 1.1 × 套利凭证 1.05 × 贸易枢纽 1.15 × 售出 buff，**末尾一次 round**）/ `getBlackMarketTotal`（末尾一次 ceil）——**结算（`useTrade`）与贸易面板显示共用**。`data/factions.ts` 只保留静态表与 `getSellPrice`/`calculateSellMultipliers`，**旧的第二套买价公式 `getBuyPrice` 已删除** |
| 饥荒（食物<0）时金币收益减半 | `lib/turn/shipTurn.ts` → `famineHalveGold(food, amount)`（非正数原样返回）——`shipTurn`（股息/誊录仪/招财猫/投资收入）、`useTrade`（打探）、`useEvent`（事件结算）与事件结果卡显示共用；**历史上这里有三份拷贝**，勿再就地写 |
| **回合结算的调用顺序** | `hooks/useTurn.ts`（编排器，唯一权威） |
| 存档字段清单与迁移 | `lib/save.ts` |
| 原料中文名 | `data/materialNames.ts` → `MATERIAL_NAME_MAP` / `getMaterialName`（gold_ore=黄金、quantum=量子簇、silicon=硅片，禁止硬编码译名） |
| 配方生产回合数 | `data/gameData.ts` 的 `RECIPES`（`INITIAL_PRODUCTS` 不重复维护，由 `createProducts()` 派生） |
| 生产上限加成 | `data/modules.ts` → `getProductionLimitBonus` |
| 殖民地建筑「实际成本与上限」 | `lib/colony/costs.ts` → `getEffectiveMaxCount`（数量上限 = 基础 `maxCount` + 领袖 `levelExtras.buildingMaxCountBonus[建筑id]`，全数据驱动无硬编码）/ `getEffectiveMaxPop`（建筑人口上限，含 popCapBonus 覆盖）/ `getBuildingCostProfile`（金币·合金·原料·工期，含星球倍率+领袖减免）/ `getRecruitCostPerPop`（招募单价，含星球修正+领袖减免）/ `RECRUIT_BASE_COST`（2000 基础价锚点）/ `getBuildingRefundProfile`（取消/拆除返还 = 实付 ×0.4 金币、×0.7 合金与原料）；人口上限的唯一真值是 `BuildingDef.popCapBonus`（B1=5 / B2=20）+ `planets.buffs.housingCapDelta`（遗落星球 B1 +3）——hook 结算与 UI 显示必须同源，勿就地重算（历史上面板只算星球倍率导致显示与实扣分叉；B2 文案曾写 10 而实给 20） |
| 产品卖出价加成 | `data/modules.ts` → `getSellPriceBreakdown`（母舰技能+事件套装+联盟，逻辑层与显示层共用；含 multiplier/eventPercent/skillPercent/alliancePercent） |

## 四、改 GameState 字段：存档三处同步

历史事故：声望归零就是漏了存档字段。加/改字段时：

1. `types/game.ts` 加声明；
2. `lib/save.ts` 的 `buildSaveData` 写入（`SaveData` 是 `Pick<GameState,…>`，漏字段会编译报错——以构建报错为兜底，但别依赖它）；
3. `lib/save.ts` 的 `stateFromSave` 加读档兜底默认值；
4. 字段结构变化时在 `migrateSave` 写迁移分支（存档带 `saveVersion`，**当前为 2**：v2 把位置/跃迁从 `tradeStatus` 迁入 `ship.galaxy`，旧档不做星图进度迁移，只补一份全新星图与 `titles`）。

注意：只影响运行时不需持久化的字段（如 `factionRepLog`）不进入存档清单，但也必须在 `stateFromSave` 里给出初始值。

## 五、渲染性能纪律

- 新增/修改 action：统一进 `hooks/useGameState.ts` 的 `useStableActions` 包装，再把稳定引用传给面板。**禁止**在 App/GameScreen 里写 inline 箭头函数传给已 memo 的面板——会让 memo 失效。
- 新面板组件默认 `export default memo(...)`；props 里的空数组/空对象用模块级常量（参照 `EMPTY_REPUTATION` / `EMPTY_CONTRACTS`）。
- `shipIndex` 恒为 0（单舰队），接口已收敛，组件层不感知该参数。

## 六、重构纪律（搬移代码时）

- **逐字搬移，只调 import 和编排**：抽函数/拆文件时不许"顺手优化"逻辑，逻辑改动和结构改动必须分开提交。
- 保持原调用顺序（回合结算各步骤有先后依赖）。
- 改完 grep 三查：被移走的符号无旧引用残留、新位置 import 齐全、消费方解构键与返回值一一对应。
- 同步更新指向旧位置的注释（人口上限真值位置的注释就曾因此过期）。

## 七、数值纪律

改数值前先出表格化方案（前后对比），确认后再动手，改完 grep 自检锚点。易误伤的锚点：

- `30000` 殖民解锁费用（`hooks/colony/useColonyBase.ts` 的 `UNLOCK_COST`；唯一入口是殖民面板的"建立殖民地"→ `foundColony`，星球类型由母舰当前所在的星图节点决定；随机的"3 选 1 星球池"已删除）
- 星图与考古数值锚点：`lib/galaxy/graph.ts` 的 `TURN_UNIT=80`（坐标→回合，改它等于同时改跃迁与贸易折价）与 `MAX_ROUTE_TURNS=9`；`lib/galaxy/archaeologyTurn.ts` 的成功率常数（`BASE_SUCCESS_RATE=0.75`、`LEADER_LEVEL_BONUS=0.05`、`DIFFICULTY_PENALTY=0.18`、`SAFE_CHOICE_BONUS=0.10`、`RELIC_SUCCESS_BONUS=0.10`、钳制 0.15~0.90）、`HALT_CHANCE=0.02`（**每次自然失败**独立掷一次、恒 2%：命中则该遗迹永久封闭，走数据里的 `site.haltText` + `halt.webp` 剧情——不是"失败无法挖掘"的粗暴提示；触发时不再叠加本次危险结算；**「稳妥推进」保底走成功分支、不掷这一项**。注意区分"单次恒定 2%"与"整处遗迹封闭率"＝至少中一次，后者随失败次数上升）、`SAFE_BONUS_MULT=0.5` / `RISKY_BONUS_MULT=2`（抉择对**阶段小奖励**的折扣；与稳妥推进的 0.5 相乘，最终奖励不折扣）、`DISCOVERY_CHANCE=0.3`、`FAIL_EXTRA_TURNS=1`、`DANGER_LOSS_RATIO=0.5`、`RESEARCH_TO_GOLD=10`，以及 `data/galaxy/archaeology.ts` 里每处遗迹的 `turns/difficulty/cost/dangerRate/haltText`（改动前先出前后对比表）
  - 成功率口径（2026 下调后）：难度0 80~90%、难度1 62~72%、难度2 44~54%、难度3 26~36%（低→高领袖等级）；42 阶段平均 51%（按各遗迹门槛等级）/ 59%（Lv3）。**改这几个常数必须重跑"逐难度成功率 + 每处遗迹被封闭的概率"**。⚠ `HALT_CHANCE` 是**单次独立**判定（每次自然失败恒 2%，不随次数变大）；但"一处遗迹最终被封闭"是"至少中一次"，随失败次数按 `1−(1−p)^失败次数` 上升——蒙特卡洛实测（2 万次/遗迹）：用保底平均 **6.1%**（门槛等级）/ 3.9%（Lv3+手稿），不用保底平均 9.5%，单处最高 9.4%~16.6%。别把"单次恒定"和"整处概率"混为一谈
- **特产卖出乘数**（`data/factions.ts`）：`DIST_SLOPE=0.05` + `DIST_QUADRATIC=0.015`（距离折价 `1+0.05d+0.015d²`）+ `MAX_SELL_MULTIPLIER=4.0`（距离×政策×波动的上限）。**为什么带二次项**：距离同时是"要跑的回合数"和加价乘数，纯线性会让"每回合利润"随距离单调下降（实测 dist9 只有近程的 19%，远程变成坏选择）；改这两个系数前必须重跑"按距离分桶的每回合利润对比表"（样本 = 90 个势力对 × 10 档政策）。改动**下个回合生效**（乘数每回合算好存入 `factionSellMultipliers`），旧档自愈，无需存档迁移
- `0.4` / `0.7` 建筑取消/拆除返还：**按实付成本算**（唯一真值 `lib/colony/costs.ts` → `getBuildingRefundProfile`：金币 ×0.4、合金与原料 ×0.7；实扣走 `getBuildingCostProfile`），调用点在 `hooks/colony/useColonyBuildings.ts`。**勿按基础价算**——低造价倍率配置下曾可"建了立刻取消"无限套利（实测每循环净赚 3000 金币 + 15 硅片），且高倍率星球上玩家只能拿回实付的 33%
- **星图节点坐标**（`data/galaxy/nodes.ts`）：坐标同时决定跃迁回合数与贸易距离折价，属数值锚点。当前势力间最短路 **2~9 回合、均值 ≈5.87**（`validateGalaxy()` 的断言上限是 `MAX_ROUTE_TURNS=9`）。改任何坐标前先出"候选位置对比表"，候选必须核四项：与目标节点的新回合数、到最近邻居的距离、势力对 min/max/均值、**该节点其它航道回合数是否被连带改变**（只改目标航道的候选优先）；改完重跑 `validateGalaxy()` + 势力对区间 + 全图最小间距。注意四舍五入边界会骗人：`f03–f04` 曾因距离 119.97 → 119.97/80 = 1.4996 被判成 **1 回合**（表格里显示成 120 时看不出来）
- **领袖升级费用**（唯一真值：`data/colony/leaders.ts` 的 `LEADER_UPGRADE_COST` / `getLeaderUpgradeCost`，是 **cost 对象**：**Lv1→2 = 50,000 金币，Lv2→3 = 150 合金**；UI 与 hook 均从该处取，校验/扣减走 `lib/turn/resourceCost` 的 `firstMissing`/`canAfford`/`payCost`，勿就地硬编码数字或另写一套扣费）
- **开启远征费用**（`data/colony/expeditions.ts` 的 `EXPEDITION_COST`，cost 对象：**20,000 金币 + 50 合金**；同样走 `firstMissing`/`payCost`；`startExpedition` **没有领袖等级门槛**，Lv3 只跟终极技能解锁有关）
- 招募领袖星尘费（基础 10，减领袖 `leaderCostReduction`，下限 1；唯一真值：`data/colony/leaders.ts` 的 `getRecruitRollCost`；UI 与 `useColonyLeaders` 均从该处取，勿就地硬编码）
- 走私合同成功率 65%（`roll > 0.65` 失败；持有遗物 `RELIC_DECIPHERER` 情报破译器时 100% 成功；判定在 `useTrade.ts completeContract`）
- 遗物 ID 一律走 `data/relics.ts` 常量（`RELIC_*`），逻辑层勿硬编码 `'r_xxx'` 字符串
- 兑换码表 `REDEEM_CODES`（`data/gameData.ts`，30 组正常码，无调试码——不要加回 DEBUG 码）
- 远征录入规则（`data/colony/expeditions.ts`）：A 节点全免费（忽略文档 A 的条件）；文档「人口×N」统一改为合金×50；D 结局统一金币×20000；文本一律用模板字符串（反引号）防 ASCII 引号截断；树结构 A×3→B×2→C×2→D×1，可跑 `validateExpeditionTree()` 自检；图片 `/expeditions/<leaderId>/{planet,A1~A3,B1~B6,C1~C12,D1..D12,H*}.webp`（统一 WebP；**阶段图按节点编号命名**，每位领袖 21 张：A1~A3 / B1~B6 / C1~C12，结局图为 D1~D12）；**「图鉴」的阶段图集与降落图格只收录走过的**：跨远征累计在 `colony.expeditionVisited`（领袖 → 节点 id，降落记为 `'planet'`），写入点唯一是 `lib/colony/expeditionTurn.markExpeditionVisited`（由 `enterExpeditionHistory` 与 `processExpeditionTurn` 的 case 0 调用；**写 visited 要放在 `enterExpeditionHistory` 里 history 提前 return 之前**；与每轮重置的 `expedition.history` 故意分开存，**别把 `'planet'` 塞进 history**——「回顾剧情」是按 history 去 `route.nodes` 取节点的，planet 不是节点），存档三处同步（`types/colony.ts` 声明 + `lib/save.ts` 读档兜底（旧档用进行中那轮的 history 回填，非空即补 `'planet'`）+ `useColonyBase` 建立殖民地初始化）；"走过"的口径 = 该节点文字已解锁（A 免费进入即算，B/C/D 支付后才算，沿用防白嫖规则）；终极技能= Lv3 产出加成基础上叠加 `ultimateSkill.bonus`（数据驱动，勿新机制），**解锁需 12/12 结局 + 领袖达 Lv3**（`useColonyExpedition.unlockUltimate`；因加成按 Lv3 键集结算，低等级解锁会提前吃到满级键集，故设 Lv3 门槛）；`freePopEveryTurns`（每 N 回合免费 +1 人口，受上限钳制）已由 L13/L15 的 Lv3 使用（4/2 回合）；**原料建筑数量上限**：12 座原料建筑基础 `maxCount: 2`，六位原料领袖（L4 石油 / L5 黄金 / L6 碳块 / L7 暗物质 / L8 量子簇 / L9 硅片）Lv2 给对应**低级**建筑 +1、Lv3 给**低级与高级各 +1**（同用 `buildingMaxCountBonus`；因 levelExtras 按当前等级取档，Lv3 必须写明低级 +1 否则升级会丢失该加成）；有建筑产出加成的领袖（L1/L2/L3/L4/L5/L6/L7/L8/L9/L11/L12）由 `economy.ts` 统一结算叠加到 Lv3 建筑上，无建筑产出加成的领袖按主题解释并就地叠加：L13=克隆中心（B28）每回合人口再 +bonus（`ultimateSkill.type: 'cloneCenter'`，`colonyTurn.ts` B28 结算块消费；L13 的 `levelExtras.cloneCenterPop` 让 B28 间隔 2→1 回合并提升每回合人口），L22=电力建筑 levelBonuses（B29/B30）由 `economy.ts` 电力循环统一结算、终极再叠加 +bonus%，L14=人口上限再 +bonus（`ultimateSkill.type: 'populationCap'`，`colonyTurn.ts` calcPopCap 消费），L15=招募上限 +bonus 且人口上限 +extra.bonus（双目标：`type: 'recruitCap'` 由 getRecruitCapPerTurn 消费、`extra` 指向 populationCap），L20=领袖容量+费用减免（leaderCapBonus/leaderCostReduction），L16=居住建筑人口效果（`levelExtras.housingPopBonusPct` 50/100/150，终极 `type: 'housingPop'` 再叠加）——终极技能用 `type`（+可选 `extra`）标记消费点，取值统一走 `leaders.ts` 的 `getUltimateBonus(ld, target)`，只在对应消费点生效（populationCap/researchPerTurn/freePop/recruitCap/cloneCenter/housingPop/all/allMaterial/randomMats/powerUse 十类），勿通用叠加（否则会误加到所有领袖）；L17=每回合随机原料再 +bonus（`type: 'randomMats'`，`economy.ts` 领袖特效块叠加）、L18=全部建筑产出再 +bonus%（`type: 'all'`，`economy.ts` 的 lAll 块叠加）、L19=人口上限再 +bonus（与 L14 同一消费点）、L21=电能消耗再 −bonus%（`type: 'powerUse'`，`economy.ts` 省电计算：多领袖 `powerUseReduction` 取最高值后再叠加终极，上限钳 100%）；L21/L22 电能效果已全数据化：电力建筑加成走 levelBonuses（economy 电力循环消费）、电能消耗减免走 `levelExtras.powerUseReduction`、停电免疫走 `levelExtras.blackoutImmune`——免疫为 **10 回合保护**（`colonyTurn.ts` 的 `BLACKOUT_GUARD_TURNS=10`，连续缺电计数 `colony.blackoutGuardTurns`，耗尽后仍未恢复供电则停电，中途恢复重置；存档字段三处同步：types + save.ts migrateSave 兜底 + useColonyBase 初始化），`colonyTurn.hasBlackoutImmunity` 回合判定与 UI 显示共用，UI 技能文案全数据驱动，勿再硬编码（L16 已全数据化：`housingPopBonusPct`/`b2CostReduction`/`b2FlatCap` 三个 levelExtras 字段，consumers 在 `colonyTurn.calcPopCap` 与 `useColonyBuildings` 造价计算）；**加成一律加算**：电力与食物/合金/原料等口径一致，`产出 × (1 + 各加成%之和)`（星球%+领袖%+循环%…），勿写成逐项相乘（电力曾乘算，已修正为加算）
- 远征 CG 图集（图鉴，纯欣赏与剧情无关）：远征对象加 `hiddenImages: [{id:'H1'},…]`，图片 `/expeditions/<leaderId>/<id>.webp`（如 H1..H11，WebP）；集齐 12 结局自动开放（`GalleryPanel` 判定 `list.length >= EXPEDITION_UNLOCK_COUNT`，每领袖张数自定，勿硬编码 9）；**统一只写 id，不写 title/desc（title 缺省按数组顺序自动显示 CG1/CG2/…）**；id 唯一且按序命名，无图时 `onError` 隐藏；UI 文案一律叫「CG 图集」，勿写「隐藏剧情」

## 八、命名与文案

- **考古阶段文字的收束规则**（`data/galaxy/archaeology.ts`）：**最后一阶段必须是结论，不是钩子**——它要正面回答该遗迹 `intro` 提出的那个问题，并把玩家带走的东西（遗物/永久加成）写成答案本身（"奖励即答案"，如七层碑林的「第七层手稿」= 倏忽人留下的读法、折叠回廊的「套利凭证」= 折角本身记下的航程）。禁止在最后一阶段再抛新疑问或留白（曾 10 处里 8 处收在悬念上，玩家反馈"谜底没揭、故事没讲完"）。`haltText` 是另一条分支（永久封闭）也要收住，两条线别互相串味。阶段文字约 100~160 字、单行单引号字符串、**不得出现 ASCII 引号**（会截断字符串）。
- 真值函数命名 `getXxx` / `computeXxx`；避免 `import { x as y }` 别名（现存一例 `useGameState.ts` 的 `getShipTotalAssets as computeShipTotalAssets`，待清理，勿新增）。
- 原料译名一律走 `getMaterialName()`（事件/建筑的 flavor 文学描述除外）。
- **领袖显示一律用名字**：`getLeaderDef(leaderInstance.id)?.name`（如「诺娃·永昼」）。`LeaderInstance.id` 是内部编号（L1…L22），任何时候都不要直接渲染给玩家（考古驻守下拉与驻守状态曾显示成 "L14 Lv3"）。
- **星图节点配图**（唯一真值：`lib/galaxy/nodeImage.ts` → `getNodeLandscapeImage`）：可殖民星球 `/planet-landscape/<星球类型id>.webp`（10 个类型：desert/ocean/polar/arid/terran/alpine/savannah/tropical/tundra/ruin，已有 1424×800）；遗迹**复用图鉴封面** `/archaeology/<遗迹id>/cover.webp`（不另做一套图，避免分叉）；势力 `/faction-landscape/<势力id>.webp`（f01~f10，如 `/faction-landscape/f01.webp`，**待补**，缺图由 `onError` 自动隐藏）——**三档现已统一为 WebP**（星球与势力曾为 PNG，2026-10 已转码；改造星球图时注意还有第二个出口：`ColonyPanel` 的星球头像用 `public/planets/<类型>.webp`，那是 **128×128 的列表缩略图**，与 `planet-landscape` 的 1424×800 大图是两套文件，别混用）；改格式只改本文件那一行；未开发（empty）节点无图；**未探测节点一律不返回图片**（迷雾，避免泄露）。信息卡里配图**宽度跟卡片走、按 16:9 完整显示**（`block w-full aspect-video object-cover` → 高度 = 宽度 × 9/16，手机 ≈342×192、桌面 1440px ≈1360×765；既**不裁切**也**不缩成小块**）。**踩过的两种错法**：只写 `max-h`（图变成很扁的横带、16:9 素材上下裁掉 1/3~3/4）；`max-w` + `max-h` 成对锁比例（不裁了，但在宽屏上只剩 462px 宽、玩家反馈"太小了"）。要"随宽度缩放且不裁"，就用 `w-full` + `aspect-video`，别用固定 `max-h`。
- **遗迹封面（cover.webp）的三处出口**：① 考古页签·遗迹列表行左缩略图（移动端 64px / 桌面 96px 宽，16:9，缺图**整块不渲染**，用 `failedCovers` 按 siteId 记失败）；② 考古页签·选中遗迹的详情大图（`max-h-[140px] md:max-h-[220px]`，缺图按本面板约定露出占位框）；③ 考古图鉴卡片（**仅收录已全部完成**的遗迹，图鉴默认收起）。**加新图时先确认它在玩法里真的有出口**——cover 曾经只有图鉴一处，发掘全程看不到（星图信息卡是后补的第二处）。
- **费用文案与按钮行为：现状是有意保留的，别"顺手统一"**——① 领袖页签里招募用原生数字（`{n}星尘/次`）、升级与远征用共用的 `formatCost`（渲染成 `金币×50000`，**不带千分位**；它是考古/远征节点花费共用的函数，改它会连带影响那些地方）；② 升级按钮会按 `canAfford` 置灰，**远征按钮不预置灰**（只在进行中禁用，买不起时点一下由 `firstMissing` 给出"资源不足：金币不足（需要 20000）"）。三者都只是风格差异，不影响数值与扣费正确性（2026-10 核对：唯一真值干净、无旧文案遗留）。
- **图鉴用「手风琴」：同一时刻只展开一位领袖**（`GalleryPanel` 的 `expandedId: string | null`）。为什么：一位领袖展开最多 **46 张图**（1 降落 + 12 结局 + ≤12 CG + 21 阶段），而图片解码内存是 **宽×高×4 字节 ≈ 3.2 MB/张（1200×675）**，与文件只有 120~280 KB 无关；若用 `Record<string, boolean>` 允许多位同时展开，10 位全开会在 DOM 挂上约 460 个 `<img>`（≈56 MB 流量、视口附近解码上百 MB），低内存手机会被系统回收标签页。**别把这处改回多开**。若以后仍觉得展开瞬间卡，可再叠加：给图鉴的 `<img>` 加 `loading="lazy" decoding="async"`（7 处），或给网格单独出 320×180 缩略图（大图只在点开预览时加载）。
- 代码用 ASCII 直引号；游戏文案用中文标点、正常中文句式，非必要不用破折号。
- **科技描述只保留引号台词**（`data/colony/techs.ts`）：格式为 `'"台词。"'`，台词后的技术说明段一律不写（原为"台词 + 一段说明"，平均 89 字，已精简为平均 22 字；循环科技的效果描述照常）。其余数据（建筑/领袖/星球）描述保持 30~60 字的单段说明。

## 九、历史坑（都修过，勿复现）

| 坑 | 根因 | 防线位置 |
|---|---|---|
| 声望存档丢失 | autoSave 字段清单多处拷贝、漏字段 | `lib/save.ts` 唯一清单 |
| 旧投资→声望迁移从未生效 | useSave 预填 `{}` 使 reducer 的判空永不成立 | 迁移已移入 `stateFromSave` |
| 拦截提示不显示 | dispatch 异步，updater 里赋值的 `result` 同步读不到 | 同步可判的拦截放 dispatch 前 |
| 生产上限显示只读基础值 | UI 硬编码未乘加成 | `getProductionLimitBonus` 共享 |
| 饥荒时免费装置无法建造 | `food < costFood` 在 costFood=0 时退化为 `food<0` | `costFood>0 && …` |
| 装置数量写死 n/12 | 硬编码 | `MODULE_DEFINITIONS.length` |
| 奇观总消耗漏乘回合 | 简单相加而非 Σ(资源×回合) | 以 `stages` 为准 |
| updater 里 mutate prev | 违反 reducer 纯函数约定 | 返回值纯函数化（参照 useTrade 的 applyRepChange） |
| 领袖升级费用 UI/hook 分叉 | UI 写 50/100、hook 写 20/45，玩家被误挡且账实不符 | 已收敛到 `data/colony/leaders.ts` 的 `getLeaderUpgradeCost`（现为 **cost 对象**：Lv1→2 = 50,000 金币、Lv2→3 = 150 合金；校验/扣减统一走 `lib/turn/resourceCost`） |
| 招募上限形同虚设 | 每回合最多招N人只校验单次 amount、无累计字段，反复点可无限招 | Colony 加 `recruitedThisTurn`，`getRecruitCapPerTurn` 共享；「字段+动作检查+回合重置」三段式 |
| 远征文本 ASCII 引号致语法错误 | 故事文档里 `'xxx'`（如「叫'回头青'」）是 ASCII 单引号，逐字搬进单引号字符串会截断（TS1005） | 远征数据文本一律用模板字符串（反引号）或转义 `\'`；录入新路线后 grep `[\u4e00-\u9fff]'[\u4e00-\u9fff]` 自检（该模式只在文本内部引号时命中） |
| 总览漏显"领袖每回合特效"产出 | 领袖特效（科研/星尘/暗物质/量子/随机原料）直接累加总量、不进 `buildings` 明细，而总览只遍历明细 | `ColonyEconomy.leaderPerTurn` 明细 + 总览「领袖特效」单列（估算模式下随机原料标注"结算时掷骰"） |
| 产出明细漏标遗物加成 | 合金精炼手册 r_008 直接 `value += 1`，明细无来源标注，玩家对不上总数 | `BuildingEconomyEntry.relicBonus` → 总览与建筑 tab 明细显示「遗物+1」 |
| 遗物的百分比加成被并进"领袖加成" | 空白神像 r_021（全建筑 +10%）实现时直接 `lAll += 10`，而 `lAll` 在明细里渲染成「领袖+X%」→ 面板显示"领袖+10%"，来源错标（玩家质疑"我没这个领袖"） | 百分比类遗物加成单列字段：`BuildingEconomyEntry.relicPct` / `PowerBuildingEntry.relicPct`（小数），参与 `value` 计算但**不并入 `leaderPct` / `lAll` / `lAllBonus`**；明细显示「遗物+10%」。以后加"全局建筑加成"类遗物照此办理 |
| 领袖槽位文案歧义 | `popCapBonus` 显示为「XX上限+5」，玩家误读成"能多造 5 座" | 文案统一为「XX每座可入驻5人」；数量上限另用「XX可建造+N」（`buildingMaxCountBonus`） |
| 远征结局"付钱不落地"、结局图看两遍 | 结局记账只在回合结算做（付了 20000 金币却不点结束回合就退出，结局丢失）；D 层与箴言原本分属两个回合，同一张结局图展示两遍 | `recordExpeditionEnding`/`enterExpeditionHistory` 由支付动作与回合结算共用（幂等；history 用重新赋值而非 push，避免 hook 侧 mutate prev）；D 支付后同屏显示结局图+箴言，回合结算即收尾；`stage 6` 分支保留作**旧存档兜底**，删掉会让在途老档永久卡死 |
| 星图改造时"位置"有两份真值 | 位置/跃迁原本在 `tradeStatus.currentFactionId`，星图又天然带 `galaxy.currentNodeId`，两边同时存在必然分叉 | 位置与跃迁**只**存 `ship.galaxy`（`tradeStatus` 已删这三个字段）；"当前势力"一律走 `lib/galaxy/access.getCurrentFactionId(ship)`（停在非势力节点返回 null，贸易动作先过 `requireFactionHere` 守卫，跃迁中禁止交易） |
| 势力信息"贸易面板全露" | 星图有迷雾（未探明节点显示"未探测星系"），而贸易面板的「**势力列表**」（原「星际势力分布」；子页签原「星际地图」）遍历全部 10 个势力并列出名称/特产/市场价/外交关系，两套规则分叉；关系过滤还只在星图里内联写了一份 | 迷雾判定收敛到 `lib/galaxy/knowledge.ts`，两处 UI 共用一个口径；未探明势力在贸易列表显示为**占位行**（灰问号 + "跃迁抵达后揭晓"，不露名称/特产/价格/距离/关系），已探明势力的关系仍按"只显示到访过的相关势力"过滤并给出"N 条关系未知" |
| 拆分卡片分支时操作入口漏在一个分支 | 星图信息卡拆成"迷雾 / 已探测"两个 return 分支时，跃迁按钮只写在迷雾分支里 → 已探明的节点点开只有信息、没有跃迁按钮（去了就回不来，玩家报"致命 BUG"）；同类：考古列表把状态派生写成"有 state 就是进行中"，于是 `idle`（已中止）既不在顶部进度卡里、也没有"继续发掘"按钮 → 中止后永远无法重启 | 跨分支共用的操作一律抽成**一个函数**由两处调用（`GalaxyMapPanel.renderTravelAction`）；**状态派生要把每个状态分开**（考古现为 `digging` / `idle` / `done` / `collapsed` / 无 state **五态**），每个状态都必须能走到"下一步动作"的入口 |
| 结算函数里的"开头快照"覆盖后续写入 | `resolveStage` 开头 `const g = { ...ship.galaxy }` 做快照，成功时先 `grantReward`（它内部会写 `ship.galaxy`，如永久加成/称号/遗物），随后又用 `ship.galaxy = { ...g, archaeology }` 写回 → 把刚发的奖励**覆盖掉了**（当前阶段小奖励只有资源，所以没暴露；一旦给阶段奖励加遗物就会静默丢失） | 写回状态一律展开**当前**的 `ship.galaxy`（`{ ...ship.galaxy, archaeology }`），只在需要"函数开头的一致视图"时用缓存的 `g` 读，不用它写 |
| 扣减资源没有下限，结算把库存扣成负数 | `applyDanger` 按阶段投入的 50% 再扣一次，而 `deductResource` 对原料是 `现有 − 数量` 无钳制 → 玩家恰好只够付一次时（付完为 0），危险结算会扣出**负库存** | `applyDanger` 里每项以"当前持有量"为上限（`Math.min(want, max(0, resourceAmount(...)))`），**金币例外**（负金币交给破产机制）；日志同时写明实际扣了什么（`额外损失 合金×30`） |
| 考古的"位置要求"范围写错（把已开工的续投也拦了） | 曾给 `continueExcavation` 加"母舰必须还在该遗迹星系"的守卫（理由是列表文案写着"请先跃迁抵达"）。但领袖已入驻遗迹、考古队留在原地作业，母舰一走就出现**倒计时照常在走、续投却被拦**的自相矛盾（玩家只能干等） | **位置只在"首次开始发掘"时要求**：`checkDigContext(siteId, leaderId, requirePresence)`，仅 `startExcavation` 传 `true`；`continueExcavation`（原内联守卫已删）/ `changeExcavationLeader`（传 `false`）/ 稳妥推进 / 中止 / 抉择**都不要求在场地**。UI：续投按钮不再受 `activeIsHere` 限制，母舰不在场时进度卡显示「考古队在驻守领袖带领下继续作业」；只有**未发掘**的遗迹才提示"请先跃迁抵达"。**判据：动作是否要求在场，看"这里是否已经有单位驻守"，而不是"当初是在哪里点的"** |
| 驻守↔远征只做了单向守卫（驻守中的领袖照样能被派去远征） | `checkDigContext` 里有"正在远征的领袖不能来驻守"，但 `startExpedition` **没有反向校验** → 玩家实测：领袖在考古点驻守后仍能开启远征，同一领袖同时占两处（原内联遍历还只认 `digging`，漏了 `idle`＝已中止但人还在） | 双向守卫共用唯一真值 `lib/galaxy/archaeologyTurn.findStationedSite`（**`digging` 与 `idle` 都算驻守**；`done`/`collapsed` 视为已释放领袖）：`useGalaxy.checkDigContext` 查远征、`useColonyExpedition.startExpedition` 查驻守。UI 同步：远征页对驻守中的领袖**禁用出征按钮**并写明「正在「X」驻守考古遗迹（驻守与远征不可同时进行）」（`ExpeditionPanel` 因此新增 `archaeology` prop，由 `ColonyPanel` 传 `ship.galaxy.archaeology`）；考古页三处领袖下拉对「远征中 / 已在别处驻守 / 等级不足」统一给出禁用原因。**任何"互斥"规则都要写两个方向——只挡一边等于没挡** |
| 关键风险参数在 UI 缺位（玩家无法评估风险） | `dangerRate` 只出现在数据与 `resolveStage` 判定两处，UI 里一个字都没有 → 玩家不知道碳壳巢（50%）比别处（35%）更危险，也不知道"失败还会再按投入的 50% 再扣一遍资源"这条规则，只能被扣了才知道 | 遗迹列表每行显示「危险率 N%」（≥50% 琥珀色高亮）；进度卡参数行同样显示，并在下方固定写明后果「触发则额外损失本阶段投入的一半（与投入相同的资源组合）」；冒险选项措辞与之一致（「失败必触发意外」）。**加任何影响成败/资源的风险参数时，同时给它一个 UI 出口** |
| 惩罚"按次叠加"却没有上限（可被反复点击放大） | 更换驻守领袖的惩罚写成 `turnsLeft: st.turnsLeft + 1`，既没挡"换成同一个人"、也没有上限 → 连点下拉把某阶段剩余回合一路推到几十回合（且没有反悔入口，只能干等）；设计本意只是"换人耗 1 回合" | 惩罚一律**收敛成"设置到某个上限值"而不是"在原值上累加"**：`lib/galaxy/archaeologyTurn.ts` 的 `leaderChangeTurns(turnsLeft, stageTurns)` = `min(turnsLeft+1, stageTurns+FAIL_EXTRA_TURNS)`（与失败惩罚同一上限）；动作层拦下同一人（`st.leaderId === leaderId` → 报错不扣时），UI 下拉过滤掉当前驻守者；文案区分"真的 +1"和"已达上限"。**同类风险点：任何写在动作里的 `x + 1` / `x * 1.1` 惩罚，先问"连点 20 次会怎样"** |
| 结算加了收益、总览没显示（显示漏项） | 母舰侧的每回合被动收益写在 `processShipTurn` 里，而总览「资源收支」另起一份：食物只加 3 个食物装置、星尘把戴森的 +3 **硬编码在 JSX**、遗物侧（共鸣音叉 +3 星尘、星灵共鸣石 +2 星尘、克隆培养皿 +5 食物、招财猫 +200 金币）**一个都没算**；且星尘/金币行以"殖民地有产出"为显示条件 → 没有殖民地产星尘的玩家连那一行都看不到（玩家报"共鸣音叉没显示"） | 固定数值的被动收益一律收敛到 `lib/turn/shipIncome.ts`，**结算与总览读同一份**；显示条件用"殖民地 + 母舰 > 0"而不是只看殖民地；明细标注来源名（`母舰 共鸣音叉3+星灵共鸣石2`）。**新增任何"每回合 +X"的来源时，必须同时确认总览「资源收支」会显示它** |
| 价格公式在显示侧漏算加成倍率（玩家看到的价 ≠ 实收） | 交易价格从来只在 `useTrade` 里算，面板自己另写一份：买入漏「讨价还价 AI 9 折」且 ceil 分步不同；卖出**完全没算**反垄断 1.1 × 套利凭证 1.05 × 贸易枢纽 1.15（最大偏差 1.33 倍）；黑市显示 `ceil(单价)×数量` 而结算 `ceil(单价×数量)` | 价格公式一律进 `lib/turn/tradePrice.ts`（`getSpecialtyBuyUnitPrice` / `getSpecialtySellRevenue` / `getBlackMarketTotal`），结算与面板**共用**；连"最大可买数量""是否买得起"也用同一单价。**显示侧出现 `×1.1`／`Math.ceil` 之类价格运算时，先找它对应的结算公式** |
| 同一条规则被复制成多份（饥荒金币减半） | `famineHalveGold` 的规则在 `shipTurn`（闭包）、`useTrade`（内联箭头）、`useEvent`（闭包）各写一遍；改一处就会分叉，且事件结果卡用的是**未减半**的值（卡片写 +5000、实际到账 2500） | 抽成 `lib/turn/shipTurn.ts` 的 `famineHalveGold(food, amount)` 导出函数，四处（含 `EventPanel` 的结果卡与日志）共用；卡片显示**实收**值并标注「(饥荒减半)」。**同一算式第二次出现时立刻抽函数** |
| 总览产出来源"错标/缺标"（数字对但来源不对） | 总览「资源收支」各行的来源拆解是手写的：合金行只减 `relicBonus`、科研/原料行只减领袖特效 → **未完成的镜的 +2 科研、深层钻头的每座 +1 原料、空白神像的 +10%** 全被算进"建筑"里（玩家以为殖民地自己产的）；动态来源（誊录仪/万众一心按总资产 1%、三类随机原料）则完全不见踪影。**同一坑复发过一次**：拆解当时是"三份手写拷贝"（总览 / 殖民地汇总 / 建筑卡片），加考古永久加成 `permPct` 时只补了两处 → 农业遗产食物 +15%、循环理论科研 +15% 又被吞进「建筑」，而且**当时的"修法"是给三份拷贝各补一行（等于把分叉再种一遍）** | 拆解收敛为唯一真值 `lib/colony/economy.getBuildingSourceBreakdown` + `ECO_SOURCE_FIELDS`（一张 字段→显示名 表），三处 UI 全部改读它、残差归「建筑」保证求和自洽；动态/随机来源单列一行「其它动态收益（不计入合计）」。**教训：发现"某来源在两处显示不一致"时，先看是不是同一份拆解被写了两遍——补丁式各补一行只会让下次更难查；UI 里出现 `总数 − 某一项` 或 `e.base * e.xxxPct` 这类手写算式就要立刻警觉** |
| 列表渲染被 `slice` 静默截断（入口凭空消失） | 移动端底部页签栏写死 `tabs.slice(0, 11)`，而 `tabs` 有 15 项 → **「改造」「兑换」压根没渲染**，横向滚动也救不回来（玩家报"找不到改造和兑换"） | 页签/入口一律遍历**完整数组**，需要分组就用显式清单。**任何 `slice(`/`filter` 出现在入口列表上时，先问"被切掉的项玩家怎么进入"** |
| 移动端底栏行数随屏幕宽度漂移、压住内容 | 底栏曾用 `flex flex-wrap` + 按钮 `min-w-[44px]`：17 项总宽 748px，375/390px 机型每行只放得下 8 个 → 实际排成**三行（≈140px）**，而根容器留位只有 116px，最后一行压住页面内容；414/430px 又是两行（96px），同一份代码在不同机型行为不一致 | 行数要**结构上固定**而不是靠换行。**现方案（2026-10 用户选定）**：单行 = 左侧**钉住**「结束回合 / 音乐」（各 52px，不参与滚动）+ 右侧 15 个页签**横向滚动**（`w-14` = 56px/个，一屏约 6~7 个，全部渲染、不许 slice），滚动条可见（`[&::-webkit-scrollbar]:h-1.5` + track/thumb + `[scrollbar-width:thin]`）、切页签用 `scrollIntoView({inline:'center'})` 自动滚进视野、右缘渐隐仅在有内容时显示（`tabStripMoreRight`，带 2px 容差防亚像素误判）；栏高 ≈64px → 根容器 `pb-[68px] md:pb-0`，nav 自身带 `pb-[env(safe-area-inset-bottom)]` 避开 iPhone 横条。**教训：栏高与根容器留位是配对的，改任一边都要重算**；靠 `flex-wrap` 决定行数的固定项列表，先按最窄目标机型算一遍每行容量 |
| reducer action 定义了但无人 dispatch（半截功能） | `ADD_EVENT_LOG` 的 action 类型与 reducer 分支早就写好（含稳定 id 注入），但全库 **0 处 dispatch**（我加考古日志时只走了 `useTurn` 直接拼 eventLog 的路子，没接事件侧）→ 玩家在「大总览/事件」看到"事件记录"却永远只有考古与游戏结束两条 | 事件日志统一走 `useEvent.logEvent(event, detail)`（内部 dispatch `ADD_EVENT_LOG`）：选择事件在 `EventPanel.handleChoose` 的最终分支写（多级选择记 `A → B` 路径 + 结果文案 + 资源变动），躲避在 `drawEvent` 里写。**新增 action 后要 grep 确认真的有人 dispatch，别留死 action**（`eventLog` 上限 100 条由 reducer 控制；**只在事件面板展示最近 30 条**，大总览曾重复展示过一块已按"不要重复功能"删除，勿再加回） |
| 事件系统伸手进市场（已彻底拆除） | 事件结果用 `grantTip: 'stock'\|'material'` 发"下回合股价/原料价定向偏移"（`nextTurn*Tip` → `*TipThisTurn` → `priceFluctuation` 里 0.6/0.3 权重的 `intelEffect`），用 `stockFreeze` 冻结股市——冻结三处全是 `if (false)` / `{false && …}` 死代码，玩家侧毫无反馈；`useEvent.isPenaltyEvent` 还把 `stockFreeze` 当作惩罚判据 | 已全删：`ResourceChange` 去掉 `grantTip`/`stockFreeze`，`Mothership` 去掉 4 个提示字段，`priceFluctuation`/`shipTurn`/`EventPanel`/`GameScreen`/`useStock`/`StockMarket` 不再读写任何事件字段，事件数据里 15 处 `grantTip`、9 处 `stockFreeze` 一并清除。**事件玩法与股票玩法双向隔绝（既定规划，勿再接通）**：事件侧不读 `stocks`/股价、不写任何价格字段，股票侧不读事件字段与情报字段；新增市场影响一律走独立的态势/消息面机制（股票因子的唯一接入点在 `priceFluctuation` 的 `totalChange` 处），勿再从事件回接。**事件文案也不得承诺市场影响**：原"获得内幕消息/矿产分布图/赏金名单 → 股价或原料价会怎样"的措辞已统一改为"把情报转手变现"（17 处，见 `choiceEvents.ts`），写新事件时别再写"股价将暴涨""买入后被套牢"这类与机制不符的话 |

---

## 十、2026-08 全代码自检：新增/变更的唯一真值

> 2026-08 全代码自检（唯一真值 / 硬编码 / 数值分叉）的结论**一律记入本文档，不另建报告文件**（曾有 `自检报告-*.md` / `第二批建议-决策清单.md` 两份工作文件，已废弃删除）。
> 三批收敛：第一批为零数值替换；第二批含经确认的数值决策（E10 市场区间统一、B2 人口上限改文案、股票卖出费率、返还改实付口径、旧投资系统退役）；第三批为收尾收敛（股票 T+1 冷却、建筑效果描述合并、34 处金币流水集中、剩余回合算式、导出存档改取当前状态、`stateFromSave` 归一化确认为唯一一处）。
> 下表每条都可用 `src/` 全库 grep 复现：符号出现次数应与"唯一位置"一一对应（除数据结构声明、类型注释与真值定义本身）。
> 下面这些**新的唯一真值**，改相关逻辑时必须从它们取值，别在 hook/UI 里再写一份。

| 逻辑 | 唯一位置 |
|---|---|
| 资源兑换价（合金 1200 / 食物 800 / 1 星尘→5 合金 / 1 合金→2 食物 / 1 星尘→20 食物） | `data/exchangeRates.ts` |
| 星尘集市价格与效果（随机原料 4、兑换金币 2、刷新政策 15、售价加成 8/15 与 5 回合） | `data/exchangeRates.ts` → `STARDUST_SHOP`（UI 条目表只留图标/配色，数值从这里读） |
| 投资与黑市倍率（固定 8000 金币→+1 声望、每回合 10 次；黑市默认 3.2、浮动 1.3） | `data/exchangeRates.ts` → `INVEST_GOLD_PER_REP` / `INVEST_MAX_PER_TURN` / `BLACK_MARKET_DEFAULT` / `BLACK_MARKET_SPREAD` |
| 股票买卖手续费 | `data/gameData.ts` → `getStockFeeMult`（买入）/ `getStockSellFeeMult`（卖出），费率由同一个 `STOCK_FEE_RATE=0.03` 派生（黄金集团 0、万众一心减半 = 0.985）。**显示侧禁止再用 `2 − 买入费率` 反推卖出倍率**（会得到 1.015，与实收差 4.6%） |
| 股票 T+1 冷却 | `hooks/useStock.ts` → `isStockCooling(buyTurn, turn)` / `getStockCooldownHint`（结算 + 桌面/移动面板共用） |
| 金币流水写入与上限 | `lib/turn/goldLog.ts` → `pushGoldLog(ship, turn, amount, reason)`（内部裁到 `GOLD_LOG_LIMIT=200`）。**调用前必须已经改完金币**（函数读当前金币作为 balanceAfter），34 个调用点已逐处核对 |
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
| 市场库存/需求区间 | `lib/turn/factionTurn.ts` → `rollMarketBuyStock()`（500~800）/ `rollMarketSellDemand()`（500~700）——**开局（SELECT_SHIP）与每回合刷新共用同一套**（历史上是 800~1200 / 900~1500 与另一套并存，已确认为遗留） |
| 奇观阶段投入 | `data/colony/wonders.ts` → `toStageCost(stage)`（11 个扁平字段 → cost 对象），校验/扣减走 `resourceCost`，面板显示同源 |
| 免费人口 | `lib/colony/colonyTurn.ts` → `getFreePopGains(colony, turn)`（结算与「下一回合预告」共用，含人口上限钳制） |
| 远征付费层 | `lib/colony/expeditionTurn.ts` → `isPaidStage(stage)`（B/C/D = 3~5） |
| 走私成功率 | `lib/turn/contracts.ts` → `SMUGGLING_SUCCESS_RATE=0.65`（贸易面板给出口） |
| 原料 id 全集 | `data/materialNames.ts` → `ALL_MATERIAL_IDS` / `BASIC_MATERIAL_IDS` |
| 唯一 id 生成 | `lib/id.ts` → `createUid(prefix)`（建筑/生产/贷款/事件日志/考古日志）。**有意保留的例外**：合同 id `c_回合_势力_序号`（自解释、可定位）与遗落星球赠品 `B7_ruin_1` 等初始化字面量 |
| 总资产百分比收益 / 随机原料数量 / 动态收益清单 | `lib/turn/shipIncome.ts` → `ASSET_INCOME_PCT` / `getAssetPercentIncome` / `DYNAMIC_INCOME_AMOUNTS` / `getDynamicIncomeLines(ship, assets)`（总览文案与结算同源；金币类显示前套 `famineHalveGold`） |
| 读档字段归一化（`galaxy` 子字段兜底） | `lib/save.ts` → `stateFromSave`（**唯一**归一化点：先铺完整 `createGalaxyState(...)` 再覆盖存档字段，末尾单独兜 `archaeology`）。两个 LOAD_SAVE 入口（`useSave.loadSave` / `importSave`）都经过它，**所以只需一处**；`migrateSave` 只做结构/语义改写（`selecting→scouting`、`expeditionVisited` 回填），**勿再加第二处字段级兜底**（那是死代码——判空永不成立） |

### 10.1 本轮修掉的三条坑（对应第九节坑表的补充）

| 坑 | 根因 | 防线 |
|---|---|---|
| 极地星球科研回合数"说 3 回合、实际 2 回合" | 动作层提示与面板进度分母读 `tech.researchTurns` 原值，而结算与预告走 `getResearchTargetTurns`（极地 −1）→ 三处口径二对一 | 全部改读 `colonyTurn.getResearchTargetTurns`（`useColonyResearch` + `ColonyPanel` 三处）。**任何"还剩几回合"的显示，先问结算那边算的是哪个函数** |
| 停电预告撒谎（保护计数耗尽那一回合） | 预告只判"有没有保护"，不读保护**计数**；结算在计数递减到 0 的那回合会真的停电 | 判定抽成 `colonyTurn.resolveBlackout`，结算与预告共用。**"有没有保护"和"还剩几次"是两件事** |
| 加 import 时重复 import 同一符号（TS2300 构建失败） | 给 `GameScreen.tsx` 的 `shipIncome` import 追加符号时，文件下方原本已有一行等价 import（不在替换块内） | **给文件加 import 前先 grep 该文件是否已有同一模块的 import**；改完用脚本遍历 import 绑定、检出同一文件的重复绑定（本轮全库 0 处）。同理：同一文件里同名变量≠同一作用域，跨组件复制调用行要逐个核对标识符来源 |

### 10.2 口径补充

- **黑市受迷雾约束**（`TradePanel` 黑市势力选择器）：未探明势力只显示 `?` 锁定占位，不露名称/特产/市场价——与「势力列表」同口径（`lib/galaxy/knowledge.getKnownFactionIds`）。这是第三节迷雾条目的适用面，不是例外。
- **饥荒减半（`famineHalveGold`）消费点补齐**：除原有股息/誊录仪/招财猫/投资收益/打探/事件外，新增**声望被动收入**（`factionTurn.applyPassiveIncome`）与**量子生物反应器转化**（`useModule`，文案标注"（饥荒减半）"）。**新增任何金币收益都要问一句"饥荒时该不该减半"**。
- **旧投资系统已退役**：`invested` 不再有写入点（读档时一次性折成声望后清零），`shipTurn` 的"投资收益/档位6补给"分支与总览的投资区块已删除；投资回报统一走 `REPUTATION_TIERS` 被动收入与买价折扣。

### 10.3 本轮登记的单点魔法数（改前先出前后对比表）

政策时长 3~5 回合（`factionTurn`）、合同档位表 `[16, 26, 30000, 40000]`（`contracts.ts`）、声望阈值表（`factions.REPUTATION_TIERS`）、`RECRUIT_BASE_COST=2000`、`BLACKOUT_GUARD_TURNS=10`、`PRODUCT_SHELF_LIFE=3`、市场区间 500~800 / 500~700、股票费率 3%（万众一心 1.5%、黄金集团 0）、`EXPEDITION_UNLOCK_COUNT=12`、`GOLD_LOG_LIMIT=200` / `EVENT_LOG_LIMIT=100`、考古成功率常数（第七节）。

### 10.4 已知未做项（有意留待）

- `hasSave()` 仍每次渲染读一次 localStorage（性能细节；改动会影响"导入存档后按钮是否立刻刷新"的交互）。
- 星球特性文案（`ColonyPanel.getBuffList`）仍是手写 14 组，与 `planets.buffs` 逐条核对一致但未数据化——**改星球数值时要同步改文案**。
- `TradePanel` 逐条 buff 行未用 `isBuffExpiringSoon` 高亮（只有势力列表徽章有）。
- `permaBonuses.getPermaBonusDef` 暂无调用方（留给将来的"永久加成图鉴"）。

---

*2026-08-22 建立。依据：五轮重构的实操记录 + 逐条源码核实。*
*2026-08 全代码自检后补充第十节（新增真值清单、三条新坑、迷雾与饥荒口径、单点魔法数登记）。*