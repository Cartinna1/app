#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""A3 · 把 m01~m05 的头目技能分支插进 carddemo/engine.js（幂等、可 --dry-run）。

用法：
    python scripts/apply-a3-demo.py            # 真正应用（先备份 engine.js.bak-a3）
    python scripts/apply-a3-demo.py --dry-run  # 只校验锚点、打印将要插入的内容，不写文件

退出码：0 = 成功/已应用；1 = 任何异常（锚点缺失 / 检查失败）。
"""

import os
import shutil
import subprocess
import sys

# 控制台编码兜底（Windows 默认 GBK 会把中文打印成乱码；不影响文件内容）
try:
    sys.stdout.reconfigure(encoding="utf-8", errors="replace")
except Exception:  # noqa: BLE001
    pass

DEMO = r"E:\生涯之旅游戏\carddemo\engine.js"
BACKUP = DEMO + ".bak-a3"
NODE = r"C:\Users\Master\.dsh\dsh-runtimes\dsh-primary-runtime\dependencies\node\bin\node.exe"

# ---- 三个精确锚点（与 engine.js 现有文本逐字一致；找不到就中止、不改文件）----
A1 = "  startTurn(st, st.active);\n"
A2 = ("    log(st, `  【头目技能】深海威压：玩家本体 -1（当前 ${S(st, 'player').body}）`);\n"
      "  }\n"
      "}\n")
A3 = "  if (side === 'boss') {\n    if (st.bossId === 'b2') {\n"

# ---- 三段插入内容 ----
# ① 开场（插在 b1 的开场分支之后、startTurn 之前）
INS_OPEN = """  // 【雇佣兵协会】头目开场（m01 召唤幼虫 / m05 召唤海盗杂兵）
  if (bossId === 'm01') {
    for (let i = 0; i < 2; i++) {
      const u0 = spawnUnit(st, 'boss', 'q1');
      placeUnit(st, 'boss', u0, firstEmpty(st.boss.board));
    }
    log(st, '【头目技能】噬星母巢开场自带 2 艘噬星幼虫');
  }
  if (bossId === 'm05') {
    const u5 = spawnUnit(st, 'boss', 't_grunt');
    placeUnit(st, 'boss', u5, firstEmpty(st.boss.board));
    log(st, '【头目技能】海盗杂兵头目开场自带 1 艘海盗杂兵');
  }
"""

# ② 头目回合开始（插在 b3 分支之后、bossTurnStart 的收尾括号之前）
INS_TURN_START = """  // 【雇佣兵协会】m02：全体攻 +1（一次性）+ 结构最低的一艘 +1 护盾
  if (st.bossId === 'm02') {
    const bs2 = S(st, 'boss');
    if (!bs2.bossBuffed) {
      bs2.bossBuffed = true;
      api(st, 'boss').allies(null).forEach(a => { a.atk += 1; });
      log(st, '  【头目技能】残响总控：己方全体攻击 +1');
    }
    const units2 = api(st, 'boss').allies(null);
    if (units2.length) {
      const low = units2.reduce((a, b) => (a.structure <= b.structure ? a : b));
      low.shield += 1;
      log(st, `  【头目技能】残响总控：${low.name} 补 1 护盾`);
    }
  }
  // 【雇佣兵协会】m03：每回合开始按己方灵潮战舰数压玩家指挥度
  if (st.bossId === 'm03') {
    const n3 = api(st, 'boss').allies(null).filter(u => u.series === '灵潮').length;
    if (n3 > 0) {
      S(st, 'player').capBonus -= n3;
      log(st, `  【头目技能】忆潮主祭：${n3} 艘灵潮战舰，你方本回合指挥度 -${n3}`);
    }
  }
  // 【雇佣兵协会】m04：每回合开始己方全体 +2 护盾
  if (st.bossId === 'm04') {
    api(st, 'boss').allies(null).forEach(a => { a.shield += 2; });
    log(st, '  【头目技能】旧律裁决官：己方全体 +2 护盾');
  }
"""

# ③ 头目回合结束（插在 `if (side === 'boss') {` 之后、b2 分支之前）
INS_TURN_END = """    // 【雇佣兵协会】m01：不足 2 艘时回合末补 1 艘噬星幼虫
    if (st.bossId === 'm01') {
      if (s.board.filter(Boolean).length < 2) {
        const u1 = spawnUnit(st, 'boss', 'q1');
        placeUnit(st, 'boss', u1, firstEmpty(s.board));
        log(st, '  【头目技能】噬星母巢：召唤 1 艘噬星幼虫');
      }
    }
    // 【雇佣兵协会】m04：回合结束对玩家本体 1 点（不经护盾）
    if (st.bossId === 'm04') {
      damageBody(st, 'player', 1);
      log(st, `  【头目技能】旧律裁决：你的本体 -1（当前 ${S(st, 'player').body}，无视护盾）`);
    }
    // 【雇佣兵协会】m05：不足 2 艘时回合末补 1 艘海盗杂兵
    if (st.bossId === 'm05') {
      if (s.board.filter(Boolean).length < 2) {
        const u6 = spawnUnit(st, 'boss', 't_grunt');
        placeUnit(st, 'boss', u6, firstEmpty(s.board));
        log(st, '  【头目技能】海盗杂兵头目：召唤 1 艘海盗杂兵');
      }
    }
"""


def load_text(path):
    with open(path, "rb") as f:
        raw = f.read()
    has_bom = raw.startswith(b"\xef\xbb\xbf")
    return raw.decode("utf-8-sig"), has_bom


def save_text(path, text, has_bom):
    data = text.encode("utf-8")
    if has_bom:
        data = b"\xef\xbb\xbf" + data
    with open(path, "wb") as f:
        f.write(data)


def main():
    dry = "--dry-run" in sys.argv
    if not os.path.isfile(DEMO):
        print("[x] 找不到 DEMO：" + DEMO)
        return 1
    text, has_bom = load_text(DEMO)

    if "bossId === 'm01'" in text:
        print("[=] 已应用（engine.js 里已有 bossId === 'm01'），不重复插入。")
        return 0

    # 锚点校验：必须各出现且只出现 1 次
    for name, anchor in (("A1 startTurn", A1), ("A2 bossTurnStart 收尾", A2), ("A3 endTurn boss 段", A3)):
        n = text.count(anchor)
        if n != 1:
            print("[x] 锚点 %s 出现 %d 次（要求 1 次），已中止，文件未改。" % (name, n))
            return 1

    new_text = text.replace(A1, INS_OPEN + A1, 1)
    new_text = new_text.replace(A2, A2.replace("\n}\n", "\n" + INS_TURN_START + "}\n", 1), 1)
    new_text = new_text.replace(A3, A3 + INS_TURN_END, 1)

    if dry:
        print("[dry-run] 三个锚点各命中 1 次；将插入 %d 个字符（原 %d）。" % (len(new_text) - len(text), len(text)))
        for m in ("m01", "m02", "m03", "m04", "m05"):
            print("   插入后 bossId === '%s' 次数：%d" % (m, new_text.count("bossId === '%s'" % m)))
        return 0

    if not os.path.exists(BACKUP):
        shutil.copyfile(DEMO, BACKUP)
        print("[+] 已备份到 " + BACKUP)
    else:
        print("[=] 备份已存在，不覆盖：" + BACKUP)

    save_text(DEMO, new_text, has_bom)
    print("[+] 已写回 " + DEMO + ("（保留 BOM）" if has_bom else "（无 BOM）"))

    # 自检 1：node --check
    try:
        r = subprocess.run([NODE, "--check", DEMO], capture_output=True, text=True)
        if r.returncode == 0:
            print("[✓] node --check 语法通过")
        else:
            print("[x] node --check 失败：\n" + (r.stderr or r.stdout))
            return 1
    except Exception as e:  # noqa: BLE001
        print("[x] 调用 node 失败：" + str(e))
        return 1

    # 自检 2：5 条分支各出现 1 次（分支体内还有一次 s.bossId，故按 st.bossId 或 bossId 统计）
    final, _ = load_text(DEMO)
    ok = True
    for m in ("m01", "m02", "m03", "m04", "m05"):
        n = final.count("bossId === '%s'" % m)
        flag = "✓" if n >= 1 else "✗"
        if n < 1:
            ok = False
        print("[%s] %s 分支出现 %d 次" % (flag, m, n))
    return 0 if ok else 1


if __name__ == "__main__":
    sys.exit(main())
