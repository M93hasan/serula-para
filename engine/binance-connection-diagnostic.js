// Credential-free diagnostic from the machine running the local engine.
// Never retries aggressively, never accepts arbitrary URLs, never logs secrets.
const TARGETS=Object.freeze([
  {name:'tr-public-time',url:'https://www.binance.tr/open/v1/common/time'},
  {name:'market-public-time',url:'https://api.binance.me/open/v1/common/time'}
]);
function classify(status){
  if(status===403)return 'WAF_BLOCKED';
  if(status===451)return 'REGION_RESTRICTED';
  if(status===418||status===429)return 'RATE_LIMITED';
  if(status>=300&&status<400)return 'REDIRECT';
  if(status>=200&&status<300)return 'REACHABLE';
  return 'HTTP_ERROR';
}
export async function diagnoseLocalBinance({fetchImpl=fetch,timeoutMs=7000}={}){
  const targets=[];
  for(const target of TARGETS){
    try{
      const response=await fetchImpl(target.url,{
        method:'GET',redirect:'manual',headers:{Accept:'application/json'},
        signal:AbortSignal.timeout(timeoutMs)
      });
      targets.push({name:target.name,httpStatus:response.status,status:classify(response.status)});
    }catch(error){
      targets.push({name:target.name,httpStatus:null,status:
        error?.name==='TimeoutError'?'TIMEOUT':'NETWORK_ERROR'});
    }
  }
  return {checkedAt:new Date().toISOString(),source:'windows-local-engine',credentialFree:true,
    targets,hasWafBlock:targets.some(x=>x.status==='WAF_BLOCKED')};
}
