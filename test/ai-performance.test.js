import { test } from 'node:test';
import assert from 'node:assert/strict';
import { evaluateAIHistory } from '../engine/ai-performance.js';
const hour=3600000, candle=(time,open=100,close=110)=>({time,closeTime:time+hour-1,open,close,high:Math.max(open,close),low:90});
test('only candles opening after completed decisions and latency enter independent AI measurement',()=>{
 const d={symbol:'BTC_TRY',startedAt:hour-1000,time:hour,action:'AL',model:'local',source:'Binance TR'},market=[{symbol:'BTC_TRY',candles:[candle(0),candle(hour),candle(hour*2),candle(hour*3)]}];
 const pending=evaluateAIHistory([d],market,{now:hour*3-2});assert.equal(pending.results[0].status,'pending');
 const r=evaluateAIHistory([d],market,{now:hour*3,feeRate:.01,slippageRate:.01}).results[0];assert.equal(r.entryTime,hour*2);assert.ok(Math.abs(r.simulatedReturn-((110*.99*.99)/(100*1.01*1.01)-1))<1e-12);assert.ok(r.maxAdverseMove<0);
 const delayed=evaluateAIHistory([d],market,{now:hour*4,delayMs:hour}).results[0];assert.equal(delayed.entryTime,hour*3);
});
test('hold and sell without a known position never create a profit or success rate',()=>{
 const ds=['BEKLE','SAT'].map(action=>({symbol:'ETH_TRY',startedAt:0,time:0,action}));const r=evaluateAIHistory(ds,[{symbol:'ETH_TRY',candles:[candle(hour)]}],{now:hour*2});assert.ok(r.results.every(x=>x.status==='observed'&&x.simulatedReturn===null));assert.equal('successRate' in r,false);assert.equal(evaluateAIHistory([{symbol:'ETH_TRY',time:0,action:'AL'}],[],{now:hour*2}).results[0].status,'invalid');
 assert.throws(()=>evaluateAIHistory(ds,[],{feeRate:-1}));
});
