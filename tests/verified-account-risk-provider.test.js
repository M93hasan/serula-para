import test from 'node:test';
import assert from 'node:assert/strict';
import {VerifiedAccountRiskProvider} from '../engine/verified-account-risk-provider.js';

const now=1_800_000_000_000;
const dayStartAt=now-now%86_400_000;
const balances=[{asset:'TRY',free:'1000',locked:'0'},{asset:'BTC',free:'0.5',locked:'0.1'}];
const fills=[
  {tradeId:'1',orderId:'10',symbol:'BTC_TRY',side:'BUY',time:dayStartAt-1,
    quantity:'1',quoteTry:'100',feeTry:'1'},
  {tradeId:'2',orderId:'11',symbol:'BTC_TRY',side:'SELL',time:dayStartAt+1,
    quantity:'0.4',quoteTry:'48',feeTry:'0.5'},
];
const quotes={connectionHealthy:true,asOf:now,metrics:{feeBps:10,spreadBps:12,slippageBps:8,volatilityBps:90},
  quotes:[{asset:'BTC',currentPriceTry:'90',currentPriceTime:now-1,
    openingPriceTry:'110',openingPriceTime:dayStartAt}]};

function make(changes={}){
  return new VerifiedAccountRiskProvider({clock:()=>now,
    loadLedger:async()=>({asOf:now,completeFromGenesis:true,externalFlows:0,fills,...changes.ledger}),
    loadQuotes:async()=>({...quotes,...changes.quotes}),
  });
}

test('derives verified daily PnL, fees, cost basis and total exposure from fills',async()=>{
  const result=await make().load({balances,accountAsOf:now});
  assert.equal(result.source,'verified-exchange-risk-monitor');
  assert.equal(result.dayTradeCount,1);
  assert.equal(result.dayFeesTry,'0.50000000');
  assert.equal(result.dayRealizedPnlTry,'7.10000000');
  assert.equal(result.dayNetPnlTry,'-8.50000000');
  assert.equal(result.totalExposureTry,'54.00000000');
  assert.deepEqual(result.positions,[{asset:'BTC',quantity:'0.60000000',exposureTry:'54.00000000',
    costBasisTry:'60.60000000',priceTime:now-1}]);
  assert.equal(result.pnl.coverage.complete,true);
});

test('fails closed on balance mismatch, external flows, missing history and stale quotes',async()=>{
  await assert.rejects(make().load({balances:[...balances.slice(0,1),{asset:'BTC',free:'0.7',locked:'0'}],accountAsOf:now}),/RISK_DATA_INCONSISTENT/);
  await assert.rejects(make({ledger:{externalFlows:1}}).load({balances,accountAsOf:now}),/RISK_DATA_UNAVAILABLE/);
  await assert.rejects(make({ledger:{completeFromGenesis:false}}).load({balances,accountAsOf:now}),/RISK_DATA_UNAVAILABLE/);
  await assert.rejects(make({quotes:{asOf:now-10001}}).load({balances,accountAsOf:now}),/RISK_DATA_UNAVAILABLE/);
  await assert.rejects(make().load({balances,accountAsOf:now-10001}),/RISK_DATA_UNAVAILABLE/);
});

test('rejects duplicate fills and unsupported non-TRY history',async()=>{
  await assert.rejects(make({ledger:{fills:[...fills,fills[0]]}}).load({balances,accountAsOf:now}),/RISK_DATA_UNAVAILABLE/);
  await assert.rejects(make({ledger:{fills:[{...fills[0],symbol:'BTC_USDT'}]}}).load({balances,accountAsOf:now}),/RISK_DATA_UNAVAILABLE/);
});
