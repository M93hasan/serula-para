import {test} from 'node:test';
import assert from 'node:assert/strict';
import {checkPaperFilters} from '../engine/paper-filters.js';
const market={symbol:'SOL_TRY',baseAsset:'SOL',quoteAsset:'TRY',type:1,filtersPresent:true,filters:{tickSize:'0.01',stepSize:'0.001',minQty:'0.001',minNotional:'10'}};
test('exact decimal tick, step, quantity and notional checks fail closed',()=>{
 const check=(price,quantity,m=market)=>checkPaperFilters({market:m,price,quantity});assert.equal(check('100.01','0.1').accepted,true);assert.equal(check('100.011','0.1').reason,'EXCHANGE_FILTER_REJECTED');assert.equal(check('100.01','0.1001').accepted,false);assert.equal(check('100','0.01').accepted,false);assert.equal(check('100','0.1',{...market,filtersPresent:false}).accepted,false);assert.equal(check('1e2','1').accepted,false);assert.equal(check('100','1',{...market,type:3}).accepted,false);
});
