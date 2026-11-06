import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,readFileSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {AIProviderVault} from '../engine/ai-provider-vault.js';
import {CloudAIService} from '../engine/cloud-ai-service.js';
import {RiskStore} from '../engine/store.js';
import {createServer} from '../engine/server.js';

const passphrase='local-only-password-123',secret='FAKE_PROVIDER_SECRET_123';
const snapshot=()=>{const now=Date.now();return {symbol:'BTC_TRY',price:100,priceTime:now-1000,candles:Array.from({length:20},(_,i)=>({time:now-(21-i)*3600000,closeTime:now-(20-i)*3600000-1,open:99,high:101,low:98,close:100,volume:10})),apiKey:'DO_NOT_SEND_EXCHANGE_KEY',secretKey:'DO_NOT_SEND_EXCHANGE_SECRET'};};
test('provider vault encrypts, does not return secrets in status and requires password for change/delete',()=>{
 const dir=mkdtempSync(join(tmpdir(),'para-provider-'));try{const v=new AIProviderVault({directory:dir});v.save({provider:'openai',apiKey:secret,model:'test-model',passphrase});const file=readFileSync(join(dir,'openai.vault'),'utf8');assert.ok(!file.includes(secret));assert.ok(!JSON.stringify(v.status()).includes(secret));assert.throws(()=>v.save({provider:'openai',apiKey:'new',model:'test-model',passphrase:'incorrect-password',replace:true}));assert.throws(()=>v.remove({provider:'openai',passphrase:'incorrect-password'}));assert.throws(()=>v.save({provider:'../escape',apiKey:secret,model:'test',passphrase}));v.save({provider:'openai',apiKey:'new',model:'test-model',passphrase,replace:true});v.remove({provider:'openai',passphrase});assert.equal(v.status().find(x=>x.provider==='openai').configured,false);}finally{rmSync(dir,{recursive:true,force:true});}
});
test('cloud adapters use fixed provider URLs and never put exchange keys or provider secrets in model prompts',async()=>{
 const urls={openai:'https://api.openai.com/',deepseek:'https://api.deepseek.com/',anthropic:'https://api.anthropic.com/',gemini:'https://generativelanguage.googleapis.com/',ollama_cloud:'https://ollama.com/'};
 for(const provider of Object.keys(urls)){const calls=[];const vault={openForAnalysis:()=>({apiKey:secret,model:'test-model'})};const fetchImpl=async(url,opts)=>{calls.push({url,opts});const content=JSON.stringify({analysis:'Örnek değerlendirme'});const json=provider==='anthropic'?{content:[{type:'text',text:content}]}:provider==='gemini'?{candidates:[{content:{parts:[{text:content}]}}]}:provider==='ollama_cloud'?{message:{content}}:{choices:[{message:{content}}]};return new Response(JSON.stringify(json),{headers:{'Content-Type':'application/json'}});};const service=new CloudAIService({vault,fetchImpl});const result=await service.analyze({provider,passphrase,snapshot:snapshot()});assert.equal(result.action,'BEKLE');assert.equal(result.provider,provider);assert.equal(result.roles.length,6);assert.equal(calls.length,5);for(const c of calls){assert.ok(c.url.startsWith(urls[provider]));assert.equal(c.opts.redirect,'error');assert.ok(!c.opts.body.includes(secret));assert.ok(!c.opts.body.includes('DO_NOT_SEND_EXCHANGE'));}assert.ok(!JSON.stringify(result).includes(secret));}
});
test('cloud failures do not disclose errors and remain BEKLE',async()=>{
 const service=new CloudAIService({vault:{openForAnalysis:()=>({apiKey:secret,model:'test-model'})},fetchImpl:async()=>{throw Error(secret)}});const result=await service.analyze({provider:'openai',passphrase,snapshot:snapshot()});assert.equal(result.action,'BEKLE');assert.ok(!JSON.stringify(result).includes(secret));
});
test('provider settings require token and same-origin, never return stored secrets',async()=>{
 const dir=mkdtempSync(join(tmpdir(),'para-provider-api-')),v=new AIProviderVault({directory:dir}),simulator=new RiskStore(':memory:',{budget:1000,maxTrade:100,maxLoss:100}),token='x'.repeat(40),server=createServer({token,simulator,aiProviders:v});await new Promise(r=>server.listen(0,'127.0.0.1',r));
 try{const origin='http://127.0.0.1:'+server.address().port,headers={Authorization:'Bearer '+token,Origin:origin,'Sec-Fetch-Site':'same-origin','Content-Type':'application/json','X-Para-Request':'1'},body=JSON.stringify({provider:'gemini',apiKey:secret,model:'test-model',passphrase,replace:false});
 assert.equal((await fetch(origin+'/api/ai/providers')).status,403);assert.equal((await fetch(origin+'/api/ai/providers/save',{method:'POST',headers:{...headers,Origin:'http://evil.example'},body})).status,403);assert.equal((await fetch(origin+'/api/ai/providers/save',{method:'POST',headers,body})).status,200);assert.equal((await fetch(origin+'/api/ai/providers/analyze',{method:'POST',headers,body:JSON.stringify({provider:'gemini',passphrase,symbol:'BTC_TRY',consent:false})})).status,400);assert.equal((await fetch(origin+'/api/ai/providers/analyze',{method:'POST',headers,body:JSON.stringify({provider:'gemini',passphrase,symbol:'BTC_TRY',consent:true})})).status,400);const response=await (await fetch(origin+'/api/ai/providers',{headers:{Authorization:'Bearer '+token}})).text();assert.ok(!response.includes(secret));assert.ok(!response.includes(passphrase));assert.equal(JSON.parse(response).providers.find(x=>x.provider==='gemini').configured,true);
 }finally{await new Promise(r=>server.close(r));simulator.close();rmSync(dir,{recursive:true,force:true});}
});

test('local API sends only public cached market data to an explicitly consented provider',async()=>{
 const dir=mkdtempSync(join(tmpdir(),'para-provider-flow-')),vault=new AIProviderVault({directory:dir}),simulator=new RiskStore(':memory:',{budget:1000,maxTrade:100,maxLoss:100}),token='x'.repeat(40);vault.save({provider:'openai',apiKey:secret,model:'test-model',passphrase});
 const calls=[],cloudAIService=new CloudAIService({vault,fetchImpl:async(url,opts)=>{calls.push({url,opts});return new Response(JSON.stringify({choices:[{message:{content:JSON.stringify({analysis:'Sadece araştırma'})}}]}),{headers:{'Content-Type':'application/json'}});}});
 const m=snapshot();m.candles=m.candles.map(c=>({...c,quoteVolume:100}));const market={snapshot:async()=>({asOf:Date.now(),markets:[m]})},universe={discover:async()=>({markets:[{symbol:'BTC_TRY',type:1}]})},server=createServer({token,simulator,aiProviders:vault,cloudAIService,market,universe});await new Promise(r=>server.listen(0,'127.0.0.1',r));
 try{const origin='http://127.0.0.1:'+server.address().port,headers={Authorization:'Bearer '+token,Origin:origin,'Sec-Fetch-Site':'same-origin','Content-Type':'application/json','X-Para-Request':'1'},post=(path,obj)=>fetch(origin+path,{method:'POST',headers,body:JSON.stringify(obj)});
 assert.equal((await post('/api/analysis',{symbol:'BTC_TRY',budget:1000,maxTrade:100,maxLoss:50,feeRate:.001})).status,200);const response=await post('/api/ai/providers/analyze',{provider:'openai',passphrase,symbol:'BTC_TRY',consent:true});assert.equal(response.status,200);const result=await response.json();assert.equal(result.provider,'openai');assert.equal(result.action,'BEKLE');assert.equal(calls.length,5);assert.ok(calls.every(x=>!x.opts.body.includes(secret)&&!x.opts.body.includes('DO_NOT_SEND_EXCHANGE')));assert.ok(!JSON.stringify(result).includes(secret));
 }finally{await new Promise(r=>server.close(r));simulator.close();rmSync(dir,{recursive:true,force:true});}
});

test('cloud request failures are not retried and repeated analyses are rate limited',async()=>{
 let calls=0;const service=new CloudAIService({vault:{openForAnalysis:()=>({apiKey:secret,model:'test-model'})},fetchImpl:async()=>{calls++;return new Response('',{status:429});}});
 const result=await service.analyze({provider:'openai',passphrase,snapshot:snapshot()});assert.equal(result.action,'BEKLE');assert.equal(calls,1);await assert.rejects(()=>service.analyze({provider:'openai',passphrase,snapshot:snapshot()}),/RATE_LIMIT/);assert.equal(calls,1);
});
