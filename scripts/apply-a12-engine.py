#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""A12 · 引擎批：p8 醒觉祭司舰（新 pending 种类 thaw）+ u9 声呐猎潜艇（自动锁定潜航）。

用法：
    python scripts/apply-a12-engine.py --dry-run
    python scripts/apply-a12-engine.py          # 备份 engine.js.bak-a12 后写盘

改动清单（只在 DEMO 里做；之后由导出产生生成物）：
  1. 新卡 p8 / u9 的 `def(...)`；
  2. API `beginThaw(max)`：候选 = **己方** `frozen > 0` 的战舰（**不套 beginChoose 的 `!subm` 过滤**，
     因为解锁的是自己人；潜航是"不能被选中"，与本功能无关）；
  3. `resolvePending` 加 `thaw` 分支：把选中单位 `frozen = 0`；
  4. `PENDING_LABEL` / `PENDING_HINT` 加 `thaw`；
  5. `FLEET_ALL` 加 p8 / u9（39 → 41）。

⚠ 数量自适应：`n = Math.min(2, 己方冻结数)`；**冻结数 = 0 时 `beginThaw` 直接返回 null 并打日志**
  （不发 pending → 卡能正常上场、不卡手）。
⚠ u9 只在**这张卡的效果里**遍历 `enemies()` 取潜航单位（`api.enemies(u).filter(e => e.subm)`），
  **不改全局目标规则**（`beginChoose` 的 `!subm` 过滤原样保留）。
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
BACKUP = DEMO + ".bak-a12"
NODE = r"C:\Users\Master\.dsh\dsh-runtimes\dsh-primary-runtime\dependencies\node\bin\node.exe"

NEW_DEFS = """// ---------------- 2026-10 引擎批：2 张新卡（p8 醒觉 / u9 声呐） ----------------
def({ id: 'p8', name: '醒觉祭司舰', cost: 3, atk: 2, shield: 3, structure: 1, series: '灵能', rarity: '蓝',
  text: '入场：解除己方最多 2 艘战舰的冻结状态（自己选择）',
  fx: { play(u, api) { api.beginThaw(2); } } });
def({ id: 'u9', name: '声呐猎潜艇', cost: 4, atk: 3, shield: 4, structure: 1, series: '通用', rarity: '蓝',
  text: '入场：对一艘敌方潜航战舰造成 3 点伤害；若敌方没有潜航战舰，改为对随机一艘敌方战舰造成 1 点伤害',
  fx: { play(u, api) {
    // 只在**这张卡的效果里**绕过潜航过滤：潜航单位不在合法目标里，但可以按 unitsOf 遍历出来
    const subs = api.enemies(u).filter(e => e.subm);
    if (subs.length) {
      const t = subs[Math.floor(api.st.rnd() * subs.length)];
      api.damage(t, 3);
      log(api.st, `  【声呐】锁定潜航中的 ${t.name}，造成 3 点伤害`);
    } else {
      const e = api.randomEnemy();
      if (e) { api.damage(e, 1); log(api.st, `  【声呐】没有潜航目标，改打 ${e.name} 1 点`); }
    }
  } } });

// ---------------- 卡池 ----------------"""

RULES = [
    # ① 两张新卡
    (r"// ---------------- 卡池 ----------------", NEW_DEFS, 1, "p8 / u9 的 def"),
    # ② FLEET_ALL 加 p8 / u9（39 → 41）
    (r"'p1', 'p2', 'p3', 'p4', 'p5', 'p6', 'p7',",
     "'p1', 'p2', 'p3', 'p4', 'p5', 'p6', 'p7', 'p8',", 1, "FLEET_ALL + p8"),
    (r"'g1', 'g2', 'g3', 'g4', 'g5', 'g6', 'g7', 'u7', 'u8',",
     "'g1', 'g2', 'g3', 'g4', 'g5', 'g6', 'g7', 'u7', 'u8', 'u9',", 1, "FLEET_ALL + u9"),
    # ③ API beginThaw（插在 beginChoose 之前）
    (r"    // 需要玩家指定目标的入场效果：挂一个「待选择」，交给玩家点",
     "    // 【2026-10】解锁：候选 = **己方**被冻结的战舰（不套 beginChoose 的 !subm 过滤；\n"
     "    //   潜航是「不能被选中」，与本功能无关）。数量自适应：n = min(max, 冻结数)；冻结数 0 → 落空不发 pending。\n"
     "    beginThaw(max) {\n"
     "      const pool = unitsOf(st, side).filter(x => x.frozen > 0);\n"
     "      if (!pool.length) { log(st, '  【醒觉】己方没有被冻结的战舰，效果落空'); return null; }\n"
     "      const n = Math.min(max, pool.length);\n"
     "      st.pending = { side, kind: 'thaw', cands: pool.map(x => x.uid), need: n, picked: [] };\n"
     "      log(st, `  【醒觉】等待选择目标（${n} 艘，己方被冻结的战舰）…`);\n"
     "      return st.pending;\n"
     "    },\n"
     "    // 需要玩家指定目标的入场效果：挂一个「待选择」，交给玩家点", 1, "API beginThaw"),
    # ④ resolvePending 加 thaw 分支（插在 freeze 分支之后）
    (r"  \} else if \(kind === 'revive'\) \{",
     "  } else if (kind === 'thaw') {\n"
     "    picks.forEach(id => {\n"
     "      const t = findUnit(st, id);\n"
     "      if (t) { t.frozen = 0; log(st, `  【醒觉】解锁 ${t.name}`); }\n"
     "    });\n"
     "  } else if (kind === 'revive') {", 1, "resolvePending thaw 分支"),
    # ⑤ PENDING_LABEL / HINT
    (r"const PENDING_LABEL = \{ copy: '记忆掠夺者', smite: '神罚', freeze: '冻结', revive: '召回', steal: '控制' \};",
     "const PENDING_LABEL = { copy: '记忆掠夺者', smite: '神罚', freeze: '冻结', revive: '召回', steal: '控制', thaw: '醒觉' };",
     1, "PENDING_LABEL + thaw"),
    (r"const PENDING_HINT = \{ copy: '双方场上都可以', smite: '敌方场上', freeze: '敌方场上', revive: '点下方墓地里的友舰', steal: '敌方场上' \};",
     "const PENDING_HINT = { copy: '双方场上都可以', smite: '敌方场上', freeze: '敌方场上', revive: '点下方墓地里的友舰', steal: '敌方场上', thaw: '己方被冻结的战舰' };",
     1, "PENDING_HINT + thaw"),
]


def main():
    dry = "--dry-run" in sys.argv
    if not os.path.isfile(DEMO):
        print("[x] 找不到 DEMO：" + DEMO)
        return 1
    raw = open(DEMO, "rb").read()
    has_bom = raw.startswith(b"\xef\xbb\xbf")
    text = raw.decode("utf-8-sig")

    if "id: 'p8'" in text and "beginThaw" in text and "'u9'" in text:
        print("[=] 已应用（p8/u9 + beginThaw + FLEET_ALL 都在），不重复改。")
        return 0

    problems = []
    for pat, _rep, want, label in RULES:
        n = len(re.findall(pat, text, re.M))
        if n != want:
            problems.append((label, n, want))
    if problems:
        print("[x] 以下替换命中数不对，**没有写任何文件**：")
        for label, n, want in problems:
            print("    %s → 命中 %d 次（要求 %d）" % (label, n, want))
        return 1

    if dry:
        print("[dry-run] %d 处全部命中，未写盘。" % len(RULES))
        for _p, _r, _w, label in RULES:
            print("    ✓ " + label)
        return 0

    if not os.path.exists(BACKUP):
        shutil.copyfile(DEMO, BACKUP)
        print("[+] 已备份 " + BACKUP)
    else:
        print("[=] 备份已存在，不覆盖：" + BACKUP)

    out = text
    for pat, rep, want, _label in RULES:
        out = re.sub(pat, rep, out, count=want, flags=re.M)
    data = out.encode("utf-8")
    if has_bom:
        data = b"\xef\xbb\xbf" + data
    open(DEMO, "wb").write(data)
    print("[+] 已写回 " + DEMO)

    r = subprocess.run([NODE, "--check", DEMO], capture_output=True, text=True)
    if r.returncode != 0:
        print("[x] node --check 失败：\n" + (r.stderr or r.stdout))
        return 1
    print("[✓] node --check 语法通过")

    final = io.open(DEMO, encoding="utf-8-sig").read()
    checks = [
        ("p8 / u9 def", "id: 'p8'" in final and "id: 'u9'" in final),
        ("beginThaw 存在且只选己方冻结", "beginThaw(max)" in final and "filter(x => x.frozen > 0)" in final),
        ("冻结 0 不发 pending", "己方没有被冻结的战舰，效果落空" in final),
        ("resolvePending 处理 thaw", "kind === 'thaw'" in final and "t.frozen = 0;" in final),
        ("PENDING_LABEL / HINT", "thaw: '醒觉'" in final and "thaw: '己方被冻结的战舰'" in final),
        ("u9 只在卡内绕过潜航", "api.enemies(u).filter(e => e.subm)" in final),
        ("FLEET_ALL 加 p8/u9", "'p8'" in final and "'u9'" in final),
    ]
    ok = True
    for label, hit in checks:
        print(("[✓] " if hit else "[x] ") + label)
        ok = ok and hit
    return 0 if ok else 1


if __name__ == "__main__":
    sys.exit(main())
