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
    travelToFaction,
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
    unlockColony,
    selectPlanet,
    rescrollPlanets,
    generateScoutingPool,
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
      onTravelToFaction={travelToFaction}
      onBuySpecialty={buySpecialty}
      onSellSpecialty={sellSpecialty}
      onExploreFaction={exploreFaction}
      onInvestFaction={investFaction}
      onGatherIntel={gatherIntel}
      onAcceptContract={acceptContract}
      onCompleteContract={completeContract}
      onBlackMarketBuy={blackMarketBuy}
      onInstallModule={installModule}
      onUseManualModule={useManualModule}
      onUnlockColony={unlockColony}
      onSelectPlanet={selectPlanet}
      onRescrollPlanets={rescrollPlanets}
      generateScoutingPool={generateScoutingPool}
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