import {test} from 'node:test';
import assert from 'node:assert/strict';
import {scannerPaperMarks} from '../engine/paper-marks.js';
import {PaperStore} from '../engine/paper-store.js';
import {RiskStore} from '../engine/store.js';
import {createServer} from '../engine/server.js';
const config={feeBps:10,slippageBps:10,quotes:[{asset:'TRY',budget:10000,maxTrade:3000,maxExposure:5000,maxAsset:3000,maxLoss:500}]};
test('marks only use fresh catalog-approved scanner data in supported quote units',async()=>{
 const now=Date.now(),paper={status:()=>({positions:[{symbol:'SOL_TRY',baseAsset:'SOL',quoteAsset:'TRY'}]})},scanner={status:()=>({results:[{symbol:'SOL_TRY',status:'candidate',asOf:now,priceTime:now,price:10.25}]})},universe={discover:async()=>({exchangeTime:now,markets:[{symbol:'SOL_TRY',baseAsset:'SOL',quoteAsset:'TRY',type:1}]})};
 assert.deepEqual(await scannerPaperMarks({paper,scanner,universe,now}),[{symbol:'SOL_TRY',price:1025,priceTime:now}]);assert.deepEqual(await scannerPaperMarks({paper,scanner,universe,now:now+30001}),[]);assert.deepEqual(await scannerPaperMarks({paper,scanner,universe:{discover:async()=>({exchangeTime:now,markets:[]})},now}),[]);
});
test('local monitor stops an open paper portfolio when scanner data is unavailable',async()=>{
 const now=Date.now(),paper=new PaperStore(':memory:',config),simulator=new RiskStore(':memory:',{budget:1000,maxTrade:100,maxLoss:100});paper.start();paper.execute({id:'x',action:'AL',symbol:'SOL_TRY',baseAsset:'SOL',quoteAsset:'TRY',quantity:100000000,price:1000,priceTime:now},now);
 const server=createServer({token:'x'.repeat(40),simulator,paper,scanner:{status:()=>({results:[]})},universe:{discover:async()=>{throw Error('offline');}},riskIntervalMs:25});await new Promise(r=>server.listen(0,'127.0.0.1',r));try{await new Promise(r=>setTimeout(r,100));assert.equal(paper.status().halted,true);}finally{await new Promise(r=>server.close(r));paper.close();simulator.close();}
});
