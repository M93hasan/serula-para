import { existsSync, unlinkSync, writeFileSync, renameSync, mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import { randomBytes } from 'node:crypto';
import { seal, loadVault } from './vault.js';
import { BinanceTR } from './binance-tr.js';

const credential = x => typeof x === 'string' && x.length > 0 && x.length <= 512 && !/[\u0000-\u001f\u007f]/.test(x);
const decimal = x => typeof x === 'string' && /^\d{1,40}(?:\.\d{1,40})?$/.test(x);
export class AccountService {
  #path; #client; #busy = false;
  constructor({ path, client = new BinanceTR() }) { this.#path=path; this.#client=client; }
  exists() { return existsSync(this.#path); }
  #exclusive(fn) { if(this.#busy) throw Error('Busy'); this.#busy=true; try { return fn(); } finally { this.#busy=false; } }
  save({apiKey,secretKey,passphrase,replace=false}) { return this.#exclusive(()=>{
    if (!credential(apiKey)||!credential(secretKey)||typeof passphrase!=='string'||passphrase.length<16||passphrase.length>512||typeof replace!=='boolean') throw Error('Invalid input');
    const exists=this.exists(); if(exists!==replace) throw Error('Vault state changed');
    if(replace) loadVault(this.#path,passphrase); // verify before replacement
    const encrypted=seal({apiKey,secretKey},passphrase); mkdirSync(dirname(this.#path),{recursive:true,mode:0o700});
    if(!replace) {writeFileSync(this.#path,encrypted,{flag:'wx',mode:0o600});return;}
    const temporary=`${this.#path}.${randomBytes(16).toString('hex')}.tmp`;
    try {writeFileSync(temporary,encrypted,{flag:'wx',mode:0o600});renameSync(temporary,this.#path);} finally {try {unlinkSync(temporary);} catch(e) {if(e.code!=='ENOENT') throw e;}}
  }); }
  remove(passphrase) { return this.#exclusive(()=>{if(typeof passphrase!=='string'||passphrase.length>512) throw Error('Invalid input');loadVault(this.#path,passphrase);unlinkSync(this.#path);}); }
  async openOrders(passphrase,{symbol,limit=100}={}){
    if(typeof passphrase!=='string'||passphrase.length>512)throw Error('Invalid input');
    if(typeof symbol!=='string'||!/^[A-Z0-9]{1,20}_[A-Z0-9]{1,20}$/.test(symbol)
      ||!Number.isInteger(limit)||limit<1||limit>500)throw Error('INVALID_ORDER_QUERY');
    let keys;
    try{keys=loadVault(this.#path,passphrase);}catch{throw Error('VAULT_UNLOCK_FAILED');}
    let response;
    try{response=await this.#client.openOrders({...keys,symbol,limit});}
    catch{throw Error('EXCHANGE_READ_FAILED');}
    const orders=response?.data?.list;
    if(!Array.isArray(orders)||orders.length>=limit)throw Error('INCOMPLETE_ORDER_DATA');
    return orders.map(order=>{
      if(typeof order?.orderId!=='string' && !Number.isSafeInteger(order?.orderId))throw Error('INVALID_ORDER_DATA');
      if(order.symbol!==symbol||![0,1,2,3,4,5,6,7,8,9].includes(order.status))throw Error('INVALID_ORDER_DATA');
      if(typeof order.clientId!=='string'||order.clientId.length>128)throw Error('INVALID_ORDER_DATA');
      return {orderId:String(order.orderId),symbol:order.symbol,clientId:order.clientId,
        side:order.side,type:order.type,status:order.status,
        price:String(order.price),origQty:String(order.origQty),executedQty:String(order.executedQty),
        createTime:order.createTime};
    });
  }
  async balance(passphrase) {
    if(typeof passphrase!=='string'||passphrase.length>512) throw Error('Invalid input');
    let keys;try { keys=loadVault(this.#path,passphrase); } catch { throw Error('VAULT_UNLOCK_FAILED'); }
    let response;try { response=await this.#client.account(keys); } catch { throw Error('EXCHANGE_READ_FAILED'); }
    const assets=response?.data?.accountAssets;
    if (!Array.isArray(assets)||assets.length>5000) throw Error('Unexpected response');
    const seen=new Set();return assets.map(({asset,free,locked})=>{if(typeof asset!=='string'||!/^[-A-Za-z0-9_]{1,32}$/.test(asset)||seen.has(asset)||!decimal(free)||!decimal(locked))throw Error('Unexpected response');seen.add(asset);return {asset,free,locked};});
  }
}
