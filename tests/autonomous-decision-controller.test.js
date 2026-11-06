import test from 'node:test';
import assert from 'node:assert/strict';
import {LiveOrderJournal} from '../engine/live-order-journal.js';
import {AutonomousDecisionController} from '../engine/autonomous-decision-controller.js';

test('autonomous proposals require bounded approval, never authorize execution and are audited',async()=>{
  const journal=new LiveOrderJournal(':memory:');
  let now=1_800_000_000_000,approved=false,halts=0;
  const service={previewSignal:async request=>({action:'AL',order:{...request,clientId:'para_autonomous_0001'}}),
    halt:()=>{halts++;}};
  const make=()=>new AutonomousDecisionController({service,journal,clock:()=>now,allowedSymbols:['BTC_TRY'],
    approval:()=>approved});
  let controller=make();
  assert.equal(controller.status().reason,'STARTUP_LOCK');
  assert.throws(()=>controller.arm(),/AUTONOMY_LOCKED/);
  approved=true;
  const armed=controller.arm({durationMs:10000,maxProposals:1});
  assert.equal(armed.executionAuthorized,false);
  assert.equal((await controller.preview({symbol:'BTC_TRY',quantity:'0.001',price:'100000'})).executionAuthorized,false);
  assert.equal(controller.status().remaining,0);
  assert.equal((await controller.preview({symbol:'BTC_TRY'})).reason,'AUTONOMY_LOCKED');
  assert.equal(controller.audit().length,2);
  assert.equal(typeof controller.submit,'undefined');

  controller=make();
  assert.equal(controller.status().reason,'STARTUP_LOCK');
  assert.equal(controller.status().enabled,false);
  controller.halt('MANUAL_HALT');
  assert.equal(halts,1);
  journal.close();
});

test('autonomous allowlist and session expiry fail closed with audit records',async()=>{
  const journal=new LiveOrderJournal(':memory:');
  let now=1_800_000_000_000,calls=0;
  const controller=new AutonomousDecisionController({journal,clock:()=>now,allowedSymbols:['BTC_TRY'],approval:()=>true,
    service:{previewSignal:async()=>{calls++;return {action:'BEKLE',reason:'NO_TRADE_SIGNAL'};},halt:()=>{}}});
  controller.arm({durationMs:10000,maxProposals:2});
  assert.equal((await controller.preview({symbol:'ETH_TRY'})).reason,'SYMBOL_NOT_ALLOWED');
  now+=10001;
  assert.equal((await controller.preview({symbol:'BTC_TRY'})).reason,'AUTONOMY_LOCKED');
  assert.equal(calls,0);
  assert.deepEqual(controller.audit().map(x=>x.reason),['AUTONOMY_LOCKED','SYMBOL_NOT_ALLOWED']);
  journal.close();
});

test('concurrent previews cannot exceed the durable session quota',async()=>{
  const journal=new LiveOrderJournal(':memory:');
  let release,calls=0;
  const wait=new Promise(resolve=>{release=resolve;});
  const controller=new AutonomousDecisionController({journal,clock:()=>1_800_000_000_000,
    allowedSymbols:['BTC_TRY'],approval:()=>true,service:{halt:()=>{},previewSignal:async()=>{
      calls++;await wait;return {action:'BEKLE',reason:'NO_TRADE_SIGNAL'};
    }}});
  controller.arm({durationMs:10000,maxProposals:1});
  const first=controller.preview({symbol:'BTC_TRY'}),second=controller.preview({symbol:'BTC_TRY'});
  release();
  const results=await Promise.all([first,second]);
  assert.equal(calls,1);
  assert.equal(results.filter(x=>x.reason==='AUTONOMY_LOCKED').length,1);
  journal.close();
});
