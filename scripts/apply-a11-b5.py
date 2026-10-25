#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""方案 B 补偿 · DEMO 侧：b5 的「随机战舰 1 点」从每回合改成每 2 个 BOSS 回合一次。"""
import io
import sys

P = r"E:\生涯之旅游戏\carddemo\engine.js"

OLD1 = "b5: { id: 'b5', name: '「苍白歌者」塞壬', hp: 30, skill: '回合结束：对随机一艘玩家战舰造成 1 点伤害（不打本体；玩家场上没有战舰时落空）' },"
NEW1 = "b5: { id: 'b5', name: '「苍白歌者」塞壬', hp: 30, skill: '每 2 个回合：对随机一艘玩家战舰造成 1 点伤害（不打本体；玩家场上没有战舰时落空）' },"

OLD2 = "    if (st.bossId === 'b5') {\n      // 【定稿·方案 A】回合结束：对随机一艘玩家战舰造成 1 点伤害（不打本体；玩家场上没有战舰时落空）"
NEW2 = "    if (st.bossId === 'b5' && S(st, 'boss').ownTurns % 2 === 0) {\n      // 【2026-10 方案 B 补偿】每 2 个 BOSS 回合一次：对随机一艘玩家战舰造成 1 点伤害（不打本体；玩家场上没有战舰时落空）"

RULES = [("b5 文案", OLD1, NEW1), ("b5 代码", OLD2, NEW2)]


def main():
    dry = "--dry-run" in sys.argv
    with io.open(P, encoding="utf-8", newline="") as f:
        text = f.read()
    if "每 2 个回合：对随机一艘玩家战舰" in text:
        print("[=] 已应用，不重复改。")
        return 0
    out = text
    bad = []
    for label, old, new in RULES:
        n = out.count(old)
        if n != 1:
            bad.append((label, n))
            continue
        out = out.replace(old, new)
    if bad:
        print("[x] 命中数不对，未写盘：")
        for label, n in bad:
            print("    %s → %d" % (label, n))
        return 1
    if dry:
        print("[dry-run] 2 处唯一命中，未写盘。")
        return 0
    with io.open(P, "w", encoding="utf-8", newline="") as f:
        f.write(out)
    print("[+] 已写回 " + P)
    return 0


if __name__ == "__main__":
    sys.exit(main())
