import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {spawn} from 'node:child_process';

test('launcher builds and starts the authenticated loopback panel', {timeout:30000}, async()=>{
 const dir=mkdtempSync(join(tmpdir(),'para-launch-'));
 const child=spawn(process.execPath,['scripts/start-local.js'],{env:{...process.env,PARA_DATA_DIR:dir},stdio:['ignore','pipe','pipe']});
 let output='';child.stdout.on('data',x=>output+=x);child.stderr.on('data',x=>output+=x);
 try {
  const token=await new Promise((resolve,reject)=>{const timeout=setTimeout(()=>reject(Error(`launcher timeout: ${output}`)),20000);const check=()=>{const match=output.match(/Yerel erisim anahtari \(panele girin\): ([0-9a-f]{64})/);if(match){clearTimeout(timeout);resolve(match[1]);}};child.stdout.on('data',check);child.on('exit',code=>{clearTimeout(timeout);reject(Error(`launcher exited ${code}: ${output}`));});check();});
  const url='http://127.0.0.1:8788';assert.equal((await fetch(url+'/')).status,200);assert.equal((await fetch(url+'/status')).status,403);
  const response=await fetch(url+'/status',{headers:{Authorization:`Bearer ${token}`}});assert.equal(response.status,200);assert.equal((await response.json()).realOrdersEnabled,false);
 }finally{child.kill('SIGTERM');await new Promise(r=>{if(child.exitCode!==null||child.signalCode!==null)return r();child.once('exit',r);});rmSync(dir,{recursive:true,force:true});}
});
