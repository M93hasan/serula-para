import test from 'node:test';
import assert from 'node:assert/strict';
import {createWorker} from '../cloudflare/worker.js';

const origin='https://para.serula.site';
const req=(path,options={})=>new Request(origin+path,options);
const worker=({verify=async()=>{throw Error('UNAUTHENTICATED');}}={})=>createWorker({verify});
const env={ASSETS:{fetch:async()=>new Response('<html>panel</html>',{headers:{'Content-Type':'text/html'}})}};
test('web public health is read-only and reports trading disabled',async()=>{
  const response=await worker().fetch(req('/api/health'),env);
  assert.equal(response.status,200);
  const body=await response.json();
  assert.equal(body.real_orders_enabled,false);
});
test('web refuses unauthenticated API and does not trust local-desktop session cookies',async()=>{
  const app=worker();
  for(const path of ['/api/auth/me','/status','/api/binance-tr/balance','/api/analysis']){
    const response=await app.fetch(req(path,{headers:{Cookie:'para_local_session=token; para_auth=local'}}),env);
    assert.equal(response.status,401,path);
    assert.deepEqual(await response.json(),{error:'AUTH_REQUIRED'});
  }
  const home=await app.fetch(req('/'),env);
  assert.equal(home.status,401);
  assert.match(await home.text(),/Google ile giriş/);
});
test('logged-in web research remains HALT/read-only; not the local backend',async()=>{
  const app=worker({verify:async()=>({id:'verified-google-sub',email:'test@example.com'})});
  const status=await app.fetch(req('/status'),env);
  assert.equal(status.status,200);
  const body=await status.json();
  assert.equal(body.mode,'web-research');
  assert.equal(body.realOrdersEnabled,false);
  assert.equal(body.halted,true);
  const denied=await app.fetch(req('/api/local-only'),env);
  assert.equal(denied.status,503);
  assert.equal((await denied.json()).error,'WEB_BACKEND_UNAVAILABLE');
  const profile=await app.fetch(req('/api/auth/me'),env);
  assert.equal((await profile.json()).authenticated,true);
});
test('web logout requires POST, same origin, and request token; clears host-only session',async()=>{
  const app=worker();
  for(const input of [
    req('/auth/logout'),
    req('/auth/logout',{method:'POST',headers:{Origin:'https://evil.example','X-Para-Request':'1'}}),
    req('/auth/logout',{method:'POST',headers:{Origin:origin}}),
  ]){
    const response=await app.fetch(input,env);
    assert.equal(response.status,403);
  }
  const response=await app.fetch(req('/auth/logout',{method:'POST',headers:{Origin:origin,'X-Para-Request':'1'}}),env);
  assert.equal(response.status,303);
  const setCookie=response.headers.get('Set-Cookie')||'';
  assert.match(setCookie,/__Host-para-session=/);
  assert.match(setCookie,/Max-Age=0/);
  assert.match(setCookie,/Secure/);
});
test('missing production ANALYSIS_LIMIT binding fails closed without making exchange request',async()=>{
  let called=0;
  const app=createWorker({
    verify:async()=>({id:'verified-google-sub'}),
    binanceReader:async()=>{called++;throw Error('MUST_NOT_FETCH');},
    market:()=>({snapshot:async()=>{called++;throw Error('MUST_NOT_FETCH');}}),
    binanceDiagnostic:async()=>{called++;throw Error('MUST_NOT_FETCH');}
  });
  const headers={Origin:origin,'Sec-Fetch-Site':'same-origin','Content-Type':'application/json','X-Para-Request':'1'};
  const requests=[
    req('/api/binance-tr/diagnostic'),
    req('/api/binance-tr/balance',{method:'POST',headers,body:JSON.stringify({apiKey:'test',secretKey:'test'})}),
    req('/api/analysis',{method:'POST',headers,body:JSON.stringify({symbol:'BTC_TRY',budget:100,maxTrade:10,maxLoss:10,feeRate:0.01})})
  ];
  for(const request of requests){
    const response=await app.fetch(request,env);
    assert.equal(response.status,503);
    assert.equal((await response.json()).error,'SERVICE_NOT_CONFIGURED');
  }
  assert.equal(called,0);
});
