import { test } from 'node:test';
import assert from 'node:assert/strict';
import { windowsDpapi } from '../engine/windows-ai-provider-vault.js';
import { spawnSync } from 'node:child_process';

test('Windows CurrentUser protection round trip', { skip: process.platform !== 'win32' }, () => {
  const probe = spawnSync('pwsh.exe', ['-NoProfile','-NonInteractive','-Command','Write-Output OK'], { encoding: 'utf8', timeout: 10000, stdio: ['ignore','pipe','pipe'], windowsHide: true });
  assert.equal(probe.status, 0, 'PowerShell probe '+(probe.error?.code||'')+' '+(probe.stderr||'').slice(0,120));
  const principal = 'local-desktop';
  const provider = 'openai';
  const value = 'synthetic-fixture-not-a-real-credential';
  const data = windowsDpapi({ mode: 'protect', value, principal, provider });
  assert.notEqual(data, value);
  assert.equal(windowsDpapi({ mode: 'unprotect', value: data, principal, provider }), value);
  assert.throws(() => windowsDpapi({ mode: 'unprotect', value: data, principal: 'google:sample', provider }));
});
