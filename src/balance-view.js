// Account quantities are decimal strings. Keep exact decimal precision for display.
// Never derive free/locked balances from estimates, price quotes or paper-trading state.
const QUANTITY=/^\d{1,40}(?:\.\d{1,40})?$/;
function parseQuantity(value){
  if(typeof value!=='string'||!QUANTITY.test(value))throw Error('INVALID_BALANCE');
  const [whole,fraction='']=value.split('.');
  return {digits:BigInt(whole+fraction),scale:fraction.length};
}
function sumQuantity(a,b){
  const x=parseQuantity(a),y=parseQuantity(b),scale=Math.max(x.scale,y.scale);
  const total=x.digits*10n**BigInt(scale-x.scale)+y.digits*10n**BigInt(scale-y.scale);
  const padded=total.toString().padStart(scale+1,'0');
  if(!scale)return padded;
  const whole=padded.slice(0,-scale),decimal=padded.slice(-scale).replace(/0+$/,'');
  return decimal?`${whole}.${decimal}`:whole;
}
export function prepareBalances(items){
  if(!Array.isArray(items)||items.length>5000)throw Error('INVALID_BALANCE');
  const seen=new Set(),rows=[];
  for(const item of items){
    if(!item||typeof item.asset!=='string'||!/^[-A-Za-z0-9_]{1,32}$/.test(item.asset)||seen.has(item.asset))throw Error('INVALID_BALANCE');
    seen.add(item.asset);
    const total=sumQuantity(item.free,item.locked);
    if(total!=='0')rows.push({asset:item.asset,free:item.free,locked:item.locked,total});
  }
  return rows.sort((a,b)=>a.asset.localeCompare(b.asset));
}
export function displayQuantity(value){
  parseQuantity(value);
  return value.replace('.',',');
}
