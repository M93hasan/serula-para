import test from 'node:test';
import assert from 'node:assert/strict';
import {assessScalpingCosts} from '../engine/scalping-cost-gate.js';
const now=1800000000000;
const data={expectedGrossMoveBps:30,entryFeeBps:10,exitFeeBps:10,spreadBps:5,
  entrySlippageBps:3,exitSlippageBps:3,safetyBufferBps:2,
  liquidityVerified:true,feeScheduleVerified:true,riskVerified:true,marketAsOf:now-1000,now};
test('small expected gross move is rejected after fees spread slippage and safety buffer',()=>{
  const result=assessScalpingCosts(data);
  assert.equal(result.status,'BEKLE');
  assert.equal(result.roundTripCostBps,33);
  assert.equal(result.netEdgeBps,-3);
  assert.equal(result.executionAuthorized,false);
});
test('positive net estimate remains research only and never authorizes any execution',()=>{
  const result=assessScalpingCosts({...data,expectedGrossMoveBps:60});
  assert.equal(result.status,'RESEARCH_CANDIDATE');
  assert.equal(result.netEdgeBps,27);
  assert.equal(result.executionAuthorized,false);
});
test('stale price, missing verified fees, low liquidity or unknown risk fails closed',()=>{
  for(const changed of [
    {marketAsOf:now-30001},{marketAsOf:now+1},{marketAsOf:null},
    {feeScheduleVerified:false},{liquidityVerified:false},{riskVerified:false},
    {entryFeeBps:undefined},{spreadBps:-1},{entrySlippageBps:Infinity},
    {safetyBufferBps:NaN},{expectedGrossMoveBps:NaN}
  ]){
    const result=assessScalpingCosts({...data,...changed});
    assert.equal(result.status,'BEKLE',JSON.stringify(changed));
    assert.equal(result.executionAuthorized,false);
  }
});
test('stress replay with fee spikes and adverse spread never promotes a candidate',()=>{
  for(const changed of [
    {entryFeeBps:30,exitFeeBps:30},{spreadBps:60},
    {entrySlippageBps:70},{exitSlippageBps:50},
    {safetyBufferBps:100}
  ]){
    const result=assessScalpingCosts({...data,expectedGrossMoveBps:45,...changed});
    assert.equal(result.status,'BEKLE',JSON.stringify(changed));
  }
});
