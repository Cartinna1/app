#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""A11 · 6 张新卡 + 3 项调整写进 DEMO（零引擎改动）。

用法：
    python scripts/apply-a11-newcards.py --dry-run
    python scripts/apply-a11-newcards.py          # 备份 engine.js.bak-a11 后写盘

新增：i8 散射鱼雷艇 / i9 破甲驱逐舰 / h8 涤罪炮舰 / u7 伏击炮艇 / u8 装甲巡防舰 / g7 分红货轮
调整：t_monk 盾 0→1（+ h5 文案 1/1/1）、g1 亡语改结转、i3 改名斩首巡洋舰、r3 改名突击号令艇
`FLEET_ALL` 33 → 39（新卡必须进全集，否则玩家池/机库看不到、`FLEET_ALL 33` 的断言也不会变）。

⚠ 只用现有 API：`randomEnemy` / `damage` / `brk` / `enemies` / `u.sick` / `carryMana`。
⚠ u7 的"伏击"= 入场把自己 `u.sick` 置 false（引擎里表示"本回合不可攻击"的字段就是 `sick`；
   `kw.rush` 是另一条判定（`attackReason` 里 `u.sick && !u.kw.rush`），这里按"清自身失调"实现，**只对自己**。
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
BACKUP = DEMO + ".bak-a11"
NODE = r"C:\Users\Master\.dsh\dsh-runtimes\dsh-primary-runtime\dependencies\node\bin\node.exe"

NEW_DEFS = """// ---------------- 2026-10 第 0 批：6 张新卡（零引擎改动） ----------------
def({ id: 'i8', name: '散射鱼雷艇', cost: 2, atk: 2, shield: 1, structure: 1, series: '铁血', rarity: '白',
  text: '入场：对随机敌方战舰造成 2 次 1 点伤害（可命中同一艘）',
  fx: { play(u, api) { for (let i = 0; i < 2; i++) { const e = api.randomEnemy(); if (e) api.damage(e, 1); } } } });
def({ id: 'i9', name: '破甲驱逐舰', cost: 3, atk: 3, shield: 4, structure: 1, series: '铁血', rarity: '蓝',
  text: '破甲（攻击无视护盾）', kw: { brk: true } });
def({ id: 'h8', name: '涤罪炮舰', cost: 5, atk: 5, shield: 5, structure: 2, series: '圣辉', rarity: '紫',
  text: '入场：对所有敌方战舰造成 2 点伤害',
  fx: { play(u, api) { api.enemies(u).forEach(e => api.damage(e, 2)); } } });
def({ id: 'u7', name: '伏击炮艇', cost: 2, atk: 2, shield: 2, structure: 1, series: '通用', rarity: '白',
  text: '入场：部署当回合即可攻击（伏击）',
  fx: { play(u, api) { u.sick = false; } } });
def({ id: 'u8', name: '装甲巡防舰', cost: 4, atk: 4, shield: 5, structure: 2, series: '通用', rarity: '白',
  text: '', kw: {} });
def({ id: 'g7', name: '分红货轮', cost: 4, atk: 3, shield: 5, structure: 2, series: '财团', rarity: '蓝',
  text: '亡语：下回合指挥度 +2',
  fx: { death(u, api) { api.carryMana(2); } } });

// ---------------- 卡池 ----------------"""

RULES = [
    # ① 6 张新卡插在"卡池"标记之前
    (r"// ---------------- 卡池 ----------------", NEW_DEFS, 1, "6 张新卡 def"),
    # ② FLEET_ALL 33 → 39
    (r"'i1', 'i2', 'i3', 'i4', 'i5', 'i6', 'i7',",
     "'i1', 'i2', 'i3', 'i4', 'i5', 'i6', 'i7', 'i8', 'i9',", 1, "FLEET_ALL + i8/i9"),
    (r"'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'h7',",
     "'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'h7', 'h8',", 1, "FLEET_ALL + h8"),
    (r"'g1', 'g2', 'g3', 'g4', 'g5', 'g6',",
     "'g1', 'g2', 'g3', 'g4', 'g5', 'g6', 'g7', 'u7', 'u8',", 1, "FLEET_ALL + g7/u7/u8"),
    # ③ t_monk 盾 0 → 1
    (r"def\(\{ id: 't_monk', name: '修士舰', cost: 0, atk: 1, shield: 0, structure: 1,",
     "def({ id: 't_monk', name: '修士舰', cost: 0, atk: 1, shield: 1, structure: 1,", 1, "t_monk 盾 0→1"),
    # ④ h5 文案 1/0/1 → 1/1/1
    (r"召唤 2 个 1/0/1 的修士舰", "召唤 2 个 1/1/1 的修士舰", 1, "h5 文案 1/1/1"),
    # ⑤ g1 亡语改结转 + 文案
    (r"fx: \{ death\(u, api\) \{ api\.gainMana\(1\); \} \} \}\);\ndef\(\{ id: 'g2'",
     "fx: { death(u, api) { api.carryMana(1); } } });\ndef({ id: 'g2'", 1, "g1 亡语改结转"),
    (r"text: '亡语：本回合指挥度 \+1'", "text: '亡语：下回合指挥度 +1'", 1, "g1 文案"),
    # ⑥ 两处改名
    (r"id: 'i3', name: '装甲破坏者'", "id: 'i3', name: '斩首巡洋舰'", 1, "i3 改名"),
    (r"id: 'r3', name: '烟幕投放艇'", "id: 'r3', name: '突击号令艇'", 1, "r3 改名"),
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

    if "id: 'i8'" in text and "id: 'g7'" in text and "'u8'" in text:
        print("[=] 已应用（i8/i9/h8/u7/u8/g7 与 FLEET_ALL 都在），不重复改。")
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
        ("6 张新卡 def 齐全", all(("id: '" + x + "'") in final for x in ('i8', 'i9', 'h8', 'u7', 'u8', 'g7'))),
        ("FLEET_ALL 含新卡", "'i8'" in final and "'h8'" in final and "'g7'" in final and "'u7'" in final and "'u8'" in final),
        ("u7 清自身 sick", "fx: { play(u, api) { u.sick = false; } } });" in final),
        ("t_monk 盾 1", re.search(r"id: 't_monk'.*shield: 1,", final) is not None),
        ("h5 文案 1/1/1", "召唤 2 个 1/1/1 的修士舰" in final),
        ("g1 亡语结转", "api.carryMana(1);" in final and "亡语：下回合指挥度 +1" in final),
        ("i3 / r3 改名", "斩首巡洋舰" in final and "突击号令艇" in final),
    ]
    ok = True
    for label, hit in checks:
        print(("[✓] " if hit else "[x] ") + label)
        ok = ok and hit
    return 0 if ok else 1


if __name__ == "__main__":
    sys.exit(main())


