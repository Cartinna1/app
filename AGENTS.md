# 航空生涯之旅 · 代码维护规范（AGENTS.md）

> 本文件是项目交接给任何 AI/协作者时必须遵守的代码规范与协作约定。
> 改代码前先通读本文件，违反其中"铁律"的改动会被打回。

---

## 一、项目概览

| 项 | 内容 |
|---|---|
| 技术栈 | React 19 + Vite 7 + TypeScript 5.9 + Tailwind CSS 3.4 + lucide-react |
| 状态管理 | `useReducer`（`gameReducer.ts`）+ 业务 hook，无 Redux/Zustand |
| UI 组件 | 全部自研（重构后已移除 Radix/shadcn，`src/components/ui/` 已删） |
| 包管理 | npm |
| 构建 | `npm run build`（`tsc -b && vite build`） |

**目录结构**（重构后）：

```
src/
├── components/       # UI 组件（13 个面板已 memo + 3 个场景）
│   └── colony/       # 殖民系统（ColonyPanel、WonderPanel）
├── data/             # 静态数据（gameData/factions/modules/relics/colony/materialNames）
├── hooks/            # 业务 hook
│   ├── colony/       # useColony 拆分的 5 个子 hook
│   ├── gameReducer.ts / useGameState.ts / useTurn.ts / useTrade.ts ...
├── lib/              # 纯函数（真值模块，见第二节）
│   ├── colony/       # economy.ts、colonyTurn.ts
│   ├── game/         # assets.ts
│   └── turn/         # contracts/factionTurn/priceFluctuation/shipTurn
├── types/            # 全部 TS 类型
└── utils/            # cn() 等工具函数
```

---

## 二、铁律一：单一真值，禁止拷贝逻辑

**任何计算逻辑只许存在一份，且只放在真值模块里。** 绝不在组件或其他 hook 里再写一份同款计算。

| 逻辑 | 唯一真值位置 | 说明 |
|---|---|---|
| 舰队总资产 | `lib/game/assets.ts` → `getShipTotalAssets` | UI 显示与系统判定（股息/誊录仪）共用，口径「不含售价加成」 |
| 殖民地经济/电力/食物/产出 | `lib/colony/economy.ts` → `computeColonyPower` / `computeColonyFoodCost` / `computeColonyEconomy` | 历史 4 处拷贝已收敛 |
| 原料中文名 | `data/materialNames.ts` → `MATERIAL_NAME_MAP` / `getMaterialName` | gold_ore=黄金、quantum=量子簇、silicon=硅片，禁止再硬编码 |
| 配方生产回合数/原料 | `data/gameData.ts` 的 `RECIPES` | `INITIAL_PRODUCTS` 不再含 productionTurns，由 `createProducts()` 按 id 派生 |
| 存档序列化/迁移 | `lib/save.ts` → `buildSaveData` / `stateFromSave` / `migrateSave` | 见第三节 |
| 贸易/合同/声望结算 | `lib/turn/` + `hooks/useTrade.ts` | 结算顺序以 `lib/turn/shipTurn.ts` 编排为准 |

**反例**：若在某组件里手写一份"算产出/算资产"的代码，等于把已修掉的分叉重新种回去，直接判不合格。

---

## 三、铁律二：加 GameState 字段必须同步存档三件套

这是最高频、后果最重的翻车点（历史 bug：声望归零就是漏了存档字段）。

加/改 `GameState` 字段时，**四处必须同步**：

1. `types/game.ts` —— 加字段声明
2. `lib/save.ts` 的 `buildSaveData` —— 写入存档
3. `lib/save.ts` 的 `stateFromSave` —— 读档还原（含旧档兜底默认值）
4. `lib/save.ts` 的 `migrateSave` —— 若字段结构变化，写迁移逻辑（旧档兼容）

漏任何一处，旧存档或新存档会丢数据。

---

## 四、铁律三：UI 引用稳定性 + memo

- 13 个面板已 `export default memo(...)`（ColonyPanel、WonderPanel、EventPanel、GoldLogViewer、LoanPanel、MaterialMarket、ModulePanel、ProductionPanel、ProductMarket、RedeemCode、SaveManager、StockMarket、TradePanel）。
- 新增 action 时，**统一放进 `useGameState.ts` 的 `useStableActions`**，不要在某处随手写 inline 箭头函数传给面板——inline lambda 会让 memo 失效。
- `shipIndex` 恒为 0（单舰队），组件层不感知 shipIndex 参数，接口已收敛。

---

## 五、代码放置位置

| 代码性质 | 放哪 |
|---|---|
| 纯计算、无副作用 | `lib/`（好测、可复用） |
| 状态 + 副作用 | `hooks/` |
| 静态数据/常量 | `data/` |
| UI 组件 | `components/` |
| 类型 | `types/` |

殖民地新机制：先判断属于 5 个子 hook 的哪个（`useColonyBase` / `useColonyBuildings` / `useColonyPop` / `useColonyLeaders` / `useColonyResearch`），不要堆回 32 行的组合器 `useColony.ts`。

---

## 六、数值与口径纪律

**改数值必须逐条核对，确认没误伤其他锚点。** 关键散落魔法数字（重构时最易被连带改动）：

- `30000` — 殖民解锁费用
- `0.4` / `0.7` — 建筑拆除/取消返还（金币 40% / 原料 70%）
- `20` / `45` — 领袖升级星尘费用（Lv1→Lv2=20，Lv2→Lv3=45）
- 兑换码表 `REDEEM_CODES` — 30 组正常码（500~10000），**已无 DEBUG1125 调试码**

改数值前先给方案（表格化前后对比），确认后再改。改完用 `grep` 自检锚点。

---

## 七、命名与风格

- 真值函数用 `getXxx` / `computeXxx` 命名，**禁止用 `as` 别名导入**（曾清理过 `getShipTotalAssets as computeShipTotalAssets` 的瑕疵，勿再引入）。
- 原料译名一律走 `getMaterialName()`，禁止 `金矿` / `量子晶体` / `硅晶体` 等硬编码（事件/建筑的 flavor 文学描述除外）。
- 游戏文案：中国科幻文学风，正常中文句式，非必要不用破折号（——）。
- 代码用 ASCII 直引号；自然语言文案用中文标点。

---

## 八、协作流程约定（用户偏好，必须遵守）

1. **改代码前先给方案**，用户确认后再动手；涉及数值改动先做表格化对比。
2. **代码级根因修复优先**，不接受表面修补。
3. **修改后不做任何构建验证**——不跑 `npm run build`、不跑 `tsc`、不 `npm install`。只做逻辑自检（读代码核对类型、变量引用、import）。构建由用户自行执行。
4. **逐条手工确认**，拒绝"跑脚本/看数字就下结论"，必须逐项读源码核实。
5. **端到端验证**：改一个功能要验证完整链路（如建筑建造/招募的消耗日志、存档读档）。
6. 中文沟通，回复简洁直接，善用表格。
7. 修改前备份受影响文件到 `E:\生涯之旅游戏\.workbuddy\backups\<任务名>\`。

---

## 九、历史教训（易错点清单）

| 教训 | 原因 | 现状 |
|---|---|---|
| 声望存档丢失 | `autoSave` 序列化漏字段 | 已改 `lib/save.ts` 唯一字段清单 + `Pick<GameState>` 自动同步 |
| 拦截提示不显示 | React dispatch 异步，`let result` 在 updater 里赋值后 `return` 拿不到 | 同步可判断的拦截已移到 dispatch 前 |
| 产品生产上限显示只读基础值 | UI 硬编码基础值，未乘加成 | 已抽 `getProductionLimitBonus` 共享 |
| 饥荒时装置无法建造 | `if (ship.food < def.costFood)` 在 costFood=0 时退化成 `food<0` | 改为 `costFood>0 && ...` |
| 母舰装置数量硬编码 | `已安装 (n/12)` 写死 | 改为 `MODULE_DEFINITIONS.length` |
| 奇观 totalLines 漏乘回合 | 简单相加而非 `Σ(资源×回合)` | 已修正，真实消耗以 `stages` 为准 |

---

*更新记录：2026-08-21 首次建立，基于代码优化报告 + 逐条验证。后续架构/约定变化应同步修订本文件。*
