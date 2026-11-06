import { BinanceTR } from './binance-tr.js';
const INTERVAL=3600000;
const SYMBOLS=['BTC_TRY','ETH_TRY'];
function normalizeResponse(value) {
  if(value && typeof value.msg==='string' && /restrict|location|eligib/i.test(value.msg) && !Array.isArray(value.data)) throw Error('Market region restricted');
  if(Array.isArray(value)) return value;
  if(value && value.code===0 && Array.isArray(value.data)) return value.data;
  throw Error('Unexpected market data');
}
export class MarketData {
  #fetch; #clock; #exchange; #blocked=0; #running=false; #nextSnapshot=0;
  constructor({fetchImpl=fetch,clock=Date.now,exchange}={}){this.#fetch=fetchImpl;this.#clock=clock;this.#exchange=exchange||new BinanceTR({fetchImpl,clock});}
  async #get(path,query){
    if(this.#clock()<this.#blocked)throw Error('Market cooldown');
    const response=await this.#fetch(`https://api.binance.me${path}?${query}`,{method:'GET',redirect:'error',signal:AbortSignal.timeout(10000)});
    if(response.status===418||response.status===429){const n=Number(response.headers.get('retry-after'));this.#blocked=this.#clock()+(Number.isFinite(n)&&n>0?n*1000:60000);throw Error('Market cooldown');}
    if(!response.ok)throw Error('Market request failed');return normalizeResponse(await response.json());
  }
  // Lightweight public last-trade refresh; independent of the candle snapshot cooldown.
  async prices(){
    const now=this.#clock(),markets=[];
    for(const symbol of SYMBOLS){
      const trades=await this.#get('/api/v3/trades',new URLSearchParams({symbol:symbol.replace('_',''),limit:'1'}));
      const last=trades.at(-1),price=Number(last?.price),priceTime=last?.time;
      if(!Number.isFinite(price)||price<=0||!Number.isSafeInteger(priceTime)||priceTime>this.#clock()+1000||this.#clock()-priceTime>300000)throw Error('Stale price');
      markets.push({symbol,price,priceTime});
    }
    return {asOf:now,markets};
  }
  async snapshot({symbol:requestedSymbol}={}){
    if(this.#running || this.#clock()<this.#nextSnapshot)throw Error('Market request in progress or cooldown');this.#running=true;this.#nextSnapshot=this.#clock()+30000;
    try {
      const nowResult=await this.#exchange.time();const now=nowResult.timestamp;const reference=this.#clock();
      if(!Number.isSafeInteger(now)||Math.abs(reference-now)>120000)throw Error('Clock invalid');
      const currentTime=()=>now+Math.max(0,this.#clock()-reference);
      const all=await this.#exchange.symbols();const list=all?.data?.list;if(!Array.isArray(list))throw Error('Symbols invalid');
      const selected=[];
      // A requested market is only accepted from the fresh exchange catalogue.
      // The default two-TRY view is retained for legacy overview compatibility.
      const symbols=requestedSymbol?[requestedSymbol]:SYMBOLS;
      if(requestedSymbol&&(typeof requestedSymbol!=='string'||!/^[A-Z0-9]{1,20}_[A-Z0-9]{1,20}$/.test(requestedSymbol)))throw Error('Invalid symbol');
      for(const symbol of symbols){
        const eligible=list.some(x=>x.symbol===symbol&&x.type===1&&x.spotTradingEnable===1&&(x.status===undefined||x.status==='TRADING'));
        if(!eligible){if(requestedSymbol)throw Error('Invalid symbol');continue;}
        const ticker=symbol.replace('_','');const q=new URLSearchParams({symbol:ticker,interval:'1h',limit:'250'});
        const raw=await this.#get('/api/v1/klines',q);
        const candles=raw.map(row=>{
          if(!Array.isArray(row)||row.length<8)throw Error('Invalid candle');
          const [time,o,h,l,c,v,closeTime,quote]=row;const values=[o,h,l,c,v,quote].map(Number);
          if(!Number.isSafeInteger(time)||!Number.isSafeInteger(closeTime)||closeTime!==time+INTERVAL-1||values.some(x=>!Number.isFinite(x)||x<0)||values.slice(0,4).some(x=>x<=0)||values[1]<Math.max(values[0],values[2],values[3])||values[2]>Math.min(values[0],values[1],values[3]))throw Error('Invalid candle');
          return {time,open:values[0],high:values[1],low:values[2],close:values[3],volume:values[4],closeTime,quoteVolume:values[5]};
        }).filter(x=>x.closeTime<now);
        if(candles.length<21||candles.some((x,i)=>i>0&&x.time!==candles[i-1].time+INTERVAL)||now-candles.at(-1).closeTime>INTERVAL*2)throw Error('Incomplete or stale candles');
        const trades=await this.#get('/api/v3/trades',new URLSearchParams({symbol:ticker,limit:'1'}));
        const last=trades.at(-1);const price=Number(last?.price),time=last?.time;
        if(!Number.isFinite(price)||price<=0||!Number.isSafeInteger(time)||time>currentTime()+1000||currentTime()-time>300000)throw Error('Stale price');
        selected.push({symbol,price,priceTime:time,candles});
      }
      if(!selected.length)throw Error('No eligible TR market');return {asOf:currentTime(),markets:selected};
    } finally {this.#running=false;}
  }
}
