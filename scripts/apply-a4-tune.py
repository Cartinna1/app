#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""A4 · 四处头目数值微调落到 DEMO（m04 hp/频率、m02 叠层、m03 上限+前 5 回合）。

用法：
    python scripts/apply-a4-tune.py --dry-run   # 只校验四处旧串是否唯一命中，不写盘
    python scripts/apply-a4-tune.py             # 先备份 engine.js.bak-a4，再写盘并自检

退出码：0 = 成功 / 已应用；1 = 任何异常（任一旧串不唯一 → 整体不写盘）。
⚠ 不新增任何状态字段：频率与上限都用**引擎已有的回合数** `st.round` 判断。
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
BACKUP = DEMO + ".bak-a4"
NODE = r"C:\Users\Master\.dsh\dsh-runtimes\dsh-primary-runtime\dependencies\node\bin\node.exe"

# (旧串, 新串, 标签)
RULES = [
    # ① m04 血量 34 → 30（连带把技能文案改成"每 2 回合"）
    (
        "  m04: { id: 'm04', name: '旧律裁决官', hp: 34, skill: '己方全体护盾 +2；每回合结束：对玩家本体造成 1 点伤害（不经过护盾）' },",
        "  m04: { id: 'm04', name: '旧律裁决官', hp: 30, skill: '己方全体护盾 +2；每 2 回合结束：对玩家本体造成 1 点伤害（不经过护盾）' },",
        "m04 hp 34→30 + 文案",
    ),
    # ② m04 本体伤害改为每 2 回合一次（第 2/4/6… 回合末；用 st.round 判断，不新增状态）
    (
        "    if (st.bossId === 'm04') {\n"
        "      damageBody(st, 'player', 1);\n"
        "      log(st, `  【头目技能】旧律裁决：你的本体 -1（当前 ${S(st, 'player').body}，无视护盾）`);\n"
        "    }",
        "    if (st.bossId === 'm04' && st.round % 2 === 0) {\n"
        "      damageBody(st, 'player', 1);\n"
        "      log(st, `  【头目技能】旧律裁决：你的本体 -1（第 ${st.round} 回合末，每 2 回合一次；当前 ${S(st, 'player').body}，无视护盾）`);\n"
        "    }",
        "m04 频率 → 每 2 回合",
    ),
    # ③ m02 全体攻 +1：一次性 → 每回合开始 +1、上限 +3（用 st.round <= 3 表示"已叠到 3 层"，不新增字段）
    (
        "    const bs2 = S(st, 'boss');\n"
        "    if (!bs2.bossBuffed) {\n"
        "      bs2.bossBuffed = true;\n"
        "      api(st, 'boss').allies(null).forEach(a => { a.atk += 1; });\n"
        "      log(st, '  【头目技能】残响总控：己方全体攻击 +1');\n"
        "    }",
        "    // 每回合开始 +1、上限 +3（第 1/2/3 回合各叠一层；不用 bossBuffed、不新增字段）\n"
        "    if (st.round <= 3) {\n"
        "      api(st, 'boss').allies(null).forEach(a => { a.atk += 1; });\n"
        "      log(st, `  【头目技能】残响总控：己方全体攻击 +1（第 ${st.round}/3 层，上限 +3）`);\n"
        "    }",
        "m02 攻 → 每回合 +1 上限 +3",
    ),
    # ④ m03 指挥度压制：无上限 → 最多 2 点，且只在前 5 回合生效（第 6 回合起不压、已压的不恢复）
    (
        "    const n3 = api(st, 'boss').allies(null).filter(u => u.series === '灵潮').length;\n"
        "    if (n3 > 0) {\n"
        "      S(st, 'player').capBonus -= n3;\n"
        "      log(st, `  【头目技能】忆潮主祭：${n3} 艘灵潮战舰，你方本回合指挥度 -${n3}`);\n"
        "    }",
        "    const n3 = api(st, 'boss').allies(null).filter(u => u.series === '灵潮').length;\n"
        "    if (n3 > 0 && st.round <= 5) {\n"
        "      const cut = Math.min(2, n3);\n"
        "      S(st, 'player').capBonus -= cut;\n"
        "      log(st, `  【头目技能】忆潮主祭：${n3} 艘灵潮战舰，你方本回合指挥度 -${cut}（最多 2，仅前 5 回合）`);\n"
        "    }",
        "m03 上限 2 + 前 5 回合",
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

    # 幂等：四条都已落地就退出
    if "st.round % 2 === 0" in text and "const cut = Math.min(2, n3);" in text and "hp: 30" in text:
        print("[=] 已应用（m04 每 2 回合 / m03 上限 2 / m04 hp 30 都在），不重复改。")
        return 0

    problems = []
    for old, new, label in RULES:
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
        for old, _new, label in RULES:
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

    # 自检 1：语法
    r = subprocess.run([NODE, "--check", DEMO], capture_output=True, text=True)
    if r.returncode != 0:
        print("[x] node --check 失败：\n" + (r.stderr or r.stdout))
        return 1
    print("[✓] node --check 语法通过")

    # 自检 2：四条落地证据
    final = io.open(DEMO, encoding="utf-8-sig").read()
    checks = [
        ("m04 hp = 30", "hp: 30, skill: '己方全体护盾 +2；每 2 回合结束" in final),
        ("m04 每 2 回合一次", "st.bossId === 'm04' && st.round % 2 === 0" in final),
        ("m02 叠层（round <= 3）", "st.round <= 3" in final and "上限 +3" in final),
        ("m03 上限 2 + 前 5 回合", "const cut = Math.min(2, n3);" in final and "st.round <= 5" in final),
    ]
    ok = True
    for label, hit in checks:
        print(("[✓] " if hit else "[x] ") + label)
        if not hit:
            ok = False
    return 0 if ok else 1


if __name__ == "__main__":
    sys.exit(main())
