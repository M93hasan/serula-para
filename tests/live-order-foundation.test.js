import test from 'node:test';
import assert from 'node:assert/strict';
import {assertValidLimitOrder,multipleOf} from '../engine/order-rules.js';
import {LiveOrderJournal} from '../engine/live-order-journal.js';
import {LiveOrderService} from '../engine/live-order-service.js';
import {BinanceTROrderClient} from '../engine/binance-tr-order-client.js';

const now=1800000000000;
const order={symbol:'BTC_TRY',side:'BUY',quantity:'0.002',price:'100000',clientId:'para_test_0001'};
const symbolInfo={symbol:'BTC_TRY',type:1,spotTradingEnable:1,status:'TRADING',filters:[
 {filterType:'PRICE_FILTER',minPrice:'1',maxPrice:'10000000',tickSize:'0.01'},
 {filterType:'LOT_SIZE',minQty:'0.001',maxQty:'10',stepSize:'0.001'},
 {filterType:'NOTIONAL',minNotional:'50'}
]};
const balances=[{asset:'TRY',free:'500',locked:'900'},{asset:'BTC',free:'0.01',locked:'0'}];
const inputs={symbolInfo,balances,market:{price:100000,priceTime:now-1000},now,maxNotional:'300'};
const remote=(status,executedQty='0')=>({clientId:order.clientId,symbol:order.symbol,status,origQty:order.quantity,executedQty,executedQuoteQty:executedQty==='0'?'0':String(Number(executedQty)*100000),orderId:'42'});

test('exact limits, price age, available-only balance and risk cap',()=>{
 assert.equal(assertValidLimitOrder({order,...inputs}).notional,'200.000000');
 assert.equal(multipleOf('0.002','0.001','0.001'),true);
 for(const altered of [
  {order:{...order,price:'100000.001'}},
  {order:{...order,quantity:'0.0001'}},
  {order:{...order,quantity:'0.001',price:'1000'}},
  {order:{...order,quantity:'0.002',price:'110000'}},
  {balances:[{asset:'TRY',free:'100',locked:'10000'}]},
  {market:{price:100000,priceTime:now-30001}},
  {maxNotional:'100'}
 ])assert.throws(()=>assertValidLimitOrder({order,...inputs,...altered}));
});

test('disabled gate never sends orders',async()=>{
 const db=new LiveOrderJournal(':memory:');let calls=0;
 const svc=new LiveOrderService({journal:db,client:{placeLimit:async()=>{calls++;}},loadInputs:async()=>inputs});
 await assert.rejects(svc.submit(order),/LIVE_ORDERS_DISABLED/);
 assert.equal(calls,0);db.close();
});

test('durable idempotency, partial fills, and timeout reconciliation',async()=>{
 const db=new LiveOrderJournal(':memory:');let sent=0,phase=0;
 const client={
  placeLimit:async()=>{sent++;throw Error('TIMEOUT');},
  detail:async()=>phase===0?Promise.reject(Error('NETWORK')):phase===1?remote(1,'0.001'):remote(2,'0.002'),
  cancel:async()=>{throw Error('TIMEOUT');}
 };
 const svc=new LiveOrderService({journal:db,client,loadInputs:async()=>inputs,gate:()=>true});
 const first=await svc.submit(order);
 assert.equal(first.status,'UNKNOWN');
 await assert.rejects(svc.submit(order),/DUPLICATE_CLIENT_ID/);
 assert.equal(sent,1);
 phase=1;const partial=await svc.reconcile(order.clientId);
 assert.equal(partial.status,'PARTIALLY_FILLED');
 assert.equal(partial.executedQty,'0.001');
 phase=2;const filled=await svc.reconcile(order.clientId);
 assert.equal(filled.status,'FILLED');
 assert.equal(filled.executedQty,'0.002');
 assert.equal((await svc.cancel(order.clientId)).status,'FILLED');
 db.close();
});

test('cancel timeout cannot erase partial execution',async()=>{
 const db=new LiveOrderJournal(':memory:');db.reserve({...order,notional:'200'});
 db.observe(order.clientId,remote(1,'0.001'));
 const svc=new LiveOrderService({journal:db,client:{cancel:async()=>{throw Error('TIMEOUT')},detail:async()=>remote(3,'0.001')},loadInputs:async()=>inputs,gate:()=>true});
 const state=await svc.cancel(order.clientId);
 assert.equal(state.status,'CANCELED');
 assert.equal(state.executedQty,'0.001');db.close();
});

test('signed client uses only allowlisted paths and never withdrawal routes',async()=>{
 const seen=[];
 const fetchImpl=async(url,opts)=>{seen.push({url,opts});return {ok:true,json:async()=>({code:0,data:{orderId:'42'}})}};
 const cli=new BinanceTROrderClient({fetchImpl,clock:()=>now,keys:{apiKey:'test-key',secretKey:'test-secret'}});
 await cli.placeLimit(order);await cli.detail(order.clientId);await cli.cancel(order.clientId);
 assert.deepEqual(seen.map(x=>new URL(x.url).pathname),['/open/v1/orders','/open/v1/orders/detail','/open/v1/orders/cancel']);
 assert.deepEqual(seen.map(x=>x.opts.method),['POST','GET','POST']);
 assert.ok(seen.every(x=>new URL(x.url).searchParams.has('signature')&&x.opts.headers['X-MBX-APIKEY']==='test-key'));
 assert.ok(seen.every(x=>!x.url.includes('withdraw')));
});
