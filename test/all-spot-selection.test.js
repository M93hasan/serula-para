import test from 'node:test';
import assert from 'node:assert/strict';
import { MarketData } from '../engine/market-data.js';
import { createServer } from '../engine/server.js';
import { RiskStore } from '../engine/store.js';

const now=1700000000000;
const hour=3600000;
const end=Math.floor(now/hour)*hour;
const candles=Array.from({length:40},(_,i)=>{
  const time=end-(40-i)*hour;
  return {time,closeTime:time+hour-1,open:10,high:12,low:9,close:11,volume:100,quoteVolume:1100};
});
const mkMarket=symbol=>({symbol,price:11,priceTime:Date.now()-1000,candles}); // HTTP AI cache must be fresh against the server clock.
const config=symbol=>({symbol,budget:1000,maxTrade:100,maxLoss:50,feeRate:.001});

test('fresh exchange catalogue allows a non-BTC/ETH active type-1 spot symbol and rejects disabled/unsupported symbols',async()=>{
  const requests=[];
  const exchange={
    time:async()=>({timestamp:now}),
    symbols:async()=>({code:0,data:{list:[
      {symbol:'SOL_USDT',baseAsset:'SOL',quoteAsset:'USDT',type:1,spotTradingEnable:1,status:'TRADING'},
      {symbol:'XRP_TRY',baseAsset:'XRP',quoteAsset:'TRY',type:3,spotTradingEnable:1,status:'TRADING'},
      {symbol:'OLD_TRY',baseAsset:'OLD',quoteAsset:'TRY',type:1,spotTradingEnable:0,status:'TRADING'}
    ]}})
  };
  const fetchImpl=async url=>{
    requests.push(String(url));
    if(String(url).includes('klines'))return new Response(JSON.stringify(candles.map(c=>[c.time,c.open,c.high,c.low,c.close,c.volume,c.closeTime,c.quoteVolume])));
    return new Response(JSON.stringify([{price:'11',time:now-1000}]));
  };
  const market=new MarketData({exchange,fetchImpl,clock:()=>now});
  const snapshot=await market.snapshot({symbol:'SOL_USDT'});
  assert.deepEqual(snapshot.markets.map(m=>m.symbol),['SOL_USDT']);
  assert.equal(requests.length,2);
  assert.ok(requests.every(x=>x.includes('symbol=SOLUSDT')));
  for(const bad of ['XRP_TRY','OLD_TRY','OTHER_TRY','bad'])await assert.rejects(new MarketData({exchange,fetchImpl,clock:()=>now}).snapshot({symbol:bad}),/Invalid symbol/);
  assert.equal(requests.length,2,'invalid markets must not call market endpoints');
});

test('local API analyses a catalogue-selected spot pair, but AI receives only cached and verified markets',async()=>{
  const token='z'.repeat(40),store=new RiskStore(':memory:',{budget:1000,maxTrade:100,maxLoss:100});
  const catalog={markets:[{symbol:'SOL_USDT',type:1}],eligible:1};
  const market={snapshot:async opts=>{
    assert.equal(opts?.symbol,'SOL_USDT');
    return {asOf:now,markets:[mkMarket('SOL_USDT')]};
  }};
  const observed=[];
  const ai={analyze:async (input,options)=>{
    observed.push({symbol:input.symbol,approved:options?.catalogApproved});
    return {symbol:input.symbol,time:now,action:'BEKLE',roles:[],reason:'Missing verified news'};
  }};
  const server=createServer({token,simulator:store,market,universe:{discover:async()=>catalog},ai});
  await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
  try{
    const origin=`http://127.0.0.1:${server.address().port}`;
    const headers={Authorization:`Bearer ${token}`,Origin:origin,'Sec-Fetch-Site':'same-origin','Content-Type':'application/json','X-Para-Request':'1'};
    const post=(path,payload)=>fetch(origin+path,{method:'POST',headers,body:JSON.stringify(payload)});
    const a=await post('/api/analysis',config('SOL_USDT'));
    assert.equal(a.status,200);
    assert.equal((await a.json()).symbol,'SOL_USDT');
    const blocked=await post('/api/ai/analyze',{symbol:'XRP_TRY'});
    assert.equal(blocked.status,503);
    const result=await post('/api/ai/analyze',{symbol:'SOL_USDT'});
    assert.equal(result.status,200);
    assert.equal((await result.json()).action,'BEKLE');
    assert.deepEqual(observed,[{symbol:'SOL_USDT',approved:true}]);
    assert.equal((await post('/api/paper/order',{symbol:'SOL_USDT',side:'BUY'})).status,404);
  }finally{
    await new Promise(resolve=>server.close(resolve));store.close();
  }
});
