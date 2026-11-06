import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {diagnoseBinanceConnection} from '../cloudflare/binance-diagnostic.js';
import {createWorker} from '../cloudflare/worker.js';

const origin='https://preview.example';
const env={ANALYSIS_LIMIT:{limit:async()=>({success:true})},ASSETS:{fetch:async()=>new Response('asset')}};

test('diagnostic uses fixed public Binance TR endpoint without API credentials',async()=>{
  let seen;
  const result=await diagnoseBinanceConnection({fetchImpl:async(url,opts)=>{seen={url,opts};return new Response('ok',{status:200});}});
  assert.equal(seen.url,'https://www.binance.tr/open/v1/common/time');
  assert.equal(seen.opts.method,'GET');
  assert.equal(seen.opts.headers['X-MBX-APIKEY'],undefined);
  assert.equal(seen.opts.redirect,'manual');
  assert.deepEqual(result,{reachable:true,status:'HTTP_OK',httpStatus:200,credentialFree:true});
});
test('diagnostic differentiates block, rate-limit, redirect, failure and timeout',async()=>{
  const probe=async status=>diagnoseBinanceConnection({fetchImpl:async()=>new Response('',{status})});
  assert.equal((await probe(403)).status,'ACCESS_BLOCKED');
  assert.equal((await probe(451)).status,'ACCESS_BLOCKED');
  assert.equal((await probe(429)).status,'RATE_LIMITED');
  assert.equal((await probe(302)).status,'REDIRECT');
  assert.equal((await probe(500)).status,'HTTP_ERROR');
  const failure=await diagnoseBinanceConnection({fetchImpl:async()=>{throw Error('network internal secret')}}); 
  assert.equal(failure.status,'NETWORK_ERROR');
  assert.doesNotMatch(JSON.stringify(failure),/internal secret/);
  const timeout=await diagnoseBinanceConnection({fetchImpl:async()=>{const e=new Error();e.name='TimeoutError';throw e;}});
  assert.equal(timeout.detail,'TIMEOUT');
});
test('diagnostic endpoint requires Google session and applies rate limit',async()=>{
  let calls=0;
  const diag=async()=>{calls++;return {status:'HTTP_OK',reachable:true,credentialFree:true};};
  const unauthorized=createWorker({verify:async()=>{throw Error('no auth');},binanceDiagnostic:diag});
  assert.equal((await unauthorized.fetch(new Request(origin+'/api/binance-tr/diagnostic'),env)).status,401);
  const authorized=createWorker({verify:async()=>({id:'u'}),binanceDiagnostic:diag});
  assert.equal((await authorized.fetch(new Request(origin+'/api/binance-tr/diagnostic',{method:'POST'}),env)).status,405);
  assert.equal((await authorized.fetch(new Request(origin+'/api/binance-tr/diagnostic'),{...env,ANALYSIS_LIMIT:{limit:async()=>({success:false})}})).status,429);
  assert.equal(calls,0);
  const response=await authorized.fetch(new Request(origin+'/api/binance-tr/diagnostic'),env);
  assert.equal(response.status,200);
  assert.deepEqual(await response.json(),{status:'HTTP_OK',reachable:true,credentialFree:true});
  assert.equal(calls,1);
});
test('UI diagnostic button is independent of saved API secrets',()=>{
  const src=readFileSync(new URL('../src/main.js',import.meta.url),'utf8');
  assert.match(src,/web-binance-diagnostic/);
  assert.match(src,/fetch\('\/api\/binance-tr\/diagnostic'/);
  assert.match(src,/anahtar gerektirmez/);
});
