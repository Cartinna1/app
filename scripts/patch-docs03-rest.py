"""docs/03：把「每头目 10 回合冷却」改成「全局休息 6 回合」，并补两处口径。
安全策略：逐条只在命中时替换；未命中就打印相关行并跳过，绝不改坏文件。
"""
import io, os, re

DOC = r"E:\生涯之旅游戏\docs\03-雇佣兵协会.md"


def read(p):
    with io.open(p, "r", encoding="utf-8") as f:
        return f.read()


src = read(DOC)
orig = src
report = []

# ---------- ① §2.6 那两个计时器的整段：改成单一全局休息 ----------
pat26 = re.compile(r"(###\s*2\.6[^\n]*\n)(.*?)(?=\n###\s|\n##\s)", re.S)
m = pat26.search(src)
NEW26 = """### 2.6 刷新与休息（两个计时器，含义不同）

| 计时器 | 值 | 作用 |
|---|---|---|
| **批次刷新** | 每 **10 回合**换一批榜单（`BOUNTY_REFRESH_TURNS`） | 决定「这一批有哪几条悬赏」，与本批 `offered` 绑定 |
| **全局休息** | 打赢**任意一条**悬赏后 **6 回合**（`BOUNTY_REST_TURNS`） | 休息期内**接取与出击都被拒**，界面显示「悬赏整理中，还差 X 回合」 |

- 休息状态只有一处：`bounties.restUntilTurn`（0 = 不在休息）；判据函数 `bountyRestRemaining` 与文案 `restReason` 是**唯一出口**，UI 不许自己算。
- **`X` 下限是 1**：绝不出现「还差 0 回合」。
- **失败 / 放弃 / 过期都不进入休息**（否则连输会被越锁越久）。
- ⚠ 旧的「每头目 10 回合冷却」（`bossCooldown`）**已整体退役**：两个计时器并存必然打架；旧 v9 档里的残留键在读档时被忽略，存档版本仍是 **9**。
"""
if m:
    src = src[: m.start()] + NEW26 + src[m.end():]
    report.append("① §2.6 已重写为「批次刷新 + 全局休息」两个计时器")
else:
    report.append("① 未找到 §2.6 小节标题，跳过（可后续手改）")

# ---------- ② 类型位置口径 ----------
if "types/guild.ts" in src:
    src = src.replace("types/guild.ts", "types/game.ts")
    report.append("② `types/guild.ts` → `types/game.ts`（类型实际位置）")
else:
    report.append("② 未出现 `types/guild.ts`，无需改")

# ---------- ③ bossCooldown → restUntilTurn ----------
n_bc = len(re.findall(r"bossCooldown", src))
if n_bc:
    src = re.sub(r"bounties\.bossCooldown", "bounties.restUntilTurn", src)
    src = re.sub(r"`bossCooldown`", "`restUntilTurn`", src)
    report.append(f"③ 处理了 {n_bc} 处 bossCooldown 字样（已替换为 restUntilTurn / 已在 §2.6 说明退役）")
else:
    report.append("③ 文档里已无 bossCooldown")

if src != orig:
    with io.open(DOC, "w", encoding="utf-8", newline="\n") as f:
        f.write(src)
    report.append(f"已写回：{len(orig.split(chr(10)))} 行 → {len(src.split(chr(10)))} 行")
else:
    report.append("文件未改动")

for line in report:
    print("  " + line)
