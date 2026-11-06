import test from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from '../engine/server.js';

const token='a'.repeat(64);
const order={symbol:'BTC_TRY',side:'BUY',quantity:'0.001',price:'100000'};
const passphrase='test-passphrase-16chars';
function fixture({stale=false,staleScan=false,wideSpread=false,shallow=false,halted=false,insufficient=false,accountConnected=true}={}){
  const now=Date.now();
  const market={symbol:'BTC_TRY',type:1,quoteAsset:'TRY',baseAsset:'BTC',filtersPresent:true,
    filters:{tickSize:'0.01',stepSize:'0.000001',minQty:'0.000001',minNotional:'10'}};
  return {
    googleAuth:{user:()=>null,handle:()=>null,close:()=>{}},
    simulator:{status:()=>({halted})},
    account:{exists:()=>accountConnected,balance:async(secret)=>{
      if(secret!==passphrase)throw Error('VAULT_UNLOCK_FAILED');
      return [{asset:'TRY',free:insufficient?'10':'500',locked:'0'},{asset:'BTC',free:'0.01',locked:'0'}];
    }},
    universe:{discover:async()=>({exchangeTime:now,markets:[market]})},
    scanner:{status:()=>({status:'complete',results:[{symbol:'BTC_TRY',status:'candidate',
      price:100000,priceTime:stale?now-31000:now,
      asOf:staleScan?now-31000:now,
      indicators:{spread:wideSpread?0.02:0.001,depthQuote:shallow?10:1000,bid:99999,ask:100001}}]}),stop:()=>{}}
  };
}
async function localServer(fn,config={}){
  const server=createServer({token,...fixture(config)});
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
test('preflight checks passphrase, available balance and market before granting preview',async()=>{
  await localServer(async({post})=>{
    const preview=await post('/api/manual-order/preview',{...order,passphrase});
    assert.equal(preview.status,200);
    assert.equal(preview.body.estimatedNotionalTry,100);
    assert.equal(preview.body.preflight.executionEnabled,false);
    assert.equal(preview.body.preflight.feeReserveVerified,false);
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
test('requires authorization, origin and correct payload',async()=>{
  await localServer(async({post,base})=>{
    const body={...order,passphrase};
    const denied=await fetch(base+'/api/manual-order/preview',{method:'POST',headers:{
      origin:base,'sec-fetch-site':'same-origin','content-type':'application/json','x-para-request':'1'
    },body:JSON.stringify(body)});
    assert.equal(denied.status,403);
    assert.equal((await post('/api/manual-order/preview',body,{origin:'http://evil.example'})).status,403);
    assert.equal((await post('/api/manual-order/preview',body,{'x-para-request':'0'})).status,403);
    assert.equal((await post('/api/manual-order/preview',{...order,quantity:'1',passphrase})).status,400);
    const p=await post('/api/manual-order/preview',body);
    assert.equal(p.status,200);
    assert.equal((await post('/api/manual-order/reject',{})).status,200);
    assert.equal((await post('/api/manual-order/approve',{
      id:p.body.id,digest:p.body.digest,confirmation:'ONAYLA '+p.body.id})).status,409);
  });
});
for(const [label,config,reason] of [
  ['stale ticker',{stale:true},'PREFLIGHT_STALE_MARKET'],
  ['halt active',{halted:true},'PREFLIGHT_HALT_OR_EXECUTION_LOCK'],
  ['stale scan',{staleScan:true},'MARKET_NOT_READY'],
  ['wide spread',{wideSpread:true},'PREFLIGHT_SPREAD_OR_LIQUIDITY'],
  ['shallow order book',{shallow:true},'PREFLIGHT_INSUFFICIENT_DEPTH'],
  ['insufficient account balance',{insufficient:true},'PREFLIGHT_INSUFFICIENT_BALANCE'],
  ['account disconnected',{accountConnected:false},'ACCOUNT_NOT_CONFIGURED']
]){
  test('preview fails closed: '+label,async()=>{
    await localServer(async({post})=>{
      const res=await post('/api/manual-order/preview',{...order,passphrase});
      assert.notEqual(res.status,200);
      assert.equal(res.body.error,reason);
    },config);
  });
}
test('incorrect vault passphrase never creates a preview',async()=>{
  await localServer(async({post})=>{
    const response=await post('/api/manual-order/preview',{...order,passphrase:'wrong-passphrase-16'});
    assert.equal(response.status,400);
    assert.equal(response.body.error,'VAULT_UNLOCK_FAILED');
  });
});
