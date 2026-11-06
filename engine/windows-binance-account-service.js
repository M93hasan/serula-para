import {randomBytes} from 'node:crypto';
import {existsSync,readFileSync,writeFileSync,renameSync,unlinkSync,mkdirSync} from 'node:fs';
import {dirname} from 'node:path';
import {windowsDpapi} from './windows-ai-provider-vault.js';
import {loadVault} from './vault.js';
import {BinanceTR} from './binance-tr.js';

const credential = value => typeof value === 'string' && value.length > 0 && value.length <= 512 && !/[\u0000-\u001f\u007f]/.test(value);
const decimal = value => typeof value === 'string' && /^\d{1,40}(?:\.\d{1,40})?$/.test(value);

/**
 * Separate Windows CurrentUser-bound Binance vault. Never stores the DPAPI
 * unwrapped credentials, never uses a static encryption key or auto-imports v1.
 */
export class WindowsBinanceAccountService {
  #path; #client; #protect; #busy = false;
  constructor({path,client=new BinanceTR(),protector=windowsDpapi}={}) {
    if(typeof path !== 'string'||!path||typeof protector !== 'function')throw Error('INVALID');
    this.#path=path;this.#client=client;this.#protect=protector;
  }
  exists(){return existsSync(this.#path);}
  #exclusive(fn){if(this.#busy)throw Error('BUSY');this.#busy=true;try{return fn();}finally{this.#busy=false;}}
  #read(){
    let envelope;
    try{envelope=JSON.parse(readFileSync(this.#path,'utf8'));}catch{throw Error('VAULT_UNLOCK_FAILED');}
    if(envelope?.version!==2||envelope?.format!=='windows-dpapi-binance-tr'||
      typeof envelope.data!=='string'||envelope.data.length>16384)throw Error('VAULT_UNLOCK_FAILED');
    let keys;
    try{keys=JSON.parse(this.#protect({mode:'unprotect',value:envelope.data,principal:'local-desktop',provider:'binance-tr'}));}
    catch{throw Error('VAULT_UNLOCK_FAILED');}
    if(!credential(keys?.apiKey)||!credential(keys?.secretKey))throw Error('VAULT_UNLOCK_FAILED');
    return keys;
  }
  #write(keys,replace){
    if(!credential(keys?.apiKey)||!credential(keys?.secretKey)||typeof replace!=='boolean')throw Error('INVALID_INPUT');
    if(this.exists()!==replace)throw Error('Vault state changed');
    const data=this.#protect({mode:'protect',value:JSON.stringify({apiKey:keys.apiKey,secretKey:keys.secretKey}),principal:'local-desktop',provider:'binance-tr'});
    if(typeof data!=='string'||!data||data.length>16384)throw Error('WINDOWS_KEYSTORE_UNAVAILABLE');
    const envelope=JSON.stringify({version:2,format:'windows-dpapi-binance-tr',data});
    mkdirSync(dirname(this.#path),{recursive:true,mode:0o700});
    if(!replace){writeFileSync(this.#path,envelope,{flag:'wx',mode:0o600});return;}
    const temp=this.#path+'.'+randomBytes(12).toString('hex')+'.tmp';
    try{writeFileSync(temp,envelope,{flag:'wx',mode:0o600});renameSync(temp,this.#path);}
    finally{try{unlinkSync(temp);}catch(e){if(e.code!=='ENOENT')throw e;}}
  }
  save({apiKey,secretKey,replace=false,passphrase}={}) {
    return this.#exclusive(()=>{
      if(passphrase!==undefined)throw Error('INVALID_INPUT');
      if(replace)this.#read(); // Fail closed if original cannot be opened under this Windows user.
      this.#write({apiKey,secretKey},replace);
    });
  }
  remove(passphrase){return this.#exclusive(()=>{
    if(passphrase!==undefined)throw Error('INVALID_INPUT');
    this.#read();unlinkSync(this.#path);
  });}
  async balance(passphrase){
    if(passphrase!==undefined)throw Error('INVALID_INPUT');
    const keys=this.#exclusive(()=>this.#read());
    let response;
    try{response=await this.#client.account(keys);}
    catch{throw Error('EXCHANGE_READ_FAILED');}
    const assets=response?.data?.accountAssets;
    if(!Array.isArray(assets)||assets.length>5000)throw Error('Unexpected response');
    const seen=new Set();
    return assets.map(({asset,free,locked})=>{
      if(typeof asset!=='string'||!/^[-A-Za-z0-9_]{1,32}$/.test(asset)||seen.has(asset)||!decimal(free)||!decimal(locked))throw Error('Unexpected response');
      seen.add(asset);return {asset,free,locked};
    });
  }
  /**
   * Explicit one-time conversion. The v1 vault remains in place so a failure
   * never destroys user data. Caller supplies old password once, not at login.
   */
  migrate({legacyPath,passphrase}={}){
    return this.#exclusive(()=>{
      if(this.exists()||typeof legacyPath!=='string'||typeof passphrase!=='string'||passphrase.length<16)throw Error('INVALID_INPUT');
      const keys=loadVault(legacyPath,passphrase);
      this.#write(keys,false);
    });
  }
}
