import test from 'node:test';
import assert from 'node:assert/strict';
import { parseTrustedFeed, TrustedNews } from '../engine/trusted-news.js';
import { movementRisk } from '../engine/market-scanner.js';

const now=Date.UTC(2026,10,6,12);
const rss=(date=now,link='https://www.coindesk.com/markets/bitcoin')=>'<rss><channel><item><title>Bitcoin trading outlook and market liquidity</title><link>'+link+'</link><pubDate>'+new Date(date).toUTCString()+'</pubDate></item></channel></rss>';
test('news validation requires verified publisher, article date and HTTPS origin',()=>{
 const src={name:'CoinDesk',host:'www.coindesk.com'};
 assert.equal(parseTrustedFeed(rss(),src,now).length,1);
 assert.equal(parseTrustedFeed(rss(now-90000000),src,now).length,0);
 assert.equal(parseTrustedFeed(rss(now,'https://attacker.example/news'),src,now).length,0);
 assert.equal(parseTrustedFeed(rss(now,'http://www.coindesk.com/story'),src,now).length,0);
 assert.throws(()=>parseTrustedFeed(rss(),{name:'Made Up',host:'www.coindesk.com'},now),/INVALID_NEWS_FEED/);
});
test('two independent fresh publishers required before news can be marked verified',async()=>{
 const feed=new TrustedNews({clock:()=>now,fetchImpl:async url=>({ok:true,text:async()=>rss(now,url.includes('coindesk')?'https://www.coindesk.com/article':'https://cointelegraph.com/article')})});
 const result=await feed.latest();
 assert.equal(result.verified,true);assert.equal(result.articles.length,2);
 assert.deepEqual(new Set(result.articles.map(x=>x.publisher)),new Set(['CoinDesk','Cointelegraph']));
 const failed=new TrustedNews({clock:()=>now,fetchImpl:async url=>{if(url.includes('cointelegraph'))throw Error('offline');return {ok:true,text:async()=>rss()};}});
 assert.equal((await failed.latest()).verified,false);
});
const candles=(last=100)=>Array.from({length:35},(_,i)=>({close:i===34?last:100}));
test('sudden candle moves, live price jumps and sustained volatility reject candidates',()=>{
 assert.equal(movementRisk(candles(100),100).safe,true);
 assert.equal(movementRisk(candles(115),115).reason,'SHARP_MOVE_OR_HIGH_VOLATILITY');
 assert.equal(movementRisk(candles(100),120).safe,false);
 assert.equal(movementRisk([],100).reason,'MISSING_RISK_DATA');
});
