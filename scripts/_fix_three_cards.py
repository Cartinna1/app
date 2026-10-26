"""2026-10-26 三项定稿：
1) h2 诵经护卫舰：入场本体回复 1 → 3
2) c5 重型战列舰：6/6/3 → 6/6/2
3) p7 心灵风暴母舰：控制攻击 ≤3 → ≤4 的敌方战舰
"""
import io

DEMO = r"E:\生涯之旅游戏\carddemo\engine.js"
s = io.open(DEMO, "r", encoding="utf-8").read()
log = []

def rep(old, new, label):
    global s
    n = s.count(old)
    if n == 1:
        s = s.replace(old, new)
        log.append(f"✓ {label}")
    else:
        log.append(f"✗ {label}：命中 {n} 次（跳过）")

# 1) h2 诵经护卫舰：healBody(1) → healBody(3) + 文案
rep("h2: { kw: {}, fx: { play(_u, api) { api.healBody(1); } } },",
    "h2: { kw: {}, fx: { play(_u, api) { api.healBody(3); } } },",
    "h2 效果 1 → 3")
rep("text: '入场：本体回复 1 点结构值' });",
    "text: '入场：本体回复 3 点结构值' });",
    "h2 文案 1 → 3")

# 2) c5 重型战列舰：结构 3 → 2
rep("def({ id: 'c5', name: '重型战列舰', cost: 5, atk: 6, shield: 6, structure: 3,",
    "def({ id: 'c5', name: '重型战列舰', cost: 5, atk: 6, shield: 6, structure: 2,",
    "c5 结构 3 → 2")

# 3) p7 心灵风暴母舰：beginSteal(3) → beginSteal(4) + 文案
rep("p7: { kw: {}, fx: { play(_u, api) { api.beginSteal(3); } } },",
    "p7: { kw: {}, fx: { play(_u, api) { api.beginSteal(4); } } },",
    "p7 夺取阈值 3 → 4")
rep("text: '入场：控制一艘攻击 ≤3 的敌方战舰（归你方场上）' });",
    "text: '入场：控制一艘攻击 ≤4 的敌方战舰（归你方场上）' });",
    "p7 文案 3 → 4")

io.open(DEMO, "w", encoding="utf-8", newline="\n").write(s)
for line in log:
    print("  " + line)
