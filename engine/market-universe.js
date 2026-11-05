import { BinanceTR } from './binance-tr.js';

// Exchange metadata discovery only; it does not establish liquidity or signals.
export class MarketUniverse {
  #exchange; #clock; #cache=null; #pending=null;
  constructor({exchange=new BinanceTR(),clock=Date.now}={}){this.#exchange=exchange;this.#clock=clock;}
  async discover(){
    const now=this.#clock();if(this.#cache&&now-this.#cache.receivedAt<60000)return this.#cache;
    if(this.#pending)return this.#pending;
    this.#pending=(async()=>{
      const payload=await this.#exchange.symbols(), list=payload?.data?.list;
      if(payload?.code!==0||!Array.isArray(list)||!list.length||list.length>10000||!Number.isSafeInteger(payload.timestamp)||Math.abs(this.#clock()-payload.timestamp)>120000)throw Error('Invalid symbol catalogue');
      const seen=new Set(),markets=[];let ineligible=0;
      for(const item of list){
        if(!item||typeof item.symbol!=='string'||typeof item.baseAsset!=='string'||typeof item.quoteAsset!=='string'||!/^([A-Z0-9]{1,20})_([A-Z0-9]{1,20})$/.test(item.symbol)||item.symbol!==`${item.baseAsset}_${item.quoteAsset}`||seen.has(item.symbol))throw Error('Invalid symbol catalogue');
        seen.add(item.symbol);
        if(item.spotTradingEnable!==1){ineligible++;continue;}
        markets.push({symbol:item.symbol,baseAsset:item.baseAsset,quoteAsset:item.quoteAsset,type:item.type,analysisStatus:'NOT_SCANNED'});
      }
      return this.#cache={receivedAt:this.#clock(),exchangeTime:payload.timestamp,listed:list.length,eligible:markets.length,ineligible,markets,notice:'Yalnızca parite listesi; piyasa taraması ve fırsat tespiti henüz uygulanmadı.'};
    })();
    try{return await this.#pending;}finally{this.#pending=null;}
  }
}
