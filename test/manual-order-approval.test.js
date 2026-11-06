import test from 'node:test';
import assert from 'node:assert/strict';
import { ManualOrderApproval } from '../engine/manual-order-approval.js';
const good = {symbol:'BTC_TRY',side:'BUY',quantity:'0.001',price:'100000'};
const gate = (clock = () => 10000) => new ManualOrderApproval({maxOrderTry:500,clock});
test('valid order requires an exact, single-use approval and never sends it',()=>{
  const g=gate(), p=g.propose(good);
  const approved=g.approve({id:p.id,digest:p.digest,confirmation:'ONAYLA '+p.id});
  assert.equal(approved.status,'APPROVED_NOT_SENT');
  assert.equal(approved.executionEnabled,false);
  assert.equal(g.pendingCount,0);
  assert.throws(()=>g.approve({id:p.id,digest:p.digest,confirmation:'ONAYLA '+p.id}),/UNAVAILABLE/);
});
test('a wrong confirmation consumes the proposal',()=>{
  const g=gate(),p=g.propose(good);
  assert.throws(()=>g.approve({id:p.id,digest:p.digest,confirmation:'ONAYLA'}),/REJECTED/);
  assert.throws(()=>g.approve({id:p.id,digest:p.digest,confirmation:'ONAYLA '+p.id}),/UNAVAILABLE/);
});
test('expires before approval',()=>{
  let now=10000;const g=gate(()=>now),p=g.propose(good);now=70000;
  assert.throws(()=>g.approve({id:p.id,digest:p.digest,confirmation:'ONAYLA '+p.id}),/REJECTED/);
});
test('new proposal invalidates previous approval',()=>{
  const g=gate(),a=g.propose(good);g.propose({...good,side:'SELL'});
  assert.throws(()=>g.approve({id:a.id,digest:a.digest,confirmation:'ONAYLA '+a.id}),/UNAVAILABLE/);
});
test('requires positive limits and rejects invalid or excessive orders',()=>{
  assert.throws(()=>new ManualOrderApproval(),/MAX_ORDER_REQUIRED/);
  const g=gate();
  for(const order of [{...good,quantity:'10'}, {...good,symbol:'BTC_USDT'},
    {...good,side:'TRANSFER'}, {...good,price:'1e5'}, {...good,quantity:'-1'},
    {...good,extra:true}, {...good,price:0}])
    assert.throws(()=>g.propose(order));
});
test('cancel invalidates all proposed orders',()=>{
  const g=gate(),p=g.propose(good);g.cancel();
  assert.throws(()=>g.approve({id:p.id,digest:p.digest,confirmation:'ONAYLA '+p.id}),/UNAVAILABLE/);
});
test('digest cannot be replaced',()=>{
  const g=gate(),p=g.propose(good);
  assert.throws(()=>g.approve({id:p.id,digest:'a'.repeat(64),confirmation:'ONAYLA '+p.id}),/REJECTED/);
});
