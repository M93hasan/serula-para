// Run on the user's Windows computer: node scripts/diagnose-binance.js
// Public endpoints only. Never reads an API key, password, or vault.
import {diagnoseLocalBinance} from '../engine/binance-connection-diagnostic.js';
import {MarketData} from '../engine/market-data.js';

const report=await diagnoseLocalBinance();
console.log('Binance TR public network diagnostic:');
for(const t of report.targets)console.log(t.name+': '+t.status+(t.httpStatus?' HTTP '+t.httpStatus:''));
if(report.hasWafBlock){
  const accountHost=report.targets.find(x=>x.name==='tr-public-time');
  const marketHost=report.targets.find(x=>x.name==='market-public-time');
  if(accountHost?.status==='REACHABLE' && marketHost?.status==='WAF_BLOCKED') {
    console.log('PARTIAL CONNECTIVITY: www.binance.tr is reachable, but Binance TR market host api.binance.me is blocked (HTTP 403).');
    console.log('Account/balance read connectivity is distinct from market-price connectivity. BTC_TRY live quote NOT verified.');
    console.log('No automatic alternate exchange/host, synthetic quote, or real trading should be used. Ask Binance TR support about the blocked market API host.');
  } else console.log('HTTP 403 WAF block. Do not repeatedly retry blocked endpoints. Contact Binance TR support.');
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
