// Preview only: validated, dated news, integrated risk and execution are not available.
// No caller-provided flag can unlock this gate; it has no method to execute a trade.
export function assessPaperReadiness({paper,decision,candidate,catalog,now=Date.now()}){
  const reasons=[];
  if(!paper||paper.halted!==false)reasons.push('PAPER_STOP');
  if(!decision||!Number.isSafeInteger(decision.time)||decision.time>now||now-decision.time>300000)reasons.push('AI_UNAVAILABLE_OR_STALE');
  if(!candidate||candidate.status!=='candidate'||!Number.isSafeInteger(candidate.asOf)||candidate.asOf>now||now-candidate.asOf>300000||!Number.isSafeInteger(candidate.priceTime)||candidate.priceTime>now||now-candidate.priceTime>30000)reasons.push('MARKET_UNAVAILABLE_OR_STALE');
  if(!catalog||!Number.isSafeInteger(catalog.exchangeTime)||catalog.exchangeTime>now+1000||now-catalog.exchangeTime>120000||!catalog.markets?.some(m=>m.symbol===candidate?.symbol&&m.type===1&&m.filtersPresent))reasons.push('CATALOG_OR_FILTER_UNVERIFIED');
  if(decision&&candidate&&decision.symbol!==candidate.symbol)reasons.push('DECISION_SYMBOL_MISMATCH');
  if(decision?.action!=='AL'&&decision?.action!=='SAT')reasons.push('AI_HOLD');
  reasons.push('VERIFIED_NEWS_UNAVAILABLE','CONTINUOUS_RISK_UNAVAILABLE','PAPER_EXECUTION_DISABLED');
  return {mode:'paper',action:'BEKLE',eligible:false,at:now,symbol:candidate?.symbol??null,reasons};
}
