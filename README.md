# 航空生涯之旅

单机网页游戏：驾驶母舰在星际间贸易、投资、经营殖民地，并推进领袖远征。纯前端项目，无后端、无联网。

## 技术栈

React 19 · Vite 7 · TypeScript · Tailwind CSS 3.4 · lucide-react。状态管理用 `useReducer` + 业务 hook，无第三方状态库；UI 全部自研。

## 命令

| 命令 | 作用 |
|---|---|
| `npm install` | 安装依赖 |
| `npm run dev` | 本地开发，默认 http://localhost:3000 |
| `npm run build` | 类型检查 + 生产构建（`tsc -b && vite build`） |
| `npm run preview` | 预览构建产物 |
| `npm run lint` | ESLint |

## 目录结构

```
src/
├── components/     # UI 面板（colony/ 下为殖民地面板），全部 memo
├── data/           # 静态数据：gameData / factions / modules / relics / 事件 / colony/
├── hooks/          # 业务 hook（colony/ 下为 6 个子 hook）
├── lib/            # 纯函数：colony/（经济·回合·奇观）、turn/（价格·势力·合同）、save.ts
└── types/          # 全部 TS 类型
```

## 玩法页签

舰队总览、股票、原料、生产、产品、事件、贷款、贸易、殖民、装置、兑换码、金币流水、存档。

## 改代码前先读 AGENTS.md

`AGENTS.md` 记录了单一真值位置（经济结算、建筑成本与上限、存档字段清单）、存档字段三处同步、渲染性能纪律、数值与文案规范，以及一份历史坑清单。它是本项目的权威约定，与本文冲突时以它为准。
