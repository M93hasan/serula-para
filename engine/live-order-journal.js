import {DatabaseSync} from 'node:sqlite';
import {createHash} from 'node:crypto';
import {mkdirSync,chmodSync} from 'node:fs';
import {dirname} from 'node:path';
import {compareDecimal,canonicalDecimal,exchangeOrderId} from './order-rules.js';

const STATUSES=new Map([[-2,'PROCESSING'],[0,'NEW'],[1,'PARTIALLY_FILLED'],[2,'FILLED'],[3,'CANCELED'],[4,'PENDING_CANCEL'],[5,'REJECTED'],[6,'EXPIRED']]);
const CANCEL_PENDING=new Set(['CANCEL_REQUESTED','CANCEL_UNKNOWN']);
const TERMINAL=new Set(['FILLED','CANCELED','REJECTED','EXPIRED']);
export class LiveOrderJournal {
  constructor(path){
    if(typeof path!=='string'||!path)throw Error('INVALID_PATH');
    if(path!==':memory:')mkdirSync(dirname(path),{recursive:true,mode:0o700});
    this.db=new DatabaseSync(path);
    if(path!==':memory:')chmodSync(path,0o600);
    this.db.exec('PRAGMA busy_timeout=5000; PRAGMA journal_mode=WAL; PRAGMA synchronous=FULL; CREATE TABLE IF NOT EXISTS live_orders (client_id TEXT PRIMARY KEY, symbol TEXT NOT NULL, intent TEXT NOT NULL, status TEXT NOT NULL, order_id TEXT, filled TEXT NOT NULL DEFAULT \'0\', quote_filled TEXT NOT NULL DEFAULT \'0\', created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL); CREATE TABLE IF NOT EXISTS live_active_intents (fingerprint TEXT PRIMARY KEY, client_id TEXT NOT NULL UNIQUE); CREATE TABLE IF NOT EXISTS live_reconciliation_runs (id INTEGER PRIMARY KEY, trigger TEXT NOT NULL, status TEXT NOT NULL, started_at INTEGER NOT NULL, completed_at INTEGER NOT NULL, symbol_count INTEGER NOT NULL, exchange_open_count INTEGER NOT NULL, pending_count INTEGER NOT NULL, reason TEXT);');
    // Upgrade an existing development journal without discarding unresolved orders.
    const columns=this.db.prepare('PRAGMA table_info(live_orders)').all().map(c=>c.name);
    if(!columns.includes('created_at')){
      this.db.exec('ALTER TABLE live_orders ADD COLUMN created_at INTEGER NOT NULL DEFAULT 0;');
      this.db.exec('UPDATE live_orders SET created_at=updated_at WHERE created_at=0;');
    }
  }
  #transaction(fn){this.db.exec('BEGIN IMMEDIATE');try{const x=fn();this.db.exec('COMMIT');return x;}catch(e){this.db.exec('ROLLBACK');throw e;}}
  reserve(order,now=Date.now(),riskGuard=()=>{}){
    if(typeof riskGuard!=='function')throw Error('INVALID_RISK_GUARD');
    return this.#transaction(()=>{
      if(this.db.prepare('SELECT 1 FROM live_orders WHERE client_id=?').get(order.clientId))throw Error('DUPLICATE_CLIENT_ID');
      riskGuard();
      // The exchange does not enforce clientId uniqueness. Persist both id and
      // semantic active-intent fingerprint before any network send.
      const fingerprint=createHash('sha256').update(JSON.stringify([order.symbol,order.side,canonicalDecimal(order.quantity),canonicalDecimal(order.price)])).digest('hex');
      if(this.db.prepare('SELECT 1 FROM live_active_intents WHERE fingerprint=?').get(fingerprint))throw Error('DUPLICATE_ACTIVE_ORDER');
      this.db.prepare("INSERT INTO live_orders(client_id,symbol,intent,status,created_at,updated_at) VALUES(?, ?, ?, 'RESERVED', ?, ?)").run(order.clientId,order.symbol,JSON.stringify(order),now,now);
      this.db.prepare('INSERT INTO live_active_intents(fingerprint,client_id) VALUES(?,?)').run(fingerprint,order.clientId);
      return this.get(order.clientId);
    });
  }
  get(clientId){const x=this.db.prepare('SELECT * FROM live_orders WHERE client_id=?').get(clientId);return x?{clientId:x.client_id,symbol:x.symbol,intent:JSON.parse(x.intent),status:x.status,orderId:x.order_id,executedQty:x.filled,executedQuoteQty:x.quote_filled,createdAt:x.created_at,updatedAt:x.updated_at}:null;}
  setStatus(clientId,status,now=Date.now()){
    if(!['UNKNOWN','SUBMITTED','CANCEL_UNKNOWN'].includes(status))throw Error('INVALID_STATE');
    this.#transaction(()=>{
      const current=this.get(clientId);
      if(!current)throw Error('ORDER_NOT_FOUND');
      const expected=status==='CANCEL_UNKNOWN'?'CANCEL_REQUESTED':'RESERVED';
      if(current.status!==expected)return;
      this.db.prepare('UPDATE live_orders SET status=?,updated_at=? WHERE client_id=?').run(status,now,clientId);
    });
    return this.get(clientId);
  }
  acknowledge(clientId,rawOrderId,now=Date.now()){
    const orderId=exchangeOrderId(rawOrderId);
    return this.#transaction(()=>{
      const old=this.get(clientId);
      if(!old)throw Error('ORDER_NOT_FOUND');
      if(old.orderId&&old.orderId!==orderId)throw Error('INVALID_EXCHANGE_ORDER');
      this.db.prepare("UPDATE live_orders SET status='SUBMITTED',order_id=?,updated_at=? WHERE client_id=? AND status='RESERVED'").run(orderId,now,clientId);
      return this.get(clientId);
    });
  }
  beginCancel(clientId,now=Date.now()){
    return this.#transaction(()=>{
      const old=this.get(clientId);
      if(!old)throw Error('ORDER_NOT_FOUND');
      if(TERMINAL.has(old.status)||CANCEL_PENDING.has(old.status)||old.status==='PENDING_CANCEL'||!old.orderId)return false;
      this.db.prepare("UPDATE live_orders SET status='CANCEL_REQUESTED',updated_at=? WHERE client_id=?").run(now,clientId);
      return true;
    });
  }
  pending(){
    return this.db.prepare("SELECT client_id FROM live_orders WHERE status NOT IN ('FILLED','CANCELED','REJECTED','EXPIRED') ORDER BY created_at,client_id").all().map(row=>row.client_id);
  }
  observe(clientId,remote,now=Date.now()){
    return this.#transaction(()=>{
      const old=this.get(clientId);
      if(!old)throw Error('ORDER_NOT_FOUND');
      if(!remote||remote.clientId!==clientId||remote.symbol!==old.symbol||!STATUSES.has(remote.status))throw Error('INVALID_EXCHANGE_ORDER');
      const orderId=exchangeOrderId(remote.orderId);
      if((old.orderId&&old.orderId!==orderId)||remote.side!==(old.intent.side==='BUY'?0:1)||
         remote.type!==1||compareDecimal(String(remote.price),old.intent.price)!==0)throw Error('INVALID_EXCHANGE_ORDER');
      const filled=String(remote.executedQty),quoteFilled=String(remote.executedQuoteQty);
      const original=String(remote.origQty);
      if(compareDecimal(filled,'0')<0||compareDecimal(quoteFilled,'0')<0||compareDecimal(original,old.intent.quantity)!==0||
         compareDecimal(filled,old.executedQty)<0||compareDecimal(quoteFilled,old.executedQuoteQty)<0||compareDecimal(filled,original)>0)throw Error('INVALID_FILL_PROGRESS');
      let status=STATUSES.get(remote.status);
      if(status==='NEW'&&compareDecimal(filled,'0')>0)status='PARTIALLY_FILLED';
      if(status==='FILLED'&&compareDecimal(filled,original)!==0)throw Error('INVALID_FILL_PROGRESS');
      if(status==='PARTIALLY_FILLED'&&(compareDecimal(filled,'0')===0||compareDecimal(filled,original)>=0))throw Error('INVALID_FILL_PROGRESS');
      if((compareDecimal(filled,'0')===0)!==(compareDecimal(quoteFilled,'0')===0))throw Error('INVALID_FILL_PROGRESS');
      if(TERMINAL.has(old.status)&&old.status!==status)throw Error('TERMINAL_STATE_CONFLICT');
      if(!TERMINAL.has(status)&&CANCEL_PENDING.has(old.status))status=old.status;
      this.db.prepare('UPDATE live_orders SET status=?,order_id=?,filled=?,quote_filled=?,updated_at=? WHERE client_id=?').run(status,orderId,filled,quoteFilled,now,clientId);
      if(TERMINAL.has(status))this.db.prepare('DELETE FROM live_active_intents WHERE client_id=?').run(clientId);
      return this.get(clientId);
    });
  }
  recordReconciliation(run){
    if(!run||!['STARTUP','PERIODIC','MANUAL'].includes(run.trigger)||!['CLEAR','HALTED','FAILED'].includes(run.status)||
       !Number.isSafeInteger(run.startedAt)||!Number.isSafeInteger(run.completedAt)||run.completedAt<run.startedAt||
       ![run.symbolCount,run.exchangeOpenCount,run.pendingCount].every(x=>Number.isSafeInteger(x)&&x>=0)||
       run.reason!==undefined&&(typeof run.reason!=='string'||!/^[A-Z_]{2,64}$/.test(run.reason)))throw Error('INVALID_RECONCILIATION_RUN');
    this.db.prepare('INSERT INTO live_reconciliation_runs(trigger,status,started_at,completed_at,symbol_count,exchange_open_count,pending_count,reason) VALUES(?,?,?,?,?,?,?,?)')
      .run(run.trigger,run.status,run.startedAt,run.completedAt,run.symbolCount,run.exchangeOpenCount,run.pendingCount,run.reason||null);
  }
  reconciliationHistory(limit=50){
    if(!Number.isSafeInteger(limit)||limit<1||limit>200)throw Error('INVALID_LIMIT');
    return this.db.prepare('SELECT trigger,status,started_at AS startedAt,completed_at AS completedAt,symbol_count AS symbolCount,exchange_open_count AS exchangeOpenCount,pending_count AS pendingCount,reason FROM live_reconciliation_runs ORDER BY id DESC LIMIT ?').all(limit);
  }
  close(){this.db.close();}
}
