# 航空生涯之旅 · 代码修改准则（AGENTS.md）

> 改代码前通读本文件。本文件只写"被验证过的事实"和"反复踩过的坑"，不写愿望清单。
> 架构或约定变化时，同步修订本文件。

---

## 〇、工作副本与验证流程（先读这条）

- **协作者不跑构建**：不执行 `npm run build` / `tsc` / `npm install`（本机也没有 Node 环境）。改完后做逻辑级自检——通读改动文件、grep 核对每一处符号引用与 import——构建验证由用户执行。
- 改动逐条过源码确认，不接受"大概没问题"。

## 一、技术栈与架构现状

- React 19 + Vite 7 + TypeScript + Tailwind 3.4 + lucide-react，包管理 npm。
- 状态管理：`useReducer`（`hooks/gameReducer.ts`）+ 业务 hook，无第三方状态库。
- UI 全部自研；shadcn/Radix 及其 `components/ui/`、`cn()` 工具已删除，**不要重新引入**。

```
src/
├── components/     # UI：13 个面板（全部 memo）+ GameScreen/GameOverScreen/ShipSelection
│   └── colony/     # ColonyPanel、WonderPanel
├── data/           # 静态数据：gameData / factions / modules / relics / materialNames
│                   #   / choiceEvents / resourceEvents / colony/
├── hooks/          # 业务 hook：gameReducer / useGameState / useTurn / useTrade / useSave 等
│   └── colony/     # useColony 的 5 个子 hook
├── lib/            # 纯函数（无副作用、可独立测试）
│   ├── colony/     # economy.ts（产出结算）、colonyTurn.ts（回合推进）
│   ├── game/       # assets.ts（总资产）
│   ├── turn/       # priceFluctuation / shipTurn / factionTurn / contracts
│   └── save.ts     # 存档序列化 / 反序列化 / 迁移
└── types/          # 全部 TS 类型
```

## 二、代码放哪

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
| 殖民地经济/电力/食物/产出 | `lib/colony/economy.ts` → `computeColonyEconomy` / `computeColonyPower` / `computeColonyFoodCost` |
| 殖民地回合推进、人口上限、招募上限 | `lib/colony/colonyTurn.ts` → `processColonyTurn` / `calcPopCap` / `getRecruitCapPerTurn` |
| 单舰船回合结算、游戏结束判定 | `lib/turn/shipTurn.ts` |
| 价格波动、市场/政策刷新、合同、被动收入 | `lib/turn/priceFluctuation.ts` / `factionTurn.ts` / `contracts.ts` |
| **回合结算的调用顺序** | `hooks/useTurn.ts`（编排器，唯一权威） |
| 存档字段清单与迁移 | `lib/save.ts` |
| 原料中文名 | `data/materialNames.ts` → `MATERIAL_NAME_MAP` / `getMaterialName`（gold_ore=黄金、quantum=量子簇、silicon=硅片，禁止硬编码译名） |
| 配方生产回合数 | `data/gameData.ts` 的 `RECIPES`（`INITIAL_PRODUCTS` 不重复维护，由 `createProducts()` 派生） |
| 生产上限加成 | `data/modules.ts` → `getProductionLimitBonus` |

## 四、改 GameState 字段：存档三处同步

历史事故：声望归零就是漏了存档字段。加/改字段时：

1. `types/game.ts` 加声明；
2. `lib/save.ts` 的 `buildSaveData` 写入（`SaveData` 是 `Pick<GameState,…>`，漏字段会编译报错——以构建报错为兜底，但别依赖它）；
3. `lib/save.ts` 的 `stateFromSave` 加读档兜底默认值；
4. 字段结构变化时在 `migrateSave` 写迁移分支（存档带 `saveVersion`，当前为 1）。

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

- `30000` 殖民解锁费用（`hooks/colony/useColonyBase.ts` 的 `UNLOCK_COST`）
- `0.4` / `0.7` 建筑取消/拆除返还（`hooks/colony/useColonyBuildings.ts`）
- `50` / `100` 领袖升级星尘费（唯一真值：`data/colony/leaders.ts` 的 `LEADER_UPGRADE_COST` / `getLeaderUpgradeCost`；UI 与 hook 均从该处取，勿就地硬编码）
- 兑换码表 `REDEEM_CODES`（`data/gameData.ts`，30 组正常码，无调试码——不要加回 DEBUG 码）

## 八、命名与文案

- 真值函数命名 `getXxx` / `computeXxx`；避免 `import { x as y }` 别名（现存一例 `useGameState.ts` 的 `getShipTotalAssets as computeShipTotalAssets`，待清理，勿新增）。
- 原料译名一律走 `getMaterialName()`（事件/建筑的 flavor 文学描述除外）。
- 代码用 ASCII 直引号；游戏文案用中文标点、正常中文句式，非必要不用破折号。

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
| 领袖升级费用 UI/hook 分叉 | UI 写 50/100、hook 写 20/45，玩家被误挡且账实不符 | 已收敛到 `data/colony/leaders.ts` 的 `getLeaderUpgradeCost`（50/100） |
| 招募上限形同虚设 | 每回合最多招N人只校验单次 amount、无累计字段，反复点可无限招 | Colony 加 `recruitedThisTurn`，`getRecruitCapPerTurn` 共享；「字段+动作检查+回合重置」三段式 |

---

*2026-08-22 建立。依据：五轮重构的实操记录 + 逐条源码核实。*