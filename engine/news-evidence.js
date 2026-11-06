import {verify} from 'node:crypto';
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
