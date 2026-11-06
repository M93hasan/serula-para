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

test('signed article binds exact trusted source, content digest, symbol and time without asserting truth',async()=>{
 const {createHash}=await import('node:crypto');const {verifyNewsArticle}=await import('../engine/news-evidence.js');
 const article='Fixture article',url='https://news.example.test/item/1',digest=createHash('sha256').update(article).digest('hex');
 const envelope=(changes={})=>{const payload=JSON.stringify({id:'a',source:'fixture',symbol:'BTC_TRY',issuedAt:now-1000,expiresAt:now+1000,url,articleSha256:digest,...changes});return {payload,signature:sign(null,Buffer.from(payload),privateKey).toString('base64')};};
 const options={trustedSources:{fixture:{url,publicKey}},symbol:'BTC_TRY',now};
 assert.equal(verifyNewsArticle(envelope(),article,options).contentTruthVerified,false);
 for(const [e,a,o] of [[envelope(),'altered',options],[envelope({symbol:'ETH_TRY'}),article,options],[envelope({expiresAt:now}),article,options],[envelope({url:'https://evil.test/'}),article,options],[envelope(),article,{...options,trustedSources:{}}],[envelope(),'',options]])assert.equal(verifyNewsArticle(e,a,o).verified,false);
 assert.equal(assessPaperReadiness({now,news:verifyNewsArticle(envelope(),article,options)}).eligible,false);
});
