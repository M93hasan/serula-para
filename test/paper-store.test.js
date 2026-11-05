import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,rmSync,readFileSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {PaperStore} from '../engine/paper-store.js';
const now=1700000000000,config={feeBps:10,slippageBps:10,quotes:[{asset:'TRY',budget:10000,maxTrade:3000,maxExposure:5000,maxAsset:3000,maxLoss:500}]};
const order={id:'one',action:'AL',symbol:'BTC_TRY',baseAsset:'BTC',quoteAsset:'TRY',quantity:100000000,price:1000,priceTime:now};
test('paper records and idempotency survive restart; restart always stops',()=>{
 const dir=mkdtempSync(join(tmpdir(),'paper-')),file=join(dir,'paper.sqlite');let store;try{store=new PaperStore(file,config);assert.equal(store.status().halted,true);store.start();store.execute({...order,apiKey:'DO_NOT_SAVE_SECRET'},now);store.close();store=new PaperStore(file,config);assert.equal(store.status().halted,true);assert.equal(store.status().positions.length,1);assert.equal(store.status().quotes[0].cash,8997);store.execute(order,now);assert.equal(store.status().quotes[0].cash,8997);assert.ok(!readFileSync(file).includes('DO_NOT_SAVE_SECRET'));}finally{store?.close();rmSync(dir,{recursive:true,force:true});}
});
test('valuation separates cash, hypothetical cost and missing prices',()=>{
 const p=new PaperStore(':memory:',config);try{p.start();p.execute(order,now);let v=p.value([{symbol:'BTC_TRY',price:1100,priceTime:now}],now);assert.equal(v.quotes[0].cash,8997);assert.ok(v.quotes[0].unrealized>0);assert.equal(v.combinedTotal,null);v=p.value([{symbol:'BTC_TRY',price:1100,priceTime:now-30001}],now);assert.equal(v.quotes[0].equity,null);assert.equal(v.quotes[0].lossLimitBreached,null);}finally{p.close();}
});
test('concurrent connections serialize changes and halt on opening another instance',()=>{
 const dir=mkdtempSync(join(tmpdir(),'paper-')),file=join(dir,'paper.sqlite');let a,b;try{a=new PaperStore(file,config);a.start();b=new PaperStore(file,config);assert.equal(a.status().halted,true);a.start();a.execute(order,now);assert.throws(()=>b.execute({...order,id:'two'},now),/RELATED_ASSET/);assert.equal(b.status().positions.length,1);}finally{a?.close();b?.close();rmSync(dir,{recursive:true,force:true});}
});
