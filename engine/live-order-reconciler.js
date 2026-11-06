const SYMBOL=/^[A-Z0-9]{1,20}_[A-Z0-9]{1,20}$/;

// Read-only startup and periodic reconciliation. This service never places or
// cancels an order; unresolved exchange state is contained by the risk HALT.
export class LiveOrderReconciler{
  #service;#journal;#loadSymbols;#risk;#clock;#intervalMs;#timer=null;#running=null;#last=null;
  constructor({service,journal,loadSymbols,risk,clock=Date.now,intervalMs=60000}={}){
    if(!service||!journal?.recordReconciliation||typeof loadSymbols!=='function'||!risk||typeof clock!=='function'||
       !Number.isSafeInteger(intervalMs)||intervalMs<5000||intervalMs>3600000)throw Error('INVALID_RECONCILER');
    this.#service=service;this.#journal=journal;this.#loadSymbols=loadSymbols;this.#risk=risk;this.#clock=clock;this.#intervalMs=intervalMs;
  }
  async start(){
    if(this.#timer)return this.#last;
    const result=await this.run('STARTUP');
    this.#timer=setInterval(()=>{void this.run('PERIODIC');},this.#intervalMs);
    this.#timer.unref?.();
    return result;
  }
  async run(trigger='MANUAL'){
    if(this.#running)return this.#running;
    this.#running=this.#run(trigger).finally(()=>{this.#running=null;});
    return this.#running;
  }
  async #run(trigger){
    const startedAt=this.#clock();
    let symbolCount=0;
    try{
      const symbols=await this.#loadSymbols();
      if(!Array.isArray(symbols)||symbols.length===0||symbols.length>1000||
         symbols.some(symbol=>typeof symbol!=='string'||!SYMBOL.test(symbol))||new Set(symbols).size!==symbols.length)
        throw Error('INCOMPLETE_SYMBOL_SCOPE');
      symbolCount=symbols.length;
      const result=await this.#service.checkOpenOrders(symbols);
      const status=result.clear?'CLEAR':'HALTED';
      this.#last={trigger,status,startedAt,completedAt:this.#clock(),symbolCount,
        exchangeOpenCount:result.openOrders.length,pendingCount:result.pending.length,clear:result.clear};
      this.#journal.recordReconciliation(this.#last);
      return this.#last;
    }catch(error){
      this.#risk.halt('RECONCILIATION_FAILURE');
      const reason=/^[A-Z_]{2,64}$/.test(error?.message)?error.message:'RECONCILIATION_FAILURE';
      this.#last={trigger,status:'FAILED',startedAt,completedAt:this.#clock(),symbolCount,
        exchangeOpenCount:0,pendingCount:this.#journal.pending().length,clear:false,reason};
      this.#journal.recordReconciliation(this.#last);
      return this.#last;
    }
  }
  status(){return this.#last?{...this.#last}:null;}
  stop(){if(this.#timer){clearInterval(this.#timer);this.#timer=null;}}
}
