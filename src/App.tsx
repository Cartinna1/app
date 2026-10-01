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
    />
  );
}

export default App;