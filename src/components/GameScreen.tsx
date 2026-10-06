import { useState, useEffect, useMemo, useRef } from 'react';
import type { GameState, EventOption, ResourceChange, ChoiceEvent } from '@/types/game';
import type { BattleAction, BattleExpedition, BattleFleet, BattleState, PirateBossId, ShipCardId } from '@/types/battle';
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
  Home,
  Landmark,
  Warehouse,
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
import GalaxyMapPanel from './GalaxyMapPanel';
import ArchaeologyPanel from './ArchaeologyPanel';
import { getContractItemName, getContractItemKind, getContractHeldCount, getContractEarliestExpiry, getContractRequiredTotals, getContractRemainingTurns } from '@/lib/turn/contracts';
import { getSellPriceBreakdown } from '@/data/modules';
import { getShipPerTurnIncome, sumShipIncome, getDynamicIncomeLines } from '@/lib/turn/shipIncome';
import { BGM_MUTED_KEY } from '@/lib/save';
import GoldLogViewer from './GoldLogViewer';
import ModulePanel from './ModulePanel';
import ColonyPanel from './colony/ColonyPanel';
import BattleTab from './battle/BattleTab';
import HangarTab from './hangar/HangarTab';
import { computeColonyEconomy, getBuildingSourceBreakdown } from '@/lib/colony/economy';
import { computeCrewFoodCost, famineHalveGold } from '@/lib/turn/shipTurn';
import { getNextTurnHints } from '@/lib/turn/nextTurnHints';
import { MATERIAL_NAME_MAP } from '@/data/materialNames';

// 背景音乐曲目列表（放 public/ 目录下，按顺序自动循环播放）
const BGM_LIST = ['/bgm1.mp3', '/bgm2.mp3', '/bgm3.mp3'];
const BGM_VOLUME = 0.3;

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
  onLogEvent: (event: string, detail: string) => void;
  onClearActiveEvent: () => void;
  onClearEventDodged: () => void;
  onTakeLoan: (principal: number, plan: { turns: number; rate: number }) => { success: boolean; message: string };
  onRepayLoan: (loanId: string) => { success: boolean; message: string };
  onTravelToNode: (targetNodeId: string) => { success: boolean; message: string };
  onBuySpecialty: (quantity: number) => { success: boolean; message: string };
  onSellSpecialty: (factionId: string, quantity: number) => { success: boolean; message: string };
  onExploreFaction: () => { success: boolean; message: string };
  onInvestFaction: (amount: number) => { success: boolean; message: string };
  onGatherIntel: () => { success: boolean; message: string; goldChange: number };
  onAcceptContract: (contractId: string) => { success: boolean; message: string };
  onCompleteContract: (contractId: string) => { success: boolean; message: string };
  onBlackMarketBuy: (factionId: string, itemId: string, qty: number) => { success: boolean; message: string };
  onStartExcavation: (siteId: string, leaderId: string) => { success: boolean; message: string };
  onContinueExcavation: (siteId: string) => { success: boolean; message: string };
  onResolveExcavationChoice: (siteId: string, kind: 'safe' | 'risky') => { success: boolean; message: string };
  onSteadyExcavation: (siteId: string) => { success: boolean; message: string };
  onChangeExcavationLeader: (siteId: string, leaderId: string) => { success: boolean; message: string };
  onAbandonExcavation: (siteId: string) => { success: boolean; message: string };
  onInstallModule: (moduleId: string) => { success: boolean; message: string };
  onUseManualModule: (moduleId: string) => { success: boolean; message: string };
  onFoundColony: (nodeId: string, name: string) => { success: boolean; message: string };
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
  onStartExpedition: (leaderId: string) => { success: boolean; message: string };
  onPayExpeditionNode: () => { success: boolean; message: string };
  onUnlockUltimate: (leaderId: string) => { success: boolean; message: string };
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
  // ===== 舰船卡牌战斗（V1.5 §10）：只接「战斗」页签用 =====
  battle: BattleState | null;
  /** 进行中的出征（先用 fleetExpedition 命名，避免与殖民地领袖远征混淆） */
  fleetExpedition: BattleExpedition | null;
  fleets: BattleFleet[];
  cardLibrary: ShipCardId[];
  /** 发起舰队出征（START_EXPEDITION）；与殖民地领袖远征的 onStartExpedition 是两回事（V1.5 §10.1） */
  onStartBattleExpedition: (bossId: PirateBossId, fleetId: string, turns: number) => void;
  /** 取消在途的舰队出征（CANCEL_EXPEDITION） */
  onCancelBattleExpedition: () => void;
  /** **阶段 B 的「开战」**（START_RAID_BATTLE）：全场唯一由玩家主动点开的战斗入口。
   *  ⚠ 故意做成**无参窄回调** —— 目标（'raid'）/ 编制（防守合并池）/ seed 全由 reducer 侧的
   *  lib/battle/raid.readyRaidBattle 组装，UI 不持有"随便开一场战斗"的能力。 */
  onStartRaidBattle: () => void;
  onBattleAction: (action: BattleAction) => void;
  onEndBattle: () => void;
  onCreateBattleFleet: (name?: string) => void;
  // ===== 船坞与造舰（V1.5 §8.2 / §8.3）：只接「机库」页签的船坞面板 =====
  /** 下单建造一艘战舰（ENQUEUE_BUILD；门槛与扣费走 shipyard.canEnqueue + resourceCost.payCost） */
  onEnqueueBuild: (cardId: ShipCardId) => void;
  /** 取消未开工的排队项（CANCEL_BUILD，入参是队列下标） */
  onCancelBuild: (index: number) => void;
  // ===== 机库（V1.5 §10.1：卡库 / 舰队 / 编成）只接「机库」页签 =====
  /** 删除一支舰队（DELETE_BATTLE_FLEET；出征中的舰队由 reducer 守卫拦住） */
  onDeleteBattleFleet: (fleetId: string) => void;
  onRenameBattleFleet: (fleetId: string, name: string) => void;
  onAddShipToFleet: (fleetId: string, shipId: ShipCardId) => void;
  onRemoveShipFromFleet: (fleetId: string, shipId: ShipCardId) => void;
  onToggleFleetDefending: (fleetId: string) => void;
}

type TabId = 'overview' | 'stocks' | 'materials' | 'production' | 'products' | 'events' | 'loan' | 'trade' | 'galaxy' | 'battle' | 'hangar' | 'archaeology' | 'colony' | 'module' | 'redeem' | 'goldlog' | 'save';

// 空引用常量：避免每次渲染新建 {} / [] 击穿内嵌面板的 memo
const EMPTY_REPUTATION: Record<string, number> = {};
const EMPTY_CONTRACTS: NonNullable<GameState['factionContracts']> = [];

const tabs: { id: TabId; label: string; shortLabel: string; icon: React.ElementType }[] = [
  { id: 'overview', label: '总览', shortLabel: '总览', icon: LayoutDashboard },
  { id: 'galaxy', label: '星图', shortLabel: '星图', icon: Globe },
  { id: 'stocks', label: '股票', shortLabel: '股票', icon: TrendingUp },
  { id: 'materials', label: '原料', shortLabel: '原料', icon: Package },
  { id: 'production', label: '生产', shortLabel: '生产', icon: Factory },
  { id: 'products', label: '集会', shortLabel: '集会', icon: ShoppingCart },
  { id: 'events', label: '事件', shortLabel: '事件', icon: Sparkles },
  { id: 'loan', label: '贷款', shortLabel: '贷款', icon: Banknote },
  { id: 'trade', label: '贸易', shortLabel: '贸易', icon: Coins },
  { id: 'battle', label: '战斗', shortLabel: '战斗', icon: Swords },
  { id: 'hangar', label: '机库', shortLabel: '机库', icon: Warehouse },
  { id: 'archaeology', label: '考古', shortLabel: '考古', icon: Landmark },
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
  onLogEvent,
  onClearActiveEvent,
  onClearEventDodged,
  onTakeLoan,
  onRepayLoan,
  onTravelToNode,
  onBuySpecialty,
  onSellSpecialty,
  onExploreFaction,
  onInvestFaction,
  onGatherIntel,
  onAcceptContract,
  onCompleteContract,
  onBlackMarketBuy,
  onStartExcavation,
  onContinueExcavation,
  onResolveExcavationChoice,
  onSteadyExcavation,
  onChangeExcavationLeader,
  onAbandonExcavation,
  onInstallModule,
  onUseManualModule,
  onFoundColony,
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
  onStartExpedition,
  onPayExpeditionNode,
  onUnlockUltimate,
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
  battle,
  fleetExpedition,
  fleets,
  cardLibrary,
  onStartBattleExpedition,
  onCancelBattleExpedition,
  onStartRaidBattle,
  onBattleAction,
  onEndBattle,
  onCreateBattleFleet,
  onEnqueueBuild,
  onCancelBuild,
  onDeleteBattleFleet,
  onRenameBattleFleet,
  onAddShipToFleet,
  onRemoveShipFromFleet,
  onToggleFleetDefending,
}: GameScreenProps) {
  const [activeTab, setActiveTab] = useState<TabId>('overview');
  const [showConfirmNext, setShowConfirmNext] = useState(false);
  // 下一回合预告（唯一真值 lib/turn/nextTurnHints；确认弹窗与总览共用同一份）
  const nextHints = useMemo(() => getNextTurnHints(gameState), [gameState]);
  const [bgmMuted, setBgmMuted] = useState(() => localStorage.getItem(BGM_MUTED_KEY) === 'true');
  const bgmRef = useRef<HTMLAudioElement | null>(null);
  const bgmIndexRef = useRef(0);

  // ==================== 移动端底栏：横向滚动的页签条 ====================
  const tabStripRef = useRef<HTMLDivElement | null>(null);
  /** 右侧是否还有未显示的页签（决定是否画右缘渐隐提示） */
  const [tabStripMoreRight, setTabStripMoreRight] = useState(false);
  const updateTabStripOverflow = () => {
    const el = tabStripRef.current;
    if (!el) return;
    // 留 2px 容差：亚像素宽度下 scrollLeft 取整会误判"已到底"
    setTabStripMoreRight(el.scrollLeft + el.clientWidth < el.scrollWidth - 2);
  };
  // 切页签时把当前项滚进视野（否则可能是从别处跳回，当前页签在屏幕外）
  useEffect(() => {
    const el = tabStripRef.current;
    if (!el) return;
    const active = el.querySelector<HTMLElement>('[data-tab-active="true"]');
    active?.scrollIntoView({ inline: 'center', block: 'nearest', behavior: 'smooth' });
    updateTabStripOverflow();
  }, [activeTab]);
  // 首次挂载与窗口尺寸变化时重算渐隐提示
  useEffect(() => {
    updateTabStripOverflow();
    window.addEventListener('resize', updateTabStripOverflow);
    return () => window.removeEventListener('resize', updateTabStripOverflow);
  }, []);

  // 背景音乐：多首曲目按顺序自动循环，首次用户交互时启动
  useEffect(() => {
    if (bgmRef.current) return;
    const audio = new Audio();
    audio.volume = BGM_VOLUME;
    bgmRef.current = audio;

    // 播放指定索引的曲目
    const playTrack = (index: number) => {
      const i = ((index % BGM_LIST.length) + BGM_LIST.length) % BGM_LIST.length;
      bgmIndexRef.current = i;
      audio.src = BGM_LIST[i];
      audio.play().catch(() => {});
    };

    // 一首播完自动切下一首（循环）
    audio.addEventListener('ended', () => playTrack(bgmIndexRef.current + 1));
    // 预加载第一首，等首次交互再播放
    audio.src = BGM_LIST[0];

    const startOnInteraction = () => {
      if (localStorage.getItem(BGM_MUTED_KEY) !== 'true') {
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
    localStorage.setItem(BGM_MUTED_KEY, String(next));
  };

  const currentShip = gameState.ships[0];
  const totalAssets = currentShip ? getShipTotalAssets(currentShip) : 0;

  // 贸易面板数据：useMemo 保持引用稳定，避免每次渲染击穿 TradePanel 的 memo
  const tradePanelProps = useMemo(() => {
    if (!currentShip) return null;
    return {
      factions: gameState.factions,
      ship: currentShip,
      factionPrices: gameState.factionPrices,
      factionSellMultipliers: gameState.factionSellMultipliers,
      blackMarketMultiplier: gameState.blackMarketMultiplier,
      buyStocks: gameState.buyStocks,
      sellDemands: gameState.sellDemands,
      buyBuffs: gameState.buyBuffs,
      sellBuffs: gameState.sellBuffs,
      factionPolicy: gameState.factionPolicy,
      policyRemainingTurns: gameState.policyRemainingTurns,
      onTravel: onTravelToNode,
      onBuy: onBuySpecialty,
      onSell: onSellSpecialty,
      onExplore: onExploreFaction,
      onInvest: onInvestFaction,
      onGatherIntel: onGatherIntel,
      factionReputation: gameState.factionReputation || EMPTY_REPUTATION,
      factionContracts: gameState.factionContracts || EMPTY_CONTRACTS,
      currentTurn: gameState.turn,
      onAcceptContract: onAcceptContract,
      onCompleteContract: onCompleteContract,
      onBlackMarketBuy: onBlackMarketBuy,
    };
  }, [currentShip, gameState, onTravelToNode, onBuySpecialty, onSellSpecialty, onExploreFaction, onInvestFaction, onGatherIntel, onAcceptContract, onCompleteContract, onBlackMarketBuy]);

  const confirmNextTurn = () => {
    setShowConfirmNext(false);
    onNextTurn();
  };

  return (
    <div className="min-h-screen bg-gradient-to-b from-slate-950 via-indigo-950 to-slate-950 text-slate-100 pb-[68px] md:pb-0">
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
            <OverviewTab gameState={gameState} ship={currentShip} getShipTotalAssets={getShipTotalAssets} nextHints={nextHints} />
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
              eventLog={gameState.eventLog}
              shipFood={currentShip?.food ?? 0}
              currentTurn={gameState.turn}
              eventTriggeredThisTurn={currentShip?.eventTriggeredThisTurn || false}
              onDrawEvent={onDrawEvent}
              onChooseOption={onChooseEventOption}
              onApplyResources={onApplyEventResources}
              onLogEvent={onLogEvent}
              onClearActiveEvent={onClearActiveEvent}
              onClearDodged={onClearEventDodged}
            />
          </div>
          {currentShip && (
          <div className={activeTab === 'loan' ? '' : 'hidden'}>
            <LoanPanel
              ship={currentShip}
              gameState={gameState}
              onTakeLoan={onTakeLoan}
              onRepayLoan={onRepayLoan}
            />
          </div>
          )}
          {currentShip && tradePanelProps && (
          <div className={activeTab === 'trade' ? '' : 'hidden'}>
            <TradePanel {...tradePanelProps} hideTravelActions />
          </div>
          )}
          {currentShip && (
          <div className={activeTab === 'galaxy' ? '' : 'hidden'}>
            <GalaxyMapPanel
              ship={currentShip}
              factionReputation={gameState.factionReputation || EMPTY_REPUTATION}
              onTravelToNode={onTravelToNode}
            />
          </div>
          )}
          {currentShip && (
          <div className={activeTab === 'archaeology' ? '' : 'hidden'}>
            <ArchaeologyPanel
              ship={currentShip}
              onStartExcavation={onStartExcavation}
              onContinueExcavation={onContinueExcavation}
              onResolveChoice={onResolveExcavationChoice}
              onSteadyExcavation={onSteadyExcavation}
              onChangeLeader={onChangeExcavationLeader}
              onAbandonExcavation={onAbandonExcavation}
            />
          </div>
          )}
          {/* ===== 战斗页签（V1.5 §10）=====
               没有进行中的战斗 → 「出征」（只列已探明的老巢）+ 选出征舰队；掠夺**阶段 B** 时另有
               一个「开战」入口（迎战已抵达的掠夺队，唯一由玩家主动点开的战斗）；
               有战斗 → 整屏战斗界面（照搬卡牌 DEMO）。
               ⚠ 没有"直接开战"这种凭空开一场的入口：出征战由 useTurn 在倒计时归零时自动开。
               所有回调都来自 useStableActions 的稳定引用（AGENTS 第五节），不在 JSX 里写 inline 箭头。 */}
          <div className={activeTab === 'battle' ? '' : 'hidden'}>
            <BattleTab
              battle={battle}
              expedition={fleetExpedition}
              fleets={fleets}
              cardLibrary={cardLibrary}
              state={gameState}
              onStartExpedition={onStartBattleExpedition}
              onStartRaidBattle={onStartRaidBattle}
              onCancelExpedition={onCancelBattleExpedition}
              onAction={onBattleAction}
              onEndBattle={onEndBattle}
              onCreateFleet={onCreateBattleFleet}
            />
          </div>
          {/* ===== 机库页签（V1.5 §10.1）=====
               卡库（卡面网格 + 总览 + 技能详情固定区域）/ 舰队列表（编成·改名·删除·防守标签·出征中标记）
               / 选中舰队的编成界面。回调全部来自 useStableActions 的稳定引用（AGENTS 第五节）。 */}
          <div className={activeTab === 'hangar' ? '' : 'hidden'}>
            <HangarTab
              state={gameState}
              fleets={fleets}
              cardLibrary={cardLibrary}
              expedition={fleetExpedition}
              onCreateFleet={onCreateBattleFleet}
              onDeleteFleet={onDeleteBattleFleet}
              onRenameFleet={onRenameBattleFleet}
              onAddShip={onAddShipToFleet}
              onRemoveShip={onRemoveShipFromFleet}
              onToggleDefending={onToggleFleetDefending}
              onEnqueueBuild={onEnqueueBuild}
              onCancelBuild={onCancelBuild}
            />
          </div>
          {currentShip && (
          <div className={activeTab === 'colony' ? '' : 'hidden'}>
            <ColonyPanel
              ship={currentShip}
              onFoundColony={onFoundColony}
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
              onStartExpedition={onStartExpedition}
              onPayExpeditionNode={onPayExpeditionNode}
              onUnlockUltimate={onUnlockUltimate}
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

      {/* ==================== 移动端底部 Tab 栏 ====================
          全部页签都要渲染（曾用 tabs.slice(0, 11) 导致"改造/兑换"根本不出现）；
          结构 = **单行**：「结束回合 / 音乐」钉在左侧不动（每回合都要点的按钮永远在拇指位），
          右侧 15 个页签横向滚动 + 可见拖动条（切页签会自动把它滚进视野，右缘有渐隐提示"还有"）。
          栏高恒为一行（≈64px），配合根容器 pb-[68px] 留位；nav 自身带 env(safe-area-inset-bottom)
          以避开 iPhone 底部横条。
          ⚠ 别改回 flex-wrap + min-w：375/390px 机型会排成多行（曾排到 140px）压住内容。 */}
      <nav className="fixed bottom-0 left-0 right-0 bg-slate-900/95 border-t border-slate-700/50 z-40 md:hidden pb-[env(safe-area-inset-bottom)]">
        <div className="flex items-stretch py-1 pl-1">
          {/* 钉住区：结束回合 + 音乐（不参与横向滚动） */}
          <div className="flex shrink-0 gap-0.5 pr-1 mr-1 border-r border-slate-700/60">
            <button
              onClick={() => setShowConfirmNext(true)}
              className="w-[52px] flex flex-col items-center justify-center gap-0.5 py-1 rounded-md text-red-400 min-h-[44px]"
            >
              <Zap size={18} />
              <span className="text-[10px] font-bold whitespace-nowrap">结束</span>
            </button>
            <button
              onClick={toggleMute}
              className={`w-[52px] flex flex-col items-center justify-center gap-0.5 py-1 rounded-md transition-all min-h-[44px] ${
                bgmMuted ? 'text-slate-500' : 'text-cyan-400'
              }`}
            >
              {bgmMuted ? <VolumeX size={18} /> : <Volume2 size={18} />}
              <span className="text-[10px] font-bold whitespace-nowrap">{bgmMuted ? '静音' : '音乐'}</span>
            </button>
          </div>
          {/* 滚动区：15 个页签（56px/个，一屏约 6~7 个；**全部渲染**，靠横向拖动到达） */}
          <div className="relative flex-1 min-w-0">
            <div
              ref={tabStripRef}
              onScroll={updateTabStripOverflow}
              className="flex gap-0.5 overflow-x-auto scroll-smooth pr-6 pb-1 [scrollbar-width:thin] [&::-webkit-scrollbar]:h-1.5 [&::-webkit-scrollbar-track]:bg-slate-800/40 [&::-webkit-scrollbar-thumb]:bg-slate-600 [&::-webkit-scrollbar-thumb]:rounded-full"
            >
              {tabs.map((tab) => {
                const Icon = tab.icon;
                const isActive = activeTab === tab.id;
                return (
                  <button
                    key={tab.id}
                    onClick={() => setActiveTab(tab.id)}
                    data-tab-active={isActive ? 'true' : undefined}
                    className={`w-14 shrink-0 flex flex-col items-center justify-center gap-0.5 py-1 rounded-md transition-all min-h-[44px] ${
                      isActive
                        ? 'text-cyan-400 bg-cyan-600/15'
                        : 'text-slate-400'
                    }`}
                  >
                    <Icon size={18} />
                    <span className="text-[10px] font-bold whitespace-nowrap">{tab.shortLabel}</span>
                  </button>
                );
              })}
            </div>
            {/* 右缘渐隐：只在右边还有内容时出现，提示"可以拖" */}
            {tabStripMoreRight && (
              <div className="pointer-events-none absolute inset-y-0 right-0 w-6 bg-gradient-to-l from-slate-900 to-transparent" />
            )}
          </div>
        </div>
      </nav>

      {/* ==================== 确认结束回合弹窗 ==================== */}
      {showConfirmNext && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 px-4">
          <div className="bg-slate-800 border border-slate-600 rounded-xl p-6 max-w-sm w-full shadow-2xl">
            <h3 className="text-lg font-bold text-white mb-3">确认结束回合？</h3>
            {/* 下一回合预告：按严重度分组（危险会掉资源 / 提醒会错过机会 / 信息是进度播报） */}
            <div className="space-y-3 mb-5 max-h-[45vh] md:max-h-[50vh] overflow-y-auto pr-1">
              {([
                { sev: 'danger', title: '需要注意', color: 'text-red-300', dot: 'bg-red-400' },
                { sev: 'warn', title: '提醒', color: 'text-amber-300', dot: 'bg-amber-400' },
                { sev: 'info', title: '预告', color: 'text-slate-400', dot: 'bg-slate-500' },
              ] as const).map((g) => {
                const items = nextHints.filter((h) => h.severity === g.sev);
                if (items.length === 0) return null;
                return (
                  <div key={g.sev}>
                    <p className={`text-[11px] font-bold mb-1 ${g.color}`}>{g.title}</p>
                    <ul className="space-y-1">
                      {items.map((h) => (
                        <li key={h.id} className="flex gap-1.5 text-xs md:text-sm text-slate-300">
                          <span className={`mt-[6px] w-1.5 h-1.5 rounded-full flex-shrink-0 ${g.dot}`} />
                          <span>{h.text}</span>
                        </li>
                      ))}
                    </ul>
                  </div>
                );
              })}
            </div>
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
  nextHints,
}: {
  gameState: GameState;
  ship: GameState['ships'][0] | undefined;
  getShipTotalAssets: (ship: GameState['ships'][0]) => number;
  /** 下一回合预告（唯一真值 lib/turn/nextTurnHints，与确认弹窗同一份） */
  nextHints: ReturnType<typeof getNextTurnHints>;
}) {
  if (!ship) return null;

  const assets = getShipTotalAssets(ship);
  const allianceActive = ship.allianceRounds && ship.allianceRounds > 0;
  const stockCount = Object.values(ship.stockHoldings).reduce((a, b) => a + b, 0);
  const matCount = Object.values(ship.materials).reduce((a, b) => a + b, 0);
  // 售价加成明细（单一真值：data/modules.ts → getSellPriceBreakdown）
  const sellBd = getSellPriceBreakdown(ship);

  return (
    <div>
      <h2 className="text-xl md:text-2xl font-bold text-white mb-4 md:mb-6">舰队总览</h2>

      {/* 下一回合预告（读 lib/turn/nextTurnHints；与「确认结束回合」弹窗同一份提示） */}
      {nextHints.length > 0 && (
        <div className="bg-slate-900/60 border border-slate-700 rounded-xl p-3 md:p-4 mb-4 md:mb-6">
          <p className="text-xs md:text-sm font-bold text-slate-200 mb-2">下回合预告</p>
          <ul className="space-y-1">
            {nextHints.slice(0, 6).map((h) => (
              <li key={h.id} className="flex gap-1.5 text-xs md:text-sm">
                <span className={`mt-[6px] w-1.5 h-1.5 rounded-full flex-shrink-0 ${h.severity === 'danger' ? 'bg-red-400' : h.severity === 'warn' ? 'bg-amber-400' : 'bg-slate-500'}`} />
                <span className={h.severity === 'danger' ? 'text-red-300' : h.severity === 'warn' ? 'text-amber-200' : 'text-slate-400'}>{h.text}</span>
              </li>
            ))}
          </ul>
          {nextHints.length > 6 && (
            <p className="text-[10px] text-slate-500 mt-2">另有 {nextHints.length - 6} 条提示，结束回合前会完整列出。</p>
          )}
        </div>
      )}

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
        {sellBd.multiplier > 1 && (
          <div className="bg-slate-900/60 border border-green-700/40 rounded-xl p-3 md:p-4">
            <p className="text-[10px] md:text-xs text-slate-500 mb-1">产品售价加成</p>
            {sellBd.skillPercent > 0 && (
              <p className="text-sm font-bold text-cyan-400">
                +{sellBd.skillPercent}% <span className="text-slate-500 font-normal">(银河之心技能·永久)</span>
              </p>
            )}
            {(ship.sellBonuses || []).map((b, i) => (
              <p key={i} className={`text-sm font-bold ${b.bonus > 0 ? 'text-green-400' : 'text-red-400'}`}>
                {b.bonus > 0 ? '+' : ''}{b.bonus}% <span className="text-slate-500 font-normal">({b.source}·{b.remainingTurns}回合)</span>
              </p>
            ))}
            {sellBd.alliancePercent > 0 && (
              <p className="text-sm font-bold text-purple-400">
                +{sellBd.alliancePercent}% <span className="text-slate-500 font-normal">(联盟·{ship.allianceRounds}回合)</span>
              </p>
            )}
          </div>
        )}
      </div>

      {/* 进行中的合同 */}
      {(() => {
        const activeContracts = (gameState.factionContracts || []).filter((c) => c.accepted);
        if (activeContracts.length === 0) return null;
        // 同一物品可能被多张合同需要，货舱/特产库存是共享池：按物品汇总需求（唯一真值 lib/turn/contracts）
        const { requiredByItem, contractsByItem } = getContractRequiredTotals(activeContracts);
        return (
          <div className="mb-4 md:mb-6 bg-amber-900/20 border border-amber-700/30 rounded-xl p-3 md:p-4">
            <h3 className="text-xs text-amber-400 font-bold mb-3 flex items-center gap-2">
              <Receipt size={14} className="text-amber-400" /> 进行中的合同 ({activeContracts.length})
            </h3>
            <div className="space-y-2">
              {activeContracts.map((c) => {
                const pubFaction = gameState.factions.find((f) => f.id === c.factionId);
                const itemName = getContractItemName(c, gameState.factions);
                const isSpecialty = getContractItemKind(c) === 'specialty';
                const held = getContractHeldCount(ship, c);
                const needTotal = requiredByItem[c.targetItemId] ?? c.targetQty;
                const sharedCount = contractsByItem[c.targetItemId] ?? 1;
                const expiry = getContractEarliestExpiry(ship, c);
                const heldEnough = held >= needTotal;
                const remain = getContractRemainingTurns(c, gameState.turn);
                return (
                  <div key={c.id} className="flex items-center gap-2 bg-slate-800/60 rounded-lg px-3 py-2">
                    <span className={`text-[10px] px-1.5 py-0.5 rounded font-bold flex-shrink-0 ${c.type === 'smuggling' ? 'bg-red-900/50 text-red-300' : 'bg-cyan-900/50 text-cyan-300'}`}>{c.type === 'smuggling' ? '走私' : '采购'}</span>
                    <div className="flex-1 min-w-0">
                      <div>
                        <span className="text-xs md:text-sm text-slate-200 font-bold">{itemName} ×{c.targetQty}</span>
                        <span className="text-[10px] md:text-xs text-slate-500 ml-2">← {pubFaction?.name || c.factionId}</span>
                      </div>
                      <div className="text-[10px] md:text-xs mt-0.5">
                        <span className={`font-bold ${heldEnough ? 'text-green-400' : held === 0 ? 'text-slate-500' : 'text-amber-400'}`}>持有 {held}/{needTotal}</span>
                        <span className={`ml-1 ${heldEnough ? 'text-green-400' : 'text-amber-400'}`}>{heldEnough ? '· 可交付' : `· 还差 ${needTotal - held}`}</span>
                        {sharedCount > 1 && <span className="text-slate-500 ml-1">（{sharedCount} 张合同合计需求）</span>}
                        {isSpecialty && <span className="text-slate-500 ml-1">· 特产库存</span>}
                        {expiry !== null && <span className="text-slate-500 ml-1">· 最早第{expiry}回合过期</span>}
                      </div>
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
        const actualCrewCost = computeCrewFoodCost(gameState.turn, ship);
        // 母舰每回合固定被动收益（唯一真值 lib/turn/shipIncome.ts，与结算 processShipTurn 同源）
        const shipIncome = getShipPerTurnIncome(ship);
        const shipFood = sumShipIncome(ship, 'food');
        const shipStardust = sumShipIncome(ship, 'stardust');
        const shipGold = sumShipIncome(ship, 'gold');
        // 殖民地数据（统一走 economy 模块估算，金币/领袖科研取中值）
        const eco = ship.colony?.phase === 'active' ? computeColonyEconomy(ship.colony, { relics: ship.relics, permaBonuses: ship.galaxy?.permaBonuses || [] }) : null;
        const colFood = eco?.food ?? 0, colAlloy = eco?.alloy ?? 0, colStardust = eco?.stardust ?? 0;
        const colGold = eco?.gold ?? 0, colRP = eco?.research ?? 0, colFoodCost = eco?.foodCost ?? 0;
        const colMats: Record<string, number> = eco?.materials ?? {};
        // 产出来源拆解（与殖民地面板同源：直接读 economy 明细字段，不重算任何规则）
        type EcoKind = 'food' | 'alloy' | 'stardust' | 'gold' | 'research' | 'material';
        /**
         * 把某类产出的来源逐项列出：非建筑项按"基础值 × 加成率"算绝对贡献并四舍五入，
         * 「建筑」项取残差（合计 − 其它项之和），保证各项之和恒等于合计。
         * 母舰侧（装置/遗物）来自 shipIncome，与结算同源。
         */
        const colonyParts = (kind: EcoKind, materialId?: string): { total: number; text: string } => {
          if (!eco) return { total: 0, text: '' };
          const list = eco.buildings.filter((e) => e.outputType === kind && (kind !== 'material' || e.materialId === materialId));
          const perTurnLeader = kind === 'research' ? eco.leaderPerTurn.research
            : kind === 'material' ? (eco.leaderPerTurn.materials[materialId || ''] || 0)
            : kind === 'stardust' ? eco.leaderPerTurn.stardust : 0;
          const perTurnRelic = kind === 'research' ? eco.relicPerTurn.research : 0;
          const total = list.reduce((a, e) => a + e.value, 0) + perTurnLeader + perTurnRelic;
          // 来源拆解：**唯一真值** lib/colony/economy.getBuildingSourceBreakdown（与殖民地页签同源）。
          // 这里只做"按标签汇总 + 残差归建筑"，不再手写每个加成字段——新增加成字段只需改 economy 的一张表。
          const byLabel = new Map<string, number>();
          for (const e of list) {
            for (const line of getBuildingSourceBreakdown(e)) {
              byLabel.set(line.label, (byLabel.get(line.label) || 0) + line.value);
            }
          }
          const rawParts: Array<[string, number]> = [...byLabel.entries()];
          if (perTurnRelic) rawParts.push(['遗物', perTurnRelic]);
          if (perTurnLeader) rawParts.push(['领袖特效', perTurnLeader]);
          const parts = rawParts.map(([label, v]) => [label, Math.round(v)] as [string, number]).filter(([, v]) => v !== 0);
          const base = total - parts.reduce((a, [, v]) => a + v, 0);
          const segments = [
            ...(base !== 0 ? [`建筑${base}`] : []),
            ...parts.map(([label, v]) => `${label}${v > 0 ? '+' : ''}${v}`),
          ];
          const shipLines = shipIncome.filter((l) => l.kind === kind);
          const out = [
            segments.length ? `殖民地(${segments.join('+')})` : '',
            shipLines.length ? `母舰 ${shipLines.map((l) => `${l.label}${l.value}`).join('+')}` : '',
          ].filter(Boolean);
          return { total, text: out.length ? ` (${out.join(' + ')})` : '' };
        };
        const foodParts = colonyParts('food');
        const alloyParts = colonyParts('alloy');
        const stardustParts = colonyParts('stardust');
        const goldParts = colonyParts('gold');
        const rpParts = colonyParts('research');
        // 动态/随机来源（无法计入固定数字，只能文字说明）。
        // 清单与数值走唯一真值 getDynamicIncomeLines（与 processShipTurn 的实际发放同源），
        // 金币类按**饥荒减半后的实收**显示并标注（历史上这里是硬编码的 3/10/2~4 文案）。
        const dynamicNotes = getDynamicIncomeLines(ship, assets).map((line) => {
          if (line.gold <= 0) return `${line.label} ${line.matsText}`;
          const actual = famineHalveGold(ship.food, line.gold);
          return `${line.label} +总资产1%（约 ${actual.toLocaleString()} 金币${actual < line.gold ? '，饥荒减半' : ''}）`;
        });
        return (
          <div className="mb-4 bg-slate-900/60 border border-slate-700 rounded-xl p-3 md:p-4">
            <h3 className="text-xs text-amber-400 font-bold mb-3">资源收支</h3>
            <div className="grid grid-cols-2 gap-2 text-[10px] md:text-xs">
              <div><span className="text-slate-500">食物总产出:</span> <span className="text-green-400 font-bold">+{colFood+shipFood}</span><span className="text-slate-500">{foodParts.text}</span></div>
              <div><span className="text-slate-500">食物总消耗:</span> <span className="text-red-400 font-bold">-{actualCrewCost+colFoodCost}{colFoodCost>0?` (船员${actualCrewCost}+殖民${colFoodCost})`:` (船员)`}</span></div>
              <div><span className="text-slate-500">食物净增减:</span> <span className={(colFood+shipFood - actualCrewCost - colFoodCost) >= 0 ? 'text-green-400 font-bold' : 'text-red-400 font-bold'}>{colFood+shipFood - actualCrewCost - colFoodCost >= 0 ? '+' : ''}{colFood+shipFood - actualCrewCost - colFoodCost}</span></div>
              <div><span className="text-slate-500">当前食物:</span> <span className={ship.food >= 0 ? 'text-green-400 font-bold' : 'text-red-400 font-bold'}>{ship.food}</span></div>
              {colAlloy > 0 && <div><span className="text-slate-500">合金产出:</span> <span className="text-slate-300 font-bold">+{colAlloy}</span><span className="text-slate-500">{alloyParts.text}</span></div>}
              {colStardust + shipStardust > 0 && <div><span className="text-slate-500">星尘产出:</span> <span className="text-purple-400 font-bold">+{colStardust + shipStardust}</span><span className="text-slate-500">{stardustParts.text}</span></div>}
              {colGold + shipGold > 0 && <div><span className="text-slate-500">金币产出:</span> <span className="text-yellow-400 font-bold">+{colGold + shipGold}</span><span className="text-slate-500">{goldParts.text}</span></div>}
              {colRP > 0 && <div><span className="text-slate-500">科研产出:</span> <span className="text-cyan-400 font-bold">+{colRP}</span><span className="text-slate-500">{rpParts.text}</span></div>}
              {(() => { const mc: Record<string,string> = MATERIAL_NAME_MAP; return Object.entries(colMats).map(([k,v]) => v>0 && <div key={k}><span className="text-slate-500">{mc[k]||k}:</span> <span className="text-amber-400 font-bold">+{v}</span><span className="text-slate-500">{colonyParts('material', k).text}</span></div>); })()}
              {dynamicNotes.length > 0 && (
                <div className="col-span-2 mt-1 pt-1 border-t border-slate-700/50 text-slate-500">
                  其它动态收益（不计入上方固定合计）：{dynamicNotes.join('；')}
                </div>
              )}
            </div>
          </div>
        );
      })()}

      {/* 联盟加成提示 */}
      {allianceActive && (
        <div className="mb-4 md:mb-6 flex items-center gap-2 bg-blue-900/30 border border-blue-700/40 rounded-lg px-3 py-2 md:px-4 md:py-2.5">
          <Users size={16} className="text-blue-400 flex-shrink-0" />
          <div>
            <span className="text-[10px] md:text-xs text-blue-400 font-semibold">联盟加成</span>
            <p className="text-xs md:text-sm text-slate-200">产品售价+15%，剩余 {ship.allianceRounds} 回合</p>
          </div>
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

      {/* 旧「星际贸易投资」区块已随投资系统退役删除：
          投资的唯一形态是「固定 8000 金币 → +1 声望」，回报走声望层级被动收入（贸易页签可见），
          factionStates.invested 已无写入点（读档时一次性折成声望后清零），此处原为永不可见的死 UI。 */}

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
    </div>
  );
}
