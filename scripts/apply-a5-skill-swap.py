#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""A5 · 第二轮定案：m03 技能整段换成「随机冻结玩家 1 艘」，m04 删掉本体伤害只留全体 +2 盾。

用法：
    python scripts/apply-a5-skill-swap.py --dry-run   # 只校验四处旧串是否唯一命中，不写盘
    python scripts/apply-a5-skill-swap.py             # 先备份 engine.js.bak-a5，再写盘并自检

退出码：0 = 成功 / 已应用；1 = 任何异常（任一旧串不唯一 → 整体不写盘）。
⚠ 只用 DEMO 既有 api：`api(st,'boss').randomEnemy()` + `.freeze(u, 1)`（与 b1 冻结同一套）。
"""

import io
import os
import shutil
import subprocess
import sys

try:
    sys.stdout.reconfigure(encoding="utf-8", errors="replace")
except Exception:  # noqa: BLE001
    pass

DEMO = r"E:\生涯之旅游戏\carddemo\engine.js"
BACKUP = DEMO + ".bak-a5"
NODE = r"C:\Users\Master\.dsh\dsh-runtimes\dsh-primary-runtime\dependencies\node\bin\node.exe"

# (旧串, 新串, 标签)
RULES = [
    # ① m03 技能文案：指挥度压制 → 随机冻结 1 艘
    (
        "  m03: { id: 'm03', name: '忆潮主祭', hp: 28, skill: '前 5 回合的每回合开始：己方场上每有一艘灵潮战舰，你方本回合指挥度 -1（最多 -2）' },",
        "  m03: { id: 'm03', name: '忆潮主祭', hp: 28, skill: '每回合开始：随机冻结玩家 1 艘战舰' },",
        "m03 文案",
    ),
    # ② m03 分支：整段换掉（capBonus / Math.min(2, n3) / round <= 5 全部移除）
    (
        "  // 【雇佣兵协会】m03：每回合开始按己方灵潮战舰数压玩家指挥度\n"
        "  if (st.bossId === 'm03') {\n"
        "    const n3 = api(st, 'boss').allies(null).filter(u => u.series === '灵潮').length;\n"
        "    if (n3 > 0 && st.round <= 5) {\n"
        "      const cut = Math.min(2, n3);\n"
        "      S(st, 'player').capBonus -= cut;\n"
        "      log(st, `  【头目技能】忆潮主祭：${n3} 艘灵潮战舰，你方本回合指挥度 -${cut}（最多 2，仅前 5 回合）`);\n"
        "    }\n"
        "  }",
        "  // 【雇佣兵协会】m03：每回合开始随机冻结玩家 1 艘战舰（写法照 b1 的冻结）\n"
        "  if (st.bossId === 'm03') {\n"
        "    const frozen = api(st, 'boss').randomEnemy();\n"
        "    if (frozen) {\n"
        "      api(st, 'boss').freeze(frozen, 1);\n"
        "      log(st, `  【头目技能】忆潮主祭：冻结 ${frozen.name}（1 回合）`);\n"
        "    } else {\n"
        "      log(st, '  【头目技能】忆潮主祭：你场上没有战舰，冻结落空');\n"
        "    }\n"
        "  }",
        "m03 分支 → 冻结",
    ),
    # ③ m04 文案：去掉本体伤害字样
    (
        "  m04: { id: 'm04', name: '旧律裁决官', hp: 30, skill: '己方全体护盾 +2；每 2 回合结束：对玩家本体造成 1 点伤害（不经过护盾）' },",
        "  m04: { id: 'm04', name: '旧律裁决官', hp: 30, skill: '己方全体护盾 +2' },",
        "m04 文案",
    ),
    # ④ m04 回合末分支：整段删除（保留回合开始的"全体 +2 盾"）
    (
        "\n"
        "    // 【雇佣兵协会】m04：回合结束对玩家本体 1 点（不经护盾）\n"
        "    if (st.bossId === 'm04' && st.round % 2 === 0) {\n"
        "      damageBody(st, 'player', 1);\n"
        "      log(st, `  【头目技能】旧律裁决：你的本体 -1（第 ${st.round} 回合末，每 2 回合一次；当前 ${S(st, 'player').body}，无视护盾）`);\n"
        "    }",
        "",
        "m04 删本体伤害",
    ),
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

    m03_ok = "冻结玩家 1 艘战舰" in text and "randomEnemy()" in text and "capBonus -= cut" not in text
    m04_ok = "damageBody(st, 'player', 1);" not in text.split("bossId === 'm04'")[1][:400]
    if m03_ok and m04_ok:
        print("[=] 已应用（m03 已有冻结、m04 已无本体伤害），不重复改。")
        return 0

    problems = []
    for old, _new, label in RULES:
        n = text.count(old)
        if n != 1:
            problems.append((label, n))
    if problems:
        print("[x] 以下替换不唯一，**没有写任何文件**：")
        for label, n in problems:
            print("    %s → 命中 %d 次（要求 1）" % (label, n))
        return 1

    if dry:
        print("[dry-run] 4 处替换全部唯一命中，未写盘。")
        for _old, _new, label in RULES:
            print("    ✓ " + label)
        return 0

    if not os.path.exists(BACKUP):
        shutil.copyfile(DEMO, BACKUP)
        print("[+] 已备份 " + BACKUP)
    else:
        print("[=] 备份已存在，不覆盖：" + BACKUP)

    out = text
    for old, new, _label in RULES:
        out = out.replace(old, new, 1)

    data = out.encode("utf-8")
    if has_bom:
        data = b"\xef\xbb\xbf" + data
    with open(DEMO, "wb") as f:
        f.write(data)
    print("[+] 已写回 " + DEMO + ("（保留 BOM）" if has_bom else "（无 BOM）"))

    r = subprocess.run([NODE, "--check", DEMO], capture_output=True, text=True)
    if r.returncode != 0:
        print("[x] node --check 失败：\n" + (r.stderr or r.stdout))
        return 1
    print("[✓] node --check 语法通过")

    final = io.open(DEMO, encoding="utf-8-sig").read()
    m03_block = final.split("bossId === 'm03'")[1][:500] if "bossId === 'm03'" in final else ""
    m04_block = final.split("bossId === 'm04'")[1][:400] if "bossId === 'm04'" in final else ""
    checks = [
        ("m03 含 freeze", "freeze(frozen, 1)" in m03_block),
        ("m03 不再含 capBonus", "capBonus" not in m03_block),
        ("m03 文案", "skill: '每回合开始：随机冻结玩家 1 艘战舰'" in final),
        ("m04 不再含 damageBody", "damageBody" not in m04_block),
        ("m04 文案", "skill: '己方全体护盾 +2'" in final),
        ("m04 保留全体 +2 盾", "a.shield += 2;" in m04_block),
    ]
    ok = True
    for label, hit in checks:
        print(("[✓] " if hit else "[x] ") + label)
        if not hit:
            ok = False
    return 0 if ok else 1


if __name__ == "__main__":
    sys.exit(main())
