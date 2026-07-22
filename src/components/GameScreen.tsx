import { useState } from 'react';
import type { GameState, EventOption, ResourceChange, ChoiceEvent } from '@/types/game';
import type { DodgeReason } from '@/hooks/useEvent';
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
import GoldLogViewer from './GoldLogViewer';
import ModulePanel from './ModulePanel';

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
  onInstallModule: (moduleId: string) => { success: boolean; message: string };
  onUseManualModule: (moduleId: string) => { success: boolean; message: string };
  onBuyAlloy: (type: 'gold' | 'stardust', qty: number) => boolean;
  onBuyFood: (type: 'gold' | 'alloy', qty: number) => boolean;
  onBuyRelic: (relicId: string) => { success: boolean; message: string };
  onRedeemCode: (shipIndex: number, code: string) => { success: boolean; message: string };
  onExportSave: () => boolean;
  onImportSave: (file: File) => Promise<boolean>;
  onResetGame: () => void;
  getShipTotalAssets: (ship: GameState['ships'][0]) => number;
}

type TabId = 'overview' | 'stocks' | 'materials' | 'production' | 'products' | 'events' | 'loan' | 'trade' | 'module' | 'redeem' | 'goldlog' | 'save';

const tabs: { id: TabId; label: string; shortLabel: string; icon: React.ElementType }[] = [
  { id: 'overview', label: '总览', shortLabel: '总览', icon: LayoutDashboard },
  { id: 'stocks', label: '股票', shortLabel: '股票', icon: TrendingUp },
  { id: 'materials', label: '原料', shortLabel: '原料', icon: Package },
  { id: 'production', label: '生产', shortLabel: '生产', icon: Factory },
  { id: 'products', label: '集会', shortLabel: '集会', icon: ShoppingCart },
  { id: 'events', label: '事件', shortLabel: '事件', icon: Sparkles },
  { id: 'loan', label: '贷款', shortLabel: '贷款', icon: Banknote },
  { id: 'trade', label: '贸易', shortLabel: '贸易', icon: Globe },
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
  onInstallModule,
  onUseManualModule,
  onBuyAlloy,
  onBuyFood,
  onBuyRelic,
  onRedeemCode,
  onExportSave,
  onImportSave,
  onResetGame,
  getShipTotalAssets,
}: GameScreenProps) {
  const [activeTab, setActiveTab] = useState<TabId>('overview');
  const [showConfirmNext, setShowConfirmNext] = useState(false);

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
        </aside>

        {/* ===== 主内容区 ===== */}
        <main className="flex-1 p-3 md:p-6 overflow-auto min-h-[calc(100vh-120px)] md:min-h-[calc(100vh-60px)]">
          {activeTab === 'overview' && (
            <OverviewTab gameState={gameState} ship={currentShip} getShipTotalAssets={getShipTotalAssets} />
          )}
          {activeTab === 'stocks' && (
            <StockMarket
              stocks={gameState.stocks}
              ship={currentShip}
              shipIndex={0}
              currentTurn={gameState.turn}
              onBuy={onBuyStock}
              onSell={onSellStock}
            />
          )}
          {activeTab === 'materials' && (
            <MaterialMarket
              materials={gameState.materials}
              ship={currentShip}
              shipIndex={0}
              onBuy={onBuyMaterial}
            />
          )}
          {activeTab === 'production' && (
            <ProductionPanel
              ship={currentShip}
              shipIndex={0}
              materials={gameState.materials}
              onStartProduction={onStartProduction}
            />
          )}
          {activeTab === 'products' && (
            <ProductMarket
              ship={currentShip}
              shipIndex={0}
              products={gameState.products}
              materials={gameState.materials}
              stardustMarket={gameState.stardustMarket}
              onSellQty={onSellProductQty}
              onBuyRelic={onBuyRelic}
              onBuyAlloy={onBuyAlloy}
              onBuyFood={onBuyFood}
            />
          )}
          {activeTab === 'events' && (
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
          )}
          {activeTab === 'loan' && currentShip && (
            <LoanPanel
              ship={currentShip}
              onTakeLoan={onTakeLoan}
              onRepayLoan={onRepayLoan}
            />
          )}
          {activeTab === 'trade' && currentShip && (
            <TradePanel
              factions={gameState.factions}
              ship={currentShip}
              factionPrices={gameState.factionPrices}
              factionSellMultipliers={gameState.factionSellMultipliers}
              factionPolicy={gameState.factionPolicy}
              policyRemainingTurns={gameState.policyRemainingTurns}
              onTravel={onTravelToFaction}
              onBuy={onBuySpecialty}
              onSell={onSellSpecialty}
              onExplore={onExploreFaction}
              onInvest={onInvestFaction}
              onGatherIntel={onGatherIntel}
            />
          )}
          {activeTab === 'redeem' && (
            <RedeemCode
              shipIndex={0}
              redeemedCodes={gameState.redeemedCodes}
              onRedeem={onRedeemCode}
            />
          )}
          {activeTab === 'goldlog' && currentShip && (
            <GoldLogViewer
              goldLog={currentShip.goldLog}
              currentGold={currentShip.gold}
            />
          )}
          {activeTab === 'module' && currentShip && (
            <ModulePanel
              ship={currentShip}
              onInstallModule={onInstallModule}
              onUseManualModule={onUseManualModule}
            />
          )}
          {activeTab === 'save' && (
            <SaveManager
              onExport={onExportSave}
              onImport={onImportSave}
              onReset={onResetGame}
            />
          )}
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
