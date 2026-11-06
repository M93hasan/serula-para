import test from 'node:test';
import assert from 'node:assert/strict';
import { valuePortfolio } from '../src/portfolio.js';
import { MarketData } from '../engine/market-data.js';

const now=1700000000000;
const quote=(symbol,price,priceTime=now)=>({symbol,price,priceTime});
test('portfolio includes available and locked TRY plus directly priced crypto',()=>{
  const result=valuePortfolio([{asset:'TRY',free:'20',locked:'30'},{asset:'BTC',free:'0.1',locked:'0.05'},{asset:'ETH',free:'2',locked:'0'}],[quote('BTC_TRY',4000000),quote('ETH_TRY',100000)],now);
  assert.ok(Math.abs(result.subtotal-800050)<0.000001);
  assert.deepEqual(result.missing,[]);
  assert.equal(result.complete,true);
});
test('USDT indirect conversion uses observed USDT/TRY, never assumed 1:1',()=>{
  const result=valuePortfolio([{asset:'XRP',free:'10',locked:'5'}],[quote('XRP_USDT',2),quote('USDT_TRY',35),quote('BTC_TRY',4000000)],now);
  assert.equal(result.subtotal,1050);
  assert.equal(result.complete,true);
});
test('missing or stale quote remains incomplete rather than underreported as total',()=>{
  const result=valuePortfolio([{asset:'TRY',free:'20',locked:'0'},{asset:'DOGE',free:'100',locked:'0'}],[quote('DOGE_TRY',4,now-301000)],now);
  assert.equal(result.subtotal,20);
  assert.deepEqual(result.missing,['DOGE']);
  assert.equal(result.complete,false);
});
test('verified direct TRY rate overrides an indirect bridge',()=>{
  const result=valuePortfolio([{asset:'XRP',free:'2',locked:'0'}],[quote('XRP_TRY',80),quote('XRP_USDT',2),quote('USDT_TRY',35)],now);
  assert.equal(result.subtotal,160);
});
test('portfolio price discovery uses GET only and eligible exchange symbols',async()=>{
  const calls=[],catalogue=[{symbol:'XRP_USDT',type:1,spotTradingEnable:1},{symbol:'USDT_TRY',type:1,spotTradingEnable:1},{symbol:'BTC_TRY',type:1,spotTradingEnable:1}];
  const exchange={symbols:async()=>({code:0,data:{list:catalogue}})};
  const fetchImpl=async(url,options)=>{
    calls.push({url:String(url),options});
    const p=new URL(url).searchParams.get('symbol');
    return {ok:true,status:200,headers:{get:()=>null},json:async()=>[{price:p==='XRPUSDT'?'2':p==='USDTTRY'?'35':'4000000',time:now}]};
  };
  const prices=await new MarketData({fetchImpl,clock:()=>now,exchange}).valuationPrices(['XRP','TRY']);
  assert.deepEqual(prices.map(p=>p.symbol),['XRP_USDT','USDT_TRY','BTC_TRY']);
  assert.ok(calls.every(c=>c.options.method==='GET'&&!('headers' in c.options)&&c.url.startsWith('https://api.binance.me/api/v3/trades?')));
});
