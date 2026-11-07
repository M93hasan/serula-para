import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import {mkdtempSync,rmSync,readFileSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {LocalSessionStore,SESSION_TTL_MS} from '../engine/local-session-store.js';
import {createLocalEmailAuth} from '../engine/local-email-auth.js';

const origin='http://127.0.0.1:8788';
function post(path,body) {
  return new Request(origin+path,{method:'POST',headers:{origin,'sec-fetch-site':'same-origin',
    'content-type':'application/json','x-para-request':'1'},body:JSON.stringify(body)});
}
test('hashed sessions survive offline restart, expire, and revoke', t=>{
  const dir=mkdtempSync(join(tmpdir(),'para-auth-'));
  t.after(()=>rmSync(dir,{recursive:true,force:true}));
  let now=100000000;
  const options={path:join(dir,'sessions.json'),clock:()=>now};
  const first=new LocalSessionStore(options);
  const token=first.create({id:'google-user',email:'user@example.org',provider:'google'});
  const cookie='para_local_session='+token;
  assert.equal(readFileSync(options.path,'utf8').includes(token),false);
  const restarted=new LocalSessionStore(options);
  assert.equal(restarted.user(cookie).id,'google-user');
  restarted.revoke(cookie);
  assert.equal(new LocalSessionStore(options).user(cookie),null);
  const fresh=new LocalSessionStore(options);
  const next=fresh.create({id:'u',provider:'email'});
  now+=SESSION_TTL_MS+1;
  assert.equal(new LocalSessionStore(options).user('para_local_session='+next),null);
});
test('email OTP is one-time, grants session only on verified code and rejects replay',async t=>{
  const dir=mkdtempSync(join(tmpdir(),'para-mail-'));t.after(()=>rmSync(dir,{recursive:true,force:true}));
  let code='';
  const sessions=new LocalSessionStore({path:join(dir,'sessions.json')});
  const auth=createLocalEmailAuth({allowedEmail:'test@example.org',sessionStore:sessions,
    sendMail:async (to,c)=>{assert.equal(to,'test@example.org');code=c;}});
  let res=await auth.handle('/auth/email/start',post('/auth/email/start',{email:'test@example.org'}));
  assert.equal(res.status,200);assert.match(code,/^\d{6}$/);
  res=await auth.handle('/auth/email/verify',post('/auth/email/verify',{email:'test@example.org',code:'abcdef'}));
  assert.equal(res.status,400);
  res=await auth.handle('/auth/email/verify',post('/auth/email/verify',{email:'test@example.org',code}));
  assert.equal(res.status,200);
  const cookie=res.headers.get('set-cookie').split(';')[0];
  assert.equal(sessions.user(cookie).provider,'email');
  res=await auth.handle('/auth/email/verify',post('/auth/email/verify',{email:'test@example.org',code}));
  assert.equal(res.status,401);
});
test('email OTP rate limit, origin and unknown email protections',async t=>{
  const dir=mkdtempSync(join(tmpdir(),'para-mail-'));t.after(()=>rmSync(dir,{recursive:true,force:true}));
  const auth=createLocalEmailAuth({allowedEmail:'test@example.org',
    sessionStore:new LocalSessionStore({path:join(dir,'sessions.json')}),sendMail:async()=>{}});
  const path='/auth/email/start';
  const invalid=new Request(origin+path,{method:'POST',headers:{'content-type':'application/json'},body:'{}'});
  assert.equal((await auth.handle(path,invalid)).status,403);
  assert.equal((await auth.handle(path,post(path,{email:'unknown@example.org'}))).status,200);
  for(let i=0;i<3;i++)assert.equal((await auth.handle(path,post(path,{email:'test@example.org'}))).status,200);
  assert.equal((await auth.handle(path,post(path,{email:'test@example.org'}))).status,429);
});
test('email auth rejects oversized streamed bodies before reading the remaining data',async t=>{
  const dir=mkdtempSync(join(tmpdir(),'para-mail-body-'));t.after(()=>rmSync(dir,{recursive:true,force:true}));
  let sends=0,pulls=0,cancelled=false;
  const auth=createLocalEmailAuth({allowedEmail:'test@example.org',
    sessionStore:new LocalSessionStore({path:join(dir,'sessions.json')}),sendMail:async()=>{sends++;}});
  const path='/auth/email/start';
  const stream=new ReadableStream({
    pull(controller){pulls++;controller.enqueue(new Uint8Array(1025));},
    cancel(){cancelled=true;}
  });
  const req=new Request(origin+path,{method:'POST',headers:{origin,'sec-fetch-site':'same-origin',
    'content-type':'application/json','x-para-request':'1'},body:stream,duplex:'half'});
  assert.equal((await auth.handle(path,req)).status,400);
  assert.equal(cancelled,true);assert.equal(pulls,1);assert.equal(sends,0);
  assert.equal((await auth.handle(path,post(path,{email:'test@example.org'}))).status,200);
  assert.equal(sends,1);
});

test('HTTP request stream over limit receives a response and server remains usable',async t=>{
  const dir=mkdtempSync(join(tmpdir(),'para-mail-http-'));t.after(()=>rmSync(dir,{recursive:true,force:true}));
  let sends=0;
  const auth=createLocalEmailAuth({allowedEmail:'test@example.org',
    sessionStore:new LocalSessionStore({path:join(dir,'sessions.json')}),sendMail:async()=>{sends++;}});
  // Use the same IncomingMessage-to-Request bridge as the local server.
  const server=http.createServer(async(req,res)=>{
    try{
      const response=await auth.handle(req.url,new Request(origin+req.url,{
        method:req.method,headers:req.headers,body:req,duplex:'half'
      }));
      res.writeHead(response.status,Object.fromEntries(response.headers));res.end(await response.text());
    }catch{res.writeHead(503).end();}
  });
  await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
  t.after(()=>new Promise(resolve=>server.close(resolve)));
  const port=server.address().port;
  const headers={origin,'sec-fetch-site':'same-origin','content-type':'application/json','x-para-request':'1'};
  const first=await new Promise((resolve,reject)=>{
    const req=http.request({host:'127.0.0.1',port,path:'/auth/email/start',method:'POST',headers},res=>{
      let body='';res.on('data',chunk=>{body+=chunk;});res.on('end',()=>resolve({status:res.statusCode,body}));
    });
    req.on('error',reject);req.write('x'.repeat(1025));
    setTimeout(()=>req.end('remaining body'),30);
  });
  assert.equal(first.status,400);assert.equal(JSON.parse(first.body).error,'invalid-request');assert.equal(sends,0);
  const valid=await fetch(`http://127.0.0.1:${port}/auth/email/start`,{method:'POST',headers,body:JSON.stringify({email:'test@example.org'})});
  assert.equal(valid.status,200);assert.equal(sends,1);
});
