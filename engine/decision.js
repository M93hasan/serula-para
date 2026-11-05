// Deterministic SMA research signal; confidence is indicator strength, not probability.
export function decide(symbol,candles) {
  const last=candles.at(-1);if(candles.length<20) return {symbol,action:'BEKLE',score:0,reason:'Yetersiz mum verisi',time:last?.closeTime??null};
  const closes=candles.map(c=>c.close);const avg=n=>closes.slice(-n).reduce((a,b)=>a+b,0)/n;
  const fast=avg(5),slow=avg(20),diff=(fast-slow)/slow;
  const score=Math.min(100,Math.round(Math.abs(diff)*2000));
  const action=diff>0.002?'AL':diff< -0.002?'SAT':'BEKLE';
  return {symbol,action,score,reason:`5 mum ortalaması 20 mum ortalamasına göre %${(diff*100).toFixed(2)} değişimde`,time:last.closeTime};
}
export function selectMarket(markets){
  if(!markets.length)throw Error('No market');
  return [...markets].sort((a,b)=>b.candles.slice(-20).reduce((s,c)=>s+c.quoteVolume,0)-a.candles.slice(-20).reduce((s,c)=>s+c.quoteVolume,0)||a.symbol.localeCompare(b.symbol))[0];
}
