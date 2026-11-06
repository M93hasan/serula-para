import test from 'node:test';
import assert from 'node:assert/strict';
import {createBinanceTRRiskLedgerLoader} from '../engine/binance-tr-risk-ledger.js';

const now=1_800_000_000_000;
const base={tradeId:'1',orderId:'2',symbol:'BTC_TRY',price:'100',qty:'1',quoteQty:'100',
  commission:'0.01',commissionAsset:'BTC',isBuyer:true,time:now-1};

test('normalizes Binance TR base and quote fee fills with verified flow coverage',async()=>{
  const client={trades:async(symbol,query)=>{
    assert.equal(symbol,'BTC_TRY');
    assert.deepEqual(query,{startTime:1,endTime:now,limit:500});
    return [base,{...base,tradeId:'3',orderId:'4',commission:'0.2',commissionAsset:'TRY',isBuyer:false}];
  }};
  const load=createBinanceTRRiskLedgerLoader({client,accountOpenedAt:1,clock:()=>now,
    loadSymbols:async()=>['BTC_TRY'],loadExternalFlows:async()=>({complete:true,count:0,asOf:now})});
  assert.deepEqual((await load({through:now})).fills,[
    {tradeId:'1',orderId:'2',symbol:'BTC_TRY',side:'BUY',time:now-1,quantity:'0.99000000',quoteTry:'100',feeTry:'1.00'},
    {tradeId:'3',orderId:'4',symbol:'BTC_TRY',side:'SELL',time:now-1,quantity:'1.00000000',quoteTry:'100',feeTry:'0.2'},
  ]);
});

test('fails closed when flow history or third-asset fee conversion is unavailable',async()=>{
  const client={trades:async()=>[{...base,commissionAsset:'BNB'}]};
  const common={client,accountOpenedAt:1,clock:()=>now,loadSymbols:async()=>['BTC_TRY']};
  let load=createBinanceTRRiskLedgerLoader({...common,loadExternalFlows:async()=>({complete:true,count:0,asOf:now})});
  await assert.rejects(load({through:now}),/RISK_DATA_UNAVAILABLE/);
  load=createBinanceTRRiskLedgerLoader({...common,convertFeeToTry:async()=> '0.5',
    loadExternalFlows:async()=>({complete:false,count:0,asOf:now})});
  await assert.rejects(load({through:now}),/RISK_DATA_UNAVAILABLE/);
});
