import {createHash} from 'node:crypto';
import {assertValidLimitOrder} from './order-rules.js';
import {decide} from './decision.js';

// Prepared workflow only: no live HTTP route, UI action, scheduler or CLI instantiates it.
// A separate independent security approval must be added before enabling any send/cancel.
export class LiveOrderService {
  #client;#journal;#loadInputs;#gate;#risk;#loadNews;#loadDecision;#clock;#scope;
  constructor({client,journal,loadInputs,gate=()=>false,risk=null,loadNews=null,loadDecision=null,clock=Date.now,openOrderSymbols=[]}={}){
    if(!client||!journal||typeof loadInputs!=='function'||typeof gate!=='function'||typeof clock!=='function'||!Array.isArray(openOrderSymbols)||
       (loadNews!==null&&typeof loadNews!=='function')||(loadDecision!==null&&typeof loadDecision!=='function'))throw Error('INVALID_SERVICE');
    this.#client=client;this.#journal=journal;this.#loadInputs=loadInputs;this.#gate=gate;this.#risk=risk;this.#loadNews=loadNews;this.#loadDecision=loadDecision;this.#clock=clock;this.#scope=[...openOrderSymbols];
  }
  async submit(order){
    if(this.#gate({action:'place',order})!==true)throw Error('LIVE_ORDERS_DISABLED');
    if(!this.#risk)throw Error('LIVE_RISK_NOT_CONFIGURED');
    if(this.#risk.status().halted)throw Error('HALTED');
    if(!this.#scope.includes(order?.symbol))throw Error('INVALID_ORDER_SCOPE');
    if(this.#journal.get(order.clientId))throw Error('DUPLICATE_CLIENT_ID');
    const open=await this.checkOpenOrders(this.#scope);
    if(!open.clear)throw Error('UNRESOLVED_ORDERS');
    // Only trusted server-side providers may supply the portfolio/risk snapshot.
    let inputs;
    try{inputs=await this.#loadInputs(order.symbol);}
    catch(e){this.#risk.halt('CONNECTION_FAILURE');throw e;}
    let validated;
    try{
      validated=assertValidLimitOrder({...inputs,order});
      this.#risk.reserve(validated,inputs.riskContext);
    }catch(e){
      if(['STALE_PRICE','PRICE_DEVIATION','RISK_DATA_UNAVAILABLE','RISK_DATA_INCONSISTENT'].includes(e.message))this.#risk.halt('ABNORMAL_MARKET');
      throw e;
    }
    // Intent and risk reservation are committed BEFORE any network write.
    try{
      const result=await this.#client.placeLimit(validated);
      this.#journal.acknowledge(order.clientId,result?.orderId);
    }catch{
      try{this.#journal.setStatus(order.clientId,'UNKNOWN');}
      finally{this.#risk.halt('ORDER_OUTCOME_UNKNOWN');}
    }
    // Both accepted and timed-out outcomes are verified via GET by clientId.
    return this.reconcile(order.clientId);
  }
  async reconcile(clientId){
    const existing=this.#journal.get(clientId);
    if(!existing)throw Error('ORDER_NOT_FOUND');
    try{
      return this.#journal.observe(clientId,await this.#client.detail(clientId,existing.orderId));
    }catch{
      // Never interpret transport failure or an invalid exchange state as rejection.
      this.#risk?.halt('RECONCILIATION_FAILURE');
      return this.#journal.get(clientId);
    }
  }
  async cancel(clientId){
    if(this.#gate({action:'cancel',clientId})!==true)throw Error('LIVE_ORDERS_DISABLED');
    const existing=this.#journal.get(clientId);
    if(!existing)throw Error('ORDER_NOT_FOUND');
    if(['CANCELED','FILLED','REJECTED','EXPIRED'].includes(existing.status))return existing;
    if(!this.#journal.beginCancel(clientId))return this.reconcile(clientId);
    try{await this.#client.cancel(clientId,existing.orderId);}catch{
      try{this.#journal.setStatus(clientId,'CANCEL_UNKNOWN');}
      finally{this.#risk?.halt('CANCEL_OUTCOME_UNKNOWN');}
    }
    // Cancellation acknowledgement is NOT proof there were no partial fills.
    return this.reconcile(clientId);
  }
  // Produces a proposal only. A confirmed order still needs an independent write gate and reservation.
  async previewSignal({symbol,quantity,price}={}){
    const hold=reason=>({action:'BEKLE',reason,executionAuthorized:false});
    if(!this.#risk||this.#risk.status().halted)return hold('HALTED');
    if(!this.#scope.includes(symbol))return hold('INVALID_ORDER_SCOPE');
    try{
      const check=await this.checkOpenOrders(this.#scope);
      if(!check.clear)return hold('UNRESOLVED_ORDERS');
      const inputs=await this.#loadInputs(symbol);
      const status=this.#risk.monitor(inputs.riskContext);
      if(status.halted)return hold(status.reason);
      const candles=inputs.market?.candles;
      const latest=candles?.at(-1)?.closeTime;
      const now=this.#clock();
      if(!Number.isSafeInteger(now)||!Array.isArray(candles)||candles.length<20||
         candles.slice(-20).some((c,i,last)=>!Number.isFinite(c?.close)||c.close<=0||
          !Number.isSafeInteger(c.closeTime)||(i>0&&c.closeTime-last[i-1].closeTime!==3_600_000))||
         latest>=now||now-latest>3_600_000)return hold('STALE_SIGNAL');
      let action;
      if(this.#loadDecision){
        let decision;
        try{decision=await this.#loadDecision({symbol,candles:structuredClone(candles)});}
        catch{this.#risk.halt('AI_DATA_UNAVAILABLE');return hold('AI_DATA_UNAVAILABLE');}
        const decisionTime=this.#clock();
        if(!decision||decision.source!=='verified-ai-decision'||decision.symbol!==symbol||decision.dataComplete!==true||
           !['AL','SAT','BEKLE'].includes(decision.action)||!Number.isSafeInteger(decision.asOf)||
           decision.asOf>decisionTime||decisionTime-decision.asOf>15000||!Number.isSafeInteger(decision.expiresAt)||
           decision.expiresAt<=decisionTime||decision.expiresAt>decisionTime+60000){
          this.#risk.halt('AI_DATA_UNAVAILABLE');return hold('AI_DATA_UNAVAILABLE');
        }
        action=decision.action;
      }else ({action}=decide(symbol,candles));
      if(action==='BEKLE')return hold('NO_TRADE_SIGNAL');
      const news=(await this.#loadNews?.(symbol))?.evidence;
      const checkedAt=this.#clock();
      if(news?.verified!==true||news.symbol!==symbol||!Number.isSafeInteger(news.expiresAt)||
         news.expiresAt<=checkedAt)return hold('NEWS_UNVERIFIED');
      const id=createHash('sha256').update(JSON.stringify([symbol,latest])).digest('hex');
      const order=assertValidLimitOrder({...inputs,now:checkedAt,order:{
        symbol,quantity,price,side:action==='AL'?'BUY':'SELL',clientId:'para_'+id,
      }});
      this.#risk.preview(order,inputs.riskContext);
      return {action,order,executionAuthorized:false};
    }catch(error){
      return hold(/^[A-Z_]{2,64}$/.test(error?.message)?error.message:'PREFLIGHT_FAILED');
    }
  }
  // Read-only preflight for an explicit scope. Binance TR requires a symbol on every list request.
  async checkOpenOrders(symbols){
    if(!Array.isArray(symbols)||!symbols.length||symbols.length>1000||
       symbols.some(symbol=>typeof symbol!=='string'||!/^[A-Z0-9]{1,20}_[A-Z0-9]{1,20}$/.test(symbol))||
       new Set(symbols).size!==symbols.length)throw Error('INVALID_ORDER_SCOPE');
    const scope=[...symbols];
    const openOrders=[];
    try{
      // Reconcile recorded orders even after a HALT. This path performs no POST.
      await this.reconcilePending();
      for(const symbol of scope){
        const orders=await this.#client.openOrders(symbol);
        openOrders.push(...orders);
      }
    }catch(error){
      this.#risk?.halt('OPEN_ORDER_CHECK_FAILED');
      throw error;
    }
    const pending=this.#journal.pending();
    const clear=openOrders.length===0&&pending.length===0;
    if(!clear)this.#risk?.halt('UNRESOLVED_ORDERS');
    return {symbols:scope,openOrders,pending,clear};
  }
  // Read-only restart/HALT reconciliation for orders already in this journal.
  async reconcilePending(){
    const results=[];
    for(const clientId of this.#journal.pending())results.push(await this.reconcile(clientId));
    return results;
  }
  // HALT itself never writes. This explicit containment path can only request
  // cancellation through two independent write gates and never liquidates.
  async containHalt({reason='MANUAL_HALT',symbols=this.#scope}={}){
    if(!this.#risk)throw Error('LIVE_RISK_NOT_CONFIGURED');
    this.#risk.halt(reason);
    let check;
    try{check=await this.checkOpenOrders(symbols);}
    catch{return {halted:true,reason,cancelRequested:[],cancelUnknown:[],retained:[],complete:false};}
    this.#risk.halt(reason);
    const cancelRequested=[],cancelUnknown=[],retained=[];
    for(const order of check.openOrders){
      if(this.#gate({action:'emergency-cancel',order,reason})!==true){retained.push(order);continue;}
      // External exchange orders have no local clientId. Claim the cancellation
      // durably before the only permitted POST; never retry an unknown outcome,
      // including after a restart or a second HALT request.
      let claimed;
      try{
        claimed=this.#journal.claimExternalCancel({symbol:order.symbol,orderId:order.orderId},this.#clock());
      }catch{
        this.#risk.halt('CANCEL_OUTCOME_UNKNOWN');retained.push(order);continue;
      }
      if(!claimed){retained.push(order);continue;}
      try{
        await this.#client.cancelByOrderId(order.orderId);
        this.#journal.acknowledgeExternalCancel({symbol:order.symbol,orderId:order.orderId});
        cancelRequested.push(order);
      }catch{
        cancelUnknown.push(order);
        this.#risk.halt('CANCEL_OUTCOME_UNKNOWN');
      }
    }
    return {halted:true,reason:this.#risk.status().reason,cancelRequested,cancelUnknown,retained,
      complete:check.openOrders.length===0};
  }
  halt(reason='MANUAL_HALT'){if(!this.#risk)throw Error('LIVE_RISK_NOT_CONFIGURED');return this.#risk.halt(reason);}
  get(clientId){return this.#journal.get(clientId);}
}
