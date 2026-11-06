import test from 'node:test';
import assert from 'node:assert/strict';
import {BinanceTROrderClient} from '../engine/binance-tr-order-client.js';
import {LiveOrderJournal} from '../engine/live-order-journal.js';
import {LiveOrderService} from '../engine/live-order-service.js';
import {createLiveOrderInputs} from '../engine/live-order-inputs.js';
import {LiveRiskEngine} from '../engine/live-risk-engine.js';
import {calculateDailyTradingPnl} from '../engine/daily-trading-pnl.js';

const now=1_800_000_000_000;
const dayStartAt=now-now%86_400_000;
const symbol='BTC_TRY';
const keys={apiKey:'test-key',secretKey:'test-secret'};

test('open order listing uses signed GET and rejects wrong symbols and truncated pages',async()=>{
  const order={symbol,orderId:'42',status:1};
  let list=[order];
  const client=new BinanceTROrderClient({keys,clock:()=>now,fetchImpl:async(url,request)=>{
    const parsed=new URL(url);
    assert.equal(parsed.pathname,'/open/v1/orders');
    assert.equal(parsed.searchParams.get('symbol'),symbol);
    assert.equal(parsed.searchParams.get('type'),'1');
    assert.match(parsed.searchParams.get('signature'),/^[a-f0-9]{64}$/);
    assert.equal(request.method,'GET');
    assert.equal(request.headers['X-MBX-APIKEY'],keys.apiKey);
    return Response.json({code:0,data:{list}});
  }});
  assert.deepEqual(await client.openOrders(symbol),[order]);
  list=[{...order,symbol:'ETH_TRY'}];
  await assert.rejects(client.openOrders(symbol),/INVALID_OPEN_ORDER/);
  list=Array(1000).fill(order);
  await assert.rejects(client.openOrders(symbol),/OPEN_ORDERS_INCOMPLETE/);
});

test('daily PnL deducts fees and uses the change in unrealized PnL',()=>{
  const input={now,coverage:{from:dayStartAt,through:now,complete:true,externalFlows:0},
    openingUnrealizedTry:'12',currentUnrealizedTry:'-4.05',sales:[
      {tradeId:'1',symbol,time:now-1,proceedsTry:'100',acquisitionCostTry:'85',sellingFeeTry:'0.15'},
    ]};
  assert.deepEqual(calculateDailyTradingPnl(input),{
    dayStartAt,dayRealizedPnlTry:'14.85000000',dayNetPnlTry:'-1.20000000',
  });
  assert.throws(()=>calculateDailyTradingPnl({...input,sales:[...input.sales,...input.sales]}),/DUPLICATE_PNL_FILL/);
  assert.throws(()=>calculateDailyTradingPnl({...input,coverage:{...input.coverage,externalFlows:1}}),/PNL_DATA_UNAVAILABLE/);
});

test('proposals are stable across retries and an unknown order blocks all writes',async t=>{
  const journal=new LiveOrderJournal(':memory:');
  const risk=new LiveRiskEngine({journal,clock:()=>now,approval:()=>true,healthProvider:async()=>context});
  t.after(()=>{risk.close();journal.close();});
  const context={source:'verified-exchange-risk-monitor',connectionHealthy:true,asOf:now,
    dayStartAt,dayTradeCount:0,dayRealizedPnlTry:'0',dayNetPnlTry:'0',totalExposureTry:'0',
    positions:[],feeBps:10,spreadBps:12,slippageBps:10,volatilityBps:90};
  const candles=Array.from({length:20},(_,i)=>({close:99_000+i*50,closeTime:now-1-(19-i)*3_600_000}));
  const input={now,riskContext:context,maxNotional:'250',market:{price:100_000,priceTime:now-1,candles},
    balances:[{asset:'TRY',free:'500'}],symbolInfo:{symbol,type:1,spotTradingEnable:1,filters:[
      {filterType:'PRICE_FILTER',tickSize:'1'},{filterType:'LOT_SIZE',minQty:'0.001',stepSize:'0.001'},
      {filterType:'NOTIONAL',minNotional:'50'},
    ]}};
  let writes=0,reads=0;
  const service=new LiveOrderService({journal,risk,clock:()=>now,openOrderSymbols:[symbol],gate:()=>true,loadInputs:async()=>input,
    loadNews:async()=>({evidence:{verified:true,symbol,expiresAt:now+1_000}}),client:{
      openOrders:async()=>{reads++;return [];},
      detail:async()=>{throw Error('TIMEOUT');},
      placeLimit:async()=>{writes++;throw Error('TIMEOUT');},
    }});
  const request={symbol,quantity:'0.001',price:'100000'};
  risk.arm(context);
  const first=await service.previewSignal(request);
  assert.equal(first.action,'AL');
  assert.equal(first.executionAuthorized,false);
  assert.equal((await service.previewSignal(request)).order.clientId,first.order.clientId);
  assert.equal(writes,0);
  assert.equal(reads,2);
  for(const [i,candle] of candles.entries())candle.close=101_000-i*50;
  assert.equal((await service.previewSignal(request)).reason,'BALANCE_UNAVAILABLE');
  input.balances.push({asset:'BTC',free:'0.001'});
  const sell=await service.previewSignal(request);
  assert.equal(sell.action,'SAT');
  assert.equal(sell.order.clientId,first.order.clientId);
  assert.equal(writes,0);

  assert.equal((await service.submit(first.order)).status,'UNKNOWN');
  assert.equal((await service.previewSignal(request)).action,'BEKLE');
  assert.equal((await service.checkOpenOrders([symbol])).clear,false);
  assert.throws(()=>risk.arm(context),/UNRESOLVED_ORDERS/);
  await assert.rejects(service.submit({...first.order,clientId:'para_new_client_1'}),/HALTED/);
  assert.equal(writes,1);
});

test('external open orders and stop-loss stop proposals without canceling or liquidating',async t=>{
  const journal=new LiveOrderJournal(':memory:');
  const context={source:'verified-exchange-risk-monitor',connectionHealthy:true,asOf:now,
    dayStartAt,dayTradeCount:0,dayRealizedPnlTry:'0',dayNetPnlTry:'0',totalExposureTry:'0',
    positions:[],feeBps:10,spreadBps:12,slippageBps:10,volatilityBps:90};
  const risk=new LiveRiskEngine({journal,clock:()=>now,approval:()=>true,healthProvider:async()=>context});
  t.after(()=>{risk.close();journal.close();});
  let open=true,writes=0;
  const service=new LiveOrderService({journal,risk,clock:()=>now,openOrderSymbols:[symbol],loadInputs:async()=>({riskContext:context}),
    client:{openOrders:async()=>open?[{symbol,orderId:'12',status:0}]:[],
      placeLimit:async()=>{writes++;},cancel:async()=>{writes++;}}});
  const request={symbol};
  risk.arm(context);
  assert.equal((await service.previewSignal(request)).reason,'UNRESOLVED_ORDERS');
  assert.equal(risk.status().halted,true);

  open=false;
  risk.arm(context);
  context.positions=[{asset:'BTC',exposureTry:'90',costBasisTry:'100',priceTime:now-1}];
  context.totalExposureTry='90';
  assert.equal((await service.previewSignal(request)).reason,'STOP_LOSS_TRIGGERED');
  assert.equal(risk.status().halted,true);
  assert.equal(risk.exitPlan(context)[0].executionAuthorized,false);
  assert.equal(writes,0);
});

test('the risk input loader derives PnL from the configured ledger and rejects gaps',async()=>{
  let complete=true;
  const load=createLiveOrderInputs({keys,clock:()=>now,
    exchange:{
      symbols:async()=>({code:0,timestamp:now,data:{list:[{symbol}]}}),
      account:async()=>({code:0,timestamp:now,data:{canTrade:1,canWithdraw:0,accountAssets:[]}}),
    },
    market:{snapshot:async()=>({asOf:now,markets:[{symbol}]})},
    loadRisk:async()=>({asOf:now,dayNetPnlTry:'99',pnl:{
      now,coverage:{from:dayStartAt,through:now,complete,externalFlows:0},sales:[],
      openingUnrealizedTry:'0',currentUnrealizedTry:'-1.2',
    }}),
  });
  const {riskContext}=await load(symbol);
  assert.equal(riskContext.dayNetPnlTry,'-1.20000000');
  assert.equal(riskContext.dayRealizedPnlTry,'0.00000000');
  complete=false;
  await assert.rejects(load(symbol),/PNL_DATA_UNAVAILABLE/);
});
