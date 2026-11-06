// Cloudflare-only, per authenticated Google sub. Requires separately provisioned
// D1 WEB_VAULT_DB and secret WEB_VAULT_KEY. There is no plaintext/KV fallback.
const providers=new Set(['binance_tr','openai','ollama_cloud','anthropic','gemini','deepseek']);
const te=new TextEncoder(),td=new TextDecoder();
const b64=bytes=>btoa(String.fromCharCode(...bytes));
const unb64=str=>Uint8Array.from(atob(str),c=>c.charCodeAt(0));
const validIdentity=id=>typeof id==='string' && /^[A-Za-z0-9_-]{1,256}$/.test(id);
const validSecret=value=>typeof value==='string'&&value.length>0&&value.length<=512&&!/[\u0000-\u001f\u007f]/.test(value);
const validModel=x=>typeof x==='string'&&(x===''||/^[A-Za-z0-9_.:-]{1,100}$/.test(x));
function requireDb(env){
  if(!env?.WEB_VAULT_DB?.prepare || typeof env.WEB_VAULT_KEY!=='string')throw Error('WEB_VAULT_NOT_CONFIGURED');
  let key;
  try{key=unb64(env.WEB_VAULT_KEY);}catch{throw Error('WEB_VAULT_NOT_CONFIGURED');}
  if(key.length!==32)throw Error('WEB_VAULT_NOT_CONFIGURED');
  return {db:env.WEB_VAULT_DB,key};
}
async function cryptoKey(key){return crypto.subtle.importKey('raw',key,'AES-GCM',false,['encrypt','decrypt']);}
const aad=(owner,provider)=>te.encode('PARA-WEB-VAULT-V1:'+owner+':'+provider);
const keyId=async owner=>Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',te.encode(owner)))).map(b=>b.toString(16).padStart(2,'0')).join('');
export class WebCredentialVault {
  constructor(env){const {db,key}=requireDb(env);this.db=db;this.key=key;}
  async #owner(id){if(!validIdentity(id))throw Error('INVALID_IDENTITY');return keyId(id);}
  #provider(provider){if(!providers.has(provider))throw Error('INVALID_PROVIDER');return provider;}
  #validate(provider,credentials){
    if(!credentials || typeof credentials!=='object'||Array.isArray(credentials))throw Error('INVALID_CREDENTIALS');
    if(provider==='binance_tr') {
      if(Object.keys(credentials).sort().join(',')!=='apiKey,secretKey'||!validSecret(credentials.apiKey)||!validSecret(credentials.secretKey))throw Error('INVALID_CREDENTIALS');
    }else if(Object.keys(credentials).sort().join(',')!=='apiKey,model'||!validSecret(credentials.apiKey)||!validModel(credentials.model))throw Error('INVALID_CREDENTIALS');
  }
  async save(id,provider,credentials,{replace=false}={}){
    this.#provider(provider);this.#validate(provider,credentials);
    if(typeof replace!=='boolean')throw Error('INVALID_INPUT');
    const owner=await this.#owner(id);
    const iv=crypto.getRandomValues(new Uint8Array(12));
    const encrypted=await crypto.subtle.encrypt({name:'AES-GCM',iv,additionalData:aad(owner,provider),tagLength:128},
      await cryptoKey(this.key),te.encode(JSON.stringify(credentials)));
    const encoded=JSON.stringify({version:1,iv:b64(iv),ciphertext:b64(new Uint8Array(encrypted))});
    const statement=replace
      ? 'UPDATE web_credentials SET envelope = ? WHERE owner_id = ? AND provider = ?'
      : 'INSERT OR IGNORE INTO web_credentials (envelope, owner_id, provider) VALUES (?, ?, ?)';
    const result=await this.db.prepare(statement).bind(encoded,owner,provider).run();
    if(result?.meta?.changes!==1)throw Error('STATE_CHANGED');
  }
  async status(id){
    const owner=await this.#owner(id);
    const result=await this.db.prepare('SELECT provider FROM web_credentials WHERE owner_id = ?').bind(owner).all();
    return providers.values().map(p=>({provider:p,configured:!!result.results?.some(x=>x.provider===p)})).toArray();
  }
  async open(id,provider){
    this.#provider(provider);const owner=await this.#owner(id);
    const row=await this.db.prepare('SELECT envelope FROM web_credentials WHERE owner_id = ? AND provider = ?').bind(owner,provider).first();
    if(!row)throw Error('NOT_CONFIGURED');
    try{
      const envelope=JSON.parse(row.envelope);
      if(envelope.version!==1)throw Error('VERSION');
      const iv=unb64(envelope.iv),cipher=unb64(envelope.ciphertext);
      if(iv.length!==12||cipher.length>8192||cipher.length<16)throw Error('FORMAT');
      const plain=await crypto.subtle.decrypt({name:'AES-GCM',iv,additionalData:aad(owner,provider),tagLength:128},await cryptoKey(this.key),cipher);
      const credentials=JSON.parse(td.decode(plain));this.#validate(provider,credentials);
      return credentials;
    }catch{throw Error('VAULT_DECRYPT_FAILED');}
  }
  async remove(id,provider){
    this.#provider(provider);const owner=await this.#owner(id);
    const result=await this.db.prepare('DELETE FROM web_credentials WHERE owner_id = ? AND provider = ?').bind(owner,provider).run();
    if(result?.meta?.changes!==1)throw Error('NOT_CONFIGURED');
  }
}
