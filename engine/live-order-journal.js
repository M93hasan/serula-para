import {DatabaseSync} from 'node:sqlite';
import {createHash} from 'node:crypto';
import {mkdirSync,chmodSync} from 'node:fs';
import {dirname} from 'node:path';
import {compareDecimal} from './order-rules.js';

const STATUSES=new Map([[-2,'PROCESSING'],[0,'NEW'],[1,'PARTIALLY_FILLED'],[2,'FILLED'],[3,'CANCELED'],[4,'PENDING_CANCEL'],[5,'REJECTED'],[6,'EXPIRED']]);
const TERMINAL=new Set(['FILLED','CANCELED','REJECTED','EXPIRED']);
export class LiveOrderJournal {
  constructor(path){
    if(typeof path!=='string'||!path)throw Error('INVALID_PATH');
    if(path!==':memory:')mkdirSync(dirname(path),{recursive:true,mode:0o700});
    this.db=new DatabaseSync(path);
    if(path!==':memory:')chmodSync(path,0o600);
    this.db.exec('PRAGMA busy_timeout=5000; PRAGMA journal_mode=WAL; PRAGMA synchronous=FULL; CREATE TABLE IF NOT EXISTS live_orders (client_id TEXT PRIMARY KEY, symbol TEXT NOT NULL, intent TEXT NOT NULL, status TEXT NOT NULL, order_id TEXT, filled TEXT NOT NULL DEFAULT \'0\', quote_filled TEXT NOT NULL DEFAULT \'0\', updated_at INTEGER NOT NULL); CREATE TABLE IF NOT EXISTS live_active_intents (fingerprint TEXT PRIMARY KEY, client_id TEXT NOT NULL UNIQUE);');
  }
  #transaction(fn){this.db.exec('BEGIN IMMEDIATE');try{const x=fn();this.db.exec('COMMIT');return x;}catch(e){this.db.exec('ROLLBACK');throw e;}}
  reserve(order,now=Date.now()){
    return this.#transaction(()=>{
      if(this.db.prepare('SELECT 1 FROM live_orders WHERE client_id=?').get(order.clientId))throw Error('DUPLICATE_CLIENT_ID');
      // The exchange does not enforce clientId uniqueness. Persist both id and
      // semantic active-intent fingerprint before any network send.
      const fingerprint=createHash('sha256').update(JSON.stringify([order.symbol,order.side,order.quantity,order.price])).digest('hex');
      if(this.db.prepare('SELECT 1 FROM live_active_intents WHERE fingerprint=?').get(fingerprint))throw Error('DUPLICATE_ACTIVE_ORDER');
      this.db.prepare("INSERT INTO live_orders(client_id,symbol,intent,status,updated_at) VALUES(?, ?, ?, 'RESERVED', ?)").run(order.clientId,order.symbol,JSON.stringify(order),now);
      this.db.prepare('INSERT INTO live_active_intents(fingerprint,client_id) VALUES(?,?)').run(fingerprint,order.clientId);
      return this.get(order.clientId);
    });
  }
  get(clientId){const x=this.db.prepare('SELECT * FROM live_orders WHERE client_id=?').get(clientId);return x?{clientId:x.client_id,symbol:x.symbol,intent:JSON.parse(x.intent),status:x.status,orderId:x.order_id,executedQty:x.filled,executedQuoteQty:x.quote_filled,updatedAt:x.updated_at}:null;}
  setStatus(clientId,status,now=Date.now()){
    if(!['UNKNOWN','SUBMITTED','CANCEL_UNKNOWN','CANCEL_REQUESTED'].includes(status))throw Error('INVALID_STATE');
    this.#transaction(()=>{const x=this.get(clientId);if(!x)throw Error('ORDER_NOT_FOUND');if(TERMINAL.has(x.status))return;this.db.prepare('UPDATE live_orders SET status=?,updated_at=? WHERE client_id=?').run(status,now,clientId);});
    return this.get(clientId);
  }
  observe(clientId,remote,now=Date.now()){
    return this.#transaction(()=>{
      const old=this.get(clientId);
      if(!old)throw Error('ORDER_NOT_FOUND');
      if(!remote||remote.clientId!==clientId||remote.symbol!==old.symbol||!STATUSES.has(remote.status))throw Error('INVALID_EXCHANGE_ORDER');
      const filled=String(remote.executedQty),quoteFilled=String(remote.executedQuoteQty);
      const original=String(remote.origQty);
      if(compareDecimal(filled,'0')<0||compareDecimal(quoteFilled,'0')<0||compareDecimal(original,old.intent.quantity)!==0||
         compareDecimal(filled,old.executedQty)<0||compareDecimal(quoteFilled,old.executedQuoteQty)<0||compareDecimal(filled,original)>0)throw Error('INVALID_FILL_PROGRESS');
      let status=STATUSES.get(remote.status);
      if(status==='NEW'&&compareDecimal(filled,'0')>0)status='PARTIALLY_FILLED';
      if(status==='FILLED'&&compareDecimal(filled,original)!==0)throw Error('INVALID_FILL_PROGRESS');
      if(status==='PARTIALLY_FILLED'&&compareDecimal(filled,'0')===0)throw Error('INVALID_FILL_PROGRESS');
      if(TERMINAL.has(old.status)&&old.status!==status)throw Error('TERMINAL_STATE_CONFLICT');
      const orderId=remote.orderId==null?old.orderId:String(remote.orderId);
      this.db.prepare('UPDATE live_orders SET status=?,order_id=?,filled=?,quote_filled=?,updated_at=? WHERE client_id=?').run(status,orderId,filled,quoteFilled,now,clientId);
      if(TERMINAL.has(status))this.db.prepare('DELETE FROM live_active_intents WHERE client_id=?').run(clientId);
      return this.get(clientId);
    });
  }
  close(){this.db.close();}
}
