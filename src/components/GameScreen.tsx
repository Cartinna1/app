import { useState, useEffect, useRef } from 'react';
import type { GameState, EventOption, ResourceChange, ChoiceEvent } from '@/types/game';
import type { DodgeReason } from '@/hooks/useEvent';
import type { PlanetTypeId } from '@/types/colony';
import {
  LayoutDashboard,
  TrendingUp,
  Package,
  Factory,
  ShoppingCart,
  Sparkles,
  Gift,
  Save,
  Clock,
  Coins,
  Rocket,
  Users,
  Banknote,
  ShieldAlert,
  Gem,
  Globe,
  Receipt,
  Zap,
  Wrench,
  Flame,
  Swords,
  Home,
  Volume2,
  VolumeX,
} from 'lucide-react';
import StockMarket from './StockMarket';
import MaterialMarket from './MaterialMarket';
import ProductionPanel from './ProductionPanel';
import ProductMarket from './ProductMarket';
import EventPanel from './EventPanel';
import RedeemCode from './RedeemCode';
import SaveManager from './SaveManager';
import LoanPanel from './LoanPanel';
import TradePanel from './TradePanel';
import { getInvestmentTier, getBuffDescription } from '@/data/factions';
import { RECIPES } from '@/data/gameData';
import GoldLogViewer from './GoldLogViewer';
import ModulePanel from './ModulePanel';
import ColonyPanel from './colony/ColonyPanel';
import { getBuildingDef } from '@/data/colony/buildings';
import { getPlanetById } from '@/data/colony/planets';
import { getLeaderDef } from '@/data/colony/leaders';

interface GameScreenProps {
  gameState: GameState;
  activeEvent: import('@/types/game').ChoiceEvent | null;
  eventDodged: DodgeReason;
  onBuyStock: (shipIndex: number, stockId: string, qty: number) => { error: string | null };
  onSellStock: (shipIndex: number, stockId: string, qty: number) => { error: string | null; profit?: number; profitRate?: number };
  onBuyMaterial: (shipIndex: number, matId: string, qty: number) => string | null;
  onStartProduction: (shipIndex: number, recipeId: string) => string | null;
  onSellProductQty: (shipIndex: number, productId: string, qty?: number) => { totalRevenue: number; count: number; avgMatCost: number; unitPrice: number } | null;
  onNextTurn: () => void;
  onDrawEvent: (shipIndex: number) => ChoiceEvent | null;
  onChooseEventOption: (shipIndex: number, option: EventOption, accumulator: ResourceChange) => import('@/hooks/useEvent').ChooseResult | null;
  onApplyEventResources: (shipIndex: number, res: ResourceChange, reason: string) => void;
  onClearActiveEvent: () => void;
  onClearEventDodged: () => void;
  onTakeLoan: (principal: number, plan: { turns: number; rate: number }) => { success: boolean; message: string };
  onRepayLoan: (loanId: string) => { success: boolean; message: string };
  onTravelToFaction: (targetFactionId: string) => { success: boolean; message: string };
  onBuySpecialty: (quantity: number) => { success: boolean; message: string };
  onSellSpecialty: (factionId: string, quantity: number) => { success: boolean; message: string };
  onExploreFaction: () => { success: boolean; message: string };
  onInvestFaction: (amount: number) => { success: boolean; message: string };
  onGatherIntel: () => { success: boolean; message: string; goldChange: number };
  onAcceptContract: (contractId: string) => { success: boolean; message: string };
  onCompleteContract: (contractId: string) => { success: boolean; message: string };
  onBlackMarketBuy: (factionId: string, itemId: string, qty: number) => { success: boolean; message: string };
  onInstallModule: (moduleId: string) => { success: boolean; message: string };
  onUseManualModule: (moduleId: string) => { success: boolean; message: string };
  onUnlockColony: () => { success: boolean; message: string };
  onSelectPlanet: (planetId: PlanetTypeId, name: string) => { success: boolean; message: string };
  onRescrollPlanets: () => { success: boolean; message: string };
  generateScoutingPool: () => PlanetTypeId[];
  onBuildColonyBuilding: (defId: string) => { success: boolean; message: string };
  onRecruitPop: (amount: number) => { success: boolean; message: string };
  onAssignPop: (buildingUid: string, count: number) => { success: boolean; message: string };
  onStartResearch: (techId: string) => { success: boolean; message: string };
  onRecruitLeader: (leaderId: string) => void;
  onUpgradeLeader: (leaderIndex: number) => { success: boolean; message: string };
  onRollAndRecruit: () => void;
  onCancelBuilding: (uid: string) => void
  onDemolishBuilding: (uid: string) => { success: boolean; message: string };
  onSelectWonder: (wonderId: string) => { success: boolean; message: string };
  onSubmitWonderResources: () => { success: boolean; message: string };
  onCompleteWonder: () => { success: boolean; message: string };
  canStartWonder: () => { success: boolean; reasons: string[] };
  onBuyAlloy: (type: 'gold' | 'stardust', qty: number) => boolean;
  onBuyFood: (type: 'gold' | 'alloy', qty: number) => boolean;
  onBuyRelic: (relicId: string) => { success: boolean; message: string };
  onBuyRandomMats: () => { success: boolean; message: string };
  onBuySellBonus: (turns: number, bonus: number, stardustCost: number) => { success: boolean; message: string };
  onBuyGoldWithStardust: () => { success: boolean; message: string };
  onRerollPolicy: () => { success: boolean; message: string };
  onBuyFoodWithStardust: (qty: number) => { success: boolean; message: string };
  onRedeemCode: (shipIndex: number, code: string) => { success: boolean; message: string };
  onExportSave: () => boolean;
  onImportSave: (file: File) => Promise<boolean>;
  onResetGame: () => void;
  getShipTotalAssets: (ship: GameState['ships'][0]) => number;
}

type TabId = 'overview' | 'stocks' | 'materials' | 'production' | 'products' | 'events' | 'loan' | 'trade' | 'colony' | 'module' | 'redeem' | 'goldlog' | 'save';

const tabs: { id: TabId; label: string; shortLabel: string; icon: React.ElementType }[] = [
  { id: 'overview', label: '总览', shortLabel: '总览', icon: LayoutDashboard },
  { id: 'stocks', label: '股票', shortLabel: '股票', icon: TrendingUp },
  { id: 'materials', label: '原料', shortLabel: '原料', icon: Package },
  { id: 'production', label: '生产', shortLabel: '生产', icon: Factory },
  { id: 'products', label: '集会', shortLabel: '集会', icon: ShoppingCart },
  { id: 'events', label: '事件', shortLabel: '事件', icon: Sparkles },
  { id: 'loan', label: '贷款', shortLabel: '贷款', icon: Banknote },
  { id: 'trade', label: '贸易', shortLabel: '贸易', icon: Globe },
  { id: 'colony', label: '殖民', shortLabel: '殖民', icon: Home },
  { id: 'module', label: '改造', shortLabel: '改造', icon: Wrench },
  { id: 'redeem', label: '兑换', shortLabel: '兑换', icon: Gift },
  { id: 'goldlog', label: '日志', shortLabel: '日志', icon: Receipt },
  { id: 'save', label: '存档', shortLabel: '存档', icon: Save },
];

export default function GameScreen({
  gameState,
  activeEvent,
  eventDodged,
  onBuyStock,
  onSellStock,
  onBuyMaterial,
  onStartProduction,
  onSellProductQty,
  onNextTurn,
  onDrawEvent,
  onChooseEventOption,
  onApplyEventResources,
  onClearActiveEvent,
  onClearEventDodged,
  onTakeLoan,
  onRepayLoan,
  onTravelToFaction,
  onBuySpecialty,
  onSellSpecialty,
  onExploreFaction,
  onInvestFaction,
  onGatherIntel,
  onAcceptContract,
  onCompleteContract,
  onBlackMarketBuy,
  onInstallModule,
  onUseManualModule,
  onUnlockColony,
  onSelectPlanet,
  onRescrollPlanets,
  generateScoutingPool,
  onBuildColonyBuilding,
  onRecruitPop,
  onAssignPop,
  onStartResearch,
  onRecruitLeader,
  onUpgradeLeader,
  onRollAndRecruit,
            onCancelBuilding,
            onDemolishBuilding,
            onSelectWonder,
            onSubmitWonderResources,
            onCompleteWonder,
            canStartWonder,
  onBuyAlloy,
  onBuyFood,
  onBuyRelic,
  onBuyRandomMats,
  onBuySellBonus,
  onBuyGoldWithStardust,
  onRerollPolicy,
  onBuyFoodWithStardust,
  onRedeemCode,
  onExportSave,
  onImportSave,
  onResetGame,
  getShipTotalAssets,
}: GameScreenProps) {
  const [activeTab, setActiveTab] = useState<TabId>('overview');
  const [showConfirmNext, setShowConfirmNext] = useState(false);
  const [bgmMuted, setBgmMuted] = useState(() => localStorage.getItem('bgm_muted') === 'true');
  const bgmRef = useRef<HTMLAudioElement | null>(null);

  // 背景音乐：首次用户交互时启动
  useEffect(() => {
    if (bgmRef.current) return;
    const audio = new Audio('/bgm.mp3');
    audio.loop = true;
    audio.volume = 0.3;
    bgmRef.current = audio;

    const startOnInteraction = () => {
      if (localStorage.getItem('bgm_muted') !== 'true') {
        audio.play().catch(() => {});
      }
      document.removeEventListener('click', startOnInteraction);
    };
    document.addEventListener('click', startOnInteraction, { once: true });

    return () => {
      audio.pause();
      audio.src = '';
    };
  }, []);

  // 静音切换
  useEffect(() => {
    const a = bgmRef.current;
    if (!a) return;
    if (bgmMuted) {
      a.pause();
    } else {
      a.play().catch(() => {});
    }
  }, [bgmMuted]);

  const toggleMute = () => {
    const next = !bgmMuted;
    setBgmMuted(next);
    localStorage.setItem('bgm_muted', String(next));
  };

  const currentShip = gameState.ships[0];
  const totalAssets = currentShip ? getShipTotalAssets(currentShip) : 0;

  const confirmNextTurn = () => {
    setShowConfirmNext(false);
    onNextTurn();
  };

  return (
    <div className="min-h-screen bg-gradient-to-b from-slate-950 via-indigo-950 to-slate-950 text-slate-100 pb-24 md:pb-0">
      {/* ==================== 顶部状态栏 ==================== */}
      <header className="bg-slate-900/80 border-b border-slate-700/50 px-3 py-2 md:px-4 md:py-3">
        <div className="max-w-7xl mx-auto flex items-center justify-between">
          {/* 左侧：标题+回合 */}
          <div className="flex items-center gap-2 md:gap-6">
            <h1 className="text-sm md:text-xl font-bold bg-gradient-to-r from-cyan-400 to-blue-400 bg-clip-text text-transparent">
              航空生涯之旅
            </h1>
            <div className="flex items-center gap-1 md:gap-2 text-xs md:text-sm text-slate-400">
              <Clock size={14} className="text-cyan-400" />
              <span>第{gameState.turn}回合</span>
            </div>

          </div>

          {/* 右侧：船只+金币+资产 */}
          {currentShip && (
            <div className="flex items-center gap-2 md:gap-6">
              {/* 船只信息 - 桌面端完整显示 */}
              <div className="hidden md:flex items-center gap-2 bg-slate-800/60 px-3 py-1.5 rounded-lg border border-slate-700">
                <Rocket size={14} className="text-cyan-400" />
                <span className="text-cyan-400 text-xs font-bold">{currentShip.name}</span>
                <span className="text-slate-500 text-xs">|</span>
                <span className="text-xs text-slate-300" title={currentShip.skill.description}>{currentShip.skill.name}</span>
                {currentShip.bankrupt && (
                  <span className="flex items-center gap-1 text-[10px] bg-red-600 text-white px-1.5 py-0.5 rounded font-bold">
                    <ShieldAlert size={10} /> 破产{currentShip.bankruptTimer > 0 ? `(${currentShip.bankruptTimer})` : ''}
                  </span>
                )}
                {currentShip.famineTimer > 0 && !currentShip.isRebellion && (
                  <span className="flex items-center gap-1 text-[10px] bg-orange-600 text-white px-1.5 py-0.5 rounded font-bold">
                    <Flame size={10} /> 饥荒{currentShip.famineTimer > 0 ? `(${currentShip.famineTimer})` : ''}
                  </span>
                )}
                {currentShip.isRebellion && (
                  <span className="flex items-center gap-1 text-[10px] bg-red-700 text-white px-1.5 py-0.5 rounded font-bold">
                    <Swords size={10} /> 叛乱{currentShip.famineTimer > 0 ? `(${currentShip.famineTimer})` : ''}
                  </span>
                )}
                {currentShip.relics.length > 0 && (
                  <span className="flex items-center gap-1 text-[10px] bg-purple-600 text-white px-1.5 py-0.5 rounded" title={currentShip.relics.map((r) => r.name).join(', ')}>
                    <Gem size={10} />{currentShip.relics.length}
                  </span>
                )}
              </div>
              {/* 船只信息 - 移动端精简 */}
              <div className="flex md:hidden items-center gap-1 bg-slate-800/60 px-2 py-1 rounded border border-slate-700">
                <Rocket size={12} className="text-cyan-400" />
                <span className="text-cyan-400 text-xs font-bold">{currentShip.name}</span>
                {currentShip.bankrupt && (
                  <span className="text-[10px] bg-red-600 text-white px-1 py-0.5 rounded">破{currentShip.bankruptTimer}</span>
                )}
                {currentShip.famineTimer > 0 && !currentShip.isRebellion && (
                  <span className="text-[10px] bg-orange-600 text-white px-1 py-0.5 rounded">饥{currentShip.famineTimer}</span>
                )}
                {currentShip.isRebellion && (
                  <span className="text-[10px] bg-red-700 text-white px-1 py-0.5 rounded">叛{currentShip.famineTimer}</span>
                )}
              </div>
              {/* 金币 */}
              <div className="flex items-center gap-1">
                <Coins size={14} className="text-yellow-400" />
                <span className="text-yellow-400 font-bold text-sm md:text-base">{currentShip.gold.toLocaleString()}</span>
              </div>
              {/* 食物/合金/星尘 - 全部端显示 */}
              <div className="flex items-center gap-2 md:gap-3">
                <div className="flex items-center gap-1">
                  <span className="text-[10px] text-amber-400">食物</span>
                  <span className="text-amber-300 font-bold text-sm">{currentShip.food}</span>
                </div>
                <div className="flex items-center gap-1">
                  <span className="text-[10px] text-slate-400">合金</span>
                  <span className="text-slate-300 font-bold text-sm">{currentShip.alloy}</span>
                </div>
                <div className="flex items-center gap-1">
                  <span className="text-[10px] text-purple-400">星尘</span>
                  <span className="text-purple-300 font-bold text-sm">{currentShip.stardust}</span>
                </div>
              </div>
              {/* 总资产 - 桌面端显示 */}
              <div className="hidden md:block text-sm text-slate-400">
                总资产: <span className="text-cyan-400 font-bold">{totalAssets.toLocaleString()}</span>
              </div>
            </div>
          )}
        </div>
      </header>

      {/* ==================== 主体布局 ==================== */}
      <div className="max-w-7xl mx-auto flex flex-col md:flex-row">

        {/* ===== 桌面端侧边栏 ===== */}
        <aside className="hidden md:flex w-56 bg-slate-900/60 border-r border-slate-700/50 min-h-[calc(100vh-60px)] flex-col flex-shrink-0">
          {/* 当前船只信息 */}
          <div className="p-4 border-b border-slate-700/50">
            <p className="text-xs text-slate-500 mb-2">当前舰队</p>
            {currentShip && (
              <div className="bg-slate-800/80 rounded-lg p-3">
                <div className="flex items-center gap-2 mb-2">
                  <img
                    src={`/motherships/${currentShip.id}.png`}
                    alt={currentShip.name}
                    onError={(e) => { (e.target as HTMLImageElement).style.display='none'; }}
                    className="w-16 h-16 rounded object-cover border border-slate-700 flex-shrink-0"
                  />
                  <Rocket size={18} className="text-cyan-400" />
                  <span className="font-bold text-sm">{currentShip.name}</span>
                </div>
                <p className="text-xs text-cyan-400">{currentShip.skill.name}</p>
                <p className="text-[10px] text-slate-500 mt-1 line-clamp-2">{currentShip.skill.description}</p>
              </div>
            )}
          </div>

          {/* 结束回合 */}
          <div className="p-4 pb-2">
            <button
              onClick={() => setShowConfirmNext(true)}
              className="w-full py-2.5 bg-gradient-to-r from-red-600 to-orange-600 hover:from-red-500 hover:to-orange-500 rounded-lg font-bold text-white transition-all shadow-lg shadow-red-900/30"
            >
              结束回合
            </button>
          </div>

          {/* 标签页 */}
          <nav className="flex-1 p-2 pt-1">
            {tabs.map((tab) => {
              const Icon = tab.icon;
              return (
                <button
                  key={tab.id}
                  onClick={() => setActiveTab(tab.id)}
                  className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm transition-all mb-1 ${
                    activeTab === tab.id
                      ? 'bg-cyan-600/20 text-cyan-400 border border-cyan-600/40'
                      : 'text-slate-400 hover:bg-slate-800 hover:text-slate-200'
                  }`}
                >
                  <Icon size={16} />
                  <span>{tab.label}</span>
                </button>
              );
            })}
          </nav>

          {/* 背景音乐开关 */}
          <div className="mt-auto p-4 border-t border-slate-700/50">
            <button
              onClick={toggleMute}
              className={`flex items-center gap-2 w-full px-3 py-2 rounded-lg text-xs transition-colors ${
                bgmMuted
                  ? 'text-slate-500 hover:text-slate-300 hover:bg-slate-800'
                  : 'text-cyan-400 bg-cyan-900/20 hover:bg-cyan-900/40'
              }`}
            >
              {bgmMuted ? <VolumeX size={16} /> : <Volume2 size={16} />}
              <span>{bgmMuted ? '音乐已关闭' : '背景音乐'}</span>
            </button>
          </div>
        </aside>

        {/* ===== 主内容区 ===== */}
        <main className="flex-1 p-3 md:p-6 overflow-auto min-h-[calc(100vh-120px)] md:min-h-[calc(100vh-60px)]">
          <div className={activeTab === 'overview' ? '' : 'hidden'}>
            <OverviewTab gameState={gameState} ship={currentShip} getShipTotalAssets={getShipTotalAssets} />
          </div>
          <div className={activeTab === 'stocks' ? '' : 'hidden'}>
            <StockMarket
              stocks={gameState.stocks}
              ship={currentShip}
              shipIndex={0}
              currentTurn={gameState.turn}
              onBuy={onBuyStock}
              onSell={onSellStock}
            />
          </div>
          <div className={activeTab === 'materials' ? '' : 'hidden'}>
            <MaterialMarket
              materials={gameState.materials}
              ship={currentShip}
              shipIndex={0}
              onBuy={onBuyMaterial}
            />
          </div>
          <div className={activeTab === 'production' ? '' : 'hidden'}>
            <ProductionPanel
              ship={currentShip}
              shipIndex={0}
              materials={gameState.materials}
              onStartProduction={onStartProduction}
            />
          </div>
          <div className={activeTab === 'products' ? '' : 'hidden'}>
            <ProductMarket
              ship={currentShip}
              shipIndex={0}
              products={gameState.products}
              materials={gameState.materials}
              stardustMarket={gameState.stardustMarket}
              currentTurn={gameState.turn}
              onSellQty={onSellProductQty}
              onBuyRelic={onBuyRelic}
              onBuyRandomMats={onBuyRandomMats}
              onBuySellBonus={onBuySellBonus}
              onBuyGoldWithStardust={onBuyGoldWithStardust}
              onRerollPolicy={onRerollPolicy}
              onBuyFoodWithStardust={onBuyFoodWithStardust}
              onBuyAlloy={onBuyAlloy}
              onBuyFood={onBuyFood}
            />
          </div>
          <div className={activeTab === 'events' ? '' : 'hidden'}>
            <EventPanel
              activeEvent={activeEvent}
              eventDodged={eventDodged}
              eventProcessedThisTurn={currentShip?.eventProcessedThisTurn || false}
              stockTipThisTurn={currentShip?.stockTipThisTurn}
              matTipThisTurn={currentShip?.matTipThisTurn}
              eventLog={gameState.eventLog}
              currentTurn={gameState.turn}
              eventTriggeredThisTurn={currentShip?.eventTriggeredThisTurn || false}
              onDrawEvent={onDrawEvent}
              onChooseOption={onChooseEventOption}
              onApplyResources={onApplyEventResources}
              onClearActiveEvent={onClearActiveEvent}
              onClearDodged={onClearEventDodged}
            />
          </div>
          {currentShip && (
          <div className={activeTab === 'loan' ? '' : 'hidden'}>
            <LoanPanel
              ship={currentShip}
              onTakeLoan={onTakeLoan}
              onRepayLoan={onRepayLoan}
            />
          </div>
          )}
          {currentShip && (
          <div className={activeTab === 'trade' ? '' : 'hidden'}>
            <TradePanel
              factions={gameState.factions}
              ship={currentShip}
              factionPrices={gameState.factionPrices}
              factionSellMultipliers={gameState.factionSellMultipliers}
              blackMarketMultiplier={gameState.blackMarketMultiplier}
              buyStocks={gameState.buyStocks}
              sellDemands={gameState.sellDemands}
              buyBuffs={gameState.buyBuffs}
              sellBuffs={gameState.sellBuffs}
              factionPolicy={gameState.factionPolicy}
              policyRemainingTurns={gameState.policyRemainingTurns}
              onTravel={onTravelToFaction}
              onBuy={onBuySpecialty}
              onSell={onSellSpecialty}
              onExplore={onExploreFaction}
              onInvest={onInvestFaction}
              onGatherIntel={onGatherIntel}
              factionReputation={gameState.factionReputation || {}}
              factionContracts={gameState.factionContracts || []}
              currentTurn={gameState.turn}
              onAcceptContract={onAcceptContract}
              onCompleteContract={onCompleteContract}
              onBlackMarketBuy={onBlackMarketBuy}
            />
          </div>
          )}
          {currentShip && (
          <div className={activeTab === 'colony' ? '' : 'hidden'}>
            <ColonyPanel
              ship={currentShip}
              onUnlockColony={onUnlockColony}
              onSelectPlanet={onSelectPlanet}
              onRescrollPlanets={onRescrollPlanets}
              generateScoutingPool={generateScoutingPool}
              onBuild={onBuildColonyBuilding}
              onRecruitPop={onRecruitPop}
              onAssignPop={onAssignPop}
              onStartResearch={onStartResearch}
              onRecruitLeader={onRecruitLeader}
              onUpgradeLeader={onUpgradeLeader}
              onRollAndRecruit={onRollAndRecruit}
              onCancelBuilding={onCancelBuilding}
              onDemolishBuilding={onDemolishBuilding}
              onSelectWonder={onSelectWonder}
              onSubmitWonderResources={onSubmitWonderResources}
              onCompleteWonder={onCompleteWonder}
              canStartWonder={canStartWonder}
            />
          </div>
          )}
          <div className={activeTab === 'redeem' ? '' : 'hidden'}>
            <RedeemCode
              shipIndex={0}
              redeemedCodes={gameState.redeemedCodes}
              onRedeem={onRedeemCode}
            />
          </div>
          {currentShip && (
          <div className={activeTab === 'goldlog' ? '' : 'hidden'}>
            <GoldLogViewer
              goldLog={currentShip.goldLog}
              currentGold={currentShip.gold}
            />
          </div>
          )}
          {currentShip && (
          <div className={activeTab === 'module' ? '' : 'hidden'}>
            <ModulePanel
              ship={currentShip}
              onInstallModule={onInstallModule}
              onUseManualModule={onUseManualModule}
            />
          </div>
          )}
          <div className={activeTab === 'save' ? '' : 'hidden'}>
            <SaveManager
              onExport={onExportSave}
              onImport={onImportSave}
              onReset={onResetGame}
            />
          </div>
        </main>
      </div>

      {/* ==================== 移动端底部 Tab 栏 ==================== */}
      <nav className="fixed bottom-0 left-0 right-0 bg-slate-900/95 border-t border-slate-700/50 z-40 md:hidden flex items-center overflow-x-auto scrollbar-hide px-1 py-1 h-[60px]">
        {/* 结束回合按钮 */}
        <button
          onClick={() => setShowConfirmNext(true)}
          className="flex-shrink-0 flex flex-col items-center gap-0.5 px-2 py-1 rounded-md text-red-400 min-w-[48px] min-h-[48px] justify-center"
        >
          <Zap size={18} />
          <span className="text-[10px] font-bold whitespace-nowrap">结束</span>
        </button>
        {/* 移动端背景音乐开关 */}
        <button
          onClick={toggleMute}
          className={`flex-shrink-0 flex flex-col items-center gap-0.5 px-2 py-1 rounded-md transition-all min-w-[48px] min-h-[48px] justify-center ${
            bgmMuted ? 'text-slate-500' : 'text-cyan-400'
          }`}
        >
          {bgmMuted ? <VolumeX size={18} /> : <Volume2 size={18} />}
          <span className="text-[10px] font-bold whitespace-nowrap">{bgmMuted ? '静音' : '音乐'}</span>
        </button>
        {tabs.slice(0, 11).map((tab) => {
          const Icon = tab.icon;
          const isActive = activeTab === tab.id;
          return (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`flex-shrink-0 flex flex-col items-center gap-0.5 px-2 py-1 rounded-md transition-all min-w-[48px] min-h-[48px] justify-center ${
                isActive
                  ? 'text-cyan-400'
                  : 'text-slate-400'
              }`}
            >
              <Icon size={18} />
              <span className="text-[10px] font-bold whitespace-nowrap">{tab.shortLabel}</span>
            </button>
          );
        })}
        {/* 日志 */}
        <button
          onClick={() => setActiveTab('goldlog')}
          className={`flex-shrink-0 flex flex-col items-center gap-0.5 px-2 py-1 rounded-md transition-all min-w-[48px] min-h-[48px] justify-center ${
            activeTab === 'goldlog' ? 'text-cyan-400' : 'text-slate-400'
          }`}
        >
          <Receipt size={18} />
          <span className="text-[10px] font-bold whitespace-nowrap">日志</span>
        </button>
        {/* 存档 */}
        <button
          onClick={() => setActiveTab('save')}
          className={`flex-shrink-0 flex flex-col items-center gap-0.5 px-2 py-1 rounded-md transition-all min-w-[48px] min-h-[48px] justify-center ${
            activeTab === 'save' ? 'text-cyan-400' : 'text-slate-400'
          }`}
        >
          <Save size={18} />
          <span className="text-[10px] font-bold whitespace-nowrap">存档</span>
        </button>
      </nav>

      {/* ==================== 确认结束回合弹窗 ==================== */}
      {showConfirmNext && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 px-4">
          <div className="bg-slate-800 border border-slate-600 rounded-xl p-6 max-w-sm w-full shadow-2xl">
            <h3 className="text-lg font-bold text-white mb-3">确认结束回合？</h3>
            <p className="text-slate-400 text-sm mb-6">
              结束回合后，市场价格会波动，生产进度会推进，部分产品可能过期。
            </p>
            <div className="flex gap-3 justify-end">
              <button
                onClick={() => setShowConfirmNext(false)}
                className="px-4 py-2 bg-slate-700 hover:bg-slate-600 rounded text-sm font-bold text-slate-200"
              >
                取消
              </button>
              <button
                onClick={confirmNextTurn}
                className="px-4 py-2 bg-red-600 hover:bg-red-500 rounded text-sm font-bold text-white"
              >
                确认结束
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ==================== 总览面板 ====================
function OverviewTab({
  gameState,
  ship,
  getShipTotalAssets,
}: {
  gameState: GameState;
  ship: GameState['ships'][0] | undefined;
  getShipTotalAssets: (ship: GameState['ships'][0]) => number;
}) {
  if (!ship) return null;

  const assets = getShipTotalAssets(ship);
  const allianceActive = ship.allianceRounds && ship.allianceRounds > 0;
  const stockCount = Object.values(ship.stockHoldings).reduce((a, b) => a + b, 0);
  const matCount = Object.values(ship.materials).reduce((a, b) => a + b, 0);

  return (
    <div>
      <h2 className="text-xl md:text-2xl font-bold text-white mb-4 md:mb-6">舰队总览</h2>

      {/* 核心数据卡片 - 移动端2列，桌面4列 */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 md:gap-4 mb-4 md:mb-6">
        <div className="bg-slate-900/60 border border-slate-700 rounded-xl p-3 md:p-4">
          <p className="text-[10px] md:text-xs text-slate-500 mb-1">金币</p>
          <p className="text-lg md:text-xl font-bold text-yellow-400">{ship.gold.toLocaleString()}</p>
        </div>
        <div className="bg-slate-900/60 border border-slate-700 rounded-xl p-3 md:p-4">
          <p className="text-[10px] md:text-xs text-slate-500 mb-1">总资产</p>
          <p className="text-lg md:text-xl font-bold text-cyan-400">{assets.toLocaleString()}</p>
        </div>
        <div className="bg-slate-900/60 border border-slate-700 rounded-xl p-3 md:p-4">
          <p className="text-[10px] md:text-xs text-slate-500 mb-1">股票持仓</p>
          <p className="text-lg md:text-xl font-bold text-slate-200">{stockCount} 股</p>
        </div>
        <div className="bg-slate-900/60 border border-slate-700 rounded-xl p-3 md:p-4">
          <p className="text-[10px] md:text-xs text-slate-500 mb-1">产品库存</p>
          <p className="text-lg md:text-xl font-bold text-slate-200">{ship.products.length} 个</p>
        </div>
        {((ship.sellBonuses || []).length > 0 || (ship.sellPriceBonus || 0) > 0) && (
          <div className="bg-slate-900/60 border border-green-700/40 rounded-xl p-3 md:p-4">
            <p className="text-[10px] md:text-xs text-slate-500 mb-1">产品售价加成</p>
            {(ship.sellPriceBonus || 0) > 0 && (
              <p className="text-sm font-bold text-cyan-400">
                +{Math.round(ship.sellPriceBonus * 100)}% <span className="text-slate-500 font-normal">(银河之心技能·永久)</span>
              </p>
            )}
            {(ship.sellBonuses || []).map((b, i) => (
              <p key={i} className={`text-sm font-bold ${b.bonus > 0 ? 'text-green-400' : 'text-red-400'}`}>
                {b.bonus > 0 ? '+' : ''}{b.bonus}% <span className="text-slate-500 font-normal">({b.source}·{b.remainingTurns}回合)</span>
              </p>
            ))}
          </div>
        )}
      </div>

      {/* 进行中的合同 */}
      {(() => {
        const activeContracts = (gameState.factionContracts || []).filter((c) => c.accepted);
        if (activeContracts.length === 0) return null;
        return (
          <div className="mb-4 md:mb-6 bg-amber-900/20 border border-amber-700/30 rounded-xl p-3 md:p-4">
            <h3 className="text-xs text-amber-400 font-bold mb-3 flex items-center gap-2">
              <Receipt size={14} className="text-amber-400" /> 进行中的合同 ({activeContracts.length})
            </h3>
            <div className="space-y-2">
              {activeContracts.map((c) => {
                const pubFaction = gameState.factions.find((f) => f.id === c.factionId);
                let itemName = c.targetItemId;
                if (c.type === 'procurement') {
                  const r = RECIPES.find((rr) => rr.id === c.targetItemId);
                  if (r) itemName = r.productName;
                } else {
                  const targetF = gameState.factions.find((f) => f.id === c.targetItemId);
                  if (targetF) itemName = `${targetF.specialtyName}（${targetF.name}）`;
                }
                const remain = Math.max(0, c.expiresTurn - gameState.turn);
                return (
                  <div key={c.id} className="flex items-center gap-2 bg-slate-800/60 rounded-lg px-3 py-2">
                    <span className={`text-[10px] px-1.5 py-0.5 rounded font-bold flex-shrink-0 ${c.type === 'smuggling' ? 'bg-red-900/50 text-red-300' : 'bg-cyan-900/50 text-cyan-300'}`}>{c.type === 'smuggling' ? '走私' : '采购'}</span>
                    <div className="flex-1 min-w-0">
                      <span className="text-xs md:text-sm text-slate-200 font-bold">{itemName} ×{c.targetQty}</span>
                      <span className="text-[10px] md:text-xs text-slate-500 ml-2">← {pubFaction?.name || c.factionId}</span>
                    </div>
                    <span className={`text-[10px] md:text-xs flex-shrink-0 ${remain <= 2 ? 'text-red-400 font-bold' : 'text-slate-400'}`}>剩余 {remain} 回合</span>
                    <span className="text-[10px] md:text-xs text-slate-500 flex-shrink-0">{c.rewardGold > 0 ? `+${c.rewardGold}金 ` : ''}+{c.rewardRep}声望</span>
                  </div>
                );
              })}
            </div>
          </div>
        );
      })()}

      {/* 资源收支明细 */}
      {(() => {
        const t = gameState.turn;
        let crewFoodCost: number;
        if (t <= 5) crewFoodCost = 1; else if (t <= 10) crewFoodCost = 3;
        else if (t <= 15) crewFoodCost = 7; else if (t <= 20) crewFoodCost = 15;
        else if (t <= 25) crewFoodCost = 23; else if (t <= 30) crewFoodCost = 26;
        else crewFoodCost = t;
        const preserve = ship.relics.some((r) => r.id === 'r_007') ? 0.5 : 0;
        const actualCrewCost = Math.floor(crewFoodCost * (1 - preserve));
        // 母舰模块食物产出
        let modFood = 0;
        if (ship.installedModuleIds.includes('bio_kitchen')) modFood += 15;
        if (ship.installedModuleIds.includes('nano_farm')) modFood += 30;
        if (ship.installedModuleIds.includes('sixth_farm')) modFood += 60;
        // 殖民地数据
        let colFood = 0, colAlloy = 0, colStardust = 0, colGold = 0, colFoodCost = 0, colRP = 0;
        const colMats: Record<string, number> = {};
        if (ship.colony?.phase === 'active') {
          const c = ship.colony;
          const pd = c.planetType ? getPlanetById(c.planetType) : undefined;
          // 领袖加成映射
          const lbMap: Record<string, number> = {};
          let lAll = 0, lMat = 0;
          for (const l of c.leaders || []) {
            const ld = getLeaderDef(l.id);
            const bonuses = (ld?.levelBonuses[l.level-1] || {}) as Record<string, number>;
            for (const [bid, b] of Object.entries(bonuses)) {
              if (bid === 'ALL') lAll += b;
              else if (bid === 'ALL_MATERIAL') lMat += b;
              else lbMap[bid] = (lbMap[bid] || 0) + b;
            }
          }
          for (const inst of c.buildings) {
            if (!inst.active || inst.assignedPop <= 0) continue;
            const d = getBuildingDef(inst.defId);
            if (!d || !d.outputType) continue;
            const lb = ((lbMap[inst.defId]||0)+(d.category==='material'?lMat:0)+lAll)/100;
            const rl = c.techState?.repeatableLevels || {};
            let rp = 0;
            if (d.outputType === 'food') rp = (rl.RP_FOOD || 0) * 0.05;
            else if (d.outputType === 'alloy') rp = (rl.RP_ALLOY || 0) * 0.05;
            else if (d.outputType === 'stardust') rp = (rl.RP_STARDUST || 0) * 0.05;
            else if (d.outputType === 'gold') rp = (rl.RP_TRADE || 0) * 0.05;
            else if (d.outputType === 'material') rp = (rl.RP_MATERIAL || 0) * 0.05;
            else if (d.outputType === 'research') rp = (rl.RP_RESEARCH || 0) * 0.10;
            const base = (d.baseOutput||0)+(d.popFactor||0)*inst.assignedPop;
            if (d.outputType === 'food') { const pm = pd?.buffs.foodMult ? (pd.buffs.foodMult-1) : 0; colFood += Math.ceil(base*(1+pm+lb+rp)); }
            else if (d.outputType === 'alloy') { const pm = pd?.buffs.alloyMult ? (pd.buffs.alloyMult-1) : 0; colAlloy += Math.ceil(base*(1+pm+lb+rp)); }
            else if (d.outputType === 'stardust') { const pm = pd?.buffs.stardustMult ? (pd.buffs.stardustMult-1) : 0; colStardust += Math.ceil(base*(1+pm+lb+rp)); }
            else if (d.outputType === 'gold') { const o = Math.floor(((d.goldOutputMin||0)+(d.goldOutputMax||0))/2); colGold += Math.ceil(o*(1+lb+rp)); }
            else if (d.outputType === 'research') { colRP += Math.ceil(base*(1+lb+rp)); }
            else if (d.outputType === 'material' && d.outputMaterialId) {
              const pm = pd?.buffs.materialMults?.[d.outputMaterialId] ? (pd.buffs.materialMults[d.outputMaterialId]-1) : 0;
              colMats[d.outputMaterialId] = (colMats[d.outputMaterialId]||0) + Math.ceil(base*(1+pm+lb+rp));
            }
          }
          // 领袖特殊效果
          let lRP = 0, lDM = 0, lQ = 0, lSD = 0;
          for (const l of c.leaders || []) {
            const ex = getLeaderDef(l.id)?.levelExtras[l.level-1];
            if (ex?.researchPerTurn) lRP += Math.floor((ex.researchPerTurn[0]+ex.researchPerTurn[1])/2);
            if (ex?.darkMatterPerTurn) lDM += ex.darkMatterPerTurn;
            if (ex?.quantumPerTurn) lQ += ex.quantumPerTurn;
            if (ex?.stardustPerTurn) lSD += ex.stardustPerTurn;
          }
          colRP += lRP;
          colStardust += lSD;
          if (lDM>0) colMats['dark_matter'] = (colMats['dark_matter']||0) + lDM;
          if (lQ>0) colMats['quantum'] = (colMats['quantum']||0) + lQ;
          // 食物消耗含领袖减免
          let fpp = 3 + (pd?.buffs.foodConsumptionDelta || 0);
          for (const l of c.leaders || []) fpp += (getLeaderDef(l.id)?.levelExtras[l.level-1]?.foodConsumptionDelta || 0);
          colFoodCost = c.population.total * Math.max(1, fpp);
        }
        return (
          <div className="mb-4 bg-slate-900/60 border border-slate-700 rounded-xl p-3 md:p-4">
            <h3 className="text-xs text-amber-400 font-bold mb-3">资源收支</h3>
            <div className="grid grid-cols-2 gap-2 text-[10px] md:text-xs">
              <div><span className="text-slate-500">食物总产出:</span> <span className="text-green-400 font-bold">+{colFood+modFood}{modFood>0&&colFood>0?` (模块${modFood}+殖民${colFood})`:modFood>0?` (模块${modFood})`:colFood>0?` (殖民地${colFood})`:''}</span></div>
              <div><span className="text-slate-500">食物总消耗:</span> <span className="text-red-400 font-bold">-{actualCrewCost+colFoodCost}{colFoodCost>0?` (船员${actualCrewCost}+殖民${colFoodCost})`:` (船员)`}</span></div>
              <div><span className="text-slate-500">食物净增减:</span> <span className={(colFood+modFood - actualCrewCost - colFoodCost) >= 0 ? 'text-green-400 font-bold' : 'text-red-400 font-bold'}>{colFood+modFood - actualCrewCost - colFoodCost >= 0 ? '+' : ''}{colFood+modFood - actualCrewCost - colFoodCost}</span></div>
              <div><span className="text-slate-500">当前食物:</span> <span className={ship.food >= 0 ? 'text-green-400 font-bold' : 'text-red-400 font-bold'}>{ship.food}</span></div>
              {colAlloy > 0 && <div><span className="text-slate-500">合金产出:</span> <span className="text-slate-300 font-bold">+{colAlloy} (殖民地)</span></div>}
              {colStardust > 0 && <div><span className="text-slate-500">星尘产出:</span> <span className="text-purple-400 font-bold">+{colStardust}{ship.modules?.some(m => m.active && m.id === 'dyson_collector') ? ' + 3(母舰)' : ''} (殖民地)</span></div>}
              {colGold > 0 && <div><span className="text-slate-500">金币产出:</span> <span className="text-yellow-400 font-bold">+{colGold} (殖民地)</span></div>}
              {colRP > 0 && <div><span className="text-slate-500">科研产出:</span> <span className="text-cyan-400 font-bold">+{colRP} (殖民地)</span></div>}
              {(() => { const mc: Record<string,string> = { oil:'石油', gold_ore:'金矿', carbon:'碳块', dark_matter:'暗物质', quantum:'量子簇', silicon:'硅片' }; return Object.entries(colMats).map(([k,v]) => v>0 && <div key={k}><span className="text-slate-500">{mc[k]||k}:</span> <span className="text-amber-400 font-bold">+{v} (殖民地)</span></div>); })()}
            </div>
          </div>
        );
      })()}

      {/* 情报提示 */}
      {(ship.stockTipThisTurn || ship.matTipThisTurn || allianceActive) && (
        <div className="mb-4 md:mb-6 space-y-2">
          {ship.stockTipThisTurn && (
            <div className="flex items-center gap-2 bg-purple-900/30 border border-purple-700/40 rounded-lg px-3 py-2 md:px-4 md:py-2.5">
              <TrendingUp size={16} className="text-purple-400 flex-shrink-0" />
              <div>
                <span className="text-[10px] md:text-xs text-purple-400 font-semibold">股票情报</span>
                <p className="text-xs md:text-sm text-slate-200">{ship.stockTipThisTurn}</p>
              </div>
            </div>
          )}
          {ship.matTipThisTurn && (
            <div className="flex items-center gap-2 bg-green-900/30 border border-green-700/40 rounded-lg px-3 py-2 md:px-4 md:py-2.5">
              <Package size={16} className="text-green-400 flex-shrink-0" />
              <div>
                <span className="text-[10px] md:text-xs text-green-400 font-semibold">原料情报</span>
                <p className="text-xs md:text-sm text-slate-200">{ship.matTipThisTurn}</p>
              </div>
            </div>
          )}
          {allianceActive && (
            <div className="flex items-center gap-2 bg-blue-900/30 border border-blue-700/40 rounded-lg px-3 py-2 md:px-4 md:py-2.5">
              <Users size={16} className="text-blue-400 flex-shrink-0" />
              <div>
                <span className="text-[10px] md:text-xs text-blue-400 font-semibold">联盟加成</span>
                <p className="text-xs md:text-sm text-slate-200">产品售价+15%，剩余 {ship.allianceRounds} 回合</p>
              </div>
            </div>
          )}
        </div>
      )}

      {/* 遗物BUFF提示 */}
      {ship.relics.length > 0 && (
        <div className="mb-4 md:mb-6">
          <h3 className="text-[10px] md:text-xs text-slate-500 font-semibold uppercase tracking-wider mb-2">遗物BUFF</h3>
          <div className="space-y-2">
            {ship.relics.map((relic) => (
              <div key={relic.id} className="flex items-center gap-2 bg-purple-900/20 border border-purple-700/30 rounded-lg px-3 md:px-4 py-2">
                <Gem size={14} className="text-purple-400 flex-shrink-0" />
                <div>
                  <span className="text-[10px] md:text-xs text-purple-400 font-semibold">「{relic.name}」</span>
                  <p className="text-[10px] md:text-xs text-slate-400">{relic.effect}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* 星际贸易投资BUFF */}
      {ship.tradeStatus && Object.values(ship.tradeStatus.factionStates).some((fs) => fs.invested > 0) && (
        <div className="mb-4 md:mb-6">
          <h3 className="text-[10px] md:text-xs text-slate-500 font-semibold uppercase tracking-wider mb-2">星际贸易投资</h3>
          <div className="space-y-2">
            {Object.entries(ship.tradeStatus.factionStates).map(([fid, fState]) => {
              if (fState.invested <= 0) return null;
              const f = gameState.factions.find((fa) => fa.id === fid);
              if (!f) return null;
              const t = getInvestmentTier(fState.invested);
              return (
                <div key={fid} className="flex items-center gap-2 bg-blue-900/20 border border-blue-700/30 rounded-lg px-3 md:px-4 py-2">
                  <Globe size={14} className="text-blue-400 flex-shrink-0" />
                  <div>
                    <span className="text-[10px] md:text-xs text-blue-400 font-semibold">「{f.name}」</span>
                    <span className="text-[10px] md:text-xs text-slate-500 ml-1 md:ml-2">投资 {fState.invested.toLocaleString()} 金币</span>
                    {t > 0 && <p className="text-[10px] md:text-xs text-green-400">{getBuffDescription(t)}</p>}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* 舰队信息 */}
      <div className="bg-slate-900/60 border border-cyan-700/30 rounded-xl p-4 md:p-5 mb-6 md:mb-8">
        <div className="flex items-center gap-3 mb-3 md:mb-4">
          <Rocket size={20} className="text-cyan-400" />
          <h3 className="text-base md:text-lg font-bold text-slate-100">{ship.name}</h3>
          <span className="text-[10px] bg-cyan-600/30 text-cyan-400 px-2 py-0.5 rounded">操作中</span>
        </div>
        <div className="grid grid-cols-2 md:grid-cols-3 gap-3 md:gap-4 text-sm">
          <div>
            <p className="text-xs text-slate-500">技能</p>
            <p className="text-cyan-400 font-semibold text-sm">{ship.skill.name}</p>
            <p className="text-[10px] md:text-xs text-slate-500 mt-1">{ship.skill.description}</p>
          </div>
          <div>
            <p className="text-xs text-slate-500">原料库存</p>
            <p className="text-slate-300">{matCount} 单位</p>
          </div>
          <div>
            <p className="text-xs text-slate-500">生产中</p>
            <p className="text-slate-300">{ship.productionQueue.length} 项</p>
          </div>
        </div>
      </div>

      {/* 最近事件 */}
      {gameState.eventLog.length > 0 && (
        <div>
          <h3 className="text-base md:text-lg font-bold text-slate-200 mb-2 md:mb-3">事件记录</h3>
          <div className="bg-slate-900/60 border border-slate-700 rounded-xl p-3 md:p-4 max-h-60 overflow-auto">
            {gameState.eventLog.slice(0, 20).map((log, idx) => (
              <div key={idx} className="text-xs md:text-sm border-b border-slate-800 pb-2 mb-2 last:border-0 last:pb-0 last:mb-0">
                <span className="text-slate-500">第{log.turn}回合</span>
                <span className="text-purple-400 mx-1 md:mx-2">{log.event}</span>
                <span className="text-slate-400">{log.detail}</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
