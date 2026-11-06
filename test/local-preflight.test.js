import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, readFileSync, readdirSync, rmSync, statSync, writeFileSync, utimesSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { RiskStore } from '../engine/store.js';
import { AccountSnapshotStore } from '../engine/account-snapshot-store.js';
import { seal } from '../engine/vault.js';
import { verifyLocalData, cleanExpiredDebugLogs } from '../engine/local-preflight.js';

const withDir=async fn=>{const dir=mkdtempSync(join(tmpdir(),'para-local-'));try{await fn(dir);}finally{rmSync(dir,{recursive:true,force:true});}};
test('SQLite and encrypted vault preflight does not access plaintext credentials',()=>withDir(dir=>{
 const simulation=new RiskStore(join(dir,'simulation.sqlite'),{budget:1000,maxTrade:100,maxLoss:100});
 const history=new AccountSnapshotStore(join(dir,'account-observations.sqlite'),{clock:()=>1700000000000});
 history.save({estimatedTry:123,pricedAssets:1,assetCount:1});simulation.close();history.close();
 const secret='READONLY-TEST-SECRET';
 writeFileSync(join(dir,'binance-tr.vault'),seal({apiKey:'demo',secretKey:secret},'test-password-long-enough'));
 const before=readFileSync(join(dir,'binance-tr.vault'),'utf8');
 const result=verifyLocalData(dir);
 assert.ok(result.sqlite.some(s=>s.name==='simulation.sqlite'&&s.status==='OK'));
 assert.ok(result.sqlite.some(s=>s.name==='account-observations.sqlite'&&s.status==='OK'));
 assert.equal(result.vaults[0].status,'ENCRYPTED_FORMAT_OK_PASSWORD_NOT_CHECKED');
 assert.equal(readFileSync(join(dir,'binance-tr.vault'),'utf8'),before);
 assert.ok(!JSON.stringify(result).includes(secret));
}));
test('restart preserves simulated loss journal and restarts halted',()=>withDir(dir=>{
 const path=join(dir,'simulation.sqlite'),limits={budget:1000,maxTrade:100,maxLoss:100};
 let db=new RiskStore(path,limits);db.start();db.evaluate({amount:50,worstCaseLoss:10});db.close();
 db=new RiskStore(path,limits);
 try {
  const state=db.status();
  assert.equal(state.halted,true);assert.equal(state.budgetRemaining,990);
  assert.ok(state.journal.some(x=>x.type==='simulated'));
  assert.equal(verifyLocalData(dir).sqlite.find(x=>x.name==='simulation.sqlite').status,'OK');
 }finally{db.close();}
}));
test('startup blocks corrupted encrypted vault and never removes it',()=>withDir(dir=>{
 const path=join(dir,'binance-tr.vault');
 writeFileSync(path,'{"version":1,"salt":"invalid"}');
 assert.throws(()=>verifyLocalData(dir),/VAULT_ENVELOPE_INVALID/);
 assert.ok(readFileSync(path,'utf8').includes('invalid'));
}));
test('log retention does not touch SQLite, WAL, encrypted vault or market events',()=>withDir(dir=>{
 const logs=join(dir,'logs');mkdirSync(logs);
 const expired=join(logs,'debug.log'),kept=join(logs,'recent.log'),vault=join(dir,'binance-tr.vault'),wal=join(dir,'simulation.sqlite-wal'),events=join(dir,'market-events.jsonl');
 for(const f of [expired,kept,vault,wal,events])writeFileSync(f,'data');
 const now=1700000000000;
 utimesSync(expired,new Date(now-9*86400000),new Date(now-9*86400000));
 utimesSync(kept,new Date(now-86400000),new Date(now-86400000));
 assert.equal(cleanExpiredDebugLogs(dir,{clock:()=>now}),1);
 assert.deepEqual(readdirSync(logs),['recent.log']);
 for(const file of [vault,wal,events])assert.equal(readFileSync(file,'utf8'),'data');
}));
