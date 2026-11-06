import test from 'node:test';
import assert from 'node:assert/strict';
import {valuePortfolio} from '../src/portfolio.js';

const now=1800000000000;
const balances=[{asset:'BNB',free:'1.5',locked:'0.5'}];
const market=priceTime=>[{symbol:'BNB_TRY',price:25000,priceTime}];

test('BNB free and locked balance are valued in TRY using fresh BNB_TRY',()=>{
  const result=valuePortfolio(balances,market(now-5000),now);
  assert.equal(result.subtotal,50000);
  assert.deepEqual(result.missing,[]);
  assert.equal(result.complete,true);
});
test('BNB valuation is excluded if the quote is stale or future dated',()=>{
  for(const time of [now-30001,now+1]){
    const result=valuePortfolio(balances,market(time),now);
    assert.equal(result.complete,false);
    assert.equal(result.subtotal,0);
    assert.deepEqual(result.missing,['BNB']);
  }
});
test('BNB valuation cannot be inferred from an unrelated pair',()=>{
  const result=valuePortfolio(balances,[{symbol:'BTC_TRY',price:25000,priceTime:now}],now);
  assert.deepEqual(result.missing,['BNB']);
});
