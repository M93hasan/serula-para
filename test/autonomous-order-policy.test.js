import test from 'node:test';
import assert from 'node:assert/strict';
import { assessAutonomousOrder } from '../engine/autonomous-order-policy.js';

const baseline = () => ({
  policy: { enabled:true, liveOrdersEnabled:true, allowSymbols:['BTC_TRY'], maxOrderTry:'100', maxDailyLossTry:'30', maxExposureTry:'200', maxOrdersPerDay:3 },
  order: { symbol:'BTC_TRY', side:'BUY', clientOrderId:'order_unique_001', notionalTry:'50' },
  state: { halted:false, connectionHealthy:true, marketFresh:true, balancesFresh:true,
    updatedAt:100000, usedOrderIds:[], pendingOrder:false, ordersToday:0,
    observedDailyLossTry:'0', totalExposureTry:'0', exchangeFiltersVerified:true,
    availableBalanceVerified:true },
  now:100001,
});
test('valid preflight never places orders', () => assert.deepEqual(assessAutonomousOrder(baseline()), { allowed:true, reason:'PREFLIGHT_PASSED_NOT_EXECUTED' }));
for (const [label, change, reason] of [
  ['live kill switch', x=>x.policy.liveOrdersEnabled=false, 'LIVE_DISABLED'],
  ['halt', x=>x.state.halted=true, 'HALTED'],
  ['stale market', x=>x.state.marketFresh=false, 'STALE_STATE'],
  ['expired observation', x=>x.now=120001, 'STALE_STATE'],
  ['unlisted symbol', x=>x.order.symbol='ETH_TRY', 'SYMBOL_NOT_ALLOWED'],
  ['duplicate id', x=>x.state.usedOrderIds=['order_unique_001'], 'DUPLICATE_OR_UNKNOWN_IDS'],
  ['pending order', x=>x.state.pendingOrder=true, 'ORDER_IN_PROGRESS'],
  ['daily orders', x=>x.state.ordersToday=3, 'DAILY_ORDER_LIMIT'],
  ['order amount', x=>x.order.notionalTry='101', 'ORDER_LIMIT'],
  ['daily loss', x=>x.state.observedDailyLossTry='30', 'LOSS_LIMIT'],
  ['exposure', x=>x.state.totalExposureTry='160', 'EXPOSURE_LIMIT'],
  ['missing filter verification', x=>x.state.exchangeFiltersVerified=false, 'EXCHANGE_CHECK_REQUIRED'],
  ['missing balance verification', x=>x.state.availableBalanceVerified=false, 'EXCHANGE_CHECK_REQUIRED'],
  ['scientific amount', x=>x.order.notionalTry='1e9', 'INVALID_AMOUNT'],
  ['negative loss', x=>x.state.observedDailyLossTry='-1', 'INVALID_AMOUNT'],
]) test(label,()=>{const x=baseline();change(x);assert.equal(assessAutonomousOrder(x).reason,reason);});
