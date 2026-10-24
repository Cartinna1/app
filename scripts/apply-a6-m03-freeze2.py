#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""A6（最后一刀）· m03：随机冻结玩家 1 艘 → 2 艘（各 1 回合）。

用法：
    python scripts/apply-a6-m03-freeze2.py --dry-run   # 只校验两处旧串是否唯一命中，不写盘
    python scripts/apply-a6-m03-freeze2.py             # 先备份 engine.js.bak-a6，再写盘并自检

退出码：0 = 成功 / 已应用；1 = 任何异常（任一旧串不唯一 → 整体不写盘）。
⚠ 只用 DEMO 既有 api（`api(st,'boss').randomEnemy()` / `.freeze(u, 1)`）；第二次抽样抽到同一艘就停
   （等价于"排除已冻结的那艘"），因此玩家只有 1 艘时只冻 1 艘、绝不冻同一艘两次。
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
BACKUP = DEMO + ".bak-a6"
NODE = r"C:\Users\Master\.dsh\dsh-runtimes\dsh-primary-runtime\dependencies\node\bin\node.exe"

RULES = [
    # ① 文案：1 艘 → 2 艘
    (
        "  m03: { id: 'm03', name: '忆潮主祭', hp: 28, skill: '每回合开始：随机冻结玩家 1 艘战舰' },",
        "  m03: { id: 'm03', name: '忆潮主祭', hp: 28, skill: '每回合开始：随机冻结玩家 2 艘战舰' },",
        "m03 文案 1→2",
    ),
    # ② 分支：单次随机 → 两次随机（第二次排除已选中的那艘），一条 log
    (
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
        "  // 【雇佣兵协会】m03：每回合开始随机冻结玩家 2 艘战舰（各 1 回合；写法照 b1 的冻结）\n"
        "  if (st.bossId === 'm03') {\n"
        "    const picked = [];\n"
        "    for (let i = 0; i < 2; i++) {\n"
        "      const cand = api(st, 'boss').randomEnemy();\n"
        "      if (!cand) break;                      // 玩家场上没有战舰\n"
        "      if (picked.indexOf(cand) >= 0) break;  // 抽到已选中的那艘 → 只剩它可选，停\n"
        "      picked.push(cand);\n"
        "    }\n"
        "    if (picked.length === 0) {\n"
        "      log(st, '  【头目技能】忆潮主祭：你场上没有战舰，冻结落空');\n"
        "    } else {\n"
        "      picked.forEach(u => api(st, 'boss').freeze(u, 1));\n"
        "      const suffix = picked.length === 1 ? '（1 回合）' : '（各 1 回合）';\n"
        "      log(st, `  【头目技能】忆潮主祭：冻结 ${picked.map(u => u.name).join('、')}${suffix}`);\n"
        "    }\n"
        "  }",
        "m03 分支 → 冻结 2 艘",
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

    if "picked.indexOf(cand) >= 0" in text and "随机冻结玩家 2 艘战舰" in text:
        print("[=] 已应用（m03 已是「冻结 2 艘 + 排除已选」），不重复改。")
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
        print("[dry-run] 2 处替换全部唯一命中，未写盘。")
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
    seg = final.split("bossId === 'm03'")[1][:900] if "bossId === 'm03'" in final else ""
    checks = [
        ("m03 文案「2 艘」", "随机冻结玩家 2 艘战舰" in final),
        ("m03 两次 randomEnemy", seg.count("randomEnemy()") == 1 and "for (let i = 0; i < 2; i++)" in seg),
        ("m03 排除已选中", "picked.indexOf(cand) >= 0" in seg),
        ("m03 不再含 capBonus", "capBonus" not in seg),
        ("m03 文案分支（1 艘 / 多艘）", "（1 回合）" in seg and "（各 1 回合）" in seg),
    ]
    ok = True
    for label, hit in checks:
        print(("[✓] " if hit else "[x] ") + label)
        if not hit:
            ok = False
    return 0 if ok else 1


if __name__ == "__main__":
    sys.exit(main())

