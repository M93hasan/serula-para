import test from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from '../engine/server.js';

const token='a'.repeat(64);
const order={symbol:'BTC_TRY',side:'BUY',quantity:'0.001',price:'100000'};

async function localServer(fn){
  const googleAuth={user:()=>null,handle:()=>null,close:()=>{}};
  const server=createServer({token,simulator:{status:()=>({halted:false})},googleAuth});
  await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
  const base='http://127.0.0.1:'+server.address().port;
  const post=async(path,body,headers={})=>{
    const res=await fetch(base+path,{method:'POST',headers:{
      authorization:'Bearer '+token,origin:base,'sec-fetch-site':'same-origin',
      'content-type':'application/json','x-para-request':'1',...headers},body:JSON.stringify(body)});
    return {status:res.status,body:await res.json().catch(()=>({}))};
  };
  try{await fn({post,base});}finally{await new Promise(resolve=>server.close(resolve));}
}
test('authenticated manual preview approval and replay protection have no exchange execution',async()=>{
  await localServer(async({post})=>{
    const preview=await post('/api/manual-order/preview',order);
    assert.equal(preview.status,200);
    assert.equal(preview.body.estimatedNotionalTry,100);
    const confirm=await post('/api/manual-order/approve',{
      id:preview.body.id,digest:preview.body.digest,confirmation:'ONAYLA '+preview.body.id
    });
    assert.equal(confirm.status,200);
    assert.equal(confirm.body.status,'APPROVED_NOT_SENT');
    assert.equal(confirm.body.executionEnabled,false);
    const replay=await post('/api/manual-order/approve',{
      id:preview.body.id,digest:preview.body.digest,confirmation:'ONAYLA '+preview.body.id
    });
    assert.equal(replay.status,409);
  });
});
test('manual preview requires bearer auth, origin, JSON and rejects excessive order',async()=>{
  await localServer(async({post,base})=>{
    const denied=await fetch(base+'/api/manual-order/preview',{method:'POST',headers:{origin:base,'sec-fetch-site':'same-origin','content-type':'application/json','x-para-request':'1'},body:JSON.stringify(order)});
    assert.equal(denied.status,403);
    assert.equal((await post('/api/manual-order/preview',order,{origin:'http://evil.example'})).status,403);
    assert.equal((await post('/api/manual-order/preview',order,{'x-para-request':'0'})).status,403);
    assert.equal((await post('/api/manual-order/preview',{...order,quantity:'1'})).status,400);
    const p=await post('/api/manual-order/preview',order);
    assert.equal((await post('/api/manual-order/reject',{})).status,200);
    assert.equal((await post('/api/manual-order/approve',{id:p.body.id,digest:p.body.digest,confirmation:'ONAYLA '+p.body.id})).status,409);
  });
});
