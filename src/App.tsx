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
    installModule,
    useManualModule,
    buyAlloy,
    buyFood,
    buyRelic,
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
        onSelect={(shipId) => selectShips(shipId)}
        onLoad={() => loadSave()}
        hasSave={hasSave()}
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
      onTakeLoan={(principal, plan) => takeLoan(0, principal, plan)}
      onRepayLoan={(loanId) => repayLoan(0, loanId)}
      onTravelToFaction={(targetId) => travelToFaction(0, targetId)}
      onBuySpecialty={(qty) => buySpecialty(0, qty)}
      onSellSpecialty={(fid, qty) => sellSpecialty(0, fid, qty)}
      onExploreFaction={() => exploreFaction(0)}
      onInvestFaction={(amt) => investFaction(0, amt)}
      onGatherIntel={() => gatherIntel(0)}
      onInstallModule={(moduleId) => installModule(0, moduleId)}
      onUseManualModule={(moduleId) => useManualModule(0, moduleId)}
      onBuyAlloy={buyAlloy}
      onBuyFood={buyFood}
      onBuyRelic={buyRelic}
      onRedeemCode={redeemCode}
      onExportSave={() => exportSave(gameState.ships, gameState.turn)}
      onImportSave={importSave}
      onResetGame={resetGame}
      getShipTotalAssets={getShipTotalAssets}
    />
  );
}

export default App;