// ==================== 考古永久加成（单一真值） ====================
// 来源：完成对应遗迹的最终奖励（见 data/galaxy/archaeology.ts 的 reward.permaBonuses）。
// 取值一律走 getPermaBonusValue()，勿在 economy/colonyTurn/graph 里就地判断 id。
// 一个加成可同时给多个作用点（如「永续光」既加电力又延长停电保护），故用 effects 数组。

/** 加成作用点（每个作用点只有一个消费处，见 AGENTS.md 的单一真值表） */
export type PermaBonusKind =
  | 'foodPct'            // 殖民地食物产出加成（百分点，加算）
  | 'researchPct'        // 殖民地科研点产出加成（百分点，加算）
  | 'powerPct'           // 殖民地电力产出加成（百分点，加算）
  | 'blackoutGuardTurns' // 停电保护回合数（与 colonyTurn 的 BLACKOUT_GUARD_TURNS 相加）
  | 'travelTurnReduce';  // 跃迁回合减免（与装置/遗物减免加算，下限 1）

export interface PermaBonusEffect {
  kind: PermaBonusKind;
  /** 百分比类为百分点（15 = +15%），回合类为回合数 */
  value: number;
}

export interface PermaBonusDef {
  id: string;
  name: string;
  description: string;
  effects: PermaBonusEffect[];
  /** 来源遗迹 id（供图鉴/提示反查） */
  siteId: string;
}

export const PERMA_AGRICULTURE = 'perm_agriculture';
export const PERMA_CYCLE = 'perm_cycle';
export const PERMA_STARCAL = 'perm_starcal';
export const PERMA_ETERNAL_LIGHT = 'perm_eternal_light';

export const ALL_PERMA_BONUSES: PermaBonusDef[] = [
  {
    id: PERMA_AGRICULTURE,
    name: '农业遗产',
    description: '园丁的育种档案被完整复原，殖民地食物产出 +15%',
    effects: [{ kind: 'foodPct', value: 15 }],
    siteId: 'cradle',
  },
  {
    id: PERMA_CYCLE,
    name: '循环理论',
    description: '两仪者的九转循环模型被读懂，殖民地科研点产出 +15%',
    effects: [{ kind: 'researchPct', value: 15 }],
    siteId: 'crucible',
  },
  {
    id: PERMA_STARCAL,
    name: '星轨校准',
    description: '轨道师的校准表缩短了每一次跃迁，跃迁回合 -1（下限 1）',
    effects: [{ kind: 'travelTurnReduce', value: 1 }],
    siteId: 'orrery',
  },
  {
    id: PERMA_ETERNAL_LIGHT,
    name: '永续光',
    description: '掌灯者的光电结构被复刻到殖民地电网，电力产出 +20%',
    effects: [
      { kind: 'powerPct', value: 20 },
    ],
    siteId: 'lighthouse',
  },
];

export const PERMA_BONUS_MAP: Record<string, PermaBonusDef> = Object.fromEntries(
  ALL_PERMA_BONUSES.map((b) => [b.id, b])
);

export function getPermaBonusDef(id: string | undefined): PermaBonusDef | undefined {
  return id ? PERMA_BONUS_MAP[id] : undefined;
}

/** 按作用点汇总已获得的永久加成（加算） */
export function getPermaBonusValue(ids: string[] | undefined, kind: PermaBonusKind): number {
  if (!ids || ids.length === 0) return 0;
  const owned = new Set(ids);
  let total = 0;
  for (const def of ALL_PERMA_BONUSES) {
    if (!owned.has(def.id)) continue;
    for (const eff of def.effects) {
      if (eff.kind === kind) total += eff.value;
    }
  }
  return total;
}
