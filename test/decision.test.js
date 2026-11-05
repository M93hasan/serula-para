import {test} from 'node:test';
import assert from 'node:assert/strict';
import {decide,selectMarket} from '../engine/decision.js';
import {backtest} from '../engine/backtest.js';
import {MarketData} from '../engine/market-data.js';
const H=3600000, base=1700000000000;
const candle=(i,close)=>({time:base+i*H,closeTime:base+(i+1)*H-1,open:close,high:close,low:close,close,volume:1,quoteVolume:10});
test('trend decision is deterministic and confidence is signal strength',()=>{
 const up=Array.from({length:30},(_,i)=>candle(i,100+i));const down=up.map((c,i)=>({...c,close:200-i}));
 assert.equal(decide('BTC_TRY',up).action,'AL');assert.equal(decide('BTC_TRY',down).action,'SAT');assert.equal(decide('BTC_TRY',up.slice(0,5)).action,'BEKLE');
 assert.ok(decide('BTC_TRY',up).score<=100);assert.equal(selectMarket([{symbol:'BTC_TRY',candles:up},{symbol:'ETH_TRY',candles:up.map(c=>({...c,quoteVolume:100}))}]).symbol,'ETH_TRY');
});
test('backtest uses next open, charges fees, honors trade cap and rejects invalid limits',()=>{
 const cs=Array.from({length:50},(_,i)=>candle(i,100+i));const r=backtest('BTC_TRY',cs,{budget:1000,maxTrade:100,maxLoss:200,feeRate:.01});
 assert.ok(r.trades.length);assert.equal(r.trades[0].signalTime,cs[19].closeTime);assert.equal(r.trades[0].time,cs[20].time);assert.equal(r.trades[0].fee,1);assert.ok(r.trades[0].notional<=100);assert.ok(r.equity<1000+50);
 assert.throws(()=>backtest('BTC_TRY',cs,{budget:100,maxTrade:101,maxLoss:20,feeRate:0}));
});
test('future prices do not alter earlier decisions or executed trades',()=>{
 const cs=Array.from({length:60},(_,i)=>candle(i,100+i));const modified=cs.map((x,i)=>i>=40?candle(i,300-i):x);
 const opts={budget:1000,maxTrade:100,maxLoss:200,feeRate:.001};
 const before=backtest('BTC_TRY',cs,opts).trades.filter(t=>t.time<cs[40].time);const after=backtest('BTC_TRY',modified,opts).trades.filter(t=>t.time<cs[40].time);
 assert.deepEqual(before,after);assert.deepEqual(decide('BTC_TRY',cs.slice(0,40)),decide('BTC_TRY',modified.slice(0,40)));
});
test('loss threshold prevents new buys and liquidates at next open',()=>{
 const cs=Array.from({length:45},(_,i)=>candle(i,i<22?100+i:30));const r=backtest('BTC_TRY',cs,{budget:1000,maxTrade:100,maxLoss:10,feeRate:0});assert.equal(r.halted,true);assert.deepEqual(r.trades.map(t=>t.action),['AL','SAT']);assert.equal(r.trades[1].time,cs[23].time);
});
test('market adapter uses TR documented endpoints and rejects open or stale candles',async()=>{
 const now=base+31*H+1000, all=Array.from({length:32},(_,i)=>[base+i*H,'100','101','99','100','5',base+(i+1)*H-1,'500']);let urls=[];
 const fetchImpl=async url=>{urls.push(url);return new Response(JSON.stringify(url.includes('klines')?all:[{price:'100.2',time:now-1000}]));};
 const exchange={time:async()=>({timestamp:now}),symbols:async()=>({data:{list:[{type:1,symbol:'BTC_TRY',spotTradingEnable:1}]}})};
 const market=new MarketData({fetchImpl,clock:()=>now,exchange});const result=await market.snapshot();assert.equal(result.markets[0].candles.length,31);assert.match(urls[0],/^https:\/\/api\.binance\.me\/api\/v1\/klines\?symbol=BTCTRY/);assert.match(urls[1],/\/api\/v3\/trades\?/);
 await assert.rejects(market.snapshot());
 const stale=new MarketData({fetchImpl:async url=>new Response(JSON.stringify(url.includes('klines')?all:[{price:'1',time:now-999999}])),clock:()=>now,exchange});await assert.rejects(stale.snapshot());
});
test('analysis endpoint enforces local authentication and origin',async()=>{
 const {createServer}=await import('../engine/server.js');const {RiskStore}=await import('../engine/store.js');const store=new RiskStore(':memory:',{budget:1000,maxTrade:100,maxLoss:100}),token='z'.repeat(40);
 const candles=Array.from({length:40},(_,i)=>candle(i,100+i)),market={snapshot:async()=>({asOf:base+40*H,markets:[{symbol:'BTC_TRY',price:145,priceTime:base+40*H-1000,candles}]})};
 const server=createServer({token,simulator:store,market});await new Promise(r=>server.listen(0,'127.0.0.1',r));
 try{const origin=`http://127.0.0.1:${server.address().port}`,url=origin+'/api/analysis',headers={Authorization:`Bearer ${token}`,Origin:origin,'Sec-Fetch-Site':'same-origin','Content-Type':'application/json','X-Para-Request':'1'},body=JSON.stringify({budget:1000,maxTrade:100,maxLoss:50,feeRate:.001});
  assert.equal((await fetch(url,{method:'POST',headers:{...headers,Origin:'https://evil.example'},body})).status,403);
  assert.equal((await fetch(url,{method:'POST',headers:{...headers,Authorization:'Bearer wrong'},body})).status,403);
  const response=await fetch(url,{method:'POST',headers,body});assert.equal(response.status,200);const result=await response.json();assert.equal(result.decision.action,'AL');assert.equal(result.symbol,'BTC_TRY');assert.equal(result.backtest.trades[0].time,candles[20].time);
 }finally{await new Promise(r=>server.close(r));store.close();}
});
test('historical backtest uses fixed symbol even when later volume changes automatic selection',async()=>{
 const {createServer}=await import('../engine/server.js');const {RiskStore}=await import('../engine/store.js');const store=new RiskStore(':memory:',{budget:1000,maxTrade:100,maxLoss:100}),token='x'.repeat(40);
 const candles=Array.from({length:40},(_,i)=>candle(i,100+i));const other=candles.map(c=>({...c,quoteVolume:10000}));const market={snapshot:async()=>({asOf:base+40*H,markets:[{symbol:'BTC_TRY',price:10,priceTime:base,candles},{symbol:'ETH_TRY',price:20,priceTime:base,candles:other}]})};const server=createServer({token,simulator:store,market});await new Promise(r=>server.listen(0,'127.0.0.1',r));
 try{const origin=`http://127.0.0.1:${server.address().port}`;const headers={Authorization:`Bearer ${token}`,Origin:origin,'Sec-Fetch-Site':'same-origin','Content-Type':'application/json','X-Para-Request':'1'};const res=await fetch(origin+'/api/analysis',{method:'POST',headers,body:JSON.stringify({symbol:'BTC_TRY',budget:1000,maxTrade:100,maxLoss:50,feeRate:.001})});const body=await res.json();assert.equal(body.symbol,'BTC_TRY');assert.equal(body.automaticDecision.symbol,'ETH_TRY');assert.equal(body.backtest.curve.length,candles.length);assert.deepEqual(body.backtest.trades,backtest('BTC_TRY',candles,{budget:1000,maxTrade:100,maxLoss:50,feeRate:.001}).trades);
 }finally{await new Promise(r=>server.close(r));store.close();}
});
