// TradingAgents-inspired analysis roles. No exchange credentials, tools, or order methods.
const roles=[['market','Piyasa Analisti'],['bull','Yükseliş Analisti'],['bear','Düşüş Analisti'],['risk','Risk Yöneticisi'],['analyst','AI Trading Analyst']];
const finite=n=>typeof n==='number'&&Number.isFinite(n);
export class AIAnalyst {
  #fetch;#model;#clock;#busy=false;#timeoutMs;
  constructor({fetchImpl=fetch,model=process.env.PARA_OLLAMA_MODEL||'',clock=Date.now,timeoutMs=30000}={}){if(!Number.isInteger(timeoutMs)||timeoutMs<1000||timeoutMs>60000)throw Error('INVALID_AI_TIMEOUT');this.#fetch=fetchImpl;this.#model=model;this.#clock=clock;this.#timeoutMs=timeoutMs;}
  async analyze(input,{catalogApproved=false}={}){
    if(this.#busy)throw Error('AI_BUSY');this.#busy=true;
    const now=this.#clock(), safe={symbol:input?.symbol,time:now,action:'BEKLE',risk:'BELİRSİZ',reason:'Analiz için taze piyasa verisi ve doğrulanmış haber gereklidir.',roles:[],source:'Binance TR halka açık piyasa verisi',model:this.#model || 'ayarlanmamış',provider:'Ollama (yerel)',newsVerified:false};
    try{
      if((!['BTC_TRY','ETH_TRY'].includes(input?.symbol)&&!(catalogApproved&&/^[A-Z0-9]{1,20}_[A-Z0-9]{1,20}$/.test(input?.symbol)))||!finite(input?.price)||input.price<=0||!Number.isSafeInteger(input.priceTime)||now-input.priceTime>300000||input.priceTime>now+5000||!Array.isArray(input.candles)||input.candles.length<20)return {...safe,reason:'Piyasa verisi eksik veya güncel değil.'};
      const candles=input.candles.slice(-20).map(c=>({time:c.time,closeTime:c.closeTime,open:c.open,high:c.high,low:c.low,close:c.close,volume:c.volume}));
      if(candles.some((c,i)=>!Number.isSafeInteger(c.time)||!Number.isSafeInteger(c.closeTime)||c.closeTime>=now||![c.open,c.high,c.low,c.close,c.volume].every(finite)||c.close<=0||c.open<=0||c.high<Math.max(c.open,c.close,c.low)||c.low>Math.min(c.open,c.close,c.high)||c.low<=0||c.volume<0||c.closeTime!==c.time+3600000-1||(i&&c.time!==candles[i-1].time+3600000)))return {...safe,reason:'Mum verisi eksik, geçersiz veya kapanmamış.'};
      if(now-candles.at(-1).closeTime>7200000)return {...safe,reason:'Son kapanmış mum eski; güvenli sonuç BEKLE.'};
      if(!this.#model||!/^[A-Za-z0-9_.:-]{1,100}$/.test(this.#model))return {...safe,reason:'Yerel AI modeli ayarlanmamış. Öneri güvenli olarak BEKLE.'};
      // Allowlist of public data only. Account, portfolio, credentials and env never enter prompts.
      // Compact column-oriented candles retain every validated observation while avoiding
      // repeating the same JSON keys in each of the five local model requests.
      const facts={symbol:input.symbol,price:input.price,priceTime:input.priceTime,candleColumns:['time','closeTime','open','high','low','close','volume'],candles:candles.map(c=>[c.time,c.closeTime,c.open,c.high,c.low,c.close,c.volume]),news:'Doğrulanmış güncel haber kaynağı yok',risk:'Gerçek emir yetkisi yok; bütçe ve komisyon bilinmiyor.'};
      safe.data={price:input.price,priceTime:input.priceTime,lastCandleCloseTime:candles.at(-1).closeTime,candleCount:candles.length};
      safe.roles.push({role:'Haber Analisti',text:'Doğrulanmış güncel haber kaynağı yok; haber analizi kullanılamıyor.'});
      for(const [role,label] of roles){
        if(this.#clock()-input.priceTime>300000)throw Error('stale market');
        const response=await this.#fetch('http://127.0.0.1:11434/api/chat',{method:'POST',redirect:'error',headers:{'Content-Type':'application/json'},signal:AbortSignal.timeout(this.#timeoutMs),body:JSON.stringify({model:this.#model,stream:false,think:false,format:{type:'object',properties:{analysis:{type:'string',minLength:1,maxLength:2000}},required:['analysis'],additionalProperties:false},options:{temperature:0,num_predict:120,num_ctx:4096},messages:[{role:'system',content:`Sen ${label} rolündesin. Yalnızca verilen verileri değerlendir; haber veya risk verisi uydurma. analysis alanında kısa Türkçe analiz içeren JSON üret. İşlem veya araç çalıştırma.`},{role:'user',content:JSON.stringify({role,facts,previous:safe.roles.map(r=>({role:r.role,text:r.text.slice(0,300)}))})}]})});
        if(!response.ok)throw Error('model unavailable');const json=await response.json();if(json?.model && json.model!==this.#model)throw Error('wrong model');if(this.#clock()-input.priceTime>300000)throw Error('stale market');const value=json?.message?.content;
        if(typeof value!=='string'||value.length>4000)throw Error('invalid model result');const parsed=JSON.parse(value);if(!parsed||Array.isArray(parsed)||typeof parsed!=='object'||Object.keys(parsed).length!==1||typeof parsed.analysis!=='string'||!parsed.analysis.trim()||parsed.analysis.length>2000)throw Error('invalid model result');safe.roles.push({role:label,text:parsed.analysis.trim()});
      }
      return {...safe,reason:'Güncel doğrulanmış haber ve bütçe/risk verisi sağlanmadığından otomatik güvenlik sonucu BEKLE.'};
    }catch(error){const errorCode=error?.name==='TimeoutError'?'MODEL_TIMEOUT':error?.message==='stale market'?'STALE_MARKET':error?.message==='wrong model'?'MODEL_MISMATCH':error?.message==='model unavailable'?'MODEL_HTTP_ERROR':error instanceof SyntaxError||error?.message==='invalid model result'?'MODEL_INVALID_OUTPUT':'MODEL_CONNECTION_ERROR';const labels={MODEL_TIMEOUT:'Yerel model süre sınırını aştı',STALE_MARKET:'Analiz sırasında piyasa verisi eskidi; veri geçersiz',MODEL_MISMATCH:'Yanlış model yanıtı geçersiz',MODEL_HTTP_ERROR:'Model servisi hata döndürdü',MODEL_INVALID_OUTPUT:'Yerel model çıktısı geçersiz',MODEL_CONNECTION_ERROR:'Yerel model bağlantısı başarısız'};return {...safe,action:'BEKLE',errorCode,reason:labels[errorCode]+'; güvenli sonuç BEKLE.'};}finally{this.#busy=false;}
  }
}
