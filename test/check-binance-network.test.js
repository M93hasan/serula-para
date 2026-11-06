import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {checkBinanceNetwork,formatNetworkResults} from '../scripts/check-binance-network.js';
test('local diagnostic calls only two fixed public GET endpoints without secrets',async()=>{
 const calls=[];
 const result=await checkBinanceNetwork({fetchImpl:async(url,options)=>{
   calls.push({url,options});
   return new Response('',{status:200});
 }});
 assert.equal(calls.length,2);
 for(const call of calls){
   assert.match(call.url,/^https:\/\/www\.binance\.tr\/open\/v1\/common\/(?:time|symbols)$/);
   assert.equal(call.options.method,'GET');
   assert.deepEqual(call.options.headers,{Accept:'application/json'});
   assert.equal(call.options.redirect,'manual');
 }
 assert.deepEqual(result.map(x=>x.state),['OK','OK']);
 assert.match(formatNetworkResults(result),/SONUC: Genel API erisimi calisiyor/);
});
test('HTTP 403 and 451 block report contains no credentials',async()=>{
 const result=await checkBinanceNetwork({fetchImpl:async()=>new Response('',{status:403})});
 assert.deepEqual(result.map(x=>x.state),['BLOCKED','BLOCKED']);
 assert.match(formatNetworkResults(result),/HTTP 403/);
 assert.match(formatNetworkResults(result),/API anahtarlarini girmeyin/);
});
test('timeout, errors and redirects are classified without exposing exception messages',async()=>{
 let count=0;
 const result=await checkBinanceNetwork({fetchImpl:async()=>{
   if(++count===1){let e=new Error('private-API-key-should-not-leak');e.name='TimeoutError';throw e;}
   return new Response('',{status:302,headers:{location:'https://attacker.example/?key=secret'}});
 }});
 assert.equal(result[0].state,'TIMEOUT');
 assert.equal(result[1].state,'REDIRECT');
 assert.doesNotMatch(JSON.stringify(result),/private-API|attacker|secret/);
});

test('double-click Windows launcher runs only the credential-free diagnostic script',()=>{
 const cmd=readFileSync(new URL('../check-binance.cmd',import.meta.url),'utf8');
 assert.match(cmd,/cd \/d "%~dp0"/);
 assert.match(cmd,/node "scripts\\check-binance-network\.js"/);
 assert.match(cmd,/where node/);
 assert.match(cmd,/pause/);
 assert.doesNotMatch(cmd,/API[_ ]?(?:KEY|SECRET)|\/orders|start-para\.cmd|curl|Invoke-WebRequest/i);
});
