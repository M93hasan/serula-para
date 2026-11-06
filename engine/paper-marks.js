// Marks are derived exclusively from the local scanner, never from HTTP request bodies.
// The paper ledger currently defines TRY minor units only; other quotes remain unpriced.
export async function scannerPaperMarks({paper,scanner,universe,now=Date.now(),catalogTimeoutMs=2000}){
  const positions=paper.status().positions;if(!positions.length)return [];
  // A stalled exchange request must not stall the independent risk monitor forever.
  if(!Number.isSafeInteger(catalogTimeoutMs)||catalogTimeoutMs<1||catalogTimeoutMs>5000)return [];
  if(!Number.isSafeInteger(now))return [];
  const started=performance.now();let timeout;
  const catalog=await Promise.race([
    Promise.resolve().then(()=>universe.discover()),
    new Promise(resolve=>{timeout=setTimeout(()=>resolve(null),catalogTimeoutMs);})
  ]).finally(()=>clearTimeout(timeout));
  if(!catalog)return [];
  now+=Math.max(0,Math.floor(performance.now()-started));
  if(!Number.isSafeInteger(now))return [];
  if(!Number.isSafeInteger(catalog.exchangeTime)||catalog.exchangeTime>now+1000||now-catalog.exchangeTime>120000||!Array.isArray(catalog.markets))return [];
  const results=scanner.status().results;if(!Array.isArray(results))return [];
  const marks=[];
  for(const p of positions){
    if(p.quoteAsset!=='TRY'||!catalog.markets.some(m=>m.symbol===p.symbol&&m.type===1&&m.baseAsset===p.baseAsset&&m.quoteAsset===p.quoteAsset))continue;
    const matches=results.filter(x=>x.symbol===p.symbol&&['candidate','excluded'].includes(x.status));if(matches.length!==1)continue;
    const x=matches[0];if(!Number.isSafeInteger(x.asOf)||x.asOf>now||now-x.asOf>30000||!Number.isSafeInteger(x.priceTime)||x.priceTime>now||now-x.priceTime>30000||!Number.isFinite(x.price)||x.price<=0)continue;
    const price=Math.floor(x.price*100);if(!Number.isSafeInteger(price)||price<=0)continue;
    marks.push({symbol:p.symbol,price,priceTime:x.priceTime});
  }
  return marks;
}
