import { PaperPortfolio } from './paper-portfolio.js';

const DAY=86400000;
const blank=()=>({realizedNet:0,fees:0,slippage:0,buys:0,sells:0,wins:0,losses:0});
function add(a,key,n){const result=a[key]+n;if(!Number.isSafeInteger(result))throw Error('PAPER_REPORT_OVERFLOW');a[key]=result;}

// Replays the existing local paper journal; never reads a real Binance account.
export function buildPaperReport(config,events,prices,now=Date.now()){
  if(!Array.isArray(events)||!Array.isArray(prices)||!Number.isSafeInteger(now)||now<0||!Number.isFinite(new Date(now).getTime()))throw Error('INVALID_REPORT');
  const date=new Date(now),dayStart=Date.UTC(date.getUTCFullYear(),date.getUTCMonth(),date.getUTCDate()),weekStart=Math.max(0,now-7*DAY);
  const ledger=new PaperPortfolio(config),seen=new Set(),quotes=new Map(config.quotes.map(q=>[q.asset,{asset:q.asset,startingBalance:q.budget,day:blank(),week:blank(),total:blank()}]));
  for(const event of events){
    if(event.kind==='start'){ledger.start();continue;}
    if(event.kind==='halt'){ledger.halt();continue;}
    if(event.kind!=='execute'||!event.order||!Number.isSafeInteger(event.now)||event.now<0||event.now>now)throw Error('INVALID_REPORT_EVENT');
    const result=ledger.execute(event.order,event.now),id=event.order.id;if(seen.has(id))continue;seen.add(id);
    const bucket=quotes.get(event.order.quoteAsset);if(!bucket)throw Error('INVALID_REPORT_EVENT');
    for(const period of ['total',...(event.now>=weekStart?['week']:[]),...(event.now>=dayStart?['day']:[])]){
      const item=bucket[period];add(item,'fees',result.fee);add(item,'slippage',result.slippage);
      if(result.action==='AL')add(item,'buys',1);
      else if(result.action==='SAT'){add(item,'sells',1);add(item,'realizedNet',result.realized);if(result.realized>0)add(item,'wins',1);else if(result.realized<0)add(item,'losses',1);}
    }
  }
  const valuation=ledger.value(prices,now);
  for(const q of valuation.quotes){const item=quotes.get(q.asset);item.currentCash=q.cash;item.currentEquity=q.equity;item.currentUnrealized=q.unrealized;item.openPositions=valuation.positions.filter(p=>p.quoteAsset===q.asset).length;item.dailyUnrealizedChange=null;item.dailyEquityChange=null;}
  return {mode:'paper',asOf:now,dayStartUTC:dayStart,weekStart,quotes:[...quotes.values()],combinedTotal:null,notice:'Sanal sonuç; günlük dönem UTC, hafta son 7 gündür. Ücret/kayma gerçekleşen sonuca dahildir ve ayrıca yeniden düşülmez. Geçmiş günün başlangıç değerleri kaydedilmediği için günlük gerçekleşmemiş kâr ve özkaynak değişimi bilinmiyor. Farklı quote para birimleri toplanmaz.'};
}
