// Amounts come from a reconciled TRY ledger. Missing history or external flows invalidate the report.
const SCALE=10n**8n;
function units(value,{signed=false}={}){
  if(typeof value!=='string'||!/^-?(?:0|[1-9]\d{0,19})(?:\.\d{1,8})?$/.test(value))
    throw Error('INVALID_PNL_AMOUNT');
  const negative=value.startsWith('-');
  if(negative&&!signed)throw Error('INVALID_PNL_AMOUNT');
  const [whole,fraction='']=(negative?value.slice(1):value).split('.');
  const result=BigInt(whole)*SCALE+BigInt(fraction.padEnd(8,'0'));
  return negative?-result:result;
}
function decimal(value){
  const abs=value<0n?-value:value;
  return (value<0n?'-':'')+String(abs/SCALE)+'.'+String(abs%SCALE).padStart(8,'0');
}

export function calculateDailyTradingPnl({now,coverage,sales,openingUnrealizedTry,currentUnrealizedTry}={}){
  const DAY=86_400_000;
  if(!Number.isSafeInteger(now)||now<0)throw Error('PNL_DATA_UNAVAILABLE');
  const dayStartAt=now-now%DAY;
  if(coverage?.from!==dayStartAt||coverage.through!==now||coverage.complete!==true||coverage.externalFlows!==0||
     !Array.isArray(sales))throw Error('PNL_DATA_UNAVAILABLE');

  const seen=new Set();
  let realized=0n;
  for(const fill of sales){
    if(!fill||typeof fill.tradeId!=='string'||!fill.tradeId||typeof fill.symbol!=='string'||
       !/^[A-Z0-9]{1,20}_TRY$/.test(fill.symbol)||!Number.isSafeInteger(fill.time)||
       fill.time<dayStartAt||fill.time>now)throw Error('INVALID_PNL_FILL');
    const id=fill.symbol+':'+fill.tradeId;
    if(seen.has(id))throw Error('DUPLICATE_PNL_FILL');
    seen.add(id);
    // The allocated acquisition cost includes buy fees. Selling fees are subtracted separately.
    const proceeds=units(fill.proceedsTry),cost=units(fill.acquisitionCostTry),fee=units(fill.sellingFeeTry);
    if(proceeds===0n||cost===0n||fee>proceeds)throw Error('INVALID_PNL_FILL');
    realized+=proceeds-cost-fee;
  }
  const net=realized+units(currentUnrealizedTry,{signed:true})-units(openingUnrealizedTry,{signed:true});
  return {dayStartAt,dayRealizedPnlTry:decimal(realized),dayNetPnlTry:decimal(net)};
}
