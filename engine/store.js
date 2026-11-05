import { DatabaseSync } from 'node:sqlite';
import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';

export class RiskStore {
  constructor(file, limits) {
    if (file !== ':memory:') mkdirSync(dirname(file), { recursive: true, mode: 0o700 });
    this.db = new DatabaseSync(file);
    this.db.exec('PRAGMA busy_timeout=5000; PRAGMA journal_mode=WAL; PRAGMA synchronous=FULL; CREATE TABLE IF NOT EXISTS state (id INTEGER PRIMARY KEY CHECK(id=1), budget INTEGER NOT NULL, max_trade INTEGER NOT NULL, max_loss INTEGER NOT NULL, remaining INTEGER NOT NULL, halted INTEGER NOT NULL); CREATE TABLE IF NOT EXISTS events (id INTEGER PRIMARY KEY, time TEXT NOT NULL, type TEXT NOT NULL, amount INTEGER, loss INTEGER, remaining INTEGER NOT NULL);');
    const {budget, maxTrade, maxLoss} = limits;
    if (![budget,maxTrade,maxLoss].every(x=>Number.isSafeInteger(x) && x>0) || maxTrade>budget || maxLoss>budget) throw new Error('Invalid limits');
    this.db.prepare('INSERT OR IGNORE INTO state VALUES (1,?,?,?,?,1)').run(budget,maxTrade,maxLoss,budget);
    // Restarts always fail closed; existing limits and losses are never reset.
    this.db.prepare('UPDATE state SET halted=1 WHERE id=1').run();
  }
  status() {
    const row=this.db.prepare('SELECT * FROM state WHERE id=1').get();
    return {mode:'simulation',realOrdersEnabled:false,halted:!!row.halted,budget:row.budget,budgetRemaining:row.remaining,maxTrade:row.max_trade,maxLoss:row.max_loss,journal:this.db.prepare('SELECT id,time,type,amount,loss,remaining FROM events ORDER BY id DESC LIMIT 100').all()};
  }
  #transact(fn) { this.db.exec('BEGIN IMMEDIATE'); try { const result=fn(); this.db.exec('COMMIT'); return result; } catch(e) { this.db.exec('ROLLBACK'); throw e; } }
  #event(type,amount,loss,remaining) { this.db.prepare('INSERT INTO events(time,type,amount,loss,remaining) VALUES(?,?,?,?,?)').run(new Date().toISOString(),type,amount,loss,remaining); }
  halt() { return this.#transact(()=>{const s=this.status(); this.db.prepare('UPDATE state SET halted=1 WHERE id=1').run(); this.#event('halt',null,null,s.budgetRemaining);}); }
  start() { return this.#transact(()=>{const s=this.status(); if(s.budget-s.budgetRemaining>=s.maxLoss) throw Error('Loss limit reached'); this.db.prepare('UPDATE state SET halted=0 WHERE id=1').run(); this.#event('start',null,null,s.budgetRemaining);}); }
  evaluate({amount,worstCaseLoss}) { return this.#transact(()=>{
    const s=this.status(); if(s.halted) throw Error('Emergency stop active');
    if(!Number.isSafeInteger(amount)||amount<=0||!Number.isSafeInteger(worstCaseLoss)||worstCaseLoss<0||worstCaseLoss>amount) throw Error('Invalid simulation');
    if(amount>s.maxTrade||amount>s.budgetRemaining||s.budget-s.budgetRemaining+worstCaseLoss>=s.maxLoss) throw Error('Risk limit');
    const remaining=s.budgetRemaining-worstCaseLoss; this.db.prepare('UPDATE state SET remaining=? WHERE id=1').run(remaining); this.#event('simulated',amount,worstCaseLoss,remaining); return {event:'simulated',amount,worstCaseLoss,remaining};
  }); }
  close(){this.db.close();}
}
