// Read-only Binance TR account lookup for authenticated Cloudflare Preview sessions.
// Credentials are used for one request, never persisted, logged or placed into URLs on our origin.
const validCredential=value=>typeof value==='string'&&value.length>0&&value.length<=512&&!/[\u0000-\u001f\u007f]/.test(value);
const validDecimal=value=>typeof value==='string'&&/^\d{1,40}(?:\.\d{1,40})?$/.test(value);
const bytes=new TextEncoder();
const toHex=buffer=>Array.from(new Uint8Array(buffer),x=>x.toString(16).padStart(2,'0')).join('');
export async function readBinanceAccount({apiKey,secretKey},{fetchImpl=fetch,clock=Date.now}={}){
  if(!validCredential(apiKey)||!validCredential(secretKey))throw Error('INVALID_CREDENTIALS');
  const query=new URLSearchParams({timestamp:String(clock()),recvWindow:'5000'}).toString();
  const key=await crypto.subtle.importKey('raw',bytes.encode(secretKey),{name:'HMAC',hash:'SHA-256'},false,['sign']);
  const signature=toHex(await crypto.subtle.sign('HMAC',key,bytes.encode(query)));
  const address='https://www.binance.tr/open/v1/account/spot?'+query+'&signature='+signature;
  let response;
  try {
    response=await fetchImpl(address,{
      method:'GET',redirect:'error',headers:{'X-MBX-APIKEY':apiKey,'Accept':'application/json'},
      signal:AbortSignal.timeout(10000)
    });
  }catch{throw Error('EXCHANGE_UNAVAILABLE');}
  if(response.status===429||response.status===418)throw Error('EXCHANGE_RATE_LIMIT');
  if(!response.ok)throw Error('EXCHANGE_READ_FAILED');
  if(Number(response.headers.get('content-length')||0)>500000)throw Error('INVALID_EXCHANGE_RESPONSE');
  let payload;try{const content=await response.text();if(content.length>500000)throw Error('OVERSIZED');payload=JSON.parse(content);}catch{throw Error('INVALID_EXCHANGE_RESPONSE');}
  if(payload?.code!==0||!Array.isArray(payload?.data?.accountAssets)||payload.data.accountAssets.length>5000)throw Error('EXCHANGE_READ_FAILED');
  const balances=payload.data.accountAssets.map(item=>{
    if(!item||typeof item.asset!=='string'||!/^[-A-Za-z0-9_]{1,32}$/.test(item.asset)||!validDecimal(item.free)||!validDecimal(item.locked))throw Error('INVALID_EXCHANGE_RESPONSE');
    return {asset:item.asset,free:item.free,locked:item.locked};
  });
  // Only return assets with a nonzero balance. No API key, signatures or account permissions leave the Worker.
  return {balances:balances.filter(a=>Number(a.free)>0||Number(a.locked)>0),asOf:clock(),source:'binance-tr',readOnly:true};
}
