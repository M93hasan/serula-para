import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const source=readFileSync(new URL('../src/main.js',import.meta.url),'utf8');
test('web settings no longer reference Cloudflare Access sign-in or logout endpoints',()=>{
  assert.doesNotMatch(source,/\/cdn-cgi\/access\/(?:login|logout)/);
  assert.doesNotMatch(source,/Google ile giriş \/ Cloudflare Access/);
  assert.match(source,/login\.href='\/auth\/google\/login'/);
  assert.match(source,/fetch\('\/auth\/logout'/);
});
test('Google web session hides local engine and displays session status',()=>{
  assert.match(source,/if\(webMode\)\{[\s\S]*?\$\('#local-login'\)\.hidden=true/);
  assert.match(source,/googleBox\.hidden=true/);
  assert.match(source,/Google oturumu açık:/);
  assert.match(source,/logout\.disabled=false/);
  assert.match(source,/credentials:'same-origin'/);
});
test('Windows localhost Google and local token fallback remain present',()=>{
  assert.match(source,/if\(!webMode\)\{/);
  assert.match(source,/\$\('#local-login'\)\.addEventListener\('submit'/);
  assert.match(source,/\/auth\/google\/status/);
  assert.match(source,/\/auth\/google\/start/);
});
