import {DatabaseSync} from 'node:sqlite';
import {mkdirSync,chmodSync} from 'node:fs';
import {dirname} from 'node:path';
import {PaperPortfolio} from './paper-portfolio.js';

// A separate local-only database per portfolio. Replays use only fixed, allowlisted fields.
export class PaperStore {
  constructor(file,config){
    if(typeof file!=='string'||!file)throw Error('INVALID_PATH');
    if(file!==':memory:')mkdirSync(dirname(file),{recursive:true,mode:0o700});
    this.db=new DatabaseSync(file);
    try{
      if(file!==':memory:')chmodSync(file,0o600);
      this.db.exec('PRAGMA busy_timeout=5000; PRAGMA journal_mode=WAL; PRAGMA synchronous=FULL; CREATE TABLE IF NOT EXISTS paper_config (id INTEGER PRIMARY KEY CHECK(id=1), value TEXT NOT NULL); CREATE TABLE IF NOT EXISTS paper_events (id INTEGER PRIMARY KEY, kind TEXT NOT NULL, payload TEXT NOT NULL);');
      // Construct before storing; no arbitrary config/credential properties are persisted.
      this.config={feeBps:config.feeBps,slippageBps:config.slippageBps,quotes:config.quotes.map(q=>({asset:q.asset,budget:q.budget,maxTrade:q.maxTrade,maxExposure:q.maxExposure,maxAsset:q.maxAsset,maxLoss:q.maxLoss}))};new PaperPortfolio(this.config);
      this.#transaction(()=>{const stored=this.db.prepare('SELECT value FROM paper_config WHERE id=1').get();const value=JSON.stringify(this.config);if(stored&&stored.value!==value)throw Error('CONFIG_MISMATCH');if(!stored)this.db.prepare('INSERT INTO paper_config VALUES (1,?)').run(value);this.#replay();this.db.prepare('INSERT INTO paper_events(kind,payload) VALUES (?,?)').run('halt','{}');});
    }catch(e){this.db.close();throw e;}
  }
  #transaction(fn){this.db.exec('BEGIN IMMEDIATE');try{const result=fn();this.db.exec('COMMIT');return result;}catch(e){this.db.exec('ROLLBACK');throw e;}}
  #replay(){const ledger=new PaperPortfolio(this.config);for(const row of this.db.prepare('SELECT kind,payload FROM paper_events ORDER BY id').all()){const p=JSON.parse(row.payload);if(row.kind==='start')ledger.start();else if(row.kind==='halt')ledger.halt();else if(row.kind==='execute')ledger.execute(p.order,p.now);else throw Error('CORRUPT_PAPER_EVENTS');}return ledger;}
  #write(kind,payload,operation){return this.#transaction(()=>{const ledger=this.#replay(),result=operation(ledger);this.db.prepare('INSERT INTO paper_events(kind,payload) VALUES (?,?)').run(kind,JSON.stringify(payload));return result;});}
  start(){return this.#write('start',{},p=>p.start());}
  halt(){return this.#write('halt',{},p=>p.halt());}
  execute(input,now=Date.now()){
    const {id,action,symbol,baseAsset,quoteAsset,quantity,price,priceTime}=input||{};const order={id,action,symbol,baseAsset,quoteAsset,quantity,price,priceTime};
    return this.#write('execute',{order,now},p=>p.execute(order,now));
  }
  status(){return this.#transaction(()=>this.#replay().status());}
  value(prices,now=Date.now()){return this.#transaction(()=>this.#replay().value(prices,now));}
  close(){this.db.close();}
}
