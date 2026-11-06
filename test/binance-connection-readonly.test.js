import test from 'node:test';
import assert from 'node:assert/strict';
import {createHmac} from 'node:crypto';
import {BinanceTR} from '../engine/binance-tr.js';
import {AccountService} from '../engine/account-service.js';
import {diagnoseLocalBinance} from '../engine/binance-connection-diagnostic.js';

test('Windows 403 diagnostic identifies WAF without any credentials or arbitrary URLs',async()=>{
  const urls=[],results=[403,200];
  const result=await diagnoseLocalBinance({fetchImpl:async (url,options)=>{
    urls.push({url,options});return {status:results.shift()};
  }});
  assert.equal(result.hasWafBlock,true);
  assert.equal(result.targets[0].status,'WAF_BLOCKED');
  assert.equal(result.targets[1].status,'REACHABLE');
  assert.equal(urls.length,2);
  assert.ok(urls.every(x=>x.options.method==='GET'&&!x.options.headers['X-MBX-APIKEY']));
});
test('diagnostic distinguishes offline timeout from security block',async()=>{
  const result=await diagnoseLocalBinance({fetchImpl:async()=>{throw Object.assign(Error('offline'),{name:'TimeoutError'});}});
  assert.equal(result.hasWafBlock,false);
  assert.ok(result.targets.every(x=>x.status==='TIMEOUT'));
});
test('Binance signed open order read never posts, has HMAC and only queries active symbol',async()=>{
  let request;
  const client=new BinanceTR({clock:()=>1700000000000,fetchImpl:async(url,opts)=>{
    request={url,opts};
    return {ok:true,status:200,json:async()=>({code:0,data:{list:[]}})};
  }});
  const result=await client.openOrders({apiKey:'key',secretKey:'secret',symbol:'BTC_TRY'});
  assert.deepEqual(result.data.list,[]);
  const url=new URL(request.url);
  assert.equal(url.origin,'https://www.binance.tr');
  assert.equal(url.pathname,'/open/v1/orders');
  assert.equal(url.searchParams.get('type'),'1');
  assert.equal(url.searchParams.get('symbol'),'BTC_TRY');
  assert.equal(request.opts.method,'GET');
  assert.equal(request.opts.headers['X-MBX-APIKEY'],'key');
  const q=url.search.slice(1).replace(/&signature=[a-f0-9]{64}$/,'');
  assert.equal(url.searchParams.get('signature'),createHmac('sha256','secret').update(q).digest('hex'));
  assert.throws(()=>client.openOrders({apiKey:'key',secretKey:'secret',symbol:'../admin'}),/Invalid order query/);
});
test('after offline interruption, read resumes explicitly once network is restored',async()=>{
  let connected=false,calls=0;
  const client=new BinanceTR({fetchImpl:async()=>{
    calls++;if(!connected)throw Error('offline');
    return {ok:true,status:200,json:async()=>({code:0,data:{list:[]}})};
  }});
  await assert.rejects(client.openOrders({apiKey:'key',secretKey:'secret',symbol:'BTC_TRY'}),/offline/);
  assert.equal(calls,1);
  connected=true;
  const result=await client.openOrders({apiKey:'key',secretKey:'secret',symbol:'BTC_TRY'});
  assert.deepEqual(result.data.list,[]);
  assert.equal(calls,2); // never automatically replay a financial request
});
test('AccountService rejects truncated active order pages and wrong symbols',async()=>{
  const fake=Object.create(AccountService.prototype);
  // Real encrypted account is exercised by existing vault integration tests.
  // This test uses a valid encrypted temporary vault.
  const {mkdtempSync,rmSync}=await import('node:fs');
  const {tmpdir}=await import('node:os');
  const {join}=await import('node:path');
  const dir=mkdtempSync(join(tmpdir(),'orders-read-'));
  try{
    let rows=[];
    const service=new AccountService({path:join(dir,'vault.json'),client:{openOrders:async()=>({data:{list:rows}})}});
    service.save({apiKey:'key',secretKey:'secret',passphrase:'long-enough-passphrase-for-test'});
    rows=[{orderId:'1',symbol:'BTC_TRY',clientId:'id',status:0,side:0,type:1,price:'1',origQty:'1',executedQty:'0',createTime:1700000000000}];
    assert.equal((await service.openOrders('long-enough-passphrase-for-test',{symbol:'BTC_TRY',limit:5})).length,1);
    await assert.rejects(service.openOrders('long-enough-passphrase-for-test',{symbol:'BTC_TRY',limit:1}),/INCOMPLETE_ORDER_DATA/);
    rows[0].symbol='ETH_TRY';
    await assert.rejects(service.openOrders('long-enough-passphrase-for-test',{symbol:'BTC_TRY',limit:5}),/INVALID_ORDER_DATA/);
  }finally{rmSync(dir,{recursive:true,force:true});}
});
