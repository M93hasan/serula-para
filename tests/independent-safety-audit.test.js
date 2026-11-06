import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {LiveOrderJournal} from '../engine/live-order-journal.js';
import {LiveOrderService} from '../engine/live-order-service.js';

test('external cancellation timeout is never retried within process or after restart',async()=>{
  const dir=mkdtempSync(join(tmpdir(),'para-security-cancel-'));
  const db=join(dir,'journal.sqlite');
  const open={symbol:'BTC_TRY',orderId:'12345',status:0};
  let attempts=0;
  const risk={halt:reason=>{risk.reason=reason;return {halted:true,reason};},
    status:()=>({halted:true,reason:risk.reason||'STARTUP_LOCK'})};
  const newService=journal=>new LiveOrderService({
    journal,risk,loadInputs:async()=>{throw Error('MUST_NOT_LOAD');},
    openOrderSymbols:['BTC_TRY'],gate:({action})=>action==='emergency-cancel',
    client:{
      openOrders:async symbol=>symbol==='BTC_TRY'?[open]:[],
      cancelByOrderId:async()=>{attempts++;throw Error('ETIMEDOUT');},
      placeLimit:async()=>{throw Error('REAL_ORDER_MUST_NEVER_BE_SENT');}
    }
  });
  let journal;
  try{
    journal=new LiveOrderJournal(db);
    let service=newService(journal);
    const first=await service.containHalt({reason:'MANUAL_HALT'});
    assert.equal(first.halted,true);
    assert.equal(first.cancelUnknown.length,1);
    assert.equal(risk.reason,'CANCEL_OUTCOME_UNKNOWN');
    assert.equal(attempts,1);
    assert.equal(journal.externalCancelStatus(open),'UNKNOWN');

    const second=await service.containHalt({reason:'MANUAL_HALT'});
    assert.equal(second.retained.length,1);
    assert.equal(second.cancelUnknown.length,0);
    assert.equal(attempts,1,'same external cancel POST cannot repeat');

    journal.close();
    journal=new LiveOrderJournal(db);
    service=newService(journal);
    const restarted=await service.containHalt({reason:'MANUAL_HALT'});
    assert.equal(restarted.retained.length,1);
    assert.equal(attempts,1,'restart cannot repeat ambiguous POST');
    assert.equal(journal.externalCancelStatus(open),'UNKNOWN');
  }finally{journal?.close();rmSync(dir,{recursive:true,force:true});}
});
test('durable claim is acquired before any network attempt; successful ack cannot authorize a retry',async()=>{
  const journal=new LiveOrderJournal(':memory:');
  const order={symbol:'ETH_TRY',orderId:'56789'};
  try{
    assert.equal(journal.claimExternalCancel(order),true);
    assert.equal(journal.claimExternalCancel(order),false);
    journal.acknowledgeExternalCancel(order);
    assert.equal(journal.externalCancelStatus(order),'ACKNOWLEDGED');
    assert.equal(journal.claimExternalCancel(order),false);
    assert.equal(journal.claimExternalCancel({symbol:'BTC_TRY',orderId:order.orderId}),true,
      'exchange IDs for distinct symbols use different namespaces');
    assert.throws(()=>journal.claimExternalCancel({symbol:'../ETH_TRY',orderId:'123'}),/INVALID_CANCEL_SCOPE/);
    assert.throws(()=>journal.claimExternalCancel({symbol:'ETH_TRY',orderId:'bad'}));
  }finally{journal.close();}
});
test('no journal claim capability means emergency containment retains order without sending a request',async()=>{
  let writes=0,reason;
  const risk={halt:value=>{reason=value;},status:()=>({halted:true,reason})};
  const service=new LiveOrderService({
    journal:{pending:()=>[],get:()=>null},
    risk,loadInputs:async()=>({}),gate:()=>true,openOrderSymbols:['BTC_TRY'],
    client:{
      openOrders:async()=>[{symbol:'BTC_TRY',orderId:'11',status:0}],
      cancelByOrderId:async()=>{writes++;}
    }
  });
  const result=await service.containHalt();
  assert.equal(result.halted,true);
  assert.equal(result.retained.length,1);
  assert.equal(reason,'CANCEL_OUTCOME_UNKNOWN');
  assert.equal(writes,0);
});

test('slow or failed read-only exchange order reconciliation blocks submission before any POST',async()=>{
  const journal=new LiveOrderJournal(':memory:');
  let writes=0,halted=false,reason='';
  const risk={status:()=>({halted}),halt:value=>{halted=true;reason=value;}};
  const service=new LiveOrderService({journal,risk,openOrderSymbols:['BTC_TRY'],gate:()=>true,
    loadInputs:async()=>{throw Error('SHOULD_NOT_LOAD_WHILE_EXCHANGE_UNKNOWN');},
    client:{
      openOrders:async()=>{throw Error('ETIMEDOUT');},
      placeLimit:async()=>{writes++;}
    }
  });
  try{
    await assert.rejects(service.submit({symbol:'BTC_TRY',clientId:'para_slow_order_123'}),/ETIMEDOUT/);
    assert.equal(reason,'OPEN_ORDER_CHECK_FAILED');
    assert.equal(writes,0);
    assert.equal(journal.pending().length,0);
    await assert.rejects(service.submit({symbol:'BTC_TRY',clientId:'para_slow_order_123'}),/HALTED/);
    assert.equal(writes,0);
  }finally{journal.close();}
});
test('unknown placement blocks the same clientId and semantic order intent after restart',()=>{
  const dir=mkdtempSync(join(tmpdir(),'para-security-restart-'));
  const path=join(dir,'journal.sqlite');
  const original={symbol:'BTC_TRY',clientId:'para_intent_unknown_123',
    side:'BUY',quantity:'0.001',price:'100000',notional:'100'};
  let journal;
  try{
    journal=new LiveOrderJournal(path);
    journal.reserve(original,1800000000000);
    journal.setStatus(original.clientId,'UNKNOWN',1800000000001);
    journal.close();
    journal=new LiveOrderJournal(path);
    assert.equal(journal.get(original.clientId).status,'UNKNOWN');
    assert.deepEqual(journal.pending(),[original.clientId]);
    assert.throws(()=>journal.reserve(original,1800000000002),/DUPLICATE_CLIENT_ID/);
    assert.throws(()=>journal.reserve({...original,clientId:'para_new_id_intent_456'},1800000000002),/DUPLICATE_ACTIVE_ORDER/);
    assert.equal(journal.db.prepare('SELECT count(*) AS n FROM live_orders').get().n,1);
  }finally{journal?.close();rmSync(dir,{recursive:true,force:true});}
});
