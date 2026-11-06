import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,readFileSync,rmSync,writeFileSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {WindowsBinanceAccountService} from '../engine/windows-binance-account-service.js';
import {seal} from '../engine/vault.js';

const protector=({mode,value,principal,provider})=>{
  assert.equal(principal,'local-desktop');assert.equal(provider,'binance-tr');
  return mode==='protect' ? Buffer.from('DPAPI:'+value).toString('base64') :
    Buffer.from(value,'base64').toString().replace(/^DPAPI:/,'');
};
test('Binance DPAPI vault opens after restart without password, never exposes plaintext',async t=>{
  const dir=mkdtempSync(join(tmpdir(),'para-binance-dpapi-'));t.after(()=>rmSync(dir,{recursive:true,force:true}));
  const path=join(dir,'binance-tr.dpapi');
  let observed;
  const client={account:async keys=>{observed=keys;return {data:{accountAssets:[{asset:'TRY',free:'20',locked:'1'}]}}}};
  const service=new WindowsBinanceAccountService({path,protector,client});
  service.save({apiKey:'readonly-key',secretKey:'readonly-secret'});
  assert.equal(readFileSync(path,'utf8').includes('readonly-secret'),false);
  const restarted=new WindowsBinanceAccountService({path,protector,client});
  assert.equal(restarted.exists(),true);
  assert.deepEqual(await restarted.balance(),[{asset:'TRY',free:'20',locked:'1'}]);
  assert.deepEqual(observed,{apiKey:'readonly-key',secretKey:'readonly-secret'});
  assert.throws(()=>restarted.save({apiKey:'new',secretKey:'new',replace:false}),/Vault state changed/);
  await assert.rejects(restarted.balance('hidden-password'),/INVALID_INPUT/);
  restarted.remove();assert.equal(restarted.exists(),false);
});
test('Legacy Binance vault migrates explicitly and original remains intact',t=>{
  const dir=mkdtempSync(join(tmpdir(),'para-binance-migrate-'));t.after(()=>rmSync(dir,{recursive:true,force:true}));
  const old=join(dir,'binance-tr.vault'),path=join(dir,'binance-tr.dpapi'),pass='this-is-an-old-vault-password';
  const encrypted=seal({apiKey:'key-1',secretKey:'secret-1'},pass);writeFileSync(old,encrypted);
  const vault=new WindowsBinanceAccountService({path,protector});
  assert.throws(()=>vault.migrate({legacyPath:old,passphrase:'wrong-password-is-long-enough'}));
  assert.equal(vault.exists(),false);
  vault.migrate({legacyPath:old,passphrase:pass});
  assert.equal(readFileSync(old,'utf8'),encrypted);
  assert.equal(vault.exists(),true);
  assert.throws(()=>vault.migrate({legacyPath:old,passphrase:pass}));
});
test('DPAPI errors and damaged ciphertext fail closed, keeping original file',t=>{
  const dir=mkdtempSync(join(tmpdir(),'para-binance-fail-'));t.after(()=>rmSync(dir,{recursive:true,force:true}));
  const path=join(dir,'binance-tr.dpapi');
  const good=new WindowsBinanceAccountService({path,protector});
  good.save({apiKey:'key',secretKey:'secret'});
  const original=readFileSync(path,'utf8');
  const bad=new WindowsBinanceAccountService({path,protector:()=>{throw Error('DPAPI_UNAVAILABLE');}});
  assert.throws(()=>bad.save({apiKey:'replacement',secretKey:'replacement',replace:true}),/VAULT_UNLOCK_FAILED/);
  assert.equal(readFileSync(path,'utf8'),original);
  writeFileSync(path,JSON.stringify({...JSON.parse(original),data:'bad'}));
  assert.throws(()=>good.remove(),/VAULT_UNLOCK_FAILED/);
});
