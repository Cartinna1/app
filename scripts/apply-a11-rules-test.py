#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""方案 B · rules-test.js 同步（carddemo/ 在工作区外，需要提权跑一次）

旧断言固化了「零结构值 = 护盾一破才下场」和「无视护盾打零结构直接击毁」；
方案 B 之后：11 张卡改成 体+1/盾−1，判据统一成「结构值 ≤0 即击毁」。
"""
import io
import sys

P = r"E:\生涯之旅游戏\carddemo\rules-test.js"

OLD1 = """// ---------- 1. 零结构值舰的生死判据 ----------
console.log('\\n[1] 零结构值舰（海盗全体）：护盾一破即下场');
{
  const st = fresh();
  const u = T.spawnUnit(st, 'player', 'r2');       // 钩爪登陆艇 1/2/0（护盾 2、结构值 0）
  T.placeUnit(st, 'player', u, 0);
  const r0 = T.damageUnit(st, u, 1);               // 护盾 2→1
  check('护盾未破时不下场（护盾 2→1，结构值 0）', r0.destroyed === false && u.shield === 1 && u.structure <= 0, `护盾=${u.shield}`);
  const r1 = T.damageUnit(st, u, 1);               // 护盾 1→0 → 下场
  check('护盾归零 → 判定下场', r1.destroyed === true && u.shield === 0);
  check('零结构值：溢出量 = 伤害 − 剩余护盾', r1.overflow === 0, 'overflow=' + r1.overflow);
  T.cleanup(st);
  check('cleanup 把它移出场并记入永久损失', !st.player.board[0] && st.player.lost.indexOf('r2') >= 0);
}
{
  const st = fresh();
  const u = T.spawnUnit(st, 'player', 'r1');       // 掠夺者快艇 2/1/0：1 点伤害即破盾 → 下场
  T.placeUnit(st, 'player', u, 0);
  const r = T.damageUnit(st, u, 5);                // 5 点打 1 盾 → 溢出 4
  check('零结构值舰的小护盾会被大伤害直接打穿', r.destroyed === true && r.overflow === 4, 'overflow=' + r.overflow);
}"""

NEW1 = """// ---------- 1. 结构值 ≤0 即击毁（方案 B：不再要求护盾也归零） ----------
console.log('\\n[1] 结构值 ≤0 即击毁（海盗不再有「零结构值」舰）');
{
  const st = fresh();
  const u = T.spawnUnit(st, 'player', 'r2');       // 钩爪登陆艇 1/1/1（体 0→1、盾 2→1）
  T.placeUnit(st, 'player', u, 0);
  const r0 = T.damageUnit(st, u, 1);               // 护盾 1→0，结构值还剩 1 → 不下场
  check('普通伤害先破盾：盾 1→0、体仍 1，不下场', r0.destroyed === false && u.shield === 0 && u.structure === 1, `盾=${u.shield} 体=${u.structure}`);
  const r1 = T.damageUnit(st, u, 1);               // 结构值 1→0 → 下场
  check('结构值归零 → 判定下场', r1.destroyed === true && u.structure <= 0);
  check('溢出量 = 伤害 − 剩余护盾 − 剩余结构（这里 0）', r1.overflow === 0, 'overflow=' + r1.overflow);
  T.cleanup(st);
  check('cleanup 把它移出场并记入永久损失', !st.player.board[0] && st.player.lost.indexOf('r2') >= 0);
}
{
  const st = fresh();
  const u = T.spawnUnit(st, 'player', 'r1');       // 掠夺者快艇 2/0/1：无盾、1 点结构值
  T.placeUnit(st, 'player', u, 0);
  const r = T.damageUnit(st, u, 5);                // 5 点 → 结构值 1 被打穿，溢出 4
  check('无盾小体格被大伤害打穿，溢出 4', r.destroyed === true && r.overflow === 4, 'overflow=' + r.overflow);
}
{
  const st = fresh();
  const u = T.spawnUnit(st, 'player', 't_grunt');  // 海盗杂兵 1/1/1
  T.placeUnit(st, 'player', u, 0);
  const r = T.damageUnit(st, u, 1, true);          // 无视护盾：结构值 1→0，护盾原封不动
  check('无视护盾打穿结构值 → 直接击毁（护盾还在也一样）', r.destroyed === true && u.shield === 1 && u.structure <= 0, `盾=${u.shield} 体=${u.structure}`);
  T.cleanup(st);
  check('它确实被移出场', !st.player.board[0]);
}"""

OLD2 = """  check('可以选任意一艘（这里选了 1/2/0 的杂兵）', rr.ok === true, rr.msg);"""
NEW2 = """  check('可以选任意一艘（这里选了 1/1/1 的杂兵）', rr.ok === true, rr.msg);"""

OLD3 = """  check('复制出来的是所选那艘的身材（1/2/0），而不是引擎自选的 7/7/3',
    copy && copy.atk === 1 && copy.maxShield === 2, copy ? `${copy.atk}/${copy.maxShield}/${copy.maxStructure}` : '无');"""
NEW3 = """  check('复制出来的是所选那艘的身材（1/1/1），而不是引擎自选的 7/7/3',
    copy && copy.atk === 1 && copy.maxShield === 1 && copy.maxStructure === 1, copy ? `${copy.atk}/${copy.maxShield}/${copy.maxStructure}` : '无');"""

OLD4 = """  check('未被选中的单位毫发无伤', weak.shield === 2 && weak.structure === 0);"""
NEW4 = """  check('未被选中的单位毫发无伤', weak.shield === 1 && weak.structure === 1);"""

OLD5 = """{
  // 边界：无视护盾打「零结构值」的舰 → 直接击毁（护盾是它唯一的血）
  const st = fresh(['h3', 'h3']);
  st.active = 'player';
  const zero = T.spawnUnit(st, 'boss', 't_grunt');   // 1/2/0：结构值恒为 0
  T.placeUnit(st, 'boss', zero, 0);
  const r2 = E.deploy(st, 'player', 'h3', 0);
  E.resolvePending(st, zero.uid);
  check('无视护盾打零结构值舰 → 直接击毁', zero.shield === 0 && zero.structure <= 0, `盾${zero.shield} 体${zero.structure}`);
  T.cleanup(st);
  check('它确实被移出场', !st.boss.board[0]);
}
{
  // 对照（关键）：零结构值舰「护盾一破就下场」是既定规则，普通伤害也杀得掉它（2 盾挨 2 点）。
  // 真正要区分两种机制，得用「伤害 < 护盾」的例子：普通伤害只掉盾，无视护盾才直接击毁。
  const st = fresh(['h3']);
  st.active = 'player';
  const a = T.spawnUnit(st, 'boss', 't_grunt');   // 1/2/0
  T.placeUnit(st, 'boss', a, 0);
  const r1 = T.damageUnit(st, a, 1, false);
  check('普通 1 点打 2 盾的零结构值舰 → 只掉护盾，不下场', a.shield === 1 && a.structure === 0 && r1.destroyed === false, `盾${a.shield}`);
  const b = T.spawnUnit(st, 'boss', 't_grunt');
  T.placeUnit(st, 'boss', b, 1);
  const r2 = T.damageUnit(st, b, 1, true);
  check('无视护盾 1 点打同一目标 → 直接击毁（护盾是它唯一的血）', b.shield === 0 && b.structure <= 0 && r2.destroyed === true, `盾${b.shield} 体${b.structure}`);
  check('普通 2 点也能杀掉它（破盾即下场，这是既定规则）', T.damageUnit(st, a, 1, false).destroyed === true, `盾${a.shield}`);
}"""

NEW5 = """{
  // 神罚（无视护盾 2 点）打 1 体 1 盾的杂兵：结构值 1→0 → 直接击毁，护盾不被消耗
  const st = fresh(['h3', 'h3']);
  st.active = 'player';
  const zero = T.spawnUnit(st, 'boss', 't_grunt');   // 1/1/1
  T.placeUnit(st, 'boss', zero, 0);
  const r2 = E.deploy(st, 'player', 'h3', 0);
  E.resolvePending(st, zero.uid);
  check('神罚打穿结构值 → 直接击毁（护盾仍在）', zero.structure <= 0 && zero.shield === 1, `盾${zero.shield} 体${zero.structure}`);
  T.cleanup(st);
  check('它确实被移出场', !st.boss.board[0]);
}
{
  // 对照：普通伤害先扣护盾 → 1 点只掉盾；第 2 点才打穿结构值
  const st = fresh(['h3']);
  st.active = 'player';
  const a = T.spawnUnit(st, 'boss', 't_grunt');   // 1/1/1
  T.placeUnit(st, 'boss', a, 0);
  const r1 = T.damageUnit(st, a, 1, false);
  check('普通 1 点打 1 盾 1 体的杂兵 → 只掉护盾，不下场', a.shield === 0 && a.structure === 1 && r1.destroyed === false, `盾${a.shield} 体${a.structure}`);
  const r2 = T.damageUnit(st, a, 1, false);
  check('再 1 点打穿结构值 → 击毁', r2.destroyed === true && a.structure <= 0, `盾${a.shield} 体${a.structure}`);
}"""

RULES = [("§1 零结构值", OLD1, NEW1), ("copy 文案", OLD2, NEW2), ("copy 身材", OLD3, NEW3),
         ("未选中单位", OLD4, NEW4), ("神罚边界", OLD5, NEW5)]


def main():
    dry = "--dry-run" in sys.argv
    with io.open(P, encoding="utf-8", newline="") as f:
        text = f.read()
    if "结构值 ≤0 即击毁" in text and "神罚打穿结构值" in text:
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
        print("[dry-run] %d 处断言全部唯一命中，未写盘。" % len(RULES))
        return 0
    with io.open(P, "w", encoding="utf-8", newline="") as f:
        f.write(out)
    print("[+] 已写回 " + P)
    return 0


if __name__ == "__main__":
    sys.exit(main())
