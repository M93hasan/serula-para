// Public, credential-free network probe. Fixed Binance TR endpoint; never accepts user URLs.
const ENDPOINT='https://www.binance.tr/open/v1/common/time';
export async function diagnoseBinanceConnection({fetchImpl=fetch}={}){
  let response;
  try {
    response=await fetchImpl(ENDPOINT,{
      method:'GET',redirect:'manual',
      headers:{Accept:'application/json'},
      signal:AbortSignal.timeout(7000)
    });
  }catch(error){
    // Avoid leaking internal network details or request information.
    return {reachable:false,status:'NETWORK_ERROR',httpStatus:null,detail:error?.name==='TimeoutError'?'TIMEOUT':'FETCH_FAILED',credentialFree:true};
  }
  const status=response.status;
  if(status>=300&&status<400)return {reachable:false,status:'REDIRECT',httpStatus:status,credentialFree:true};
  if(status===403||status===451)return {reachable:false,status:'ACCESS_BLOCKED',httpStatus:status,credentialFree:true};
  if(status===429||status===418)return {reachable:false,status:'RATE_LIMITED',httpStatus:status,credentialFree:true};
  if(!response.ok)return {reachable:false,status:'HTTP_ERROR',httpStatus:status,credentialFree:true};
  // HTTP 200 is proof of network reachability, not proof of API authentication.
  return {reachable:true,status:'HTTP_OK',httpStatus:status,credentialFree:true};
}
