import {calculateDailyTradingPnl} from './daily-trading-pnl.js';

// Trusted input loader for the future manually approved local order workflow.
// Reads exchange catalogue, account and fresh market data; caller must not supply balances.
export function createLiveOrderInputs({exchange,market,keys,maxNotional='500',clock=Date.now,loadRisk=null}={}){
  if(!exchange||!market||typeof clock!=='function'||typeof keys?.apiKey!=='string'||typeof keys?.secretKey!=='string'||(loadRisk!==null&&typeof loadRisk!=='function'))throw Error('INPUTS_NOT_CONFIGURED');
  return async function loadInputs(symbol){
    if(typeof symbol!=='string'||!/^([A-Z0-9]{1,20})_([A-Z0-9]{1,20})$/.test(symbol))throw Error('INVALID_SYMBOL');
    const catalog=await exchange.symbols();
    const now=clock();
    if(catalog?.code!==0||!Number.isSafeInteger(catalog.timestamp)||Math.abs(now-catalog.timestamp)>120000||!Array.isArray(catalog.data?.list))throw Error('STALE_CATALOGUE');
    const matching=catalog.data.list.filter(s=>s.symbol===symbol);
    if(matching.length!==1)throw Error('MARKET_NOT_VERIFIED');
    const account=await exchange.account(keys);
    if(account?.code!==0||account.data?.canTrade!==1||account.data?.canWithdraw!==0||!Array.isArray(account.data?.accountAssets))throw Error('ACCOUNT_PERMISSIONS_UNSAFE');
    if(!Number.isSafeInteger(account.timestamp)||Math.abs(clock()-account.timestamp)>120000)throw Error('STALE_BALANCES');
    const snapshot=await market.snapshot({symbol});
    const prices=snapshot?.markets?.filter(x=>x.symbol===symbol);
    if(prices?.length!==1||!Number.isSafeInteger(snapshot.asOf)||Math.abs(clock()-snapshot.asOf)>30000)throw Error('STALE_PRICE');
    const inputs={symbolInfo:matching[0],balances:account.data.accountAssets,market:prices[0],now:clock(),maxNotional};
    if(!loadRisk)return inputs;
    // Supplied by a server-side ledger provider, independently of the order or signal.
    const {pnl,...state}=await loadRisk({symbol,balances:inputs.balances,market:inputs.market})??{};
    if(!Number.isSafeInteger(state.asOf)||state.asOf!==pnl?.now)throw Error('RISK_DATA_UNAVAILABLE');
    const report=calculateDailyTradingPnl(pnl);
    return {...inputs,now:clock(),riskContext:{...state,...report,source:'verified-exchange-risk-monitor'}};
  };
}
