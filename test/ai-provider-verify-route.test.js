import test from 'node:test';
import assert from 'node:assert/strict';
import {RiskStore} from '../engine/store.js';
import {createServer} from '../engine/server.js';
import {CloudAIService} from '../engine/cloud-ai-service.js';

test('authenticated saved-key verification endpoint rejects unauthorized, CSRF, and client-controlled identity',async()=>{
  const sim=new RiskStore(':memory:',{budget:1000,maxTrade:100,maxLoss:100});
  const token='q'.repeat(40),seen=[];
  const vault={
    status:()=>[{provider:'openai',configured:true}],
    openForAnalysis:input=>{seen.push(input);return {apiKey:'sk-test-never-expose',model:'gpt-4o-mini'};}
  };
  const service=new CloudAIService({vault,fetchImpl:async()=>new Response('{}',{status:200})});
  const server=createServer({token,simulator:sim,aiProviders:vault,cloudAIService:service,
    googleAuth:{configured:false,user:()=>null,handle:async()=>null,close:()=>{}}});
  await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
  try{
    const origin='http://127.0.0.1:'+server.address().port;
    const path='/api/ai/providers/verify';
    const headers={Authorization:'Bearer '+token,Origin:origin,'Sec-Fetch-Site':'same-origin',
      'Content-Type':'application/json','X-Para-Request':'1'};
    const post=(data,h=headers)=>fetch(origin+path,{method:'POST',headers:h,body:JSON.stringify(data)});
    assert.equal((await post({provider:'openai'},{})).status,403);
    assert.equal((await post({provider:'openai'},{...headers,Origin:'http://evil.example'})).status,403);
    assert.equal((await post({provider:'openai',principal:'google:other'})).status,400);
    assert.equal((await post({provider:'anthropic'})).status,400);
    const response=await post({provider:'openai'});
    assert.equal(response.status,200);
    const result=await response.json();
    assert.equal(result.status,'API_OK');assert.equal(result.verified,true);
    assert.ok(!JSON.stringify(result).includes('sk-test-never-expose'));
    assert.deepEqual(seen,[{provider:'openai',principal:'local-desktop'}]);
  }finally{await new Promise(resolve=>server.close(resolve));sim.close();}
});
