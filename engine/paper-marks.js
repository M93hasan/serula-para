// Marks are derived exclusively from the local scanner, never from HTTP request bodies.
// The paper ledger currently defines TRY minor units only; other quotes remain unpriced.
export async function scannerPaperMarks({paper,scanner,universe,now=Date.now()}){
  const positions=paper.status().positions;if(!positions.length)return [];
  const catalog=await universe.discover();
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
