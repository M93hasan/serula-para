import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,readFileSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {AccountService} from '../engine/account-service.js';
import {BinanceTR} from '../engine/binance-tr.js';
import {createServer} from '../engine/server.js';
import {RiskStore} from '../engine/store.js';
import {saveVault,loadVault} from '../engine/vault.js';

test('existing vault supports test, protected replace and delete without returning keys',async()=>{
 const dir=mkdtempSync(join(tmpdir(),'para-account-')),path=join(dir,'vault'),passphrase='a long test passphrase', seen=[];
 const client=new BinanceTR({clock:()=>123,fetchImpl:async(url,opts)=>{seen.push({url,opts});return new Response(JSON.stringify({code:0,data:{accountAssets:[{asset:'TRY',free:'100.25000000',locked:'2.00'}]}}));}});
 try {saveVault(path,{apiKey:'first-key',secretKey:'first-secret'},passphrase);const svc=new AccountService({path,client});
  assert.deepEqual(await svc.balance(passphrase),[{asset:'TRY',free:'100.25000000',locked:'2.00'}]);assert.match(seen[0].url,/^https:\/\/www\.binance\.tr\/open\/v1\/account\/spot\?/);assert.equal(seen[0].opts.method,'GET');
  assert.throws(()=>svc.save({apiKey:'new-key',secretKey:'new-secret',passphrase:'wrong password 1234',replace:true}));assert.equal(loadVault(path,passphrase).apiKey,'first-key');
  svc.save({apiKey:'new-key',secretKey:'new-secret',passphrase,replace:true});assert.equal(loadVault(path,passphrase).apiKey,'new-key');assert.ok(!readFileSync(path,'utf8').includes('new-secret'));
  assert.throws(()=>svc.remove('incorrect'));assert.ok(svc.exists());svc.remove(passphrase);assert.equal(svc.exists(),false);
 }finally{rmSync(dir,{recursive:true,force:true});}
});
test('rejects malformed account responses and authentication failure',async()=>{
 const dir=mkdtempSync(join(tmpdir(),'para-account-')),path=join(dir,'vault'),passphrase='long test passphrase';
 try {saveVault(path,{apiKey:'key',secretKey:'secret'},passphrase);const svc=new AccountService({path,client:{account:async()=>({data:{accountAssets:[{asset:'<script>',free:'1',locked:'0'}]}})}});await assert.rejects(svc.balance(passphrase));await assert.rejects(svc.balance('wrong'));}finally{rmSync(dir,{recursive:true,force:true});}
});
test('account endpoints require token, same origin, JSON and never return secret',async()=>{
 const dir=mkdtempSync(join(tmpdir(),'para-account-')),path=join(dir,'vault'),passphrase='long test passphrase',token='z'.repeat(40);
 const store=new RiskStore(':memory:',{budget:1000,maxTrade:100,maxLoss:100});const account=new AccountService({path,client:{account:async()=>({data:{accountAssets:[{asset:'BTC',free:'0.1',locked:'0'}]}})}});
 const server=createServer({token,simulator:store,account});await new Promise(r=>server.listen(0,'127.0.0.1',r));
 try {const origin=`http://127.0.0.1:${server.address().port}`,url=origin+'/api/binance-tr/',headers={Authorization:`Bearer ${token}`,Origin:origin,'Sec-Fetch-Site':'same-origin','Content-Type':'application/json','X-Para-Request':'1'},body=JSON.stringify({apiKey:'private-test-key',secretKey:'private-test-secret',passphrase,replace:false});
  assert.equal((await fetch(url+'save',{method:'POST',headers:{...headers,Origin:'https://evil.example'},body})).status,403);
  assert.equal((await fetch(url+'save',{method:'POST',headers:{...headers,Authorization:'Bearer wrong'},body})).status,403);
  assert.equal((await fetch(url+'save',{method:'POST',headers:{...headers,'Content-Type':'text/plain'},body})).status,403);
  assert.equal((await fetch(url+'save',{method:'POST',headers,body})).status,200);
  const status=await (await fetch(url+'settings',{headers:{Authorization:`Bearer ${token}`}})).text();assert.equal(status,'{"configured":true}');
  const result=await (await fetch(url+'test',{method:'POST',headers,body:JSON.stringify({passphrase})})).text();assert.ok(result.includes('BTC'));assert.ok(!result.includes('private-test'));
  assert.equal((await fetch(url+'test',{method:'POST',headers,body:JSON.stringify({passphrase:'bad'})})).status,400);
  assert.equal((await fetch(url+'delete',{method:'POST',headers,body:JSON.stringify({passphrase})})).status,200);
 }finally{await new Promise(r=>server.close(r));store.close();rmSync(dir,{recursive:true,force:true});}
});
