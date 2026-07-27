/** 领袖效果：产出加成 (buildingId → bonus%) */
type BonusMap = Record<string, number>;

export interface LeaderDef {
  id: string;
  name: string;
  rarity: 'R' | 'SR' | 'SSR';
  description: string;
  abilityName: string;
  /** 每级对建筑的产出加成 (% 值，如20表示+20%) */
  levelBonuses: BonusMap[];
  /** 每级的额外效果（可选） */
  levelExtras: Partial<LeaderExtraEffects>[];
}

export interface LeaderExtraEffects {
  popCapBonus: Record<string, number>;     // buildingId → 额外人口槽位
  foodConsumptionDelta: number;             // 每人食物消耗变动(负数=减少)
  populationCapBonus: number;              // 人口上限增加
  recruitCostBonus: number;                 // 招募费用变动(负数=减少)
  freePopEveryTurns: number;               // 每N回合免费1人口
  researchPerTurn: [number, number];       // [min, max]科研点
  buildCostReduction: number;              // 建筑费用减少%
  leaderCapBonus: number;                  // 领袖上限增加
  leaderCostReduction: number;             // 招募领袖费用减少
  recruitCapPerTurn: number;               // 每回合招募上限增加
  randomMatsPerTurn: number;               // 随机原料/回合
  darkMatterPerTurn: number;               // 暗物质/回合
  quantumPerTurn: number;                  // 量子簇/回合
  stardustPerTurn: number;                 // 星尘/回合
}

export const ALL_LEADERS: LeaderDef[] = [
  // ===== R级 (70%) =====
  { id: 'L1', rarity: 'R', name: '卡尔·钢铁', abilityName: '矿脉直觉',
    description: '曾经的恒星冶金大师，将一颗白矮星铸成了舰队。他视合金熔炉为神殿，每一炉钢水都是对熵增的抵抗。',
    levelBonuses: [{ B6:20,B7:20,B8:20 }, { B6:30,B7:30,B8:30 }, { B6:40,B7:40,B8:40 }],
    levelExtras: [{}, {}, { popCapBonus: { B6:5 } }] },
  { id: 'L2', rarity: 'R', name: '莉娜·绿手指', abilityName: '绿手指',
    description: '她曾让一颗死寂卫星绽放花海。手中的基因剪裁器不是工具，而是写满生命诗篇的羽毛笔。',
    levelBonuses: [{ B3:20,B4:20,B5:20 }, { B3:30,B4:30,B5:30 }, { B3:40,B4:40,B5:40 }],
    levelExtras: [{}, {}, { popCapBonus: { B4:10 } }] },
  { id: 'L3', rarity: 'R', name: '虚空财阀·诺姆', abilityName: '虚空套利',
    description: '据说他卖掉过同一个星系三次，买家至今仍在互相诉讼。',
    levelBonuses: [{ B11:20 }, { B11:30,B12:30 }, { B11:40,B12:40 }],
    levelExtras: [{}, {}, {}] },
  { id: 'L4', rarity: 'R', name: '沙尘·艾德', abilityName: '黑金血脉',
    description: '前半生是沙漠行星的勘探队长，后半生是石油泵站的守护者。',
    levelBonuses: [{ B13:20,B19:20 }, { B13:35,B19:35 }, { B13:50,B19:50 }],
    levelExtras: [{}, {}, { popCapBonus: { B13:5 } }] },
  { id: 'L5', rarity: 'R', name: '金脉·奥莉薇', abilityName: '贵金属共鸣',
    description: '她曾用声波共振仪在废弃小行星带找到一条纯金矿脉，被矿业公会称为金色女巫。',
    levelBonuses: [{ B14:20,B22:20 }, { B14:35,B22:35 }, { B14:50,B22:50 }],
    levelExtras: [{}, {}, { popCapBonus: { B22:5 } }] },
  { id: 'L6', rarity: 'R', name: '碳语者·莫里斯', abilityName: '碳基统御',
    description: '曾在一颗被烧成焦炭的星球上发现碳块富集层，坚信碳是宇宙最诚实的通货。',
    levelBonuses: [{ B15:20,B20:20 }, { B15:35,B20:35 }, { B15:50,B20:50 }],
    levelExtras: [{}, {}, { popCapBonus: { B20:6 } }] },
  { id: 'L7', rarity: 'R', name: '幽影·泽维尔', abilityName: '暗影捕手',
    description: '他曾在黑洞阴影区捕获一缕暗物质流，并将其命名为宇宙的呼吸。',
    levelBonuses: [{ B16:20,B21:20 }, { B16:35,B21:35 }, { B16:50,B21:50 }],
    levelExtras: [{}, {}, { popCapBonus: { B21:4 } }] },
  { id: 'L8', rarity: 'R', name: '量子·瑟琳娜', abilityName: '涨落编织者',
    description: '出身于量子谐振器实验室，她能在虚空中听见量子簇的震颤。',
    levelBonuses: [{ B17:20,B23:20 }, { B17:35,B23:35 }, { B17:50,B23:50 }],
    levelExtras: [{}, {}, { popCapBonus: { B23:5 } }] },
  { id: 'L9', rarity: 'R', name: '晶芒·哈罗德', abilityName: '硅晶之眼',
    description: '曾是硅晶提取站的技工，被同行称为硅片诗人。',
    levelBonuses: [{ B18:20,B24:20 }, { B18:35,B24:35 }, { B18:50,B24:50 }],
    levelExtras: [{}, {}, { popCapBonus: { B24:6 } }] },
  // ===== SR级 (27%) =====
  { id: 'L10', rarity: 'SR', name: '艾萨克·星图', abilityName: '智识洪流',
    description: '能用心算解出轨道方程的学界怪杰，坚信科研不是工作而是与宇宙的对弈。',
    levelBonuses: [{}, {}, {}],
    levelExtras: [{ researchPerTurn:[30,60] }, { researchPerTurn:[40,80] }, { researchPerTurn:[50,100] }] },
  { id: 'L11', rarity: 'SR', name: '学识·赫尔曼', abilityName: '知识圣殿',
    description: '他一生拒绝离开实验室，却通过数据分析预言了三个星系的文明崩溃。',
    levelBonuses: [{ B25:30 }, { B25:50 }, { B25:70 }],
    levelExtras: [{}, {}, { researchPerTurn:[50,50] }] },
  { id: 'L12', rarity: 'SR', name: '共鸣·菲尼克斯', abilityName: '星尘咏者',
    description: '她是星尘共鸣尖塔的第一任主工程师，声称曾听到尖塔唱出了一首超新星挽歌。',
    levelBonuses: [{ B9:30,B10:30 }, { B9:50,B10:50 }, { B9:70,B10:70 }],
    levelExtras: [{}, {}, { stardustPerTurn: 1 }] },
  { id: 'L13', rarity: 'SR', name: '克隆·艾琳', abilityName: '生命复制协议',
    description: '她是克隆中心伦理争议的核心人物，却坚称每个克隆体都是独立的星辰。',
    levelBonuses: [{}, {}, {}],
    levelExtras: [{ freePopEveryTurns: 1 }, { populationCapBonus: 5 }, { populationCapBonus: 10, foodConsumptionDelta: -1 }] },
  { id: 'L14', rarity: 'SR', name: '玛尔塔·丰穗', abilityName: '后勤艺术',
    description: '舰队后勤官出身，据说她曾用一船口粮喂饱三船人。',
    levelBonuses: [{}, {}, {}],
    levelExtras: [{ foodConsumptionDelta: -1 }, { foodConsumptionDelta: -1, populationCapBonus: 5 }, { foodConsumptionDelta: -2, populationCapBonus: 10 }] },
  { id: 'L15', rarity: 'SR', name: '诺亚·方舟', abilityName: '移民浪潮',
    description: '他曾在殖民地大饥荒中带出三千名幸存者。此后无论走到哪里，追随者都如潮水般涌来。',
    levelBonuses: [{}, {}, {}],
    levelExtras: [{ freePopEveryTurns: 4 }, { freePopEveryTurns: 3 }, { freePopEveryTurns: 2, recruitCapPerTurn: 3 }] },
  // ===== SSR级 (3%) =====
  { id: 'L16', rarity: 'SSR', name: '苍穹·奥丁', abilityName: '穹顶之父',
    description: '传说他曾以一己之力设计出穹顶都市的第三代生态循环系统，让一座濒死殖民地重获新生。',
    levelBonuses: [{}, {}, {}],
    levelExtras: [{ populationCapBonus: 0/*B1/B2 +50% handled in calcPopCap */ }, { buildCostReduction: 30/*B2 only*/ }, { buildCostReduction: 50, populationCapBonus: 5 }] },
  { id: 'L17', rarity: 'SSR', name: '永动·卡尔文', abilityName: '永恒循环',
    description: '他宣称自己找到了资源循环的终极公式，任何废弃物在他手中都会变成某种生产的起点。',
    levelBonuses: [{ 'ALL_MATERIAL':25 }, { 'ALL_MATERIAL':40 }, { 'ALL_MATERIAL':60 }],
    levelExtras: [{}, {}, { randomMatsPerTurn: 6 }] },
  { id: 'L18', rarity: 'SSR', name: '盖亚·行星之心', abilityName: '行星意志',
    description: '没有人见过她的真容。只听说她与行星共生——她入睡时矿脉会自主生长。',
    levelBonuses: [{ 'ALL':20 }, { 'ALL':35 }, { 'ALL':50 }],
    levelExtras: [{ buildCostReduction: 10 }, { buildCostReduction: 20 }, { buildCostReduction: 30, darkMatterPerTurn: 2, quantumPerTurn: 2 }] },
  { id: 'L19', rarity: 'SSR', name: '普罗米修斯·薪火', abilityName: '生生不息',
    description: '基因方舟计划的发起人，坚信文明的火种必须撒向每一颗星球。',
    levelBonuses: [{}, {}, {}],
    levelExtras: [{ populationCapBonus: 10, recruitCostBonus: -500 }, { populationCapBonus: 20, recruitCostBonus: -1000, recruitCapPerTurn: 4 }, { populationCapBonus: 30, recruitCostBonus: -1500, recruitCapPerTurn: 7 }] },
  { id: 'L20', rarity: 'SSR', name: '贤者·塞拉斯', abilityName: '贤者议会',
    description: '他曾是星际贤才招募法案的起草人，坚信一个文明的伟大程度取决于它容纳天才的胸怀。',
    levelBonuses: [{}, {}, {}],
    levelExtras: [{ leaderCapBonus: 1 }, { leaderCapBonus: 2, leaderCostReduction: 2 }, { leaderCapBonus: 3, leaderCostReduction: 3, researchPerTurn: [50,100] }] },
];

export function getLeaderDef(id: string): LeaderDef | undefined {
  return ALL_LEADERS.find((l) => l.id === id);
}

/** 随机生成3个领袖招募选项 */
export function rollLeaders(count: number = 3): LeaderDef[] {
  const results: LeaderDef[] = [];
  const pool = [...ALL_LEADERS];
  for (let i = 0; i < count; i++) {
    const r = Math.random();
    let rarity: 'R' | 'SR' | 'SSR';
    if (r < 0.70) rarity = 'R';
    else if (r < 0.97) rarity = 'SR';
    else rarity = 'SSR';
    const candidates = pool.filter((l) => l.rarity === rarity);
    if (candidates.length === 0) {
      const idx = Math.floor(Math.random() * pool.length);
      results.push(pool[idx]);
      pool.splice(idx, 1);
    } else {
      const idx = Math.floor(Math.random() * candidates.length);
      results.push(candidates[idx]);
      pool.splice(pool.indexOf(candidates[idx]), 1);
    }
  }
  return results;
}
