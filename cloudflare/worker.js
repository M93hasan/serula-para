import { verifyAccess } from './access.js';
import { MarketData } from '../engine/market-data.js';
import { decide, selectMarket } from '../engine/decision.js';
import { backtest } from '../engine/backtest.js';
const headers={'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store','X-Content-Type-Options':'nosniff'};
const json=(data,status=200)=>new Response(JSON.stringify(data),{status,headers});
const loginPage=`<!doctype html><html lang="tr"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>PARA | Güvenli giriş</title><body style="background:#080808;color:#eee;font:16px system-ui;max-width:36rem;margin:12vh auto;padding:24px"><h1>PARA · Güvenli giriş</h1><p>Bu test sürümü Cloudflare Access ile kimlik doğrulaması gerektirir.</p><p>Google ile giriş, Cloudflare Access kimlik sağlayıcısı ve izin politikası etkinse kullanılabilir.</p><p><a style=\"color:#93c5fd\" href=\"/cdn-cgi/access/login\">Google ile giriş / Cloudflare Access</a></p><p>Giriş çalışmıyorsa proje yöneticisinin Google sağlayıcısını ve erişim iznini yapılandırması gerekir.</p><p>API anahtarınızı veya kasa parolanızı buraya girmeyin.</p></body></html>`;
async function boundedJson(request){const reader=request.body?.getReader();if(!reader)throw Error('INVALID');let chunks=[],size=0;try{while(true){const {done,value}=await reader.read();if(done)break;size+=value.byteLength;if(size>2048){await reader.cancel();throw Error('INVALID');}chunks.push(value);}const data=new Uint8Array(size);let offset=0;for(const chunk of chunks){data.set(chunk,offset);offset+=chunk.length;}return JSON.parse(new TextDecoder().decode(data));}finally{reader.releaseLock();}}
export function createWorker({ verify=verifyAccess, market=()=>new MarketData() }={}) { return {
 async fetch(request,env){
  const url=new URL(request.url);
  if(url.pathname==='/api/health')return json({status:'access-required',real_orders_enabled:false});
  let identity;try{identity=await verify(request.headers.get('Cf-Access-Jwt-Assertion'),env);}catch{
    if(url.pathname.startsWith('/api/'))return json({error:'AUTH_REQUIRED'},401);
    return new Response(loginPage,{status:401,headers:{'Content-Type':'text/html; charset=utf-8','Cache-Control':'no-store','X-Content-Type-Options':'nosniff','Content-Security-Policy':"default-src 'none'; style-src 'unsafe-inline'; frame-ancestors 'none'; base-uri 'none'"}});
  }
  if(url.pathname==='/api/auth/me'&&request.method==='GET')return json({authenticated:true});
  if(url.pathname==='/status'&&request.method==='GET')return json({mode:'web-research',realOrdersEnabled:false,halted:true});
  if(url.pathname==='/api/analysis'&&request.method==='POST'){
    if(request.headers.get('Origin')!==url.origin||request.headers.get('Sec-Fetch-Site')!=='same-origin'||request.headers.get('Content-Type')!=='application/json'||request.headers.get('X-Para-Request')!=='1')return json({error:'FORBIDDEN'},403);
    if(!env.ANALYSIS_LIMIT)return json({error:'SERVICE_NOT_CONFIGURED'},503);
    const rate=await env.ANALYSIS_LIMIT.limit({key:identity.id});if(!rate.success)return json({error:'RATE_LIMIT'},429);
    try{const input=await boundedJson(request);if(!input||!['BTC_TRY','ETH_TRY'].includes(input.symbol))return json({error:'INVALID_SYMBOL'},400);const config={budget:input.budget,maxTrade:input.maxTrade,maxLoss:input.maxLoss,feeRate:input.feeRate};backtest('TEST',[],config);
      const snapshot=await market().snapshot(),selected=snapshot.markets.find(x=>x.symbol===input.symbol);if(!selected)throw Error('Market unavailable');const auto=selectMarket(snapshot.markets);
      return json({asOf:snapshot.asOf,symbol:selected.symbol,price:selected.price,priceTime:selected.priceTime,decision:decide(selected.symbol,selected.candles),automaticDecision:decide(auto.symbol,auto.candles),markets:snapshot.markets,backtest:backtest(selected.symbol,selected.candles,config),candleCount:selected.candles.length});
    }catch(err){return json({error:err.message==='Invalid risk configuration'?'INVALID_RISK':'MARKET_UNAVAILABLE'},err.message==='Invalid risk configuration'?400:503);}
  }
  if(url.pathname.startsWith('/api/')||url.pathname==='/halt')return json({error:'WEB_BACKEND_UNAVAILABLE',message:'Bu özellik web sürümünde henüz kullanılabilir değil.'},503);
  if(request.method!=='GET'&&request.method!=='HEAD')return new Response('Method Not Allowed',{status:405,headers:{Allow:'GET, HEAD','Cache-Control':'no-store'}});
  const response=await env.ASSETS.fetch(request);const h=new Headers(response.headers);h.set('X-Content-Type-Options','nosniff');h.set('Referrer-Policy','no-referrer');h.set('X-Frame-Options','DENY');
  if(h.get('Content-Type')?.includes('text/html')){h.set('Cache-Control','no-store');h.set('Content-Security-Policy',"default-src 'self'; base-uri 'none'; object-src 'none'; frame-ancestors 'none'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; connect-src 'self'; font-src 'self' data:");}
  return new Response(response.body,{status:response.status,statusText:response.statusText,headers:h});
 }
}; }
export default createWorker();
