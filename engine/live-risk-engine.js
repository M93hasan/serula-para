import {compareDecimal,canonicalDecimal} from './order-rules.js';

// Preliminary policy limits are deliberately conservative, in TRY. These are NOT
// consent to trade and must be reviewed against the user's verified account.
export const DEFAULT_LIVE_RISK_LIMITS=Object.freeze({
 maxOrderTry:'250',maxDailyLossTry:'75',maxTotalExposureTry:'500',
 maxAssetExposureTry:'200',maxDailyOrders:5,maxFeeBps:30,
 maxSpreadBps:60,maxSlippageBps:50,maxVolatilityBps:400,
 stopLossBps:300,maxQuoteAgeMs:30000,maxRiskStateAgeMs:10000
});
const validDecimal=x=>typeof x==='string'&&/^(?:0|[1-9]\d*)(?:\.\d{1,40})?$/.test(x);
const signedDecimal=x=>typeof x==='string'&&/^-?(?:0|[1-9]\\d*)(?:\\.\\d{1,40})?$/.test(x);
function addDecimals(a,b){
 const x=canonicalDecimal(a),y=canonicalDecimal(b),xs=x.split('.')[1]?.length||0,ys=y.split('.')[1]?.length||0,s=Math.max(xs,ys);
 const n=BigInt(x.replace('.',''))*10n**BigInt(s-xs)+BigInt(y.replace('.',''))*10n**BigInt(s-ys);
 return s?`${n/10n**BigInt(s)}.${(n%10n**BigInt(s)).toString().padStart(s,'0')}`:n.toString();
}
const safeInt=x=>Number.isSafeInteger(x)&&x>=0;
const bps=(value,limit)=>Number.isFinite(value)&&value>=0&&value<=limit;
const sameDay=(time,now)=>new Date(time).toISOString().slice(0,10)===new Date(now).toISOString().slice(0,10);
export class LiveRiskEngine{
 #journal;#limits;#clock;#approval;
 constructor({journal,limits=DEFAULT_LIVE_RISK_LIMITS,clock=Date.now,approval=()=>false}={}){
  if(!journal?.db||typeof clock!=='function'||typeof approval!=='function')throw Error('INVALID_RISK_ENGINE');
  for(const name of ['maxOrderTry','maxDailyLossTry','maxTotalExposureTry','maxAssetExposureTry'])
   if(!validDecimal(limits[name])||compareDecimal(limits[name],'0')<=0)throw Error('INVALID_RISK_LIMITS');
  for(const name of ['maxDailyOrders','maxFeeBps','maxSpreadBps','maxSlippageBps','maxVolatilityBps','stopLossBps','maxQuoteAgeMs','maxRiskStateAgeMs'])
   if(!safeInt(limits[name])||limits[name]===0)throw Error('INVALID_RISK_LIMITS');
  this.#journal=journal;this.#limits=Object.freeze({...limits});this.#clock=clock;this.#approval=approval;
  journal.db.exec("CREATE TABLE IF NOT EXISTS live_risk_state (id INTEGER PRIMARY KEY CHECK(id=1), halted INTEGER NOT NULL, reason TEXT NOT NULL, updated_at INTEGER NOT NULL); INSERT OR IGNORE INTO live_risk_state VALUES (1,1,'STARTUP_LOCK',0);");
  // Restart always requires a fresh independent authorization, never resumes trading.
  journal.db.prepare("UPDATE live_risk_state SET halted=1,reason='STARTUP_LOCK',updated_at=? WHERE id=1").run(this.#clock());
 }
 get limits(){return {...this.#limits};}
 status(){const x=this.#journal.db.prepare('SELECT * FROM live_risk_state WHERE id=1').get();return {halted:!!x.halted,reason:x.reason,updatedAt:x.updated_at,limits:this.limits};}
 halt(reason='MANUAL_HALT'){
  if(typeof reason!=='string'||!/^[A-Z_]{2,64}$/.test(reason))throw Error('INVALID_HALT_REASON');
  this.#journal.db.prepare('UPDATE live_risk_state SET halted=1,reason=?,updated_at=? WHERE id=1').run(reason,this.#clock());
  return this.status();
 }
 arm(context){
  // Independent approval cannot be supplied by order payload or HTTP flags.
  if(this.#approval({action:'arm'})!==true)throw Error('LIVE_RISK_LOCKED');
  this.#verify(context);
  if(this.#journal.db.prepare("SELECT 1 FROM live_orders WHERE status IN ('RESERVED','UNKNOWN','SUBMITTED','NEW','PARTIALLY_FILLED','PROCESSING','PENDING_CANCEL','CANCEL_UNKNOWN','CANCEL_REQUESTED') LIMIT 1").get())throw Error('UNRESOLVED_ORDERS');
  this.#journal.db.prepare("UPDATE live_risk_state SET halted=0,reason='OPERATOR_ARMED',updated_at=? WHERE id=1").run(this.#clock());
  return this.status();
 }
 #verify(context){
  const now=this.#clock();
  if(!Number.isSafeInteger(now)||!context||context.source!=='verified-exchange-risk-monitor'||context.connectionHealthy!==true||
   !Number.isSafeInteger(context.asOf)||context.asOf>now||now-context.asOf>this.#limits.maxRiskStateAgeMs)throw Error('RISK_DATA_UNAVAILABLE');
  const prices=context.positions;
  if(!Array.isArray(prices)||prices.length>100)throw Error('RISK_DATA_UNAVAILABLE');
  const assets=new Set();
  for(const p of prices){
   if(!p||typeof p.asset!=='string'||!/^[A-Z0-9]{1,20}$/.test(p.asset)||assets.has(p.asset)||
    !validDecimal(p.exposureTry)||!validDecimal(p.costBasisTry)||!Number.isSafeInteger(p.priceTime)||
    p.priceTime>now||now-p.priceTime>this.#limits.maxQuoteAgeMs)throw Error('RISK_DATA_UNAVAILABLE');
   assets.add(p.asset);
  }
  if(!validDecimal(context.totalExposureTry)||!signedDecimal(context.dayRealizedPnlTry)||
   !safeInt(context.dayTradeCount)||!Number.isSafeInteger(context.dayStartAt)||!sameDay(context.dayStartAt,now)||
   !bps(context.feeBps,this.#limits.maxFeeBps)||!bps(context.spreadBps,this.#limits.maxSpreadBps)||
   !bps(context.slippageBps,this.#limits.maxSlippageBps)||
   !bps(context.volatilityBps,this.#limits.maxVolatilityBps))throw Error('RISK_DATA_UNAVAILABLE');
  const aggregate=prices.reduce((sum,p)=>addDecimals(sum,p.exposureTry),'0');
  if(compareDecimal(aggregate,context.totalExposureTry)!==0)throw Error('RISK_DATA_INCONSISTENT');
  // Stop-loss breach is a HALT condition, not an authorization to market-sell.
  for(const p of prices){
   const cost=Number(p.costBasisTry),value=Number(p.exposureTry);
   if(cost>0&&value<cost*(1-this.#limits.stopLossBps/10000))throw Error('STOP_LOSS_TRIGGERED');
  }
  if(compareDecimal(context.totalExposureTry,this.#limits.maxTotalExposureTry)>0)throw Error('TOTAL_EXPOSURE_LIMIT');
  if(context.dayRealizedPnlTry.startsWith('-')&&compareDecimal(context.dayRealizedPnlTry.slice(1),this.#limits.maxDailyLossTry)>=0)throw Error('DAILY_LOSS_LIMIT');
  if(context.dayTradeCount>=this.#limits.maxDailyOrders)throw Error('DAILY_TRADE_COUNT');
  return context;
 }
 monitor(context){
  try{this.#verify(context);return this.status();}
  catch(e){this.halt(/^[A-Z_]+$/.test(e.message)?e.message:'RISK_DATA_UNAVAILABLE');return this.status();}
 }
 reserve(order,context){
  if(this.status().halted)throw Error('HALTED');
  try{
   this.#verify(context);
   if(!order||order.side!=='BUY'&&order.side!=='SELL'||!validDecimal(order.notional))throw Error('INVALID_ORDER');
   if(compareDecimal(order.notional,this.#limits.maxOrderTry)>0)throw Error('ORDER_LIMIT');
   // All the exposures are based on observed, externally verified positions.
   const asset=order.symbol.split('_')[0],current=context.positions.find(p=>p.asset===asset)?.exposureTry||'0';
   if(order.side==='BUY'&&
    (compareDecimal(addDecimals(context.totalExposureTry,order.notional),this.#limits.maxTotalExposureTry)>0||
     compareDecimal(addDecimals(current,order.notional),this.#limits.maxAssetExposureTry)>0))
    throw Error('POSITION_LIMIT');
   // Reserve atomically with local journal entry; holds remain across timeouts.
   return this.#journal.reserve(order,this.#clock(),()=>{
    if(this.status().halted)throw Error('HALTED');
    // Count all submitted attempts, including unknown/cancelled, to avoid rate-limit bypass.
    const date=new Date(this.#clock()).toISOString().slice(0,10);
    const count=this.#journal.db.prepare('SELECT count(*) AS n FROM live_orders WHERE created_at>=? AND created_at<?').get(Date.parse(date+'T00:00:00Z'),Date.parse(date+'T00:00:00Z')+86400000).n;
    if(Math.max(Number(count),context.dayTradeCount)>=this.#limits.maxDailyOrders)throw Error('DAILY_TRADE_COUNT');
    const pending=this.#journal.db.prepare("SELECT intent,status FROM live_orders WHERE status NOT IN ('FILLED','CANCELED','REJECTED','EXPIRED')").all();
    if(pending.length)throw Error('UNRESOLVED_ORDERS');
   });
  }catch(e){
   if(['RISK_DATA_UNAVAILABLE','RISK_DATA_INCONSISTENT','STOP_LOSS_TRIGGERED','DAILY_LOSS_LIMIT','TOTAL_EXPOSURE_LIMIT'].includes(e.message))this.halt(e.message);
   throw e;
  }
 }
}
