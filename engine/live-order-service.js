import {assertValidLimitOrder} from './order-rules.js';

// Prepared workflow only: no live HTTP route, UI action, scheduler or CLI instantiates it.
// A separate independent security approval must be added before enabling any send/cancel.
export class LiveOrderService {
  #client;#journal;#loadInputs;#gate;#risk;
  constructor({client,journal,loadInputs,gate=()=>false,risk=null}={}){
    if(!client||!journal||typeof loadInputs!=='function'||typeof gate!=='function')throw Error('INVALID_SERVICE');
    this.#client=client;this.#journal=journal;this.#loadInputs=loadInputs;this.#gate=gate;this.#risk=risk;
  }
  async submit(order){
    if(this.#gate({action:'place',order})!==true)throw Error('LIVE_ORDERS_DISABLED');
    if(!this.#risk)throw Error('LIVE_RISK_NOT_CONFIGURED');
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
      this.#journal.setStatus(order.clientId,'UNKNOWN');
      this.#risk.halt('ORDER_OUTCOME_UNKNOWN');
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
    try{await this.#client.cancel(clientId,existing.orderId);}catch{this.#journal.setStatus(clientId,'CANCEL_UNKNOWN');this.#risk?.halt('CANCEL_OUTCOME_UNKNOWN');}
    // Cancellation acknowledgement is NOT proof there were no partial fills.
    return this.reconcile(clientId);
  }
  // Read-only restart/HALT reconciliation for orders already in this journal.
  async reconcilePending(){
    const results=[];
    for(const clientId of this.#journal.pending())results.push(await this.reconcile(clientId));
    return results;
  }
  halt(reason='MANUAL_HALT'){if(!this.#risk)throw Error('LIVE_RISK_NOT_CONFIGURED');return this.#risk.halt(reason);}
  get(clientId){return this.#journal.get(clientId);}
}
