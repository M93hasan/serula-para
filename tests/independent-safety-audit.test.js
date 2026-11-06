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
