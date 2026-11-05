import http from 'node:http';
import { fileURLToPath } from 'node:url';
import { resolve } from 'node:path';
import { timingSafeEqual } from 'node:crypto';
import { Simulator } from './simulation.js';

export function createServer({ token, simulator }) {
  if (typeof token !== 'string' || Buffer.byteLength(token) < 32) throw new Error('Set a random token of at least 32 bytes');
  const expected = Buffer.from(`Bearer ${token}`);
  return http.createServer((req, res) => {
    res.setHeader('Content-Type', 'application/json'); res.setHeader('Cache-Control', 'no-store');
    res.setHeader('X-Content-Type-Options', 'nosniff');
    const auth = Buffer.from(req.headers.authorization || '');
    if (req.headers.origin || auth.length !== expected.length || !timingSafeEqual(auth, expected)) { res.writeHead(403).end('{"error":"forbidden"}'); return; }
    if (req.method === 'GET' && req.url === '/status') return res.end(JSON.stringify(simulator.status()));
    if (req.method === 'POST' && req.url === '/halt') { simulator.halt(); return res.end(JSON.stringify(simulator.status())); }
    res.writeHead(404).end('{"error":"not found"}');
  });
}
if (process.argv[1] && fileURLToPath(import.meta.url) === resolve(process.argv[1])) {
  const sim = new Simulator({ budget: 100000, maxTrade: 10000, maxLoss: 5000 });
  createServer({ token: process.env.PARA_LOCAL_TOKEN, simulator: sim }).listen(8788, '127.0.0.1', () => console.log('PARA local simulation listening on 127.0.0.1:8788'));
}
