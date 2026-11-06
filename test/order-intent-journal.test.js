import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { OrderIntentJournal } from '../engine/order-intent-journal.js';
const order = {symbol:'BTC_TRY',side:'BUY',quantity:'0.001',price:'100000'};
const key = 'a'.repeat(32);
const withJournal = fn => {
  const dir = mkdtempSync(join(tmpdir(),'para-order-journal-'));
  const file = join(dir,'journal.sqlite');
  try { fn(file); } finally { rmSync(dir,{recursive:true,force:true}); }
};
test('reserve persists but cannot submit and never contains credentials',()=>withJournal(file=>{
  const j = new OrderIntentJournal(file);
  try {
    const saved = j.reserve({idempotencyKey:key,order});
    assert.equal(saved.executionEnabled,false);
    assert.match(saved.clientOrderId,/^para_[0-9a-f]{32}$/);
    const row=j.status(saved.intentId);
    assert.equal(row.status,'RESERVED');
    assert.equal(row.retryAllowed,false);
    assert.equal(JSON.stringify(row).includes('apiKey'),false);
  } finally {j.close();}
}));
test('duplicate key cannot be used after restart',()=>withJournal(file=>{
  let j=new OrderIntentJournal(file);const saved=j.reserve({idempotencyKey:key,order});j.close();
  j=new OrderIntentJournal(file);
  try {assert.equal(j.status(saved.intentId).status,'RESERVED');
    assert.throws(()=>j.reserve({idempotencyKey:key,order}),/DUPLICATE_INTENT/);
    assert.throws(()=>j.reserve({idempotencyKey:key,order:{...order,side:'SELL'}}),/IDEMPOTENCY_CONFLICT/);
  } finally {j.close();}
}));
test('ambiguous outcome never reopens or retries reservation',()=>withJournal(file=>{
  const j=new OrderIntentJournal(file);
  try {const a=j.reserve({idempotencyKey:key,order});
    assert.equal(j.markUnknown(a.intentId).retryAllowed,false);
    assert.throws(()=>j.markUnknown(a.intentId),/NOT_RESERVABLE/);
    assert.throws(()=>j.reserve({idempotencyKey:key,order}),/DUPLICATE_INTENT/);
    assert.equal(j.status(a.intentId).status,'UNKNOWN');
  }finally{j.close();}
}));
test('reconciliation records a reference without freeing idempotency key',()=>withJournal(file=>{
  const j=new OrderIntentJournal(file);
  try {const a=j.reserve({idempotencyKey:key,order});j.markUnknown(a.intentId);
    assert.equal(j.recordReconciliation({intentId:a.intentId,exchangeOrderId:'12345'}).retryAllowed,false);
    assert.equal(j.status(a.intentId).status,'RECONCILED');
    assert.throws(()=>j.reserve({idempotencyKey:key,order}),/DUPLICATE_INTENT/);
    assert.throws(()=>j.recordReconciliation({intentId:a.intentId,exchangeOrderId:'12345'}),/UNAVAILABLE/);
  }finally{j.close();}
}));
test('invalid input, unknown transitions and bad reconciliation always reject',()=>withJournal(file=>{
  const j=new OrderIntentJournal(file);
  try {
    assert.throws(()=>j.reserve({idempotencyKey:'bad',order}),/INVALID_INTENT/);
    assert.throws(()=>j.reserve({idempotencyKey:key,order:{...order,price:'1e5'}}),/INVALID_INTENT/);
    assert.throws(()=>j.markUnknown('b'.repeat(32)),/NOT_RESERVABLE/);
    assert.throws(()=>j.recordReconciliation({intentId:key,exchangeOrderId:'unexpected'}),/INVALID_RECONCILIATION/);
    const a=j.reserve({idempotencyKey:key,order});
    assert.throws(()=>j.recordReconciliation({intentId:a.intentId,exchangeOrderId:'123'}),/UNAVAILABLE/);
  }finally{j.close();}
}));
