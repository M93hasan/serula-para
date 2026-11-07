import test from 'node:test';
import assert from 'node:assert/strict';
import { generateKeyPair, SignJWT } from 'jose';
import { createWorker } from '../cloudflare/worker.js';
import { verifyAccess } from '../cloudflare/access.js';
import { startGoogle, finishGoogle, verifyGoogleSession, logoutGoogle } from '../cloudflare/google-auth.js';
const origin='https://preview.example';
function createSessionDb(){
 const rows=new Map();
 return {rows,withSession(consistency){
  assert.equal(consistency,'first-primary');
  return {prepare(sql){return {bind(...args){return {
   async run(){
    if(sql.startsWith('INSERT')){const [hash,subject,expires_at]=args;if(rows.has(hash))return {success:false};rows.set(hash,{subject,expires_at});return {success:true,meta:{changes:1}};}
    if(sql.startsWith('DELETE'))return {success:true,meta:{changes:rows.delete(args[0])?1:0}};
    throw Error('unexpected SQL');
   },
   async first(){return rows.get(args[0])||null;}
  };}};}};
 }};
}
const env={GOOGLE_SESSION_DB:createSessionDb(),GOOGLE_OAUTH_CLIENT_ID:'200434213389-cbkplrr8tj6lumaorj2jqbc78t9eaap1.apps.googleusercontent.com',GOOGLE_ALLOWED_EMAIL:'allowed@example.com',GOOGLE_REDIRECT_URI:origin+'/auth/google/callback',GOOGLE_SESSION_SECRET:'1234567890abcdefghijklmnopqrstuvwxyz-SAFE',ASSETS:{fetch:async()=>new Response('<!doctype html><title>PARA</title>',{headers:{'Content-Type':'text/html'}})},ANALYSIS_LIMIT:{limit:async()=>({success:true})}};
test('legacy Access verifier rejects missing or invalid assertions',async()=>{const {publicKey,privateKey}=await generateKeyPair('RS256');const e={ACCESS_AUD:'aud',ACCESS_ISSUER:'https://example.cloudflareaccess.com'};const token=await new SignJWT({}).setProtectedHeader({alg:'RS256'}).setIssuer(e.ACCESS_ISSUER).setAudience(e.ACCESS_AUD).setSubject('test-user').setIssuedAt().setExpirationTime('2m').sign(privateKey);assert.equal((await verifyAccess(token,e,publicKey)).id,'test-user');await assert.rejects(verifyAccess(token,{...e,ACCESS_AUD:'other'},publicKey));});
test('unauthorized users cannot access assets or APIs, login link is Google only',async()=>{let reads=0;const worker=createWorker(),e={...env,ASSETS:{fetch:async()=>{reads++;return new Response('private');}}};for(const path of ['/','/assets/index.js','/api/auth/me','/api/analysis']){const r=await worker.fetch(new Request(origin+path),e);assert.equal(r.status,401);if(path==='/'){const html=await r.text();assert.match(html,/Google ile giriş yap/);assert.doesNotMatch(html,/Cloudflare Access/);}}assert.equal(reads,0);});
test('authorized identity can access panel but account, orders and AI remain unavailable',async()=>{const worker=createWorker({verify:async()=>({id:'user',email:'allowed@example.com'})});assert.equal((await worker.fetch(new Request(origin+'/'),env)).status,200);assert.equal((await worker.fetch(new Request(origin+'/api/auth/me'),env)).status,200);for(const p of ['/api/binance-tr/test','/api/orders','/api/ai/history'])assert.equal((await worker.fetch(new Request(origin+p),env)).status,503);});
test('analysis requires same-origin and configured rate limit',async()=>{const worker=createWorker({verify:async()=>({id:'user'})});const request=(host)=>new Request(origin+'/api/analysis',{method:'POST',headers:{Origin:host,'Sec-Fetch-Site':'same-origin','Content-Type':'application/json','X-Para-Request':'1'},body:'{}'});assert.equal((await worker.fetch(request('https://bad.example'),env)).status,403);assert.equal((await worker.fetch(request(origin),{...env,ANALYSIS_LIMIT:null})).status,503);});
test('Google login uses exact callback, state, nonce and S256 PKCE; cannot start unconfigured',async()=>{assert.equal((await startGoogle(new Request(origin+'/auth/google/login'),{...env,GOOGLE_REDIRECT_URI:'https://attacker.example/auth/google/callback'})).status,503);const r=await startGoogle(new Request(origin+'/auth/google/login'),env);assert.equal(r.status,303);const google=new URL(r.headers.get('location'));assert.equal(google.hostname,'accounts.google.com');assert.equal(google.searchParams.get('redirect_uri'),env.GOOGLE_REDIRECT_URI);assert.equal(google.searchParams.get('code_challenge_method'),'S256');assert.ok(google.searchParams.get('nonce'));assert.ok(google.searchParams.get('state'));assert.match(r.headers.get('set-cookie'),/__Host-para-oauth=.*HttpOnly; Secure/);});
test('OAuth callback creates signed session only for verified allowed account and matching nonce',async()=>{
 const begin=await startGoogle(new Request(origin+'/auth/google/login'),env),auth=new URL(begin.headers.get('location')),state=auth.searchParams.get('state'),nonce=auth.searchParams.get('nonce');
 const flow=begin.headers.get('set-cookie').split(';')[0],url=origin+'/auth/google/callback?code=example-code&state='+state;
 const exchange=async(_url,options)=>{assert.equal(options.body.get('code_verifier')?.length>20,true);return new Response(JSON.stringify({id_token:'dummy'}),{status:200});};
 const good=await finishGoogle(new Request(url,{headers:{Cookie:flow}}),env,{exchange,verifyToken:async()=>({sub:'google-sub',email:'allowed@example.com',email_verified:true,nonce})});
 assert.equal(good.status,303);assert.equal(good.headers.get('location'),'/');
 const session=good.headers.get('set-cookie').split(', ').find(x=>x.startsWith('__Host-para-session='))||good.headers.get('set-cookie').match(/__Host-para-session=[^;]+/)?.[0];assert.ok(session);
 const identity=await verifyGoogleSession(new Request(origin+'/',{headers:{Cookie:session.split(';')[0]}}),env);assert.equal(identity.id,'google-sub');
 await assert.rejects(verifyGoogleSession(new Request(origin+'/',{headers:{Cookie:session.split(';')[0]}}),{...env,GOOGLE_ALLOWED_EMAIL:'other@example.com'}));
 const denied=await finishGoogle(new Request(url,{headers:{Cookie:flow}}),env,{exchange,verifyToken:async()=>({sub:'wrong',email:'allowed@example.com',email_verified:true,nonce:'wrong'})});assert.equal(denied.headers.get('location'),'/');assert.match(denied.headers.get('set-cookie'),/__Host-para-session=; Path=/);
 const noFlow=await finishGoogle(new Request(url),env,{exchange,verifyToken:async()=>({sub:'x',email:'allowed@example.com',email_verified:true,nonce})});assert.equal(noFlow.headers.get('location'),'/');
});
test('logout requires same origin and explicit POST',async()=>{assert.equal((await logoutGoogle(new Request(origin+'/auth/logout',{method:'POST',headers:{Origin:'https://bad.example'}}),env)).status,403);assert.equal((await logoutGoogle(new Request(origin+'/auth/logout',{method:'POST',headers:{Origin:origin,'X-Para-Request':'1'}}),env)).status,200);});

async function loginForTest(e,sub='user-a'){
 const begin=await startGoogle(new Request(origin+'/auth/google/login'),e);
 assert.equal(begin.status,303);
 const location=new URL(begin.headers.get('location'));
 const state=location.searchParams.get('state'),nonce=location.searchParams.get('nonce');
 const flow=begin.headers.get('set-cookie').split(';')[0];
 const callback=await finishGoogle(new Request(origin+'/auth/google/callback?code=code&state='+state,{headers:{Cookie:flow}}),e,{
  exchange:async()=>Response.json({id_token:'test'}),
  verifyToken:async()=>({sub,email:'allowed@example.com',email_verified:true,nonce})
 });
 const cookie=callback.headers.get('set-cookie').match(/__Host-para-session=[^;]+/)?.[0];
 assert.ok(cookie);return cookie;
}
const sessionRequest=cookie=>new Request(origin+'/',{headers:{Cookie:cookie}});
const logoutRequest=cookie=>new Request(origin+'/auth/logout',{method:'POST',headers:{Origin:origin,'X-Para-Request':'1',Cookie:cookie}});
test('logout revokes copied cookie persistently without revoking another session',async()=>{
 const store=createSessionDb(),e={...env,GOOGLE_SESSION_DB:store};
 const first=await loginForTest(e),second=await loginForTest(e),other=await loginForTest(e,'user-b');
 assert.notEqual(first,second);assert.equal((await verifyGoogleSession(sessionRequest(first),e)).id,'user-a');
 assert.equal((await logoutGoogle(logoutRequest(first),e)).status,200);
 await assert.rejects(verifyGoogleSession(sessionRequest(first),e));
 assert.equal((await verifyGoogleSession(sessionRequest(second),e)).id,'user-a');
 assert.equal((await verifyGoogleSession(sessionRequest(other),e)).id,'user-b');
 const relogin=await loginForTest(e);assert.equal((await verifyGoogleSession(sessionRequest(relogin),e)).id,'user-a');
});
test('old JWTs and expired, missing or mismatched stored sessions fail closed',async()=>{
 const store=createSessionDb(),e={...env,GOOGLE_SESSION_DB:store};
 const old=await new SignJWT({kind:'session',sub:'user-a',email:'allowed@example.com'}).setProtectedHeader({alg:'HS256'}).setIssuedAt().setExpirationTime('8h').sign(new TextEncoder().encode(e.GOOGLE_SESSION_SECRET));
 await assert.rejects(verifyGoogleSession(sessionRequest('__Host-para-session='+old),e));
 const cookie=await loginForTest(e);const row=[...store.rows.values()][0];row.expires_at=1;
 await assert.rejects(verifyGoogleSession(sessionRequest(cookie),e));
 row.expires_at=Math.floor(Date.now()/1000)+28800;row.subject='different';
 await assert.rejects(verifyGoogleSession(sessionRequest(cookie),e));
 store.rows.clear();await assert.rejects(verifyGoogleSession(sessionRequest(cookie),e));
});
test('session store absence and failures reject auth and never claim successful revocation',async()=>{
 const missing={...env,GOOGLE_SESSION_DB:undefined};
 assert.equal((await startGoogle(new Request(origin+'/auth/google/login'),missing)).status,503);
 const e={...env,GOOGLE_SESSION_DB:createSessionDb()},cookie=await loginForTest(e);
 const broken={...e,GOOGLE_SESSION_DB:{withSession(){throw Error('offline');}}};
 await assert.rejects(verifyGoogleSession(sessionRequest(cookie),broken));
 const response=await logoutGoogle(logoutRequest(cookie),broken);
 assert.equal(response.status,503);assert.equal(response.headers.get('set-cookie'),null);
 assert.equal((await verifyGoogleSession(sessionRequest(cookie),e)).id,'user-a');
 assert.equal((await logoutGoogle(logoutRequest(cookie),{...e,GOOGLE_SESSION_SECRET:undefined})).status,503);
 assert.equal((await logoutGoogle(logoutRequest(cookie),e)).status,200);
 assert.equal((await logoutGoogle(logoutRequest(cookie),e)).status,200);
 await assert.rejects(verifyGoogleSession(sessionRequest(cookie),e));
});
test('invalid logout cannot revoke a session, and expired signed tokens remain rejected',async()=>{
 const e={...env,GOOGLE_SESSION_DB:createSessionDb()},cookie=await loginForTest(e);
 const invalid=new Request(origin+'/auth/logout',{method:'POST',headers:{Origin:'https://evil.example','X-Para-Request':'1',Cookie:cookie}});
 assert.equal((await logoutGoogle(invalid,e)).status,403);
 assert.equal((await verifyGoogleSession(sessionRequest(cookie),e)).id,'user-a');
 const expired=await new SignJWT({kind:'session',sub:'user-a',email:'allowed@example.com',sid:'x'.repeat(43)})
  .setProtectedHeader({alg:'HS256'}).setIssuedAt().setExpirationTime(Math.floor(Date.now()/1000)-1)
  .sign(new TextEncoder().encode(e.GOOGLE_SESSION_SECRET));
 await assert.rejects(verifyGoogleSession(sessionRequest('__Host-para-session='+expired),e));
 assert.equal((await logoutGoogle(logoutRequest('__Host-para-session='+expired),e)).status,200);
});
test('failed session insert cannot issue an authenticated cookie',async()=>{
 const store=createSessionDb(),e={...env,GOOGLE_SESSION_DB:store};
 const begin=await startGoogle(new Request(origin+'/auth/google/login'),e),location=new URL(begin.headers.get('location'));
 const broken={...e,GOOGLE_SESSION_DB:{withSession(){return {prepare(){return {bind(){return {run:async()=>({success:false})};}};}};}}};
 const callback=await finishGoogle(new Request(origin+'/auth/google/callback?code=code&state='+location.searchParams.get('state'),{headers:{Cookie:begin.headers.get('set-cookie').split(';')[0]}}),broken,{
  exchange:async()=>Response.json({id_token:'test'}),verifyToken:async()=>({sub:'user-a',email:'allowed@example.com',email_verified:true,nonce:location.searchParams.get('nonce')})
 });
 assert.match(callback.headers.get('set-cookie'),/__Host-para-session=; Path=/);
 assert.equal(store.rows.size,0);
});
test('worker logout returns JSON success, rejects replay, and permits retry after a store error',async()=>{
 const store=createSessionDb(),e={...env,GOOGLE_SESSION_DB:store},cookie=await loginForTest(e),app=createWorker();
 const authReq=()=>new Request(origin+'/api/auth/me',{headers:{Cookie:cookie}});
 assert.equal((await app.fetch(authReq(),e)).status,200);
 const offline={...e,GOOGLE_SESSION_DB:{withSession(){throw Error('offline');}}};
 const failed=await app.fetch(logoutRequest(cookie),offline);
 assert.equal(failed.status,503);assert.equal(failed.headers.get('set-cookie'),null);
 const response=await app.fetch(logoutRequest(cookie),e);
 assert.equal(response.status,200);assert.equal(response.headers.get('location'),null);
 assert.deepEqual(await response.json(),{ok:true});assert.match(response.headers.get('set-cookie'),/Max-Age=0/);
 assert.equal((await app.fetch(authReq(),e)).status,401);
});
