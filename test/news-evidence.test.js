import test from 'node:test';
import assert from 'node:assert/strict';
import {generateKeyPairSync,sign} from 'node:crypto';
import {verifyNewsEvidence} from '../engine/news-evidence.js';
import {assessPaperReadiness} from '../engine/paper-gate.js';
const {publicKey,privateKey}=generateKeyPairSync('ed25519'),now=1700000000000;
const make=(changes={})=>{const payload=JSON.stringify({id:'fixture-1',source:'fixture',symbol:'BTC_TRY',issuedAt:now-1000,expiresAt:now+1000,...changes});return {payload,signature:sign(null,Buffer.from(payload),privateKey).toString('base64')};};
const opts={trustedKeys:{fixture:publicKey},symbol:'BTC_TRY',now};
test('signed fixture news binds trusted identity symbol integrity and short validity',()=>{
 assert.equal(verifyNewsEvidence(make(),opts).verified,true);
 for(const envelope of [null,make({source:'unknown'}),make({symbol:'ETH_TRY'}),make({issuedAt:now+1}),make({expiresAt:now}),make({expiresAt:now+600000}),{...make(),payload:make().payload.replace('fixture-1','tampered')}])assert.equal(verifyNewsEvidence(envelope,opts).verified,false);
 assert.equal(verifyNewsEvidence(make(),{...opts,trustedKeys:{}}).verified,false);
});
test('signed fixture evidence and forged AI AL still cannot unlock field execution',()=>{
 const result=assessPaperReadiness({now,decision:{action:'AL',time:now,symbol:'BTC_TRY',newsVerified:true},news:verifyNewsEvidence(make(),opts)});
 assert.equal(result.eligible,false);assert.equal(result.action,'BEKLE');assert.ok(result.reasons.includes('PAPER_EXECUTION_DISABLED'));
});
