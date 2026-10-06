import { useGameState } from '@/hooks/useGameState';
import ShipSelection from '@/components/ShipSelection';
import GameScreen from '@/components/GameScreen';
import GameOverScreen from '@/components/GameOverScreen';
import './App.css';

function App() {
  const {
    gameState,
    activeEvent,
    eventDodged,
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
    // ⚠ 没有通用的 startBattle（UI 不能凭空开战）：出征战由 useTurn 自动开；
    //   startRaidBattle 是**窄回调**（阶段 B 的掠夺防守战，目标/编制/seed 全由 reducer 组装）
    createBattleFleet,
    startBattleExpedition,
    startRaidBattle,
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

  if (gameState.phase === 'select') {
    return (
      <ShipSelection
        onSelect={selectShips}
        onLoad={loadSave}
        hasSave={hasSave()}
      />
    );
  }

  if (gameState.gameWon) {
    return (
      <GameOverScreen
        reason={`🎉 奇观「${gameState.wonWonderName}」建设完成！你赢得了胜利！`}
        turn={gameState.turn}
        onRestart={resetGame}
        isVictory
      />
    );
  }

  if (gameState.phase === 'ended') {
    const lastEvent = gameState.eventLog[0];
    return (
      <GameOverScreen
        reason={lastEvent?.detail || '游戏结束'}
        turn={gameState.turn}
        onRestart={resetGame}
      />
    );
  }

  return (
    <GameScreen
      gameState={gameState}
      activeEvent={activeEvent}
      eventDodged={eventDodged}
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
      battle={gameState.battle}
      fleetExpedition={gameState.expedition}
      fleets={gameState.fleets}
      cardLibrary={gameState.cardLibrary}
      onStartBattleExpedition={startBattleExpedition}
      onStartRaidBattle={startRaidBattle}
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
  );
}

export default App;