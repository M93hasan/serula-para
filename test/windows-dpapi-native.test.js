import { test } from 'node:test';
import assert from 'node:assert/strict';
import { windowsDpapi } from '../engine/windows-ai-provider-vault.js';

test('Windows CurrentUser protection round trip', { skip: process.platform !== 'win32' }, () => {
  const principal = 'local-desktop';
  const provider = 'openai';
  const value = 'synthetic-fixture-not-a-real-credential';
  const data = windowsDpapi({ mode: 'protect', value, principal, provider });
  assert.notEqual(data, value);
  assert.equal(windowsDpapi({ mode: 'unprotect', value: data, principal, provider }), value);
  assert.throws(() => windowsDpapi({ mode: 'unprotect', value: data, principal: 'google:sample', provider }));
});
