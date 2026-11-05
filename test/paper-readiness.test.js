import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createServer} from '../engine/server.js';
import {RiskStore} from '../engine/store.js';
import {PaperStore} from '../engine/paper-store.js';
import {ollamaStatus} from '../engine/ollama-status.js';
test('synthetic candidate and AI cannot bypass disabled execution and missing news',async()=>{
 const now=Date.now(),token='x'.repeat(40),simulator=new RiskStore(':memory:',{budget:1000,maxTrade:100,maxLoss:100}),paper=new PaperStore(':memory:',{feeBps:10,slippageBps:10,quotes:[{asset:'TRY',budget:1000,maxTrade:100,maxExposure:500,maxAsset:100,maxLoss:100}]});
 const candidate={symbol:'SOL_TRY',status:'candidate',asOf:now,priceTime:now,indicators:{estimatedRoundTripCost:.01}},scanner={status:()=>({results:[candidate]})},universe={discover:async()=>({exchangeTime:Date.now(),markets:[{symbol:'SOL_TRY',type:1,filtersPresent:true}]})},ai={analyze:async()=>({symbol:'SOL_TRY',time:Date.now(),action:'AL',newsVerified:true})};
 const server=createServer({token,simulator,paper,scanner,universe,ai});await new Promise(r=>server.listen(0,'127.0.0.1',r));try{const origin=`http://127.0.0.1:${server.address().port}`,headers={Authorization:`Bearer ${token}`,Origin:origin,'Sec-Fetch-Site':'same-origin','Content-Type':'application/json','X-Para-Request':'1'},post=(url,body='{}')=>fetch(origin+url,{method:'POST',headers,body});
 assert.equal((await fetch(origin+'/api/paper/readiness',{method:'POST'})).status,403);assert.equal((await fetch(origin+'/api/paper/readiness',{method:'POST',headers:{...headers,Origin:'http://evil.example'},body:'{}'})).status,403);assert.equal((await post('/api/paper/start')).status,200);assert.equal((await post('/api/ai/scan-best')).status,200);const result=await (await post('/api/paper/readiness')).json();assert.equal(result.action,'BEKLE');assert.equal(result.eligible,false);assert.ok(result.reasons.includes('VERIFIED_NEWS_UNAVAILABLE'));assert.ok(result.reasons.includes('PAPER_EXECUTION_DISABLED'));assert.equal(paper.status().positions.length,0);assert.equal(paper.gateHistory().length,1);assert.equal((await post('/api/paper/readiness','{"action":"AL"}')).status,503);assert.equal((await post('/api/paper/execute')).status,404);
 }finally{await new Promise(r=>server.close(r));paper.close();simulator.close();}
});
test('Ollama health uses fixed loopback and reports model availability without prompts',async()=>{
 let request;const result=await ollamaStatus({model:'demo:latest',fetchImpl:async(url,opts)=>{request={url,opts};return new Response(JSON.stringify({models:[{name:'demo:latest'}]}));}});assert.equal(result.available,true);assert.equal(request.url,'http://127.0.0.1:11434/api/tags');assert.equal(request.opts.method,'GET');assert.equal(request.opts.body,undefined);assert.equal((await ollamaStatus({model:'bad/model'})).reason,'MODEL_NOT_CONFIGURED');assert.equal((await ollamaStatus({model:'demo',fetchImpl:async()=>{throw Error('private');}})).reason,'OLLAMA_UNAVAILABLE');
});
