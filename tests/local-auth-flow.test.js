import test from 'node:test';
import assert from 'node:assert/strict';
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
