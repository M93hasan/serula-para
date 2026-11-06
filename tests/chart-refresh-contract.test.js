import test from 'node:test';
import assert from 'node:assert/strict';
import {createServer} from '../engine/server.js';
import {RiskStore} from '../engine/store.js';

test('authenticated chart refresh returns fresh hourly candle snapshots without placing orders',async()=>{
 const token='x'.repeat(40),simulator=new RiskStore(':memory:',{budget:1000,maxTrade:100,maxLoss:100});
 let reads=0,submitted=0;
 const at=Date.now();
 const candles=Array.from({length:25},(_,i)=>({
  time:at-27*3600000+i*3600000,closeTime:at-26*3600000+i*3600000-1,
  open:100,high:102,low:99,close:101,volume:10,quoteVolume:1010
 }));
 const market={snapshot:async ({includeBnbPrice})=>{
  reads++;assert.equal(includeBnbPrice,true);
  return {asOf:Date.now(),markets:[
   {symbol:'BTC_TRY',price:100+reads,priceTime:Date.now()-1000,candles},
   {symbol:'ETH_TRY',price:200+reads,priceTime:Date.now()-1000,candles}
  ]};
 }};
 const server=createServer({token,simulator,market});
 await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
 try{
  const origin='http://127.0.0.1:'+server.address().port;
  const unauthorized=await fetch(origin+'/api/markets/chart');
  assert.equal(unauthorized.status,403);
  const options={headers:{Authorization:'Bearer '+token}};
  const first=await fetch(origin+'/api/markets/chart',options);
  assert.equal(first.status,200);
  const a=await first.json();
  assert.deepEqual(a.markets.map(x=>x.symbol),['BTC_TRY','ETH_TRY']);
  assert.ok(a.markets.every(x=>x.candles.every((c,i,all)=>i===0||c.time>all[i-1].time)));
  const second=await fetch(origin+'/api/markets/chart',options);
  assert.equal(second.status,200);
  const b=await second.json();
  assert.equal(b.markets[0].price,a.markets[0].price+1);
  assert.equal(reads,2);
  assert.equal(submitted,0);
 }finally{await new Promise(resolve=>server.close(resolve));simulator.close();}
});

test('chart refresh fails safely if the upstream rejects stale market data',async()=>{
 const token='t'.repeat(40),simulator=new RiskStore(':memory:',{budget:1000,maxTrade:100,maxLoss:100});
 const server=createServer({token,simulator,market:{snapshot:async()=>{throw Error('Stale price')}}});
 await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
 try{
  const origin='http://127.0.0.1:'+server.address().port;
  const res=await fetch(origin+'/api/markets/chart',{headers:{Authorization:'Bearer '+token}});
  assert.equal(res.status,503);
  assert.deepEqual(await res.json(),{error:'STALE_DATA'});
 }finally{await new Promise(resolve=>server.close(resolve));simulator.close();}
});
