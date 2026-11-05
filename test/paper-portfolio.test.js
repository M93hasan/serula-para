import {test} from 'node:test';
import assert from 'node:assert/strict';
import {PaperPortfolio} from '../engine/paper-portfolio.js';
const now=1700000000000;
const config={feeBps:10,slippageBps:10,quotes:['TRY','USDT'].map(asset=>({asset,budget:10000,maxTrade:3000,maxExposure:5000,maxAsset:3000,maxLoss:500}))};
const order=(id,action,symbol,price=1000)=>{const [baseAsset,quoteAsset]=symbol.split('_');return {id,action,symbol,baseAsset,quoteAsset,quantity:100000000,price,priceTime:now};};
test('separate paper quotes, costs, idempotency and related asset exposure',()=>{
 const p=new PaperPortfolio(config);assert.throws(()=>p.execute(order('a','AL','BTC_TRY'),now),/HALTED/);p.start();const buy=p.execute(order('a','AL','BTC_TRY'),now);assert.deepEqual(p.execute(order('a','AL','BTC_TRY'),now),buy);assert.throws(()=>p.execute(order('a','AL','ETH_TRY'),now),/ID_CONFLICT/);assert.throws(()=>p.execute(order('b','AL','BTC_USDT'),now),/RELATED_ASSET/);p.execute(order('c','AL','ETH_USDT'),now);const status=p.status();assert.equal(status.positions.length,2);assert.equal(status.quotes.find(q=>q.asset==='TRY').cash,8997);assert.equal(status.quotes.find(q=>q.asset==='USDT').cash,8997);assert.equal(status.realOrdersEnabled,false);
});
test('stale prices, risk, loss limit and full-close requirements fail safely',()=>{
 const p=new PaperPortfolio(config);p.start();assert.throws(()=>p.execute({...order('a','AL','BTC_TRY'),priceTime:now-30001},now),/INVALID_INPUT/);assert.throws(()=>p.execute(order('b','AL','BTC_TRY',4000),now),/RISK_LIMIT/);p.execute(order('c','AL','BTC_TRY'),now);assert.throws(()=>p.execute({...order('d','SAT','BTC_TRY'),quantity:50000000},now),/POSITION_REQUIRED/);const sell=p.execute(order('e','SAT','BTC_TRY',400),now);assert.ok(sell.realized< -500);assert.equal(p.status().halted,true);assert.throws(()=>p.start(),/LOSS_LIMIT/);
});
