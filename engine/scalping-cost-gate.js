// Research-only net-cost filter for short-horizon strategies. No order methods.
// All inputs must come from independently verified market and fee sources.
// This is not a model-derived prediction or authorization to trade.
const boundedBps=(value,max=10000)=>typeof value==='number'&&Number.isFinite(value)&&value>=0&&value<=max;
export function assessScalpingCosts({
  expectedGrossMoveBps,entryFeeBps,exitFeeBps,spreadBps,
  entrySlippageBps,exitSlippageBps,safetyBufferBps,
  liquidityVerified,feeScheduleVerified,riskVerified,marketAsOf,now=Date.now()
}={}){
  const hold=(reason)=>({status:'BEKLE',reason,executionAuthorized:false,netEdgeBps:null});
  if(!Number.isSafeInteger(now)||!Number.isSafeInteger(marketAsOf)||marketAsOf>now||now-marketAsOf>30000)
    return hold('STALE_OR_MISSING_MARKET');
  if(liquidityVerified!==true||feeScheduleVerified!==true||riskVerified!==true)
    return hold('UNVERIFIED_COST_OR_RISK');
  if(!boundedBps(expectedGrossMoveBps,2000)||!boundedBps(entryFeeBps,1000)||
    !boundedBps(exitFeeBps,1000)||!boundedBps(spreadBps,1000)||
    !boundedBps(entrySlippageBps,1000)||!boundedBps(exitSlippageBps,1000)||
    !boundedBps(safetyBufferBps,1000))return hold('INVALID_COST_INPUT');
  // Expected move is supplied by the strategy, never invented here. Conservative
  // full-spread cost prevents small projected moves being labelled net-positive.
  const roundTripCostBps=entryFeeBps+exitFeeBps+spreadBps+
    entrySlippageBps+exitSlippageBps+safetyBufferBps;
  const netEdgeBps=expectedGrossMoveBps-roundTripCostBps;
  if(!Number.isFinite(netEdgeBps))return hold('INVALID_COST_INPUT');
  return {status:netEdgeBps>0?'RESEARCH_CANDIDATE':'BEKLE',
    reason:netEdgeBps>0?'NET_EDGE_POSITIVE_REQUIRES_INDEPENDENT_VALIDATION':'COST_EXCEEDS_EXPECTED_MOVE',
    expectedGrossMoveBps,roundTripCostBps,netEdgeBps,executionAuthorized:false};
}
