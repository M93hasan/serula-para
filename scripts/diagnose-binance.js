// Run on the user's Windows computer: node scripts/diagnose-binance.js
// Public endpoints only. Never reads an API key, password, or vault.
import {diagnoseLocalBinance} from '../engine/binance-connection-diagnostic.js';
import {MarketData} from '../engine/market-data.js';

const report=await diagnoseLocalBinance();
console.log('Binance TR public network diagnostic:');
for(const t of report.targets)console.log(t.name+': '+t.status+(t.httpStatus?' HTTP '+t.httpStatus:''));
if(report.hasWafBlock){
  console.log('HTTP 403: Binance TR documents this as a WAF/security block. Stop repeated requests; inspect rate limits, request path, VPN/proxy, and official provider support.');
  process.exitCode=2;
}else{
  try{
    const result=await new MarketData().snapshot({symbol:'BTC_TRY'});
    const market=result.markets.find(x=>x.symbol==='BTC_TRY');
    if(!market||!Number.isFinite(market.price)||market.price<=0||
      !Number.isSafeInteger(market.priceTime)||Math.abs(result.asOf-market.priceTime)>30000)
      throw Error('PRICE_NOT_VERIFIABLY_FRESH');
    console.log('BTC_TRY current real quote: '+market.price+' TRY');
    console.log('Exchange timestamp: '+new Date(market.priceTime).toISOString());
    console.log('Market timestamp: '+new Date(result.asOf).toISOString());
  }catch(e){
    console.log('Real fresh BTC_TRY price could not be verified: '+e.message);
    process.exitCode=1;
  }
}
