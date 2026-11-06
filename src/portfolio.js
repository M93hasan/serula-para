// Values are approximate display estimates, never account balances or order amounts.
import { isFreshMarketPrice } from '../engine/market-freshness.js';

export function tryPrices(markets, now=Date.now()) {
  const pairs=new Map();
  for(const market of markets||[]){
    if(typeof market?.symbol!=='string'||!/^[A-Z0-9]{1,20}_[A-Z0-9]{1,20}$/.test(market.symbol)||!isFreshMarketPrice(market,now))continue;
    const existing=pairs.get(market.symbol);
    if(!existing||market.priceTime>=existing.priceTime)pairs.set(market.symbol,market);
  }

  const prices=new Map([['TRY',1]]);
  for(const {symbol,price} of pairs.values()){
    const [asset,quote]=symbol.split('_');
    if(quote==='TRY'&&asset!=='TRY')prices.set(asset,price);
  }
  // Direct TRY takes precedence. Only use a one-hop bridge with both legs fresh.
  for(const bridge of ['USDT','BTC']){
    const bridgePrice=prices.get(bridge);
    if(!pairs.has(bridge+'_TRY'))continue;
    for(const {symbol,price} of pairs.values()){
      const [asset,quote]=symbol.split('_');
      if(quote!==bridge||prices.has(asset))continue;
      const converted=price*bridgePrice;
      if(Number.isFinite(converted)&&converted>0)prices.set(asset,converted);
    }
  }
  return prices;
}

export function valuePortfolio(balances,markets,now=Date.now()) {
  const prices=tryPrices(markets,now);
  let subtotal=0;const missing=[];let pricedCount=0;
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
