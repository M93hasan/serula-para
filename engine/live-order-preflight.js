// Strict, side-effect-free pre-trade risk check. No order API, no credentials.
// Strings and BigInt prevent floating-point rounding across price/quantity filters.
const decimal = value => {
  if(typeof value!=='string'||!/^(?:0|[1-9]\d{0,14})(?:\.\d{1,8})?$/.test(value))throw Error('DECIMAL_INVALID');
  const [whole,fraction='']=value.split('.');
  return {units:BigInt(whole+fraction.padEnd(8,'0')),scale:100000000n};
};
const units = value => decimal(value).units;
const requiredPositive = value => {const n=units(value);if(n<=0n)throw Error('VALUE_NOT_POSITIVE');return n;};
const integralMultiple=(value,step)=>value%step===0n;
const fail=(reason)=>Object.freeze({eligible:false,reason,executionEnabled:false});
export function checkLiveOrderPreflight({order,market,balances,limits,liquidity,now=Date.now()}={}){
  try{
    if(!order||!market||!Array.isArray(balances)||!limits||!Number.isSafeInteger(now))return fail('MISSING_INPUT');
    const {symbol,side,price,quantity}=order;
    if(typeof symbol!=='string'||!/^[A-Z0-9]{1,20}_TRY$/.test(symbol)||
      !['BUY','SELL'].includes(side)||market.symbol!==symbol||market.type!==1||
      market.filtersPresent!==true||market.quoteAsset!=='TRY'||market.baseAsset!==symbol.split('_')[0])
      return fail('UNVERIFIED_MARKET');
    if(!Number.isSafeInteger(market.exchangeTime)||market.exchangeTime>now+1000||
      now-market.exchangeTime>120000||!Number.isSafeInteger(market.priceTime)||
      market.priceTime>now||now-market.priceTime>30000)return fail('STALE_MARKET');
    if(limits.halted!==false||limits.realOrdersEnabled!==false)return fail('HALT_OR_EXECUTION_LOCK');
    const p=requiredPositive(price),q=requiredPositive(quantity);
    const f=market.filters||{},tick=requiredPositive(f.tickSize),step=requiredPositive(f.stepSize),
      minQty=requiredPositive(f.minQty),minNotional=requiredPositive(f.minNotional);
    if(!integralMultiple(p,tick)||!integralMultiple(q,step)||q<minQty)
      return fail('PRICE_OR_LOT_FILTER');
    const notional=p*q/100000000n;
    if(notional<minNotional)return fail('MIN_NOTIONAL');
    if(notional>requiredPositive(limits.maxOrderTry))return fail('MAX_ORDER');
    const priceObserved=requiredPositive(market.price);
    const maxDiffBps=BigInt(limits.maxPriceDeviationBps);
    if(!Number.isSafeInteger(limits.maxPriceDeviationBps)||limits.maxPriceDeviationBps<0||
       limits.maxPriceDeviationBps>1000)return fail('INVALID_LIMIT');
    if((p>priceObserved?p-priceObserved:priceObserved-p)*10000n>priceObserved*maxDiffBps)
      return fail('PRICE_DEVIATION');
    // Stale scanner indicators or insufficient quoted depth forbid even preview approval.
    // These aggregated metrics cannot replace an immediate order-book check at execution.
    if(!liquidity||!Number.isSafeInteger(liquidity.asOf)||
      liquidity.asOf>now||now-liquidity.asOf>30000)return fail('STALE_LIQUIDITY');
    const {spread,depthQuote,bid,ask}=liquidity;
    if(![spread,depthQuote,bid,ask].every(x=>typeof x==='number'&&Number.isFinite(x))||
       spread<0||spread>0.005||depthQuote<=0||bid<=0||ask<bid)
       return fail('SPREAD_OR_LIQUIDITY');
    if(depthQuote*100000000<Number(notional)*2)return fail('INSUFFICIENT_DEPTH');
    const base=symbol.split('_')[0],asset=side==='BUY'?'TRY':base;
    const matching=balances.filter(b=>b?.asset===asset);
    if(matching.length!==1)return fail('BALANCE_UNAVAILABLE');
    const available=units(matching[0].free);
    if(available<(side==='BUY'?notional:q))return fail('INSUFFICIENT_BALANCE');
    // No deduction for fees here; this is ONLY a preliminary reject-only check.
    return Object.freeze({eligible:true,reason:'PREFLIGHT_CHECK_ONLY',executionEnabled:false,
      notionalTry:(Number(notional)/100000000).toFixed(8),feeReserveVerified:false});
  }catch{return fail('INVALID_OR_INCOMPLETE_DATA');}
}
