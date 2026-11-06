import {AIAnalyst} from './ai-analyst.js';

// Provider URLs are fixed: arbitrary URLs, redirects and account credentials are never forwarded.
export class CloudAIService {
  #vault;#fetch;#busy=false;#clock;#nextAllowed=0;
  constructor({vault,fetchImpl=fetch,clock=Date.now}){this.#vault=vault;this.#fetch=fetchImpl;this.#clock=clock;}
  // Read-only provider availability probe. No prompts, charges for generation,
  // or account keys exposed to browser/logs. Actual verification requires Windows keys.
  async verifyConnection({provider,principal}){
    if(this.#busy)throw Error('BUSY');
    if(this.#clock()<this.#nextAllowed)throw Error('RATE_LIMIT');
    if(!['openai','gemini'].includes(provider))throw Error('INVALID_PROVIDER');
    this.#busy=true;this.#nextAllowed=this.#clock()+30000;
    try{
      const {apiKey,model}=this.#vault.openForAnalysis({provider,principal});
      if(typeof model!=='string'||!/^[A-Za-z0-9_.:-]{1,100}$/.test(model))throw Error('MODEL_REQUIRED');
      const url=provider==='openai'
        ? 'https://api.openai.com/v1/models/'+encodeURIComponent(model)
        : 'https://generativelanguage.googleapis.com/v1beta/models/'+encodeURIComponent(model);
      let response;
      try{
        response=await this.#fetch(url,{
          method:'GET',redirect:'error',headers:provider==='openai'
            ?{Authorization:'Bearer '+apiKey}:{'x-goog-api-key':apiKey},
          signal:AbortSignal.timeout(10000)
        });
      }catch(error){
        return {provider,model,verified:false,status:error?.name==='TimeoutError'?'TIMEOUT':'NETWORK_ERROR'};
      }
      const status=response.status;
      if(status===200)return {provider,model,verified:true,status:'API_OK'};
      return {provider,model,verified:false,status:
        status===401?'AUTH_REJECTED':status===403?'ACCESS_DENIED':
        status===404?'MODEL_UNAVAILABLE':status===429?'RATE_LIMITED':
        status>=500?'PROVIDER_UNAVAILABLE':'PROVIDER_ERROR'};
    }finally{this.#busy=false;}
  }
  async analyze({provider,passphrase,principal,snapshot}){
    if(this.#busy)throw Error('BUSY');if(this.#clock()<this.#nextAllowed)throw Error('RATE_LIMIT');this.#nextAllowed=this.#clock()+30000;this.#busy=true;let secret=null;
    try{
      secret=this.#vault.openForAnalysis({provider,passphrase,principal});
      const {apiKey,model}=secret;
      if(!/^[A-Za-z0-9_.:-]{1,100}$/.test(model))throw Error('MODEL_REQUIRED');
      const transport=async(url,options)=>{
        if(url!=='http://127.0.0.1:11434/api/chat'||options.method!=='POST')throw Error('INVALID');
        const req=JSON.parse(options.body);const messages=req.messages;
        let endpoint,headers={'Content-Type':'application/json'},body;
        if(provider==='openai'||provider==='deepseek'){
          endpoint=provider==='openai'?'https://api.openai.com/v1/chat/completions':'https://api.deepseek.com/chat/completions';
          headers.Authorization='Bearer '+apiKey;
          body={model,messages,stream:false,response_format:{type:'json_object'}};
          if(provider==='openai')body.max_completion_tokens=180;else body.max_tokens=180;
        }else if(provider==='anthropic'){
          endpoint='https://api.anthropic.com/v1/messages';headers['x-api-key']=apiKey;headers['anthropic-version']='2023-06-01';
          body={model,max_tokens:180,system:messages[0].content,messages:[{role:'user',content:messages[1].content}]};
        }else if(provider==='gemini'){
          endpoint='https://generativelanguage.googleapis.com/v1beta/models/'+encodeURIComponent(model)+':generateContent';headers['x-goog-api-key']=apiKey;
          body={systemInstruction:{parts:[{text:messages[0].content}]},contents:[{role:'user',parts:[{text:messages[1].content}]}],generationConfig:{maxOutputTokens:180,responseMimeType:'application/json'}};
        }else if(provider==='ollama_cloud'){
          endpoint='https://ollama.com/api/chat';headers.Authorization='Bearer '+apiKey;body={...req,model,stream:false,think:false};
        }else throw Error('INVALID');
        const response=await this.#fetch(endpoint,{method:'POST',headers,body:JSON.stringify(body),signal:options.signal,redirect:'error'});
        if(!response.ok)return new Response('',{status:503});
        const data=await response.json();let content;
        if(provider==='openai'||provider==='deepseek')content=data?.choices?.[0]?.message?.content;
        else if(provider==='anthropic')content=data?.content?.filter(x=>x.type==='text').map(x=>x.text).join('');
        else if(provider==='gemini')content=data?.candidates?.[0]?.content?.parts?.map(x=>x.text||'').join('');
        else content=data?.message?.content;
        return new Response(JSON.stringify({message:{content}}),{headers:{'Content-Type':'application/json'}});
      };
      const analyst=new AIAnalyst({model,fetchImpl:transport,clock:this.#clock});
      const result=await analyst.analyze(snapshot,{catalogApproved:true});
      result.provider=provider;if(result.reason.startsWith('Yerel model yanıt'))result.reason='Sağlayıcı yanıt vermedi veya veri geçersiz; güvenli sonuç BEKLE.';return result;
    }finally{secret=null;this.#busy=false;}
  }
}
