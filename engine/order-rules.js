// Exact decimal checks for exchange filters; no binary floating-point rounding.
const DEC=/^(?:0|[1-9]\d*)(?:\.\d{1,40})?$/;
function dec(x){if(typeof x!=='string'||!DEC.test(x))throw Error('INVALID_DECIMAL');const [a,b='']=x.split('.');return {n:BigInt(a+b),s:b.length};}
function both(a,b){const x=dec(a),y=dec(b),s=Math.max(x.s,y.s);return [x.n*10n**BigInt(s-x.s),y.n*10n**BigInt(s-y.s)];}
export function compareDecimal(a,b){const [x,y]=both(a,b);return x<y?-1:x>y?1:0;}
export function multipleOf(value,step,offset='0'){const [v,o]=both(value,offset),s=Math.max(dec(value).s,dec(step).s,dec(offset).s),z=10n**BigInt(s);const n=dec(value),b=dec(offset),t=dec(step);const vn=n.n*z/10n**BigInt(n.s),on=b.n*z/10n**BigInt(b.s),tn=t.n*z/10n**BigInt(t.s);return tn>0n&&vn>=on&&(vn-on)%tn===0n;}
export function multiplyDecimal(a,b){const x=dec(a),y=dec(b);const n=x.n*y.n,s=x.s+y.s,str=n.toString().padStart(s+1,'0');if(!s)return str;return str.slice(0,-s)+'.'+str.slice(-s);}
export function assertValidLimitOrder({order,symbolInfo,balances,market,now=Date.now(),maxNotional='1000'}){
  if(!order||!symbolInfo||symbolInfo.symbol!==order.symbol||symbolInfo.type!==1||symbolInfo.spotTradingEnable!==1||(symbolInfo.status!==undefined&&symbolInfo.status!=='TRADING'))throw Error('MARKET_NOT_VERIFIED');
  if(!/^[A-Z0-9]{1,20}_[A-Z0-9]{1,20}$/.test(order.symbol)||!['BUY','SELL'].includes(order.side)||!/^para_[A-Za-z0-9_-]{8,64}$/.test(order.clientId))throw Error('INVALID_ORDER');
  const {quantity,price}=order;
  if(compareDecimal(quantity,'0')<=0||compareDecimal(price,'0')<=0)throw Error('INVALID_ORDER');
  if(!Number.isSafeInteger(now)||!market||!Number.isSafeInteger(market.priceTime)||market.priceTime>now||now-market.priceTime>30000||!Number.isFinite(market.price)||market.price<=0)throw Error('STALE_PRICE');
  // Avoid ambiguous market/limit discrepancies. Only LIMIT orders supported in this phase.
  if(Math.abs(Number(price)/market.price-1)>0.05)throw Error('PRICE_DEVIATION');
  const filters=symbolInfo.filters;
  if(!Array.isArray(filters))throw Error('FILTERS_UNAVAILABLE');
  const filter=t=>filters.find(x=>x?.filterType===t);
  const p=filter('PRICE_FILTER'),l=filter('LOT_SIZE'),n=filter('NOTIONAL')||filter('MIN_NOTIONAL');
  if(!p?.tickSize||!l?.stepSize||!l?.minQty||!n?.minNotional)throw Error('FILTERS_UNAVAILABLE');
  for(const [value,f,min,max,step] of [[price,p,'minPrice','maxPrice','tickSize'],[quantity,l,'minQty','maxQty','stepSize']]){
    if(f[min]&&compareDecimal(f[min],'0')>0&&compareDecimal(value,f[min])<0)throw Error('BELOW_MINIMUM');
    if(f[max]&&compareDecimal(f[max],'0')>0&&compareDecimal(value,f[max])>0)throw Error('ABOVE_MAXIMUM');
    if(f[step]&&compareDecimal(f[step],'0')>0&&!multipleOf(value,f[step],f[min]||'0'))throw Error('INVALID_PRECISION');
  }
  const notional=multiplyDecimal(quantity,price);
  if(compareDecimal(notional,n.minNotional)<0)throw Error('BELOW_NOTIONAL');
  if(compareDecimal(notional,maxNotional)>0)throw Error('RISK_LIMIT');
  const [base,quote]=order.symbol.split('_'),asset=order.side==='BUY'?quote:base;
  const free=balances?.find(a=>a.asset===asset)?.free;
  if(typeof free!=='string')throw Error('BALANCE_UNAVAILABLE');
  // Reserve 1% for potential fees and rounding on BUY orders.
  const required=order.side==='BUY'?multiplyDecimal(notional,'1.01'):quantity;
  if(compareDecimal(free,required)<0)throw Error('INSUFFICIENT_FREE_BALANCE');
  return Object.freeze({symbol:order.symbol,side:order.side,quantity,price,clientId:order.clientId,notional});
}
