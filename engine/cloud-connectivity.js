// Connectivity-only probes: no credentials, prompts, or market data sent.
const ENDPOINTS=Object.freeze({
  openai:'https://api.openai.com/v1/models',
  anthropic:'https://api.anthropic.com/v1/models',
  gemini:'https://generativelanguage.googleapis.com/v1beta/models',
  deepseek:'https://api.deepseek.com/models',
  ollama_cloud:'https://ollama.com/api/tags'
});
export async function cloudConnectivity({fetchImpl=fetch,timeoutMs=5000}={}){
  if(!Number.isInteger(timeoutMs)||timeoutMs<1000||timeoutMs>10000)throw Error('INVALID_TIMEOUT');
  const result=[];
  for(const [provider,url] of Object.entries(ENDPOINTS)){
    try{
      const response=await fetchImpl(url,{method:'GET',redirect:'error',signal:AbortSignal.timeout(timeoutMs)});
      // Unauthorized is a successful network reachability test, not proof of API key validity.
      result.push({provider,reachable:response.status>=200&&response.status<500,status:response.status,credentialsVerified:false});
    }catch{
      result.push({provider,reachable:false,status:null,credentialsVerified:false});
    }
  }
  return result;
}
