#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""A8 · 只处理 m01/m04 的"拖延症"+ 敌池 5→4 份（一次跑完 4 处）。

用法：
    python scripts/apply-a8-tune2.py --dry-run   # 只校验每处是否唯一命中，不写盘
    python scripts/apply-a8-tune2.py             # 先备份 engine.js.bak-a8，再写盘并自检

退出码：0 = 成功 / 已应用；1 = 任何异常（任一处命中数 ≠ 期望 → 整体不写盘）。

⚠ **敌池口径变更（用户 2026-10 定）**：敌池 30 张（6×5）→ **24 张（6×4）**。
   理由是扫描实测：30 张时 m02/m03 过强，削到 24 张后 m02 35→45%、m03 37→79%。
   `src/data/mercenary/pools.ts` 已按同一口径改（6×4），两边必须一致。

⚠ m02 / m03 的技能**一个字都不动**。
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

DEMO = r"E:\生涯之旅游戏\carddemo\engine.js"
BACKUP = DEMO + ".bak-a8"
NODE = r"C:\Users\Master\.dsh\dsh-runtimes\dsh-primary-runtime\dependencies\node\bin\node.exe"

# (正则, 新串, 期望命中数, 标签)
RULES = [
    # ① 敌池 5 → 4 份（MERC_POOLS 四条一起改；缩进是 4 空格）
    (r"^(\s*m0[1-4]: \[\]\.concat\(\.\.\.Array\()5(\)\.fill\([^\n]*\)\),)$",
     "\\g<1>4\\g<2>", 4, "四条敌池 5→4 份"),
    # ② m04：hp 30 → 24，文案改成「每回合开始：己方全体护盾 +1」
    (r"^  m04: \{ id: 'm04',[^\n]*\},$",
     "  m04: { id: 'm04', name: '旧律裁决官', hp: 24, skill: '每回合开始：己方全体护盾 +1' },", 1, "m04 hp/文案"),
    # ③ m04 每回合全体 +2 盾 → +1 盾（连日志文案）
    (r"api\(st, 'boss'\)\.allies\(null\)\.forEach\(a => \{ a\.shield \+= 2; \}\);",
     "api(st, 'boss').allies(null).forEach(a => { a.shield += 1; });", 1, "m04 盾 +2→+1"),
    (r"log\(st, '  【头目技能】旧律裁决官：己方全体 \+2 护盾'\);",
     "log(st, '  【头目技能】旧律裁决官：己方全体 +1 护盾');", 1, "m04 盾日志"),
    # ④ m01：hp 30 → 24，开场 2 艘 → 1 艘，文案同步
    (r"^  m01: \{ id: 'm01',[^\n]*\},$",
     "  m01: { id: 'm01', name: '噬星母巢', hp: 24, skill: '开场自带 1 艘噬星幼虫；每回合结束：若己方场上不足 2 艘，召唤 1 艘噬星幼虫（q1）' },",
     1, "m01 hp/文案"),
    (r"(  if \(bossId === 'm01'\) \{\n    for \(let i = 0; i < )2(; i\+\+\) \{)",
     "\\g<1>1\\g<2>", 1, "m01 开场 2→1"),
    (r"log\(st, '【头目技能】噬星母巢开场自带 2 艘噬星幼虫'\);",
     "log(st, '【头目技能】噬星母巢开场自带 1 艘噬星幼虫');", 1, "m01 开场日志"),
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

    if "Array(4).fill(" in text and "hp: 24, skill: '每回合开始：己方全体护盾 +1'" in text:
        print("[=] 已应用（池 24 张 + m01/m04 hp 24 + m04 盾 +1），不重复改。")
        return 0

    problems = []
    for pat, rep, want, label in RULES:
        n = len(re.findall(pat, text, re.M))
        if n != want:
            problems.append((label, n, want))
    if problems:
        print("[x] 以下替换命中数不对，**没有写任何文件**：")
        for label, n, want in problems:
            print("    %s → 命中 %d 次（要求 %d）" % (label, n, want))
        return 1

    if dry:
        print("[dry-run] %d 处替换全部唯一命中，未写盘。" % len(RULES))
        for _p, _r, _w, label in RULES:
            print("    ✓ " + label)
        return 0

    if not os.path.exists(BACKUP):
        shutil.copyfile(DEMO, BACKUP)
        print("[+] 已备份 " + BACKUP)
    else:
        print("[=] 备份已存在，不覆盖：" + BACKUP)

    out = text
    for pat, rep, _want, _label in RULES:
        out = re.sub(pat, rep, out, count=want, flags=re.M)

    data = out.encode("utf-8")
    if has_bom:
        data = b"\xef\xbb\xbf" + data
    with open(DEMO, "wb") as f:
        f.write(data)
    print("[+] 已写回 " + DEMO)

    r = subprocess.run([NODE, "--check", DEMO], capture_output=True, text=True)
    if r.returncode != 0:
        print("[x] node --check 失败：\n" + (r.stderr or r.stdout))
        return 1
    print("[✓] node --check 语法通过")

    final = io.open(DEMO, encoding="utf-8-sig").read()
    checks = [
        ("四条池都是 Array(4)", len(re.findall(r"Array\(4\)\.fill\(", final)) == 4),
        ("m04 hp 24 + 文案 +1 盾", "hp: 24, skill: '每回合开始：己方全体护盾 +1'" in final),
        ("m04 盾代码 +1", "a.shield += 1; });" in final),
        ("m01 hp 24", re.search(r"m01: \{ id: 'm01', name: '噬星母巢', hp: 24,", final) is not None),
        ("m01 开场 1 艘", "for (let i = 0; i < 1; i++)" in final),
        ("m02 / m03 未动", "残响总控" in final and "忆潮主祭" in final),
    ]
    ok = True
    for label, hit in checks:
        print(("[✓] " if hit else "[x] ") + label)
        ok = ok and hit
    return 0 if ok else 1


if __name__ == "__main__":
    sys.exit(main())

