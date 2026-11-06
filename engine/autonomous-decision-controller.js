import {randomUUID} from 'node:crypto';

const SYMBOL=/^[A-Z0-9]{1,20}_TRY$/;

// Bounded autonomous proposal sessions. This controller deliberately exposes no
// submit/cancel method; execution always remains behind the separate live gates.
export class AutonomousDecisionController{
  #service;#journal;#approval;#clock;#symbols;
  constructor({service,journal,approval=()=>false,clock=Date.now,allowedSymbols=[]}={}){
    if(!service||!journal?.db||typeof approval!=='function'||typeof clock!=='function'||!Array.isArray(allowedSymbols)||
       allowedSymbols.length===0||allowedSymbols.some(x=>typeof x!=='string'||!SYMBOL.test(x))||
       new Set(allowedSymbols).size!==allowedSymbols.length)throw Error('INVALID_AUTONOMY_CONTROLLER');
    this.#service=service;this.#journal=journal;this.#approval=approval;this.#clock=clock;this.#symbols=new Set(allowedSymbols);
    journal.db.exec("CREATE TABLE IF NOT EXISTS live_autonomy_state (id INTEGER PRIMARY KEY CHECK(id=1),enabled INTEGER NOT NULL,session_id TEXT,expires_at INTEGER NOT NULL,remaining INTEGER NOT NULL,reason TEXT NOT NULL,updated_at INTEGER NOT NULL); INSERT OR IGNORE INTO live_autonomy_state VALUES(1,0,NULL,0,0,'STARTUP_LOCK',0); CREATE TABLE IF NOT EXISTS live_autonomy_audit (id INTEGER PRIMARY KEY,time INTEGER NOT NULL,session_id TEXT,symbol TEXT NOT NULL,action TEXT NOT NULL,reason TEXT NOT NULL,client_id TEXT);");
    journal.db.prepare("UPDATE live_autonomy_state SET enabled=0,session_id=NULL,expires_at=0,remaining=0,reason='STARTUP_LOCK',updated_at=? WHERE id=1").run(clock());
  }
  status(){
    const x=this.#journal.db.prepare('SELECT enabled,session_id,expires_at,remaining,reason,updated_at FROM live_autonomy_state WHERE id=1').get();
    return {enabled:!!x.enabled,sessionId:x.session_id,expiresAt:x.expires_at,remaining:x.remaining,reason:x.reason,updatedAt:x.updated_at,executionAuthorized:false};
  }
  arm({durationMs=300000,maxProposals=5}={}){
    if(!Number.isSafeInteger(durationMs)||durationMs<10000||durationMs>900000||!Number.isSafeInteger(maxProposals)||maxProposals<1||maxProposals>50||
       this.#approval({action:'arm-autonomous-proposals',durationMs,maxProposals})!==true)throw Error('AUTONOMY_LOCKED');
    const now=this.#clock(),sessionId=randomUUID();
    this.#journal.db.prepare("UPDATE live_autonomy_state SET enabled=1,session_id=?,expires_at=?,remaining=?,reason='OPERATOR_ARMED',updated_at=? WHERE id=1")
      .run(sessionId,now+durationMs,maxProposals,now);
    return this.status();
  }
  halt(reason='MANUAL_HALT'){
    this.#service.halt(reason);
    this.#journal.db.prepare('UPDATE live_autonomy_state SET enabled=0,remaining=0,reason=?,updated_at=? WHERE id=1').run(reason,this.#clock());
    return this.status();
  }
  #audit(sessionId,symbol,result){
    const reason=result.reason||'PROPOSAL_READY';
    this.#journal.db.prepare('INSERT INTO live_autonomy_audit(time,session_id,symbol,action,reason,client_id) VALUES(?,?,?,?,?,?)')
      .run(this.#clock(),sessionId,symbol,result.action,reason,result.order?.clientId||null);
  }
  async preview(request){
    const state=this.status(),now=this.#clock(),symbol=request?.symbol;
    const hold=reason=>({action:'BEKLE',reason,executionAuthorized:false});
    if(typeof symbol!=='string'||!this.#symbols.has(symbol)){const result=hold('SYMBOL_NOT_ALLOWED');this.#audit(state.sessionId,symbol||'INVALID',result);return result;}
    if(!state.enabled||state.expiresAt<=now||state.remaining<=0){
      if(state.enabled)this.#journal.db.prepare("UPDATE live_autonomy_state SET enabled=0,remaining=0,reason='SESSION_EXPIRED',updated_at=? WHERE id=1").run(now);
      const result=hold('AUTONOMY_LOCKED');this.#audit(state.sessionId,symbol,result);return result;
    }
    const claim=this.#journal.db.prepare('UPDATE live_autonomy_state SET remaining=remaining-1,updated_at=? WHERE id=1 AND enabled=1 AND expires_at>? AND remaining>0').run(now,now);
    if(claim.changes!==1){const result=hold('AUTONOMY_LOCKED');this.#audit(state.sessionId,symbol,result);return result;}
    let result;
    try{result=await this.#service.previewSignal(request);}
    catch{this.halt('AUTONOMY_FAILURE');result=hold('AUTONOMY_FAILURE');}
    result={...result,executionAuthorized:false};
    this.#audit(state.sessionId,symbol,result);
    return result;
  }
  audit(limit=100){
    if(!Number.isSafeInteger(limit)||limit<1||limit>500)throw Error('INVALID_LIMIT');
    return this.#journal.db.prepare('SELECT time,session_id AS sessionId,symbol,action,reason,client_id AS clientId FROM live_autonomy_audit ORDER BY id DESC LIMIT ?').all(limit);
  }
}
