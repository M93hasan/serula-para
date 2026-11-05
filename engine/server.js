import http from 'node:http';
import { fileURLToPath } from 'node:url';
import { resolve, join } from 'node:path';
import { readFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { timingSafeEqual } from 'node:crypto';
import { RiskStore } from './store.js';
import { AccountService } from './account-service.js';
import { MarketData } from './market-data.js';
import { decide, selectMarket } from './decision.js';
import { backtest } from './backtest.js';

export function createServer({ token, simulator, account = null, market = new MarketData(), distDir = resolve('dist') }) {
  if (typeof token !== 'string' || Buffer.byteLength(token) < 32) throw new Error('Set a random token of at least 32 bytes');
  const expected = Buffer.from(`Bearer ${token}`);
  return http.createServer(async (req, res) => {
    res.setHeader('Cache-Control','no-store'); res.setHeader('X-Content-Type-Options','nosniff');
    res.setHeader('Content-Security-Policy', "default-src 'self'; connect-src 'self'; script-src 'self'; style-src 'self'; object-src 'none'; base-uri 'none'; frame-ancestors 'none'; form-action 'self'");
    const port=String(req.socket.localPort), host=`127.0.0.1:${port}`, origin=`http://${host}`;
    if(req.headers.host!==host || (req.headers.origin && req.headers.origin!==origin) || (req.headers['sec-fetch-site'] && !['same-origin','none'].includes(req.headers['sec-fetch-site']))) {res.writeHead(403).end(); return;}
    if(req.method==='GET' && (req.url==='/' || /^\/assets\/[A-Za-z0-9_-]+\.(js|css)$/.test(req.url))) {
      try {const path=req.url==='/'?'index.html':req.url.slice(1); const data=readFileSync(join(distDir,path)); res.setHeader('Content-Type',path.endsWith('.js')?'text/javascript; charset=utf-8':path.endsWith('.css')?'text/css; charset=utf-8':'text/html; charset=utf-8'); res.end(data);} catch {res.writeHead(404).end();} return;
    }
    res.setHeader('Content-Type','application/json');
    const auth=Buffer.from(req.headers.authorization || '');
    if(auth.length!==expected.length || !timingSafeEqual(auth,expected)) {res.writeHead(403).end('{"error":"forbidden"}');return;}
    if(req.method==='GET' && req.url==='/status') return res.end(JSON.stringify(simulator.status()));
    if(req.method==='POST' && req.url==='/halt') {try {simulator.halt();return res.end(JSON.stringify(simulator.status()));} catch {res.writeHead(503).end('{"error":"storage unavailable"}');return;}}
    if (req.method==='POST' && req.url==='/api/analysis') {
      if(req.headers.origin!==origin || req.headers['sec-fetch-site']!=='same-origin' || req.headers['content-type']!=='application/json' || req.headers['x-para-request']!=='1') {res.writeHead(403).end('{"error":"forbidden"}');return;}
      try {
        let data='',size=0;for await(const chunk of req){size+=chunk.length;if(size>2048){res.writeHead(413).end('{"error":"too large"}');return;}data+=chunk.toString('utf8');}
        const config=JSON.parse(data);if(!config||typeof config!=='object'||Array.isArray(config))throw Error('Invalid configuration');
        // Validate the configuration before any external request.
        backtest('TEST',[],config);
        const snapshot=await market.snapshot();const selected=selectMarket(snapshot.markets);const signal=decide(selected.symbol,selected.candles);
        const result=backtest(selected.symbol,selected.candles,config);
        return res.end(JSON.stringify({asOf:snapshot.asOf,symbol:selected.symbol,price:selected.price,priceTime:selected.priceTime,decision:signal,backtest:result,candleCount:selected.candles.length}));
      } catch {return res.writeHead(503).end('{"error":"analysis unavailable"}');}
    }
    if (account && req.method==='GET' && req.url==='/api/binance-tr/settings') return res.end(JSON.stringify({configured:account.exists()}));
    if (account && req.method==='POST' && ['/api/binance-tr/save','/api/binance-tr/test','/api/binance-tr/delete'].includes(req.url)) {
      if(req.headers.origin!==origin || req.headers['sec-fetch-site']!=='same-origin' || req.headers['content-type']!=='application/json' || req.headers['x-para-request']!=='1') {res.writeHead(403).end('{"error":"forbidden"}');return;}
      let data='', size=0;
      try {
        for await (const chunk of req) {size+=chunk.length; if(size>8192) {res.writeHead(413).end('{"error":"too large"}');return;} data+=chunk.toString('utf8');}
        const input=JSON.parse(data); if(!input||typeof input!=='object'||Array.isArray(input)) throw Error('Invalid input');
        if(req.url.endsWith('/save')) {account.save(input);return res.end('{"ok":true}');}
        if(req.url.endsWith('/delete')) {account.remove(input.passphrase);return res.end('{"ok":true}');}
        const balances=await account.balance(input.passphrase);return res.end(JSON.stringify({connected:true,balances}));
      } catch {if(!res.headersSent) res.writeHead(400).end('{"error":"operation failed"}');return;}
    }
    res.writeHead(404).end('{"error":"not found"}');
  });
}
if (process.argv[1] && fileURLToPath(import.meta.url) === resolve(process.argv[1])) {
  const sim=new RiskStore(join(homedir(),'.para','simulation.sqlite'),{budget:100000,maxTrade:10000,maxLoss:5000});
  createServer({token:process.env.PARA_LOCAL_TOKEN,simulator:sim,account:new AccountService({path:join(homedir(),'.para','binance-tr.vault')})}).listen(8788,'127.0.0.1',()=>console.log('PARA: http://127.0.0.1:8788 (simulation only)'));
}
