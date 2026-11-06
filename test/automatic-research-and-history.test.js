import test from 'node:test';
import assert from 'node:assert/strict';
import { ScanAutomation } from '../engine/scan-automation.js';
import { AccountSnapshotStore } from '../engine/account-snapshot-store.js';
import { createServer } from '../engine/server.js';
import { RiskStore } from '../engine/store.js';

test('automatic scanner starts only when enabled and stops permanently on rate limits',()=>{
  let calls=0,now=1700000000000,scan={status:'idle',results:[]};
  const scanner={status:()=>scan,start:()=>{calls++;scan={status:'running',results:[]};}};
  const automatic=new ScanAutomation(scanner,{clock:()=>now,intervalMs:1800000});
  assert.equal(calls,0);
  automatic.setEnabled(true);
  assert.equal(calls,1);
  automatic.tick();
  assert.equal(calls,1);
  scan={status:'complete',finishedAt:now,results:[]};
  automatic.tick();
  assert.equal(calls,1);
  now+=1800001;
  automatic.tick();
  assert.equal(calls,2);
  scan={status:'RATE_LIMIT',results:[]};
  automatic.tick();
  assert.equal(automatic.status().enabled,false);
  assert.equal(automatic.status().lastError,'RATE_LIMIT');
  assert.throws(()=>automatic.setEnabled(true),/MANUAL_REVIEW/);
  automatic.close();
});

test('daily read-only account observations remain durable and never invent PnL',()=>{
  let now=1700000000000;
  const store=new AccountSnapshotStore(':memory:',{clock:()=>now});
  try{
    let x=store.save({estimatedTry:100,assetCount:1,pricedAssets:1,missingAssets:[]});
    assert.equal(x.latest.estimatedTry,100);
    assert.equal(x.change24h,null);
    now+=24*3600000;
    x=store.save({estimatedTry:120,assetCount:1,pricedAssets:1,missingAssets:[]});
    assert.equal(x.change24h,20);
    assert.match(x.notice,/gerçek kâr\/zarar değildir/);
    now+=3600000;
    x=store.save({estimatedTry:null,assetCount:2,pricedAssets:1,missingAssets:['BTC']});
    assert.equal(x.latest.complete,false);
    assert.equal(x.change24h,null);
    assert.equal(x.history.length,3);
  }finally{store.close();}
});

test('local account history API writes only snapshots after read-only account refresh',async()=>{
  const token='s'.repeat(40),simulator=new RiskStore(':memory:',{budget:1000,maxTrade:100,maxLoss:100});
  let observationTime=1700000000000,free='100';
  const accountHistory=new AccountSnapshotStore(':memory:',{clock:()=>observationTime});
  const account={exists:()=>true,balance:async(pass)=>{assert.equal(pass,'passphrase');return [{asset:'TRY',free,locked:'0'}];}};
  const scanner={status:()=>({status:'idle',results:[]}),start:()=>{throw Error('NOT_STARTED')}};
  const server=createServer({token,simulator,scanner,account,accountHistory});
  await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
  try{
    const origin=`http://127.0.0.1:${server.address().port}`,auth={Authorization:`Bearer ${token}`},headers={...auth,Origin:origin,'Sec-Fetch-Site':'same-origin','Content-Type':'application/json','X-Para-Request':'1'};
    assert.equal((await fetch(origin+'/api/binance-tr/value-history')).status,403);
    assert.equal((await fetch(origin+'/api/binance-tr/test',{method:'POST',headers,body:JSON.stringify({passphrase:'passphrase'})})).status,200);
    let response=await (await fetch(origin+'/api/binance-tr/value-history',{headers:auth})).json();
    assert.equal(response.latest.estimatedTry,100);
    assert.equal(response.change24h,null);
    observationTime+=24*3600000;
    free='120';
    assert.equal((await fetch(origin+'/api/binance-tr/test',{method:'POST',headers,body:JSON.stringify({passphrase:'passphrase'})})).status,200);
    response=await (await fetch(origin+'/api/binance-tr/value-history',{headers:auth})).json();
    assert.equal(response.change24h,20);
    assert.ok(!JSON.stringify(response).includes('passphrase'));
    assert.equal((await fetch(origin+'/api/paper/execute',{method:'POST',headers,body:'{}'})).status,404);
  }finally{await new Promise(resolve=>server.close(resolve));accountHistory.close();simulator.close();}
});

test('scheduler disable prevents future starts and re-enable respects interval',()=>{
 let calls=0,now=1700000000000,scan={status:'idle'};
 const scheduler=new ScanAutomation({status:()=>scan,start:()=>{calls++;scan={status:'running'};}},{clock:()=>now,intervalMs:60000});
 try{scheduler.setEnabled(true);assert.equal(calls,1);scheduler.setEnabled(false);scan={status:'complete',finishedAt:now};scheduler.tick();assert.equal(calls,1);scheduler.setEnabled(true);assert.equal(calls,1);now+=60001;scheduler.tick();assert.equal(calls,2);scan={status:'REGION_RESTRICTED'};scheduler.tick();assert.equal(scheduler.status().enabled,false);assert.throws(()=>scheduler.setEnabled(true),/REQUIRES_MANUAL_REVIEW/);}finally{scheduler.close();}
});
