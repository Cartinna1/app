'use strict';
/* ============================================================================
   星图：海盗老巢配色 + **迷雾复核**（用户 2026-08 的第 1 条 UI 调整）
   用法：node --import ./scripts/register-ts.mjs scripts/check-galaxy-lair.cjs

   要点：老巢节点本体是 `empty` 类型，过去和普通空星系一样是灰点，看不出"这里有老巢"。
   现在已探明的老巢画成海盗红 —— 但**未探明的老巢必须与普通未探明节点逐字节相同**，
   否则玩家在星图上一眼就能看出"这个灰点会变红 = 这里有老巢"，迷雾就废了。
   所以本脚本的两条硬断言：
     ① 对每个未探明节点（老巢 / 普通 empty / 势力 / 殖民 / 遗迹），nodeStyle 的输出必须
        **完全等于**同一组固定值 { r: 类型半径, fill: #1e293b, stroke: #475569 }，
        且老巢的 r/fill/stroke 与同类型的普通 empty 未探明节点**逐字节相同**；
     ② 已探明的老巢必须是红色（LAIR_FILL/LAIR_STROKE），且与已探明的普通 empty 不同色。
   判据 discovered 一律走 lib/galaxy/knowledge.isNodeDiscovered（迷雾唯一真值），
   本脚本不自己写 visitedNodes.includes。
   ============================================================================ */
const fails = [];
const check = (ok, label, detail) => {
  if (ok) console.log('  ✓ ' + label);
  else { fails.push(label + (detail ? ' → ' + detail : '')); console.log('  ✗ ' + label + (detail ? '  → ' + detail : '')); }
};
const J = (v) => JSON.stringify(v);

(async () => {
  const S = await import('@/lib/galaxy/nodeStyle');
  const K = await import('@/lib/galaxy/knowledge');
  const N = await import('@/data/galaxy/nodes');
  // ⚠ createInitialGameState() 的 ships 是空数组（母舰在 SELECT_SHIP 才创建），
  //   所以迷雾判据要有真母舰 → 用 createMotherships()（与 check-battle-expedition 同口径）。
  const { createMotherships } = await import('@/data/gameData');

  const need = ['nodeStyle', 'nodeTypeLabel', 'NODE_RADIUS', 'LAIR_FILL', 'LAIR_STROKE', 'UNDISCOVERED_FILL', 'UNDISCOVERED_STROKE', 'LAIR_LABEL'];
  const missing = need.filter((k) => S[k] === undefined);
  if (missing.length) { console.error('nodeStyle.ts 缺少导出：' + missing.join(', ') + '（现有：' + Object.keys(S).join(', ') + '）'); process.exit(2); }

  const ALL = N.GALAXY_NODES;
  const lairs = ALL.filter((n) => n.pirateLair);
  const plainEmpty = ALL.filter((n) => n.type === 'empty' && !n.pirateLair);
  const ship = createMotherships()[0];
  /** 一艘**什么都没探明**的母舰（起点势力节点也清掉）—— 用来逐节点复核迷雾 */
  const virgin = { ...ship, galaxy: { ...ship.galaxy, visitedNodes: [] } };

  // ---------- ① 老巢标记与数据形状 ----------
  console.log('\n[1] 老巢标记（pirateLair）与节点类型');
  check(lairs.length === 5, '5 个海盗老巢节点', String(lairs.length));
  check(lairs.every((n) => n.type === 'empty'), '老巢节点的 type 都是 empty（配色才需要特判）');
  check(ship != null, '拿到母舰（读 ship.galaxy.visitedNodes 作迷雾判据）');

  // ---------- ② 迷雾复核：未探明的老巢 == 普通未探明节点（核心断言） ----------
  console.log('\n[2] 迷雾复核：未探明的老巢 vs 普通未探明节点（**必须逐字节相同**）');
  {
    check(ALL.every((n) => !K.isNodeDiscovered(virgin, n.id)), 'visitedNodes 为空时 50 个节点全部未探明（判据 = knowledge.isNodeDiscovered）');

    const undiscoveredStyles = ALL.map((n) => ({ id: n.id, lair: !!n.pirateLair, type: n.type, style: S.nodeStyle(n, K.isNodeDiscovered(virgin, n.id)) }));
    // 未探明时：50 个节点必须只有 4 种样式（按类型半径），颜色一律是同一组灰
    const colorSet = [...new Set(undiscoveredStyles.map((x) => x.style.fill + '/' + x.style.stroke))];
    check(colorSet.length === 1 && colorSet[0] === S.UNDISCOVERED_FILL + '/' + S.UNDISCOVERED_STROKE,
      '未探明节点只有一组配色（无老巢特例）', colorSet.join(' , '));
    check(undiscoveredStyles.every((x) => x.style.fill === S.UNDISCOVERED_FILL && x.style.stroke === S.UNDISCOVERED_STROKE),
      '全部未探明节点都是灰底 #1e293b / 灰边 #475569');
    check(undiscoveredStyles.every((x) => x.style.r === S.NODE_RADIUS[x.type]), '未探明节点的半径只由 type 决定（不含老巢特判）');

    // 逐节点对比：每个未探明老巢 vs 每个未探明普通 empty —— 三元组完全相同
    const emptyStyle = S.nodeStyle(plainEmpty[0], false);
    const lairMismatch = lairs.filter((n) => {
      const got = S.nodeStyle(n, K.isNodeDiscovered(virgin, n.id));
      return got.r !== emptyStyle.r || got.fill !== emptyStyle.fill || got.stroke !== emptyStyle.stroke;
    });
    check(lairMismatch.length === 0,
      `5 个未探明老巢与普通未探明 empty 节点样式完全相同（r=${emptyStyle.r} fill=${emptyStyle.fill} stroke=${emptyStyle.stroke}）`,
      lairMismatch.map((n) => n.id + '=' + J(S.nodeStyle(n, false))).join(' , '));

    // 未探明分支**不看 pirateLair**：抽掉标记后结果必须一模一样（判据只读 discovered）
    const stripped = ALL.map((n) => {
      const bare = { ...n };
      delete bare.pirateLair;
      return { id: n.id, a: J(S.nodeStyle(n, false)), b: J(S.nodeStyle(bare, false)) };
    });
    check(stripped.every((x) => x.a === x.b),
      '未探明时去掉 pirateLair 后渲染完全相同（pirateLair 不参与未探明分支）',
      stripped.filter((x) => x.a !== x.b).map((x) => x.id).join(' , '));

    // 玩家可见的其它出口：未探明老巢的名字必须是「未探测星系」（不泄露身份）
    check(lairs.every((n) => K.getNodeDisplayName(virgin, n.id) === '未探测星系'),
      '未探明老巢的显示名都是「未探测星系」');
    // 只探明了一个老巢、其余全黑时：变红的只有那一个，其它 4 个仍是灰（不连坐）
    const onlyOne = { ...ship, galaxy: { ...ship.galaxy, visitedNodes: [lairs[0].id] } };
    const oneRed = lairs.filter((n) => S.nodeStyle(n, K.isNodeDiscovered(onlyOne, n.id)).fill === S.LAIR_FILL);
    check(oneRed.length === 1 && oneRed[0].id === lairs[0].id,
      '只探明一个老巢时只有它变红（其余老巢仍是灰点）',
      oneRed.map((n) => n.id).join(' , '));
  }

  // ---------- ③ 已探明：老巢变红、普通空星系保持灰 ----------
  console.log('\n[3] 已探明：老巢 = 海盗红，普通空星系 = 灰');
  const allVisited = { ...ship, galaxy: { ...ship.galaxy, visitedNodes: ALL.map((n) => n.id) } };
  {
    const lairStyles = lairs.map((n) => ({ id: n.id, style: S.nodeStyle(n, K.isNodeDiscovered(allVisited, n.id)) }));
    check(lairs.every((n) => K.isNodeDiscovered(allVisited, n.id)), '把 50 个节点全标为已探明');
    check(lairStyles.every((x) => x.style.fill === S.LAIR_FILL && x.style.stroke === S.LAIR_STROKE),
      `已探明老巢一律 ${S.LAIR_FILL} / ${S.LAIR_STROKE}`,
      lairStyles.map((x) => x.id + '=' + x.style.fill).join(' , '));
    check(lairStyles.every((x) => x.style.r === S.NODE_RADIUS.empty), '老巢半径仍与普通 empty 同尺寸（不放大）');

    const emptyDiscovered = S.nodeStyle(plainEmpty[0], true);
    check(emptyDiscovered.fill === S.NODE_FILL.empty && emptyDiscovered.stroke === S.NODE_STROKE.empty,
      `已探明普通空星系保持原灰（${S.NODE_FILL.empty}）`, J(emptyDiscovered));
    check(emptyDiscovered.fill !== S.LAIR_FILL, '已探明老巢与普通空星系不同色（能看出是海盗老巢）');

    // 归属：老巢红色不与其它类型撞色
    const others = [S.NODE_FILL.faction, S.NODE_FILL.colony, S.NODE_FILL.ruin, S.NODE_FILL.empty, S.UNDISCOVERED_FILL];
    check(!others.includes(S.LAIR_FILL), '海盗红不与既有节点配色重复', others.join(' , '));
  }

  // ---------- ④ 信息卡类型标签 ----------
  console.log('\n[4] 类型标签（信息卡 / 图例）');
  {
    check(lairs.every((n) => S.nodeTypeLabel(n) === S.LAIR_LABEL), `5 个老巢标签都是「${S.LAIR_LABEL}」`);
    check(plainEmpty.every((n) => S.nodeTypeLabel(n) === S.TYPE_LABEL.empty), '普通空星系标签是「空星系」');
    check(!lairs.some((n) => S.nodeTypeLabel(n) === '空星系'), '老巢可见处不出现「空星系」');
    const types = ['faction', 'colony', 'ruin', 'empty'];
    check(types.every((t) => S.TYPE_LABEL[t] && S.TYPE_LABEL[t].length > 0), '四类节点都有类型标签（图例用）');
  }

  console.log('\n=== 星图老巢配色 / 迷雾复核 ' + (fails.length ? '未通过 ✗' : '全部通过 ✓') + ' ===');
  if (fails.length) { console.log('失败项：\n - ' + fails.join('\n - ')); process.exitCode = 1; }
})();
