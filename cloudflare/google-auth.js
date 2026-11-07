import { SignJWT, jwtVerify, createRemoteJWKSet } from 'jose';

const encoder = new TextEncoder();
const SESSION='__Host-para-session', FLOW='__Host-para-oauth';
const GOOGLE_AUTH='https://accounts.google.com/o/oauth2/v2/auth';
const GOOGLE_TOKEN='https://oauth2.googleapis.com/token';
const GOOGLE_KEYS=createRemoteJWKSet(new URL('https://www.googleapis.com/oauth2/v3/certs'));

function secret(env){
  if(typeof env.GOOGLE_SESSION_SECRET!=='string'||encoder.encode(env.GOOGLE_SESSION_SECRET).length<32)throw Error('AUTH_NOT_CONFIGURED');
  return encoder.encode(env.GOOGLE_SESSION_SECRET);
}
function configured(env,origin){
  if(typeof env.GOOGLE_OAUTH_CLIENT_ID!=='string'||!/^\d+-[a-z0-9-]+\.apps\.googleusercontent\.com$/.test(env.GOOGLE_OAUTH_CLIENT_ID))throw Error('AUTH_NOT_CONFIGURED');
  if(typeof env.GOOGLE_ALLOWED_EMAIL!=='string'||!env.GOOGLE_ALLOWED_EMAIL.includes('@'))throw Error('AUTH_NOT_CONFIGURED');
  if(typeof env.GOOGLE_REDIRECT_URI!=='string'||env.GOOGLE_REDIRECT_URI!==origin+'/auth/google/callback'||!origin.startsWith('https://'))throw Error('AUTH_NOT_CONFIGURED');
  secret(env);
}
function sessionDb(env){
  if(typeof env?.GOOGLE_SESSION_DB?.withSession!=='function')throw Error('SESSION_STORE_UNAVAILABLE');
  const session=env.GOOGLE_SESSION_DB.withSession('first-primary');
  if(typeof session?.prepare!=='function')throw Error('SESSION_STORE_UNAVAILABLE');
  return session;
}
async function sessionHash(id){
  if(typeof id!=='string'||!/^[A-Za-z0-9_-]{43}$/.test(id))throw Error('SESSION_INVALID');
  return Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',encoder.encode(id))),b=>b.toString(16).padStart(2,'0')).join('');
}
const random=()=>crypto.getRandomValues(new Uint8Array(32));
const base64url=bytes=>btoa(String.fromCharCode(...bytes)).replaceAll('+','-').replaceAll('/','_').replace(/=+$/,'');
async function challenge(verifier){return base64url(new Uint8Array(await crypto.subtle.digest('SHA-256',encoder.encode(verifier))));}
function cookie(name,value,maxAge){return name+'='+value+'; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age='+maxAge;}
function getCookie(request,name){
  const found=(request.headers.get('Cookie')||'').split(';').map(x=>x.trim()).find(x=>x.startsWith(name+'='));
  return found?.slice(name.length+1)||'';
}
const siteHeaders={'Cache-Control':'no-store','Referrer-Policy':'no-referrer','X-Content-Type-Options':'nosniff'};
const redirect=(url,cookies=[])=>{const h=new Headers({...siteHeaders,Location:url});for(const c of cookies)h.append('Set-Cookie',c);return new Response(null,{status:303,headers:h});};
const fail=(status=401)=>new Response('Google oturumu dogrulanamadi.',{status,headers:siteHeaders});
async function signed(data,env,expires){return new SignJWT(data).setProtectedHeader({alg:'HS256'}).setIssuedAt().setExpirationTime(expires).sign(secret(env));}
async function verified(token,env){if(!token||token.length>8192)throw Error('INVALID');return (await jwtVerify(token,secret(env),{algorithms:['HS256']})).payload;}

export async function startGoogle(request,env){
  const origin=new URL(request.url).origin;
  try{
    configured(env,origin);sessionDb(env);
    const state=base64url(random()),nonce=base64url(random()),verifier=base64url(random());
    const flow=await signed({kind:'flow',state,nonce,verifier,origin},env,'10m');
    const url=new URL(GOOGLE_AUTH);
    for(const [key,value] of Object.entries({client_id:env.GOOGLE_OAUTH_CLIENT_ID,redirect_uri:env.GOOGLE_REDIRECT_URI,response_type:'code',scope:'openid email profile',state,nonce,code_challenge:await challenge(verifier),code_challenge_method:'S256',prompt:'select_account'}))url.searchParams.set(key,value);
    return redirect(url.href,[cookie(FLOW,flow,600)]);
  }catch{return fail(503);}
}
export async function finishGoogle(request,env,{exchange=fetch,verifyToken}={}){
  const url=new URL(request.url),origin=url.origin,clear=cookie(FLOW,'',0);
  if(url.searchParams.has('error')||!url.searchParams.get('code')||!url.searchParams.get('state'))return redirect('/',[clear]);
  try{
    configured(env,origin);
    const flow=await verified(getCookie(request,FLOW),env);
    if(flow.kind!=='flow'||flow.state!==url.searchParams.get('state')||flow.origin!==origin)throw Error('FLOW_INVALID');
    const body=new URLSearchParams({grant_type:'authorization_code',code:url.searchParams.get('code'),client_id:env.GOOGLE_OAUTH_CLIENT_ID,redirect_uri:env.GOOGLE_REDIRECT_URI,code_verifier:flow.verifier});
    if(env.GOOGLE_OAUTH_CLIENT_SECRET)body.set('client_secret',env.GOOGLE_OAUTH_CLIENT_SECRET);
    const response=await exchange(GOOGLE_TOKEN,{method:'POST',headers:{'Content-Type':'application/x-www-form-urlencoded'},body,signal:AbortSignal.timeout(10000)});
    if(!response.ok)throw Error('TOKEN_EXCHANGE_FAILED');
    const data=await response.json();
    if(typeof data.id_token!=='string'||data.id_token.length>16000)throw Error('TOKEN_MISSING');
    const claims=verifyToken?await verifyToken(data.id_token,env): (await jwtVerify(data.id_token,GOOGLE_KEYS,{issuer:['https://accounts.google.com','accounts.google.com'],audience:env.GOOGLE_OAUTH_CLIENT_ID,algorithms:['RS256'],requiredClaims:['sub','exp','iat','nonce']})).payload;
    if(!claims.sub||claims.nonce!==flow.nonce||claims.email_verified!==true||typeof claims.email!=='string'||claims.email.toLowerCase()!==env.GOOGLE_ALLOWED_EMAIL.trim().toLowerCase())throw Error('ACCOUNT_DENIED');
    const sid=base64url(random()), expires=Math.floor(Date.now()/1000)+28800;
    const session=await signed({kind:'session',sub:claims.sub,email:claims.email,sid},env,expires);
    const result=await sessionDb(env).prepare('INSERT INTO google_web_sessions (session_hash, subject, expires_at) VALUES (?, ?, ?)')
      .bind(await sessionHash(sid),claims.sub,expires).run();
    if(result?.success!==true||result?.meta?.changes!==1)throw Error('SESSION_STORE_UNAVAILABLE');
    return redirect('/',[clear,cookie(SESSION,session,28800)]);
  }catch{return redirect('/',[clear,cookie(SESSION,'',0)]);}
}
export async function verifyGoogleSession(request,env){
  configured(env,new URL(request.url).origin);
  const payload=await verified(getCookie(request,SESSION),env);
  if(payload.kind!=='session'||typeof payload.sub!=='string'||!payload.sub||typeof payload.email!=='string'||payload.email.toLowerCase()!==env.GOOGLE_ALLOWED_EMAIL.trim().toLowerCase())throw Error('SESSION_INVALID');
  const row=await sessionDb(env).prepare('SELECT subject, expires_at FROM google_web_sessions WHERE session_hash = ?')
    .bind(await sessionHash(payload.sid)).first();
  if(!row||row.subject!==payload.sub||!Number.isSafeInteger(row.expires_at)||
    row.expires_at!==payload.exp||row.expires_at<=Math.floor(Date.now()/1000))throw Error('SESSION_INVALID');
  return {id:payload.sub,email:payload.email};
}
export async function logoutGoogle(request,env){
  const origin=new URL(request.url).origin;
  if(request.method!=='POST'||request.headers.get('Origin')!==origin||request.headers.get('X-Para-Request')!=='1')return fail(403);
  const clear=[cookie(SESSION,'',0),cookie(FLOW,'',0)];
  const success=()=>{const h=new Headers({...siteHeaders,'Content-Type':'application/json; charset=utf-8'});for(const c of clear)h.append('Set-Cookie',c);return new Response('{"ok":true}',{status:200,headers:h});};
  const token=getCookie(request,SESSION);
  if(!token)return success();
  try{secret(env);}catch{return new Response('Oturum iptali dogrulanamadi.',{status:503,headers:siteHeaders});}
  let payload;
  try{payload=await verified(token,env);}catch{return success();}
  if(payload.kind!=='session'||typeof payload.sid!=='string'||!/^[A-Za-z0-9_-]{43}$/.test(payload.sid))return success();
  try{
    const hash=await sessionHash(payload.sid);
    const result=await sessionDb(env).prepare('DELETE FROM google_web_sessions WHERE session_hash = ?').bind(hash).run();
    if(result?.success!==true)throw Error('SESSION_STORE_UNAVAILABLE');
    return success();
  }catch{
    return new Response('Oturum iptali dogrulanamadi.',{status:503,headers:siteHeaders});
  }
}
