import {compareDecimal,multiplyDecimal} from './order-rules.js';

const SCALE=100000000n;
const DECIMAL=/^(?:0|[1-9]\d{0,19})(?:\.\d{1,8})?$/;
const SYMBOL=/^([A-Z0-9]{1,20})_TRY$/;

function units(value){
  if(typeof value!=='string'||!DECIMAL.test(value))throw Error('RISK_DATA_UNAVAILABLE');
  const [whole,fraction='']=value.split('.');
  return BigInt(whole)*SCALE+BigInt(fraction.padEnd(8,'0'));
}
function decimal(value){return String(value/SCALE)+'.'+String(value%SCALE).padStart(8,'0');}

// Converts the fixed Binance TR signed trade endpoint into the normalized fill
// ledger consumed by VerifiedAccountRiskProvider. The caller must independently
// prove accountOpenedAt and provide complete deposit/withdrawal observations.
export function createBinanceTRRiskLedgerLoader({client,loadSymbols,loadExternalFlows,
  convertFeeToTry=null,accountOpenedAt,clock=Date.now}={}){
  if(typeof client?.trades!=='function'||typeof loadSymbols!=='function'||typeof loadExternalFlows!=='function'||
     convertFeeToTry!==null&&typeof convertFeeToTry!=='function'||!Number.isSafeInteger(accountOpenedAt)||
     accountOpenedAt<0||typeof clock!=='function')throw Error('RISK_LEDGER_NOT_CONFIGURED');
  return async function loadLedger({through}={}){
    if(!Number.isSafeInteger(through)||through<accountOpenedAt)throw Error('RISK_DATA_UNAVAILABLE');
    const symbols=await loadSymbols();
    if(!Array.isArray(symbols)||symbols.length===0||symbols.length>1000||new Set(symbols).size!==symbols.length||
       symbols.some(symbol=>typeof symbol!=='string'||!SYMBOL.test(symbol)))throw Error('RISK_DATA_UNAVAILABLE');
    const fills=[];
    for(const symbol of symbols){
      const base=symbol.match(SYMBOL)[1];
      const trades=await client.trades(symbol,{startTime:accountOpenedAt,endTime:through,limit:500});
      for(const trade of trades){
        const qty=units(trade.qty),commission=units(trade.commission);
        if(qty<=0n||commission<0n)throw Error('RISK_DATA_UNAVAILABLE');
        let quantity=qty,feeTry;
        if(commission===0n)feeTry='0';
        else if(trade.commissionAsset==='TRY')feeTry=trade.commission;
        else if(trade.commissionAsset===base){
          quantity=trade.isBuyer?qty-commission:qty+commission;
          if(quantity<=0n)throw Error('RISK_DATA_UNAVAILABLE');
          feeTry=multiplyDecimal(trade.price,trade.commission);
        }else{
          if(!convertFeeToTry)throw Error('RISK_DATA_UNAVAILABLE');
          feeTry=await convertFeeToTry({asset:trade.commissionAsset,amount:trade.commission,time:trade.time});
          if(typeof feeTry!=='string'||compareDecimal(feeTry,'0')<0)throw Error('RISK_DATA_UNAVAILABLE');
        }
        fills.push({tradeId:trade.tradeId,orderId:trade.orderId,symbol,side:trade.isBuyer?'BUY':'SELL',
          time:trade.time,quantity:decimal(quantity),quoteTry:trade.quoteQty,feeTry});
      }
    }
    const flows=await loadExternalFlows({from:accountOpenedAt,through});
    const now=clock();
    if(!flows||flows.complete!==true||!Number.isSafeInteger(flows.count)||flows.count<0||
       !Number.isSafeInteger(flows.asOf)||flows.asOf>now||now-flows.asOf>10000)throw Error('RISK_DATA_UNAVAILABLE');
    return {asOf:Math.min(now,flows.asOf),completeFromGenesis:true,externalFlows:flows.count,fills};
  };
}
