import { randomBytes, scryptSync, createCipheriv, createDecipheriv } from 'node:crypto';
import { mkdirSync, writeFileSync, readFileSync } from 'node:fs';
import { dirname } from 'node:path';

// Passphrase is supplied by the user and never stored in the vault.
export function seal(credentials, passphrase) {
  if(typeof passphrase!=='string'||passphrase.length<16) throw Error('Passphrase must contain at least 16 characters');
  if(!credentials?.apiKey||!credentials?.secretKey) throw Error('Credentials required');
  const salt=randomBytes(16), iv=randomBytes(12), key=scryptSync(passphrase,salt,32,{N:32768,r:8,p:1,maxmem:64*1024*1024});
  const cipher=createCipheriv('aes-256-gcm',key,iv); cipher.setAAD(Buffer.from('para-binance-tr-v1'));
  const data=Buffer.concat([cipher.update(JSON.stringify(credentials),'utf8'),cipher.final()]); key.fill(0);
  return JSON.stringify({version:1,salt:salt.toString('base64'),iv:iv.toString('base64'),tag:cipher.getAuthTag().toString('base64'),data:data.toString('base64')});
}
export function unseal(envelope,passphrase) {
  const box=JSON.parse(envelope); if(box.version!==1) throw Error('Unsupported vault');
  const salt=Buffer.from(box.salt,'base64'),iv=Buffer.from(box.iv,'base64'),tag=Buffer.from(box.tag,'base64');
  if(salt.length!==16||iv.length!==12||tag.length!==16) throw Error('Invalid vault');
  const key=scryptSync(passphrase,salt,32,{N:32768,r:8,p:1,maxmem:64*1024*1024});
  try {const d=createDecipheriv('aes-256-gcm',key,iv); d.setAAD(Buffer.from('para-binance-tr-v1')); d.setAuthTag(tag); return JSON.parse(Buffer.concat([d.update(Buffer.from(box.data,'base64')),d.final()]).toString());} finally {key.fill(0);}
}
export function saveVault(path,credentials,passphrase) { mkdirSync(dirname(path),{recursive:true,mode:0o700}); writeFileSync(path,seal(credentials,passphrase),{flag:'wx',mode:0o600}); }
export function loadVault(path,passphrase) { return unseal(readFileSync(path,'utf8'),passphrase); }
