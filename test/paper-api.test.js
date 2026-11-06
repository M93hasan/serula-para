import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createServer} from '../engine/server.js';
import {RiskStore} from '../engine/store.js';
import {PaperStore} from '../engine/paper-store.js';
test('paper API requires local token and same-origin writes; no order endpoint',async()=>{
 const token='x'.repeat(40),simulator=new RiskStore(':memory:',{budget:1000,maxTrade:100,maxLoss:100}),paper=new PaperStore(':memory:',{feeBps:10,slippageBps:10,quotes:[{asset:'TRY',budget:1000,maxTrade:100,maxExposure:500,maxAsset:100,maxLoss:100}]});const server=createServer({token,simulator,paper});await new Promise(r=>server.listen(0,'127.0.0.1',r));
 try{const origin=`http://127.0.0.1:${server.address().port}`,auth={Authorization:`Bearer ${token}`},headers={...auth,Origin:origin,'Sec-Fetch-Site':'same-origin','Content-Type':'application/json','X-Para-Request':'1'};
 assert.equal((await fetch(origin+'/api/paper/status')).status,403);assert.equal((await fetch(origin+'/api/paper/start',{method:'POST',headers:{...headers,Origin:'http://evil.example'},body:'{}'})).status,403);
 assert.equal((await fetch(origin+'/api/paper/start',{method:'POST',headers,body:'{}'})).status,200);let status=await (await fetch(origin+'/api/paper/status',{headers:auth})).json();assert.equal(status.status.halted,false);assert.match(status.notice,/henüz yok/);
 assert.equal((await fetch(origin+'/api/paper/execute',{method:'POST',headers,body:'{}'})).status,404);assert.equal((await fetch(origin+'/api/paper/stop',{method:'POST',headers,body:'{}'})).status,200);status=await (await fetch(origin+'/api/paper/status',{headers:auth})).json();assert.equal(status.status.halted,true);
 }finally{await new Promise(r=>server.close(r));paper.close();simulator.close();}
});

test('emergency stop attempts both modes even if one journal fails', async t => {
  const token = 't'.repeat(40);
  const calls = [];
  let failingMode = 'paper';
  const store = mode => ({
    halt() {
      calls.push(mode);
      if (mode === failingMode) throw Error('fixture storage failure');
    },
    status: () => ({ halted: true, realOrdersEnabled: false }),
  });
  const server = createServer({ token, simulator: store('simulation'), paper: store('paper') });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  t.after(() => new Promise(resolve => server.close(resolve)));

  const origin = `http://127.0.0.1:${server.address().port}`;
  const options = {
    method: 'POST', body: '{}',
    headers: {
      Authorization: `Bearer ${token}`, Origin: origin, 'Sec-Fetch-Site': 'same-origin',
      'Content-Type': 'application/json', 'X-Para-Request': '1',
    },
  };
  for (const mode of ['paper', 'simulation']) {
    failingMode = mode;
    calls.length = 0;
    const response = await fetch(origin + '/halt', options);
    assert.equal(response.status, 503);
    assert.deepEqual(await response.json(), { error: 'storage unavailable' });
    assert.deepEqual(calls, ['simulation', 'paper']);
  }

  failingMode = null;
  const success = await fetch(origin + '/halt', options);
  assert.equal(success.status, 200);
  assert.deepEqual(await success.json(), { halted: true, realOrdersEnabled: false });
});
