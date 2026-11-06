import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {LiveOrderJournal} from '../engine/live-order-journal.js';
import {LiveRiskEngine,DEFAULT_LIVE_RISK_LIMITS} from '../engine/live-risk-engine.js';

const now=1800000000000;
const midnight=Date.parse(new Date(now).toISOString().slice(0,10)+'T00:00:00Z');
const order=(id='para_risk_0001',notional='100')=>({clientId:id,symbol:'BTC_TRY',side:'BUY',quantity:'0.001',price:'100000',notional});
const context=()=>({source:'verified-exchange-risk-monitor',connectionHealthy:true,asOf:now,
 dayStartAt:midnight,dayTradeCount:0,dayFeesTry:'0',dayRealizedPnlTry:'0',dayNetPnlTry:'0',totalExposureTry:'0',
 positions:[],feeBps:10,spreadBps:12,slippageBps:10,volatilityBps:90});
const make=(db,changes={})=>new LiveRiskEngine({journal:db,clock:()=>now,
 approval:()=>true,healthProvider:async()=>context(),...changes});

test('HALT is default, and absent independent approval/watchdog cannot arm',()=>{
 const db=new LiveOrderJournal(':memory:');
 const risk=new LiveRiskEngine({journal:db,clock:()=>now});
 assert.equal(risk.status().halted,true);
 assert.throws(()=>risk.arm(context()),/LIVE_RISK_LOCKED/);
 assert.throws(()=>risk.reserve(order(),context()),/HALTED/);
 risk.close();db.close();
});

test('reject over-limit orders, position exposure, and daily trade counts',()=>{
 const db=new LiveOrderJournal(':memory:'),risk=make(db);
 risk.arm(context());
 assert.throws(()=>risk.reserve({...order(),symbol:'BTC_USDT'},context()),/TRY_QUOTE_REQUIRED/);
 assert.throws(()=>risk.reserve(order('para_risk_0002','251'),context()),/ORDER_LIMIT/);
 assert.throws(()=>risk.reserve(order('para_risk_0002','201'),context()),/ORDER_LIMIT|POSITION_LIMIT/);
 assert.equal(db.db.prepare('SELECT COUNT(*) AS n FROM live_orders').get().n,0);
 const c=context();
 c.positions=[{asset:'BTC',exposureTry:'180',costBasisTry:'180',priceTime:now-1000}];c.totalExposureTry='180';
 assert.throws(()=>risk.reserve(order('para_risk_0002','50'),c),/POSITION_LIMIT/);
 c.positions=[];c.totalExposureTry='0';c.dayTradeCount=5;
 assert.throws(()=>risk.reserve(order('para_risk_0002','100'),c),/DAILY_TRADE_COUNT/);
 risk.close();db.close();
});

test('successful reservation is persisted atomically and blocks unresolved orders',()=>{
 const db=new LiveOrderJournal(':memory:'),risk=make(db);risk.arm(context());
 risk.reserve(order(),context());
 assert.equal(db.get('para_risk_0001').status,'RESERVED');
 assert.throws(()=>risk.reserve(order('para_risk_0002'),context()),/UNRESOLVED_ORDERS/);
 assert.equal(db.db.prepare('SELECT count(*) AS n FROM live_orders').get().n,1);
 risk.close();db.close();
});

test('daily loss, spread and fee anomalies, stop-loss and missing heartbeat HALT',()=>{
 for(const [change,expected] of [
  [{dayRealizedPnlTry:'-75'},'DAILY_LOSS_LIMIT'],
  [{dayNetPnlTry:'-75'},'DAILY_LOSS_LIMIT'],
  [{spreadBps:61},'RISK_DATA_UNAVAILABLE'],
  [{feeBps:31},'RISK_DATA_UNAVAILABLE'],
  [{connectionHealthy:false},'RISK_DATA_UNAVAILABLE'],
  [{asOf:now-10001},'RISK_DATA_UNAVAILABLE'],
  [{positions:[{asset:'BNB',exposureTry:'90',costBasisTry:'100',priceTime:now-1000}],totalExposureTry:'90'},'STOP_LOSS_TRIGGERED'],
  [{positions:[{asset:'BNB',exposureTry:'201',costBasisTry:'201',priceTime:now-1000}],totalExposureTry:'201'},'ASSET_EXPOSURE_LIMIT']
 ]){
  const db=new LiveOrderJournal(':memory:'),risk=make(db);risk.arm(context());
  const bad={...context(),...change};
  assert.equal(risk.monitor(bad).halted,true);
  assert.equal(risk.status().reason,expected);
  assert.throws(()=>risk.reserve(order(),context()),/HALTED/);
  if(expected==='STOP_LOSS_TRIGGERED')
   assert.deepEqual(risk.exitPlan(bad),[{asset:'BNB',action:'CLOSE_REQUIRED',reason:'STOP_LOSS_TRIGGERED',executionAuthorized:false}]);
  risk.close();db.close();
 }
});

test('HALT persists and startup restarts locked',()=>{
 const dir=mkdtempSync(join(tmpdir(),'para-risk-'));
 try{
  const path=join(dir,'journal.sqlite');
  let db=new LiveOrderJournal(path),risk=make(db);
  risk.arm(context());risk.halt('CONNECTION_FAILURE');
  assert.equal(risk.status().halted,true);
  risk.close();db.close();
  db=new LiveOrderJournal(path);risk=make(db);
  assert.equal(risk.status().halted,true);
  assert.equal(risk.status().reason,'CONNECTION_FAILURE');
  risk.close();db.close();
 }finally{rmSync(dir,{recursive:true,force:true});}
});

test('periodic monitor automatically halts when exchange connectivity fails',async()=>{
 const db=new LiveOrderJournal(':memory:');
 let healthy=true;
 const risk=make(db,{watchdogIntervalMs:1000,healthProvider:async()=>({...context(),connectionHealthy:healthy})});
 risk.arm(context());
 healthy=false;
 await new Promise(resolve=>setTimeout(resolve,1200));
 assert.equal(risk.status().halted,true);
 assert.equal(risk.status().reason,'RISK_DATA_UNAVAILABLE');
 risk.close();db.close();
});

test('preliminary limits are conservative and never authorize execution',()=>{
 assert.equal(DEFAULT_LIVE_RISK_LIMITS.maxOrderTry,'250');
 assert.equal(DEFAULT_LIVE_RISK_LIMITS.maxDailyLossTry,'75');
 assert.equal(DEFAULT_LIVE_RISK_LIMITS.maxDailyOrders,5);
});

test('hung health probe triggers automatic HALT without an infinite wait',async()=>{
 const db=new LiveOrderJournal(':memory:');
 const risk=make(db,{watchdogIntervalMs:1000,healthProvider:async()=>new Promise(()=>{})});
 risk.arm(context());
 await new Promise(resolve=>setTimeout(resolve,1900));
 assert.equal(risk.status().halted,true);
 assert.equal(risk.status().reason,'CONNECTION_FAILURE');
 risk.close();db.close();
});
