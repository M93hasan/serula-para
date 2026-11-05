import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createServer} from '../engine/server.js';
import {RiskStore} from '../engine/store.js';
import {PaperStore} from '../engine/paper-store.js';
test('paper API requires local token and same-origin writes; no order endpoint',async()=>{
 const token='x'.repeat(40),simulator=new RiskStore(':memory:',{budget:1000,maxTrade:100,maxLoss:100}),paper=new PaperStore(':memory:',{feeBps:10,slippageBps:10,quotes:[{asset:'TRY',budget:1000,maxTrade:100,maxExposure:500,maxAsset:100,maxLoss:100}]});const server=createServer({token,simulator,paper});await new Promise(r=>server.listen(0,'127.0.0.1',r));
 try{const origin=`http://127.0.0.1:${server.address().port}`,auth={Authorization:`Bearer ${token}`},headers={...auth,Origin:origin,'Sec-Fetch-Site':'same-origin','Content-Type':'application/json','X-Para-Request':'1'};
 assert.equal((await fetch(origin+'/api/paper/status')).status,403);assert.equal((await fetch(origin+'/api/paper/start',{method:'POST',headers:{...headers,Origin:'http://evil.example'},body:'{}'})).status,403);
 assert.equal((await fetch(origin+'/api/paper/start',{method:'POST',headers,body:'{}'})).status,200);let status=await (await fetch(origin+'/api/paper/status',{headers:auth})).json();assert.equal(status.status.halted,false);assert.match(status.notice,/henüz yok/);assert.equal(status.performance.mode,'paper');assert.equal(status.performance.quotes[0].day.realizedNet,0);assert.equal(status.performance.quotes[0].dailyEquityChange,null);
 assert.equal((await fetch(origin+'/api/paper/execute',{method:'POST',headers,body:'{}'})).status,404);assert.equal((await fetch(origin+'/api/paper/stop',{method:'POST',headers,body:'{}'})).status,200);status=await (await fetch(origin+'/api/paper/status',{headers:auth})).json();assert.equal(status.status.halted,true);
 }finally{await new Promise(r=>server.close(r));paper.close();simulator.close();}
});
