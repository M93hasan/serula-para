import {createHash, randomInt, timingSafeEqual} from 'node:crypto';
import {SESSION_TTL_MS,sessionCookie} from './local-session-store.js';

const digest = text => createHash('sha256').update(text).digest();
const jsonHeaders = {'Content-Type':'application/json','Cache-Control':'no-store'};
const ORIGIN='http://127.0.0.1:8788';
function validMutation(request) {
  return request.method === 'POST' &&
    request.headers.get('origin') === ORIGIN &&
    request.headers.get('sec-fetch-site') === 'same-origin' &&
    request.headers.get('content-type') === 'application/json' &&
    request.headers.get('x-para-request') === '1';
}
async function payload(request) {
  const text=await request.text();
  if(Buffer.byteLength(text)>1024)throw Error('SIZE');
  const data=JSON.parse(text);
  if(!data||Array.isArray(data)||typeof data!=='object')throw Error('DATA');
  return data;
}
export function createLocalEmailAuth({allowedEmail='',resendKey='',fromEmail='',sessionStore,
  clock=Date.now,sendMail,fetchImpl=fetch}={}) {
  const configured=/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(allowedEmail) &&
    (typeof sendMail==='function' || Boolean(resendKey && fromEmail)) && Boolean(sessionStore);
  const pending=new Map(),limits=new Map();
  async function send(to,code) {
    if(sendMail)return sendMail(to,code);
    const response=await fetchImpl('https://api.resend.com/emails',{
      method:'POST',redirect:'error',
      headers:{Authorization:`Bearer ${resendKey}`,'Content-Type':'application/json'},
      body:JSON.stringify({from:fromEmail,to:[to],subject:'PARA giriş kodu',
        text:`PARA tek kullanımlık giriş kodunuz: ${code}. Kod 5 dakika geçerlidir. Bu isteği siz yapmadıysanız kodu paylaşmayın.`}),
      signal:AbortSignal.timeout(10000)
    });
    if(!response.ok)throw Error('MAIL_DELIVERY_FAILED');
  }
  async function handle(path,request) {
    if(path==='/auth/email/status')return new Response(JSON.stringify({configured}),{headers:jsonHeaders});
    if(!['/auth/email/start','/auth/email/verify'].includes(path))return null;
    if(!validMutation(request))return new Response(JSON.stringify({error:'forbidden'}),{status:403,headers:jsonHeaders});
    if(!configured)return new Response(JSON.stringify({error:'email-not-configured'}),{status:503,headers:jsonHeaders});
    let data;
    try{data=await payload(request);}catch{return new Response(JSON.stringify({error:'invalid-request'}),{status:400,headers:jsonHeaders});}
    const email=typeof data.email==='string'?data.email.trim().toLowerCase():'';
    if(email.length>254||!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email))return new Response(JSON.stringify({error:'invalid-email'}),{status:400,headers:jsonHeaders});
    const key=email,now=clock();
    // Fixed response for unauthorized emails; no account discovery.
    if(path==='/auth/email/start'){
      const attempts=limits.get(key)||[];
      const recent=attempts.filter(t=>now-t<15*60*1000);
      if(recent.length>=3)return new Response(JSON.stringify({error:'rate-limited'}),{status:429,headers:jsonHeaders});
      recent.push(now);limits.set(key,recent);
      if(email===allowedEmail.toLowerCase()) {
        const code=String(randomInt(0,1000000)).padStart(6,'0');
        pending.set(key,{hash:digest(code),expires:now+5*60*1000,tries:0});
        try{await send(email,code);}catch{pending.delete(key);return new Response(JSON.stringify({error:'delivery-unavailable'}),{status:503,headers:jsonHeaders});}
      }
      return new Response(JSON.stringify({ok:true}),{headers:jsonHeaders});
    }
    if(typeof data.code!=='string'||!/^[0-9]{6}$/.test(data.code))
      return new Response(JSON.stringify({error:'invalid-code'}),{status:400,headers:jsonHeaders});
    const item=pending.get(key);
    if(!item||email!==allowedEmail.toLowerCase()||item.expires<=now||item.tries>=5)
      return new Response(JSON.stringify({error:'invalid-code'}),{status:401,headers:jsonHeaders});
    item.tries++;
    if(!timingSafeEqual(item.hash,digest(data.code))){
      if(item.tries>=5)pending.delete(key);
      return new Response(JSON.stringify({error:'invalid-code'}),{status:401,headers:jsonHeaders});
    }
    pending.delete(key);
    const token=sessionStore.create({id:'email:'+email,email,provider:'email'});
    return new Response(JSON.stringify({ok:true}),{headers:{...jsonHeaders,'Set-Cookie':sessionCookie(token,SESSION_TTL_MS/1000)}});
  }
  return {configured,handle,close(){pending.clear();limits.clear();}};
}
