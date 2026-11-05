import { decide } from './decision.js';
// Historical approximation: one long-only position, close-derived signals execute next open.
export function backtest(symbol,candles,{budget=1000,maxTrade=100,maxLoss=50,feeRate=0.001}={}){
  if(![budget,maxTrade,maxLoss,feeRate].every(Number.isFinite)||budget<=0||maxTrade<=0||maxTrade>budget||maxLoss<=0||maxLoss>budget||feeRate<0||feeRate>0.05)throw Error('Invalid risk configuration');
  let cash=budget,qty=0,pending=null,halted=false,fees=0,maxDrawdown=0,peak=budget;const trades=[],curve=[];
  for(let i=0;i<candles.length;i++){
    const c=candles[i];
    if(pending==='AL' && qty===0 && !halted){const spend=Math.min(maxTrade,cash/(1+feeRate));if(spend>0){const fee=spend*feeRate;qty=spend/c.open;cash-=spend+fee;fees+=fee;trades.push({action:'AL',signalTime:candles[i-1].closeTime,time:c.time,price:c.open,notional:spend,fee});}}
    else if(pending==='SAT'&&qty>0){const value=qty*c.open,fee=value*feeRate;cash+=value-fee;fees+=fee;qty=0;trades.push({action:'SAT',signalTime:candles[i-1].closeTime,time:c.time,price:c.open,notional:value,fee});}
    pending=null;const equity=cash+qty*c.close*(1-feeRate);peak=Math.max(peak,equity);maxDrawdown=Math.max(maxDrawdown,peak-equity);
    curve.push({time:c.closeTime,value:equity-budget});
    if(budget-equity>=maxLoss){halted=true;if(qty>0)pending='SAT';}
    else {const action=decide(symbol,candles.slice(0,i+1)).action;if(!halted && action==='AL'&&qty===0)pending='AL';if(action==='SAT'&&qty>0)pending='SAT';}
  }
  const finalPrice=candles.at(-1)?.close??0;const equity=cash+qty*finalPrice*(1-feeRate);
  return {budget,maxTrade,maxLoss,feeRate,cash,equity,profitLoss:equity-budget,fees,maxDrawdown,openQuantity:qty,halted,trades,curve,notice:'Geçmiş simülasyon; gerçek kazanç veya gelecek performans garantisi değildir. Zarar sınırı fiyat sıçramalarında aşılabilir.'};
}
