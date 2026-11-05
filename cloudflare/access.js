import { createRemoteJWKSet, jwtVerify } from 'jose';

// Access assertions are verified even if a caller bypasses an edge Access policy.
export async function verifyAccess(token, env, keySet) {
  if(typeof token!=='string'||token.length>16000||typeof env.ACCESS_AUD!=='string'||!env.ACCESS_AUD||typeof env.ACCESS_ISSUER!=='string') throw Error('ACCESS_UNAVAILABLE');
  const issuer=new URL(env.ACCESS_ISSUER);
  if(issuer.protocol!=='https:'||! /^[a-z0-9-]+\.cloudflareaccess\.com$/.test(issuer.hostname)||issuer.pathname!=='/'||issuer.port||issuer.username||issuer.password)throw Error('ACCESS_UNAVAILABLE');
  const iss=issuer.origin, jwks=keySet||createRemoteJWKSet(new URL(`${iss}/cdn-cgi/access/certs`));
  const {payload}=await jwtVerify(token,jwks,{issuer:iss,audience:env.ACCESS_AUD,algorithms:['RS256'],requiredClaims:['sub','exp','iat']});
  if(typeof payload.sub!=='string'||!payload.sub||payload.sub.length>200)throw Error('ACCESS_UNAVAILABLE');
  return {id:payload.sub};
}
