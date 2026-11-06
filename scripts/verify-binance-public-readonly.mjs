// Public GET-only API probe. No credentials or write requests.
import assert from 'node:assert/strict';
const base='https://www.binance.tr';
const get=async path=>{
 const controller=new AbortController();const t=setTimeout(()=>controller.abort(),10000);
 try{
  const response=await fetch(base+path,{method:'GET',redirect:'error',cache:'no-store',signal:controller.signal});
  console.log(path+' HTTP '+response.status);
  assert.equal(response.status,200,'public API inaccessible');
  const data=await response.json();
  assert.equal(data.code,0,'public API returned non-success code');
  return data;
 }finally{clearTimeout(t)}
};
try{
 const time=await get('/open/v1/common/time');
 assert.ok(Number.isSafeInteger(time.timestamp)&&Math.abs(Date.now()-time.timestamp)<120000,'exchange timestamp invalid');
 const symbols=await get('/open/v1/common/symbols');
 assert.ok(Array.isArray(symbols.data?.list)&&symbols.data.list.length>0,'no valid exchange symbol catalogue');
 for(const symbol of ['BTC_TRY','ETH_TRY']){
  assert.ok(symbols.data.list.some(s=>s.symbol===symbol&&s.spotTradingEnable===1&&s.type===1),symbol+' not tradable');
 }
 console.log('PUBLIC_API_PASS: server time and BTC/ETH catalogue verified, no account/order operations');
}catch(e){
 console.error('PUBLIC_API_UNVERIFIED:',e.name,e.message);
 process.exitCode=1;
}
