import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { AIProviderVault } from '../engine/ai-provider-vault.js';
import { WindowsAIProviderVault, windowsDpapi } from '../engine/windows-ai-provider-vault.js';
import { RiskStore } from '../engine/store.js';
import { createServer } from '../engine/server.js';

// Crypto mock only: never used by the application. Production requires Windows DPAPI.
function protector({mode,value,principal,provider}) {
  const label = principal + '|' + provider + '|';
  if(mode === 'protect') return Buffer.from(label + value).toString('base64');
  const clear = Buffer.from(value,'base64').toString();
  if(!clear.startsWith(label)) throw Error('INCORRECT_USER');
  return clear.slice(label.length);
}
const local = 'local-desktop', google = 'google:identity123';
const setup = () => {
  const dir = mkdtempSync(join(tmpdir(),'para-dpapi-test-'));
  return { dir, vault: new WindowsAIProviderVault({directory:dir,protector}), cleanup:()=>rmSync(dir,{recursive:true,force:true}) };
};
test('new key is persisted without a passphrase, encrypted, never exposed in status, and survives restart',()=>{
  const {dir,vault,cleanup}=setup();
  try {
    vault.save({principal:local,provider:'openai',apiKey:'sk-test-key',model:'gpt-4o-mini'});
    assert.equal(vault.status({principal:local}).find(x=>x.provider==='openai').configured,true);
    assert.ok(!JSON.stringify(vault.status({principal:local})).includes('sk-test-key'));
    const again=new WindowsAIProviderVault({directory:dir,protector});
    assert.deepEqual(again.openForAnalysis({principal:local,provider:'openai'}),{apiKey:'sk-test-key',model:'gpt-4o-mini'});
    const raw=readFileSync(join(dir,'users',requirePath(local),'openai.dpapi'),'utf8');
    assert.ok(!raw.includes('sk-test-key'));
    assert.throws(()=>vault.save({principal:local,provider:'openai',apiKey:'replacement',replace:false}),/STATE_CHANGED/);
    vault.save({principal:local,provider:'openai',apiKey:'replacement',model:'gpt-4o-mini',replace:true});
    assert.equal(vault.openForAnalysis({principal:local,provider:'openai'}).apiKey,'replacement');
    vault.remove({principal:local,provider:'openai'});
    assert.equal(vault.status({principal:local})[0].configured,false);
  }finally{cleanup();}
});
import { createHash } from 'node:crypto';
const requirePath=s=>createHash('sha256').update(s).digest('hex');

test('Google and local desktop credentials are isolated and no client-controlled principal is accepted',async()=>{
  const {vault,cleanup}=setup();
  const sim=new RiskStore(':memory:',{budget:1000,maxTrade:100,maxLoss:100});
  const token='t'.repeat(40);
  const googleAuth={configured:true,user:cookie=>cookie==='session=google'?{id:'identity123'}:null,handle:async()=>null};
  const server=createServer({token,simulator:sim,aiProviders:vault,googleAuth});
  await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
  try {
    const origin='http://127.0.0.1:'+server.address().port;
    const common={Origin:origin,'Sec-Fetch-Site':'same-origin','Content-Type':'application/json','X-Para-Request':'1'};
    const auth={...common,Authorization:'Bearer '+token};
    const cookie={...common,Cookie:'session=google'};
    const post=(path,headers,payload)=>fetch(origin+path,{method:'POST',headers,body:JSON.stringify(payload)});
    assert.equal((await post('/api/ai/providers/save',auth,{provider:'openai',apiKey:'sk-local',model:'gpt-4o-mini',replace:false})).status,200);
    assert.equal((await post('/api/ai/providers/save',cookie,{provider:'openai',apiKey:'sk-google',model:'gpt-4o-mini',replace:false})).status,200);
    assert.equal(vault.openForAnalysis({principal:local,provider:'openai'}).apiKey,'sk-local');
    assert.equal(vault.openForAnalysis({principal:google,provider:'openai'}).apiKey,'sk-google');
    assert.equal((await post('/api/ai/providers/delete',cookie,{provider:'openai',principal:local})).status,400);
    assert.equal((await post('/api/ai/providers/delete',cookie,{provider:'openai'})).status,200);
    assert.equal(vault.status({principal:local})[0].configured,true);
    assert.equal(vault.status({principal:google})[0].configured,false);
    assert.equal((await post('/api/ai/providers/save',{...auth,Origin:'http://evil.example'},{provider:'gemini',apiKey:'key',model:'gemini-2.5-flash'})).status,403);
    assert.equal((await fetch(origin+'/api/ai/providers')).status,403);
    const status=await(await fetch(origin+'/api/ai/providers',{headers:{Authorization:'Bearer '+token}})).text();
    assert.ok(!status.includes('sk-local'));
  }finally{await new Promise(resolve=>server.close(resolve));sim.close();cleanup();}
});

test('legacy password-protected vault migrates only when explicitly approved and original remains',()=>{
  const {dir,vault,cleanup}=setup();
  try {
    const old=new AIProviderVault({directory:dir});
    old.save({provider:'gemini',apiKey:'old-gemini-key',model:'gemini-2.5-flash',passphrase:'this-is-a-long-legacy-password'});
    assert.throws(()=>vault.migrate({principal:local,provider:'gemini',passphrase:'incorrect-password'}));
    vault.migrate({principal:local,provider:'gemini',passphrase:'this-is-a-long-legacy-password'});
    assert.equal(vault.openForAnalysis({principal:local,provider:'gemini'}).apiKey,'old-gemini-key');
    assert.equal(old.status().find(p=>p.provider==='gemini').configured,true);
    assert.throws(()=>vault.migrate({principal:google,provider:'gemini',passphrase:'not-the-password'}));
  }finally{cleanup();}
});

test('fail closed when DPAPI unavailable or platform is not Windows, without storing secrets',()=>{
  const {vault,cleanup}=setup();
  try {
    const blocked=new WindowsAIProviderVault({directory:mkdtempSync(join(tmpdir(),'para-blocked-')),protector:()=>{throw Error('OS_DOWN');}});
    assert.throws(()=>blocked.save({principal:local,provider:'openai',apiKey:'secret',model:'model'}),/OS_DOWN/);
    assert.throws(()=>vault.save({principal:'../other',provider:'openai',apiKey:'secret'}),/INVALID/);
    assert.throws(()=>vault.save({principal:local,provider:'../openai',apiKey:'secret'}),/INVALID/);
    if(process.platform!=='win32')assert.throws(()=>windowsDpapi({mode:'protect',value:'secret',principal:local,provider:'openai'}),/WINDOWS_KEYSTORE_REQUIRED/);
  }finally{cleanup();}
});
