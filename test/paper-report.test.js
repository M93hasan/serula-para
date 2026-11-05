import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {PaperStore} from '../engine/paper-store.js';
const config={feeBps:10,slippageBps:10,quotes:[{asset:'TRY',budget:10000,maxTrade:3000,maxExposure:5000,maxAsset:3000,maxLoss:2000}]};
const now=Date.UTC(2026,10,5,12),order=(id,action,price,time)=>({id,action,symbol:'SOL_TRY',baseAsset:'SOL',quoteAsset:'TRY',quantity:100000000,price,priceTime:time});
test('paper AL and SAT report survives restart without counting an idempotent retry twice',()=>{
 const dir=mkdtempSync(join(tmpdir(),'paper-report-')),path=join(dir,'paper.sqlite');let store;
 try{store=new PaperStore(path,config);store.start();let t=now-10000,buy=order('buy','AL',1000,t);store.execute(buy,t);store.execute(buy,t);t=now-5000;store.execute(order('sell','SAT',1200,t),t);
  store.close();store=new PaperStore(path,config);const r=store.report([],now),q=r.quotes[0];assert.equal(store.status().halted,true);assert.equal(q.day.buys,1);assert.equal(q.day.sells,1);assert.equal(q.day.wins,1);assert.equal(q.day.realizedNet,193);assert.equal(q.day.fees,4);assert.equal(q.day.slippage,3);assert.equal(q.total.realizedNet,193);assert.equal(q.dailyEquityChange,null);assert.equal(r.combinedTotal,null);
 }finally{store?.close();rmSync(dir,{recursive:true,force:true});}
});
test('open position and stale marks keep unrealized values unknown',()=>{
 const store=new PaperStore(':memory:',config);try{store.start();store.execute(order('buy','AL',1000,now-1000),now-1000);let q=store.report([{symbol:'SOL_TRY',price:1200,priceTime:now-1000}],now).quotes[0];assert.equal(q.openPositions,1);assert.equal(q.currentUnrealized,193);assert.equal(q.dailyUnrealizedChange,null);q=store.report([{symbol:'SOL_TRY',price:1200,priceTime:now-30001}],now).quotes[0];assert.equal(q.currentUnrealized,null);assert.equal(q.currentEquity,null);}finally{store.close();}
});
