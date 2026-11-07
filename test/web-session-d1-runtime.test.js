import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,readFileSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {Miniflare} from 'miniflare';
import {startGoogle,finishGoogle,verifyGoogleSession,logoutGoogle} from '../cloudflare/google-auth.js';

const origin='https://staging.example.test';
const cookie=(response,name)=>response.headers.getSetCookie().find(value=>value.startsWith(name+'='))?.split(';')[0];
const options=path=>({resourcePersistencePath:path,workers:[{config:{
  name:'session-test',compatibilityDate:'2026-01-01',
  manifest:{mainModule:'index.mjs',modules:{'index.mjs':{type:'esm',contents:'export default {fetch(){return new Response("ok")}}'}}},
  env:{GOOGLE_SESSION_DB:{type:'d1',id:'para-session-test'}}
}}]});
const settings=db=>({GOOGLE_SESSION_DB:db,GOOGLE_SESSION_SECRET:'test-only-session-secret-32-bytes-long',
  GOOGLE_ALLOWED_EMAIL:'owner@example.test',GOOGLE_OAUTH_CLIENT_ID:'111111111111-test.apps.googleusercontent.com',
  GOOGLE_REDIRECT_URI:origin+'/auth/google/callback'});

test('Google web session persists in local workerd D1 and revocation survives a new runtime', {timeout:30000}, async t=>{
  const dir=mkdtempSync(join(tmpdir(),'para-d1-session-'));
  let runtime=new Miniflare(options(dir));
  t.after(async()=>{await runtime?.dispose();rmSync(dir,{recursive:true,force:true});});
  let db=await runtime.getD1Database('GOOGLE_SESSION_DB');
  const schema=readFileSync(new URL('../cloudflare/schema/google-web-sessions.sql',import.meta.url),'utf8');
  for(const statement of schema.replace(/^--.*$/gm,'').split(';').map(x=>x.trim()).filter(Boolean))await db.prepare(statement).run();
  let env=settings(db);
  const start=await startGoogle(new Request(origin+'/auth/google/login'),env);
  assert.equal(start.status,303);
  const oauth=new URL(start.headers.get('location'));
  const flow=cookie(start,'__Host-para-oauth');
  assert.ok(flow);
  const callback=new Request(origin+'/auth/google/callback?code=test-code&state='+encodeURIComponent(oauth.searchParams.get('state')),{headers:{Cookie:flow}});
  const finish=await finishGoogle(callback,env,{
    exchange:async()=>Response.json({id_token:'test-token'}),
    verifyToken:async()=>({sub:'test-subject',nonce:oauth.searchParams.get('nonce'),email:'owner@example.test',email_verified:true})
  });
  const session=cookie(finish,'__Host-para-session');
  assert.ok(session?.length>40);
  const request=new Request(origin+'/api/auth/me',{headers:{Cookie:session}});
  assert.equal((await verifyGoogleSession(request,env)).id,'test-subject');
  const row=await db.prepare('SELECT session_hash, subject FROM google_web_sessions').first();
  assert.equal(row.subject,'test-subject');assert.match(row.session_hash,/^[0-9a-f]{64}$/);
  assert.equal(session.includes(row.session_hash),false);
  await runtime.dispose();runtime=new Miniflare(options(dir));
  db=await runtime.getD1Database('GOOGLE_SESSION_DB');env=settings(db);
  assert.equal((await verifyGoogleSession(request,env)).id,'test-subject');
  const logout=await logoutGoogle(new Request(origin+'/auth/logout',{method:'POST',headers:{Cookie:session,Origin:origin,'X-Para-Request':'1'}}),env);
  assert.equal(logout.status,200);
  await assert.rejects(()=>verifyGoogleSession(request,env));
  await runtime.dispose();runtime=new Miniflare(options(dir));
  db=await runtime.getD1Database('GOOGLE_SESSION_DB');env=settings(db);
  await assert.rejects(()=>verifyGoogleSession(request,env));
  assert.equal(await db.prepare('SELECT session_hash FROM google_web_sessions').first(),null);
});
