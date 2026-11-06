import test from 'node:test';
import assert from 'node:assert/strict';
import { BinanceTR } from '../engine/binance-tr.js';
import { MarketData } from '../engine/market-data.js';

test('existing signed Binance TR account read remains GET-only', async () => {
  const calls=[];
  const client=new BinanceTR({
    clock:()=>1700000000000,
    fetchImpl:async (url,options)=>{
      calls.push({url:String(url),options});
      return {ok:true,status:200,json:async()=>({code:0,data:{accountAssets:[]}})};
    },
  });
  const result=await client.account({apiKey:'read-only-test-key',secretKey:'test-secret'});
  assert.equal(result.code,0);
  assert.equal(calls.length,1);
  assert.equal(calls[0].options.method,'GET');
  assert.equal(calls[0].options.headers['X-MBX-APIKEY'],'read-only-test-key');
  assert.match(calls[0].url,/^https:\/\/www\.binance\.tr\/open\/v1\/account\/spot\?/);
  assert.ok(calls[0].url.includes('signature='));
});

test('automatic price refresh never sends account API credentials', async () => {
  const calls=[],now=1700000000000;
  const fetchImpl=async (url,options)=>{
    calls.push({url:String(url),options});
    const symbol=new URL(url).searchParams.get('symbol');
    return {ok:true,status:200,headers:{get:()=>null},json:async()=>[{price:symbol==='BTCTRY'?'3800000':'110000',time:now}]};
  };
  const data=await new MarketData({fetchImpl,clock:()=>now}).prices();
  assert.equal(data.markets.length,2);
  assert.equal(calls.length,2);
  assert.ok(calls.every(({url,options})=>options.method==='GET'
    && url.startsWith('https://api.binance.me/api/v3/trades?')
    && !('headers' in options)
    && !url.includes('signature=')
    && !url.includes('apiKey=')));
});
