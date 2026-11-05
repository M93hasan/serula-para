import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createHmac } from 'node:crypto';
import { BinanceTR } from '../engine/binance-tr.js';
import { Simulator, agents } from '../engine/simulation.js';
import { createServer } from '../engine/server.js';

test('TR adapter signs account requests and only uses read endpoints', async () => {
  const requests = [];
  const client = new BinanceTR({ clock: () => 123456, fetchImpl: async (url, options) => { requests.push({url, options}); return new Response(JSON.stringify({code:0,data:{}})); } });
  await client.time(); await client.symbols(); await client.account({apiKey:'key',secretKey:'secret'});
  const signed = requests[2]; const query = 'timestamp=123456&recvWindow=5000';
  assert.equal(signed.url, `https://www.binance.tr/open/v1/account/spot?${query}&signature=${createHmac('sha256','secret').update(query).digest('hex')}`);
  assert.equal(signed.options.headers['X-MBX-APIKEY'], 'key');
  assert.ok(requests.every(x => x.options.method === 'GET' && x.options.redirect === 'error'));
  assert.equal(client.order, undefined);
});
test('rate limit prevents further calls until cooldown', async () => {
  let now=0, calls=0; const client = new BinanceTR({clock:()=>now,fetchImpl:async()=>{ calls++; return new Response('',{status:429,headers:{'retry-after':'10'}}); }});
  await assert.rejects(client.time()); await assert.rejects(client.symbols()); assert.equal(calls,1);
  now=10000; await assert.rejects(client.time()); assert.equal(calls,2);
});
test('simulation stops by default and enforces budget, loss and emergency stop', () => {
  const sim = new Simulator({budget:1000,maxTrade:300,maxLoss:100});
  assert.throws(()=>sim.evaluate({amount:1,worstCaseLoss:0})); sim.start();
  assert.throws(()=>sim.evaluate({amount:301,worstCaseLoss:1}));
  assert.throws(()=>sim.evaluate({amount:100,worstCaseLoss:100}));
  assert.equal(sim.evaluate({amount:100,worstCaseLoss:20}).remaining,980);
  sim.halt(); assert.throws(()=>sim.evaluate({amount:10,worstCaseLoss:0}));
  assert.equal(sim.status().realOrdersEnabled,false); assert.throws(()=>new Simulator({budget:1,maxTrade:NaN,maxLoss:1}));
});
test('agents default to hold', () => {
  assert.equal(agents.decide(agents.analyze(agents.select([{symbol:'BTC_TRY',volume:4}])[0])).action,'hold');
});
test('local service requires token, rejects browser origins and cannot start trading', async () => {
  const sim = new Simulator({budget:100,maxTrade:10,maxLoss:10}); const token='x'.repeat(32);
  const server = createServer({token,simulator:sim}); await new Promise(r=>server.listen(0,'127.0.0.1',r));
  try {
    const url=`http://127.0.0.1:${server.address().port}`; const headers={Authorization:`Bearer ${token}`};
    assert.equal((await fetch(url+'/status')).status,403);
    assert.equal((await fetch(url+'/status',{headers:{...headers,Origin:'https://example.com'}})).status,403);
    assert.equal((await fetch(url+'/status',{headers})).status,200);
    assert.equal((await fetch(url+'/start',{method:'POST',headers})).status,404);
    assert.equal((await fetch(url+'/halt',{method:'POST',headers})).status,200);
  } finally { await new Promise(r=>server.close(r)); }
});
