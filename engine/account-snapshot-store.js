// Read-only Binance TR account observation history. NOT realized trading P&L.
import { DatabaseSync } from 'node:sqlite';
import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';

export class AccountSnapshotStore {
  #db;#clock;
  constructor(path,{clock=Date.now}={}){
    this.#clock=clock;
    if(path!==':memory:')mkdirSync(dirname(path),{recursive:true,mode:0o700});
    this.#db=new DatabaseSync(path);
    this.#db.exec(`PRAGMA busy_timeout=5000; PRAGMA journal_mode=WAL;
      CREATE TABLE IF NOT EXISTS account_observations(
        id INTEGER PRIMARY KEY, observed_at INTEGER NOT NULL,
        estimated_try REAL, missing_assets TEXT NOT NULL,
        priced_assets INTEGER NOT NULL, asset_count INTEGER NOT NULL
      );
      CREATE INDEX IF NOT EXISTS observations_time ON account_observations(observed_at);`);
  }
  save({estimatedTry=null,missingAssets=[],pricedAssets=0,assetCount=0}){
    if(estimatedTry!==null&&(!Number.isFinite(estimatedTry)||estimatedTry<0))throw Error('INVALID_TOTAL');
    if(!Array.isArray(missingAssets)||missingAssets.length>5000||missingAssets.some(a=>typeof a!=='string'||!/^[A-Z0-9_]{1,32}$/.test(a)))throw Error('INVALID_ASSETS');
    if(!Number.isSafeInteger(pricedAssets)||pricedAssets<0||!Number.isSafeInteger(assetCount)||assetCount<0)throw Error('INVALID_ASSETS');
    const at=this.#clock();
    if(!Number.isSafeInteger(at)||at<0)throw Error('INVALID_TIME');
    this.#db.prepare('INSERT INTO account_observations(observed_at,estimated_try,missing_assets,priced_assets,asset_count) VALUES(?,?,?,?,?)').run(at,estimatedTry,JSON.stringify(missingAssets),pricedAssets,assetCount);
    return this.history();
  }
  history(){
    const rows=this.#db.prepare('SELECT observed_at AS time,estimated_try AS estimatedTry,missing_assets AS missingAssets,priced_assets AS pricedAssets,asset_count AS assetCount FROM account_observations ORDER BY observed_at DESC,id DESC LIMIT 200').all()
      .map(x=>({...x,missingAssets:JSON.parse(x.missingAssets),complete:x.estimatedTry!==null}));
    const latest=rows[0]||null;
    const yesterday=latest?rows.find(x=>x.time<=latest.time-24*3600000&&x.complete):null;
    const change24h=latest?.complete&&yesterday?.complete?latest.estimatedTry-yesterday.estimatedTry:null;
    return {latest,change24h,referenceTime:change24h===null?null:yesterday.time,history:rows.map(x=>({time:x.time,estimatedTry:x.estimatedTry,complete:x.complete,missingAssets:x.missingAssets})) ,notice:'Bu 24 saatlik değer farkı para giriş/çıkışları ve işlem maliyeti ayrıştırılmadığı için gerçek kâr/zarar değildir. Gerçekleşmiş işlem P&L için işlem ve maliyet geçmişi gereklidir. Eksik fiyatlarda toplam bilinmiyor.'};
  }
  close(){this.#db.close();}
}
