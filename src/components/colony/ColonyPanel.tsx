import { useState } from 'react';
import type { Mothership, GameState } from '@/types/game';
import type { BuildingInstance, PlanetTypeId } from '@/types/colony';
import { PHASE_1_BUILDINGS, getBuildingDef } from '@/data/colony/buildings';
import { getPlanetById } from '@/data/colony/planets';
import { Home, Wheat, Cog, Coins, Users, Wrench, Play, Plus, Minus } from 'lucide-react';

interface ColonyPanelProps {
  ship: Mothership;
  gameState: GameState;
  onUnlockColony: () => { success: boolean; message: string };
  onSelectPlanet: (planetId: PlanetTypeId, name: string) => { success: boolean; message: string };
  onRescrollPlanets: () => { success: boolean; message: string };
  generateScoutingPool: () => PlanetTypeId[];
  onBuild: (defId: string) => { success: boolean; message: string };
  onRecruitPop: (amount: number) => { success: boolean; message: string };
  onAssignPop: (buildingUid: string, count: number) => { success: boolean; message: string };
}

type ColonyTab = 'overview' | 'buildings' | 'population' | 'scout';

export default function ColonyPanel(props: ColonyPanelProps) {
  const { ship, gameState, onUnlockColony, onSelectPlanet, onRescrollPlanets, generateScoutingPool, onBuild, onRecruitPop, onAssignPop } = props;
  const colony = ship.colony;
  const [tab, setTab] = useState<ColonyTab>('overview');
  const [message, setMessage] = useState('');
  const [msgType, setMsgType] = useState<'success' | 'error'>('success');
  const [recruitQty, setRecruitQty] = useState(1);
  const [planetName, setPlanetName] = useState('');
  const [scoutPool, setScoutPool] = useState<PlanetTypeId[] | null>(null);

  const showMsg = (m: string, t: 'success' | 'error') => { setMessage(m); setMsgType(t); setTimeout(() => setMessage(''), 4000); };

  // ===== 未解锁 =====
  if (!colony || colony.phase === 'inactive') {
    return (
      <div className="space-y-4">
        <h2 className="text-xl font-bold text-white">星际殖民</h2>
        <div className="bg-slate-900/60 border border-slate-700 rounded-xl p-6 text-center">
          <Home size={48} className="mx-auto mb-3 text-slate-600" />
          <p className="text-slate-300 text-sm mb-2">尚未解锁星际殖民功能</p>
          <p className="text-slate-500 text-xs mb-4">花费 30,000 金币组建远征军，开拓属于你的殖民星球。</p>
          <button
            onClick={() => { const r = onUnlockColony(); showMsg(r.message, r.success ? 'success' : 'error'); }}
            disabled={ship.gold < 30000}
            className={`px-6 py-2.5 rounded-lg font-bold text-sm transition-colors ${ship.gold >= 30000 ? 'bg-cyan-600 hover:bg-cyan-500 text-white' : 'bg-slate-700 text-slate-500 cursor-not-allowed'}`}
          >
            {ship.gold >= 30000 ? '组建远征军 (30,000金币)' : '金币不足 (30,000)'}
          </button>
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
          <p className="text-slate-500 text-xs mt-2">届时将提供 3 颗候选星球供选择。</p>
        </div>
      </div>
    );
  }

  // ===== 选择星球 =====
  if (colony.phase === 'selecting') {
    if (!scoutPool) {
      const pool = generateScoutingPool();
      setScoutPool(pool);
      return null;
    }
    return (
      <div className="space-y-4">
        <h2 className="text-xl font-bold text-white">选择殖民星球</h2>
        <p className="text-xs text-slate-400">远征军为你找到了3颗候选星球。请为你的殖民地挑选一颗并命名。</p>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
          {scoutPool.map((pid) => {
            const p = getPlanetById(pid);
            if (!p) return null;
            return (
              <div key={pid} className="bg-slate-900/60 border border-slate-700 rounded-xl p-4">
                <h4 className="font-bold text-slate-100 mb-2">{p.name}</h4>
                <p className="text-xs text-slate-400 mb-3">{p.description}</p>
                <div className="text-[10px] text-slate-500 space-y-1 mb-4">
                  {p.buffs.foodMult && <p>食物产量 ×{p.buffs.foodMult}</p>}
                  {p.buffs.alloyMult && <p>合金产量 ×{p.buffs.alloyMult}</p>}
                  {p.buffs.stardustMult && <p>星尘产量 ×{p.buffs.stardustMult}</p>}
                  {p.buffs.buildCostMult && <p>建造成本 ×{p.buffs.buildCostMult}</p>}
                  {p.buffs.initialPopCap && <p>初始人口上限 {p.buffs.initialPopCap}</p>}
                  {p.buffs.specialEffects?.map((e, i) => <p key={i}>{e}</p>)}
                </div>
                <button onClick={() => {
                  if (!planetName) { showMsg('请先输入星球名称', 'error'); return; }
                  const r = onSelectPlanet(pid, planetName);
                  showMsg(r.message, r.success ? 'success' : 'error');
                }} className="w-full py-2 bg-cyan-700 hover:bg-cyan-600 rounded-lg text-sm font-bold text-white">
                  殖民此星球
                </button>
              </div>
            );
          })}
        </div>
        <div className="flex gap-2">
          <input value={planetName} onChange={(e) => setPlanetName(e.target.value.slice(0, 16))} placeholder="输入星球名称 (3-16字符)"
            className="flex-1 bg-slate-800 border border-slate-600 rounded-lg px-3 py-2 text-sm text-slate-200" />
          <button onClick={() => { const r = onRescrollPlanets(); showMsg(r.message, r.success ? 'success' : 'error'); setScoutPool(null); }}
            disabled={ship.gold < 30000}
            className="px-4 py-2 bg-slate-700 hover:bg-slate-600 disabled:opacity-50 rounded-lg text-sm text-slate-200">
            重新探索 (30,000G)
          </button>
        </div>
        {message && <div className={`p-3 rounded-lg text-sm text-center ${msgType === 'success' ? 'bg-green-900/20 border border-green-700/50 text-green-400' : 'bg-red-900/20 border border-red-700/50 text-red-400'}`}>{message}</div>}
      </div>
    );
  }

  // ===== 殖民运行中 =====
  const planet = colony.planetType ? getPlanetById(colony.planetType) : null;
  const liveBuildings = colony.buildings.filter((b) => b.active);
  const pendingBuildings = colony.buildings.filter((b) => !b.active);

  const tabs: { id: ColonyTab; label: string; icon: React.ElementType }[] = [
    { id: 'overview', label: '总览', icon: Home },
    { id: 'buildings', label: '建筑', icon: Wrench },
    { id: 'population', label: '人口', icon: Users },
  ];

  return (
    <div className="space-y-4">
      <h2 className="text-xl font-bold text-white">星际殖民 · {colony.planetName}</h2>
      <p className="text-xs text-slate-400">星球类型：{planet?.name || '未知'} | 人口：{colony.population.total}/{colony.population.cap} | 空闲：{colony.population.available}</p>

      <div className="flex gap-1.5 mb-3">
        {tabs.map((t) => {
          const Icon = t.icon;
          return (
            <button key={t.id} onClick={() => setTab(t.id)}
              className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all flex items-center gap-1.5 ${tab === t.id ? 'bg-cyan-600 text-white' : 'bg-slate-800/60 text-slate-400 hover:bg-slate-700'}`}>
              <Icon size={14} />{t.label}
            </button>
          );
        })}
      </div>

      {message && <div className={`p-3 rounded-lg text-sm text-center ${msgType === 'success' ? 'bg-green-900/20 border border-green-700/50 text-green-400' : 'bg-red-900/20 border border-red-700/50 text-red-400'}`}>{message}</div>}

      {/* ===== 总览 ===== */}
      {tab === 'overview' && (
        <div className="space-y-3">
          {planet && (
            <div className="bg-slate-900/60 border border-slate-700 rounded-xl p-4">
              <h4 className="font-bold text-slate-200 mb-1">{planet.name}</h4>
              <p className="text-xs text-slate-400">{planet.description}</p>
              <div className="mt-2 flex flex-wrap gap-2 text-[10px]">
                {planet.buffs.foodMult && <span className="bg-green-900/30 text-green-400 px-1.5 py-0.5 rounded">食物 ×{planet.buffs.foodMult}</span>}
                {planet.buffs.alloyMult && <span className="bg-slate-700/50 text-slate-300 px-1.5 py-0.5 rounded">合金 ×{planet.buffs.alloyMult}</span>}
                {planet.buffs.buildCostMult && <span className="bg-amber-900/30 text-amber-400 px-1.5 py-0.5 rounded">造价 ×{planet.buffs.buildCostMult}</span>}
                {planet.buffs.foodConsumptionDelta && <span className="bg-red-900/30 text-red-400 px-1.5 py-0.5 rounded">食物消耗 +{planet.buffs.foodConsumptionDelta}</span>}
                {planet.buffs.specialEffects?.map((e, i) => <span key={i} className="bg-purple-900/30 text-purple-400 px-1.5 py-0.5 rounded">{e}</span>)}
              </div>
            </div>
          )}
          <div className="grid grid-cols-2 gap-3">
            <div className="bg-slate-900/60 border border-slate-700 rounded-xl p-3">
              <p className="text-xs text-slate-500">已建成建筑</p>
              <p className="text-lg font-bold text-cyan-400">{liveBuildings.length}</p>
            </div>
            <div className="bg-slate-900/60 border border-slate-700 rounded-xl p-3">
              <p className="text-xs text-slate-500">建造中</p>
              <p className="text-lg font-bold text-yellow-400">{pendingBuildings.length}</p>
            </div>
          </div>
        </div>
      )}

      {/* ===== 建筑 ===== */}
      {tab === 'buildings' && (
        <div className="space-y-3">
          {/* 建造中 */}
          {pendingBuildings.length > 0 && (
            <div>
              <h4 className="text-sm font-bold text-yellow-400 mb-2">建造中</h4>
              {pendingBuildings.map((inst) => {
                const def = getBuildingDef(inst.defId);
                if (!def) return null;
                return (
                  <div key={inst.uid} className="bg-slate-900/60 border border-yellow-700/40 rounded-lg p-3 mb-2 flex justify-between items-center">
                    <div>
                      <span className="text-sm text-yellow-300 font-bold">{def.name}</span>
                      <span className="text-xs text-slate-500 ml-2">{def.description}</span>
                    </div>
                    <span className="text-xs text-yellow-400">{inst.buildProgress}/{def.buildTurns} 回合</span>
                  </div>
                );
              })}
            </div>
          )}

          {/* 已建成 */}
          <div>
            <h4 className="text-sm font-bold text-green-400 mb-2">已建成</h4>
            {liveBuildings.length === 0 && <p className="text-slate-500 text-sm">暂无已建成建筑</p>}
            {liveBuildings.map((inst) => {
              const def = getBuildingDef(inst.defId);
              if (!def) return null;
              const maxLabel = inst.defId === 'B1' ? '' : ` | 人口: ${inst.assignedPop}/${def.maxPop}`;
              return (
                <div key={inst.uid} className="bg-slate-900/60 border border-green-700/40 rounded-lg p-3 mb-2">
                  <div className="flex justify-between items-center">
                    <div>
                      <span className="text-sm text-green-300 font-bold">{def.name}</span>
                      <span className="text-xs text-slate-500 ml-2">{def.description}{maxLabel}</span>
                    </div>
                    <span className="text-[10px] text-slate-500">#{inst.defId}</span>
                  </div>
                </div>
              );
            })}
          </div>

          {/* 可建造列表 */}
          <div>
            <h4 className="text-sm font-bold text-cyan-400 mb-2">建造新建筑</h4>
            {PHASE_1_BUILDINGS.map((def) => {
              const count = colony.buildings.filter((b) => b.defId === def.id).length;
              const limited = def.maxCount && count >= def.maxCount;
              return (
                <div key={def.id} className={`bg-slate-900/60 border rounded-lg p-3 mb-2 flex justify-between items-center ${limited ? 'opacity-50 border-slate-800' : 'border-slate-700'}`}>
                  <div>
                    <span className="text-sm text-slate-200 font-bold">{def.name}</span>
                    <span className="text-xs text-slate-500 ml-2">{def.description}</span>
                    <div className="text-[10px] text-slate-500 mt-1">
                      金币: {def.costGold.toLocaleString()}
                      {def.costMaterials && Object.entries(def.costMaterials).map(([k, v]) => <span key={k} className="ml-1">| {k}: {v}</span>)}
                      <span className="ml-1">| {def.buildTurns}回合</span>
                      {def.maxCount && <span className="ml-1">| 上限: {def.maxCount}</span>}
                    </div>
                  </div>
                  <button onClick={() => { const r = onBuild(def.id); showMsg(r.message, r.success ? 'success' : 'error'); }}
                    disabled={limited}
                    className="px-3 py-1.5 bg-cyan-700 hover:bg-cyan-600 disabled:bg-slate-700 disabled:text-slate-500 rounded text-xs font-bold text-white">
                    {limited ? '已达上限' : '建造'}
                  </button>
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
            <h4 className="font-bold text-slate-200 mb-3">招募人口</h4>
            <p className="text-xs text-slate-400 mb-2">每人口花费 2,000 金币，每回合最多 5 人，当前上限 {colony.population.cap}</p>
            <div className="flex gap-2">
              <input type="number" min={1} max={5} value={recruitQty}
                onChange={(e) => setRecruitQty(Math.min(5, Math.max(1, parseInt(e.target.value) || 1)))}
                className="w-16 bg-slate-800 border border-slate-600 rounded px-2 py-1.5 text-sm text-slate-200 text-center" />
              <button onClick={() => { const r = onRecruitPop(recruitQty); showMsg(r.message, r.success ? 'success' : 'error'); }}
                disabled={ship.gold < 2000 * recruitQty || colony.population.total >= colony.population.cap}
                className="px-4 py-1.5 bg-green-700 hover:bg-green-600 disabled:bg-slate-700 disabled:text-slate-500 rounded text-sm font-bold text-white">
                招募 ({2000 * recruitQty}G)
              </button>
            </div>
          </div>

          {/* 人口分配 */}
          <div className="bg-slate-900/60 border border-slate-700 rounded-xl p-4">
            <h4 className="font-bold text-slate-200 mb-3">分配人口到建筑</h4>
            <p className="text-xs text-slate-400 mb-2">空闲人口: {colony.population.available}</p>
            {liveBuildings.filter((b) => {
              const def = getBuildingDef(b.defId);
              return def && def.maxPop > 0;
            }).map((inst) => {
              const def = getBuildingDef(inst.defId);
              if (!def) return null;
              return (
                <div key={inst.uid} className="flex items-center justify-between bg-slate-800/60 rounded-lg p-3 mb-2">
                  <div>
                    <span className="text-sm text-slate-200">{def.name}</span>
                    <span className="text-xs text-slate-500 ml-2">({def.minPop}-{def.maxPop}人)</span>
                  </div>
                  <div className="flex items-center gap-1">
                    <button onClick={() => { const r = onAssignPop(inst.uid, Math.max(def.minPop, inst.assignedPop - 1)); showMsg(r.message, r.success ? 'success' : 'error'); }}
                      className="w-7 h-7 rounded bg-slate-700 hover:bg-slate-600 flex items-center justify-center"><Minus size={12} className="text-slate-300" /></button>
                    <span className="w-8 text-center text-sm text-cyan-400 font-bold">{inst.assignedPop}</span>
                    <button onClick={() => { const r = onAssignPop(inst.uid, Math.min(def.maxPop, inst.assignedPop + 1)); showMsg(r.message, r.success ? 'success' : 'error'); }}
                      className="w-7 h-7 rounded bg-slate-700 hover:bg-slate-600 flex items-center justify-center"><Plus size={12} className="text-slate-300" /></button>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
