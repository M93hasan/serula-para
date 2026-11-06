// Local market-research scheduler. Never executes paper orders or real orders.
const STOP_STATES=new Set(['RATE_LIMIT','REGION_RESTRICTED','WAF_BLOCKED','unavailable']);
export class ScanAutomation {
  #scanner;#clock;#timer=null;#enabled=false;#lastCompletedAt=0;#lastError=null;
  #intervalMs;#pollMs;
  constructor(scanner,{clock=Date.now,intervalMs=30*60*1000,pollMs=15000}={}){
    this.#scanner=scanner;this.#clock=clock;this.#intervalMs=intervalMs;this.#pollMs=pollMs;
  }
  status(){return {enabled:this.#enabled,nextEligibleAt:this.#lastCompletedAt?this.#lastCompletedAt+this.#intervalMs:null,lastError:this.#lastError,scan:this.#scanner.status().status};}
  setEnabled(value){
    if(typeof value!=='boolean')throw Error('INVALID_AUTOMATION');
    if(!value){this.#enabled=false;if(this.#timer)clearInterval(this.#timer);this.#timer=null;this.#scanner.stop?.();return this.status();}
    if(this.#enabled)return this.status();
    const state=this.#scanner.status();
    if(STOP_STATES.has(state.status))throw Error('REQUIRES_MANUAL_REVIEW');
    this.#enabled=true;
    this.#timer=setInterval(()=>this.tick(),this.#pollMs);
    this.#timer.unref?.();
    this.tick();
    return this.status();
  }
  tick(){
    if(!this.#enabled)return;
    const scan=this.#scanner.status();
    if(STOP_STATES.has(scan.status)){
      this.#lastError=scan.status;
      this.setEnabled(false);
      return;
    }
    if(scan.status==='running')return;
    if(scan.status==='complete'&&scan.finishedAt>this.#lastCompletedAt)this.#lastCompletedAt=scan.finishedAt;
    if(this.#lastCompletedAt&&this.#clock()-this.#lastCompletedAt<this.#intervalMs)return;
    try{this.#scanner.start();this.#lastError=null;}
    catch(e){if(e?.message==='SCAN_BUSY')return;this.#lastError='SCAN_UNAVAILABLE';this.setEnabled(false);}
  }
  close(){this.setEnabled(false);}
}
