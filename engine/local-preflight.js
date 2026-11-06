// Local startup preflight: validate existing SQLite files and encrypted vault envelopes
// without decrypting credentials, modifying account data, or deleting WAL files.
import { DatabaseSync } from 'node:sqlite';
import { existsSync, readFileSync, readdirSync, statSync, unlinkSync } from 'node:fs';
import { join } from 'node:path';

const DATABASES=['simulation.sqlite','paper.sqlite','account-observations.sqlite'];
const VAULTS=['binance-tr.vault',...['openai','ollama_cloud','anthropic','gemini','deepseek'].map(x=>join('ai-providers',x+'.vault'))];
export function verifyLocalData(directory){
 const sqlite=[],vaults=[];
 for(const name of DATABASES){
  const path=join(directory,name);
  if(!existsSync(path)){sqlite.push({name,status:'NOT_CREATED'});continue;}
  const db=new DatabaseSync(path,{readOnly:true});
  try{
   const result=db.prepare('PRAGMA quick_check').all();
   if(result.length!==1||Object.values(result[0])[0]!=='ok')throw Error('SQLITE_INTEGRITY_FAILED');
   sqlite.push({name,status:'OK'});
  }finally{db.close();}
 }
 for(const name of VAULTS){
  const path=join(directory,name);
  if(!existsSync(path)){vaults.push({name,status:'NOT_CONFIGURED'});continue;}
  if(statSync(path).size>8192)throw Error('VAULT_ENVELOPE_INVALID');
  let envelope;
  try{envelope=JSON.parse(readFileSync(path,'utf8'));}catch{throw Error('VAULT_ENVELOPE_INVALID');}
  if(envelope?.version!==1||!['salt','iv','tag','data'].every(k=>typeof envelope[k]==='string'&&envelope[k].length>0))throw Error('VAULT_ENVELOPE_INVALID');
  for(const [field,size] of [['salt',16],['iv',12],['tag',16]]){
   const raw=Buffer.from(envelope[field],'base64');
   if(raw.length!==size||raw.toString('base64')!==envelope[field])throw Error('VAULT_ENVELOPE_INVALID');
  }
  vaults.push({name,status:'ENCRYPTED_FORMAT_OK_PASSWORD_NOT_CHECKED'});
 }
 return {sqlite,vaults};
}
// Delete only optional *.log files in a dedicated logs directory.
// Never delete SQLite journals/WAL, encrypted vaults, market-event JSONL or account records.
export function cleanExpiredDebugLogs(directory,{clock=Date.now,maxAgeMs=7*86400000}={}){
 if(!Number.isSafeInteger(maxAgeMs)||maxAgeMs<=0)throw Error('INVALID_LOG_RETENTION');
 const folder=join(directory,'logs');if(!existsSync(folder))return 0;
 let deleted=0;
 for(const entry of readdirSync(folder,{withFileTypes:true})){
  if(!entry.isFile()||!/^[A-Za-z0-9_-]+\.log(?:\.\d+)?$/.test(entry.name))continue;
  const path=join(folder,entry.name),stats=statSync(path);
  if(clock()-stats.mtimeMs>maxAgeMs){unlinkSync(path);deleted++;}
 }
 return deleted;
}
