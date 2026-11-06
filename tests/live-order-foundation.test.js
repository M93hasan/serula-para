import test from 'node:test';
import {mkdtempSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {createHmac} from 'node:crypto';
import assert from 'node:assert/strict';
import {assertValidLimitOrder,multipleOf} from '../engine/order-rules.js';
import {LiveOrderJournal} from '../engine/live-order-journal.js';
import {LiveOrderService} from '../engine/live-order-service.js';
import {BinanceTROrderClient} from '../engine/binance-tr-order-client.js';
import {createLiveOrderInputs} from '../engine/live-order-inputs.js';

const now=1800000000000;
const order={symbol:'BTC_TRY',side:'BUY',quantity:'0.002',price:'100000',clientId:'para_test_0001'};
const symbolInfo={symbol:'BTC_TRY',type:1,spotTradingEnable:1,status:'TRADING',filters:[
 {filterType:'PRICE_FILTER',minPrice:'1',maxPrice:'10000000',tickSize:'0.01'},
 {filterType:'LOT_SIZE',minQty:'0.001',maxQty:'10',stepSize:'0.001'},
 {filterType:'NOTIONAL',minNotional:'50'}
]};
const balances=[{asset:'TRY',free:'500',locked:'900'},{asset:'BTC',free:'0.01',locked:'0'}];
const inputs={symbolInfo,balances,market:{price:100000,priceTime:now-1000},now,maxNotional:'300'};
const mockRisk=db=>({reserve:validated=>db.reserve(validated),status:()=>({halted:false}),halt:()=>({halted:true})});
const remote=(status,executedQty='0')=>({clientId:order.clientId,symbol:order.symbol,side:0,type:1,price:order.price,status,origQty:order.quantity,executedQty,executedQuoteQty:executedQty==='0'?'0':String(Number(executedQty)*100000),orderId:'42'});

test('exact limits, price age, available-only balance and risk cap',()=>{
 assert.equal(assertValidLimitOrder({order,...inputs}).notional,'200.000');
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
  openOrders:async()=>[],
  placeLimit:async()=>{sent++;throw Error('TIMEOUT');},
  detail:async()=>phase===0?Promise.reject(Error('NETWORK')):phase===1?remote(1,'0.001'):remote(2,'0.002'),
  cancel:async()=>{throw Error('TIMEOUT');}
 };
 const svc=new LiveOrderService({journal:db,client,loadInputs:async()=>inputs,openOrderSymbols:[order.symbol],gate:()=>true,risk:mockRisk(db)});
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
 const svc=new LiveOrderService({journal:db,client:{cancel:async()=>{throw Error('TIMEOUT')},detail:async()=>remote(3,'0.001')},loadInputs:async()=>inputs,gate:()=>true,risk:mockRisk(db)});
 const state=await svc.cancel(order.clientId);
 assert.equal(state.status,'CANCELED');
 assert.equal(state.executedQty,'0.001');db.close();
});

test('signed client uses only allowlisted paths and never withdrawal routes',async()=>{
 const seen=[];
 const fetchImpl=async(url,opts)=>{seen.push({url,opts});return {ok:true,json:async()=>({code:0,data:{orderId:'42'}})}};
 const cli=new BinanceTROrderClient({fetchImpl,clock:()=>now,keys:{apiKey:'test-key',secretKey:'test-secret'},writeApproval:()=>true});
 await cli.placeLimit(order);await cli.detail(order.clientId,'42');await cli.cancel(order.clientId,'42');
 assert.deepEqual(seen.map(x=>new URL(x.url).pathname),['/open/v1/orders','/open/v1/orders/detail','/open/v1/orders/cancel']);
 assert.deepEqual(seen.map(x=>x.opts.method),['POST','GET','POST']);
 assert.ok(seen.slice(1).every(x=>new URL(x.url).searchParams.get('orderId')==='42'&&!new URL(x.url).searchParams.has('clientId')));
 assert.ok(seen.every(x=>new URL(x.url).searchParams.has('signature')&&x.opts.headers['X-MBX-APIKEY']==='test-key'));
 for(const entry of seen){const u=new URL(entry.url),expected=u.searchParams.get('signature');u.searchParams.delete('signature');assert.equal(expected,createHmac('sha256','test-secret').update(u.searchParams.toString()).digest('hex'));}
 assert.ok(seen.every(x=>!x.url.includes('withdraw')));
});

test('exchange transport denies writing without independent approval',async()=>{
 let called=0;
 const cli=new BinanceTROrderClient({fetchImpl:async()=>{called++;throw Error('should not call network')},keys:{apiKey:'key',secretKey:'secret'}});
 await assert.rejects(cli.placeLimit(order),/LIVE_ORDERS_DISABLED/);
 await assert.rejects(cli.cancel(order.clientId,'42'),/LIVE_ORDERS_DISABLED/);
 assert.throws(()=>cli.cancel(order.clientId),/ORDER_ID_REQUIRED/);
 assert.equal(called,0);
});
test('fill quantities cannot regress or exceed original order',()=>{
 const db=new LiveOrderJournal(':memory:');
 db.reserve({...order,notional:'200'});
 db.observe(order.clientId,remote(1,'0.001'));
 assert.throws(()=>db.observe(order.clientId,remote(0,'0')),/INVALID_FILL_PROGRESS/);
 assert.throws(()=>db.observe(order.clientId,remote(2,'0.003')),/INVALID_FILL_PROGRESS/);
 assert.equal(db.get(order.clientId).executedQty,'0.001');
 db.close();
});

test('same active order with another clientId is blocked, and no retry is issued',()=>{
 const db=new LiveOrderJournal(':memory:');
 db.reserve({...order,notional:'200'});
 assert.throws(()=>db.reserve({...order,clientId:'para_test_0002',notional:'200'}),/DUPLICATE_ACTIVE_ORDER/);
 db.observe(order.clientId,remote(2,'0.002'));
 assert.doesNotThrow(()=>db.reserve({...order,clientId:'para_test_0002',notional:'200'}));
 db.close();
});

test('same semantic order with padded decimal price/quantity is blocked',()=>{
 const db=new LiveOrderJournal(':memory:');db.reserve({...order,notional:'200'});
 assert.throws(()=>db.reserve({...order,quantity:'0.0020',price:'100000.00',clientId:'para_other_0003',notional:'200'}),/DUPLICATE_ACTIVE_ORDER/);
 db.close();
});
test('trusted inputs require withdraw-disabled account and nonstale snapshots',async()=>{
 let withdraw=0;
 const exchange={
  symbols:async()=>({code:0,timestamp:now,data:{list:[symbolInfo]}}),
  account:async()=>({code:0,timestamp:now,data:{canTrade:1,canWithdraw:withdraw,accountAssets:balances}})
 };
 const market={snapshot:async()=>({asOf:now,markets:[{symbol:order.symbol,price:100000,priceTime:now-1000}]})};
 const load=createLiveOrderInputs({exchange,market,keys:{apiKey:'a',secretKey:'b'},clock:()=>now});
 const result=await load(order.symbol);
 assert.deepEqual(result.balances,balances);
 withdraw=1;
 await assert.rejects(load(order.symbol),/ACCOUNT_PERMISSIONS_UNSAFE/);
});

test('journal survives process restart and keeps unresolved order blocked',()=>{
 const dir=mkdtempSync(join(tmpdir(),'para-order-'));
 try{
  const path=join(dir,'orders.sqlite');
  let db=new LiveOrderJournal(path);
  db.reserve({...order,notional:'200'});
  db.setStatus(order.clientId,'UNKNOWN');
  db.close();
  db=new LiveOrderJournal(path);
  assert.equal(db.get(order.clientId).status,'UNKNOWN');
  assert.throws(()=>db.reserve({...order,clientId:'para_new_0004',notional:'200'}),/DUPLICATE_ACTIVE_ORDER/);
  db.close();
 }finally{rmSync(dir,{recursive:true,force:true});}
});

test('official-style Binance TR numeric order-detail response reconciles safely',()=>{
 const db=new LiveOrderJournal(':memory:');
 db.reserve({...order,notional:'200'});
 const remote={orderId:4,clientId:order.clientId,symbol:order.symbol,side:0,type:1,
   price:100000,status:1,origQty:0.002,executedQty:0.001,executedQuoteQty:100};
 const result=db.observe(order.clientId,remote);
 assert.equal(result.status,'PARTIALLY_FILLED');
 assert.equal(result.executedQty,'0.001');
 assert.equal(result.executedQuoteQty,'100');
 db.close();
});
test('invalid or regressing exchange execution data cannot release risk hold',()=>{
 const db=new LiveOrderJournal(':memory:');
 db.reserve({...order,notional:'200'});
 const valid={orderId:4,clientId:order.clientId,symbol:order.symbol,side:0,type:1,price:100000,status:1,
   origQty:0.002,executedQty:0.001,executedQuoteQty:100};
 db.observe(order.clientId,valid);
 for(const invalid of [
   {...valid,executedQty:0.0001},
   {...valid,executedQuoteQty:99},
   {...valid,origQty:0.1},
   {...valid,status:99},
   {...valid,orderId:5},
   {...valid,orderId:9007199254740992},
   {...valid,side:1},
   {...valid,type:2},
   {...valid,price:99999},
   {...valid,executedQty:0.002},
   {...valid,symbol:'ETH_TRY'},
   {...valid,executedQty:0.003}
 ])assert.throws(()=>db.observe(order.clientId,invalid));
 assert.equal(db.get(order.clientId).executedQty,'0.001');
 assert.equal(db.db.prepare('SELECT count(*) AS n FROM live_active_intents').get().n,1);
 db.close();
});
test('network timeout after a prepared order leaves the order unresolved and cannot retry',async()=>{
 const db=new LiveOrderJournal(':memory:');
 let writeCalls=0;
 const service=new LiveOrderService({
  journal:db,gate:()=>true,risk:mockRisk(db),openOrderSymbols:[order.symbol],loadInputs:async()=>inputs,
  client:{openOrders:async()=>[],placeLimit:async()=>{writeCalls++;throw Error('ETIMEDOUT')},
    detail:async()=>{throw Error('ECONNRESET')}}
 });
 const result=await service.submit(order);
 assert.equal(result.status,'UNKNOWN');
 assert.equal(writeCalls,1);
 await assert.rejects(service.submit({...order,clientId:'para_retry_0001'}),/UNRESOLVED_ORDERS/);
 assert.equal(writeCalls,1);
 db.close();
});

test('acknowledged identity and unknown cancellation survive restart without a repeat write', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'para-cancel-'));
  const path = join(dir, 'orders.sqlite');
  let journal = new LiveOrderJournal(path);
  let writes = 0;
  let exchangeStatus = 1;
  const client = {
    openOrders: async () => [],
    placeLimit: async () => ({ orderId: '42' }),
    detail: async (clientId, orderId) => {
      assert.equal(clientId, order.clientId);
      assert.equal(orderId, '42');
      return remote(exchangeStatus, '0.001');
    },
    cancel: async (clientId, orderId) => {
      writes++;
      assert.equal(clientId, order.clientId);
      assert.equal(orderId, '42');
      throw Error('ETIMEDOUT');
    },
  };
  const service = () => new LiveOrderService({
    journal, client, gate: () => true, risk: mockRisk(journal), openOrderSymbols: [order.symbol], loadInputs: async () => inputs,
  });
  try {
    const first = service();
    assert.equal((await first.submit(order)).status, 'PARTIALLY_FILLED');
    assert.equal((await first.cancel(order.clientId)).status, 'CANCEL_UNKNOWN');
    assert.equal(writes, 1);
    journal.close();
    journal = new LiveOrderJournal(path);

    const resumed = service();
    assert.equal((await resumed.cancel(order.clientId)).status, 'CANCEL_UNKNOWN');
    assert.equal(writes, 1);
    exchangeStatus = 3;
    const [canceled] = await resumed.reconcilePending();
    assert.equal(canceled.status, 'CANCELED');
    assert.equal(canceled.executedQty, '0.001');
    assert.deepEqual(await resumed.reconcilePending(), []);
    assert.equal(writes, 1);
  } finally {
    journal.close();
    rmSync(dir, { recursive: true, force: true });
  }
});
