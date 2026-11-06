import {sessionCookie} from './local-session-store.js';
import {randomBytes,createHash} from 'node:crypto';
import {createRemoteJWKSet,jwtVerify} from 'jose';

// Desktop-only OAuth: server binds 127.0.0.1, and no Google tokens are written to disk.
const GOOGLE_ISSUERS=['https://accounts.google.com','accounts.google.com'];
const SESSION_MS=8*60*60*1000;
const STATE_MS=5*60*1000;
const b64url=x=>Buffer.from(x).toString('base64url');
const random=()=>b64url(randomBytes(32));
const digest=x=>createHash('sha256').update(x).digest('base64url');
const cookieName='para_local_session';
const authHeaders={'Cache-Control':'no-store','Referrer-Policy':'no-referrer','X-Content-Type-Options':'nosniff'};
const safeEmail=x=>typeof x==='string'&&x.length<=254&&/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(x);
export function createLocalGoogleAuth({clientId='',clientSecret='',allowedEmail='',allowedSub='',fetchImpl=fetch,clock=Date.now,verifyIdentity,sessionStore=null}={}){
  const configured=typeof clientId==='string'&&/^[\w.-]+\.apps\.googleusercontent\.com$/.test(clientId)
    &&(safeEmail(allowedEmail)||typeof allowedSub==='string'&&allowedSub.length>=8&&allowedSub.length<=256);
  const pending=new Map(),sessions=new Map();
  const jwks=createRemoteJWKSet(new URL('https://www.googleapis.com/oauth2/v3/certs'));
  function cleanup(){const now=clock();for(const [key,val] of pending)if(val.expires<=now)pending.delete(key);for(const [key,val] of sessions)if(val.expires<=now)sessions.delete(key);}
  function user(cookie){
    if(!configured||typeof cookie!=='string'||cookie.length>4096)return null;
    const match=cookie.split(';').map(x=>x.trim()).find(x=>x.startsWith(cookieName+'='));
    if(!match)return null;
    const raw=match.slice(cookieName.length+1);
    if(!/^[A-Za-z0-9_-]{43}$/.test(raw))return null;
    cleanup();return sessionStore ? sessionStore.user(cookie) : sessions.get(digest(raw))||null;
  }
  async function verify(token,nonce){
    if(verifyIdentity)return verifyIdentity(token,nonce,clientId);
    const {payload}=await jwtVerify(token,jwks,{audience:clientId,issuer:GOOGLE_ISSUERS,algorithms:['RS256'],requiredClaims:['sub','exp','iat','nonce']});
    if(payload.nonce!==nonce||typeof payload.sub!=='string'||!payload.sub)throw Error('INVALID_IDENTITY');
    return payload;
  }
  const redirectUri='http://127.0.0.1:8788/auth/google/callback';
  async function handle(path,request){
    cleanup();
    if(path==='/auth/google/status')return new Response(JSON.stringify({configured,mode:'local',vaultUnlocked:false}),{headers:{...authHeaders,'Content-Type':'application/json'}});
    if(!configured)return new Response('Google OIDC is not configured on this Windows device.',{status:503,headers:authHeaders});
    if(path==='/auth/google/start'){
      if(request.method!=='GET')return new Response('',{status:405,headers:authHeaders});
      if(pending.size>=20)return new Response('',{status:429,headers:authHeaders});
      const state=random(),nonce=random(),verifier=random();
      pending.set(state,{nonce,verifier,expires:clock()+STATE_MS});
      const u=new URL('https://accounts.google.com/o/oauth2/v2/auth');
      for(const [k,v] of Object.entries({client_id:clientId,redirect_uri:redirectUri,response_type:'code',scope:'openid email',state,nonce,code_challenge:digest(verifier),code_challenge_method:'S256',prompt:'select_account'}))u.searchParams.set(k,v);
      return new Response(null,{status:302,headers:{...authHeaders,Location:u.toString()}});
    }
    if(path==='/auth/google/callback'){
      if(request.method!=='GET')return new Response('',{status:405,headers:authHeaders});
      const u=new URL(request.url),state=u.searchParams.get('state'),code=u.searchParams.get('code');
      const previous=state&&pending.get(state);
      if(state)pending.delete(state); // one-time state even on error
      if(!previous||previous.expires<=clock()||!code||code.length>4096||u.searchParams.has('error'))return new Response('Google sign-in failed. Retry from PARA.',{status:403,headers:authHeaders});
      try {
        const body=new URLSearchParams({client_id:clientId,code,code_verifier:previous.verifier,grant_type:'authorization_code',redirect_uri:redirectUri});
        if(clientSecret)body.set('client_secret',clientSecret);
        const response=await fetchImpl('https://oauth2.googleapis.com/token',{method:'POST',redirect:'error',headers:{'Content-Type':'application/x-www-form-urlencoded'},body,signal:AbortSignal.timeout(10000)});
        if(!response.ok)return new Response('Google token exchange failed.',{status:401,headers:authHeaders});
        const tokens=await response.json();if(typeof tokens.id_token!=='string'||tokens.id_token.length>16000)throw Error('MISSING_ID_TOKEN');
        const identity=await verify(tokens.id_token,previous.nonce);
        if(typeof identity.sub!=='string'||!identity.sub||identity.nonce!==previous.nonce)throw Error('INVALID_IDENTITY');
        if(allowedSub&&identity.sub!==allowedSub)throw Error('UNAUTHORIZED_ACCOUNT');
        if(allowedEmail&&(identity.email_verified!==true||typeof identity.email!=='string'||identity.email.toLowerCase()!==allowedEmail.toLowerCase()))throw Error('UNAUTHORIZED_ACCOUNT');
        const session=sessionStore ? sessionStore.create({id:identity.sub,email:identity.email||null,provider:'google'}) : random();
        if(!sessionStore)sessions.set(digest(session),{id:identity.sub,email:identity.email||null,expires:clock()+SESSION_MS});
        return new Response(null,{status:303,headers:{...authHeaders,Location:'/', 'Set-Cookie':sessionCookie(session)}});
      }catch{return new Response('Google identity verification failed.',{status:401,headers:authHeaders});}
    }
    if(path==='/auth/google/logout'){
      if(request.method!=='POST'||request.headers.get('origin')!=='http://127.0.0.1:8788'||request.headers.get('sec-fetch-site')!=='same-origin'||request.headers.get('x-para-request')!=='1')return new Response('',{status:403,headers:authHeaders});
      const cookie=request.headers.get('cookie')||'',match=cookie.split(';').map(x=>x.trim()).find(x=>x.startsWith(cookieName+'='));
      if(sessionStore)sessionStore.revoke(cookie);
      else if(match)sessions.delete(digest(match.slice(cookieName.length+1)));
      return new Response(JSON.stringify({ok:true}),{headers:{...authHeaders,'Content-Type':'application/json','Set-Cookie':`${cookieName}=; HttpOnly; SameSite=Strict; Path=/; Max-Age=0`}});
    }
    return null;
  }
  return {configured,user,handle,close(){pending.clear();sessions.clear();}};
}
