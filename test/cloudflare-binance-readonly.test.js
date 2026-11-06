import test from 'node:test';
import assert from 'node:assert/strict';
import { createHmac } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { readBinanceAccount } from '../cloudflare/binance-readonly.js';
import { createWorker } from '../cloudflare/worker.js';

const origin='https://preview.example';
const mockEnv={
  ASSETS:{fetch:async()=>new Response('asset')},
  ANALYSIS_LIMIT:{limit:async()=>({success:true})}
};
const credentials={apiKey:'example-read-only-key',secretKey:'example-read-only-secret'};
const balances={code:0,data:{accountAssets:[
  {asset:'TRY',free:'500.00',locked:'0.00'},
  {asset:'BTC',free:'0.0001',locked:'0.0002'},
  {asset:'ETH',free:'0',locked:'0'}
]}};
const post=(body,opts={})=>new Request(origin+'/api/binance-tr/balance',{
  method:'POST',
  headers:{Origin:origin,'Sec-Fetch-Site':'same-origin','Content-Type':'application/json','X-Para-Request':'1',...opts.headers},
  body:JSON.stringify(body)
});
test('Binance TR lookup signs only approved GET account endpoint with SHA-256',async()=>{
  let seen;
  const result=await readBinanceAccount(credentials,{
    clock:()=>1700000000000,
    fetchImpl:async(url,options)=>{
      seen={url,options};
      return new Response(JSON.stringify(balances),{status:200,headers:{'Content-Type':'application/json'}});
    }
  });
  const url=new URL(seen.url),q=url.searchParams;
  assert.equal(url.origin,'https://www.binance.tr');
  assert.equal(url.pathname,'/open/v1/account/spot');
  assert.equal(seen.options.method,'GET');
  assert.equal(seen.options.headers['X-MBX-APIKEY'],credentials.apiKey);
  const unsigned='timestamp=1700000000000&recvWindow=5000';
  assert.equal(q.get('signature'),createHmac('sha256',credentials.secretKey).update(unsigned).digest('hex'));
  assert.deepEqual(result.balances,[balances.data.accountAssets[0],balances.data.accountAssets[1]]);
  assert.equal(result.readOnly,true);
  assert.doesNotMatch(JSON.stringify(result),/example-read-only-/);
});
test('invalid credentials and oversized or malformed exchange responses fail closed',async()=>{
  await assert.rejects(readBinanceAccount({apiKey:'',secretKey:'secret'}),/INVALID_CREDENTIALS/);
  await assert.rejects(readBinanceAccount({apiKey:'key',secretKey:'x\nwrong'}),/INVALID_CREDENTIALS/);
  const malformed={code:0,data:{accountAssets:[{asset:'TRY',free:'not-a-number',locked:'0'}]}};
  await assert.rejects(readBinanceAccount(credentials,{fetchImpl:async()=>new Response(JSON.stringify(malformed))}),/INVALID_EXCHANGE_RESPONSE/);
  await assert.rejects(readBinanceAccount(credentials,{fetchImpl:async()=>new Response('x'.repeat(500001))}),/INVALID_EXCHANGE_RESPONSE/);
});
test('web balance API demands authenticated Google session and same-origin POST',async()=>{
  let called=0;
  const worker=createWorker({verify:async()=>{throw Error('not signed in');},binanceReader:async()=>{called++;return {balances:[]};}});
  const denied=await worker.fetch(post(credentials),mockEnv);
  assert.equal(denied.status,401);
  assert.equal(called,0);
  const allowed=createWorker({verify:async()=>({id:'account-1',email:'user@example.test'}),binanceReader:async()=>{called++;return {balances:[],readOnly:true};}});
  assert.equal((await allowed.fetch(post(credentials,{headers:{Origin:'https://attacker.example'}}),mockEnv)).status,403);
  assert.equal((await allowed.fetch(post(credentials,{headers:{'Sec-Fetch-Site':'cross-site'}}),mockEnv)).status,403);
  assert.equal((await allowed.fetch(post(credentials,{headers:{'X-Para-Request':'0'}}),mockEnv)).status,403);
  assert.equal((await allowed.fetch(post(credentials,{headers:{'Content-Type':'text/plain'}}),mockEnv)).status,403);
  assert.equal((await allowed.fetch(new Request(origin+'/api/binance-tr/balance'),mockEnv)).status,405);
  assert.equal(called,0);
  const result=await allowed.fetch(post(credentials),mockEnv);
  assert.equal(result.status,200);
  assert.deepEqual(await result.json(),{balances:[],readOnly:true});
  assert.equal(called,1);
});
test('web balance endpoint imposes input limits, rate limits and rejects extra keys',async()=>{
  const worker=createWorker({verify:async()=>({id:'user-id'}),binanceReader:async()=>({balances:[]})});
  assert.equal((await worker.fetch(post({...credentials,placeOrder:true}),mockEnv)).status,400);
  const large={...credentials,secretKey:'a'.repeat(3000)};
  assert.equal((await worker.fetch(post(large),mockEnv)).status,400);
  const slow={...mockEnv,ANALYSIS_LIMIT:{limit:async()=>({success:false})}};
  assert.equal((await worker.fetch(post(credentials),slow)).status,429);
  assert.equal((await worker.fetch(post(credentials),{...mockEnv,ANALYSIS_LIMIT:null})).status,503);
});
test('no live order route exists and web UI does not persist credentials',async()=>{
  const source=readFileSync(new URL('../src/main.js',import.meta.url),'utf8');
  assert.match(source,/webBinanceCredentials=null/);
  assert.match(source,/\/api\/binance-tr\/balance/);
  assert.match(source,/Bağlantıyı kes/);
  assert.doesNotMatch(source,/localStorage\.setItem\(['"]web-binance/i);
  const worker=createWorker({verify:async()=>({id:'user-id'})});
  assert.equal((await worker.fetch(new Request(origin+'/api/orders',{method:'POST'}),mockEnv)).status,503);
});
