import test from 'node:test';
import assert from 'node:assert/strict';
import {LiveOrderJournal} from '../engine/live-order-journal.js';
import {LiveOrderReconciler} from '../engine/live-order-reconciler.js';
import {LiveOrderService} from '../engine/live-order-service.js';

const symbols=Array.from({length:125},(_,i)=>`ASSET${i}_TRY`);

test('startup reconciliation covers the complete symbol scope and records an audit row',async t=>{
  const journal=new LiveOrderJournal(':memory:');
  const halted=[];
  const risk={halt:reason=>{halted.push(reason);},status:()=>({halted:false})};
  const seen=[];
  const service=new LiveOrderService({journal,risk,loadInputs:async()=>({}),openOrderSymbols:[],
    client:{openOrders:async symbol=>{seen.push(symbol);return [];}}});
  const reconciler=new LiveOrderReconciler({service,journal,risk,loadSymbols:async()=>symbols,intervalMs:5000});
  t.after(()=>{reconciler.stop();journal.close();});
  const result=await reconciler.start();
  assert.equal(result.status,'CLEAR');
  assert.equal(result.symbolCount,125);
  assert.deepEqual(seen,symbols);
  assert.equal(halted.length,0);
  assert.deepEqual({...journal.reconciliationHistory(1)[0]}, {
    trigger:'STARTUP',status:'CLEAR',startedAt:result.startedAt,completedAt:result.completedAt,
    symbolCount:125,exchangeOpenCount:0,pendingCount:0,reason:null,
  });
});

test('network ambiguity HALTs, survives audit, and a later periodic read can recover visibility',async t=>{
  const journal=new LiveOrderJournal(':memory:');
  const reasons=[];
  const risk={halt:reason=>{reasons.push(reason);},status:()=>({halted:true})};
  let online=false;
  const service={checkOpenOrders:async scope=>{
    assert.deepEqual(scope,['BTC_TRY']);
    if(!online)throw Error('ECONNRESET');
    return {openOrders:[],pending:[],clear:true};
  }};
  const reconciler=new LiveOrderReconciler({service,journal,risk,loadSymbols:async()=>['BTC_TRY'],intervalMs:5000});
  t.after(()=>{reconciler.stop();journal.close();});
  assert.equal((await reconciler.start()).status,'FAILED');
  assert.equal(reasons.at(-1),'RECONCILIATION_FAILURE');
  online=true;
  assert.equal((await reconciler.run('PERIODIC')).status,'CLEAR');
  assert.deepEqual(journal.reconciliationHistory(2).map(x=>x.status),['CLEAR','FAILED']);
});

test('exchange open orders remain unresolved and force HALT without a write',async t=>{
  const journal=new LiveOrderJournal(':memory:');
  const reasons=[];
  const risk={halt:reason=>{reasons.push(reason);},status:()=>({halted:false})};
  let writes=0;
  const service=new LiveOrderService({journal,risk,loadInputs:async()=>({}),openOrderSymbols:[],client:{
    openOrders:async symbol=>symbol==='BTC_TRY'?[{symbol,orderId:'42',status:0}]:[],
    cancel:async()=>{writes++;},placeLimit:async()=>{writes++;},
  }});
  const reconciler=new LiveOrderReconciler({service,journal,risk,loadSymbols:async()=>['BTC_TRY','ETH_TRY'],intervalMs:5000});
  t.after(()=>{reconciler.stop();journal.close();});
  const result=await reconciler.start();
  assert.equal(result.status,'HALTED');
  assert.equal(result.exchangeOpenCount,1);
  assert.equal(reasons.at(-1),'UNRESOLVED_ORDERS');
  assert.equal(writes,0);
});
