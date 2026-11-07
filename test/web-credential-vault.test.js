import test from 'node:test';
import assert from 'node:assert/strict';
import {WebCredentialVault} from '../cloudflare/web-credential-vault.js';
import {createWorker} from '../cloudflare/worker.js';

class MemoryD1 {
  rows=new Map();
  prepare(sql){
    const db=this;
    return {bind(...args){
      if(sql.startsWith('INSERT'))return {run:async()=>{
        const [envelope,owner,provider]=args,key=owner+'|'+provider;
        if(db.rows.has(key))return {meta:{changes:0}};
        db.rows.set(key,envelope);return {meta:{changes:1}};
      }};
      if(sql.startsWith('UPDATE'))return {run:async()=>{
        const [envelope,owner,provider]=args,key=owner+'|'+provider;
        if(!db.rows.has(key))return {meta:{changes:0}};
        db.rows.set(key,envelope);return {meta:{changes:1}};
      }};
      if(sql.startsWith('DELETE'))return {run:async()=>{
        const [owner,provider]=args,key=owner+'|'+provider;
        const changed=db.rows.delete(key);return {meta:{changes:Number(changed)}};
      }};
      if(sql.startsWith('SELECT provider'))return {all:async()=>({results:[...db.rows.keys()]
        .filter(x=>x.startsWith(args[0]+'|')).map(x=>({provider:x.split('|')[1]}))})};
      if(sql.startsWith('SELECT envelope'))return {first:async()=>{
        const envelope=db.rows.get(args[0]+'|'+args[1]);return envelope?{envelope}:null;
      }};
      throw Error('Unexpected SQL: '+sql);
    }};
  }
}
test('web vault encrypts per Google identity, survives reopening and rejects cross-user reads',async()=>{
  const db=new MemoryD1(),env={WEB_VAULT_DB:db,WEB_VAULT_KEY:Buffer.alloc(32,7).toString('base64')};
  const v=new WebCredentialVault(env);
  await v.save('google-user-1','binance_tr',{apiKey:'api-123',secretKey:'secret-456'});
  const stored=[...db.rows.values()][0];
  assert.doesNotMatch(stored,/api-123|secret-456/);
  const reopened=new WebCredentialVault(env);
  assert.deepEqual(await reopened.open('google-user-1','binance_tr'),{apiKey:'api-123',secretKey:'secret-456'});
  await assert.rejects(reopened.open('google-user-2','binance_tr'),/NOT_CONFIGURED/);
  assert.equal((await reopened.status('google-user-2')).some(x=>x.configured),false);
  await assert.rejects(reopened.save('google-user-1','binance_tr',{apiKey:'x',secretKey:'y'}),/STATE_CHANGED/);
  await reopened.save('google-user-1','openai',{apiKey:'sk-mock',model:'gpt-4o-mini'});
  assert.equal((await reopened.open('google-user-1','openai')).apiKey,'sk-mock');
  const key=[...db.rows.keys()][0];
  const other=[...db.rows.values()][1];db.rows.set(key,other);
  await assert.rejects(reopened.open('google-user-1','binance_tr'),/VAULT_DECRYPT_FAILED/);
  await reopened.remove('google-user-1','binance_tr');
  await assert.rejects(reopened.open('google-user-1','binance_tr'),/NOT_CONFIGURED/);
});
test('web vault fails closed without D1/secret and refuses malformed credentials',async()=>{
  assert.throws(()=>new WebCredentialVault({}),/WEB_VAULT_NOT_CONFIGURED/);
  const v=new WebCredentialVault({WEB_VAULT_DB:new MemoryD1(),WEB_VAULT_KEY:Buffer.alloc(32,3).toString('base64')});
  await assert.rejects(v.save('user','binance_tr',{apiKey:'key',secretKey:'secret',other:'foo'}),/INVALID_CREDENTIALS/);
  await assert.rejects(v.save('user','unknown',{apiKey:'key',model:''}),/INVALID_PROVIDER/);
});
test('worker web-vault requires authenticated identity, configured D1 and same-origin mutations',async()=>{
  const origin='https://preview.example',db=new MemoryD1();
  const env={WEB_VAULT_DB:db,WEB_VAULT_KEY:Buffer.alloc(32,5).toString('base64'),
    ANALYSIS_LIMIT:{limit:async()=>({success:true})}};
  const worker=createWorker({verify:async()=>({id:'user-a',email:'a@example.org'})});
  const send=(path,input,headers={})=>worker.fetch(new Request(origin+path,{method:'POST',headers:{
    'Content-Type':'application/json','Origin':origin,'Sec-Fetch-Site':'same-origin','X-Para-Request':'1',...headers},
    body:JSON.stringify(input)}),env);
  const path='/api/web-vault/save';
  assert.equal((await send(path,{provider:'openai',credentials:{apiKey:'key',model:'model'}},{Origin:'https://evil.example'})).status,403);
  assert.equal((await send(path,{provider:'openai',credentials:{apiKey:'key',model:'model'}})).status,200);
  const status=await worker.fetch(new Request(origin+'/api/web-vault/status'),env);
  assert.equal(status.status,200);assert.doesNotMatch(await status.text(),/"apiKey"|"key"/);
  const blocked=createWorker({verify:async()=>{throw Error('unauthorized');}});
  assert.equal((await blocked.fetch(new Request(origin+'/api/web-vault/status'),env)).status,401);
});
