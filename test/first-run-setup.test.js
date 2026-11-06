import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

const source=readFileSync(new URL('../src/main.js',import.meta.url),'utf8');

test('first-run setup gates local access in Google, Binance and AI order',()=>{
  const google=source.indexOf('data-setup-step="google"');
  const binance=source.indexOf('data-setup-step="binance"');
  const ai=source.indexOf('data-setup-step="ai"');
  assert.ok(google>0&&google<binance&&binance<ai);
  assert.match(source,/showSetupStep\('google'\)/);
  assert.match(source,/syncSetupFlow\(s\.configured\)/);
});

test('saved encrypted vault state skips completed credential prompts',()=>{
  assert.match(source,/if\(!binanceConfigured\)\{showSetupStep\('binance'\);return;\}/);
  assert.match(source,/providerStates\.some\(item=>item\.configured\)/);
  assert.match(source,/finishSetup\(\)/);
});

test('first-run setup never persists credentials in browser storage',()=>{
  assert.doesNotMatch(source,/(?:localStorage|sessionStorage)\.setItem/);
  assert.match(source,/api\('\/api\/binance-tr\/save',body\)/);
  assert.match(source,/api\('\/api\/ai\/providers\/save',body\)/);
  assert.match(source,/GERÇEK EMİRLER KAPALI/);
});
