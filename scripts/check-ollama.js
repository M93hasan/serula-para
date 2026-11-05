// Opt-in local smoke test; synthetic OHLCV, no exchange access or credentials.
import { AIAnalyst } from '../engine/ai-analyst.js';
const model=process.env.PARA_OLLAMA_MODEL;
if(!model){console.error('PARA_OLLAMA_MODEL ayarlanmamış.');process.exitCode=1;}
else {
  const now=Date.now(), hour=3600000, end=Math.floor(now/hour)*hour;
  const candles=Array.from({length:20},(_,i)=>({time:end-(20-i)*hour,closeTime:end-(19-i)*hour-1,open:100,high:102,low:99,close:101,volume:10}));
  const ai=new AIAnalyst({model});
  for(const symbol of ['BTC_TRY','ETH_TRY']){
    const result=await ai.analyze({symbol,price:101,priceTime:now,candles});
    const ok=result.roles.length===6&&result.action==='BEKLE';
    console.log(JSON.stringify({symbol,model,synthetic:true,completed:ok,action:result.action,reason:result.reason,roles:result.roles}));
    if(!ok)process.exitCode=1;
  }
}
