import {test} from 'node:test';
import assert from 'node:assert/strict';
import {analyzeMarket,MarketScanner} from '../engine/market-scanner.js';
const now=1700000000000,hour=3600000,end=Math.floor(now/hour)*hour;
const candles=Array.from({length:40},(_,i)=>({time:end-(40-i)*hour,closeTime:end-(39-i)*hour-1,open:100+i,high:102+i,low:99+i,close:101+i,volume:10,quoteVolume:1000}));
const book={bids:[['139.9','100']],asks:[['140.1','100']]};
test('market metrics reject invalid and stale data and expose costs in quote units',()=>{
 const m=analyzeMarket(candles,book,now);assert.ok(m.rsi>50);assert.ok(m.macd>0);assert.ok(m.spread>0);assert.equal(m.volume24,24000);assert.ok(m.estimatedRoundTripCost>m.spread);assert.throws(()=>analyzeMarket(candles,{bids:[['1','1']],asks:[['0.5','1']]},now));assert.throws(()=>analyzeMarket(candles,book,now+4*hour));
});
test('scanner selects catalogue pairs, labels unsupported types, and never sends keys',async()=>{
 const requests=[],u={discover:async()=>({exchangeTime:now,markets:[{symbol:'SOL_TRY',baseAsset:'SOL',quoteAsset:'TRY',type:1},{symbol:'ABC_USDT',baseAsset:'ABC',quoteAsset:'USDT',type:3}]})};
 const f=async(url,options)=>{requests.push({url,options});let data=url.includes('klines')?candles.map(c=>[c.time,c.open,c.high,c.low,c.close,c.volume,c.closeTime,c.quoteVolume]):url.includes('depth')?book:[{price:'140',time:now-1000}];return new Response(JSON.stringify(data));};
 const scan=new MarketScanner({universe:u,fetchImpl:f,clock:()=>now,sleep:async()=>{}});scan.start();for(let i=0;i<20&&scan.status().status==='running';i++)await new Promise(r=>setImmediate(r));const state=scan.status();assert.equal(state.status,'complete');assert.equal(state.results[0].status,'candidate');assert.equal(state.results[1].status,'unsupported');assert.equal(requests.length,3);assert.ok(requests.every(x=>x.options.method==='GET'&&!JSON.stringify(x.options).includes('APIKEY')));
});
test('regional restrictions stop the scan without reporting remaining pairs as analyzed',async()=>{
 const scanner=new MarketScanner({universe:{discover:async()=>({exchangeTime:now,markets:[{symbol:'XRP_TRY',type:1},{symbol:'BTC_TRY',type:1}]})},fetchImpl:async()=>new Response('',{status:451}),clock:()=>now,sleep:async()=>{}});scanner.start();for(let i=0;i<20&&scanner.status().status==='running';i++)await new Promise(r=>setImmediate(r));assert.equal(scanner.status().status,'REGION_RESTRICTED');assert.equal(scanner.status().results.length,0);
});
