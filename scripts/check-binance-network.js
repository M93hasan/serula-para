// Windows/local network diagnostic. Never sends or reads API keys, cookies or balance details.
const URLS=Object.freeze([
  'https://www.binance.tr/open/v1/common/time',
  'https://www.binance.tr/open/v1/common/symbols'
]);
export async function checkBinanceNetwork({fetchImpl=fetch}={}){
  const results=[];
  for(const address of URLS){
    const started=Date.now();
    try{
      const response=await fetchImpl(address,{
        method:'GET',
        redirect:'manual',
        headers:{Accept:'application/json'},
        signal:AbortSignal.timeout(8000)
      });
      const code=response.status;
      const state=code===200?'OK':code===403||code===451?'BLOCKED':code===418||code===429?'RATE_LIMIT':code>=300&&code<400?'REDIRECT':'HTTP_ERROR';
      results.push({path:new URL(address).pathname,status:code,state,elapsedMs:Date.now()-started});
      // Never print response bodies or headers: network diagnostics are not an account reader.
      await response.body?.cancel().catch(()=>{});
    }catch(error){
      results.push({path:new URL(address).pathname,status:null,state:error?.name==='TimeoutError'?'TIMEOUT':'NETWORK_ERROR',elapsedMs:Date.now()-started});
    }
  }
  return results;
}
export function formatNetworkResults(results){
  const lines=['PARA Trading - Binance TR ag testi (API anahtari kullanilmaz)'];
  for(const row of results)lines.push(`${row.path}: ${row.state}${row.status===null?'':` (HTTP ${row.status})`} - ${row.elapsedMs}ms`);
  if(results.every(row=>row.state==='OK'))lines.push('SONUC: Genel API erisimi calisiyor. Hesap API yetkisi ayrica test edilmelidir.');
  else if(results.some(row=>row.state==='BLOCKED'))lines.push('SONUC: Binance TR erisimi HTTP 403/451 ile engelledi. API anahtarlarini girmeyin; erisim kosullarini Binance TR destegiyle kontrol edin.');
  else lines.push('SONUC: Genel API baglantisi dogrulanamadi. Ag, saat, guvenlik duvari ve Binance TR durumunu kontrol edin.');
  return lines.join('\n');
}
if(process.argv[1]&&import.meta.url===new URL('file://'+process.argv[1].replaceAll('\\','/')).href){
  const output=await checkBinanceNetwork();
  console.log(formatNetworkResults(output));
  if(output.some(x=>x.state!=='OK'))process.exitCode=1;
}
