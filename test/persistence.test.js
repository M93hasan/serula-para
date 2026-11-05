import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { RiskStore } from '../engine/store.js';
import { saveVault,loadVault } from '../engine/vault.js';
const limits={budget:1000,maxTrade:300,maxLoss:100};
test('encrypted vault refuses wrong password, tampering and replacement',()=>{
  const dir=mkdtempSync(join(tmpdir(),'para-')), path=join(dir,'vault');
  try {saveVault(path,{apiKey:'example-key',secretKey:'example-secret'},'correct horse battery staple');
    const bytes=readFileSync(path,'utf8'); assert.ok(!bytes.includes('example-secret')); assert.equal(loadVault(path,'correct horse battery staple').apiKey,'example-key');
    assert.throws(()=>loadVault(path,'incorrect password')); assert.throws(()=>saveVault(path,{apiKey:'x',secretKey:'y'},'correct horse battery staple'));
    const box=JSON.parse(bytes);box.tag=Buffer.alloc(16).toString('base64');writeFileSync(path,JSON.stringify(box));assert.throws(()=>loadVault(path,'correct horse battery staple'));
  } finally {rmSync(dir,{recursive:true,force:true});}
});
test('risk state and event history survive restart and restart halted',()=>{
  const dir=mkdtempSync(join(tmpdir(),'para-')), path=join(dir,'risk.sqlite'); let s;
  try {s=new RiskStore(path,limits);s.start();s.evaluate({amount:100,worstCaseLoss:30});s.close();
    s=new RiskStore(path,{budget:9000,maxTrade:900,maxLoss:900});const state=s.status();assert.equal(state.budget,1000);assert.equal(state.budgetRemaining,970);assert.equal(state.halted,true);assert.equal(state.journal[0].type,'simulated');
    assert.throws(()=>s.evaluate({amount:5,worstCaseLoss:1}));s.start();assert.throws(()=>s.evaluate({amount:100,worstCaseLoss:70}));assert.equal(s.status().budgetRemaining,970);s.halt();s.close();s=null;
  } finally {s?.close();rmSync(dir,{recursive:true,force:true});}
});
test('multiple database connections serialize loss checks',()=>{
  const dir=mkdtempSync(join(tmpdir(),'para-')), path=join(dir,'risk.sqlite');let a,b;
  try {a=new RiskStore(path,limits);b=new RiskStore(path,limits);a.start();a.evaluate({amount:100,worstCaseLoss:60});assert.throws(()=>b.evaluate({amount:100,worstCaseLoss:40}));assert.equal(b.status().budgetRemaining,940);} finally {a?.close();b?.close();rmSync(dir,{recursive:true,force:true});}
});

test('local server rejects DNS rebinding and cross-origin requests', async()=>{
  const {createServer}=await import('../engine/server.js'); const token='a'.repeat(48); const store=new RiskStore(':memory:',limits);
  const server=createServer({token,simulator:store});await new Promise(r=>server.listen(0,'127.0.0.1',r));
  try {const port=server.address().port,url=`http://127.0.0.1:${port}`,auth={Authorization:`Bearer ${token}`};
    assert.equal((await fetch(url+'/status',{headers:{...auth,Origin:`http://127.0.0.1:${port}`,'Sec-Fetch-Site':'same-origin'}})).status,200);
    const http=await import('node:http');
    const badHost=await new Promise((resolve,reject)=>http.get(url+'/status',{headers:{...auth,Host:`evil.example:${port}`}},r=>{r.resume();resolve(r.statusCode);}).on('error',reject));
    assert.equal(badHost,403);
    assert.equal((await fetch(url+'/halt',{method:'POST',headers:{...auth,Origin:'http://evil.example'}})).status,403);
    assert.equal((await fetch(url+'/status',{headers:{...auth,'Sec-Fetch-Site':'cross-site'}})).status,403);
  } finally {await new Promise(r=>server.close(r));store.close();}
});
