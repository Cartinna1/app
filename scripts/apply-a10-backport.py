#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""A10 · 把「2026-10-26 直改生成物」的修复回灌进 DEMO（carddemo/engine.js）。

用法：
    python scripts/apply-a10-backport.py --dry-run   # 只校验每处命中数，不写盘
    python scripts/apply-a10-backport.py             # 先备份 engine.js.bak-a10，再写盘并自检

退出码：0 = 成功 / 已应用；1 = 任何异常（任一处命中数不对 → 整体不写盘）。
回灌后重跑 export-battle-data.cjs，生成物由导出产生，verify-battle-data / audit-battle-port 重新变绿。

⚠ g2（`api.mana() >= 4` → `manaBefore()`）在 DEMO 里**已经是**新写法，故本脚本不含该项。
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
BACKUP = DEMO + ".bak-a10"
NODE = r"C:\Users\Master\.dsh\dsh-runtimes\dsh-primary-runtime\dependencies\node\bin\node.exe"

# (正则, 替换, 期望命中数, 标签)
RULES = [
    # ================= 1. manaCarry 机制 =================
    (r"(\n    cap: startCap, cur: 0, capBonus: 0,)",
     "\\g<1> manaCarry: 0,", 1, "makeSide 初始化 manaCarry"),
    (r"\n  s\.cur = s\.cap;",
     "\n  // 【2026-10 结转机制】上回合结转的指挥度在此兑现，随即清零（无结转时行为与改前完全一致）\n"
     "  s.cur = s.cap + s.manaCarry;\n  s.manaCarry = 0;", 1, "startTurn 兑现 manaCarry"),
    (r"\n    mana: \(\) => S\(st, side\)\.cur,",
     "\n    mana: () => S(st, side).cur,\n"
     "    // 【2026-10 结转机制】回合结束 / 给对方 +N 指挥度必须走结转，否则会被下回合 `cur = cap` 抹掉\n"
     "    carryMana: (n) => { S(st, side).manaCarry += n; },\n"
     "    carryManaFoe: (n) => { S(st, other(side)).manaCarry += n; },", 1, "API carryMana / carryManaFoe"),
    # ================= 2. g3 / r5 / g5 文案与实装 =================
    (r"  text: '回合结束：本回合指挥度 \+1',\n  fx: \{ turnEnd\(u, api\) \{ api\.gainMana\(1\); \} \} \}\);",
     "  text: '回合结束：下回合指挥度 +1',\n  fx: { turnEnd(u, api) { api.carryMana(1); } } });", 1, "g3 文案+结转"),
    (r"  text: '入场：双方各获得 1 点指挥度',\n  fx: \{ play\(u, api\) \{ api\.gainMana\(1\); api\.gainManaFoe\(1\); \} \} \}\);",
     "  text: '入场：双方各获得 1 点指挥度（对方的存至其下回合）',\n"
     "  fx: { play(u, api) { api.gainMana(1); api.carryManaFoe(1); } } });", 1, "r5 文案+结转"),
    (r"  text: '入场：你所有舰船的指挥度 -1（最低为 1）',",
     "  text: '入场：本局内你部署舰船的费用 -1（最低为 1）',", 1, "g5 文案"),
    # ================= 3. 衍生单位身材文案 =================
    (r"召唤 2 个 1/1/0 的修士舰", "召唤 2 个 1/0/1 的修士舰", 1, "h5 文案"),
    (r"3 攻/2 盾/0", "3 攻/1 盾/1", 1, "p3 文案"),
    # ================= 4. y4 冻结去重 =================
    (r"fx: \{ play\(u, api\) \{ for \(let i = 0; i < 2; i\+\+\) \{ const e = api\.randomEnemy\(\); if \(e\) api\.freeze\(e, 1\); \} \} \} \}\);",
     "fx: { play(u, api) { const seen = []; for (let i = 0; i < 2; i++) {\n"
     "      const pool = api.enemies(u).filter(x => seen.indexOf(x) < 0);\n"
     "      if (!pool.length) break;\n"
     "      const e = pool[Math.floor(api.st.rnd() * pool.length)];\n"
     "      seen.push(e); api.freeze(e, 1);\n"
     "    } } } });", 1, "y4 去重（第二次从剩余里抽）"),
    # ================= 5. b1 冻结目标随机化 =================
    (r"    const t = api\(st, 'boss'\)\.topEnemies\(n\);\n    t\.forEach\(u => api\(st, 'boss'\)\.freeze\(u, 1\)\);",
     "    // 【2026-10】目标改为**随机不重复**抽取（文案写「随机」，旧实现是点名攻击力最高的）\n"
     "    const pool = unitsOf(st, 'player').slice();\n"
     "    const t = [];\n"
     "    for (let i = 0; i < n && pool.length; i++) {\n"
     "      const idx = Math.floor(st.rnd() * pool.length);\n"
     "      t.push(pool.splice(idx, 1)[0]);\n"
     "    }\n"
     "    t.forEach(u => api(st, 'boss').freeze(u, 1));", 1, "b1 随机目标"),
    # ================= 6. 文案：b1 / b3 / m01 召唤物 =================
    (r"开场自带 1 艘 1/2 杂兵", "开场自带 1 艘 1/1/1 杂兵", 1, "b1 技能文案 1/1/1"),
    (r"海盗杂兵 1/2/0", "海盗杂兵 1/1/1", 1, "b1 开场日志 1/1/1"),
    (r"本体血量 ≤22 时全体己方 \+4 攻（仅一次），且每 3 个 BOSS 回合玩家本体 -1",
     "本体血量首次 ≤22 时：全体己方 +4 攻（仅一次），每 3 个 BOSS 回合对你的本体造成 1 点伤害", 1, "b3 技能文案（逐字）"),
    (r"噬星幼虫", "孢子浮囊", 5, "m01 召唤物名 → 孢子浮囊（技能+日志，共 5 处）"),
    # ================= 7. m01~m04 显示名 → 势力名 =================
    (r"噬星母巢", "噬星虫群", 3, "m01 名 → 噬星虫群（BOSSES + 2 日志）"),
    (r"残响总控", "残响智械", 3, "m02 名 → 残响智械（BOSSES + 2 日志）"),
    (r"忆潮主祭", "忆潮灵能者", 3, "m03 名 → 忆潮灵能者（BOSSES + 2 日志）"),
    (r"旧律裁决官", "旧律军团", 2, "m04 名 → 旧律军团（BOSSES + 1 日志）"),
    # ================= 8. 本体 15 → 25 =================
    (r"const BODY_HP = 15;", "const BODY_HP = 25;", 1, "bodyHp 15 → 25"),
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

    if "manaCarry" in text and "carryManaFoe" in text and "const BODY_HP = 25;" in text:
        print("[=] 已应用（manaCarry / carryMana / BODY_HP=25 都在），不重复改。")
        return 0

    problems = []
    detail = []
    for pat, rep, want, label in RULES:
        n = len(re.findall(pat, text, re.M))
        detail.append((label, n, want))
        if n != want:
            problems.append((label, n, want))
    if problems:
        print("[x] 以下替换命中数不对，**没有写任何文件**：")
        for label, n, want in problems:
            print("    %s → 命中 %d 次（要求 %d）" % (label, n, want))
        return 1

    if dry:
        print("[dry-run] %d 处全部命中，未写盘。" % len(RULES))
        for label, n, want in detail:
            print("    ✓ %-40s 命中 %d 次" % (label, n))
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
        ("manaCarry 字段 + 两个 API", "manaCarry: 0," in final and "carryMana: (n)" in final and "carryManaFoe: (n)" in final),
        ("startTurn 兑现并清零", "s.cur = s.cap + s.manaCarry;" in final and "s.manaCarry = 0;" in final),
        ("g3 / r5 走结转", "api.carryMana(1);" in final and "api.carryManaFoe(1);" in final),
        ("y4 去重", "pool.splice" in final or "api.enemies(u).filter(x => seen.indexOf(x) < 0)" in final),
        ("b1 随机不重复", "pool.splice(idx, 1)" in final),
        ("m01 召唤物名", "孢子浮囊" in final and "噬星幼虫" not in final),
        ("四支势力名", all(x in final for x in ("噬星虫群", "残响智械", "忆潮灵能者", "旧律军团"))),
        ("BODY_HP 25", "const BODY_HP = 25;" in final),
        ("旧名零残留", not any(x in final for x in ("噬星母巢", "残响总控", "忆潮主祭", "旧律裁决官"))),
    ]
    ok = True
    for label, hit in checks:
        print(("[✓] " if hit else "[x] ") + label)
        ok = ok and hit
    return 0 if ok else 1


if __name__ == "__main__":
    sys.exit(main())

