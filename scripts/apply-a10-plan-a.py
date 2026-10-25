#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""方案 A · DEMO 侧一次性补丁（carddemo/engine.js 在工作区外，需要提权跑一次）

改动：
  ① b3 技能文案 ≤25 → ≤22、每回合 -1 → 每 3 个 BOSS 回合 -1
  ② m02 技能文案 最多 +3 → 最多 +2
  ③ MERC_POOLS：m01 / m04 从 3 份（18 张）削到 2 份（12 张）
  ④ b3 代码：阈值 22 + 每 3 个 BOSS 回合扣 1 点本体
  ⑤ m02 代码：层数 <= 3 → <= 2（日志 /2、上限 +2）
  ⑥ m04 代码：触发条件 round <= 1（空转）→ ownTurns === 2（首回合铺的那批）

用法：python scripts/__patch-demo.py --dry-run  /  python scripts/__patch-demo.py
"""
import io
import sys

DEMO = r"E:\生涯之旅游戏\carddemo\engine.js"

RULES = [
    (
        "m02 技能文案",
        "  m02: { id: 'm02', name: '残响总控', hp: 32, skill: '每回合开始：己方全体攻击 +1（最多 +3）；同时给己方场上结构最低的一艘补 1 护盾' },",
        "  m02: { id: 'm02', name: '残响总控', hp: 32, skill: '每回合开始：己方全体攻击 +1（最多 +2）；同时给己方场上结构最低的一艘补 1 护盾' },",
    ),
    (
        "MERC_POOLS m01 3→2",
        "    m01: [].concat(...Array(3).fill(['q1', 'q2', 'q3', 'q4', 'q5', 'q6'])),",
        "    m01: [].concat(...Array(2).fill(['q1', 'q2', 'q3', 'q4', 'q5', 'q6'])),",
    ),
    (
        "MERC_POOLS m04 3→2",
        "    m04: [].concat(...Array(3).fill(['v1', 'v2', 'v3', 'v4', 'v5', 'v6'])),",
        "    m04: [].concat(...Array(2).fill(['v1', 'v2', 'v3', 'v4', 'v5', 'v6'])),",
    ),
    (
        "b3 代码块",
        """  if (st.bossId === 'b3' && S(st, 'boss').body <= 25) {
    // 【2026-08 用户裁定】阈值 15 → 25，且 **只加一次**（明确不叠加）：
    //   +4 攻是"跌破阈值后获得的**状态**"，不是"每个头目回合开始再叠一次"。
    //   为什么不叠加：触发窗口从 ≤15 前移到 ≤25 后会跨很多个回合，逐回合 +4 会滚成
    //   +几十攻（实测最高 76 攻，见本轮报告），变成"触发即必胜"的滚雪球。
    //   用 bossBuffed 做一次性标记（不随回血重置，与"状态"语义一致、也可复现）。
    const bs = S(st, 'boss');
    if (!bs.bossBuffed) {
      bs.bossBuffed = true;
      log(st, `  【头目技能】深海阎王：本体 ${bs.body} ≤25，全体己方 +4 攻（${bs.board.filter(Boolean).length} 艘）`);
      api(st, 'boss').allies(null).forEach(a => { a.atk += 4; });
    }
    damageBody(st, 'player', 1);
    log(st, `  【头目技能】深海威压：玩家本体 -1（当前 ${S(st, 'player').body}）`);
  }""",
        """  // 【2026-10 方案 A】阈值 25 → 22；「本体 -1」从每回合改成**每 3 个 BOSS 回合**一次
  //   +4 攻仍是"只加一次的状态"（不叠加、不加后来者），改动只为把胜率拉到 70~80
  if (st.bossId === 'b3' && S(st, 'boss').body <= 22) {
    const bs = S(st, 'boss');
    if (!bs.bossBuffed) {
      bs.bossBuffed = true;
      log(st, `  【头目技能】深海阎王：本体 ${bs.body} ≤22，全体己方 +4 攻（${bs.board.filter(Boolean).length} 艘）`);
      api(st, 'boss').allies(null).forEach(a => { a.atk += 4; });
    }
    if (bs.ownTurns % 3 === 0) {
      damageBody(st, 'player', 1);
      log(st, `  【头目技能】深海威压：玩家本体 -1（当前 ${S(st, 'player').body}）`);
    }
  }""",
    ),
    (
        "m02 代码块头",
        """  // 【雇佣兵协会】m02：全体攻 +1（一次性）+ 结构最低的一艘 +1 护盾
  if (st.bossId === 'm02') {
    // 每回合开始 +1、上限 +3（第 1/2/3 回合各叠一层；不用 bossBuffed、不新增字段）
    if (st.round <= 3) {
      api(st, 'boss').allies(null).forEach(a => { a.atk += 1; });
      log(st, `  【头目技能】残响总控：己方全体攻击 +1（第 ${st.round}/3 层，上限 +3）`);
    }""",
        """  // 【雇佣兵协会】m02：全体攻 +1（一次性）+ 结构最低的一艘 +1 护盾
  if (st.bossId === 'm02') {
    // 【2026-10 方案 A】层数 3 → 2（第 1 层仍落在 BOSS 首次铺场之前，实际生效 +1）
    if (st.round <= 2) {
      api(st, 'boss').allies(null).forEach(a => { a.atk += 1; });
      log(st, `  【头目技能】残响总控：己方全体攻击 +1（第 ${st.round}/2 层，上限 +2）`);
    }""",
    ),
    (
        "m04 代码条件",
        """  // 【雇佣兵协会】m04：**开场一次性**己方全体 +2 护盾（落在第 1 个 BOSS 回合开始；
  // 因为 createBattle 那一刻 BOSS 场上还没有单位，所以「一次性」只能在这一刻兑现；不新增状态字段）
  if (st.bossId === 'm04' && st.round <= 1) {""",
        """  // 【雇佣兵协会】m04：**开场一次性**己方全体 +2 护盾（落在 BOSS 的第 2 个回合开始 ——
  // 第 1 个回合开始时场上还没有单位，原来的 round <= 1 实际是空转；改判 ownTurns === 2 才对得上"首回合铺的那批"）
  if (st.bossId === 'm04' && S(st, 'boss').ownTurns === 2) {""",
    ),
]


def main():
    dry = "--dry-run" in sys.argv
    with io.open(DEMO, encoding="utf-8", newline="") as f:
        text = f.read()
    # 幂等：已应用过就直接退出（补丁锚点已被替换，再跑会"命中 0 次"）
    applied = [
        "Array(2).fill(['q1'", "Array(2).fill(['v1'",
        "if (st.round <= 2) {", "ownTurns === 2", "ownTurns % 3 === 0", "body <= 22",
    ]
    if all(s in text for s in applied):
        print("[=] 已应用（方案 A 的 6 处都在），不重复改。")
        return 0
    out = text
    problems = []
    for label, old, new in RULES:
        n = out.count(old)
        if n != 1:
            problems.append((label, n))
            continue
        out = out.replace(old, new)
    if problems:
        print("[x] 以下替换命中数不是 1，未写盘：")
        for label, n in problems:
            print("    %s → %d 次" % (label, n))
        return 1
    if dry:
        print("[dry-run] %d 处替换全部唯一命中，未写盘。" % len(RULES))
        return 0
    with io.open(DEMO, "w", encoding="utf-8", newline="") as f:
        f.write(out)
    print("[+] 已写回 " + DEMO)
    return 0


if __name__ == "__main__":
    sys.exit(main())

