import {assertValidLimitOrder} from './order-rules.js';

// Prepared workflow only: no live HTTP route, UI action, scheduler or CLI instantiates it.
// A separate independent security approval must be added before enabling any send/cancel.
export class LiveOrderService {
  #client;#journal;#loadInputs;#gate;
  constructor({client,journal,loadInputs,gate=()=>false}={}){
    if(!client||!journal||typeof loadInputs!=='function'||typeof gate!=='function')throw Error('INVALID_SERVICE');
    this.#client=client;this.#journal=journal;this.#loadInputs=loadInputs;this.#gate=gate;
  }
  async submit(order){
    if(this.#gate({action:'place',order})!==true)throw Error('LIVE_ORDERS_DISABLED');
    // Reload trusted catalogue, account free balances and timestamped market quote.
    const inputs=await this.#loadInputs(order.symbol);
    const validated=assertValidLimitOrder({order,...inputs});
    // Record intent durably BEFORE the first network write; never auto-resend it.
    this.#journal.reserve(validated);
    try{
      const result=await this.#client.placeLimit(validated);
      if(!result?.orderId)throw Error('ACK_UNVERIFIED');
      this.#journal.setStatus(order.clientId,'SUBMITTED');
    }catch{
      this.#journal.setStatus(order.clientId,'UNKNOWN');
    }
    // Both accepted and timed-out outcomes are verified via GET by clientId.
    return this.reconcile(order.clientId);
  }
  async reconcile(clientId){
    const existing=this.#journal.get(clientId);
    if(!existing)throw Error('ORDER_NOT_FOUND');
    try{
      return this.#journal.observe(clientId,await this.#client.detail(clientId));
    }catch{
      // Unknown does not mean rejected. Never resend or release the reserved risk.
      return this.#journal.get(clientId);
    }
  }
  async cancel(clientId){
    if(this.#gate({action:'cancel',clientId})!==true)throw Error('LIVE_ORDERS_DISABLED');
    const existing=this.#journal.get(clientId);
    if(!existing)throw Error('ORDER_NOT_FOUND');
    if(['CANCELED','FILLED','REJECTED','EXPIRED'].includes(existing.status))return existing;
    if(['CANCEL_REQUESTED','CANCEL_UNKNOWN'].includes(existing.status))return this.reconcile(clientId);
    this.#journal.setStatus(clientId,'CANCEL_REQUESTED');
    try{await this.#client.cancel(clientId);}catch{this.#journal.setStatus(clientId,'CANCEL_UNKNOWN');}
    // Cancellation acknowledgement is NOT proof there were no partial fills.
    return this.reconcile(clientId);
  }
  get(clientId){return this.#journal.get(clientId);}
}
