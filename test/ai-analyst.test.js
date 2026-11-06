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
 const {createServer}=await import('../engine/server.js');const {RiskStore}=await import('../engine/store.js');const store=new RiskStore(':memory:',{budget:1000,maxTrade:100,maxLoss:100}),token='x'.repeat(40);const m=snapshot();m.priceTime=Date.now()-1000; // HTTP cache freshness uses the real server clock.
 m.candles=m.candles.map(c=>({...c,quoteVolume:100}));let seen;
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

test('compact local prompts preserve all validated candles and bound prior responses',async()=>{
 const requests=[];const input=snapshot();
 const agent=new AIAnalyst({clock:()=>now,model:'local',fetchImpl:async(_url,options)=>{
  requests.push(JSON.parse(options.body));return new Response(JSON.stringify({message:{content:JSON.stringify({analysis:'x'.repeat(1000)})}}));
 }});
 const result=await agent.analyze(input);assert.equal(result.action,'BEKLE');assert.equal(result.roles.length,6);assert.equal(requests.length,5);
 for(const request of requests){const prompt=JSON.parse(request.messages[1].content);assert.equal(prompt.facts.candles.length,20);assert.deepEqual(prompt.facts.candleColumns,['time','closeTime','open','high','low','close','volume']);assert.deepEqual(prompt.facts.candles[19],Object.values(input.candles[19]));assert.ok(prompt.previous.every(role=>role.text.length<=300));assert.equal(request.options.num_predict,120);assert.ok(!JSON.stringify(prompt).includes('DO-NOT-SEND'));}
});

test('five roles share a 60 second total deadline and fail closed',async()=>{
 let elapsed=0,calls=0;const agent=new AIAnalyst({clock:()=>now,monotonic:()=>elapsed,model:'local',fetchImpl:async()=>{calls++;elapsed+=20000;return new Response(JSON.stringify({message:{content:JSON.stringify({analysis:'fixture'})}}));}});
 const result=await agent.analyze(snapshot());assert.equal(result.action,'BEKLE');assert.equal(result.errorCode,'MODEL_TIMEOUT');assert.equal(calls,3);
});

test('operator-pinned signed news informs local research and expires fail closed', async () => {
  const { createHash, generateKeyPairSync, sign } = await import('node:crypto');
  const { createSignedNewsProvider } = await import('../engine/signed-news-provider.js');
  const { publicKey, privateKey } = generateKeyPairSync('ed25519');
  const endpoint = 'https://news.example.test/latest';
  const article = 'Fixture news about BTC.';
  const payload = JSON.stringify({
    source: 'fixture', url: endpoint, symbol: 'BTC_TRY', id: 'one',
    issuedAt: now - 1_000, expiresAt: now + 1_000,
    articleSha256: createHash('sha256').update(article).digest('hex'),
  });
  const signature = sign(null, Buffer.from(payload), privateKey).toString('base64');
  let clock = now;
  let mode = 'valid';
  const prompts = [];
  const loadNews = createSignedNewsProvider({
    source: 'fixture', endpoint,
    publicKey: publicKey.export({ type: 'spki', format: 'der' }).toString('base64'),
    clock: () => clock,
    fetchImpl: async (url, options) => {
      assert.equal(url, endpoint + '?symbol=BTC_TRY');
      assert.equal(options.redirect, 'error');
      assert.equal(options.method, 'GET');
      assert.ok(!Object.hasOwn(options.headers, 'Authorization'));
      const content = { payload, signature, article: mode === 'tampered' ? 'Wrong article' : article };
      if (mode === 'oversized') content.padding = 'x'.repeat(100_000);
      return Response.json(content);
    },
  });
  const analyst = new AIAnalyst({
    model: 'local', clock: () => clock, loadNews,
    fetchImpl: async (_url, options) => {
      prompts.push(JSON.parse(JSON.parse(options.body).messages[1].content));
      if (mode === 'expires') clock = now + 1_000;
      return Response.json({ message: { content: JSON.stringify({ analysis: 'Fixture analysis' }) } });
    },
  });

  const result = await analyst.analyze(snapshot());
  assert.equal(result.action, 'BEKLE');
  assert.equal(result.newsVerified, true);
  assert.equal(result.newsEvidence.contentTruthVerified, false);
  assert.equal(result.newsEvidence.source, 'fixture');
  assert.equal(prompts[0].facts.news.article, article);
  assert.ok(!JSON.stringify(prompts).includes('DO-NOT-SEND'));
  assert.ok(!JSON.stringify(result).includes(article));

  for (mode of ['tampered', 'oversized']) {
    const invalid = await analyst.analyze(snapshot());
    assert.equal(invalid.action, 'BEKLE');
    assert.equal(invalid.newsVerified, false);
    assert.equal(typeof prompts.at(-1).facts.news, 'string');
  }
  mode = 'expires';
  const expired = await analyst.analyze(snapshot());
  assert.equal(expired.action, 'BEKLE');
  assert.equal(expired.newsVerified, false);
  assert.equal(expired.errorCode, 'STALE_NEWS');
});
