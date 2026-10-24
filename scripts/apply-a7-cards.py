#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""A7 · 24 张敌方卡按 `docs/03` §4.2~§4.5 逐字重做（名字/费用/攻/盾/结构/稀有度/系列/kw·fx 全部照文档）。

用法：
    python scripts/apply-a7-cards.py --dry-run   # 只校验 24 条是否各唯一命中，不写盘
    python scripts/apply-a7-cards.py             # 先备份 engine.js.bak-a7，再写盘并自检

退出码：0 = 成功 / 已应用；1 = 任何异常（任一 id 命中数 ≠ 1 → 整体不写盘）。

⚠ 文档用到的 API 全部在 DEMO 里已有（`randomAlly` / `buffAtk` / `buffAtkTemp` / `buffShield` /
   `damage` / `freeze` / `beginSteal` / `gainMana` / `adjacent` / `repair` / `enemies` /
   `randomEnemy` + `fx.play|turnStart|turnEnd|death`），**没有任何一处需要替换或自造数值**。
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
BACKUP = DEMO + ".bak-a7"
NODE = r"C:\Users\Master\.dsh\dsh-runtimes\dsh-primary-runtime\dependencies\node\bin\node.exe"

# 每张卡一行（与 DEMO 现有 def() 同为单行）；数值与 kw/fx 逐字照 docs/03 §4.2~§4.5
NEW = {
    # ---- 噬星虫群 ----
    "q1": "def({ id: 'q1', name: '孢子浮囊', cost: 1, atk: 2, shield: 2, structure: 0, series: '虫群', rarity: '白', text: '亡语：随机一艘友舰攻击 +1', kw: {}, fx: { death(u, api) { const a = api.randomAlly(); if (a) api.buffAtk(a, 1); } } });",
    "q2": "def({ id: 'q2', name: '噬屑蠕体', cost: 2, atk: 3, shield: 2, structure: 1, series: '虫群', rarity: '白', text: '狂怒+2：半血时攻击 +2', kw: { berserk: 2 } });",
    "q3": "def({ id: 'q3', name: '甲壳冲角虫', cost: 3, atk: 4, shield: 3, structure: 1, series: '虫群', rarity: '蓝', text: '贯穿', kw: { pierce: true } });",
    "q4": "def({ id: 'q4', name: '孵化母巢', cost: 4, atk: 4, shield: 6, structure: 2, series: '虫群', rarity: '蓝', text: '回合结束：己方所有单位护盾 +1', kw: {}, fx: { turnEnd(u, api) { api.allies(u).forEach(a => api.buffShield(a, 1)); } } });",
    "q5": "def({ id: 'q5', name: '群巢督巢兽', cost: 5, atk: 6, shield: 5, structure: 2, series: '虫群', rarity: '紫', text: '入场：本回合己方所有单位攻击 +2', kw: {}, fx: { play(u, api) { api.allies(u).forEach(a => api.buffAtkTemp(a, 2)); } } });",
    "q6": "def({ id: 'q6', name: '噬星主母', cost: 6, atk: 7, shield: 6, structure: 3, series: '虫群', rarity: '橙', text: '锁链；亡语：对敌方所有单位造成 2 点伤害', kw: { taunt: true }, fx: { death(u, api) { api.enemies(u).forEach(e => api.damage(e, 2)); } } });",
    # ---- 残响智械 ----
    "z1": "def({ id: 'z1', name: '单元·清扫', cost: 1, atk: 2, shield: 2, structure: 1, series: '智械', rarity: '白', text: '入场：本回合指挥度 +1', kw: {}, fx: { play(u, api) { api.gainMana(1); } } });",
    "z2": "def({ id: 'z2', name: '单元·截断', cost: 2, atk: 2, shield: 3, structure: 1, series: '智械', rarity: '白', text: '破甲（攻击无视护盾）', kw: { brk: true } });",
    "z3": "def({ id: 'z3', name: '单元·过载', cost: 3, atk: 4, shield: 3, structure: 1, series: '智械', rarity: '蓝', text: '过载 1；入场：本体攻击 +2', kw: { overload: 1 }, fx: { play(u, api) { api.buffAtk(u, 2); } } });",
    "z4": "def({ id: 'z4', name: '单元·回收', cost: 4, atk: 4, shield: 6, structure: 2, series: '智械', rarity: '蓝', text: '亡语：己方所有单位护盾 +1', kw: {}, fx: { death(u, api) { api.allies(u).forEach(a => api.buffShield(a, 1)); } } });",
    "z5": "def({ id: 'z5', name: '单元·清算', cost: 5, atk: 5, shield: 5, structure: 2, series: '智械', rarity: '紫', text: '贯穿；攻击后自身受到 1 点反噬', kw: { pierce: true, recoil: 1 } });",
    "z6": "def({ id: 'z6', name: '主机·残响', cost: 6, atk: 7, shield: 7, structure: 3, series: '智械', rarity: '橙', text: '锁链；回合开始：随机一艘敌方战舰攻击 -2（最低 0）', kw: { taunt: true }, fx: { turnStart(u, api) { const e = api.randomEnemy(); if (e) api.buffAtk(e, -2); } } });",
    # ---- 忆潮灵能者 ----
    "y1": "def({ id: 'y1', name: '记诵见习者', cost: 1, atk: 1, shield: 2, structure: 1, series: '灵潮', rarity: '白', text: '入场：随机冻结一艘敌方战舰', kw: {}, fx: { play(u, api) { const e = api.randomEnemy(); if (e) api.freeze(e, 1); } } });",
    "y2": "def({ id: 'y2', name: '荆棘誓约者', cost: 2, atk: 2, shield: 3, structure: 2, series: '灵潮', rarity: '白', text: '锁链', kw: { taunt: true } });",
    "y3": "def({ id: 'y3', name: '忆潮抄写员', cost: 3, atk: 3, shield: 3, structure: 1, series: '灵潮', rarity: '蓝', text: '潜航；亡语：己方所有单位护盾 +1', kw: { subm: true }, fx: { death(u, api) { api.allies(u).forEach(a => api.buffShield(a, 1)); } } });",
    "y4": "def({ id: 'y4', name: '溯忆祭司', cost: 4, atk: 4, shield: 5, structure: 2, series: '灵潮', rarity: '蓝', text: '入场：随机冻结两艘敌方战舰', kw: {}, fx: { play(u, api) { for (let i = 0; i < 2; i++) { const e = api.randomEnemy(); if (e) api.freeze(e, 1); } } } });",
    "y5": "def({ id: 'y5', name: '潮唱仪式主', cost: 5, atk: 5, shield: 6, structure: 3, series: '灵潮', rarity: '紫', text: '入场：己方所有单位护盾 +2', kw: {}, fx: { play(u, api) { api.allies(u).forEach(a => api.buffShield(a, 2)); } } });",
    "y6": "def({ id: 'y6', name: '忆潮之口', cost: 6, atk: 6, shield: 8, structure: 3, series: '灵潮', rarity: '橙', text: '入场：控制一艘攻击 ≤2 的敌方战舰', kw: {}, fx: { play(u, api) { api.beginSteal(2); } } });",
    # ---- 旧律军团 ----
    "v1": "def({ id: 'v1', name: '见习执律兵', cost: 1, atk: 2, shield: 1, structure: 0, series: '旧律', rarity: '白', text: '狂怒+2：半血时攻击 +2', kw: { berserk: 2 } });",
    "v2": "def({ id: 'v2', name: '条文执行者', cost: 2, atk: 2, shield: 3, structure: 2, series: '旧律', rarity: '白', text: '锁链', kw: { taunt: true } });",
    "v3": "def({ id: 'v3', name: '传令官', cost: 3, atk: 3, shield: 4, structure: 1, series: '旧律', rarity: '蓝', text: '入场：本回合己方所有单位攻击 +1', kw: {}, fx: { play(u, api) { api.allies(u).forEach(a => api.buffAtkTemp(a, 1)); } } });",
    "v4": "def({ id: 'v4', name: '铁律守卫', cost: 4, atk: 4, shield: 6, structure: 2, series: '旧律', rarity: '蓝', text: '锁链；回合结束：相邻友舰修复 1 点护盾', kw: { taunt: true }, fx: { turnEnd(u, api) { api.adjacent(u).forEach(a => api.repair(a, 1)); } } });",
    "v5": "def({ id: 'v5', name: '裁决长', cost: 5, atk: 5, shield: 6, structure: 3, series: '旧律', rarity: '紫', text: '贯穿；入场：对随机一艘敌方战舰造成 2 点伤害', kw: { pierce: true }, fx: { play(u, api) { const e = api.randomEnemy(); if (e) api.damage(e, 2); } } });",
    "v6": "def({ id: 'v6', name: '旧律之座', cost: 6, atk: 7, shield: 7, structure: 3, series: '旧律', rarity: '橙', text: '贯穿；攻击后自身受到 1 点反噬；亡语：对敌方所有单位造成 2 点伤害', kw: { pierce: true, recoil: 1 }, fx: { death(u, api) { api.enemies(u).forEach(e => api.damage(e, 2)); } } });",
}

# 文档锚点（用于报告与自检）
ANCHOR = {
    "虫群": (111, 98, 36), "智械": (102, 105, 40), "灵潮": (88, 110, 49), "旧律": (95, 113, 45),
}


def main():
    dry = "--dry-run" in sys.argv
    if not os.path.isfile(DEMO):
        print("[x] 找不到 DEMO：" + DEMO)
        return 1

    with open(DEMO, "rb") as f:
        raw = f.read()
    has_bom = raw.startswith(b"\xef\xbb\xbf")
    text = raw.decode("utf-8-sig")

    # 幂等：新名字已落地 → 已应用
    if "孢子浮囊" in text and "旧律之座" in text:
        print("[=] 已应用（24 张已是文档版本），不重复改。")
        return 0

    plan = []
    problems = []
    for cid, newline in NEW.items():
        pat = re.compile(r"^def\(\{ id: '" + re.escape(cid) + r"',[^\n]*\}\);$", re.M)
        hits = pat.findall(text)
        if len(hits) != 1:
            problems.append((cid, len(hits)))
            continue
        plan.append((cid, pat, newline))

    if problems:
        print("[x] 以下 id 的 def() 命中数不是 1，**没有写任何文件**：")
        for cid, n in problems:
            print("    %s → 命中 %d 次" % (cid, n))
        return 1

    if dry:
        print("[dry-run] 24 张全部唯一命中，未写盘。")
        return 0

    if not os.path.exists(BACKUP):
        shutil.copyfile(DEMO, BACKUP)
        print("[+] 已备份 " + BACKUP)
    else:
        print("[=] 备份已存在，不覆盖：" + BACKUP)

    out = text
    for _cid, pat, newline in plan:
        out = pat.sub(lambda _m, s=newline: s, out, count=1)

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

    # 自检：名字落地 + 每系列三围合计
    final = io.open(DEMO, encoding="utf-8-sig").read()
    ok = True
    for cid, _pat, newline in plan:
        name = re.search(r"name: '([^']+)'", newline).group(1)
        if name not in final:
            print("[x] 缺卡名：" + name)
            ok = False
    print("[✓] 24 张卡名全部落地" if ok else "[x] 有卡名没落地")

    # 从文本里抽取每个 id 的 atk/shield/structure，按编队曲线(4/4/7/3/5/3)算合计
    curve = [4, 4, 7, 3, 5, 3]
    series = {"虫群": ["q1", "q2", "q3", "q4", "q5", "q6"], "智械": ["z1", "z2", "z3", "z4", "z5", "z6"],
              "灵潮": ["y1", "y2", "y3", "y4", "y5", "y6"], "旧律": ["v1", "v2", "v3", "v4", "v5", "v6"]}
    for sname, ids in series.items():
        ta = ts = tst = 0
        for i, cid in enumerate(ids):
            m = re.search(r"def\(\{ id: '" + cid + r"', name: '[^']+', cost: \d+, atk: (\d+), shield: (\d+), structure: (\d+)", final)
            if not m:
                print("[x] 解析失败：" + cid)
                ok = False
                continue
            ta += int(m.group(1)) * curve[i]
            ts += int(m.group(2)) * curve[i]
            tst += int(m.group(3)) * curve[i]
        want = ANCHOR[sname]
        hit = (ta, ts, tst) == want
        print(("[✓] " if hit else "[x] ") + "%s 编队合计 攻%d/盾%d/结构%d（文档 %d/%d/%d）" % (sname, ta, ts, tst, want[0], want[1], want[2]))
        ok = ok and hit
    return 0 if ok else 1


if __name__ == "__main__":
    sys.exit(main())
