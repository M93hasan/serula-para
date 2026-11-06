import {verify,createHash} from 'node:crypto';
// Evidence validation only. This never authorizes or executes a paper/real order.
export function verifyNewsEvidence(envelope,{trustedKeys={},symbol,now=Date.now(),maxAgeMs=300000}={}){
  try{
    if(!Number.isSafeInteger(now)||!Number.isSafeInteger(maxAgeMs)||maxAgeMs<1||maxAgeMs>300000)throw Error();
    if(typeof envelope?.payload!=='string'||envelope.payload.length>16000||typeof envelope.signature!=='string'||envelope.signature.length>1024)throw Error();
    const data=JSON.parse(envelope.payload);
    if(Object.keys(data).sort().join(',')!=='expiresAt,id,issuedAt,source,symbol'||typeof data.id!=='string'||!data.id||data.id.length>128||data.symbol!==symbol||!Number.isSafeInteger(data.issuedAt)||!Number.isSafeInteger(data.expiresAt)||data.issuedAt>now||data.expiresAt<=now||data.expiresAt<=data.issuedAt||data.expiresAt-data.issuedAt>maxAgeMs||now-data.issuedAt>maxAgeMs)throw Error();
    if(!Object.hasOwn(trustedKeys,data.source)||!verify(null,Buffer.from(envelope.payload),trustedKeys[data.source],Buffer.from(envelope.signature,'base64')))throw Error();
    return {verified:true,id:data.id,source:data.source,symbol:data.symbol,expiresAt:data.expiresAt};
  }catch{return {verified:false,reason:'NEWS_UNVERIFIED'};}
}

// Authenticity and content integrity are not proof that a report is true or relevant.
// The source and its URL must be configured by the operator, never by an API caller.
export function verifyNewsArticle(envelope,article,{trustedSources={},symbol,now=Date.now(),maxAgeMs=300000}={}){
  try{
    if(typeof envelope?.payload!=='string'||envelope.payload.length>16000||typeof envelope.signature!=='string'||envelope.signature.length>1024||typeof article!=='string'||Buffer.byteLength(article)>65536||!article.trim())throw Error();
    const data=JSON.parse(envelope.payload);
    if(!data||Array.isArray(data)||Object.keys(data).sort().join(',')!=='articleSha256,expiresAt,id,issuedAt,source,symbol,url')throw Error();
    const source=Object.hasOwn(trustedSources,data.source)?trustedSources[data.source]:null;
    if(!source||typeof source.url!=='string'||data.url!==source.url||!/^https:\/\//.test(source.url)||!source.publicKey)throw Error();
    const url=new URL(source.url);if(url.username||url.password||url.hash)throw Error();
    if(typeof data.id!=='string'||!data.id||data.id.length>128||data.symbol!==symbol||!Number.isSafeInteger(now)||!Number.isSafeInteger(maxAgeMs)||maxAgeMs<1||maxAgeMs>300000||!Number.isSafeInteger(data.issuedAt)||!Number.isSafeInteger(data.expiresAt)||data.issuedAt>now||data.expiresAt<=now||data.expiresAt<=data.issuedAt||data.expiresAt-data.issuedAt>maxAgeMs||now-data.issuedAt>maxAgeMs)throw Error();
    if(!/^[a-f0-9]{64}$/.test(data.articleSha256)||createHash('sha256').update(article,'utf8').digest('hex')!==data.articleSha256||!verify(null,Buffer.from(envelope.payload),source.publicKey,Buffer.from(envelope.signature,'base64')))throw Error();
    return {verified:true,id:data.id,source:data.source,symbol:data.symbol,url:data.url,issuedAt:data.issuedAt,expiresAt:data.expiresAt,articleSha256:data.articleSha256,contentTruthVerified:false};
  }catch{return {verified:false,reason:'NEWS_UNVERIFIED'};}
}
