import test from 'node:test';
import assert from 'node:assert/strict';
import {checkLiveOrderPreflight as check} from '../engine/live-order-preflight.js';
const now=1000000;
const order={symbol:'BTC_TRY',side:'BUY',price:'100000',quantity:'0.001'};
const market={symbol:'BTC_TRY',type:1,baseAsset:'BTC',quoteAsset:'TRY',filtersPresent:true,
  exchangeTime:now,priceTime:now,price:'100000',filters:{tickSize:'0.01',stepSize:'0.000001',minQty:'0.000001',minNotional:'10'}};
const balances=[{asset:'TRY',free:'500'},{asset:'BTC',free:'0.01'}];
const limits={halted:false,realOrdersEnabled:false,maxOrderTry:'500',maxPriceDeviationBps:100};
const run=(patch={})=>check({order,market,balances,limits,now,...patch});
test('fresh filtered funded preview is never live executable',()=>{const r=run();assert.equal(r.eligible,true);assert.equal(r.executionEnabled,false);assert.equal(r.feeReserveVerified,false);});
test('reject missing or stale market evidence',()=>{assert.equal(run({market:{...market,priceTime:now-30001}}).reason,'STALE_MARKET');assert.equal(run({market:{...market,filtersPresent:false}}).eligible,false);});
test('reject precision and minimum order filters',()=>{assert.equal(run({order:{...order,price:'100000.001'}}).reason,'PRICE_OR_LOT_FILTER');assert.equal(run({order:{...order,quantity:'0.00000001'}}).eligible,false);});
test('reject insufficient BUY and SELL funds',()=>{assert.equal(run({balances:[{asset:'TRY',free:'99.99'}]}).reason,'INSUFFICIENT_BALANCE');assert.equal(run({order:{...order,side:'SELL'},balances:[{asset:'BTC',free:'0.0009'}]}).reason,'INSUFFICIENT_BALANCE');});
test('reject max order and price deviation',()=>{assert.equal(run({limits:{...limits,maxOrderTry:'99'}}).reason,'MAX_ORDER');assert.equal(run({order:{...order,price:'105000'}}).reason,'PRICE_DEVIATION');});
test('reject HALT and any attempted unlock',()=>{assert.equal(run({limits:{...limits,halted:true}}).reason,'HALT_OR_EXECUTION_LOCK');assert.equal(run({limits:{...limits,realOrdersEnabled:true}}).reason,'HALT_OR_EXECUTION_LOCK');});
test('reject missing or duplicated balance assets',()=>{assert.equal(run({balances:[]}).reason,'BALANCE_UNAVAILABLE');assert.equal(run({balances:[...balances,{asset:'TRY',free:'100'}]}).reason,'BALANCE_UNAVAILABLE');});
test('reject malformed decimals or unverified symbols',()=>{assert.equal(run({order:{...order,quantity:'1e-3'}}).eligible,false);assert.equal(run({order:{...order,symbol:'BTC_USDT'}}).reason,'UNVERIFIED_MARKET');});
