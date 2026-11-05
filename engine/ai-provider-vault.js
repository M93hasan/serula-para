import {existsSync,unlinkSync,writeFileSync,renameSync,mkdirSync} from 'node:fs';
import {join} from 'node:path';
import {randomBytes} from 'node:crypto';
import {seal,loadVault} from './vault.js';

const PROVIDERS=Object.freeze(['openai','ollama_cloud','anthropic','gemini','deepseek']);
const validPassword=p=>typeof p==='string'&&p.length>=16&&p.length<=512;
const validKey=k=>typeof k==='string'&&k.length>0&&k.length<=512&&!/[\u0000-\u0020\u007f]/.test(k);
const validModel=m=>typeof m==='string'&&(m===''||/^[A-Za-z0-9_.:/-]{1,100}$/.test(m));
// A separate local vault per provider; never stored in the Binance credential vault.
export class AIProviderVault {
  #dir;#busy=false;
  constructor({directory}){if(typeof directory!=='string'||!directory)throw Error('INVALID');this.#dir=directory;}
  #path(id){if(!PROVIDERS.includes(id))throw Error('INVALID');return join(this.#dir,id+'.vault');}
  #exclusive(fn){if(this.#busy)throw Error('BUSY');this.#busy=true;try{return fn();}finally{this.#busy=false;}}
  #open(id,passphrase){if(!validPassword(passphrase))throw Error('INVALID');const data=loadVault(this.#path(id),passphrase);if(data.secretKey!=='para-ai-provider:'+id||!validKey(data.apiKey)||!validModel(data.model))throw Error('INVALID');return data;}
  status(){return PROVIDERS.map(provider=>({provider,configured:existsSync(this.#path(provider))}));}
  openForAnalysis({provider,passphrase}){return this.#exclusive(()=>this.#open(provider,passphrase));}
  save({provider,apiKey,model='',passphrase,replace=false}){return this.#exclusive(()=>{
    const path=this.#path(provider);
    if(!validKey(apiKey)||!validModel(model)||!validPassword(passphrase)||typeof replace!=='boolean')throw Error('INVALID');
    const exists=existsSync(path);if(exists!==replace)throw Error('STATE_CHANGED');
    if(replace)this.#open(provider,passphrase);
    const encrypted=seal({apiKey,secretKey:'para-ai-provider:'+provider,model},passphrase);
    mkdirSync(this.#dir,{recursive:true,mode:0o700});
    if(!replace){writeFileSync(path,encrypted,{flag:'wx',mode:0o600});return;}
    const temporary=path+'.'+randomBytes(16).toString('hex')+'.tmp';
    try{writeFileSync(temporary,encrypted,{flag:'wx',mode:0o600});renameSync(temporary,path);}finally{try{unlinkSync(temporary)}catch(e){if(e.code!=='ENOENT')throw e;}}
  });}
  remove({provider,passphrase}){return this.#exclusive(()=>{this.#open(provider,passphrase);unlinkSync(this.#path(provider));});}
}
