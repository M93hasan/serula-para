// Independent, hypothetical one-candle measurement; never produces orders.
export function evaluateAIHistory(history,markets,{feeRate=0.001,slippageRate=0.001,delayMs=0,now=Date.now()}={}) {
  if(![feeRate,slippageRate].every(n=>Number.isFinite(n)&&n>=0&&n<=0.05)||!Number.isSafeInteger(delayMs)||delayMs<0)throw Error('Invalid assumptions');
  const results=history.map(d=>{
    const base={symbol:d.symbol,decisionTime:d.time,action:d.action,model:d.model||null,source:d.source||null,status:'pending'};
    if(!Number.isSafeInteger(d.time)||!['BTC_TRY','ETH_TRY'].includes(d.symbol)||!['AL','SAT','BEKLE'].includes(d.action))return {...base,status:'invalid'};
    const candles=[...(markets.find(m=>m.symbol===d.symbol)?.candles||[])].sort((a,b)=>a.time-b.time);
    // Entry must be at an open strictly after the completed decision and latency.
    const candle=candles.find(c=>Number.isSafeInteger(c.time)&&Number.isSafeInteger(c.closeTime)&&c.time>d.time+delayMs&&c.closeTime<=now&&c.closeTime===c.time+3600000-1&&[c.open,c.high,c.low,c.close].every(n=>Number.isFinite(n)&&n>0)&&c.high>=Math.max(c.open,c.close,c.low)&&c.low<=Math.min(c.open,c.close,c.high));
    if(!candle)return base;
    const out={...base,status:'observed',observationTime:candle.closeTime,entryTime:candle.time,marketMove:(candle.close/candle.open)-1};
    // SAT requires a pre-existing position; BEKLE is not a trade or a win/loss.
    if(d.action!=='AL')return {...out,simulatedReturn:null,maxAdverseMove:null};
    const entry=candle.open*(1+slippageRate)*(1+feeRate),exit=candle.close*(1-slippageRate)*(1-feeRate),low=candle.low*(1-slippageRate)*(1-feeRate);
    return {...out,simulatedReturn:exit/entry-1,maxAdverseMove:Math.min(0,low/entry-1)};
  });
  return {notice:'Varsayımsal tek saatlik gözlem; gerçek işlem veya başarı oranı değildir. SAT için önceki pozisyon bilinmiyor.',assumptions:{feeRate,slippageRate,delayMs,horizon:'one closed hourly candle',currency:'TRY'},results};
}
