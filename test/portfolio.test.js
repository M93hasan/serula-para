import {test} from 'node:test';
import assert from 'node:assert/strict';
import {valuePortfolio} from '../src/portfolio.js';
const now=1700000000000, prices=[{symbol:'BTC_TRY',price:4000000,priceTime:now},{symbol:'ETH_TRY',price:120000,priceTime:now}];
test('subtotal and missing assets are separate; missing prevents total BTC',()=>{const r=valuePortfolio([{asset:'TRY',free:'100',locked:'0'},{asset:'BTC',free:'0.001',locked:'0'},{asset:'DOGE',free:'5',locked:'0'},{asset:'EMPTY',free:'0',locked:'0'}],prices,now);assert.deepEqual(r,{subtotal:4100,missing:['DOGE'],pricedCount:2,complete:false,btc:null});});
test('fresh prices value full balance and stale prices are missing',()=>{const balances=[{asset:'BTC',free:'0.001',locked:'0'},{asset:'TRY',free:'100',locked:'0'}];assert.equal(valuePortfolio(balances,prices,now).btc,4100/4000000);const stale=valuePortfolio(balances,prices,now+300001);assert.deepEqual(stale.missing,['BTC']);assert.equal(stale.subtotal,100);assert.equal(stale.complete,false);});
test('rejects corrupt balances and handles empty portfolio',()=>{assert.throws(()=>valuePortfolio([{asset:'BTC',free:'NaN',locked:'0'}],prices,now));assert.equal(valuePortfolio([],[],now).subtotal,0);});
