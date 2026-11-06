import { createPublicKey } from 'node:crypto';
import { verifyNewsArticle } from './news-evidence.js';

const MAX_FEED_BYTES = 96 * 1024;

async function readFeed(response) {
  if (!response.ok || !response.body ||
      !/^application\/json(?:\s*;|$)/i.test(response.headers.get('content-type') || '')) {
    throw Error('INVALID_NEWS_RESPONSE');
  }
  const reader = response.body.getReader();
  const chunks = [];
  let size = 0;
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > MAX_FEED_BYTES) throw Error('NEWS_RESPONSE_TOO_LARGE');
      chunks.push(value);
    }
  } finally {
    if (size > MAX_FEED_BYTES) await reader.cancel().catch(() => {});
    reader.releaseLock();
  }
  return JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(Buffer.concat(chunks)));
}

export function createSignedNewsProvider({
  source = process.env.PARA_SIGNED_NEWS_SOURCE,
  endpoint = process.env.PARA_SIGNED_NEWS_URL,
  publicKey = process.env.PARA_SIGNED_NEWS_PUBLIC_KEY,
  fetchImpl = fetch,
  clock = Date.now,
} = {}) {
  let url, key;
  try {
    if (!/^[a-zA-Z0-9_-]{1,64}$/.test(source || '') ||
        typeof publicKey !== 'string' || publicKey.length > 256) return null;
    url = new URL(endpoint);
    if (url.protocol !== 'https:' || url.username || url.password || url.hash || url.search) return null;
    key = createPublicKey({ key: Buffer.from(publicKey, 'base64'), format: 'der', type: 'spki' });
    if (key.asymmetricKeyType !== 'ed25519') return null;
  } catch {
    return null;
  }

  const trustedSources = { [source]: { url: url.href, publicKey: key } };
  return async function loadSignedNews(symbol) {
    if (typeof symbol !== 'string' || !/^[A-Z0-9]{1,20}_[A-Z0-9]{1,20}$/.test(symbol)) return null;
    const requestUrl = new URL(url);
    requestUrl.searchParams.set('symbol', symbol);
    try {
      const response = await fetchImpl(requestUrl.href, {
        method: 'GET', redirect: 'error', headers: { Accept: 'application/json' },
        signal: AbortSignal.timeout(5_000),
      });
      const { payload, signature, article } = await readFeed(response);
      const evidence = verifyNewsArticle({ payload, signature }, article, {
        trustedSources, symbol, now: clock(),
      });
      if (evidence.verified) return { evidence, article };
    } catch {
      // Missing, oversized, invalid or unavailable evidence is omitted from the analysis.
    }
    return null;
  };
}
