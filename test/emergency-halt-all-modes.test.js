import test from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from '../engine/server.js';
import { RiskStore } from '../engine/store.js';

test('global emergency stop disables automatic scanning and halts paper and simulation modes',async()=>{
 const store=new RiskStore(':memory:',{budget:1000,maxTrade:100,maxLoss:100});
 const token='t'.repeat(40),calls=[];
 const scanner={status:()=>({status:'idle',results:[]}),start:()=>calls.push('scan-start'),stop:()=>calls.push('scan-stop')};
 const paper={halt:()=>calls.push('paper-halt'),status:()=>({halted:true,positions:[]})};
 const server=createServer({token,simulator:store,paper,scanner,universe:{discover:async()=>({markets:[]})}});
 await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
 try{
   const origin='http://127.0.0.1:'+server.address().port;
   const headers={Authorization:'Bearer '+token,Origin:origin,'Sec-Fetch-Site':'same-origin','Content-Type':'application/json','X-Para-Request':'1'};
   const response=await fetch(origin+'/halt',{method:'POST',headers,body:'{}'});
   assert.equal(response.status,200);
   const state=await response.json();
   assert.equal(state.halted,true);
   assert.equal(state.realOrdersEnabled,false);
   assert.equal(state.autonomous.enabled,false);
   assert.equal(state.scan.enabled,false);
   assert.ok(calls.includes('scan-stop'));
   assert.ok(calls.includes('paper-halt'));
 }finally{await new Promise(resolve=>server.close(resolve));store.close();}
});
