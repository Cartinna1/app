import { useState, useMemo, useEffect } from 'react';
import type { Mothership } from '@/types/game';
import type { PlanetTypeId, PlanetDef } from '@/types/colony';
import { getBuildableBuildings, getBuildingDef } from '@/data/colony/buildings';
import { getPlanetById } from '@/data/colony/planets';
import { getTechById, getAvailableTechs } from '@/data/colony/techs';
import { getLeaderDef } from '@/data/colony/leaders';
import { Home, Users, Wrench, Play, UserPlus, FlaskConical, Crown } from 'lucide-react';

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
    list.push({ name: '烈日熔炉', desc: '电弧熔炼炉/星核熔炉产量+40%', color: 'text-orange-400' });
    list.push({ name: '硅砂富矿', desc: '硅片产量+30%', color: 'text-blue-400' });
    list.push({ name: '水源匮乏', desc: '食物产量-25%', color: 'text-red-400' });
  } else if (planet.id === 'ocean') {
    list.push({ name: '海洋丰收', desc: '食物产量+80%', color: 'text-green-400' });
    list.push({ name: '陆地稀缺', desc: '建筑各项成本+10%', color: 'text-amber-400' });
  } else if (planet.id === 'polar') {
    list.push({ name: '低温超导', desc: '科技研究速度减1回合', color: 'text-blue-400' });
    list.push({ name: '极光捕尘', desc: '星尘产量+30%', color: 'text-purple-400' });
    list.push({ name: '严寒维生', desc: '每个人口食物消耗+1', color: 'text-red-400' });
    list.push({ name: '冻土施工', desc: '建筑建造回合+1', color: 'text-amber-400' });
  } else if (planet.id === 'arid') {
    list.push({ name: '贵金属富集', desc: '黄金/合金产量+60%', color: 'text-yellow-400' });
    list.push({ name: '植被贫瘠', desc: '食物产量-40%', color: 'text-red-400' });
  } else if (planet.id === 'terran') {
    list.push({ name: '宜居典范', desc: '人口初始上限10，自带3人口', color: 'text-green-400' });
  } else if (planet.id === 'alpine') {
    list.push({ name: '稀薄大气观测', desc: '研究实验室科研点数+80%', color: 'text-purple-400' });
    list.push({ name: '山体矿脉', desc: '碳块+30%/黄金+20%', color: 'text-yellow-400' });
    list.push({ name: '地形障碍', desc: '建筑成本+20%', color: 'text-amber-400' });
  } else if (planet.id === 'savannah') {
    list.push({ name: '平原劲风', desc: '石油产量+80%', color: 'text-amber-400' });
    list.push({ name: '游牧智慧', desc: '领袖招募费用-1星尘', color: 'text-purple-400' });
    list.push({ name: '旱季缺水', desc: '食物产量-20%', color: 'text-red-400' });
  } else if (planet.id === 'tropical') {
    list.push({ name: '丛林沃土', desc: '食物+60%/碳块+100%', color: 'text-green-400' });
    list.push({ name: '暴雨侵蚀', desc: '建筑成本+10%', color: 'text-amber-400' });
  } else if (planet.id === 'tundra') {
    list.push({ name: '冻土封存', desc: '量子簇/暗物质+40%', color: 'text-purple-400' });
    list.push({ name: '缓慢启动', desc: '招募人口需2700金币', color: 'text-red-400' });
  } else if (planet.id === 'ruin') {
    list.push({ name: '远古档案', desc: '初始拥有一座纳米铸造阵列', color: 'text-cyan-400' });
    list.push({ name: '全息残响', desc: '居住舱人口上限+3', color: 'text-slate-400' });
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
  housing: '居住', food: '食物', alloy: '合金', stardust: '星尘', trade: '贸易', material: '原料', functional: '功能',
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
  onDemolishBuilding: (uid: string) => void;
}

type ColonyTab = 'overview' | 'buildings' | 'population' | 'research' | 'leaders';

export default function ColonyPanel(props: ColonyPanelProps) {
  const { ship, onUnlockColony, onSelectPlanet, onRescrollPlanets, generateScoutingPool, onBuild, onRecruitPop, onAssignPop, onStartResearch, onRecruitLeader, onUpgradeLeader, onRollAndRecruit, onCancelBuilding, onDemolishBuilding } = props;
  const colony = ship.colony;
  const [tab, setTab] = useState<ColonyTab>('overview');
  const [message, setMessage] = useState('');
  const [msgType, setMsgType] = useState<'success' | 'error'>('success');
  const [recruitQty, setRecruitQty] = useState(1);
  const [planetName, setPlanetName] = useState('');
  const [scoutPool, setScoutPool] = useState<PlanetTypeId[] | null>(null);
  const [buildCatFilter, setBuildCatFilter] = useState<string>('all');
  const [popCatFilter, setPopCatFilter] = useState<string>('all');

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
    return [...available].sort(() => Math.random() - 0.5).slice(0, 2);
  }, [colony?.techState?.researched, colony?.techState?.currentResearch, colony?.techState?.researchSeed]);

  // 提前计算活跃建筑的合并视图（必须在条件 return 之前，hooks 顺序不能变）
  const liveBuildings = useMemo(() => (colony?.buildings || []).filter((b) => b.active), [colony?.buildings]);
  const pendingBuildings = useMemo(() => (colony?.buildings || []).filter((b) => !b.active), [colony?.buildings]);
  const groupedLive = useMemo(() => {
    const map = new Map<string, { defId: string; count: number; uids: string[]; totalPop: number }>();
    for (const inst of liveBuildings) {
      const entry = map.get(inst.defId) || { defId: inst.defId, count: 0, uids: [], totalPop: 0 };
      entry.count += 1;
      entry.uids.push(inst.uid);
      entry.totalPop += inst.assignedPop;
      map.set(inst.defId, entry);
    }
    return Array.from(map.values());
  }, [liveBuildings]);

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
          {/* 产出汇总 */}
          {liveBuildings.length > 0 && (
            <div className="bg-slate-900/60 border border-slate-700 rounded-xl p-3">
              <h4 className="text-sm font-bold text-slate-400 mb-2">每回合产出</h4>
              <div className="flex flex-wrap gap-x-3 gap-y-1 text-sm">
                {(() => {
                  const pod = planet?.buffs;
                  let f = 0, a = 0, s = 0, g = 0, rp = 0;
                  const mats: Record<string, number> = {};
                  for (const inst of liveBuildings) {
                    if (inst.assignedPop <= 0) continue;
                    const d = getBuildingDef(inst.defId);
                    if (!d) continue;
                    if (d.outputType === 'food') { f += Math.ceil(((d.baseOutput||0)+(d.popFactor||0)*inst.assignedPop)*(pod?.foodMult||1)); }
                    else if (d.outputType === 'alloy') { a += Math.ceil(((d.baseOutput||0)+(d.popFactor||0)*inst.assignedPop)*(pod?.alloyMult||1)); }
                    else if (d.outputType === 'stardust') { s += Math.ceil(((d.baseOutput||0)+(d.popFactor||0)*inst.assignedPop)*(pod?.stardustMult||1)); }
                    else if (d.outputType === 'gold') { g += Math.floor(((d.goldOutputMin||0)+(d.goldOutputMax||0))/2); }
                    else if (d.outputType === 'research') { rp += (d.popFactor||0)*inst.assignedPop; }
                    else if (d.outputType === 'material' && d.outputMaterialId) { 
                      const mm = pod?.materialMults?.[d.outputMaterialId] || 1;
                      mats[d.outputMaterialId] = (mats[d.outputMaterialId]||0) + Math.ceil((d.popFactor||0)*inst.assignedPop*mm);
                    }
                  }
                  return <>
                    {f > 0 && <span className="text-green-400">食物 +{f}</span>}
                    {a > 0 && <span className="text-slate-300">合金 +{a}</span>}
                    {s > 0 && <span className="text-purple-400">星尘 +{s}</span>}
                    {g > 0 && <span className="text-yellow-400">金币 +{g}</span>}
                    {rp > 0 && <span className="text-cyan-400">科研 +{rp}</span>}
                    {Object.entries(mats).map(([k,v]) => <span key={k} className="text-amber-400">{(MAT_NAMES as Record<string,string>)[k]||k} +{v}</span>)}
                  </>;
                })()}
              </div>
              <div className="text-sm text-red-400 mt-1">
                食物消耗: -{colony.population.total * (3 + (planet?.buffs.foodConsumptionDelta || 0))}
              </div>
            </div>
          )}
        </div>
      )}

      {/* ===== 建筑 ===== */}
      {tab === 'buildings' && (
        <div className="space-y-3">
          {/* 已建成（合并同类） */}
          <div>
            <h4 className="text-sm font-bold text-green-400 mb-2">已建成</h4>
            {colony.buildings.filter((b: any) => b.active).length === 0 && <p className="text-slate-500 text-sm">暂无已建成建筑</p>}
            {colony.buildings.filter((b: any) => b.active).map((inst: any) => {
              const def = getBuildingDef(inst.defId);
              if (!def) return (
                <div key={inst.uid} className="bg-slate-900/60 border border-purple-700/40 rounded-lg p-3 mb-2 flex justify-between items-center">
                  <span className="text-sm text-purple-300 font-bold">{inst.defId}</span>
                  <button onClick={() => onDemolishBuilding(inst.uid)} className="px-2 py-1 bg-red-700 hover:bg-red-600 rounded text-xs font-bold">拆除</button>
                </div>
              );
              const maxLabel = def.maxPop > 0 ? `入驻 ${inst.assignedPop}/${def.maxPop}` : `入驻 ${inst.assignedPop}`;
              return (
                <div key={inst.uid} className="bg-slate-900/60 border border-green-700/40 rounded-lg p-3 mb-2 flex justify-between items-center">
                  <div>
                    <span className="text-sm text-green-300 font-bold">{def.name}</span>
                    <span className="text-sm text-slate-500 ml-2">{maxLabel} | {getOutputDesc(def)}</span>
                  </div>
                  <button onClick={() => { onDemolishBuilding(inst.uid); showMsg(`已拆除「${def.name}」`, 'success'); }}
                    className="px-2 py-1 bg-red-700 hover:bg-red-600 rounded text-xs font-bold flex-shrink-0 ml-3">拆除</button>
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
              {['all','housing','food','alloy','stardust','trade','material','functional'].map((cat) => (
                <button key={cat} onClick={() => setBuildCatFilter(cat)}
                  className={`px-2.5 py-1 rounded-lg text-sm font-bold transition-colors ${buildCatFilter === cat ? 'bg-cyan-600 text-white' : 'bg-slate-700/80 text-slate-400 hover:bg-slate-600'}`}>
                  {cat === 'all' ? '全部' : (CAT_LABELS[cat] || cat)}
                </button>
              ))}
            </div>
            {getBuildableBuildings(colony.techState?.researched || []).filter((d) => buildCatFilter === 'all' || d.category === buildCatFilter).map((def) => {
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
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

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
              {['all','housing','food','alloy','stardust','trade','material','functional'].map((cat) => (
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
                    <span className="text-sm text-slate-500 ml-2">(0-{effMax}人{extended ? <span className="text-amber-400"> 领袖+{(effMax-def.maxPop)}</span> : ''})</span>
                  </div>
                  <div className="flex items-center gap-1">
                    <input type="number" min={0} max={effMax} value={inst.assignedPop}
                      onChange={(e) => {
                        const v = Math.max(0, Math.min(effMax, parseInt(e.target.value) || 0));
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
              const ct = getTechById(colony.techState.currentResearch);
              return (
                <div className="bg-yellow-900/20 border border-yellow-700/40 rounded-lg p-3">
                  <p className="text-sm text-yellow-400 font-bold">研究中: {ct?.name}</p>
                  <p className="text-sm text-slate-400">{ct?.description}</p>
                  <p className="text-sm text-yellow-400 mt-1">进度: {colony.techState.currentProgress}/{ct?.researchTurns} 回合</p>
                </div>
              );
            })() : <p className="text-sm text-slate-500">尚未选择研究项目 | 每回合产出科研点数无法显示的不会在此显示</p>}
          </div>
          {!colony.techState.currentResearch && (
            <div>
              <h4 className="text-sm font-bold text-purple-400 mb-2">可选科技</h4>
              <div className="space-y-2">
                {researchOptions.map((tech) => (
                  <div key={tech.id} className={`bg-slate-900/60 border rounded-lg p-3 flex justify-between items-center ${colony.techState!.researchPoints >= tech.costRP ? 'border-purple-700/40' : 'border-slate-800 opacity-50'}`}>
                    <div>
                      <span className="text-sm text-purple-300 font-bold">{tech.name}</span>
                      <span className="text-sm text-slate-500 ml-2">{tech.researchTurns}回合 | {tech.costRP}点</span>
                      <p className="text-sm text-slate-400 mt-1">{tech.description}</p>
                      {tech.unlocksBuilding && <span className="text-sm text-cyan-400">解锁建筑: {getBuildingDef(tech.unlocksBuilding)?.name || ''}</span>}
                      {tech.leaderCapBonus && <span className="text-sm text-amber-400 ml-2">领袖上限 +{tech.leaderCapBonus}</span>}
                    </div>
                    <button onClick={() => { const r = onStartResearch(tech.id); showMsg(r.message, r.success ? 'success' : 'error'); }}
                      disabled={colony.techState!.researchPoints < tech.costRP}
                      className="px-3 py-1.5 bg-purple-700 hover:bg-purple-600 disabled:bg-slate-700 rounded text-sm font-bold text-white">研究</button>
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
                  const info = t ? (t.unlocksBuilding ? `解锁 ${getBuildingDef(t.unlocksBuilding)?.name || ''}` : t.leaderCapBonus ? `领袖上限+${t.leaderCapBonus}` : '') : '';
                  return <div key={tid} className="text-sm bg-green-900/20 text-green-400 border border-green-700/30 px-2 py-1 rounded">
                    <span className="font-bold">{t?.name || tid}</span>
                    {info && <span className="text-green-600 ml-1">- {info}</span>}
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
                      return (
                        <div key={i} className="bg-slate-800/60 border border-slate-700 rounded-lg p-3 flex justify-between items-center">
                          <div className="flex-1 mr-2">
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
                    return (
                    <div key={i} className="bg-slate-800/60 border border-slate-700 rounded-lg p-3 mb-2">
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
                    );
                  })}
                </div>
              )}
            </>
          )}
        </div>
      )}
    </div>
  );
}
