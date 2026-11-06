import { decide } from './decision.js';
const HOUR=3600000;
const pause=ms=>new Promise(resolve=>setTimeout(resolve,ms));
const ema=(values,period)=>values.slice(1).reduce((acc,n)=>acc+(n-acc)*2/(period+1),values[0]);

// Quote-only estimate; does not submit or prepare any order.
export function estimateDepth(book,side,quantity){
  if(!['AL','SAT'].includes(side)||!Number.isFinite(quantity)||quantity<=0)throw Error('invalid depth request');
  const rows=side==='AL'?book?.asks:book?.bids;if(!Array.isArray(rows)||!rows.length||rows.length>5)throw Error('invalid order book');
  let remaining=quantity,total=0,previous=side==='AL'?0:Infinity,best;
  for(const row of rows){const price=Number(row?.[0]),amount=Number(row?.[1]);if(!Number.isFinite(price)||price<=0||!Number.isFinite(amount)||amount<=0||(side==='AL'?price<previous:price>previous))throw Error('invalid order book');if(best===undefined)best=price;previous=price;const filled=Math.min(remaining,amount);total+=filled*price;remaining-=filled;}
  if(remaining>Math.max(1e-12,quantity*1e-12))return {available:false,reason:'INSUFFICIENT_DEPTH'};
  const average=total/quantity,slippage=side==='AL'?average/best-1:1-average/best;if(!Number.isFinite(average)||!Number.isFinite(slippage))throw Error('invalid order book');return {available:true,average,slippage:Math.max(0,slippage),notional:total};
}

export function analyzeMarket(candles,book,now=Date.now()) {
  if(!Array.isArray(candles)||candles.length<35)throw Error('insufficient candles');
  if(candles.some((c,i)=>!Number.isSafeInteger(c.time)||c.closeTime!==c.time+HOUR-1||c.closeTime>=now||![c.open,c.high,c.low,c.close,c.volume,c.quoteVolume].every(Number.isFinite)||c.open<=0||c.close<=0||c.low<=0||c.high<Math.max(c.open,c.close,c.low)||c.low>Math.min(c.open,c.close,c.high)||c.volume<0||c.quoteVolume<0||(i&&c.time!==candles[i-1].time+HOUR)))throw Error('invalid candles');
  if(now-candles.at(-1).closeTime>2*HOUR)throw Error('stale candles');
  const bid=Number(book?.bids?.[0]?.[0]),bidQty=Number(book?.bids?.[0]?.[1]),ask=Number(book?.asks?.[0]?.[0]),askQty=Number(book?.asks?.[0]?.[1]);
  if(![bid,bidQty,ask,askQty].every(n=>Number.isFinite(n)&&n>0)||ask<bid)throw Error('invalid order book');
  const depth=(rows,side)=>{if(!Array.isArray(rows)||!rows.length||rows.length>5)throw Error('invalid order book');let prev=side==='bid'?Infinity:0,total=0;for(const row of rows){const p=Number(row?.[0]),q=Number(row?.[1]);if(!Number.isFinite(p)||!Number.isFinite(q)||p<=0||q<=0||(side==='bid'?p>prev:p<prev))throw Error('invalid order book');total+=p*q;prev=p;}return total;};
  const depthQuote=Math.min(depth(book.bids,'bid'),depth(book.asks,'ask'));
  const closes=candles.map(c=>c.close),delta=closes.slice(-15).slice(1).map((n,i)=>n-closes[closes.length-15+i]);
  const gain=delta.reduce((a,n)=>a+Math.max(n,0),0)/14,loss=delta.reduce((a,n)=>a+Math.max(-n,0),0)/14;
  const returns=closes.slice(-21).slice(1).map((n,i)=>n/closes[closes.length-21+i]-1),mean=returns.reduce((a,b)=>a+b,0)/returns.length;
  const spread=(ask-bid)/((ask+bid)/2),volume24=candles.slice(-24).reduce((a,c)=>a+c.quoteVolume,0),volatility=Math.sqrt(returns.reduce((a,n)=>a+(n-mean)**2,0)/returns.length);
  return {rsi:loss===0?(gain===0?50:100):100-100/(1+gain/loss),ema12:ema(closes,12),ema26:ema(closes,26),macd:ema(closes,12)-ema(closes,26),volatility,spread,volume24,topDepthQuote:Math.min(bid*bidQty,ask*askQty),depthQuote,bid,ask,feeAssumption:0.001,slippageAssumption:0.001,estimatedRoundTripCost:2*(0.001+0.001)+spread};
}

// One GET at a time; this component has no account or trading methods.
export class MarketScanner {
  #universe;#fetch;#clock;#sleep;#state={status:'idle',results:[]};#next=0;#lastRequest=0;#generation=0;#controller=null;
  constructor({universe,fetchImpl=fetch,clock=Date.now,sleep=pause}={}){this.#universe=universe;this.#fetch=fetchImpl;this.#clock=clock;this.#sleep=sleep;}
  status(){return this.#state;}
  start(){if(this.#state.status==='running'||this.#clock()<this.#next)throw Error('SCAN_BUSY');this.#next=this.#clock()+60000;const generation=++this.#generation;this.#controller=new AbortController();this.#state={status:'running',results:[],startedAt:this.#clock()};this.#run(generation).catch(()=>{if(generation===this.#generation){this.#state.status='unavailable';this.#state.finishedAt=this.#clock();}});return this.#state;}
  stop(){if(this.#state.status==='running'){++this.#generation;this.#controller?.abort();this.#state.status='stopped';this.#state.finishedAt=this.#clock();}return this.#state;}
  #check(generation){if(generation!==this.#generation)throw Error('SCAN_STOPPED');}
  async #get(path,params,generation){
    const delay=600-(this.#clock()-this.#lastRequest);if(delay>0)await this.#sleep(delay);this.#check(generation);this.#lastRequest=this.#clock();
    const response=await this.#fetch(`https://api.binance.me${path}?${new URLSearchParams(params)}`,{method:'GET',redirect:'error',signal:AbortSignal.any([AbortSignal.timeout(10000),this.#controller.signal])});this.#check(generation);
    if(response.status===429||response.status===418){const raw=response.headers.get('retry-after')?.trim()??'';const retry=/^\d+$/.test(raw)?this.#clock()+Number(raw)*1000:Date.parse(raw);this.#next=Math.max(this.#next,this.#clock()+60000,Number.isSafeInteger(retry)?retry:0);throw Error('RATE_LIMIT');}
    if(response.status===451)throw Error('REGION_RESTRICTED');if(!response.ok)throw Error('DATA_UNAVAILABLE');
    const json=await response.json();this.#check(generation);if(json&&typeof json.msg==='string'&&/restrict|location|eligib/i.test(json.msg))throw Error('REGION_RESTRICTED');
    return json?.code===0?json.data:json;
  }
  async #run(generation){
    const catalog=await this.#universe.discover();this.#check(generation);this.#state.total=catalog.markets.length;this.#state.catalogTime=catalog.exchangeTime;
    for(const m of catalog.markets){
      if(m.type!==1){this.#state.results.push({symbol:m.symbol,status:'unsupported',researchSignal:'BEKLE',reason:'Bu piyasa türünün veri bağlayıcısı henüz doğrulanmadı.'});continue;}
      try{
        const symbol=m.symbol.replace('_',''),rows=await this.#get('/api/v1/klines',{symbol,interval:'1h',limit:'100'},generation),book=await this.#get('/api/v3/depth',{symbol,limit:'5'},generation),trades=await this.#get('/api/v3/trades',{symbol,limit:'1'},generation),now=this.#clock();
        if(!Array.isArray(rows)||!Array.isArray(trades))throw Error('invalid response');
        const candles=rows.map(r=>{if(!Array.isArray(r)||r.length<8)throw Error('invalid response');return {time:r[0],open:Number(r[1]),high:Number(r[2]),low:Number(r[3]),close:Number(r[4]),volume:Number(r[5]),closeTime:r[6],quoteVolume:Number(r[7])};}).filter(c=>c.closeTime<now);
        const last=trades.at(-1),price=Number(last?.price),priceTime=last?.time;
        if(!Number.isFinite(price)||price<=0||!Number.isSafeInteger(priceTime)||priceTime>now+1000||now-priceTime>300000)throw Error('stale price');
        const indicators=analyzeMarket(candles,book,now);
        // Quote units differ; no cross-quote liquidity or profit ranking is invented.
        const eligible=indicators.volume24>0&&indicators.topDepthQuote>0&&indicators.spread<=0.01;
        const signal=eligible?decide(m.symbol,candles):null;
        this.#state.results.push({symbol:m.symbol,baseAsset:m.baseAsset,quoteAsset:m.quoteAsset,status:eligible?'candidate':'excluded',researchSignal:signal?.action??'BEKLE',signalReason:signal?.reason??'Piyasa ön filtreleri sağlanmadı.',signalScore:signal?.score??0,reason:eligible?'Kural tabanlı araştırma sinyali; AI ve risk onayı gerekli.':'Hacim, derinlik veya makas yetersiz.',price,priceTime,asOf:now,indicators,candles});
      }catch(e){if(generation!==this.#generation)return;if(['RATE_LIMIT','REGION_RESTRICTED'].includes(e.message)){this.#state.status=e.message;this.#state.finishedAt=this.#clock();return;}this.#state.results.push({symbol:m.symbol,status:'unavailable',researchSignal:'BEKLE',reason:'Güncel veya geçerli veri yok.'});}
    }
    this.#state.status='complete';this.#state.finishedAt=this.#clock();
  }
}
