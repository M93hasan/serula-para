// Autonomous market *research* supervisor. No order execution methods or credentials.
// Restarts disabled, and every anomaly fails closed.
export class AutonomousResearch {
  #scanner;#analyst;#store;#paper;#clock;#timer=null;#enabled=false;#busy=false;#lastScan=0;#lastDecision=null;#haltReason=null;
  constructor({scanner,analyst,store,paper=null,clock=Date.now}){
    this.#scanner=scanner;this.#analyst=analyst;this.#store=store;this.#paper=paper;this.#clock=clock;
  }
  status(){return {enabled:this.#enabled,busy:this.#busy,haltReason:this.#haltReason,lastDecision:this.#lastDecision,lastScan:this.#lastScan,realOrdersEnabled:false};}
  setEnabled(enabled){
    if(typeof enabled!=='boolean')throw Error('INVALID_AUTO_MODE');
    if(!enabled){this.#enabled=false;if(this.#timer)clearInterval(this.#timer);this.#timer=null;return this.status();}
    if(this.#enabled)return this.status();
    if(this.#store.status().halted)throw Error('SIMULATION_HALTED');
    this.#haltReason=null;this.#enabled=true;
    this.#timer=setInterval(()=>{this.tick().catch(()=>this.#halt('AI_UNAVAILABLE'));},15000);
    this.#timer.unref?.();
    this.tick().catch(()=>this.#halt('AI_UNAVAILABLE'));
    return this.status();
  }
  #halt(reason){
    if(!this.#enabled&&this.#haltReason===reason)return;
    this.#haltReason=reason;this.setEnabled(false);
    const decision={time:this.#clock(),symbol:'SYSTEM',action:'BEKLE',risk:'BELİRSİZ',reason:'Otonom araştırma güvenli biçimde durduruldu: '+reason,source:'Autonomous research (no orders)',autoResearch:true,errorCode:reason};
    this.#lastDecision=decision;
    try{this.#store.saveAI(decision);}catch{}
    try{this.#store.halt();}catch{}
    try{this.#paper?.halt();}catch{}
  }
  async tick(){
    if(!this.#enabled||this.#busy)return;
    const state=this.#scanner.status();
    if(['RATE_LIMIT','REGION_RESTRICTED','unavailable','stopped'].includes(state.status)){this.#halt('SCAN_UNAVAILABLE');return;}
    if(state.status!=='complete'||!Number.isSafeInteger(state.finishedAt)||state.finishedAt<=this.#lastScan)return;
    this.#busy=true;this.#lastScan=state.finishedAt;
    try{
      const now=this.#clock();
      if(state.finishedAt>now+1000||now-state.finishedAt>300000)throw Error('STALE_SCAN');
      const ranked=state.results.filter(c=>c.status==='candidate'&&
        Number.isSafeInteger(c.asOf)&&now>=c.asOf&&now-c.asOf<=300000&&
        Number.isSafeInteger(c.priceTime)&&now>=c.priceTime&&now-c.priceTime<=300000&&
        Number.isFinite(c.price)&&c.price>0&&Array.isArray(c.candles)&&c.candles.length>=35&&
        Number.isFinite(c.indicators?.volume24)&&c.indicators.volume24>0&&
        Number.isFinite(c.indicators?.spread)&&c.indicators.spread>=0&&c.indicators.spread<=0.005&&
        Number.isFinite(c.indicators?.volatility)&&c.indicators.volatility<=0.08&&
        Number.isFinite(c.indicators?.depthQuote)&&c.indicators.depthQuote>0&&
        Number.isFinite(c.indicators?.estimatedRoundTripCost)&&c.indicators.estimatedRoundTripCost<=0.01);
      if(!ranked.length)throw Error('NO_SAFE_CANDIDATE');
      // Compare candidates only within the same quote currency.
      ranked.sort((a,b)=>a.symbol.localeCompare(b.symbol));
      const candidate=ranked[0];
      const result=await this.#analyst.analyze(candidate,{catalogApproved:true});
      if(!this.#enabled)return;
      if(result?.errorCode||!['AL','SAT','BEKLE'].includes(result?.action)||result.symbol!==candidate.symbol)throw Error('AI_UNAVAILABLE');
      // Research recommendations only. Missing independently verified news/risk blocks execution.
      const verified=result.newsVerified===true&&result.risk==='DÜŞÜK'&&result.action!=='BEKLE';
      const decision={...result,time:this.#clock(),action:verified?result.action:'BEKLE',proposedAction:candidate.researchSignal||'BEKLE',source:'Autonomous research (no orders)',autoResearch:true,reason:verified?result.reason:'Güncel veri/tarama doğrulandı ancak doğrulanmış haber, risk ve emir altyapısı eksik; BEKLE.',checks:{priceTime:candidate.priceTime,asOf:candidate.asOf,volume24:candidate.indicators.volume24,spread:candidate.indicators.spread,volatility:candidate.indicators.volatility,depthQuote:candidate.indicators.depthQuote}};
      this.#store.saveAI(decision);this.#lastDecision=decision;
    }catch(err){
      const reason=['STALE_SCAN','NO_SAFE_CANDIDATE','AI_UNAVAILABLE'].includes(err.message)?err.message:'AI_UNAVAILABLE';
      this.#halt(reason);
    }finally{this.#busy=false;}
  }
  close(){this.setEnabled(false);}
}
