// Health check sends no market data, prompts, credentials or arbitrary URLs.
export async function ollamaStatus({fetchImpl=fetch,model=process.env.PARA_OLLAMA_MODEL||''}={}){
  if(!/^[A-Za-z0-9_.:-]{1,100}$/.test(model))return {available:false,reason:'MODEL_NOT_CONFIGURED'};
  try{const response=await fetchImpl('http://127.0.0.1:11434/api/tags',{method:'GET',redirect:'error',signal:AbortSignal.timeout(3000)});if(!response.ok)throw Error();const body=await response.json();if(!Array.isArray(body.models))throw Error();return {available:body.models.some(x=>x?.name===model||x?.model===model),model,reason:body.models.some(x=>x?.name===model||x?.model===model)?'MODEL_FOUND':'MODEL_NOT_FOUND'};}catch{return {available:false,model,reason:'OLLAMA_UNAVAILABLE'};}
}
