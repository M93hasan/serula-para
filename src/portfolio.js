// Values are approximate display estimates, never account balances or order amounts.
export function valuePortfolio(balances,markets,now=Date.now()) {
  const prices=new Map((markets||[]).filter(m=>Number.isFinite(m.price)&&m.price>0&&Number.isSafeInteger(m.priceTime)&&now>=m.priceTime&&now-m.priceTime<=(m.symbol==='BNB_TRY'?30000:300000)).map(m=>[m.symbol.replace('_TRY',''),m.price]));
  prices.set('TRY',1);let subtotal=0;const missing=[];let pricedCount=0;
  for(const b of balances) {
    const free=Number(b.free),locked=Number(b.locked);
    if(!Number.isFinite(free)||!Number.isFinite(locked)||free<0||locked<0)throw Error('Invalid balance');
    if(free===0&&locked===0)continue;
    const price=prices.get(b.asset);
    if(!Number.isFinite(price)||price<=0){missing.push(b.asset);continue;}
    subtotal+=(free+locked)*price;pricedCount++;
  }
  if(!Number.isFinite(subtotal))throw Error('Invalid valuation');
  return {subtotal,missing,pricedCount,complete:missing.length===0,btc:missing.length===0&&prices.has('BTC')?subtotal/prices.get('BTC'):null};
}
