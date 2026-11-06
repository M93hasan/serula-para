import test from 'node:test';
import assert from 'node:assert/strict';
import {createLocalGoogleAuth} from '../engine/local-google-auth.js';
import {createServer} from '../engine/server.js';
import {RiskStore} from '../engine/store.js';

const clientId='111111111111-abc123.apps.googleusercontent.com';
const allowedEmail='owner@example.com';
const url='http://127.0.0.1:8788';
function google(override={}){
  let observed=[];
  const auth=createLocalGoogleAuth({
    clientId,allowedEmail,
    fetchImpl:async(endpoint,options)=>{
      observed.push({endpoint,body:String(options.body)});
      return new Response(JSON.stringify({id_token:'fake-google-id-token'}),{headers:{'Content-Type':'application/json'}});
    },
    verifyIdentity:async (_token,nonce)=>({sub:'stable-google-user-123',nonce,email:allowedEmail,email_verified:true}),
    ...override
  });
  return {auth,observed};
}
function request(path,headers={}){return new Request(url+path,{headers});}
test('Google local login requires explicit allowlist and keeps vault locked',async()=>{
  const disabled=createLocalGoogleAuth({clientId});assert.equal(disabled.configured,false);
  const r=await disabled.handle('/auth/google/status',request('/auth/google/status'));assert.equal((await r.json()).configured,false);
  assert.equal(disabled.user(''),null);
});
test('Google OAuth PKCE, nonce, one-time state, and private cookie session',async()=>{
  const {auth,observed}=google();
  const start=await auth.handle('/auth/google/start',request('/auth/google/start'));
  assert.equal(start.status,302);
  const target=new URL(start.headers.get('location'));
  assert.equal(target.hostname,'accounts.google.com');
  assert.equal(target.searchParams.get('code_challenge_method'),'S256');
  assert.equal(target.searchParams.get('scope'),'openid email');
  assert.equal(target.searchParams.get('redirect_uri'),url+'/auth/google/callback');
  assert.ok(target.searchParams.get('nonce'));
  assert.ok(target.searchParams.get('state'));
  const state=target.searchParams.get('state');
  const wrong=await auth.handle('/auth/google/callback',request('/auth/google/callback?code=one&state=wrong'));
  assert.equal(wrong.status,403);
  const callback='/auth/google/callback?code=one&state='+encodeURIComponent(state);
  const result=await auth.handle('/auth/google/callback',request(callback));
  assert.equal(result.status,303);
  const cookie=result.headers.get('set-cookie');
  assert.match(cookie,/HttpOnly/);assert.match(cookie,/SameSite=Strict/);
  assert.equal(result.headers.get('location'),'/');
  assert.equal(observed[0].endpoint,'https://oauth2.googleapis.com/token');
  assert.match(observed[0].body,/code_verifier=/);
  assert.ok(!observed[0].body.includes('fake-google-id-token'));
  const session=auth.user(cookie.split(';')[0]);
  assert.equal(session.email,allowedEmail);
  assert.equal(auth.user('para_local_session=bad'),null);
  const replay=await auth.handle('/auth/google/callback',request(callback));
  assert.equal(replay.status,403);
  const denied=await auth.handle('/auth/google/logout',new Request(url+'/auth/google/logout',{method:'POST'}));
  assert.equal(denied.status,403);
  const logout=await auth.handle('/auth/google/logout',new Request(url+'/auth/google/logout',{method:'POST',headers:{Origin:url,'Sec-Fetch-Site':'same-origin','X-Para-Request':'1',Cookie:cookie.split(';')[0]}}));
  assert.equal(logout.status,200);assert.equal(auth.user(cookie.split(';')[0]),null);
  auth.close();
});
test('Unverified email, wrong user, and nonce mismatch fail closed',async()=>{
  for(const verifyIdentity of [
    async(_token,nonce)=>({sub:'other',nonce,email:allowedEmail,email_verified:false}),
    async(_token,nonce)=>({sub:'other',nonce,email:allowedEmail,email_verified:'false'}),
    async(_token,nonce)=>({sub:'other',nonce,email:{},email_verified:true}),
    async(_token,nonce)=>({sub:'other',nonce,email:'evil@example.com',email_verified:true}),
    async(_token,nonce)=>({sub:'other',nonce:'wrong',email:allowedEmail,email_verified:true})
  ]){
    const {auth}=google({verifyIdentity});
    const start=await auth.handle('/auth/google/start',request('/auth/google/start'));
    const state=new URL(start.headers.get('location')).searchParams.get('state');
    const result=await auth.handle('/auth/google/callback',request('/auth/google/callback?code=one&state='+state));
    assert.equal(result.status,401);assert.equal(result.headers.get('set-cookie'),null);
    auth.close();
  }
});
test('Google cookie session requires same-origin mutation headers and does not open order endpoints',async()=>{
  const {auth}=google(),token='x'.repeat(40),store=new RiskStore(':memory:',{budget:1000,maxTrade:100,maxLoss:100});
  const server=createServer({token,simulator:store,googleAuth:auth});
  await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
  try{
    const base='http://127.0.0.1:'+server.address().port;
    const common={Host:'127.0.0.1:'+server.address().port};
    const start=await fetch(base+'/auth/google/start',{headers:common,redirect:'manual'});
    assert.equal(start.status,302);
    const state=new URL(start.headers.get('location')).searchParams.get('state');
    const callback=await fetch(base+'/auth/google/callback?state='+state+'&code=ok',{headers:{...common,'Sec-Fetch-Site':'cross-site'},redirect:'manual'});
    assert.equal(callback.status,303);
    const cookie=callback.headers.get('set-cookie').split(';')[0];
    const me=await fetch(base+'/api/auth/me',{headers:{...common,Cookie:cookie}});
    assert.equal((await me.json()).provider,'google');
    assert.equal((await fetch(base+'/api/auth/me',{headers:common})).status,403);
    const invalid=await fetch(base+'/halt',{method:'POST',headers:{...common,Cookie:cookie,Origin:'https://evil.example','Sec-Fetch-Site':'cross-site'}});
    assert.equal(invalid.status,403);
    const noCsrf=await fetch(base+'/halt',{method:'POST',headers:{...common,Cookie:cookie}});
    assert.equal(noCsrf.status,403);
    const forbiddenOrder=await fetch(base+'/api/orders',{method:'POST',headers:{...common,Cookie:cookie,Origin:base,'Sec-Fetch-Site':'same-origin','Content-Type':'application/json','X-Para-Request':'1'},body:'{}'});
    assert.equal(forbiddenOrder.status,404);
  }finally{await new Promise(resolve=>server.close(resolve));store.close();}
});

test('Expired state fails closed; pending authorization requests are bounded',async()=>{
  let now=1000;
  const {auth}=google({clock:()=>now});
  const start=await auth.handle('/auth/google/start',request('/auth/google/start'));
  const state=new URL(start.headers.get('location')).searchParams.get('state');
  now+=300001;
  assert.equal((await auth.handle('/auth/google/callback',request('/auth/google/callback?code=x&state='+state))).status,403);
  for(let i=0;i<20;i++)assert.equal((await auth.handle('/auth/google/start',request('/auth/google/start'))).status,302);
  assert.equal((await auth.handle('/auth/google/start',request('/auth/google/start'))).status,429);
  auth.close();
});
test('Font assets retain font MIME and local host isolation',async()=>{
  const {mkdtempSync,writeFileSync,mkdirSync,rmSync}=await import('node:fs');
  const {tmpdir}=await import('node:os');const {join}=await import('node:path');
  const dir=mkdtempSync(join(tmpdir(),'para-font-'));mkdirSync(join(dir,'assets'));writeFileSync(join(dir,'assets','DM-Sans-test.ttf'),'font-test');
  const store=new RiskStore(':memory:',{budget:1000,maxTrade:100,maxLoss:100});
  const server=createServer({token:'x'.repeat(40),simulator:store,distDir:dir});
  await new Promise(r=>server.listen(0,'127.0.0.1',r));
  try{
    const base='http://127.0.0.1:'+server.address().port;
    const font=await fetch(base+'/assets/DM-Sans-test.ttf');assert.equal(font.status,200);assert.equal(font.headers.get('content-type'),'font/ttf');
    assert.equal((await fetch(base+'/assets/DM-Sans-test.ttf',{headers:{Origin:'https://evil.example'}})).status,403);
    const {get}=await import('node:http');
    const status=await new Promise((resolve,reject)=>{get(base+'/assets/DM-Sans-test.ttf',{headers:{Host:'localhost:'+server.address().port}},r=>{r.resume();resolve(r.statusCode);}).on('error',reject);});assert.equal(status,403);
  }finally{await new Promise(r=>server.close(r));store.close();rmSync(dir,{recursive:true,force:true});}
});

test('Google state/session expiry and unreachable token endpoint fail closed',async()=>{
 let now=1000000;const {auth}=google({clock:()=>now});
 const start=await auth.handle('/auth/google/start',request('/auth/google/start'));const state=new URL(start.headers.get('location')).searchParams.get('state');
 now+=300001;assert.equal((await auth.handle('/auth/google/callback',request('/auth/google/callback?code=x&state='+state))).status,403);
 const next=await auth.handle('/auth/google/start',request('/auth/google/start'));const nextState=new URL(next.headers.get('location')).searchParams.get('state');
 const response=await auth.handle('/auth/google/callback',request('/auth/google/callback?code=x&state='+nextState));const cookie=response.headers.get('set-cookie').split(';')[0];assert.ok(auth.user(cookie));now+=8*3600000;assert.equal(auth.user(cookie),null);auth.close();
 const offline=google({fetchImpl:async()=>{throw Error('private-secret');}}).auth;const s=await offline.handle('/auth/google/start',request('/auth/google/start'));const key=new URL(s.headers.get('location')).searchParams.get('state');const failed=await offline.handle('/auth/google/callback',request('/auth/google/callback?code=x&state='+key));assert.equal(failed.status,401);assert.ok(!(await failed.text()).includes('private-secret'));offline.close();
});
