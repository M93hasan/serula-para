import { test } from 'node:test';
import assert from 'node:assert/strict';
import { MarketUniverse } from '../engine/market-universe.js';
const now=1700000000000;
const pair=(base,quote,enabled=1,type=1)=>({symbol:`${base}_${quote}`,baseAsset:base,quoteAsset:quote,spotTradingEnable:enabled,type});
test('discovers arbitrary active pairs, includes types and quote assets, and caches concurrent requests',async()=>{
 let calls=0;const exchange={symbols:async()=>{calls++;return {code:0,timestamp:now,data:{list:[pair('SOL','TRY'),pair('SOL','USDT'),pair('XRP','TRY',1,3),pair('OLD','TRY',0)]}}}};
 const u=new MarketUniverse({exchange,clock:()=>now});const [a,b]=await Promise.all([u.discover(),u.discover()]);assert.equal(calls,1);assert.equal(a,b);assert.equal(a.listed,4);assert.equal(a.eligible,3);assert.deepEqual(a.markets.map(x=>x.symbol),['SOL_TRY','SOL_USDT','XRP_TRY']);assert.ok(a.markets.every(x=>x.analysisStatus==='NOT_SCANNED'));
});
test('rejects stale, duplicate, or invalid catalogues without returning cached guesses',async()=>{
 for(const response of [{code:0,timestamp:now-120001,data:{list:[pair('BTC','TRY')]}},{code:0,timestamp:now,data:{list:[pair('BTC','TRY'),pair('BTC','TRY')]}},{code:0,timestamp:now,data:{list:[{...pair('BTC','TRY'),symbol:'BTC_ETH'}]}}]){const u=new MarketUniverse({clock:()=>now,exchange:{symbols:async()=>response}});await assert.rejects(u.discover());}
});
test('exchange filter fields are retained without inventing missing values',async()=>{
 const market={...pair('SOL','TRY'),filters:[{filterType:'PRICE_FILTER',tickSize:'0.01'},{filterType:'LOT_SIZE',stepSize:'0.001',minQty:'0.01'}]};
 const u=new MarketUniverse({clock:()=>now,exchange:{symbols:async()=>({code:0,timestamp:now,data:{list:[market]}})}});const [result]=(await u.discover()).markets;assert.equal(result.filters.tickSize,'0.01');assert.equal(result.filters.minNotional,null);assert.equal(result.filtersPresent,false);
});
