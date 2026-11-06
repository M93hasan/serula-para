import test from 'node:test';
import assert from 'node:assert/strict';
import {isFreshMarketPrice,MAX_PRICE_AGE_MS} from '../engine/market-freshness.js';

const now=1_800_000_000_000;
const market=(priceTime,price=100)=>({symbol:'BTC_TRY',price,priceTime});

test('accepts a strictly fresh market observation',()=>{
  assert.equal(isFreshMarketPrice(market(now),now),true);
  assert.equal(isFreshMarketPrice(market(now-MAX_PRICE_AGE_MS),now),true);
});
test('rejects stale, missing, malformed and future-dated prices',()=>{
  assert.equal(isFreshMarketPrice(market(now-MAX_PRICE_AGE_MS-1),now),false);
  assert.equal(isFreshMarketPrice(market(now+1),now),false);
  assert.equal(isFreshMarketPrice(market(undefined),now),false);
  assert.equal(isFreshMarketPrice(market(now,0),now),false);
  assert.equal(isFreshMarketPrice(market(now,NaN),now),false);
  assert.equal(isFreshMarketPrice(null,now),false);
});
