import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { MarketEventLog } from '../engine/market-event-log.js';

test('market event log persists only bounded allowlisted event fields',()=>{
  const folder=mkdtempSync(join(tmpdir(),'para-events-'));
  try {
    const path=join(folder,'market-events.jsonl');
    const log=new MarketEventLog({path,clock:()=>1700000000000});
    log.record({type:'CONNECTION_LOST',source:'MARKET',code:'NETWORK_ERROR'});
    log.record({type:'CONNECTION_RESTORED',source:'MARKET',code:'OK'});
    assert.deepEqual(log.recent().map(x=>x.type),['CONNECTION_LOST','CONNECTION_RESTORED']);
    const file=readFileSync(path,'utf8');
    assert.ok(!file.includes('apiKey'));
    assert.ok(!file.includes('secretKey'));
    assert.throws(()=>log.record({type:'API_ERROR',source:'ACCOUNT',code:'PRIVATE_KEY_EXPOSED'}),/Invalid market event/);
    assert.throws(()=>log.record({type:'custom',source:'MARKET',code:'OK'}),/Invalid market event/);
  } finally {rmSync(folder,{recursive:true,force:true});}
});

test('market log caps read count',()=>{
  const folder=mkdtempSync(join(tmpdir(),'para-events-'));
  try {
    const log=new MarketEventLog({path:join(folder,'events.jsonl')});
    for(let i=0;i<110;i++)log.record({type:'API_ERROR',source:'MARKET',code:'MARKET_CONNECTION'});
    assert.equal(log.recent(500).length,100);
    assert.equal(log.recent(3).length,3);
  }finally{rmSync(folder,{recursive:true,force:true});}
});
