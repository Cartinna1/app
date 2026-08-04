import { useState, useMemo, useEffect } from 'react';
import type { Mothership } from '@/types/game';
import type { PlanetTypeId, PlanetDef } from '@/types/colony';
import { getBuildableBuildings, getBuildingDef, getBuildingEffect } from '@/data/colony/buildings';
import { getPlanetById } from '@/data/colony/planets';
import { getTechById, getAvailableTechs, REPEATABLE_TECHS, getRepeatableCost } from '@/data/colony/techs';
import { getLeaderDef } from '@/data/colony/leaders';
import { Home, Users, Wrench, Play, UserPlus, FlaskConical, Crown, Trophy } from 'lucide-react';
import WonderPanel from './WonderPanel';

// ==================== 辅助函数 ====================

const MAT_NAMES: Record<string, string> = {
  carbon: '碳块', gold_ore: '黄金', oil: '石油',
  dark_matter: '暗物质', silicon: '硅片', quantum: '量子簇',
};

function matLabel(id: string): string { return MAT_NAMES[id] || id; }

function getBuffList(planet: PlanetDef): { name: string; desc: string; color: string }[] {
  const list: { name: string; desc: string; color: string }[] = [];
  // 按照文档中的 BUFF 名称
  if (planet.id === 'desert') {
    list.push({ name: '烈日熔炼', desc: '合金建筑（电弧熔炼炉/纳米铸造阵列/星核熔炉）产量 +50%', color: 'text-orange-400' });
    list.push({ name: '烈日光伏', desc: '太阳能阵列发电量 +50%', color: 'text-yellow-400' });
    list.push({ name: '荒漠贫瘠', desc: '食物建筑（气雾栽培舱/蛋白质重组塔/生态穹顶）产量 −30%', color: 'text-red-400' });
    list.push({ name: '酷暑制冷', desc: '所有建筑电能消耗 +10%', color: 'text-red-400' });
  } else if (planet.id === 'ocean') {
    list.push({ name: '深海馈赠', desc: '食物建筑（气雾栽培舱/蛋白质重组塔/生��穹顶）产量 +60%', color: 'text-green-400' });
    list.push({ name: '港湾贸易', desc: '星际贸易节点与泛星系金融交易所金币收入 +20%', color: 'text-yellow-400' });
    list.push({ name: '水上施工', desc: '所有建筑造价 +20%', color: 'text-amber-400' });
    list.push({ name: '盐雾腐蚀', desc: '所有建筑电能消耗 +20%', color: 'text-red-400' });
  } else if (planet.id === 'polar') {
    list.push({ name: '极光星尘', desc: '星尘捕获网与共鸣尖塔产出 +30%', color: 'text-purple-400' });
    list.push({ name: '低温超导', desc: '科研所需回合 −1', color: 'text-blue-400' });
    list.push({ name: '热能消耗', desc: '每位殖民者每回合多消耗 1 食物', color: 'text-red-400' });
    list.push({ name: '冰封基建', desc: '所有建筑多花 1 回合建造', color: 'text-amber-400' });
  } else if (planet.id === 'arid') {
    list.push({ name: '熔岩炼金', desc: '合金建筑（电弧熔炼炉/纳米铸造阵列/星核熔炉）产量 +60%', color: 'text-orange-400' });
    list.push({ name: '地脉黄金', desc: '贵金属提取器与地核熔炼厂黄金产出 +60%', color: 'text-yellow-400' });
    list.push({ name: '不毛之地', desc: '食物建筑（气雾栽培舱/蛋白质重组塔/生态穹顶）产量 −20%', color: 'text-red-400' });
    list.push({ name: '漫天沙尘', desc: '太阳能阵列发电量 −20%', color: 'text-red-400' });
  } else if (planet.id === 'terran') {
    list.push({ name: '文明摇篮', desc: '殖民地开局人口上限 10，自带 5 位殖民者', color: 'text-green-400' });
    list.push({ name: '温和日照', desc: '太阳能阵列发电量 +20%', color: 'text-yellow-400' });
    list.push({ name: '环保红线', desc: '所有建筑造价 +10%', color: 'text-amber-400' });
    list.push({ name: '贫矿地壳', desc: '合金建筑（电弧熔炼炉/纳米铸造阵列/星核熔炉）产量 −20%', color: 'text-red-400' });
  } else if (planet.id === 'alpine') {
    list.push({ name: '苍穹智识', desc: '研究实验室与量子实验室产出 +80%', color: 'text-purple-400' });
    list.push({ name: '地脉碳矿', desc: '碳沉积采集器与碳基合成器碳块产出 +40%', color: 'text-yellow-400' });
    list.push({ name: '山地高昂', desc: '所有建筑造价 +20%', color: 'text-amber-400' });
    list.push({ name: '山峰蔽日', desc: '太阳能阵列发电量 −20%', color: 'text-red-400' });
  } else if (planet.id === 'savannah') {
    list.push({ name: '地底油海', desc: '碳氢化合物泵站与地壳深钻平台石油产出 +80%', color: 'text-amber-400' });
    list.push({ name: '旷野日照', desc: '太阳能阵列发电量 +20%', color: 'text-yellow-400' });
    list.push({ name: '旱季饥荒', desc: '食物建筑（气雾栽培舱/蛋白质重组塔/生态穹顶）产量 −20%', color: 'text-red-400' });
    list.push({ name: '地广人稀', desc: '所有建筑多花 1 回合建造', color: 'text-amber-400' });
  } else if (planet.id === 'tropical') {
    list.push({ name: '雨林丰收', desc: '食物建筑（气雾栽培舱/蛋白质重组塔/生态穹顶）产量 +60%', color: 'text-green-400' });
    list.push({ name: '碳木丛生', desc: '碳沉积采集器与碳基合成器碳块产出 +100%', color: 'text-yellow-400' });
    list.push({ name: '丛林施工', desc: '所有建筑造价 +20%', color: 'text-amber-400' });
    list.push({ name: '浓云密布', desc: '太阳能阵列发电量 −30%', color: 'text-red-400' });
  } else if (planet.id === 'tundra') {
    list.push({ name: '量子永冻', desc: '量子谐振器与晶格锻炉量子簇产出 +60%', color: 'text-purple-400' });
    list.push({ name: '暗质潜藏', desc: '暗物质捕获阱与压缩阱产出 +60%', color: 'text-purple-400' });
    list.push({ name: '苦寒征召', desc: '招募每人口费用增加 500 金币', color: 'text-red-400' });
    list.push({ name: '冻土贫瘠', desc: '食物建筑（气雾栽培舱/蛋白质重组塔/生态穹顶）产量 −10%', color: 'text-red-400' });
  } else if (planet.id === 'ruin') {
    list.push({ name: '文明遗珍', desc: '开局拥有纳米铸造阵列、碳基材料合成器、暗物质压缩阱各一座', color: 'text-cyan-400' });
    list.push({ name: '古城穹庐', desc: '每栋居住舱额外提供 3 人口上限', color: 'text-slate-400' });
    list.push({ name: '废墟清障', desc: '所有建筑多花 1 回合建造', color: 'text-amber-400' });
    list.push({ name: '电网老化', desc: '所有建筑电能消耗 +10%', color: 'text-red-400' });
  }
  return list;
}

function getOutputDesc(def: ReturnType<typeof getBuildingDef>): string {
  if (!def) return '';
  if (def.outputType === 'food') return `产食物: ${def.baseOutput}+入驻×${def.popFactor}/回合`;
  if (def.outputType === 'alloy') return `产合金: ${def.baseOutput}+入驻×${def.popFactor}/回合`;
  if (def.outputType === 'gold') return `产金币: ${def.goldOutputMin}-${def.goldOutputMax}/回合`;
  if (def.outputType === 'stardust') return `产星尘: ${def.baseOutput}/回合`;
  if (def.outputType === 'material') return `产${matLabel(def.outputMaterialId || '')}: 入驻×${def.popFactor}/回合`;
  if (def.outputType === 'research') return `产科研点: ${def.popFactor}×入驻/回合`;
  if (def.category === 'housing') return `人口上限+${def.id === 'B2' ? '20' : '5'}`;
  if (def.id === 'B27') return '解锁招募领袖';
  if (def.id === 'B26') return '研究实验室产出×1.5';
  if (def.id === 'B28') return '每2回合+1人口';
  return '';
}

const CAT_COLORS: Record<string, string> = {
  housing: 'bg-blue-900/30 text-blue-400', food: 'bg-green-900/30 text-green-400',
  alloy: 'bg-slate-700/50 text-slate-300', stardust: 'bg-purple-900/30 text-purple-400',
  trade: 'bg-yellow-900/30 text-yellow-400', material: 'bg-amber-900/30 text-amber-400',
  functional: 'bg-cyan-900/30 text-cyan-400',
};
const CAT_LABELS: Record<string, string> = {
  housing: '居住', food: '食物', alloy: '合金', stardust: '星尘', trade: '贸易', material: '原料', functional: '功能', power: '电能',
};

// ==================== 组件 ====================

interface ColonyPanelProps {
  ship: Mothership;
  onUnlockColony: () => { success: boolean; message: string };
  onSelectPlanet: (planetId: PlanetTypeId, name: string) => { success: boolean; message: string };
  onRescrollPlanets: () => { success: boolean; message: string };
  generateScoutingPool: () => PlanetTypeId[];
  onBuild: (defId: string) => { success: boolean; message: string };
  onRecruitPop: (amount: number) => { success: boolean; message: string };
  onAssignPop: (buildingUid: string, count: number) => { success: boolean; message: string };
  onStartResearch: (techId: string) => { success: boolean; message: string };
  onRecruitLeader: (leaderId: string) => void;
  onUpgradeLeader: (leaderIndex: number) => { success: boolean; message: string };
  onRollAndRecruit: () => void;
  onCancelBuilding: (uid: string) => void;
  onDemolishBuilding: (uid: string) => { success: boolean; message: string };
  // 奇观
  onSelectWonder: (wonderId: string) => { success: boolean; message: string };
  onSubmitWonderResources: () => { success: boolean; message: string };
  onCompleteWonder: () => { success: boolean; message: string };
  canStartWonder: () => { success: boolean; reasons: string[] };
}

type ColonyTab = 'overview' | 'buildings' | 'population' | 'research' | 'leaders' | 'wonders';

export default function ColonyPanel(props: ColonyPanelProps) {
  const { ship, onUnlockColony, onSelectPlanet, onRescrollPlanets, generateScoutingPool, onBuild, onRecruitPop, onAssignPop, onStartResearch, onRecruitLeader, onUpgradeLeader, onRollAndRecruit, onCancelBuilding, onDemolishBuilding, onSelectWonder, onSubmitWonderResources, onCompleteWonder, canStartWonder } = props;
  const colony = ship.colony;
  const [tab, setTab] = useState<ColonyTab>('overview');
  const [message, setMessage] = useState('');
  const [msgType, setMsgType] = useState<'success' | 'error'>('success');
  const [recruitQty, setRecruitQty] = useState(1);
  const [planetName, setPlanetName] = useState('');
  const [scoutPool, setScoutPool] = useState<PlanetTypeId[] | null>(null);
  const [buildCatFilter, setBuildCatFilter] = useState<string>('housing');
  const [popCatFilter, setPopCatFilter] = useState<string>('all');
  const [liveBuildFilter, setLiveBuildFilter] = useState<string>('housing');
  const showMsg = (m: string, t: 'success' | 'error') => { setMessage(m); setMsgType(t); setTimeout(() => setMessage(''), 4000); };

  // 离开选择星球阶段时清理状态
  useEffect(() => {
    if (!colony || colony.phase !== 'selecting') {
      setScoutPool(null);
      setPlanetName('');
    }
  }, [colony?.phase]);

  // 科研：稳定随机选项
  const researchOptions = useMemo(() => {
    if (!colony?.techState || colony.techState.currentResearch) return [];
    const available = getAvailableTechs(colony.techState.researched);
    if (available.length > 0) {
      return [...available].sort(() => Math.random() - 0.5).slice(0, 2).map((t) => ({ id: t.id, name: t.name, desc: t.description, cost: t.costRP, turns: t.researchTurns, isRepeatable: false, repeatLevel: 0, unlocksBuilding: t.unlocksBuilding, leaderCapBonus: t.leaderCapBonus }));
    }
    // 全部研究完：显示循环科技
    const levels = colony.techState.repeatableLevels || {};
    return REPEATABLE_TECHS.map((rt) => ({
      id: rt.id,
      name: rt.name,
      desc: `${rt.description}（已叠加 ${levels[rt.id] || 0} 次）`,
      cost: getRepeatableCost(rt, levels[rt.id] || 0),
      turns: rt.researchTurns,
      isRepeatable: true,
      repeatLevel: levels[rt.id] || 0,
    }));
  }, [colony?.techState?.researched, colony?.techState?.currentResearch, colony?.techState?.researchSeed, colony?.techState?.repeatableLevels]);

  // 提前计算活跃建筑的合并视图（必须在条件 return 之前，hooks 顺序不能变）
  const liveBuildings = useMemo(() => (colony?.buildings || []).filter((b: any) => b.active), [colony?.buildings]);
  const pendingBuildings = useMemo(() => (colony?.buildings || []).filter((b: any) => !b.active), [colony?.buildings]);

  // 计算每个建筑的显示编号（同类建筑按索引01/02...）
  const buildingNumbers = useMemo(() => {
    const nums: Record<string, string> = {};
    const counters: Record<string, number> = {};
    for (const inst of liveBuildings) {
      counters[inst.defId] = (counters[inst.defId] || 0) + 1;
      nums[inst.uid] = String(counters[inst.defId]).padStart(2, '0');
    }
    return nums;
  }, [liveBuildings]);

  // ===== 未解锁 =====
  if (!colony || colony.phase === 'inactive') {
    return (
      <div className="space-y-4">
        <h2 className="text-xl font-bold text-white">星际殖民</h2>
        <div className="bg-slate-900/60 border border-slate-700 rounded-xl p-6 text-center">
          <Home size={48} className="mx-auto mb-3 text-slate-600" />
          <p className="text-slate-300 text-sm mb-2">尚未解锁星际殖民功能</p>
          <p className="text-slate-500 text-sm mb-4">花费 30,000 金币组建远征军，开拓属于你的殖民星球。</p>
          <button
            onClick={() => { const r = onUnlockColony(); showMsg(r.message, r.success ? 'success' : 'error'); }}
            disabled={ship.gold < 30000}
            className={`px-6 py-2.5 rounded-lg font-bold text-sm transition-colors ${ship.gold >= 30000 ? 'bg-cyan-600 hover:bg-cyan-500 text-white' : 'bg-slate-700 text-slate-500 cursor-not-allowed'}`}
          >{ship.gold >= 30000 ? '组建远征军 (30,000金币)' : '金币不足 (30,000)'}</button>
        </div>
        {message && <div className={`p-3 rounded-lg text-sm text-center ${msgType === 'success' ? 'bg-green-900/20 border border-green-700/50 text-green-400' : 'bg-red-900/20 border border-red-700/50 text-red-400'}`}>{message}</div>}
      </div>
    );
  }

  // ===== 探索中 =====
  if (colony.phase === 'scouting') {
    return (
      <div className="space-y-4">
        <h2 className="text-xl font-bold text-white">星际殖民</h2>
        <div className="bg-slate-900/60 border border-cyan-700/40 rounded-xl p-6 text-center">
          <Play size={48} className="mx-auto mb-3 text-cyan-400" />
          <p className="text-cyan-400 font-bold text-lg mb-2">远征军航行中</p>
          <p className="text-slate-300 text-sm">预计 {colony.scoutTurnsRemaining} 回合后抵达目标星系</p>
        </div>
      </div>
    );
  }

  // ===== 选择星球 =====
  if (colony.phase === 'selecting') {
    if (!scoutPool) { const pool = generateScoutingPool(); setScoutPool(pool); return null; }
    return (
      <div className="space-y-4">
        <h2 className="text-xl font-bold text-white">选择殖民星球</h2>
        <p className="text-sm text-slate-400">远征军为你找到了3颗候选星球。请为你的殖民地挑选一颗并命名。</p>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
          {scoutPool.map((pid) => {
            const p = getPlanetById(pid);
            if (!p) return null;
            const buffs = getBuffList(p);
            return (
              <div key={pid} className="bg-slate-900/60 border border-slate-700 rounded-xl overflow-hidden">
                <div className="h-28 bg-slate-800 overflow-hidden">
                  <img src={`/planets/${pid}.png`} alt={p.name} className="w-full h-full object-cover" />
                </div>
                <div className="p-4">
                <h4 className="font-bold text-slate-100 mb-2">{p.name}</h4>
                <p className="text-sm text-slate-400 mb-3">{p.description}</p>
                <div className="space-y-1 mb-4">
                  {buffs.map((bf, i) => (
                    <p key={i} className="text-sm">
                      <span className={bf.color + ' font-bold'}>{bf.name}</span>
                      <span className="text-slate-500 ml-1">{bf.desc}</span>
                    </p>
                  ))}
                </div>
                <button onClick={() => {
                  if (!planetName) { showMsg('请先输入星球名称', 'error'); return; }
                  const r = onSelectPlanet(pid, planetName); showMsg(r.message, r.success ? 'success' : 'error');
                }} className="w-full py-2 bg-cyan-700 hover:bg-cyan-600 rounded-lg text-sm font-bold text-white">殖民此星球</button>
                </div>
              </div>
            );
          })}
        </div>
        <div className="flex gap-2">
          <input value={planetName} onChange={(e) => setPlanetName(e.target.value.slice(0, 16))} placeholder="输入星球名称 (3-16字符)"
            className="flex-1 bg-slate-800 border border-slate-600 rounded-lg px-3 py-2 text-sm text-slate-200" />
          <button onClick={() => { const r = onRescrollPlanets(); showMsg(r.message, r.success ? 'success' : 'error'); setScoutPool(null); }}
            disabled={ship.gold < 30000}
            className="px-4 py-2 bg-slate-700 hover:bg-slate-600 disabled:opacity-50 rounded-lg text-sm text-slate-200">重新探索 (30,000G)</button>
        </div>
        {message && <div className={`p-3 rounded-lg text-sm text-center ${msgType === 'success' ? 'bg-green-900/20 border border-green-700/50 text-green-400' : 'bg-red-900/20 border border-red-700/50 text-red-400'}`}>{message}</div>}
      </div>
    );
  }

  // ===== 殖民运行中 =====
  const planet = colony.planetType ? getPlanetById(colony.planetType) : null;
  const planetBuffs = planet ? getBuffList(planet) : [];

  const tabs: { id: ColonyTab; label: string; icon: React.ElementType }[] = [
    { id: 'overview', label: '总览', icon: Home },
    { id: 'buildings', label: '建筑', icon: Wrench },
    { id: 'population', label: '人口', icon: Users },
    { id: 'research', label: '科研', icon: FlaskConical },
    { id: 'leaders', label: '领袖', icon: Crown },
    { id: 'wonders', label: '奇观', icon: Trophy },
  ];

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-4">
        {colony.planetType && <img src={`/planets/${colony.planetType}.png`} alt={planet?.name} className="w-16 h-16 rounded-xl object-cover border border-slate-700 flex-shrink-0" />}
        <div>
          <h2 className="text-xl font-bold text-white">星际殖民 · {colony.planetName}</h2>
          <p className="text-sm text-slate-400">星球类型：{planet?.name || '未知'} | 人口：{colony.population.total}/{colony.population.cap} | 空闲：{colony.population.available}</p>
        </div>
      </div>

      <div className="flex gap-1.5 mb-3">
        {tabs.map((t) => {
          const Icon = t.icon;
          return (<button key={t.id} onClick={() => setTab(t.id)}
            className={`px-3 py-1.5 rounded-lg text-sm font-bold transition-all flex items-center gap-1.5 ${tab === t.id ? 'bg-cyan-600 text-white' : 'bg-slate-800/60 text-slate-400 hover:bg-slate-700'}`}>
            <Icon size={14} />{t.label}</button>);
        })}
      </div>

      {message && <div className={`p-3 rounded-lg text-sm text-center ${msgType === 'success' ? 'bg-green-900/20 border border-green-700/50 text-green-400' : 'bg-red-900/20 border border-red-700/50 text-red-400'}`}>{message}</div>}

      {/* ===== 总览 ===== */}
      {tab === 'overview' && (
        <div className="space-y-3">
          {planet && (
            <div className="bg-slate-900/60 border border-slate-700 rounded-xl p-4">
              <h4 className="font-bold text-slate-200 mb-1">{planet.name}</h4>
              <p className="text-sm text-slate-400 mb-3">{planet.description}</p>
              <div className="space-y-1">
                {planetBuffs.map((bf, i) => (
                  <p key={i} className="text-sm">
                    <span className={bf.color + ' font-bold'}>{bf.name}</span>
                    <span className="text-slate-400 ml-2">{bf.desc}</span>
                  </p>
                ))}
              </div>
            </div>
          )}
          <div className="grid grid-cols-3 gap-3">
            <div className="bg-slate-900/60 border border-slate-700 rounded-xl p-3 text-center">
              <p className="text-sm text-slate-500">已建成</p>
              <p className="text-lg font-bold text-cyan-400">{liveBuildings.length}</p>
            </div>
            <div className="bg-slate-900/60 border border-slate-700 rounded-xl p-3 text-center">
              <p className="text-sm text-slate-500">建造中</p>
              <p className="text-lg font-bold text-yellow-400">{pendingBuildings.length}</p>
            </div>
            <div className="bg-slate-900/60 border border-slate-700 rounded-xl p-3 text-center">
              <p className="text-sm text-slate-500">人口上限</p>
              <p className="text-lg font-bold text-purple-400">{colony.population.cap}</p>
            </div>
          </div>
          {/* 电能状态 */}
          {(() => {
            const totalGen = liveBuildings.reduce((sum, b) => {
              const d = getBuildingDef(b.defId);
              if (d?.outputType === 'power' && b.assignedPop >= d.minPop) {
                let gen = (d.baseOutput || 0) + (d.popFactor || 0) * b.assignedPop;
                for (const l of colony.leaders || []) {
                  const ld = getLeaderDef(l.id);
                  if (ld?.id === 'L22' && ((d.id === 'B29' && l.level >= 1) || (d.id === 'B30' && l.level >= 2))) gen = Math.floor(gen * 1.30);
                }
                return sum + Math.floor(gen);
              }
              return sum;
            }, 0);
            // 星球太��能修正（仅B29）
            const planetGenMult = planet?.buffs.powerGenMult || 1;
            const displayGen = Math.floor(totalGen * (planetGenMult !== 1 ? planetGenMult : 1));
            let l21Bonus = 0;
            for (const l of colony.leaders || []) {
              const ld = getLeaderDef(l.id);
              if (ld?.id === 'L21') l21Bonus = [0.10, 0.15, 0.25][l.level - 1] || 0;
            }
            const rawUse = liveBuildings.reduce((sum, b) => {
              const d = getBuildingDef(b.defId);
              if (!d || d.outputType === 'power') return sum;
              return sum + (d.powerConsumption || 0);
            }, 0);
            const planetUseMult = planet?.buffs.powerUseMult || 1;
            const useAfterL21 = l21Bonus > 0 ? Math.ceil(rawUse * (1 - l21Bonus)) : rawUse;
            const totalUse = Math.ceil(useAfterL21 * planetUseMult);
            const netPwr = (colony.energy ?? 0);
            const hasL22Lv3 = colony.leaders?.some(l => l.id === 'L22' && l.level >= 3);
            return (
              <div className={`rounded-xl p-4 border ${netPwr < 0 ? 'bg-red-900/30 border-red-700/50' : 'bg-slate-900/60 border-slate-700'}`}>
                <div className="flex justify-between items-center">
                  <div>
                    <p className="text-sm font-bold text-slate-300">⚡ 电能</p>
                    <p className="text-xs text-slate-500">
                      发电 {displayGen}{planetGenMult !== 1 ? (planetGenMult > 1 ? ` (星球×${planetGenMult})` : ` (星球×${planetGenMult})`) : ''}
                      {' − '}消耗 {totalUse}{l21Bonus > 0 ? ` (L21 -${Math.round(l21Bonus*100)}%)` : ''}{planetUseMult !== 1 ? ` (星球×${planetUseMult})` : ''}
                    </p>
                  </div>
                  <div className="text-right">
                    <p className={`text-xl font-bold ${netPwr < 0 ? 'text-red-400' : 'text-green-400'}`}>{netPwr >= 0 ? '+' : ''}{netPwr}</p>
                    {netPwr < 0 && <p className="text-xs text-red-400 mt-1">{hasL22Lv3 ? '⚠ 停电中（余晖脉冲保护）' : '⚠ 停电：所有建筑停工'}</p>}
                  </div>
                </div>
              </div>
            );
          })()}
          {/* 产出汇总 */}
          {liveBuildings.length > 0 && (() => {
            const pod = planet?.buffs;
            const omMap: Record<string, number> = {};
            let omAll = 0, omMat = 0;
            for (const l of colony.leaders || []) {
              const ld = getLeaderDef(l.id);
              const bonuses = ld?.levelBonuses[l.level-1] || {};
              for (const [bid, b] of Object.entries(bonuses)) {
                if (bid === 'ALL') omAll += b;
                else if (bid === 'ALL_MATERIAL') omMat += b;
                else omMap[bid] = (omMap[bid] || 0) + b;
              }
            }
            // 循环科技加成
            const rl = colony.techState?.repeatableLevels || {};
            const bonusLines: { label: string; value: number; detail: string }[] = [];
            const matLines: { k: string; v: number; detail: string }[] = [];
            const MAT_CN: Record<string, string> = { oil:'石油', gold_ore:'金矿', carbon:'碳块', dark_matter:'暗物质', quantum:'量子簇', silicon:'硅片' };
            for (const inst of liveBuildings) {
              const d = getBuildingDef(inst.defId);
              if (!d) continue;
              if (inst.assignedPop < d.minPop) continue;
              // 有效人口（含领袖槽位扩展）
              let efm = d.maxPop;
              for (const l of colony.leaders || []) {
                const ex = getLeaderDef(l.id)?.levelExtras[l.level-1];
                if (ex?.popCapBonus?.[inst.defId]) efm = Math.max(efm, ex.popCapBonus[inst.defId]);
              }
              const ep = Math.min(inst.assignedPop, efm > 0 ? efm : inst.assignedPop);
              const base = (d.baseOutput||0)+(d.popFactor||0)*ep;
              const lb = ((omMap[inst.defId]||0)+(d.category==='material'?omMat:0)+omAll)/100;
              let rpb = 0;
              if (d.outputType === 'food') rpb = (rl.RP_FOOD || 0) * 0.05;
              else if (d.outputType === 'alloy') rpb = (rl.RP_ALLOY || 0) * 0.05;
              else if (d.outputType === 'stardust') rpb = (rl.RP_STARDUST || 0) * 0.05;
              else if (d.outputType === 'gold') rpb = (rl.RP_TRADE || 0) * 0.05;
              else if (d.outputType === 'material') rpb = (rl.RP_MATERIAL || 0) * 0.05;
              else if (d.outputType === 'research') rpb = (rl.RP_RESEARCH || 0) * 0.10;
              if (d.outputType === 'food') {
                const pm = pod?.foodMult ? (pod.foodMult-1) : 0;
                const v = Math.ceil(base*(1+pm+lb+rpb));
                const parts: string[] = [`${d.name}:${base}`];
                if (pod?.foodMult) parts.push(`星球${pod.foodMult>1?'+':''}${Math.round(pm*100)}%`);
                if (lb>0) parts.push(`领袖+${Math.round(lb*100)}%`);
                if (rpb>0) parts.push(`循环+${Math.round(rpb*100)}%`);
                bonusLines.push({ label: '食物', value: v, detail: parts.join(' ') });
              } else if (d.outputType === 'alloy') {
                const pm = pod?.alloyMult ? (pod.alloyMult-1) : 0;
                const v = Math.ceil(base*(1+pm+lb+rpb));
                const parts: string[] = [`${d.name}:${base}`];
                if (pod?.alloyMult) parts.push(`星球${pod.alloyMult>1?'+':''}${Math.round(pm*100)}%`);
                if (lb>0) parts.push(`领袖+${Math.round(lb*100)}%`);
                if (rpb>0) parts.push(`循环+${Math.round(rpb*100)}%`);
                bonusLines.push({ label: '合金', value: v, detail: parts.join(' ') });
              } else if (d.outputType === 'stardust') {
                const pm = pod?.stardustMult ? (pod.stardustMult-1) : 0;
                const v = Math.ceil(base*(1+pm+lb+rpb));
                const parts: string[] = [`${d.name}:${base}`];
                if (pod?.stardustMult) parts.push(`星球${pod.stardustMult>1?'+':''}${Math.round(pm*100)}%`);
                if (lb>0) parts.push(`领袖+${Math.round(lb*100)}%`);
                if (rpb>0) parts.push(`循环+${Math.round(rpb*100)}%`);
                bonusLines.push({ label: '星尘', value: v, detail: parts.join(' ') });
              } else if (d.outputType === 'gold') {
                const v = Math.ceil(Math.floor(((d.goldOutputMin||0)+(d.goldOutputMax||0))/2)*(1+lb+rpb));
                const parts: string[] = [`${d.name}`];
                if (lb>0) parts.push(`领袖+${Math.round(lb*100)}%`);
                if (rpb>0) parts.push(`循环+${Math.round(rpb*100)}%`);
                bonusLines.push({ label: '金币', value: v, detail: parts.join(' ') });
              } else if (d.outputType === 'research') {
                const v = Math.ceil(base*(1+lb+rpb));
                const parts: string[] = [`${d.name}:${base}`];
                if (lb>0) parts.push(`领袖+${Math.round(lb*100)}%`);
                if (rpb>0) parts.push(`循环+${Math.round(rpb*100)}%`);
                bonusLines.push({ label: '科研', value: v, detail: parts.join(' ') });
              } else if (d.outputType === 'material' && d.outputMaterialId) {
                const pm = pod?.materialMults?.[d.outputMaterialId] ? (pod.materialMults[d.outputMaterialId]-1) : 0;
                const v = Math.ceil(base*(1+pm+lb));
                const parts: string[] = [`${d.name}:${base}`];
                if (pm!==0) parts.push(`星球${pm>0?'+':''}${Math.round(pm*100)}%`);
                if (lb>0) parts.push(`领袖+${Math.round(lb*100)}%`);
                matLines.push({ k: d.outputMaterialId, v, detail: parts.join(' ') });
              }
            }
            // 聚合同类
            const agg: Record<string, {value:number;details:string[]}> = {};
            for (const bl of bonusLines) {
              if (!agg[bl.label]) agg[bl.label] = {value:0,details:[]};
              agg[bl.label].value += bl.value;
              agg[bl.label].details.push(bl.detail);
            }
            const aggMat: Record<string, {value:number;details:string[]}> = {};
            for (const ml of matLines) {
              const cn = MAT_CN[ml.k] || ml.k;
              if (!aggMat[cn]) aggMat[cn] = {value:0,details:[]};
              aggMat[cn].value += ml.v;
              aggMat[cn].details.push(ml.detail);
            }
            return (
            <div className="bg-slate-900/60 border border-slate-700 rounded-xl p-3">
              <h4 className="text-sm font-bold text-slate-400 mb-2">每回合产出</h4>
              <div className="space-y-1 text-sm">
                {Object.entries(agg).map(([k,v]) => (
                  <div key={k} className="flex flex-wrap items-baseline gap-x-1">
                    <span className="text-slate-500">{k}:</span>
                    <span className={k==='食物'?'text-green-400':k==='合金'?'text-slate-300':k==='星尘'?'text-purple-400':k==='金币'?'text-yellow-400':'text-cyan-400'}>+{v.value}</span>
                    <span className="text-slate-600">（{v.details.join(' | ')}）</span>
                  </div>
                ))}
                {Object.entries(aggMat).map(([k,v]) => (
                  <div key={k} className="flex flex-wrap items-baseline gap-x-1">
                    <span className="text-slate-500">{k}:</span>
                    <span className="text-amber-400">+{v.value}</span>
                    <span className="text-slate-600">（{v.details.join(' | ')}）</span>
                  </div>
                ))}
                {Object.keys(agg).length===0 && Object.keys(aggMat).length===0 && <span className="text-slate-500">暂无产出（建筑无人入驻）</span>}
              </div>
              <div className="text-sm text-red-400 mt-2">
                {(() => { let fp=3+(pod?.foodConsumptionDelta||0); for(const l of colony.leaders||[]){fp+=(getLeaderDef(l.id)?.levelExtras[l.level-1]?.foodConsumptionDelta||0);} return `食物消耗: -${colony.population.total * Math.max(1, fp)} (每人${Math.max(1,fp)})`; })()}
              </div>
            </div>
            );
          })()}
            {/* 星球 16:9 地貌图 */}
            {colony.planetType && (
              <div className="bg-slate-900/60 border border-slate-700 rounded-xl p-3">
                <img
                  src={`/planet-landscape/${colony.planetType}.png`}
                  alt={planet?.name || '星球地貌'}
                  onError={(e) => { (e.target as HTMLImageElement).parentElement!.style.display='none'; }}
                  className="w-full aspect-video object-cover rounded-lg border border-slate-700"
                />
              </div>
            )}
        </div>
      )}

      {/* ===== 建筑 ===== */}
      {tab === 'buildings' && (() => {
        // 领袖加成映射（加算用）
        const mlMap: Record<string, number> = {};
        let mlAll = 0, mlMat = 0;
        for (const l of colony.leaders || []) {
          const ld = getLeaderDef(l.id);
          const bonuses = ld?.levelBonuses[l.level-1] || {};
          for (const [bid, b] of Object.entries(bonuses)) {
            if (bid === 'ALL') mlAll += b;
            else if (bid === 'ALL_MATERIAL') mlMat += b;
            else mlMap[bid] = (mlMap[bid] || 0) + b;
          }
        }
        const rlv = colony.techState?.repeatableLevels || {};
        return (
        <div className="space-y-3">
          {/* 已建成（合并同类） */}
          <div>
            <h4 className="text-sm font-bold text-green-400 mb-2">已建成</h4>
            {liveBuildings.length === 0 && <p className="text-slate-500 text-sm">暂无已建成建筑</p>}
            {/* 类型筛选标签（可点击） */}
            {liveBuildings.length > 0 && (
              <div className="flex flex-wrap gap-1 mb-3">
                {['housing','food','alloy','stardust','trade','material','functional','power'].map((cat) => (
                  <button key={cat} onClick={() => setLiveBuildFilter(cat)}
                    className={`px-2.5 py-1 rounded-lg text-xs font-bold transition-colors ${liveBuildFilter === cat ? 'bg-green-600 text-white' : 'bg-slate-700/80 text-slate-400 hover:bg-slate-600'}`}>
                    {CAT_LABELS[cat] || cat}
                    <span className="ml-1 opacity-60">({liveBuildings.filter((b:any) => { const d=getBuildingDef(b.defId); return d?.category === cat; }).length})</span>
                  </button>
                ))}
              </div>
            )}
            {liveBuildings.filter((b:any) => { const d=getBuildingDef(b.defId); return d?.category === liveBuildFilter; }).length === 0 && liveBuildings.length > 0 && (
              <p className="text-slate-500 text-sm mb-2">暂无「{CAT_LABELS[liveBuildFilter] || liveBuildFilter}」类型建筑</p>
            )}
            {liveBuildings.filter((b:any) => { const d=getBuildingDef(b.defId); return d?.category === liveBuildFilter; }).map((inst: any) => {
              const def = getBuildingDef(inst.defId);
              if (!def) return (
                <div key={inst.uid} className="bg-slate-900/60 border border-purple-700/40 rounded-lg p-3 mb-2 flex justify-between items-center">
                  <span className="text-sm text-purple-300 font-bold">{inst.defId}</span>
                  <button onClick={() => { const r = onDemolishBuilding(inst.uid); showMsg(r.message, r.success ? 'success' : 'error'); }} className="px-2 py-1 bg-red-700 hover:bg-red-600 rounded text-xs font-bold">拆除</button>
                </div>
              );
              const maxLabel = def.maxPop > 0 ? `入驻 ${inst.assignedPop}/${def.maxPop}${def.minPop > 0 ? ` (最小${def.minPop}人)` : ''}` : `入驻 ${inst.assignedPop}`;
              const catTag = <span className={`text-xs ${CAT_COLORS[def.category] || 'bg-slate-600 text-white'} px-1.5 py-0.5 rounded mr-1`}>{CAT_LABELS[def.category] || def.category}</span>;
              // 计算该建筑实际产出（用有效人口）
              let liveOut = '';
              if (inst.assignedPop >= def.minPop && def.outputType) {
                let efm = def.maxPop;
                for (const l of colony.leaders || []) {
                  const ex = getLeaderDef(l.id)?.levelExtras[l.level-1];
                  if (ex?.popCapBonus?.[inst.defId]) efm = Math.max(efm, ex.popCapBonus[inst.defId]);
                }
                const ep = Math.min(inst.assignedPop, efm > 0 ? efm : inst.assignedPop);
                const b = (def.baseOutput||0)+(def.popFactor||0)*ep;
                const lb = ((mlMap[inst.defId]||0)+(def.category==='material'?mlMat:0)+mlAll)/100;
                let rpb = 0;
                if (def.outputType === 'food') rpb = (rlv.RP_FOOD || 0) * 0.05;
                else if (def.outputType === 'alloy') rpb = (rlv.RP_ALLOY || 0) * 0.05;
                else if (def.outputType === 'stardust') rpb = (rlv.RP_STARDUST || 0) * 0.05;
                else if (def.outputType === 'gold') rpb = (rlv.RP_TRADE || 0) * 0.05;
                else if (def.outputType === 'material') rpb = (rlv.RP_MATERIAL || 0) * 0.05;
                else if (def.outputType === 'research') rpb = (rlv.RP_RESEARCH || 0) * 0.10;
                let v=0, un='', detail='';
                if (def.outputType === 'food') { const pm = planet?.buffs.foodMult ? (planet.buffs.foodMult-1) : 0; v=Math.ceil(b*(1+pm+lb+rpb)); un='食物'; detail=`${b}${pm!==0?'星球'+(pm>0?'+':'')+Math.round(pm*100)+'%':''}${lb>0?'领袖+'+Math.round(lb*100)+'%':''}${rpb>0?'循环+'+Math.round(rpb*100)+'%':''}`; }
                else if (def.outputType === 'alloy') { const pm = planet?.buffs.alloyMult ? (planet.buffs.alloyMult-1) : 0; v=Math.ceil(b*(1+pm+lb+rpb)); un='合金'; detail=`${b}${pm!==0?'星球'+(pm>0?'+':'')+Math.round(pm*100)+'%':''}${lb>0?'领袖+'+Math.round(lb*100)+'%':''}${rpb>0?'循环+'+Math.round(rpb*100)+'%':''}`; }
                else if (def.outputType === 'stardust') { const pm = planet?.buffs.stardustMult ? (planet.buffs.stardustMult-1) : 0; v=Math.ceil(b*(1+pm+lb+rpb)); un='星尘'; detail=`${b}${pm!==0?'星球'+(pm>0?'+':'')+Math.round(pm*100)+'%':''}${lb>0?'领袖+'+Math.round(lb*100)+'%':''}${rpb>0?'循环+'+Math.round(rpb*100)+'%':''}`; }
                else if (def.outputType === 'gold') { v=Math.ceil(Math.floor(((def.goldOutputMin||0)+(def.goldOutputMax||0))/2)*(1+lb+rpb)); un='金币'; detail=`${lb>0?'领袖+'+Math.round(lb*100)+'%':''}${rpb>0?'循环+'+Math.round(rpb*100)+'%':''}`; }
                else if (def.outputType === 'research') { v=Math.ceil(b*(1+lb+rpb)); un='科研'; detail=`${b}${lb>0?'领袖+'+Math.round(lb*100)+'%':''}${rpb>0?'循环+'+Math.round(rpb*100)+'%':''}`; }
                else if (def.outputType === 'material' && def.outputMaterialId) {
                  const mc: Record<string,string> = { oil:'石油', gold_ore:'金矿', carbon:'碳块', dark_matter:'暗物质', quantum:'量子簇', silicon:'硅片' };
                  const pm = planet?.buffs.materialMults?.[def.outputMaterialId] ? (planet.buffs.materialMults[def.outputMaterialId]-1) : 0;
                  v=Math.ceil(b*(1+pm+lb)); un=mc[def.outputMaterialId]||def.outputMaterialId;
                  detail=`${b}${pm!==0?'星球'+(pm>0?'+':'')+Math.round(pm*100)+'%':''}${lb>0?'领袖+'+Math.round(lb*100)+'%':''}`;
                }
                if (v>0) liveOut = `产出: ${v} ${un}/回合 (${detail})`;
              }
              return (
                <div key={inst.uid} className="bg-slate-900/60 border border-green-700/40 rounded-lg p-3 mb-2 flex justify-between items-center">
                  <div>
                    {catTag}
                    <span className="text-sm text-green-300 font-bold">{def.name}</span>
                    <span className="text-sm text-slate-500 ml-2">{maxLabel}</span>
                    {liveOut && <span className="text-sm text-cyan-400 ml-2">{liveOut}</span>}
                    {!liveOut && def.minPop > 0 && inst.assignedPop > 0 && inst.assignedPop < def.minPop && (
                      <span className="text-sm text-red-400 ml-2">⚠ 人口不足（需≥{def.minPop}人）</span>
                    )}
                    {!liveOut && !(def.minPop > 0 && inst.assignedPop > 0 && inst.assignedPop < def.minPop) && <span className="text-sm text-slate-600 ml-2">{getOutputDesc(def)}</span>}
                    {def.powerConsumption !== undefined && def.powerConsumption > 0 && (
                      <span className="text-sm text-amber-500 ml-2">⚡ {def.powerConsumption}</span>
                    )}
                  </div>
                  <button onClick={() => { const r = onDemolishBuilding(inst.uid); showMsg(r.message, r.success ? 'success' : 'error'); }} className="px-2 py-1 bg-red-700 hover:bg-red-600 rounded text-xs font-bold flex-shrink-0 ml-3">拆除</button>
                </div>
              );
            })}
          </div>

          {/* 建造中 */}
          {pendingBuildings.length > 0 && (
            <div>
              <h4 className="text-sm font-bold text-yellow-400 mb-2">建造中</h4>
              {pendingBuildings.map((inst) => {
                const def = getBuildingDef(inst.defId);
                if (!def) return null;
                return (
                  <div key={inst.uid} className="bg-slate-900/60 border border-yellow-700/40 rounded-lg p-3 mb-2 flex justify-between items-center">
                    <div><span className="text-sm text-yellow-300 font-bold">{def.name}</span></div>
                    <div className="flex items-center gap-2">
                      <span className="text-sm text-yellow-400">{inst.buildProgress}/{Math.max(1, def.buildTurns + (planet?.buffs.buildTurnDelta || 0))} 回合</span>
                      <button onClick={() => onCancelBuilding(inst.uid)} className="px-2 py-1 bg-red-700 hover:bg-red-600 rounded text-xs font-bold">取消</button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}

          {/* 可建造列表 */}
          <div>
            <h4 className="text-sm font-bold text-cyan-400 mb-2">建造新建筑</h4>
            <div className="flex flex-wrap gap-1 mb-3">
              {['housing','food','alloy','stardust','trade','material','functional','power'].map((cat) => (
                <button key={cat} onClick={() => setBuildCatFilter(cat)}
                  className={`px-2.5 py-1 rounded-lg text-sm font-bold transition-colors ${buildCatFilter === cat ? 'bg-cyan-600 text-white' : 'bg-slate-700/80 text-slate-400 hover:bg-slate-600'}`}>
                  {cat === 'all' ? '全部' : (CAT_LABELS[cat] || cat)}
                </button>
              ))}
            </div>
            {getBuildableBuildings(colony.techState?.researched || []).filter((d) => d.category === buildCatFilter).map((def) => {
              const count = colony.buildings.filter((b) => b.defId === def.id).length;
              const limited = !!(def.maxCount && count >= def.maxCount);
              return (
                <div key={def.id} className={`bg-slate-900/60 border rounded-lg p-3 mb-2 ${limited ? 'opacity-50 border-slate-800' : 'border-slate-700'}`}>
                  <div className="flex justify-between items-start mb-2">
                    <div>
                      <span className={`text-sm ${CAT_COLORS[def.category] || 'text-slate-500'} px-1.5 py-0.5 rounded mr-1`}>{CAT_LABELS[def.category] || def.category}</span>
                      <span className="text-sm text-slate-200 font-bold">{def.name}</span>
                      <span className="text-sm text-cyan-400 ml-2">{getOutputDesc(def)}</span>
                    </div>
                    <button onClick={() => { const r = onBuild(def.id); showMsg(r.message, r.success ? 'success' : 'error'); }}
                      disabled={limited}
                      className="px-3 py-1.5 bg-cyan-700 hover:bg-cyan-600 disabled:bg-slate-700 disabled:text-slate-500 rounded text-sm font-bold text-white">
                      {limited ? '已达上限' : '建造'}
                    </button>
                  </div>
                  <p className="text-sm text-slate-500 mb-1">{def.description}</p>
                  <div className="flex flex-wrap gap-x-3 gap-y-0.5 text-sm">
                    {(() => {
                      const costMult = planet?.buffs.buildCostMult || 1;
                      const actualGoldCost = Math.ceil(def.costGold * costMult);
                      return (
                    <span className={ship.gold >= actualGoldCost ? 'text-yellow-400' : 'text-red-400'}>
                      金币 {actualGoldCost.toLocaleString()}{costMult !== 1 ? <span className="text-slate-600"> (基础{def.costGold.toLocaleString()} ×{costMult})</span> : ''}{!ship.gold || ship.gold < actualGoldCost ? ' (不足)' : ''}
                    </span>
                      );
                    })()}
                    {def.costAlloy && (() => {
                      const aCost = Math.ceil((def.costAlloy || 0) * (planet?.buffs.buildCostMult || 1));
                      return <span className={ship.alloy >= aCost ? 'text-slate-300' : 'text-red-400'}>
                        合金 {ship.alloy}/{aCost}{ship.alloy < aCost ? ' (不足)' : ''}
                      </span>;
                    })()}
                    {/* 原料成本 */}
                    {def.costMaterials && Object.entries(def.costMaterials).map(([matId, amt]) => {
                      const costMult = planet?.buffs.buildCostMult || 1;
                      const actualAmt = Math.ceil(amt * costMult);
                      const have = ship.materials[matId] || 0;
                      const enough = have >= actualAmt;
                      return (
                        <span key={matId} className={enough ? 'text-slate-400' : 'text-red-400'}>
                          {matLabel(matId)} {have}/{actualAmt}{costMult !== 1 ? <span className="text-slate-600"> ({amt}×{costMult})</span> : ''}{!enough ? ' (不足)' : ''}
                        </span>
                      );
                    })}
                    {(() => {
                      const td = planet?.buffs.buildTurnDelta || 0;
                      const actualTurns = Math.max(1, def.buildTurns + td);
                      return <span className="text-slate-600">| {actualTurns}回合{td !== 0 ? <span className="text-slate-600"> ({def.buildTurns}+{td})</span> : ''}</span>;
                    })()}
                    {def.maxCount && <span className="text-slate-600">| 上限{def.maxCount} (已建{count})</span>}
                    {!def.maxCount && <span className="text-slate-600">| 已建{count}座</span>}
                    {def.minPop > 0 && <span className="text-slate-600">| 需要{def.minPop}-{def.maxPop}人入驻</span>}
                    {def.powerConsumption !== undefined && def.powerConsumption > 0 && (
                      <span className="text-amber-500">| ⚡ {def.powerConsumption}</span>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      );})()}

      {/* ===== 人口 ===== */}
      {tab === 'population' && (
        <div className="space-y-4">
          <div className="bg-slate-900/60 border border-slate-700 rounded-xl p-4">
            <h4 className="font-bold text-slate-200 mb-3 flex items-center gap-2"><UserPlus size={16} className="text-green-400" />招募人口</h4>
            <p className="text-sm text-slate-400 mb-2">每人口花费 {(planet?.buffs.recruitCostDelta ? 2000 + planet.buffs.recruitCostDelta : 2000).toLocaleString()} 金币，每回合最多 {(()=>{let rm=5;for(const l of colony.leaders||[]){const ld=getLeaderDef(l.id);rm+=ld?.levelExtras[l.level-1]?.recruitCapPerTurn||0;}return rm;})()} 人，当前上限 {colony.population.cap}</p>
            <div className="flex gap-2">
              <input type="number" min={1} max={(()=>{let rm=5;for(const l of colony.leaders||[]){const ld=getLeaderDef(l.id);rm+=ld?.levelExtras[l.level-1]?.recruitCapPerTurn||0;}return rm;})()} value={recruitQty}
                onChange={(e) => setRecruitQty(Math.min((()=>{let rm=5;for(const l of colony.leaders||[]){const ld=getLeaderDef(l.id);rm+=ld?.levelExtras[l.level-1]?.recruitCapPerTurn||0;}return rm;})(), Math.max(1, parseInt(e.target.value) || 1)))}
                className="w-16 bg-slate-800 border border-slate-600 rounded px-2 py-1.5 text-sm text-slate-200 text-center" />
              <button onClick={() => { const r = onRecruitPop(recruitQty); showMsg(r.message, r.success ? 'success' : 'error'); }}
                disabled={ship.gold < 2000 * recruitQty || colony.population.total >= colony.population.cap}
                className="px-4 py-1.5 bg-green-700 hover:bg-green-600 disabled:bg-slate-700 disabled:text-slate-500 rounded text-sm font-bold text-white">
                招募 ({(2000 * recruitQty).toLocaleString()}G)
              </button>
            </div>
          </div>

          {/* 人口分配（单独显示每个建筑实例） */}
          <div className="bg-slate-900/60 border border-slate-700 rounded-xl p-4">
            <h4 className="font-bold text-slate-200 mb-3">分配人口到建筑</h4>
            <p className="text-sm text-slate-400 mb-2">空闲人口: <span className="text-cyan-400 font-bold">{colony.population.available}</span></p>
            {/* 分类过滤 */}
            <div className="flex flex-wrap gap-1 mb-3">
              {['all','housing','food','alloy','stardust','trade','material','functional','power'].map((cat) => (
                <button key={cat} onClick={() => setPopCatFilter(cat)}
                  className={`px-2.5 py-1 rounded-lg text-sm font-bold transition-colors ${popCatFilter === cat ? 'bg-cyan-600 text-white' : 'bg-slate-700/80 text-slate-400 hover:bg-slate-600'}`}>
                  {cat === 'all' ? '全部' : (CAT_LABELS[cat] || cat)}
                </button>
              ))}
            </div>
            {liveBuildings.filter((inst) => {
              const d = getBuildingDef(inst.defId);
              if (!d || d.maxPop <= 0) return false;
              if (popCatFilter !== 'all' && d.category !== popCatFilter) return false;
              return true;
            }).map((inst) => {
              const def = getBuildingDef(inst.defId);
              if (!def) return null;
              // 领袖扩展的最大人口
              let effMax = def.maxPop;
              for (const l of (colony?.leaders || [])) {
                const ld = getLeaderDef(l.id);
                const ex = ld?.levelExtras[l.level - 1];
                if (ex?.popCapBonus?.[def.id]) effMax = Math.max(effMax, ex.popCapBonus[def.id]);
              }
              const extended = effMax > def.maxPop;
              const num = buildingNumbers[inst.uid] || '01';
              return (
                <div key={inst.uid} className="flex items-center justify-between bg-slate-800/60 rounded-lg p-3 mb-2">
                  <div>
                    <span className={`text-sm ${CAT_COLORS[def.category] || 'text-slate-500'} px-1 py-0.5 rounded mr-1`}>{CAT_LABELS[def.category]}</span>
                    <span className="text-sm text-slate-200">{def.name}{num}</span>
                    <span className="text-sm text-slate-500 ml-2">({def.minPop > 0 ? `${def.minPop}-` : '0-'}{effMax}人{extended ? <span className="text-amber-400"> 领袖+{(effMax-def.maxPop)}</span> : ''})</span>
                  </div>
                  <div className="flex items-center gap-1">
                    <input type="text" inputMode="numeric" pattern="[0-9]*" min={0} max={effMax} value={inst.assignedPop}
                      onChange={(e) => {
                        const raw = e.target.value.replace(/[^0-9]/g, '');
                        let v = raw === '' ? 0 : Math.max(0, Math.min(effMax, parseInt(raw)));
                        if (v > 0 && v < def.minPop) v = def.minPop;
                        onAssignPop(inst.uid, v);
                      }}
                      className="w-14 bg-slate-800 border border-slate-600 rounded px-2 py-1 text-sm text-cyan-400 text-center font-bold"
                    />
                    <span className="text-sm text-slate-600">/ {effMax}</span>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* ===== 科研 ===== */}
      {tab === 'research' && colony.techState && (
        <div className="space-y-4">
          <div className="bg-slate-900/60 border border-slate-700 rounded-xl p-4">
            <h4 className="font-bold text-slate-200 mb-2">科研点数: {colony.techState.researchPoints}</h4>
            {colony.techState.currentResearch ? (() => {
              const tid = colony.techState.currentResearch;
              const ct = getTechById(tid) || REPEATABLE_TECHS.find(rt => rt.id === tid);
              const isRp = ct && 'costIncrement' in ct;
              return (
                <div className={`rounded-lg p-3 ${isRp ? 'bg-pink-900/20 border border-pink-700/40' : 'bg-yellow-900/20 border border-yellow-700/40'}`}>
                  <p className={`text-sm font-bold ${isRp ? 'text-pink-400' : 'text-yellow-400'}`}>
                    {isRp ? '🔄 ' : ''}研究中: {ct?.name}
                  </p>
                  <p className="text-sm text-slate-400">{isRp ? (ct as any).description : (ct as any)?.description}</p>
                  <p className={`text-sm mt-1 ${isRp ? 'text-pink-400' : 'text-yellow-400'}`}>进度: {colony.techState.currentProgress}/{isRp ? (ct as any).researchTurns : (ct as any)?.researchTurns} 回合</p>
                  {!isRp && (ct as any)?.unlocksBuilding && (() => {
                    const bd = getBuildingDef((ct as any).unlocksBuilding);
                    return bd ? <p className="text-sm text-cyan-400 mt-1">🏗 完成后解锁: {bd.name} — {getBuildingEffect(bd)}</p> : null;
                  })()}
                  {!isRp && (ct as any)?.leaderCapBonus && <p className="text-sm text-amber-400 mt-1">👥 领袖上限 +{(ct as any).leaderCapBonus}</p>}
                </div>
              );            })() : <p className="text-sm text-slate-500">{getAvailableTechs(colony.techState.researched).length === 0 ? '全部科技已研究完毕，可选循环科技。' : '尚未选择研究项目'}</p>}
          </div>
          {!colony.techState.currentResearch && (
            <div>
              <h4 className="text-sm font-bold text-purple-400 mb-2">可选科技</h4>
              <div className="space-y-2">
              {researchOptions.length === 0 && !colony.techState.currentResearch && (
                <p className="text-sm text-slate-500 text-center py-4">所有科技已研究完毕，没有可用科技。</p>
              )}
              {researchOptions.map((tech: any) => (
                <div key={tech.id} className={`bg-slate-900/60 border rounded-lg p-4 flex gap-4 ${colony.techState!.researchPoints >= tech.cost ? (tech.isRepeatable ? 'border-pink-700/40' : 'border-purple-700/40') : 'border-slate-800 opacity-50'}`}>
                  <img
                    src={`/techs/${tech.id}.png`}
                    alt={tech.name}
                    onError={(e) => { (e.target as HTMLImageElement).style.display='none'; }}
                    className="w-[200px] h-[200px] rounded-lg object-cover border border-slate-700 flex-shrink-0"
                  />
                  <div className="flex-1 min-w-0 flex flex-col justify-between">
                    <div>
                      <div className="flex items-center gap-2 mb-2">
                        <span className={`text-base font-bold ${tech.isRepeatable ? 'text-pink-300' : 'text-purple-300'}`}>{tech.name}</span>
                        {tech.isRepeatable && <span className="text-xs px-1.5 py-0.5 rounded bg-pink-900/30 text-pink-400 border border-pink-700/30">循环</span>}
                        <span className="text-sm text-slate-500">{tech.turns}回合 · {tech.cost}点</span>
                      </div>
                      <p className="text-sm text-slate-400 mb-2 leading-relaxed">{tech.desc}</p>
                      {tech.unlocksBuilding && (() => {
                        const bd = getBuildingDef(tech.unlocksBuilding);
                        return bd ? <p className="text-sm text-cyan-400">🏗 解锁: {bd.name} — {getBuildingEffect(bd)}</p> : null;
                      })()}
                      {tech.leaderCapBonus && <p className="text-sm text-amber-400 mt-1">👥 领袖上限 +{tech.leaderCapBonus}</p>}
                    </div>
                    <div className="flex justify-end mt-2">
                      <button onClick={() => { const r = onStartResearch(tech.id); showMsg(r.message, r.success ? 'success' : 'error'); }}
                        disabled={colony.techState!.researchPoints < tech.cost}
                        className={`px-4 py-2 rounded text-sm font-bold text-white transition-colors ${
                          tech.isRepeatable
                            ? 'bg-pink-700 hover:bg-pink-600 disabled:bg-slate-700'
                            : 'bg-purple-700 hover:bg-purple-600 disabled:bg-slate-700'
                        }`}>研究</button>
                    </div>
                  </div>
                </div>
              ))}
              </div>
            </div>
          )}
          {colony.techState.researched.length > 0 && (
            <div>
              <h4 className="text-sm font-bold text-green-400 mb-2">已完成 ({colony.techState.researched.length})</h4>
              <div className="flex flex-wrap gap-1.5">
                {colony.techState.researched.map((tid) => {
                  const t = getTechById(tid);
                  const bd = t?.unlocksBuilding ? getBuildingDef(t.unlocksBuilding) : null;
                  const info = bd ? `${bd.name} — ${getBuildingEffect(bd)}` : t?.leaderCapBonus ? `领袖上限+${t.leaderCapBonus}` : '';
                  return <div key={tid} className="text-sm bg-green-900/20 text-green-400 border border-green-700/30 px-2 py-1 rounded" title={info || undefined}>
                    <span className="font-bold">{t?.name || tid}</span>
                    {bd && <span className="text-green-600 ml-1">- {bd.name}</span>}
                    {t?.leaderCapBonus && !bd && <span className="text-green-600 ml-1">- 领袖上限+{t.leaderCapBonus}</span>}
                  </div>;
                })}
              </div>
            </div>
          )}
        </div>
      )}

      {/* ===== 领袖 ===== */}
      {tab === 'leaders' && (
        <div className="space-y-4">
          {!colony.buildings.some((b) => b.active && b.defId === 'B27') ? (
            <div className="bg-slate-900/60 border border-slate-700 rounded-xl p-4 text-center">
              <Crown size={32} className="mx-auto mb-2 text-slate-600" />
              <p className="text-sm text-slate-400">需先建造星河议政厅(B27)解锁领袖功能</p>
            </div>
          ) : (
            <>
              {/* 招募 */}
              <div className="bg-slate-900/60 border border-slate-700 rounded-xl p-4">
                <h4 className="font-bold text-slate-200 mb-2">招募领袖 (10星尘/次)</h4>
                <p className="text-sm text-slate-400 mb-3">当前: {colony.leaders.length}/{colony.leaderCap}</p>
                {!colony.recruitPool ? (
                  <button onClick={() => { console.log('开始招募 clicked'); onRollAndRecruit(); }}
                    disabled={ship.stardust < 10 || colony.leaders.length >= colony.leaderCap}
                    className="px-4 py-2 bg-purple-700 hover:bg-purple-600 disabled:bg-slate-700 rounded-lg text-sm font-bold text-white">
                    {colony.leaders.length >= colony.leaderCap ? '已满' : '开始招募'}
                  </button>
                ) : (
                  <div className="space-y-2">
                    {colony.recruitPool.map((ld, i) => {
                      const rc = ld.rarity==='SSR'?'text-amber-400':ld.rarity==='SR'?'text-purple-400':'text-blue-400';
                      const lv1 = ld.levelBonuses[0] || {};
                      const ex1 = ld.levelExtras[0] || {};
                      let skillDesc = '';
                      if (Object.keys(lv1).length>0) {
                        const bids = Object.keys(lv1);
                        if (bids.includes('ALL')) skillDesc = '所有建筑产出+'+lv1.ALL+'%';
                        else if (bids.includes('ALL_MATERIAL')) skillDesc = '所有原料产出+'+lv1.ALL_MATERIAL+'%';
                        else skillDesc = bids.slice(0,3).map(b=>{const bd=getBuildingDef(b);return (bd?.name||b)+'+'+lv1[b]+'%'}).join(', ')+(bids.length>3?'等':'');
                      }
                      if (ex1.researchPerTurn) skillDesc += ' | 研究+'+ex1.researchPerTurn[0]+'-'+ex1.researchPerTurn[1]+'/回合';
                      if (ex1.foodConsumptionDelta) skillDesc += ' | 食物消耗'+ex1.foodConsumptionDelta;
                      if (ex1.freePopEveryTurns) skillDesc += ' | 每'+ex1.freePopEveryTurns+'回合免费1人口';
                      if (ex1.populationCapBonus) skillDesc += ' | 人口上限+'+ex1.populationCapBonus;
                      if (ex1.leaderCapBonus) skillDesc += ' | 领袖上限+'+ex1.leaderCapBonus;
                      if (ex1.popCapBonus) { for (const [bid, n] of Object.entries(ex1.popCapBonus)) { const bd = getBuildingDef(bid); skillDesc += ` | ${bd?.name||bid}上限+${n}`; } }
                      if (ex1.recruitCostBonus) skillDesc += ` | 招募费用${ex1.recruitCostBonus}`;
                      if (ex1.recruitCapPerTurn) skillDesc += ` | 招募上限+${ex1.recruitCapPerTurn}/回合`;
                      if (ex1.randomMatsPerTurn) skillDesc += ` | 随机原料+${ex1.randomMatsPerTurn}/回合`;
                      if (ex1.leaderCostReduction) skillDesc += ` | 领袖招募费-${ex1.leaderCostReduction}`;
                      if (ex1.b26Mult) skillDesc += ` | 量子实验室×${ex1.b26Mult}`;
                      if (ex1.buildCostReduction) skillDesc += ` | 造价-${ex1.buildCostReduction}%`;
                      if (ex1.stardustPerTurn) skillDesc += ` | 星尘+${ex1.stardustPerTurn}/回合`;
                      if (ex1.darkMatterPerTurn) skillDesc += ` | 暗物质+${ex1.darkMatterPerTurn}/回合`;
                      if (ex1.quantumPerTurn) skillDesc += ` | 量子簇+${ex1.quantumPerTurn}/回合`;
                      {/* L16 穹顶之父（硬编码追加） */}
                      {ld.id === 'L16' && (skillDesc += ' | 穹顶都市/居住舱人口效果+50%')}
                      {/* L21 索林·瓦特 */}
                      {ld.id === 'L21' && (skillDesc += ' | Lv1所有建筑电能消耗-10% | Lv2 -15% | Lv3 -25%')}
                      {/* L22 诺娃·永昼 */}
                      {ld.id === 'L22' && (skillDesc += ' | Lv1太阳能阵列+30% | Lv2聚变电站+30% | Lv3停电保护5回合')}
                      return (
                        <div key={i} className="bg-slate-800/60 border border-slate-700 rounded-lg p-3 flex justify-between items-center gap-3">
                          <img
                            src={`/leaders/${ld.id}.jpg`}
                            alt={ld.name}
                            onError={(e) => { (e.target as HTMLImageElement).style.display='none'; }}
                            className={`w-16 h-16 rounded-lg object-cover flex-shrink-0 border-2 ${ld.rarity==='SSR'?'border-amber-400 shadow-[0_0_10px_rgba(251,191,36,0.6)]':ld.rarity==='SR'?'border-purple-400':'border-blue-400'}`}
                          />
                          <div className="flex-1 mr-2 min-w-0">
                            <span className={`text-sm font-bold ${rc}`}>{ld.rarity}级</span>
                            <span className="text-sm text-slate-200 font-bold ml-2">{ld.name}</span>
                            <span className="text-sm text-amber-400 ml-2">· {ld.abilityName}</span>
                            {skillDesc && <span className="text-sm text-slate-500 ml-2">- {skillDesc}</span>}
                            <p className="text-sm text-slate-400 mt-1">{ld.description}</p>
                          </div>
                          <button onClick={() => { onRecruitLeader(ld.id); showMsg('招募成功！', 'success'); }}
                            className="px-3 py-1.5 bg-purple-700 hover:bg-purple-600 rounded text-sm font-bold flex-shrink-0">招募</button>
                        </div>
                      );
                    })}
                    <button onClick={() => { onRollAndRecruit(); }}
                      disabled={ship.stardust < 10 || colony.leaders.length >= colony.leaderCap}
                      className="text-sm text-purple-400 hover:text-purple-300 disabled:text-slate-600">换一批 (10星尘)</button>
                  </div>
                )}
              </div>
              {/* 已有领袖 */}
              {colony.leaders.length > 0 && (
                <div className="bg-slate-900/60 border border-slate-700 rounded-xl p-4">
                  <h4 className="font-bold text-slate-200 mb-2">我的领袖</h4>
                  {colony.leaders.map((l, i) => {
                    const ld = getLeaderDef(l.id);
                    if (!ld) return null;
                    const currBonuses = ld.levelBonuses[l.level-1] || {};
                    const currExtras = ld.levelExtras[l.level-1] || {};
                    let skillText = '';
                    if (Object.keys(currBonuses).length>0) {
                      const bids = Object.keys(currBonuses);
                      if (bids.includes('ALL')) skillText = `所有建筑产出+${currBonuses.ALL}%`;
                      else if (bids.includes('ALL_MATERIAL')) skillText = `所有原料产出+${currBonuses.ALL_MATERIAL}%`;
                      else skillText = bids.map(b=>{const bd=getBuildingDef(b);return (bd?.name||b)+'+'+currBonuses[b]+'%'}).join(', ');
                    }
                    const parts: string[] = [];
                    if (currExtras.researchPerTurn) parts.push(`研究+${currExtras.researchPerTurn[0]}-${currExtras.researchPerTurn[1]}/回合`);
                    if (currExtras.foodConsumptionDelta) parts.push(`食物消耗${currExtras.foodConsumptionDelta}`);
                    if (currExtras.populationCapBonus) parts.push(`人口上限+${currExtras.populationCapBonus}`);
                    if (currExtras.freePopEveryTurns) parts.push(`每${currExtras.freePopEveryTurns}回合免费1人口`);
                    if (currExtras.stardustPerTurn) parts.push(`星尘+${currExtras.stardustPerTurn}/回合`);
                    if (currExtras.darkMatterPerTurn) parts.push(`暗物质+${currExtras.darkMatterPerTurn}/回合`);
                    if (currExtras.quantumPerTurn) parts.push(`量子簇+${currExtras.quantumPerTurn}/回合`);
                    if (currExtras.leaderCapBonus) parts.push(`领袖上限+${currExtras.leaderCapBonus}`);
                    if (currExtras.buildCostReduction) parts.push(`造价-${currExtras.buildCostReduction}%`);
                    if (currExtras.popCapBonus) { for (const [bid, n] of Object.entries(currExtras.popCapBonus)) { const bd = getBuildingDef(bid); parts.push(`${bd?.name||bid}上限+${n}`); } }
                    if (currExtras.recruitCostBonus) parts.push(`招募费用${currExtras.recruitCostBonus}`);
                    if (currExtras.recruitCapPerTurn) parts.push(`招募上限+${currExtras.recruitCapPerTurn}/回合`);
                    if (currExtras.randomMatsPerTurn) parts.push(`随机原料+${currExtras.randomMatsPerTurn}/回合`);
                    if (currExtras.leaderCostReduction) parts.push(`领袖招募费-${currExtras.leaderCostReduction}`);
                    if (currExtras.b26Mult) parts.push(`量子实验室×${currExtras.b26Mult}`);
                    {/* L16 穹顶之父（硬编码追加） */}
                    {ld.id === 'L16' && (() => {
                      const popPct = [50, 100, 150][l.level-1] || 0;
                      parts.push(`穹顶都市/居住舱人口效果+${popPct}%`);
                      if (l.level >= 2) parts.push(`B2造价-${l.level===2?30:50}%`);
                    })()}
                    {/* L21 索林·瓦特 */}
                    {ld.id === 'L21' && parts.push(`所有建筑电能消耗 -${[10,15,25][l.level-1]}%`)}
                    {/* L22 诺娃·永昼 */}
                    {ld.id === 'L22' && (() => {
                      if (l.level >= 1) parts.push('太阳能阵列产出+30%');
                      if (l.level >= 2) parts.push('聚变电站产出+30%');
                      if (l.level >= 3) parts.push('停电后保持5回合正常产出');
                    })()}
                    return (
                    <div key={i} className="bg-slate-800/60 border border-slate-700 rounded-lg p-3 mb-2 flex gap-3 items-start">
                      <img
                        src={`/leaders/${ld.id}.jpg`}
                        alt={ld.name}
                        onError={(e) => { (e.target as HTMLImageElement).style.display='none'; }}
                        className={`w-16 h-16 rounded-lg object-cover flex-shrink-0 border-2 ${l.rarity==='SSR'?'border-amber-400 shadow-[0_0_10px_rgba(251,191,36,0.6)]':l.rarity==='SR'?'border-purple-400':'border-blue-400'}`}
                      />
                      <div className="flex-1 min-w-0">
                      <div className="flex justify-between items-start mb-1">
                        <div className="flex-1">
                          <span className={`text-sm font-bold ${l.rarity==='SSR'?'text-amber-400':l.rarity==='SR'?'text-purple-400':'text-blue-400'}`}>{l.rarity} Lv{l.level}</span>
                          <span className="text-sm text-slate-200 font-bold ml-2">{l.name}</span>
                          <span className="text-sm text-amber-400 ml-2">· {l.abilityName}</span>
                          <span className="text-sm text-slate-600 ml-2">- {skillText}{parts.length>0?' | '+parts.join(' | '):''}</span>
                        </div>
                        {l.level < 3 && (
                          <button onClick={() => {
                            const cost = l.level===1?20:45;
                            if (ship.stardust<cost) { showMsg('星尘不足', 'error'); return; }
                            const r=onUpgradeLeader(i); showMsg(r.message,r.success?'success':'error');
                          }} disabled={ship.stardust<(l.level===1?20:45)}
                            className="px-3 py-1.5 bg-yellow-700 hover:bg-yellow-600 disabled:bg-slate-700 rounded text-sm font-bold ml-2 flex-shrink-0">
                            升级({l.level===1?20:45}星尘)
                          </button>
                        )}
                      </div>
                      <p className="text-sm text-slate-400">{ld.description}</p>
                      </div>
                    </div>
                    );
                  })}
                </div>
              )}
            </>
          )}
        </div>
      )}

      {/* ===== 奇观 ===== */}
      {tab === 'wonders' && (
        <WonderPanel
          colony={colony}
          researchedCount={colony.techState?.researched?.length || 0}
          hasT25={colony.techState?.researched?.includes('T25') || false}
          conditionsMet={canStartWonder().success}
          shipGold={ship.gold}
          shipAlloy={ship.alloy}
          shipStardust={ship.stardust}
          shipFood={ship.food}
          shipMaterials={ship.materials}
          onSelectWonder={(id) => onSelectWonder(id)}
          onSubmitResources={() => onSubmitWonderResources()}
          onCompleteWonder={() => onCompleteWonder()}
          onShowMsg={showMsg}
        />
      )}
    </div>
  );
}
