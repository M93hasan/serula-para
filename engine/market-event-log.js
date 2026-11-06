import { appendFileSync, existsSync, mkdirSync, readFileSync, renameSync, statSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';

const TYPES=new Set(['API_ERROR','CONNECTION_LOST','CONNECTION_RESTORED','PORTFOLIO_REFRESH_FAILED','PORTFOLIO_REFRESH_OK','OFFLINE','ONLINE']);
const SOURCES=new Set(['MARKET','PORTFOLIO','NETWORK','ACCOUNT']);
const CODES=new Set(['MARKET_CONNECTION','STALE_DATA','RATE_LIMIT','REGION_RESTRICTED','EXCHANGE_READ_FAILED','NETWORK_ERROR','HTTP_ERROR','UNKNOWN','OK']);
const MAX_BYTES=512*1024;
export class MarketEventLog {
  #path; #clock;
  constructor({path,clock=Date.now}){this.#path=path;this.#clock=clock;}
  record({type,source,code='UNKNOWN'}){
    if(!TYPES.has(type)||!SOURCES.has(source)||!CODES.has(code))throw Error('Invalid market event');
    const event={time:new Date(this.#clock()).toISOString(),type,source,code};
    mkdirSync(dirname(this.#path),{recursive:true,mode:0o700});
    if(existsSync(this.#path)&&statSync(this.#path).size>MAX_BYTES){
      // Keep at most 200 recent records during rotation; never store credentials.
      const lines=readFileSync(this.#path,'utf8').trim().split('\n').slice(-200);
      writeFileSync(this.#path,lines.join('\n')+'\n',{mode:0o600});
    }
    appendFileSync(this.#path,JSON.stringify(event)+'\n',{mode:0o600});
    return event;
  }
  recent(limit=50){
    if(!existsSync(this.#path))return [];
    return readFileSync(this.#path,'utf8').trim().split('\n').filter(Boolean).slice(-Math.min(Math.max(limit,1),100)).map(line=>JSON.parse(line));
  }
}
