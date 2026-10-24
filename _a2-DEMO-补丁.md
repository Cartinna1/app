# A2 的 DEMO 补丁（待应用）

**为什么只是补丁**：本会话的沙箱只允许写 `E:\生涯之旅游戏\app`，而 `carddemo/engine.js` 在
`E:\生涯之旅游戏\carddemo\`（工作区外），写入被拒且本会话无法提权。A2 的三条约束
（DEMO 加入 24 卡与 4 头目 → 重导出 → 恢复 audit 严格相等）**都必须先改 DEMO**，所以整段 A2 未动工，
仓库保持 A1 结束时的全绿状态（15 步套件通过）。

**应用方式**：把下面三段分别粘进 `carddemo/engine.js` 对应位置，然后
`node scripts/export-battle-data.cjs` 重导出，再按「后续改动」清单改 4 处即可。

---

## 1. 24 张敌方专属卡（粘在 `// ---------------- 卡池 ----------------` 之前）

```js
// ---------------- 雇佣兵协会 · 四支敌对势力的 24 张专属卡（PvE 专属，玩家不可建造）----------------
// 数值锚点：四份 26 艘编队合计（攻/盾/结构）—— 虫群 111/98/36 ｜ 智械 102/105/40 ｜
// 灵潮 88/110/49 ｜ 旧律 95/113/45（曲线 4/4/7/3/5/3）。只用现有 12 类 kw，不新增 fx。
def({ id: 'q1', name: '噬星幼虫', cost: 1, atk: 4, shield: 5, structure: 2, series: '虫群', rarity: '白', text: '锁链：对方必须先攻击它。', kw: { taunt: true } });
def({ id: 'q2', name: '裂壳虫', cost: 2, atk: 4, shield: 5, structure: 1, series: '虫群', rarity: '白', text: '伏击：部署当回合即可攻击。', kw: { rush: true } });
def({ id: 'q3', name: '掘进虫', cost: 3, atk: 5, shield: 4, structure: 1, series: '虫群', rarity: '蓝', text: '亡命 2：半血时补 2 护盾，受击后攻击 +2。', kw: { desper: 2 } });
def({ id: 'q4', name: '穿刺者', cost: 4, atk: 6, shield: 3, structure: 2, series: '虫群', rarity: '蓝', text: '贯穿：击毁目标时，溢出伤害打到本体。', kw: { pierce: true } });
def({ id: 'q5', name: '群巢母虫', cost: 5, atk: 4, shield: 3, structure: 1, series: '虫群', rarity: '紫', text: '嗜血：击毁目标后可再攻击一次（每回合一次）。', kw: { bloodlust: true } });
def({ id: 'q6', name: '虫潮核心', cost: 6, atk: 2, shield: 2, structure: 2, series: '虫群', rarity: '橙', text: '过载 2：下回合指挥度 -2。', kw: { overload: 2 } });
def({ id: 'z1', name: '残响哨兵', cost: 1, atk: 4, shield: 4, structure: 1, series: '智械', rarity: '白', text: '破甲：攻击无视护盾。', kw: { brk: true } });
def({ id: 'z2', name: '锈甲机兵', cost: 2, atk: 4, shield: 4, structure: 1, series: '智械', rarity: '白', text: '锁链：对方必须先攻击它。', kw: { taunt: true } });
def({ id: 'z3', name: '仲裁机', cost: 3, atk: 5, shield: 5, structure: 3, series: '智械', rarity: '蓝', text: '贯穿：击毁目标时，溢出伤害打到本体。', kw: { pierce: true } });
def({ id: 'z4', name: '回声炮台', cost: 4, atk: 4, shield: 5, structure: 1, series: '智械', rarity: '蓝', text: '反噬 1：攻击后自身受到 1 点伤害。', kw: { recoil: 1 } });
def({ id: 'z5', name: '旧日主控', cost: 5, atk: 4, shield: 4, structure: 1, series: '智械', rarity: '紫', text: '狂怒 3：半血时攻击 +3。', kw: { berserk: 3 } });
def({ id: 'z6', name: '残响中枢', cost: 6, atk: 1, shield: 1, structure: 1, series: '智械', rarity: '橙', text: '过载 1：下回合指挥度 -1。', kw: { overload: 1 } });
def({ id: 'y1', name: '潮忆游鱼', cost: 1, atk: 4, shield: 4, structure: 2, series: '灵潮', rarity: '白', text: '潜航：不能被选为目标，也不参与锁链判定。', kw: { subm: true } });
def({ id: 'y2', name: '回声信徒', cost: 2, atk: 3, shield: 4, structure: 2, series: '灵潮', rarity: '白', text: '亡命 2：半血时补 2 护盾，受击后攻击 +2。', kw: { desper: 2 } });
def({ id: 'y3', name: '低语者', cost: 3, atk: 3, shield: 4, structure: 2, series: '灵潮', rarity: '蓝', text: '反噬 1：攻击后自身受到 1 点伤害。', kw: { recoil: 1 } });
def({ id: 'y4', name: '忆潮祭司', cost: 4, atk: 4, shield: 5, structure: 1, series: '灵潮', rarity: '蓝', text: '破甲：攻击无视护盾。', kw: { brk: true } });
def({ id: 'y5', name: '夺忆者', cost: 5, atk: 3, shield: 4, structure: 2, series: '灵潮', rarity: '紫', text: '掠夺 2：命中本体时本回合指挥度 +2。', kw: { plunder: 2 } });
def({ id: 'y6', name: '潮心', cost: 6, atk: 4, shield: 5, structure: 2, series: '灵潮', rarity: '橙', text: '嗜血：击毁目标后可再攻击一次（每回合一次）。', kw: { bloodlust: true } });
def({ id: 'v1', name: '旧律执戟者', cost: 1, atk: 4, shield: 5, structure: 1, series: '旧律', rarity: '白', text: '锁链：对方必须先攻击它。', kw: { taunt: true } });
def({ id: 'v2', name: '法典侍从', cost: 2, atk: 3, shield: 4, structure: 1, series: '旧律', rarity: '白', text: '反噬 1：攻击后自身受到 1 点伤害。', kw: { recoil: 1 } });
def({ id: 'v3', name: '巡法官', cost: 3, atk: 4, shield: 4, structure: 3, series: '旧律', rarity: '蓝', text: '贯穿：击毁目标时，溢出伤害打到本体。', kw: { pierce: true } });
def({ id: 'v4', name: '执令骑士', cost: 4, atk: 4, shield: 4, structure: 1, series: '旧律', rarity: '蓝', text: '伏击：部署当回合即可攻击。', kw: { rush: true } });
def({ id: 'v5', name: '旧律裁判长', cost: 5, atk: 3, shield: 5, structure: 2, series: '旧律', rarity: '紫', text: '亡命 3：半血时补 3 护盾，受击后攻击 +3。', kw: { desper: 3 } });
def({ id: 'v6', name: '法典本体', cost: 6, atk: 4, shield: 4, structure: 1, series: '旧律', rarity: '橙', text: '狂怒 2：半血时攻击 +2。', kw: { berserk: 2 } });
```

## 2. 5 个头目（粘进 `const BOSSES = {` 里，`b5` 那行之后）

```js
  // 【雇佣兵协会】四支势力头目 + 弱海盗杂兵头目（hp 与技能文案与 data/mercenary/bosses.ts 一致）
  m01: { id: 'm01', name: '噬星母巢', hp: 30, skill: '开场自带 2 艘噬星幼虫；每回合结束：若己方场上不足 2 艘，召唤 1 艘噬星幼虫（q1）' },
  m02: { id: 'm02', name: '残响总控', hp: 32, skill: '己方全体攻击 +1；每回合开始：给己方场上结构最低的一艘补 1 护盾' },
  m03: { id: 'm03', name: '忆潮主祭', hp: 28, skill: '每回合开始：己方场上每有一艘灵潮战舰，你方本回合指挥度 -1' },
  m04: { id: 'm04', name: '旧律裁决官', hp: 34, skill: '己方全体护盾 +2；每回合结束：对玩家本体造成 1 点伤害（不经过护盾）' },
  m05: { id: 'm05', name: '海盗杂兵头目', hp: 18, skill: '开场自带 1 艘海盗杂兵；每回合结束：若己方场上不足 2 艘，召唤 1 艘海盗杂兵（t_grunt）' },
```

## 3. 敌池分支（`createBattle` 里那一行）

```js
  // 敌池三档：雇佣兵 m01~m04 各用自己那 30 张势力池；掠夺队用 15 张低阶池；其余（5 老巢 + m05）用海盗池。
  const MERC_POOLS = {
    m01: [].concat(...Array(5).fill(['q1', 'q2', 'q3', 'q4', 'q5', 'q6'])),
    m02: [].concat(...Array(5).fill(['z1', 'z2', 'z3', 'z4', 'z5', 'z6'])),
    m03: [].concat(...Array(5).fill(['y1', 'y2', 'y3', 'y4', 'y5', 'y6'])),
    m04: [].concat(...Array(5).fill(['v1', 'v2', 'v3', 'v4', 'v5', 'v6'])),
  };
  const enemyPool = MERC_POOLS[bossId] || (bossId === 'raid' ? RAID_POOL : PIRATE_POOL);
```

---

## 应用完 DEMO 之后的后续改动（app 内）

1. `node scripts/export-battle-data.cjs` 重导出 `data/battle/cards.ts`（67 张）与 `data/battle/pirates.ts`（11 个敌人）。
   ⚠ 先把 `scripts/export-battle-data.cjs:77` 的 `LAIR_BOSS_IDS` 改成只收 `b*`
   （`bids.filter((b) => /^b\d+$/.test(b))`），否则 m01~m05 会被算进老巢白名单。
2. `lib/battle/engine.ts`：删掉 `MERCENARY_CARDS` 的合并块与 3 个 `data/mercenary/*` import
   （24 张现在来自 `BATTLE_CARDS`），`BOSSES` 恢复成 `PIRATE_BOSSES`；**新加 24 条 `BEHAVIOR`**（内容就是上面每张卡的 `kw`）。
3. `data/mercenary/cards.ts`：删掉全部 `cost/atk/shield/structure`，只保留元数据
   `MERCENARY_SERIES_CARDS`（系列 → 6 个 id）与 `MERCENARY_SERIES` 列表；`bossDrops.ts` 的名字/稀有度改读 `BATTLE_CARDS`。
4. `scripts/audit-battle-port.cjs`：把过渡口径恢复成严格相等 —— `pOnly.length === 0`（注释写明"A2 起 DEMO 与移植版一一对应，不再有超集例外"）。
5. `scripts/verify-battle-data.cjs`：卡牌/敌人循环回到 `Object.keys(E.CARDS)` / `E.BOSSES`（导出后数量自然相等）。
6. 跑 `node --import ./scripts/register-ts.mjs scripts/check-battle.cjs`（15 步）。
