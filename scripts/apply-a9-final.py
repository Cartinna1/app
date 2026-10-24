#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""A9（最后一轮）· 池 4→3 份 + m04 一次性盾 + q6 亡语 2→1 + m03 冻结 2→1。

用法：
    python scripts/apply-a9-final.py --dry-run   # 只校验每处是否唯一命中，不写盘
    python scripts/apply-a9-final.py             # 先备份 engine.js.bak-a9，再写盘并自检

退出码：0 = 成功 / 已应用；1 = 任何异常（任一处命中数不对 → 整体不写盘）。

⚠ **敌池口径**：24 张（6×4）→ **18 张（6×3）**。理由：池容量扫描实测
   （`scripts/sim-pool-sweep.cjs`，每格 100 局 × 3 编队）——
   P24：m01 0.7% / m02 45.0% / m03 79.0% / m04 8.3%
   P18：m01 24.0% / m02 58.7% / m03 97.7% / m04 20.0%
   P12：85.0 / 85.3 / 100 / 78.7（过冲，不采用）
   故定 18 张。`src/data/mercenary/pools.ts` 必须同口径（6×3）。

⚠ **m04「开场一次性 +2 盾」的实现**：`createBattle` 那一刻 BOSS 场上还没有单位，
   所以"一次性"落在**第 1 个 BOSS 回合开始**（`st.round <= 1`）——不新增任何状态字段。
⚠ **q6 亡语 2 → 1**：这是**卡的行为**（不是 boss 技能），所以同时改卡的 `def(...)` 与 `BEHAVIOR`。
   文档 §4.2 的 q6 亡语数值 2 → 1 需要同步（见报告清单）。
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
DEMO = r"E:\生涯之旅游戏\carddemo\engine.js"
BACKUP = DEMO + ".bak-a9"
NODE = r"C:\Users\Master\.dsh\dsh-runtimes\dsh-primary-runtime\dependencies\node\bin\node.exe"
POOLS_TS = os.path.join(APP, "src/data/mercenary/pools.ts")

# (正则, 新串, 期望命中数, 标签)
DEMO_RULES = [
    # ① 四条敌池 4 → 3 份（18 张）
    (r"^(\s*m0[1-4]: \[\]\.concat\(\.\.\.Array\()4(\)\.fill\([^\n]*\)\),)$",
     "\\g<1>3\\g<2>", 4, "四条敌池 4→3 份"),
    # ② m04 文案：每回合 +1 → 开场一次性 +2
    (r"^  m04: \{ id: 'm04',[^\n]*\},$",
     "  m04: { id: 'm04', name: '旧律裁决官', hp: 24, skill: '开场：己方全体护盾 +2' },", 1, "m04 文案"),
    # ③ m04 技能：每回合 +1 → 只在第 1 个 BOSS 回合开始 +2
    (r"  // 【雇佣兵协会】m04：每回合开始己方全体 \+2 护盾\n"
     r"  if \(st\.bossId === 'm04'\) \{\n"
     r"    api\(st, 'boss'\)\.allies\(null\)\.forEach\(a => \{ a\.shield \+= 1; \}\);\n"
     r"    log\(st, '  【头目技能】旧律裁决官：己方全体 \+1 护盾'\);\n"
     r"  \}",
     "  // 【雇佣兵协会】m04：**开场一次性**己方全体 +2 护盾（落在第 1 个 BOSS 回合开始；\n"
     "  // 因为 createBattle 那一刻 BOSS 场上还没有单位，所以「一次性」只能在这一刻兑现；不新增状态字段）\n"
     "  if (st.bossId === 'm04' && st.round <= 1) {\n"
     "    api(st, 'boss').allies(null).forEach(a => { a.shield += 2; });\n"
     "    log(st, '  【头目技能】旧律裁决官：开场己方全体 +2 护盾（仅一次）');\n"
     "  }", 1, "m04 一次性盾"),
    # ④ q6 亡语 2 → 1（卡定义：damage 与 text 一起改）
    (r"text: '锁链；亡语：对敌方所有单位造成 2 点伤害', kw: \{ taunt: true \}, "
     r"fx: \{ death\(u, api\) \{ api\.enemies\(u\)\.forEach\(e => api\.damage\(e, 2\)\); \} \} \}\);",
     "text: '锁链；亡语：对敌方所有单位造成 1 点伤害', kw: { taunt: true }, "
     "fx: { death(u, api) { api.enemies(u).forEach(e => api.damage(e, 1)); } } });", 1, "q6 亡语 2→1"),
    # ⑤ m03 文案：2 艘 → 1 艘
    (r"^  m03: \{ id: 'm03',[^\n]*\},$",
     "  m03: { id: 'm03', name: '忆潮主祭', hp: 28, skill: '每回合开始：随机冻结玩家 1 艘战舰' },", 1, "m03 文案"),
    # ⑥ m03 冻结 2 → 1（循环上界）
    (r"(  if \(st\.bossId === 'm03'\) \{\n    const picked = \[\];\n    for \(let i = 0; i < )2(; i\+\+\) \{)",
     "\\g<1>1\\g<2>", 1, "m03 冻结 2→1"),
]

POOLS_RULES = [
    # 头注释：24 → 18
    (r"/\*\* 敌池：每支势力 = 它那 6 张卡各 \*\*4\*\* 份（24 张）",
     "/** 敌池：每支势力 = 它那 6 张卡各 **3** 份（18 张）", 1, "pools.ts 头注释"),
    # 四条 [0,1,2,3] → [0,1,2]
    (r"\[0, 1, 2, 3\]\.flatMap", "[0, 1, 2].flatMap", 4, "pools.ts 四条 4→3 份"),
]


def main():
    dry = "--dry-run" in sys.argv
    if not os.path.isfile(DEMO):
        print("[x] 找不到 DEMO：" + DEMO)
        return 1

    with open(DEMO, "rb") as f:
        raw = f.read()
    has_bom = raw.startswith(b"\xef\xbb\xbf")
    text = raw.decode("utf-8-sig")
    pools_src = io.open(POOLS_TS, encoding="utf-8").read()

    if "Array(3).fill(" in text and "开场：己方全体护盾 +2" in text:
        print("[=] 已应用（池 18 张 + m04 一次性盾 + m03 冻 1 艘），不重复改。")
        return 0

    problems = []
    for pat, _rep, want, label in DEMO_RULES + POOLS_RULES:
        src = pools_src if label.startswith("pools.ts") else text
        n = len(re.findall(pat, src, re.M))
        if n != want:
            problems.append((label, n, want))
    if problems:
        print("[x] 以下替换命中数不对，**没有写任何文件**：")
        for label, n, want in problems:
            print("    %s → 命中 %d 次（要求 %d）" % (label, n, want))
        return 1

    if dry:
        print("[dry-run] %d 处替换全部命中（DEMO %d 处 / pools.ts %d 处），未写盘。"
              % (len(DEMO_RULES) + len(POOLS_RULES), len(DEMO_RULES), len(POOLS_RULES)))
        for _p, _r, _w, label in DEMO_RULES + POOLS_RULES:
            print("    ✓ " + label)
        return 0

    if not os.path.exists(BACKUP):
        shutil.copyfile(DEMO, BACKUP)
        print("[+] 已备份 " + BACKUP)
    else:
        print("[=] 备份已存在，不覆盖：" + BACKUP)

    for pat, rep, want, _label in DEMO_RULES:
        text = re.sub(pat, rep, text, count=want, flags=re.M)
    for pat, rep, want, _label in POOLS_RULES:
        pools_src = re.sub(pat, rep, pools_src, count=want, flags=re.M)

    data = text.encode("utf-8")
    if has_bom:
        data = b"\xef\xbb\xbf" + data
    with open(DEMO, "wb") as f:
        f.write(data)
    io.open(POOLS_TS, "w", encoding="utf-8", newline="\n").write(pools_src)
    print("[+] 已写回 DEMO 与 pools.ts")

    r = subprocess.run([NODE, "--check", DEMO], capture_output=True, text=True)
    if r.returncode != 0:
        print("[x] node --check 失败：\n" + (r.stderr or r.stdout))
        return 1
    print("[✓] node --check 语法通过")

    final = io.open(DEMO, encoding="utf-8-sig").read()
    checks = [
        ("四条池都是 Array(3)", len(re.findall(r"Array\(3\)\.fill\(", final)) == 4),
        ("m04 文案「开场：己方全体护盾 +2」", "开场：己方全体护盾 +2" in final),
        ("m04 技能只在 round<=1 生效", "st.bossId === 'm04' && st.round <= 1" in final),
        ("q6 亡语 1 点（text + fx 都改）", "造成 1 点伤害" in final and "api.damage(e, 1)" in final),
        ("m03 文案「冻结玩家 1 艘」", "随机冻结玩家 1 艘战舰" in final),
        ("m02 未动", "残响总控" in final),
    ]
    ok = True
    for label, hit in checks:
        print(("[✓] " if hit else "[x] ") + label)
        ok = ok and hit
    print(("[✓] " if "[0, 1, 2].flatMap" in pools_src else "[x] ") + "pools.ts 四条都改成 6×3")
    return 0 if ok else 1


if __name__ == "__main__":
    sys.exit(main())


