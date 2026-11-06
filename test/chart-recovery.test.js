import test from 'node:test';
import assert from 'node:assert/strict';
import { MarketData } from '../engine/market-data.js';
import { createServer } from '../engine/server.js';
import { RiskStore } from '../engine/store.js';

test('chart keeps healthy candles, rejects stale quotes and recovers after a 30-second interval', async t => {
  const hour = 3_600_000;
  const start = Math.floor(Date.now() / hour) * hour - 24 * hour;
  const candles = Array.from({ length: 24 }, (_, i) => [
    start + i * hour, '100', '102', '99', '101', '10', start + (i + 1) * hour - 1, '1010',
  ]);
  let now = start + 24 * hour + 1_000;
  let btcOffline = true;
  let btcQuoteAge = 31_000;
  const market = new MarketData({
    clock: () => now,
    exchange: {
      time: async () => ({ timestamp: now }),
      symbols: async () => ({ data: { list: ['BTC_TRY', 'ETH_TRY'].map(symbol => ({
        symbol, type: 1, spotTradingEnable: 1,
      })) } }),
    },
    fetchImpl: async url => {
      const { pathname, searchParams } = new URL(url);
      const btc = searchParams.get('symbol') === 'BTCTRY';
      if (pathname.endsWith('/klines')) {
        return btc && btcOffline ? new Response(null, { status: 503 }) : Response.json(candles);
      }
      return Response.json([{ price: '101', time: now - (btc ? btcQuoteAge : 1_000) }]);
    },
  });
  const token = 't'.repeat(40);
  const simulator = new RiskStore(':memory:', { budget: 1000, maxTrade: 100, maxLoss: 100 });
  const server = createServer({ token, simulator, market });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  t.after(async () => {
    await new Promise(resolve => server.close(resolve));
    simulator.close();
  });

  const url = `http://127.0.0.1:${server.address().port}/api/markets/chart`;
  const request = () => fetch(url, { headers: { Authorization: `Bearer ${token}` } });
  assert.equal((await fetch(url)).status, 403);
  const first = await request();
  assert.equal(first.status, 200);
  assert.deepEqual((await first.json()).markets.map(m => m.symbol), ['ETH_TRY']);

  btcOffline = false;
  now += 29_999;
  const early = await request();
  assert.equal(early.status, 503);
  assert.deepEqual(await early.json(), { error: 'RATE_LIMIT' });

  now++;
  const restored = await request();
  assert.equal(restored.status, 200);
  const { markets } = await restored.json();
  assert.deepEqual(markets.map(m => [m.symbol, m.price, m.candles.length]), [
    ['BTC_TRY', null, 24], ['ETH_TRY', 101, 24],
  ]);
  assert.equal(markets[0].priceTime, null);

  now += 30_000;
  await assert.rejects(market.snapshot(), /Stale price/);

  btcQuoteAge = 1_000;
  now += 30_000;
  const refreshed = await request();
  assert.equal(refreshed.status, 200);
  assert.equal((await refreshed.json()).markets[0].priceTime, now - btcQuoteAge);
});
