import {test} from 'node:test';
import assert from 'node:assert/strict';
import {AIAnalyst} from '../engine/ai-analyst.js';
const now=1700000000000;
const snapshot=()=>({symbol:'BTC_TRY',price:100,priceTime:now-1000,candles:Array.from({length:20},(_,i)=>({time:now-(21-i)*3600000,closeTime:now-(20-i)*3600000-1,open:99,high:101,low:98,close:100,volume:10})),apiKey:'DO-NOT-SEND',secretKey:'DO-NOT-SEND',passphrase:'DO-NOT-SEND'});
test('five local model roles use only public data and missing news forces BEKLE',async()=>{let calls=[];const agent=new AIAnalyst({clock:()=>now,model:'local-model',fetchImpl:async(url,options)=>{calls.push({url,body:options.body});return new Response(JSON.stringify({message:{content:JSON.stringify({analysis:'Örnek değerlendirme'})}}));}});for(const symbol of ['BTC_TRY','ETH_TRY']){const result=await agent.analyze({...snapshot(),symbol});assert.equal(result.roles.length,6);assert.equal(result.action,'BEKLE');assert.equal(result.newsVerified,false);assert.equal(result.model,'local-model');assert.equal(result.data.candleCount,20);}assert.equal(calls.length,10);assert.ok(calls.every(x=>x.url==='http://127.0.0.1:11434/api/chat'&&!x.body.includes('DO-NOT-SEND')&&JSON.parse(x.body).format.required.includes('analysis')));});
test('malformed model JSON and extra properties fail closed',async()=>{for(const content of ['not json','{}','{"analysis":"good","action":"AL"}','{"analysis":""}']){const agent=new AIAnalyst({clock:()=>now,model:'local',fetchImpl:async()=>new Response(JSON.stringify({message:{content}}))});const result=await agent.analyze(snapshot());assert.equal(result.action,'BEKLE');assert.match(result.reason,/model/);}});
test('stale, unclosed, missing model and model errors fail closed',async()=>{let calls=0;const agent=new AIAnalyst({clock:()=>now,model:'local',fetchImpl:async()=>{calls++;throw Error('secret should not escape');}});let stale=snapshot();stale.priceTime=now-300001;assert.equal((await agent.analyze(stale)).action,'BEKLE');assert.equal(calls,0);const old=snapshot();for(const c of old.candles){c.time-=10800000;c.closeTime-=10800000;}assert.match((await agent.analyze(old)).reason,/eski/);assert.equal(calls,0);let open=snapshot();open.candles[19].closeTime=now;assert.equal((await agent.analyze(open)).action,'BEKLE');assert.equal(calls,0);const r=await agent.analyze(snapshot());assert.equal(r.action,'BEKLE');assert.ok(!JSON.stringify(r).includes('secret should not escape'));assert.equal((await new AIAnalyst({clock:()=>now,model:''}).analyze(snapshot())).action,'BEKLE');});
test('AI history persists across local database restart',async()=>{const {RiskStore}=await import('../engine/store.js');const {mkdtempSync,rmSync}=await import('node:fs');const {tmpdir}=await import('node:os');const {join}=await import('node:path');const dir=mkdtempSync(join(tmpdir(),'para-ai-'));let store;try{const path=join(dir,'state.sqlite');store=new RiskStore(path,{budget:100,maxTrade:10,maxLoss:10});store.saveAI({time:now,symbol:'BTC_TRY',action:'BEKLE'});store.close();store=new RiskStore(path,{budget:100,maxTrade:10,maxLoss:10});assert.equal(store.aiHistory()[0].action,'BEKLE');}finally{store?.close();rmSync(dir,{recursive:true,force:true});}});
test('AI endpoint uses only server-cached market and requires same-origin authentication',async()=>{
 const {createServer}=await import('../engine/server.js');const {RiskStore}=await import('../engine/store.js');const store=new RiskStore(':memory:',{budget:1000,maxTrade:100,maxLoss:100}),token='x'.repeat(40);const m=snapshot();m.candles=m.candles.map(c=>({...c,quoteVolume:100}));let seen;
 const market={snapshot:async()=>({asOf:now,markets:[m]})};const ai={analyze:async input=>{seen=input;return {symbol:input.symbol,time:now,action:'BEKLE',roles:[],reason:'test'};}};const universe={discover:async()=>({markets:[{symbol:'BTC_TRY',type:1}]})};const server=createServer({token,simulator:store,market,universe,ai});await new Promise(r=>server.listen(0,'127.0.0.1',r));
 try{const origin=`http://127.0.0.1:${server.address().port}`,headers={Authorization:`Bearer ${token}`,Origin:origin,'Sec-Fetch-Site':'same-origin','Content-Type':'application/json','X-Para-Request':'1'};
  assert.equal((await fetch(origin+'/api/ai/analyze',{method:'POST',headers:{...headers,Origin:'http://evil.example'},body:'{"symbol":"BTC_TRY"}'})).status,403);
  assert.equal((await fetch(origin+'/api/analysis',{method:'POST',headers,body:JSON.stringify({symbol:'BTC_TRY',budget:1000,maxTrade:100,maxLoss:50,feeRate:.001})})).status,200);
  assert.equal((await fetch(origin+'/api/ai/analyze',{method:'POST',headers,body:JSON.stringify({symbol:'BTC_TRY',price:999})})).status,503);
  assert.equal((await fetch(origin+'/api/ai/analyze',{method:'POST',headers,body:'{"symbol":"BTC_TRY"}'})).status,200);assert.equal(seen.price,100);
  assert.equal((await (await fetch(origin+'/api/ai/history',{headers:{Authorization:`Bearer ${token}`}})).json()).history.length,1);
 }finally{await new Promise(r=>server.close(r));store.close();}
});

test('analysis rejects a mismatched model and data that expires during inference',async()=>{
 for(const mode of ['model','stale']) {let clock=now;const agent=new AIAnalyst({clock:()=>clock,model:'local',fetchImpl:async()=>{if(mode==='stale')clock+=300001;return new Response(JSON.stringify({model:mode==='model'?'unexpected':'local',message:{content:JSON.stringify({analysis:'Research'})}}));}});const result=await agent.analyze(snapshot());assert.equal(result.action,'BEKLE');assert.equal(result.roles.length,1);assert.match(result.reason,/geçersiz/);}
});

test('bounded timeout and sanitized diagnostic codes preserve BEKLE',async()=>{
 for(const timeoutMs of [0,Infinity,60001])assert.throws(()=>new AIAnalyst({timeoutMs}),/INVALID_AI_TIMEOUT/);
 for(const [error,code] of [[new DOMException('private','TimeoutError'),'MODEL_TIMEOUT'],[new Error('private-key'),'MODEL_CONNECTION_ERROR']]){
 const r=await new AIAnalyst({model:'local',clock:()=>now,fetchImpl:async()=>{throw error;}}).analyze(snapshot());assert.equal(r.errorCode,code);assert.equal(r.action,'BEKLE');assert.ok(!JSON.stringify(r).includes('private'));
 }
});
