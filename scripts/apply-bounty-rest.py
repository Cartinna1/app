#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""把「每头目冷却」换成「全局休息 6 回合」（bountyCooldown → restUntilTurn）。

用法：
    python scripts/apply-bounty-rest.py --dry-run   # 只校验每一处是否唯一命中，不写盘
    python scripts/apply-bounty-rest.py             # 先备份、再写盘；任何一处不唯一 → 整体中止

退出码：0 = 成功 / 已应用；1 = 任何异常（不写任何文件）。
⚠ 每处替换都要求**唯一命中**（正则按 re.S 计数）；命中数 != 1 就打印"文件 / 模式 / 命中了 N 次"并整体中止。
⚠ 幂等：任一目标文件已含 `restUntilTurn` 就打印"已应用"退出 0。
"""

import io
import os
import re
import shutil
import subprocess
import sys

try:
    sys.stdout.reconfigure(encoding="utf-8", errors="replace")
except Exception:  # noqa: BLE001
    pass

APP = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
NODE = r"C:\Users\Master\.dsh\dsh-runtimes\dsh-primary-runtime\dependencies\node\bin\node.exe"

T_GAME = "src/types/game.ts"
T_BOUNTIES = "src/lib/turn/bounties.ts"
T_REDUCER = "src/hooks/gameReducer.ts"
T_SAVE = "src/lib/save.ts"
T_BOARD = "src/components/battle/MercenaryBoard.tsx"
T_MERC = "scripts/check-mercenary.cjs"
T_STATE = "scripts/check-battle-state.cjs"

# (相对路径, 旧串正则, 新串, 是否 re.S)
RULES = [
    # ---------------- types/game.ts ----------------
    (T_GAME,
     r"  bossCooldown\?: Record<string, number>;",
     "  /** 全局休息的结束回合（0 = 不在休息）：**打赢任意一条悬赏**后 = 当前回合 + BOUNTY_REST_TURNS（6）。\n"
     "   *  ⚠ 旧的每头目冷却 `bossCooldown` 已整体退役（两个计时器并存必然打架，用户 2026-10 裁定）。\n"
     "   *    旧 v9 档里残留的 `bossCooldown` 在 stateFromSave 里**被忽略**；缺本字段时兜底 0；\n"
     "   *    **存档版本号仍是 9**（v9 内的形状调整，不加迁移分支）。 */\n"
     "  restUntilTurn: number;", False),
    (T_GAME,
     r"旧档兜底 = 空板 `\{ batchTurn: 0, offered: \[\], active: \[\], bossCooldown: \{\} \}`",
     "旧档兜底 = 空板 `{ batchTurn: 0, offered: [], active: [], restUntilTurn: 0 }`", False),

    # ---------------- lib/turn/bounties.ts ----------------
    (T_BOUNTIES,
     r"//   · BOSS_COOLDOWN_TURNS  —— \*\*单个头目\*\*被打赢后几天不再出现（`bounties\.bossCooldown`）；",
     "//   · BOUNTY_REST_TURNS    —— **全局休息**：打赢任意一条悬赏后 6 回合不能接、不能打（`bounties.restUntilTurn`）；", False),
    (T_BOUNTIES,
     r"/\*\* 单个头目被打赢后的冷却回合数：10 回合内不进候选池 \*/\nexport const BOSS_COOLDOWN_TURNS = 10;",
     "/** **全局休息**：打赢任意一条悬赏后，接下来几回合不能接、也不能打（唯一数值位置） */\n"
     "export const BOUNTY_REST_TURNS = 6;", False),
    (T_BOUNTIES,
     r"/\*\*\n \* 该头目还剩几回合冷却.*?\n\}\n",
     "/**\n"
     " * 全局休息还剩几回合（0 = 不在休息，可以接/可以打）。\n"
     " * 判据 = `restUntilTurn - turn`，下限 0；没有记录（旧档 / 从未打赢过）= 0。\n"
     " */\n"
     "export function bountyRestRemaining(state: GameState): number {\n"
     "  return Math.max(0, (state.bounties.restUntilTurn || 0) - state.turn);\n"
     "}\n"
     "\n"
     "/**\n"
     " * 休息期的**唯一原因文案**（接单 / 出击 / UI 共用；N 下限 1，绝不渲染「还差 0 回合」）。\n"
     " * 返回空串 = 不在休息。\n"
     " */\n"
     "function restReason(state: GameState): string {\n"
     "  const remain = bountyRestRemaining(state);\n"
     "  if (remain <= 0) return '';\n"
     "  return `悬赏整理中，还差 ${Math.max(1, remain)} 回合`;\n"
     "}\n", True),
    (T_BOUNTIES,
     r"\(d\) => d\.kind === 'elite' && bossCooldownRemaining\(d\.enemyId, bounties\.bossCooldown, turn\) === 0",
     "(d) => d.kind === 'elite'", False),
    (T_BOUNTIES,
     r"  const remain = bossCooldownRemaining\(def\.enemyId, state\.bounties\.bossCooldown, state\.turn\);\n"
     r"  if \(remain > 0\) return deny\(`该头目正在冷却，剩 \$\{remain\} 回合`\);",
     "  // ⑦ 全局休息（打赢任意一条悬赏后的 6 回合内不能接）——与出击共用 `restReason` 这一份判据\n"
     "  const rest = restReason(state);\n"
     "  if (rest) return deny(rest);", False),
    (T_BOUNTIES,
     r"/\*\* 写入某头目的冷却起点（打赢时调；键是\*\*该条的敌方 id\*\*，不是 `raid` 占位） \*/\n"
     r"export function withBossCooldown\(bounties: BountyState, bossId: string, turn: number\): BountyState \{\n"
     r"  return \{ \.\.\.bounties, bossCooldown: \{ \.\.\.\(bounties\.bossCooldown \|\| \{\}\), \[bossId\]: turn \} \};\n"
     r"\}",
     "/** 写入全局休息的结束回合（**只在悬赏胜利结算时调一次**；失败/放弃/过期都不写） */\n"
     "export function withBountyRest(bounties: BountyState, turn: number): BountyState {\n"
     "  return { ...bounties, restUntilTurn: turn + BOUNTY_REST_TURNS };\n"
     "}", False),
    (T_BOUNTIES,
     r"  const fleet = state\.fleets\.find\(\(f\) => f\.id === fleetId\);\n"
     r"  if \(!fleet\) return deny\('先选一支有战舰的舰队'\);",
     "  // 休息期与接单**同一份判据**（`restReason`）：休息中也不能出击。\n"
     "  const rest = restReason(state);\n"
     "  if (rest) return deny(rest);\n"
     "  const fleet = state.fleets.find((f) => f.id === fleetId);\n"
     "  if (!fleet) return deny('先选一支有战舰的舰队');", False),

    # ---------------- hooks/gameReducer.ts ----------------
    (T_REDUCER, r"  BOSS_COOLDOWN_TURNS,", "  BOUNTY_REST_TURNS,", False),
    (T_REDUCER, r"  withBossCooldown,", "  withBountyRest,", False),
    (T_REDUCER,
     r"    bounties: \{ batchTurn: 0, offered: \[\], active: \[\], bossCooldown: \{\} \},",
     "    bounties: { batchTurn: 0, offered: [], active: [], restUntilTurn: 0 },", False),
    (T_REDUCER,
     r"        const bounties = won && def\.kind === 'elite'\n"
     r"          \? withBossCooldown\(bountiesAfter, def\.enemyId, state\.turn\)\n"
     r"          : bountiesAfter;",
     "        // 打赢**任意档**悬赏 → 全局休息 6 回合（用户 2026-10 裁定：每头目冷却退役）；\n"
     "        // 失败 / 放弃 / 过期**都不写**（否则连输三次会被锁 18 回合）。\n"
     "        const bounties = won ? withBountyRest(bountiesAfter, state.turn) : bountiesAfter;", False),
    (T_REDUCER,
     r"            \+ \(def\.kind === 'elite' \? `；该头目 \$\{BOSS_COOLDOWN_TURNS\} 回合后可再接` : ''\)",
     "            + (won ? `；悬赏整理中，${BOUNTY_REST_TURNS} 回合内不能接新委托` : '')", False),

    # ---------------- lib/save.ts ----------------
    (T_SAVE,
     r"    bounties: d\.bounties \|\| \{ batchTurn: 0, offered: \[\], active: \[\], bossCooldown: \{\} \},",
     "    bounties: d.bounties || { batchTurn: 0, offered: [], active: [], restUntilTurn: 0 },", False),
    (T_SAVE,
     r"    // ===== 银河雇佣兵协会（v9 新增，纯字段地基）=====",
     "    // ===== 银河雇佣兵协会（v9 新增；`bossCooldown` 已退役 → `restUntilTurn`，属 v9 内的形状调整）=====\n"
     "    // ⚠ 旧 v9 档里残留的 `bossCooldown` 键**被忽略**（不迁移、不报错）；缺 `restUntilTurn` 时兜底 0。", False),

    # ---------------- components/battle/MercenaryBoard.tsx ----------------
    (T_BOARD, r"  BOSS_COOLDOWN_TURNS,\n", "", False),
    (T_BOARD, r"  bossCooldownRemaining,\n", "  bountyRestRemaining,\n", False),
    (T_BOARD,
     r"（当前 \{totalActive\} 条）· 榜单每 10 回合换一批 · 打赢后头目 \{BOSS_COOLDOWN_TURNS\} 回合冷却。",
     "（当前 {totalActive} 条）· 榜单每 10 回合换一批 · **打赢任意一条后统一休息 6 回合**。", False),
    (T_BOARD,
     r"        const cooldown = bossCooldownRemaining\(def\.enemyId, state\.bounties\.bossCooldown, state\.turn\);\n",
     "", False),
    (T_BOARD,
     r"//   · `bountyRewardText` / `bountyExpiryText` / `bossCooldownRemaining` → 三处文案",
     "//   · `bountyRewardText` / `bountyExpiryText` / `bountyRestRemaining` → 三处文案", False),
    (T_BOARD,
     r"            \{cooldown > 0 \? \(\n"
     r"              <p className=\"mt-1 text-\[10\.5px\] leading-relaxed text-slate-500\">\n"
     r"                该头目正在冷却，剩 \{cooldown\} 回合\n"
     r"              </p>\n"
     r"            \) : null\}",
     "            {null}", False),

    # ---------------- scripts/check-battle-state.cjs ----------------
    (T_STATE,
     r"const EMPTY_BOUNTIES = \{ batchTurn: 0, offered: \[\], active: \[\], bossCooldown: \{\} \};",
     "const EMPTY_BOUNTIES = { batchTurn: 0, offered: [], active: [], restUntilTurn: 0 };", False),
    (T_STATE,
     r"      bossCooldown: \{ m01: 18 \},",
     "      restUntilTurn: 18,", False),
]


def main():
    dry = "--dry-run" in sys.argv
    only = [a for a in sys.argv[1:] if not a.startswith("--")]

    # 幂等判定
    already = 0
    for rel in (T_GAME, T_BOUNTIES, T_REDUCER, T_SAVE, T_BOARD):
        p = os.path.join(APP, rel)
        if os.path.isfile(p) and "restUntilTurn" in io.open(p, encoding="utf-8").read():
            already += 1
    if already >= 3:
        print("[=] 已应用（多个目标文件里已有 restUntilTurn）。")
        return 0

    # 规则里给 board 加一行休息提示（放在"接取/出击"之前）
    extra = [
        (T_BOARD,
         r"\{batch\.notice \? \(",
         "{bountyRestRemaining(state) > 0 ? (\n"
         "        <p className=\"mb-2 rounded-[8px] border border-rose-700/60 bg-rose-950/40 px-2.5 py-2 text-[12px] font-bold leading-relaxed text-rose-200\">\n"
         "          悬赏整理中，还差 {bountyRestRemaining(state)} 回合\n"
         "        </p>\n"
         "      ) : null}\n\n"
         "      {batch.notice ? (", False),
    ]
    rules = RULES + extra

    plan = []
    problems = []
    for idx, (rel, pat, rep, dotall) in enumerate(rules):
        path = os.path.join(APP, rel)
        text = io.open(path, encoding="utf-8").read()
        flags = re.S if dotall else 0
        hits = len(re.findall(pat, text, flags))
        if hits != 1:
            problems.append((rel, idx, pat[:70].replace("\n", "\\n"), hits))
            continue
        plan.append((rel, text, pat, rep, flags))

    if problems:
        print("[x] 以下替换不唯一，**没有写任何文件**：")
        for rel, idx, p, n in problems:
            print("    %s / 规则#%d / 命中 %d 次 / %s" % (rel, idx, n, p))
        return 1

    if dry:
        print("[dry-run] %d 处替换全部唯一命中（覆盖 %d 个文件），未写盘。"
              % (len(plan), len({p[0] for p in plan})))
        return 0

    # 备份（每个文件一份 .bak-bounty-rest，已存在不覆盖）
    per_file = {}
    for rel, text, pat, rep, flags in plan:
        per_file.setdefault(rel, text)

    for rel, text in per_file.items():
        path = os.path.join(APP, rel)
        bak = path + ".bak-bounty-rest"
        if os.path.exists(bak):
            print("[=] 备份已存在，不覆盖：" + bak)
        else:
            shutil.copyfile(path, bak)
            print("[+] 备份 " + bak)

    # 写盘（每个文件先把所有规则应用一遍）
    for rel, text in per_file.items():
        out = text
        for r_rel, _t, pat, rep, flags in plan:
            if r_rel != rel:
                continue
            out = re.sub(pat, rep.replace("\\", "\\\\"), out, count=1, flags=flags)
        with io.open(os.path.join(APP, rel), "w", encoding="utf-8", newline="\n") as f:
            f.write(out)
        print("[+] 已写回 " + rel)

    # 自检：两个 .cjs 过 node --check
    rc = 0
    for rel in (T_MERC, T_STATE):
        p = os.path.join(APP, rel)
        r = subprocess.run([NODE, "--check", p], capture_output=True, text=True)
        print(("[✓] node --check " if r.returncode == 0 else "[x] node --check ") + rel)
        if r.returncode != 0:
            print(r.stderr or r.stdout)
            rc = 1

    # 自检：bossCooldown 归零
    left = []
    for rel in (T_GAME, T_BOUNTIES, T_REDUCER, T_SAVE, T_BOARD):
        if "bossCooldown" in io.open(os.path.join(APP, rel), encoding="utf-8").read():
            left.append(rel)
    print(("[✓] bossCooldown 已清理干净" if not left else "[x] 仍有 bossCooldown：" + ", ".join(left)))
    return 0 if (rc == 0 and not left) else 1


if __name__ == "__main__":
    sys.exit(main())
