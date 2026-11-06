import test from 'node:test';
import assert from 'node:assert/strict';
import { reconnectDelay } from '../src/market-reconnect.js';

test('backoff increases and is capped to one minute', () => {
  assert.deepEqual([1,2,3,4,5,6,20].map(reconnectDelay),[5000,10000,20000,40000,60000,60000,60000]);
});
test('invalid retry counter is rejected', () => {
  for (const value of [0,-1,1.5,NaN]) assert.throws(()=>reconnectDelay(value),RangeError);
});
