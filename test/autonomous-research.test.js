import test from 'node:test';
import assert from 'node:assert/strict';
import { AutonomousResearch } from '../engine/autonomous-research.js';
import { cloudConnectivity } from '../engine/cloud-connectivity.js';

const now=1700000000000;
const candidate=()=>({symbol:'BTC_TRY',status:'candidate',asOf:now,priceTime:now,price:3000000,candles:Array.from({length:35},()=>({close:1})),researchSignal:'AL',indicators:{volume24:100000,spread:0.001,volatility:0.02,depthQuote:10000,estimatedRoundTripCost:0.005}});
function setup({status='complete',decision={symbol:'BTC_TRY',action:'AL',time:now,newsVerified:false,risk:'BELİRSİZ',roles:[]},results=[candidate()]}={}){
 const events=[],state={status,finishedAt:now,results};
 const scanner={status:()=>state};
 const store={status:()=>({halted:false}),halt:()=>events.push('halt'),saveAI:x=>events.push(x)};
 const analyst={analyze:async()=>decision};
 const mode=new AutonomousResearch({scanner,analyst,store,clock:()=>now});
 return {mode,events};
}
test('autonomous research logs BEKLE and does not execute an order',async()=>{
 const {mode,events}=setup();mode.setEnabled(true);await new Promise(resolve=>setImmediate(resolve));
 assert.equal(events.length,1);
 assert.equal(events[0].action,'BEKLE');
 assert.equal(events[0].proposedAction,'AL');
 assert.equal(events[0].autoResearch,true);
 assert.equal(mode.status().realOrdersEnabled,false);
 mode.close();
});
test('missing risk data halts research and simulator',async()=>{
 const {mode,events}=setup({results:[]});mode.setEnabled(true);await new Promise(resolve=>setImmediate(resolve));
 assert.equal(mode.status().enabled,false);
 assert.equal(mode.status().haltReason,'NO_SAFE_CANDIDATE');
 assert.equal(events.at(-1),'halt');
 assert.equal(events[0].action,'BEKLE');
 assert.ok(events[0].reason.includes('durduruldu'));
});
test('AI timeout fails closed and records no misleading signal',async()=>{
 const {mode,events}=setup({decision:{symbol:'BTC_TRY',action:'BEKLE',errorCode:'MODEL_TIMEOUT'}});
 mode.setEnabled(true);await new Promise(resolve=>setImmediate(resolve));
 assert.equal(mode.status().enabled,false);
 assert.equal(mode.status().haltReason,'AI_UNAVAILABLE');
 assert.equal(events.at(-1),'halt');
 assert.equal(events[0].action,'BEKLE');
 assert.ok(events[0].reason.includes('durduruldu'));
});
test('cloud connectivity never transmits keys and distinguishes reachability',async()=>{
 const calls=[];
 const providers=await cloudConnectivity({fetchImpl:async(url,options)=>{
  calls.push({url,options});
  return {status:401};
 }});
 assert.equal(providers.length,5);
 assert.ok(providers.every(p=>p.reachable&&p.credentialsVerified===false));
 assert.ok(calls.every(c=>c.options.method==='GET'&&!('headers' in c.options)&&c.options.redirect==='error'));
});
