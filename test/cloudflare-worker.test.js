import test from 'node:test';
import assert from 'node:assert/strict';
import worker from '../cloudflare/worker.js';

const env = {
  ASSETS: {
    fetch: async () => new Response('<!doctype html><title>PARA</title>', {
      headers: { 'Content-Type': 'text/html; charset=utf-8' }
    })
  }
};

test('web API denies access to local engine and keys', async () => {
  for (const path of ['/api/account', '/api/analysis', '/api/vault', '/api/ai/history']) {
    const res = await worker.fetch(new Request('https://preview.example'+path), env);
    assert.equal(res.status, 503);
    assert.equal((await res.json()).error, 'WEB_BACKEND_UNAVAILABLE');
    assert.equal(res.headers.get('Cache-Control'), 'no-store');
  }
});

test('public status discloses no private account data', async () => {
  const res = await worker.fetch(new Request('https://preview.example/api/health'), env);
  assert.equal(res.status, 200);
  assert.deepEqual(await res.json(), {
    status: 'preview-only', api_available: false, real_orders_enabled: false
  });
});

test('static preview serves assets with browser security headers', async () => {
  const res = await worker.fetch(new Request('https://preview.example/'), env);
  assert.equal(res.status, 200);
  assert.equal(res.headers.get('X-Frame-Options'), 'DENY');
  assert.equal(res.headers.get('Cache-Control'), 'no-store');
  assert.match(res.headers.get('Content-Security-Policy'), /connect-src 'self'/);
});

test('non-read HTTP methods are rejected outside API', async () => {
  const res = await worker.fetch(new Request('https://preview.example/', {method: 'POST'}), env);
  assert.equal(res.status, 405);
});
