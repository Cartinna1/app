import { useGameState } from '@/hooks/useGameState';
import ShipSelection from '@/components/ShipSelection';
import GameScreen from '@/components/GameScreen';
import GameOverScreen from '@/components/GameOverScreen';
import ErrorBoundary from '@/components/ErrorBoundary';
import { useSaveError, clearSaveError } from '@/lib/saveStatus';
import './App.css';

/**
 * 自动存档失败警示条（运行时状态，不进存档）：仅在 useSaveError() 非空时出现。
 * 手机上 console.warn 等于不存在，「存档没写进去」必须让玩家看得见。
 */
function SaveErrorBanner() {
  const saveError = useSaveError();
  if (!saveError) return null;

  return (
    <div className="sticky top-0 z-50 flex items-start gap-2 border-b border-amber-700/70 bg-amber-900/90 px-3 py-2 text-[11.5px] leading-relaxed text-amber-100 md:text-xs">
      <span className="flex-1">{saveError}</span>
      <button
        type="button"
        onClick={clearSaveError}
        className="shrink-0 font-bold text-amber-200 underline hover:text-white"
      >
        关闭
      </button>
    </div>
  );
}

function App() {
  const {
    gameState,
    activeEvent,
    eventDodged,
    eventCardResetSignal,
    hasPendingEvent,
    selectShips,
    buyStock,
    sellStock,
    buyMaterial,
    startProduction,
    sellProductQty,
    nextTurn,
    drawEvent,
    chooseEventOption,
    applyEventResources,
    logEventEntry,
    clearActiveEvent,
    clearEventDodged,
    takeLoan,
    repayLoan,
    travelToNode,
    startExcavation,
    continueExcavation,
    resolveExcavationChoice,
    steadyExcavation,
    changeExcavationLeader,
    abandonExcavation,
    buySpecialty,
    sellSpecialty,
    exploreFaction,
    investFaction,
    gatherIntel,
    acceptContract,
    completeContract,
    blackMarketBuy,
    installModule,
    useManualModule,
    foundColony,
    buildColonyBuilding,
    recruitPop,
    assignPop,
    startResearch,
    recruitLeader,
    upgradeLeader,
    rollAndRecruit,
    cancelBuilding,
    demolishBuilding,
    selectWonder,
    submitWonderResources,
    canStartWonder,
    completeWonder,
    startExpedition,
    payExpeditionNode,
    unlockUltimate,
    buyAlloy,
    buyFood,
    buyRelic,
    buyRandomMats,
    buySellBonus,
    buyGoldWithStardust,
    rerollPolicy,
    buyFoodWithStardust,
    redeemCode,
    // 舰船卡牌战斗（V1.5 §10）：战斗页签用
    // ⚠ 没有通用的 startBattle（UI 不能凭空开战）：出征战由 useTurn 在倒计时归零时自动开；
    //   下面两个都是**窄回调**（目标 / 编制 / seed 全由 reducer 侧的 lib 判据组装）：
    //     · startExpeditionBattle = 已抵达的出征「开战」（读档回到"已抵达 + 无战斗"时的唯一出路）
    //     · startRaidBattle = 阶段 B 的掠夺防守战「开战」
    createBattleFleet,
    startBattleExpedition,
    startExpeditionBattle,
    startRaidBattle,
    // 银河雇佣兵协会（阶段 1）：接单 / 放弃 / 当场出击（守卫全在 lib/turn/bounties）
    acceptBounty,
    abandonBounty,
    startBountyBattle,
    cancelBattleExpedition,
    battleAction,
    endBattle,
    // 船坞与造舰（V1.5 §8）：机库页签的船坞面板
    enqueueBuild,
    cancelBuild,
    // 机库（V1.5 §10.1）：卡库 / 舰队 / 编成
    deleteBattleFleet,
    renameBattleFleet,
    addShipToFleet,
    removeShipFromFleet,
    toggleFleetDefending,
    hasSave,
    loadSave,
    exportSave,
    importSave,
    resetGame,
    getShipTotalAssets,
  } = useGameState();

  // 顶层兜底：渲染期未捕获异常原本会卸载整棵根树（手机端整屏白屏）。
  // 自动存档失败警示条放在边界之外，即使内容崩了照样看得见。
  return (
    <ErrorBoundary>
      <SaveErrorBanner />
      {gameState.phase === 'select' && (
        <ShipSelection
          onSelect={selectShips}
          onLoad={loadSave}
          hasSave={hasSave()}
        />
      )}

      {gameState.phase !== 'select' && gameState.gameWon && (
        <GameOverScreen
          reason={`🎉 奇观「${gameState.wonWonderName}」建设完成！你赢得了胜利！`}
          turn={gameState.turn}
          onRestart={resetGame}
          isVictory
        />
      )}

      {gameState.phase === 'ended' && (
        <GameOverScreen
          reason={gameState.eventLog[0]?.detail || '游戏结束'}
          turn={gameState.turn}
          onRestart={resetGame}
        />
      )}

      {gameState.phase !== 'select' && !gameState.gameWon && gameState.phase !== 'ended' && (
        <GameScreen
          gameState={gameState}
          activeEvent={activeEvent}
          eventDodged={eventDodged}
          eventCardResetSignal={eventCardResetSignal}
          hasPendingEvent={hasPendingEvent}
          onBuyStock={buyStock}
          onSellStock={sellStock}
          onBuyMaterial={buyMaterial}
          onStartProduction={startProduction}
          onSellProductQty={sellProductQty}
          onNextTurn={nextTurn}
          onDrawEvent={drawEvent}
          onChooseEventOption={chooseEventOption}
          onApplyEventResources={applyEventResources}
          onLogEvent={logEventEntry}
          onClearActiveEvent={clearActiveEvent}
          onClearEventDodged={clearEventDodged}
          onTakeLoan={takeLoan}
          onRepayLoan={repayLoan}
          onTravelToNode={travelToNode}
          onBuySpecialty={buySpecialty}
          onSellSpecialty={sellSpecialty}
          onExploreFaction={exploreFaction}
          onInvestFaction={investFaction}
          onGatherIntel={gatherIntel}
          onAcceptContract={acceptContract}
          onCompleteContract={completeContract}
          onBlackMarketBuy={blackMarketBuy}
          onStartExcavation={startExcavation}
          onContinueExcavation={continueExcavation}
          onResolveExcavationChoice={resolveExcavationChoice}
          onSteadyExcavation={steadyExcavation}
          onChangeExcavationLeader={changeExcavationLeader}
          onAbandonExcavation={abandonExcavation}
          onInstallModule={installModule}
          onUseManualModule={useManualModule}
          onFoundColony={foundColony}
          onBuildColonyBuilding={buildColonyBuilding}
          onRecruitPop={recruitPop}
          onAssignPop={assignPop}
          onStartResearch={startResearch}
          onRecruitLeader={recruitLeader}
          onUpgradeLeader={upgradeLeader}
          onRollAndRecruit={rollAndRecruit}
          onCancelBuilding={cancelBuilding}
          onDemolishBuilding={demolishBuilding}
          onSelectWonder={selectWonder}
          onSubmitWonderResources={submitWonderResources}
          onCompleteWonder={completeWonder}
          canStartWonder={canStartWonder}
          onStartExpedition={startExpedition}
          onPayExpeditionNode={payExpeditionNode}
          onUnlockUltimate={unlockUltimate}
          onBuyAlloy={buyAlloy}
          onBuyFood={buyFood}
          onBuyRelic={buyRelic}
          onBuyRandomMats={buyRandomMats}
          onBuySellBonus={buySellBonus}
          onBuyGoldWithStardust={buyGoldWithStardust}
          onRerollPolicy={rerollPolicy}
          onBuyFoodWithStardust={buyFoodWithStardust}
          onRedeemCode={redeemCode}
          onExportSave={exportSave}
          onImportSave={importSave}
          onResetGame={resetGame}
          getShipTotalAssets={getShipTotalAssets}
          fleets={gameState.fleets}
          cardLibrary={gameState.cardLibrary}
          onStartBattleExpedition={startBattleExpedition}
          onStartExpeditionBattle={startExpeditionBattle}
          onStartRaidBattle={startRaidBattle}
          onAcceptBounty={acceptBounty}
          onAbandonBounty={abandonBounty}
          onStartBountyBattle={startBountyBattle}
          onCancelBattleExpedition={cancelBattleExpedition}
          onBattleAction={battleAction}
          onEndBattle={endBattle}
          onCreateBattleFleet={createBattleFleet}
          onEnqueueBuild={enqueueBuild}
          onCancelBuild={cancelBuild}
          onDeleteBattleFleet={deleteBattleFleet}
          onRenameBattleFleet={renameBattleFleet}
          onAddShipToFleet={addShipToFleet}
          onRemoveShipFromFleet={removeShipFromFleet}
          onToggleFleetDefending={toggleFleetDefending}
        />
      )}
    </ErrorBoundary>
  );
}

export default App;