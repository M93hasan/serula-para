import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync,mkdtempSync,mkdirSync,writeFileSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {createServer} from '../engine/server.js';
import {RiskStore} from '../engine/store.js';

test('DM Sans font is bundled, licensed and served as font/ttf in the local panel',async()=>{
  const source=readFileSync(new URL('../src/fonts/DM-Sans.ttf',import.meta.url));
  assert.ok(source.length>20000);
  assert.ok(['00010000','4f54544f'].includes(source.subarray(0,4).toString('hex')));
  const license=readFileSync(new URL('../src/fonts/OFL-DM-Sans.txt',import.meta.url),'utf8');
  assert.match(license,/SIL OPEN FONT LICENSE/);
  const css=readFileSync(new URL('../src/style.css',import.meta.url),'utf8');
  assert.match(css,/@font-face\s*\{font-family:"DM Sans"/);
  assert.match(css,/fonts\/DM-Sans\.ttf/);
  const dir=mkdtempSync(join(tmpdir(),'para-font-')),token='y'.repeat(40);
  mkdirSync(join(dir,'assets'));writeFileSync(join(dir,'assets','font-abc123.ttf'),source);
  const simulator=new RiskStore(':memory:',{budget:1000,maxTrade:100,maxLoss:100});
  const server=createServer({token,simulator,distDir:dir});
  await new Promise(r=>server.listen(0,'127.0.0.1',r));
  try{
    const base='http://127.0.0.1:'+server.address().port;
    const response=await fetch(base+'/assets/font-abc123.ttf');
    assert.equal(response.status,200);
    assert.match(response.headers.get('content-type'),/font\/ttf/);
    assert.deepEqual(Buffer.from(await response.arrayBuffer()),source);
    assert.equal((await fetch(base+'/src/fonts/DM-Sans.ttf')).status,403);
  }finally{
    await new Promise(r=>server.close(r));simulator.close();rmSync(dir,{recursive:true,force:true});
  }
});
