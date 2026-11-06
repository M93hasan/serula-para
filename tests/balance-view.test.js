import test from 'node:test';
import assert from 'node:assert/strict';
import {prepareBalances,displayQuantity} from '../src/balance-view.js';

test('shows free, locked and total without floating point rounding',()=>{
  const rows=prepareBalances([{asset:'BNB',free:'0.00000001',locked:'0.00000002'},{asset:'TRY',free:'20.25',locked:'3.75'}]);
  assert.deepEqual(rows,[
    {asset:'BNB',free:'0.00000001',locked:'0.00000002',total:'0.00000003'},
    {asset:'TRY',free:'20.25',locked:'3.75',total:'24'}
  ]);
  assert.equal(displayQuantity(rows[0].total),'0,00000003');
});
test('filters truly zero assets, retains tiny locked funds',()=>{
  assert.deepEqual(prepareBalances([{asset:'BTC',free:'0',locked:'0'},{asset:'ETH',free:'0',locked:'0.00000000001'}]),[
    {asset:'ETH',free:'0',locked:'0.00000000001',total:'0.00000000001'}
  ]);
});
test('rejects duplicate assets and invalid exchange decimals',()=>{
  assert.throws(()=>prepareBalances([{asset:'BNB',free:'1',locked:'0'},{asset:'BNB',free:'1',locked:'0'}]),/INVALID_BALANCE/);
  for(const free of ['-1','NaN','1e-8','1,23',undefined]){
    assert.throws(()=>prepareBalances([{asset:'BNB',free,locked:'0'}]),/INVALID_BALANCE/);
  }
});
