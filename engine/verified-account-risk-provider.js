import {calculateDailyTradingPnl} from './daily-trading-pnl.js';

const SCALE=100000000n;
const ASSET=/^[A-Z0-9]{1,20}$/;
const SYMBOL=/^([A-Z0-9]{1,20})_TRY$/;
const DECIMAL=/^(?:0|[1-9]\d{0,19})(?:\.\d{1,8})?$/;

function units(value){
  if(typeof value!=='string'||!DECIMAL.test(value))throw Error('RISK_DATA_UNAVAILABLE');
  const [whole,fraction='']=value.split('.');
  return BigInt(whole)*SCALE+BigInt(fraction.padEnd(8,'0'));
}
function decimal(value){
  if(value<0n)return '-'+decimal(-value);
  return String(value/SCALE)+'.'+String(value%SCALE).padStart(8,'0');
}
function addAmount(a,b){return units(a)+units(b);}
function valueAt(quantity,price){return quantity*price/SCALE;}
function validTime(value,now,maxAge){return Number.isSafeInteger(value)&&value<=now&&now-value<=maxAge;}

// Derives risk state from an exchange-originated, complete fill ledger. The ledger
// adapter must normalize each fill's actual base-asset balance change and TRY fee.
// Any deposit, withdrawal, unsupported fee conversion or history gap must set
// completeFromGenesis=false or externalFlows>0 so this provider fails closed.
export class VerifiedAccountRiskProvider{
  #loadLedger;#loadQuotes;#clock;#maxAgeMs;
  constructor({loadLedger,loadQuotes,clock=Date.now,maxAgeMs=10000}={}){
    if(typeof loadLedger!=='function'||typeof loadQuotes!=='function'||typeof clock!=='function'||
       !Number.isSafeInteger(maxAgeMs)||maxAgeMs<1000||maxAgeMs>30000)throw Error('RISK_PROVIDER_NOT_CONFIGURED');
    this.#loadLedger=loadLedger;this.#loadQuotes=loadQuotes;this.#clock=clock;this.#maxAgeMs=maxAgeMs;
  }
  async load({balances,accountAsOf}={}){
    const now=this.#clock(),dayStartAt=now-now%86400000;
    if(!Number.isSafeInteger(now)||!Array.isArray(balances)||!validTime(accountAsOf,now,this.#maxAgeMs))throw Error('RISK_DATA_UNAVAILABLE');
    const account=new Map();
    for(const balance of balances){
      if(!balance||typeof balance.asset!=='string'||!ASSET.test(balance.asset)||account.has(balance.asset))throw Error('RISK_DATA_UNAVAILABLE');
      account.set(balance.asset,addAmount(balance.free,balance.locked));
    }
    const ledger=await this.#loadLedger({through:now});
    if(!ledger||ledger.completeFromGenesis!==true||ledger.externalFlows!==0||
       !validTime(ledger.asOf,now,this.#maxAgeMs)||!Array.isArray(ledger.fills)||ledger.fills.length>100000)
      throw Error('RISK_DATA_UNAVAILABLE');

    const ordered=[...ledger.fills].sort((a,b)=>a.time-b.time||String(a.tradeId).localeCompare(String(b.tradeId)));
    const seen=new Set(),lots=new Map(),opening=new Map(),sales=[],dayOrders=new Set();
    let dayFees=0n,openingCaptured=false;
    const captureOpening=()=>{
      if(openingCaptured)return;
      for(const [asset,lot] of lots)opening.set(asset,{...lot});
      openingCaptured=true;
    };
    for(const fill of ordered){
      if(!fill||typeof fill.tradeId!=='string'||!fill.tradeId||typeof fill.orderId!=='string'||!fill.orderId||
         !Number.isSafeInteger(fill.time)||fill.time<0||fill.time>now||!['BUY','SELL'].includes(fill.side))
        throw Error('RISK_DATA_UNAVAILABLE');
      const match=typeof fill.symbol==='string'&&fill.symbol.match(SYMBOL);
      const id=fill.symbol+':'+fill.tradeId;
      if(!match||seen.has(id))throw Error('RISK_DATA_UNAVAILABLE');
      seen.add(id);
      if(fill.time>=dayStartAt)captureOpening();
      const asset=match[1],quantity=units(fill.quantity),quote=units(fill.quoteTry),fee=units(fill.feeTry);
      if(quantity<=0n||quote<=0n||fee>quote)throw Error('RISK_DATA_UNAVAILABLE');
      const lot=lots.get(asset)||{quantity:0n,cost:0n};
      if(fill.side==='BUY'){
        lot.quantity+=quantity;
        lot.cost+=quote+fee;
      }else{
        if(lot.quantity<quantity||lot.quantity===0n)throw Error('RISK_DATA_INCONSISTENT');
        const acquisitionCost=quantity===lot.quantity?lot.cost:lot.cost*quantity/lot.quantity;
        lot.quantity-=quantity;lot.cost-=acquisitionCost;
        if(fill.time>=dayStartAt)sales.push({tradeId:fill.tradeId,symbol:fill.symbol,time:fill.time,
          proceedsTry:decimal(quote),acquisitionCostTry:decimal(acquisitionCost),sellingFeeTry:decimal(fee)});
      }
      lots.set(asset,lot);
      if(fill.time>=dayStartAt){dayFees+=fee;dayOrders.add(fill.orderId);}
    }
    captureOpening();

    const assets=new Set([...account.keys(),...lots.keys()]);
    assets.delete('TRY');
    for(const asset of assets){
      const balance=account.get(asset)||0n,lot=lots.get(asset)||{quantity:0n,cost:0n};
      if(balance!==lot.quantity||(balance===0n&&lot.cost!==0n))throw Error('RISK_DATA_INCONSISTENT');
    }
    const active=[...assets].filter(asset=>(account.get(asset)||0n)>0n).sort();
    const openingAssets=[...opening].filter(([,lot])=>lot.quantity>0n).map(([asset])=>asset);
    const quotes=await this.#loadQuotes({assets:[...new Set([...active,...openingAssets])],openingAt:dayStartAt,through:now});
    if(!quotes||quotes.connectionHealthy!==true||!validTime(quotes.asOf,now,this.#maxAgeMs)||!Array.isArray(quotes.quotes))
      throw Error('RISK_DATA_UNAVAILABLE');
    const quoteMap=new Map();
    for(const quote of quotes.quotes){
      if(!quote||typeof quote.asset!=='string'||!ASSET.test(quote.asset)||quoteMap.has(quote.asset)||
         !validTime(quote.currentPriceTime,now,30000))throw Error('RISK_DATA_UNAVAILABLE');
      quoteMap.set(quote.asset,{current:units(quote.currentPriceTry),opening:units(quote.openingPriceTry),openingTime:quote.openingPriceTime,currentTime:quote.currentPriceTime});
    }
    let totalExposure=0n,currentUnrealized=0n,openingUnrealized=0n;
    const positions=active.map(asset=>{
      const lot=lots.get(asset),quote=quoteMap.get(asset);
      if(!quote||quote.current<=0n)throw Error('RISK_DATA_UNAVAILABLE');
      const exposure=valueAt(lot.quantity,quote.current);
      totalExposure+=exposure;currentUnrealized+=exposure-lot.cost;
      return {asset,quantity:decimal(lot.quantity),exposureTry:decimal(exposure),costBasisTry:decimal(lot.cost),priceTime:quote.currentTime};
    });
    for(const [asset,lot] of opening){
      if(lot.quantity===0n)continue;
      const quote=quoteMap.get(asset);
      if(!quote||quote.opening<=0n||!Number.isSafeInteger(quote.openingTime)||quote.openingTime>dayStartAt||dayStartAt-quote.openingTime>3600000)
        throw Error('RISK_DATA_UNAVAILABLE');
      openingUnrealized+=valueAt(lot.quantity,quote.opening)-lot.cost;
    }
    const metrics=quotes.metrics||{};
    const pnl={now,coverage:{from:dayStartAt,through:now,complete:true,externalFlows:0},sales,
      openingUnrealizedTry:decimal(openingUnrealized),currentUnrealizedTry:decimal(currentUnrealized)};
    const report=calculateDailyTradingPnl(pnl);
    return {source:'verified-exchange-risk-monitor',connectionHealthy:true,asOf:Math.min(accountAsOf,ledger.asOf,quotes.asOf),
      positions,totalExposureTry:decimal(totalExposure),dayTradeCount:dayOrders.size,dayFeesTry:decimal(dayFees),
      feeBps:metrics.feeBps,spreadBps:metrics.spreadBps,slippageBps:metrics.slippageBps,
      volatilityBps:metrics.volatilityBps,...report,pnl};
  }
}
