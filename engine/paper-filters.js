// Exact decimal checks; insufficient or unsupported exchange metadata fails closed.
const UNIT=100000000n;
function decimal(value){if(typeof value!=='string'||!/^\d{1,18}(?:\.\d{1,8})?$/.test(value))throw Error('INVALID_FILTER');const [whole,fraction='']=value.split('.');return BigInt(whole)*UNIT+BigInt(fraction.padEnd(8,'0'));}
export function checkPaperFilters({market,price,quantity}){
  try{
    if(!market||market.type!==1||!market.filtersPresent||market.symbol!==`${market.baseAsset}_${market.quoteAsset}`||!/^([A-Z0-9]{1,20})_([A-Z0-9]{1,20})$/.test(market.symbol))throw Error('UNVERIFIED_MARKET');
    const f=market.filters,p=decimal(price),q=decimal(quantity),tick=decimal(f.tickSize),step=decimal(f.stepSize),minQty=decimal(f.minQty),minNotional=decimal(f.minNotional);
    if([p,q,tick,step,minQty,minNotional].some(n=>n<=0n))throw Error('INVALID_FILTER');
    if(p%tick!==0n||q%step!==0n||q<minQty||p*q<minNotional*UNIT)throw Error('EXCHANGE_FILTER_REJECTED');
    return {accepted:true,reason:'FILTERS_PASSED'};
  }catch(error){return {accepted:false,reason:['UNVERIFIED_MARKET','EXCHANGE_FILTER_REJECTED'].includes(error.message)?error.message:'FILTERS_UNAVAILABLE'};}
}
