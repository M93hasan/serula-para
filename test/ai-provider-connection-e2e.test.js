import test from 'node:test';
import assert from 'node:assert/strict';
import {CloudAIService} from '../engine/cloud-ai-service.js';
import {AIAnalyst} from '../engine/ai-analyst.js';

const fixedTime=1793982000000;
const account={provider:'openai',principal:'local-desktop'};
function stored(){return {openForAnalysis:({principal,provider})=>{
  assert.equal(principal,'local-desktop');assert.ok(['openai','gemini'].includes(provider));
  return {apiKey:'sk-mock-private',model:provider==='openai'?'gpt-4o-mini':'gemini-2.5-flash'};
}};}
test('saved OpenAI and Gemini keys verify against fixed official metadata URLs without sending secrets to UI',async()=>{
  const requests=[];
  const service=new CloudAIService({vault:stored(),clock:()=>fixedTime,
    fetchImpl:async(url,opts)=>{requests.push({url,opts});return new Response('{}',{status:200});}});
  const result=await service.verifyConnection({...account});
  assert.deepEqual(result,{provider:'openai',model:'gpt-4o-mini',verified:true,status:'API_OK'});
  assert.equal(requests[0].url,'https://api.openai.com/v1/models/gpt-4o-mini');
  assert.equal(requests[0].opts.method,'GET');
  assert.equal(requests[0].opts.headers.Authorization,'Bearer sk-mock-private');
  assert.equal(JSON.stringify(result).includes('sk-mock'),false);
  const second=new CloudAIService({vault:stored(),clock:()=>fixedTime,
    fetchImpl:async(url,opts)=>{requests.push({url,opts});return new Response('{}',{status:200});}});
  assert.equal((await second.verifyConnection({provider:'gemini',principal:'local-desktop'})).verified,true);
  assert.equal(requests[1].url,'https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash');
  assert.equal(requests[1].opts.headers['x-goog-api-key'],'sk-mock-private');
  assert.ok(!requests.some(req=>req.url.includes('sk-mock-private')));
});
test('provider failure and authentication denial cannot become verified; keys are never echoed',async()=>{
  const statuses=[401,403,404,429,503],expected=['AUTH_REJECTED','ACCESS_DENIED','MODEL_UNAVAILABLE','RATE_LIMITED','PROVIDER_UNAVAILABLE'];
  for(let i=0;i<statuses.length;i++){
    const service=new CloudAIService({vault:stored(),fetchImpl:async()=>new Response('',{status:statuses[i]})});
    const result=await service.verifyConnection({...account});
    assert.equal(result.status,expected[i]);assert.equal(result.verified,false);
    assert.ok(!JSON.stringify(result).includes('sk-mock-private'));
  }
  const offline=new CloudAIService({vault:stored(),fetchImpl:async()=>{throw Error('offline');}});
  assert.equal((await offline.verifyConnection({...account})).status,'NETWORK_ERROR');
});
function snapshot(){
  const now=fixedTime;
  const lastOpen=Math.floor((now-3600000)/3600000)*3600000;
  const candles=Array.from({length:20},(_,index)=>({
    time:lastOpen-(19-index)*3600000,
    closeTime:lastOpen-(19-index)*3600000+3600000-1,
    open:100,high:105,low:95,close:101,volume:100
  }));
  return {symbol:'BTC_TRY',price:101,priceTime:now-1000,candles};
}
test('market + signed-news evidence + model roles remain BEKLE without verified budget and risk',async()=>{
  let messages=0;
  const analyst=new AIAnalyst({
    model:'test-model',clock:()=>fixedTime,
    loadNews:async()=>({article:'Verified market commentary.',evidence:{
      verified:true,symbol:'BTC_TRY',source:'trusted',issuedAt:fixedTime-3000,expiresAt:fixedTime+60000
    }}),
    fetchImpl:async(url,options)=>{
      assert.equal(url,'http://127.0.0.1:11434/api/chat');
      const body=JSON.parse(options.body);
      assert.equal(body.messages[1].content.includes('sk-mock-private'),false);
      messages++;
      return new Response(JSON.stringify({message:{content:JSON.stringify({analysis:'Kamuya açık verilere dayalı kısa yorum.'})}}),{status:200});
    }
  });
  const result=await analyst.analyze(snapshot(),{catalogApproved:true});
  assert.equal(messages,5);
  assert.equal(result.newsVerified,true);
  assert.equal(result.action,'BEKLE');
  assert.match(result.reason,/risk/i);
});
test('disconnected provider yields BEKLE; stale price prevents model call',async()=>{
  const unavailable=new AIAnalyst({model:'test-model',clock:()=>fixedTime,loadNews:async()=>null,
    fetchImpl:async()=>{throw Error('network offline');}});
  const fail=await unavailable.analyze(snapshot(),{catalogApproved:true});
  assert.equal(fail.action,'BEKLE');assert.equal(fail.errorCode,'MODEL_CONNECTION_ERROR');
  let requested=0;
  const stale=new AIAnalyst({model:'test-model',clock:()=>fixedTime,fetchImpl:async()=>{requested++;throw Error('unexpected');}});
  const input=snapshot();input.priceTime=fixedTime-400000;
  const result=await stale.analyze(input,{catalogApproved:true});
  assert.equal(result.action,'BEKLE');assert.equal(requested,0);
});
