#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""方案 B · DEMO 侧补丁：① 11 张「体 0」卡改成「体+1 / 盾−1」② 结构 ≤0 即击毁（无视护盾）

① 体 0 的卡（11 张）改成 体+1、盾−1（总耐久不变，卡面不再出现体 0）：
   i1 2/1/0→2/0/1 · r1 2/1/0→2/0/1 · r2 1/2/0→1/1/1 · r4 2/2/0→2/1/1 · r6 4/2/0→4/1/1
   q1 2/2/0→2/1/1 · t_monk 1/1/0→1/0/1 · t_mirage 3/2/0→3/1/1 · t_claw 1/2/0→1/1/1
   t_wreck 2/1/0→2/0/1 · t_grunt 1/2/0→1/1/1
② 战斗规则：`structure <= 0 **且** shield <= 0` → `structure <= 0`（结构归零即击毁，护盾再厚也没用）
   并删掉「无视护盾打零结构直接击毁」的特例（规则本身已覆盖）。

用法：python scripts/apply-a11-structure.py --dry-run / python scripts/apply-a11-structure.py
"""
import io
import re
import sys

DEMO = r"E:\生涯之旅游戏\carddemo\engine.js"

CARDS = [
    ("i1", 1), ("r1", 1), ("r2", 2), ("r4", 2), ("r6", 2), ("q1", 2),
    ("t_monk", 1), ("t_mirage", 2), ("t_claw", 2), ("t_wreck", 1), ("t_grunt", 2),
]

OLD_SPECIAL = """  // 【边界规则】无视护盾（破甲 / 神罚）打「零结构值」的舰 → 直接击毁：
  // 这类舰唯一的承伤层就是护盾，护盾被无视了就没有东西能吸收。
  // 否则会出现「无视了你的护盾、但你毫发无伤」的怪结果（它们结构值恒为 0，扣不动）。
  if (ignoreShield && (u.maxStructure || 0) <= 0) {
    u.structure = -1; u.shield = 0;
    return { dealt: amount, overflow: 0, destroyed: true };
  }
"""
NEW_SPECIAL = """  // 【2026-10 方案 B】结构 ≤0 即击毁（见下方下场判据）——原来那条「无视护盾打零结构直接击毁」
  // 的特例已删除：规则本身覆盖它，且体 0 的卡已经全部改成体 1。
"""

OLD_KILL = "  // 下场判据：结构值 ≤0 **且** 护盾 ≤0。\n  // 海盗全体是「零结构值」设计（结构值 0）——护盾一破即下场，这正是「攻击力 > 护盾即下场」。\n  return { dealt, overflow: left, destroyed: u.structure <= 0 && u.shield <= 0 };"
NEW_KILL = "  // 下场判据：**结构值 ≤0 即击毁**（护盾再厚也没用）——\n  // 破甲 / 神罚本来就是用来穿盾打结构的，打穿结构就该下场；护盾只负责吸收普通伤害。\n  return { dealt, overflow: left, destroyed: u.structure <= 0 };"

OLD_CLEAN = "      for (const u of S(st, side).board) if (u && u.structure <= 0 && u.shield <= 0) { found = u; break; }"
NEW_CLEAN = "      for (const u of S(st, side).board) if (u && u.structure <= 0) { found = u; break; }"


def main():
    dry = "--dry-run" in sys.argv
    with io.open(DEMO, encoding="utf-8", newline="") as f:
        text = f.read()

    applied = all(("id: '%s'" % cid) in text for cid, _ in CARDS) and "destroyed: u.structure <= 0 };" in text
    if applied and "structure <= 0 && u.shield <= 0" not in text:
        print("[=] 已应用（11 张卡 + 新判据都在），不重复改。")
        return 0

    out = text
    problems = []
    # ① 11 张卡：shield 减 1、structure 0 → 1
    for cid, sh in CARDS:
        pat = re.compile(r"(id: '%s',[^\n]*?shield: )%d(, structure: )0" % (re.escape(cid), sh))
        if len(pat.findall(out)) != 1:
            problems.append(("卡 %s" % cid, len(pat.findall(out))))
            continue
        out = pat.sub(lambda m: m.group(1) + str(sh - 1) + m.group(2) + "1", out, count=1)
    # ② 规则
    if out.count(OLD_SPECIAL) != 1:
        problems.append(("删特例", out.count(OLD_SPECIAL)))
    else:
        out = out.replace(OLD_SPECIAL, NEW_SPECIAL)
    if out.count(OLD_KILL) != 1:
        problems.append(("击毁判据", out.count(OLD_KILL)))
    else:
        out = out.replace(OLD_KILL, NEW_KILL)
    if out.count(OLD_CLEAN) != 1:
        problems.append(("cleanup 判据", out.count(OLD_CLEAN)))
    else:
        out = out.replace(OLD_CLEAN, NEW_CLEAN)

    if problems:
        print("[x] 以下替换命中数不对，未写盘：")
        for label, n in problems:
            print("    %s → %d" % (label, n))
        return 1
    if dry:
        print("[dry-run] 11 张卡 + 3 处规则全部唯一命中，未写盘。")
        return 0
    with io.open(DEMO, "w", encoding="utf-8", newline="") as f:
        f.write(out)
    print("[+] 已写回 " + DEMO)
    return 0


if __name__ == "__main__":
    sys.exit(main())
