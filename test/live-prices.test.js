import test from 'node:test';
import assert from 'node:assert/strict';
import { MarketData } from '../engine/market-data.js';

test('BTC/TRY and ETH/TRY prices load through read-only public endpoints', async () => {
  const now=Date.now(),paths=[];
  const fetchImpl=async url=>{
    paths.push(String(url));
    const symbol=new URL(url).searchParams.get('symbol');
    assert.ok(['BTCTRY','ETHTRY'].includes(symbol));
    return {ok:true,status:200,json:async()=>[{price:symbol==='BTCTRY'?'3800000':'110000',time:now}],headers:{get:()=>null}};
  };
  const result=await new MarketData({fetchImpl,clock:()=>now}).prices();
  assert.deepEqual(result.markets.map(x=>x.symbol),['BTC_TRY','ETH_TRY']);
  assert.deepEqual(result.markets.map(x=>x.price),[3800000,110000]);
  assert.equal(result.markets[0].priceTime,now);
  assert.ok(paths.every(x=>x.startsWith('https://api.binance.me/api/v3/trades?')));
});

test('old last trade is rejected instead of being presented as live', async () => {
  const now=Date.now();
  const fetchImpl=async()=>({ok:true,status:200,json:async()=>[{price:'1',time:now-301000}],headers:{get:()=>null}});
  await assert.rejects(new MarketData({fetchImpl,clock:()=>now}).prices(),/Stale price/);
});
