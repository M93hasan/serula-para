import {test} from 'node:test';
import assert from 'node:assert/strict';
import {analyzeMarket,MarketScanner,estimateDepth} from '../engine/market-scanner.js';
const now=1700000000000,hour=3600000,end=Math.floor(now/hour)*hour;
const candles=Array.from({length:40},(_,i)=>({time:end-(40-i)*hour,closeTime:end-(39-i)*hour-1,open:100+i,high:102+i,low:99+i,close:101+i,volume:10,quoteVolume:1000}));
const book={bids:[['139.9','100']],asks:[['140.1','100']]};
test('depth estimate accounts for multiple levels and rejects insufficient liquidity',()=>{const b={asks:[['10','1'],['11','2']],bids:[['9','1'],['8','2']]};const buy=estimateDepth(b,'AL',2),sell=estimateDepth(b,'SAT',2);assert.equal(buy.average,10.5);assert.ok(buy.slippage>0);assert.equal(sell.average,8.5);assert.equal(estimateDepth(b,'AL',4).available,false);assert.throws(()=>estimateDepth({asks:[['11','1'],['10','1']]},'AL',1));});
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

const settle=async scanner=>{for(let i=0;i<30&&scanner.status().status==='running';i++)await new Promise(r=>setImmediate(r));};
for(const status of [418,429])for(const header of ['120',new Date(now+120000).toUTCString(),'invalid']){
 test(`rate limit ${status} honors ${header} without requesting later pairs`,async()=>{
  let clock=now,calls=0;
  const scanner=new MarketScanner({universe:{discover:async()=>({exchangeTime:now,markets:[{symbol:'BTC_TRY',type:1},{symbol:'SOL_TRY',type:1}]})},clock:()=>clock,sleep:async()=>{},fetchImpl:async()=>{calls++;return new Response('',{status,headers:{'Retry-After':header}});}});
  scanner.start();assert.throws(()=>scanner.start(),/SCAN_BUSY/);await settle(scanner);
  assert.equal(scanner.status().status,'RATE_LIMIT');assert.equal(scanner.status().results.length,0);assert.equal(calls,1);
  clock=now+(header==='invalid'?59000:119000);assert.throws(()=>scanner.start(),/SCAN_BUSY/);assert.equal(calls,1);
  clock=now+(header==='invalid'?60000:120000);scanner.start();await settle(scanner);assert.equal(calls,2);
 });
}
