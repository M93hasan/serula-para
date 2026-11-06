// Display-only estimated TRY portfolio values. A missing price never becomes zero.
export function valuePortfolio(balances,markets,now=Date.now()) {
  const graph=new Map(),direct=new Map();
  for(const market of markets||[]){
    if(typeof market?.symbol!=='string'||!/^([A-Z0-9]{1,20})_([A-Z0-9]{1,20})$/.test(market.symbol))continue;
    if(!Number.isFinite(market.price)||market.price<=0||!Number.isSafeInteger(market.priceTime)||market.priceTime>now+5000||now-market.priceTime>300000)continue;
    const [base,quote]=market.symbol.split('_'),p=market.price;
    if(!graph.has(base))graph.set(base,[]);
    if(!graph.has(quote))graph.set(quote,[]);
    graph.get(base).push([quote,p]);
    graph.get(quote).push([base,1/p]);
    if(quote==='TRY')direct.set(base,p);
  }
  const tryRate=asset=>{
    if(asset==='TRY')return 1;
    if(direct.has(asset))return direct.get(asset);
    // At most two liquid conversion legs (asset -> quote -> TRY), with no assumed stablecoin peg.
    for(const [bridge,first] of graph.get(asset)||[]){
      if(direct.has(bridge))return first*direct.get(bridge);
    }
    return null;
  };
  let subtotal=0,pricedCount=0;const missing=[];
  for(const balance of balances){
    const free=Number(balance.free),locked=Number(balance.locked);
    if(!Number.isFinite(free)||!Number.isFinite(locked)||free<0||locked<0||typeof balance.asset!=='string')throw Error('Invalid balance');
    const amount=free+locked;
    if(amount===0)continue;
    const rate=tryRate(balance.asset);
    if(rate===null||!Number.isFinite(rate)||rate<=0){missing.push(balance.asset);continue;}
    subtotal+=amount*rate;pricedCount++;
  }
  if(!Number.isFinite(subtotal))throw Error('Invalid valuation');
  const btcRate=tryRate('BTC');
  return {subtotal,missing,pricedCount,complete:missing.length===0,btc:missing.length===0&&btcRate!==null?subtotal/btcRate:null};
}
