// Public editorial RSS headlines only. Fixed sources, strict timestamps and URLs.
// Publisher verification means allowlisted origin + published date; it does not prove a claim true.
const SOURCES=Object.freeze([
  {name:'CoinDesk',url:'https://www.coindesk.com/arc/outboundfeeds/rss/',host:'www.coindesk.com'},
  {name:'Cointelegraph',url:'https://cointelegraph.com/rss',host:'cointelegraph.com'}
]);
const extract=(xml,tag)=>{const m=xml.match(new RegExp('<'+tag+'(?:\\s[^>]*)?>([\\s\\S]*?)<\\/'+tag+'>','i'));return m?.[1]?.replace(/^<!\[CDATA\[|\]\]>$/g,'').trim()||'';};
const clean=s=>s.replace(/<[^>]*>/g,'').replace(/&amp;/g,'&').replace(/&quot;/g,'"').replace(/&apos;/g,"'").replace(/&lt;/g,'<').replace(/&gt;/g,'>').trim();
export function parseTrustedFeed(xml,source,now=Date.now()){
 if(typeof xml!=='string'||xml.length>1500000||!SOURCES.some(x=>x.name===source.name&&x.host===source.host))throw Error('INVALID_NEWS_FEED');
 const items=xml.match(/<item(?:\s[^>]*)?>[\s\S]*?<\/item>/gi)||[];
 const results=[];
 for(const item of items.slice(0,100)){
  const title=clean(extract(item,'title')).slice(0,240),link=clean(extract(item,'link')),rawDate=extract(item,'pubDate');
  const publishedAt=Date.parse(rawDate);
  if(!title||title.length<12||!Number.isSafeInteger(publishedAt)||publishedAt>now+60000||now-publishedAt>86400000)continue;
  let url;try{url=new URL(link);}catch{continue;}
  if(url.protocol!=='https:'||!(url.hostname===source.host||url.hostname===source.host.replace(/^www\./,''))||url.username||url.password)continue;
  results.push({publisher:source.name,title,url:url.href,publishedAt,verifiedAt:now});
 }
 return results;
}
export class TrustedNews {
 #fetch;#clock;#cached=null;#lastFetch=0;#pending=null;
 constructor({fetchImpl=fetch,clock=Date.now}={}){this.#fetch=fetchImpl;this.#clock=clock;}
 async latest(){
  const now=this.#clock();
  if(this.#cached&&now-this.#lastFetch<300000)return this.#cached;
  if(this.#pending)return this.#pending;
  this.#pending=(async()=>{
   const articles=[],errors=[];
   for(const source of SOURCES){
    try{
     const response=await this.#fetch(source.url,{method:'GET',redirect:'error',signal:AbortSignal.timeout(7000),headers:{Accept:'application/rss+xml, application/xml, text/xml'}});
     if(!response.ok)throw Error('FEED_HTTP_ERROR');
     const xml=await response.text();
     const parsed=parseTrustedFeed(xml,source,this.#clock());
     if(!parsed.length)throw Error('FEED_EMPTY_OR_STALE');
     articles.push(...parsed);
    }catch{errors.push(source.name);}
   }
   // Both independent publishers must provide timely items to mark the briefing verified.
   const verified=errors.length===0&&new Set(articles.map(x=>x.publisher)).size===SOURCES.length;
   const result={verified,asOf:this.#clock(),articles:articles.sort((a,b)=>b.publishedAt-a.publishedAt).slice(0,15),sources:SOURCES.map(x=>x.name),unavailable:errors};
   if(verified){this.#cached=result;this.#lastFetch=this.#clock();}
   return result;
  })();
  try{return await this.#pending;}finally{this.#pending=null;}
 }
}
