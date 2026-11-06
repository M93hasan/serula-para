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
import { AIAnalyst } from './ai-analyst.js';
import { evaluateAIHistory } from './ai-performance.js';
import { MarketUniverse } from './market-universe.js';
import { MarketScanner } from './market-scanner.js';
import { ScanAutomation } from './scan-automation.js';
import { valuePortfolio } from '../src/portfolio.js';
import { PaperStore } from './paper-store.js';
import { AIProviderVault } from './ai-provider-vault.js';
import { CloudAIService } from './cloud-ai-service.js';
import { assessPaperReadiness } from './paper-gate.js';
import { ollamaStatus } from './ollama-status.js';
import { createLocalGoogleAuth } from './local-google-auth.js';
import { scannerPaperMarks } from './paper-marks.js';

export function createServer({ token, simulator, paper = null, account = null, aiProviders = null, cloudAIService = null, market = new MarketData(), universe = new MarketUniverse(), scanner = new MarketScanner({universe}), ai = new AIAnalyst(), accountHistory = null, autoScan = false, googleAuth = null, distDir = resolve('dist'),riskIntervalMs=5000 }) {
  if (typeof token !== 'string' || Buffer.byteLength(token) < 32) throw new Error('Set a random token of at least 32 bytes');
  const expected = Buffer.from(`Bearer ${token}`);
  const localGoogle=googleAuth||createLocalGoogleAuth();
  let latestMarkets=[];
  let latestScanDecision=null;
  const cloudAI=cloudAIService||(aiProviders?new CloudAIService({vault:aiProviders}):null);
  const scanAutomation = new ScanAutomation(scanner);
  const server=http.createServer(async (req, res) => {
    res.setHeader('Cache-Control','no-store'); res.setHeader('X-Content-Type-Options','nosniff');
    res.setHeader('Content-Security-Policy', "default-src 'self'; connect-src 'self'; script-src 'self'; style-src 'self'; object-src 'none'; base-uri 'none'; frame-ancestors 'none'; form-action 'self'");
    const port=String(req.socket.localPort), host=`127.0.0.1:${port}`, origin=`http://${host}`;
    const googleCallback=req.method==='GET'&&req.url?.startsWith('/auth/google/callback?');
    if(req.headers.host!==host || (req.headers.origin && req.headers.origin!==origin) || (req.headers['sec-fetch-site'] && !['same-origin','none',...(googleCallback?['cross-site']:[])].includes(req.headers['sec-fetch-site']))) {res.writeHead(403).end(); return;}
    if(req.url==='/auth/google/status'||req.url==='/auth/google/start'||req.url==='/auth/google/logout'||req.url?.startsWith('/auth/google/callback?')){
      try{
        const result=await localGoogle.handle(new URL(req.url,origin).pathname,new Request(new URL(req.url,origin),{method:req.method,headers:req.headers}));
        if(result){res.writeHead(result.status,Object.fromEntries(result.headers));res.end(await result.text());return;}
      }catch{res.writeHead(503).end();return;}
    }
    if(req.method==='GET' && (req.url==='/' || /^\/assets\/[A-Za-z0-9_-]+\.(js|css|ttf)$/.test(req.url))) {
      try {const path=req.url==='/'?'index.html':req.url.slice(1); const data=readFileSync(join(distDir,path)); res.setHeader('Content-Type',path.endsWith('.js')?'text/javascript; charset=utf-8':path.endsWith('.css')?'text/css; charset=utf-8':path.endsWith('.ttf')?'font/ttf':'text/html; charset=utf-8'); res.end(data);} catch {res.writeHead(404).end();} return;
    }
    res.setHeader('Content-Type','application/json');
    const auth=Buffer.from(req.headers.authorization || '');
    const bearerValid=auth.length===expected.length&&timingSafeEqual(auth,expected);
    const googleSession=localGoogle.user(req.headers.cookie||'');
    if(!bearerValid&&!googleSession) {res.writeHead(403).end('{"error":"forbidden"}');return;}
    if(req.method==='GET'&&req.url==='/api/auth/me')return res.end(JSON.stringify({authenticated:true,provider:googleSession?'google':'local-token'}));
    // Cookie sessions may never bypass the same-origin check on any mutation.
    if(!bearerValid&&googleSession&&req.method!=='GET'&&req.method!=='HEAD'&&
      (req.headers.origin!==origin||req.headers['sec-fetch-site']!=='same-origin'||req.headers['content-type']!=='application/json'||req.headers['x-para-request']!=='1')){
      return res.writeHead(403).end('{"error":"forbidden"}');
    }
    if(req.method==='GET' && req.url==='/status') return res.end(JSON.stringify(simulator.status()));
    if(req.method==='POST' && req.url==='/api/ai/providers/analyze') {
      if(req.headers.origin!==origin||req.headers['sec-fetch-site']!=='same-origin'||req.headers['content-type']!=='application/json'||req.headers['x-para-request']!=='1')return res.writeHead(403).end('{"error":"forbidden"}');
      if(!cloudAI)return res.writeHead(503).end('{"error":"provider unavailable"}');
      try{let body='',size=0;for await(const c of req){size+=c.length;if(size>2048)return res.writeHead(413).end('{"error":"too large"}');body+=c.toString('utf8');}
        const input=JSON.parse(body);if(!input||typeof input!=='object'||Array.isArray(input)||Object.keys(input).some(k=>!['provider','passphrase','symbol','consent'].includes(k))||input.consent!==true||typeof input.symbol!=='string'||!/^[A-Z0-9]{1,20}_[A-Z0-9]{1,20}$/.test(input.symbol))throw Error('INVALID');
        const snapshot=latestMarkets.find(m=>m.symbol===input.symbol);if(!snapshot)throw Error('NO_MARKET');
        const catalog=await universe.discover();if(!catalog.markets.some(m=>m.symbol===input.symbol&&m.type===1))throw Error('UNVERIFIED');
        const result=await cloudAI.analyze({provider:input.provider,passphrase:input.passphrase,snapshot});result.startedAt=result.time;result.time=Date.now();simulator.saveAI(result);return res.end(JSON.stringify(result));
      }catch{return res.writeHead(400).end('{"error":"provider analysis unavailable"}');}
    }
    if(req.method==='GET' && req.url==='/api/ai/providers') {
      if(!aiProviders)return res.writeHead(503).end('{"error":"providers unavailable"}');
      try{return res.end(JSON.stringify({providers:aiProviders.status()}));}catch{return res.writeHead(503).end('{"error":"providers unavailable"}');}
    }
    if(req.method==='POST' && ['/api/ai/providers/save','/api/ai/providers/delete'].includes(req.url)) {
      if(req.headers.origin!==origin||req.headers['sec-fetch-site']!=='same-origin'||req.headers['content-type']!=='application/json'||req.headers['x-para-request']!=='1')return res.writeHead(403).end('{"error":"forbidden"}');
      if(!aiProviders)return res.writeHead(503).end('{"error":"providers unavailable"}');
      try{let body='',size=0;for await(const c of req){size+=c.length;if(size>8192)return res.writeHead(413).end('{"error":"too large"}');body+=c.toString('utf8');}
        const input=JSON.parse(body);if(!input||typeof input!=='object'||Array.isArray(input))throw Error('INVALID');
        const allowed=req.url.endsWith('/save')?['provider','apiKey','model','passphrase','replace']:['provider','passphrase'];if(Object.keys(input).some(x=>!allowed.includes(x)))throw Error('INVALID');
        if(req.url.endsWith('/save'))aiProviders.save(input);else aiProviders.remove(input);
        return res.end('{"ok":true}');
      }catch{return res.writeHead(400).end('{"error":"provider operation failed"}');}
    }
    if(req.method==='GET' && req.url==='/api/paper/status') {
      if(!paper)return res.writeHead(503).end('{"error":"paper unavailable"}');
      try{let marks=[];try{marks=await scannerPaperMarks({paper,scanner,universe});}catch{}return res.end(JSON.stringify({status:paper.status(),valuation:paper.value(marks),performance:paper.report(marks),history:paper.history(),gateHistory:paper.gateHistory(),notice:'Varsayımsal yerel portföy. Sanal işlem bağlantısı henüz yok.'}));}catch{return res.writeHead(503).end('{"error":"paper unavailable"}');}
    }
    if(req.method==='GET' && req.url==='/api/ai/health')return res.end(JSON.stringify(await ollamaStatus()));
    if(req.method==='POST' && req.url==='/api/paper/readiness') {
      if(req.headers.origin!==origin||req.headers['sec-fetch-site']!=='same-origin'||req.headers['content-type']!=='application/json'||req.headers['x-para-request']!=='1')return res.writeHead(403).end('{"error":"forbidden"}');
      if(!paper)return res.writeHead(503).end('{"error":"paper unavailable"}');
      try{let body='',size=0;for await(const c of req){size+=c.length;if(size>256)return res.writeHead(413).end('{"error":"too large"}');body+=c.toString('utf8');}const input=JSON.parse(body);if(!input||Array.isArray(input)||typeof input!=='object'||Object.keys(input).length)throw Error('INVALID');
        let catalog=null;try{catalog=await universe.discover();}catch{}const result=assessPaperReadiness({paper:paper.status(),decision:latestScanDecision?.decision,candidate:latestScanDecision?.candidate,catalog});paper.recordGate(result);return res.end(JSON.stringify(result));
      }catch{return res.writeHead(503).end('{"error":"readiness unavailable"}');}
    }
    if(req.method==='POST' && ['/api/paper/start','/api/paper/stop'].includes(req.url)) {
      if(req.headers.origin!==origin||req.headers['sec-fetch-site']!=='same-origin'||req.headers['content-type']!=='application/json'||req.headers['x-para-request']!=='1')return res.writeHead(403).end('{"error":"forbidden"}');
      if(!paper)return res.writeHead(503).end('{"error":"paper unavailable"}');
      try{if(req.url.endsWith('/start'))paper.start();else paper.halt();return res.end(JSON.stringify({status:paper.status()}));}catch{return res.writeHead(503).end('{"error":"paper unavailable"}');}
    }
    if(req.method==='GET' && req.url==='/api/markets/overview') {
      try{const data=await market.snapshot();latestMarkets=data.markets;return res.end(JSON.stringify(data));}
      catch(err){const code=err.message==='Market request in progress or cooldown'?'RATE_LIMIT':err.message==='Stale price'||err.message==='Incomplete or stale candles'?'STALE_DATA':'MARKET_CONNECTION';return res.writeHead(503).end(JSON.stringify({error:code}));}
    }
    if(req.method==='GET' && req.url==='/api/markets/prices') {
      try{return res.end(JSON.stringify(await market.prices()));}
      catch(err){const code=err.message==='Stale price'?'STALE_DATA':'MARKET_CONNECTION';return res.writeHead(503).end(JSON.stringify({error:code}));}
    }
    if(req.method==='GET' && req.url?.startsWith('/api/markets/valuation-prices?')){
      try {
        const params=new URL(req.url,origin).searchParams;
        if([...params.keys()].some(key=>key!=='assets'))return res.writeHead(400).end('{"error":"INVALID_ASSETS"}');
        const raw=params.get('assets')||'';
        if(raw.length>1000)return res.writeHead(400).end('{"error":"INVALID_ASSETS"}');
        const assets=raw?raw.split(','):[];
        return res.end(JSON.stringify({markets:await market.valuationPrices(assets)}));
      }catch(err){const code=err.message==='Invalid assets'?'INVALID_ASSETS':'MARKET_CONNECTION';return res.writeHead(code==='INVALID_ASSETS'?400:503).end(JSON.stringify({error:code}));}
    }
    if(req.method==='GET' && req.url==='/api/markets/universe') {try{return res.end(JSON.stringify(await universe.discover()));}catch{return res.writeHead(503).end('{"error":"market catalogue unavailable"}');}}
    if(req.method==='GET' && req.url==='/api/markets/scan/auto')return res.end(JSON.stringify(scanAutomation.status()));
    if(req.method==='POST' && req.url==='/api/markets/scan/auto') {
      if(req.headers.origin!==origin||req.headers['sec-fetch-site']!=='same-origin'||req.headers['content-type']!=='application/json'||req.headers['x-para-request']!=='1')return res.writeHead(403).end('{"error":"forbidden"}');
      try{
        let body='',size=0;for await(const c of req){size+=c.length;if(size>256)return res.writeHead(413).end('{"error":"too large"}');body+=c.toString('utf8');}
        const payload=JSON.parse(body);
        if(!payload||typeof payload!=='object'||Array.isArray(payload)||typeof payload.enabled!=='boolean'||Object.keys(payload).length!==1)return res.writeHead(400).end('{"error":"invalid"}');
        scanAutomation.setEnabled(payload.enabled);
        return res.end(JSON.stringify(scanAutomation.status()));
      }catch{return res.writeHead(503).end('{"error":"automation unavailable"}');}
    }
    if(req.method==='GET' && req.url==='/api/markets/scan') {const state=scanner.status();return res.end(JSON.stringify({...state,results:state.results.map(({candles,...item})=>item)}));}
    if(req.method==='POST' && req.url==='/api/markets/scan') {
      if(req.headers.origin!==origin||req.headers['sec-fetch-site']!=='same-origin'||req.headers['content-type']!=='application/json'||req.headers['x-para-request']!=='1')return res.writeHead(403).end('{"error":"forbidden"}');
      try{scanner.start();return res.writeHead(202).end('{"status":"running"}');}catch{return res.writeHead(429).end('{"error":"scan busy or cooldown"}');}
    }
    if(req.method==='POST' && req.url==='/api/ai/scan-best') {
      if(req.headers.origin!==origin||req.headers['sec-fetch-site']!=='same-origin'||req.headers['content-type']!=='application/json'||req.headers['x-para-request']!=='1')return res.writeHead(403).end('{"error":"forbidden"}');
      try{const state=scanner.status(),catalog=await universe.discover();const candidate=state.results.filter(x=>x.status==='candidate'&&Date.now()-x.asOf<300000&&catalog.markets.some(m=>m.symbol===x.symbol&&m.type===1)).sort((a,b)=>a.indicators.estimatedRoundTripCost-b.indicators.estimatedRoundTripCost)[0];if(!candidate)return res.writeHead(409).end('{"error":"no fresh candidate"}');const result=await ai.analyze(candidate,{catalogApproved:true});result.startedAt=result.time;result.time=Date.now();simulator.saveAI(result);latestScanDecision={decision:result,candidate};return res.end(JSON.stringify(result));}catch{return res.writeHead(503).end('{"error":"ai unavailable"}');}
    }
    if(req.method==='POST' && req.url==='/halt') {try {if(paper)paper.halt();simulator.halt();return res.end(JSON.stringify(simulator.status()));} catch {res.writeHead(503).end('{"error":"storage unavailable"}');return;}}
    if (req.method==='POST' && req.url==='/api/analysis') {
      if(req.headers.origin!==origin || req.headers['sec-fetch-site']!=='same-origin' || req.headers['content-type']!=='application/json' || req.headers['x-para-request']!=='1') {res.writeHead(403).end('{"error":"forbidden"}');return;}
      try {
        let data='',size=0;for await(const chunk of req){size+=chunk.length;if(size>2048){res.writeHead(413).end('{"error":"too large"}');return;}data+=chunk.toString('utf8');}
        const config=JSON.parse(data);if(!config||typeof config!=='object'||Array.isArray(config))throw Error('Invalid configuration');
        // Validate the configuration before any external request.
        backtest('TEST',[],config);
        const symbol=config.symbol;
        if(symbol!==undefined&&(typeof symbol!=='string'||!/^[A-Z0-9]{1,20}_[A-Z0-9]{1,20}$/.test(symbol)))throw Error('Invalid symbol');
        // A non-default pair is checked against the fresh exchange catalogue by MarketData.
        const snapshot=await market.snapshot(symbol&&!['BTC_TRY','ETH_TRY'].includes(symbol)?{symbol}:undefined);
        const selected=snapshot.markets.find(m=>m.symbol===(symbol||'BTC_TRY'));
        if(!selected)throw Error('Market unavailable');
        const auto=selectMarket(snapshot.markets);
        const signal=decide(selected.symbol,selected.candles);const result=backtest(selected.symbol,selected.candles,config);latestMarkets=snapshot.markets;
        return res.end(JSON.stringify({asOf:snapshot.asOf,symbol:selected.symbol,price:selected.price,priceTime:selected.priceTime,decision:signal,automaticDecision:decide(auto.symbol,auto.candles),markets:snapshot.markets.map(m=>({symbol:m.symbol,price:m.price,priceTime:m.priceTime,candles:m.candles})),backtest:result,candleCount:selected.candles.length}));
      } catch (err) {const errors={'Invalid risk configuration':'INVALID_RISK','Invalid symbol':'INVALID_SYMBOL','Clock invalid':'CLOCK_INVALID','Market cooldown':'RATE_LIMIT','Market region restricted':'REGION_RESTRICTED','Market request in progress or cooldown':'RATE_LIMIT','Incomplete or stale candles':'STALE_DATA','Stale price':'STALE_DATA','Market unavailable':'MARKET_UNAVAILABLE'};const code=errors[err.message]||'MARKET_CONNECTION';return res.writeHead(code==='INVALID_RISK'||code==='INVALID_SYMBOL'?400:503).end(JSON.stringify({error:code}));}
    }
    if(req.method==='GET' && req.url==='/api/ai/history') {try{return res.end(JSON.stringify({history:simulator.aiHistory()}));}catch{return res.writeHead(503).end('{"error":"history unavailable"}');}}
    if(req.method==='GET' && req.url==='/api/ai/performance') {try{return res.end(JSON.stringify(evaluateAIHistory(simulator.aiHistory(),latestMarkets)));}catch{return res.writeHead(503).end('{"error":"performance unavailable"}');}}
    if(req.method==='POST' && req.url==='/api/ai/analyze') {
      if(req.headers.origin!==origin || req.headers['sec-fetch-site']!=='same-origin' || req.headers['content-type']!=='application/json' || req.headers['x-para-request']!=='1')return res.writeHead(403).end('{"error":"forbidden"}');
      try{let body='',size=0;for await(const c of req){size+=c.length;if(size>1024)return res.writeHead(413).end('{"error":"too large"}');body+=c.toString('utf8');}const input=JSON.parse(body);
        if(!input||typeof input.symbol!=='string'||!/^[A-Z0-9]{1,20}_[A-Z0-9]{1,20}$/.test(input.symbol)||Object.keys(input).length!==1)throw Error('invalid');
        const snapshot=latestMarkets.find(m=>m.symbol===input.symbol);
        if(!snapshot)throw Error('No verified cached market snapshot');
        const catalog=await universe.discover();
        const approved=catalog.markets.some(m=>m.symbol===input.symbol&&m.type===1);
        if(!approved)throw Error('Unsupported or disabled symbol');
        const result=await ai.analyze(snapshot,{catalogApproved:true});result.startedAt=result.time;result.time=Date.now();simulator.saveAI(result);return res.end(JSON.stringify(result));
      }catch{return res.writeHead(503).end('{"error":"ai unavailable"}');}
    }
    if (req.method==='GET' && req.url==='/api/binance-tr/value-history') {
      if(!accountHistory)return res.writeHead(503).end('{"error":"history unavailable"}');
      try{return res.end(JSON.stringify(accountHistory.history()));}catch{return res.writeHead(503).end('{"error":"history unavailable"}');}
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
        const balances=await account.balance(input.passphrase);
        // All valuations require fresh observed TRY prices; a partial scan is never a total.
        // Store no credentials, passphrases or exchange order methods.
        let valueHistory=null;
        if(accountHistory){
          try{
            const now=Date.now();
            const scannerPrices=scanner.status().results.filter(x=>x.priceTime&&x.symbol?.endsWith('_TRY'));
            let valuationMarkets=[];
            try{valuationMarkets=await market.valuationPrices(balances.filter(a=>Number(a.free)>0||Number(a.locked)>0).map(a=>a.asset));}catch{}
            const v=valuePortfolio(balances,[...latestMarkets,...scannerPrices,...valuationMarkets],now);
            valueHistory=accountHistory.save({
              estimatedTry:v.complete?v.subtotal:null,
              missingAssets:v.missing,
              pricedAssets:v.pricedCount,
              assetCount:balances.filter(a=>Number(a.free)>0||Number(a.locked)>0).length
            });
          }catch{/* Never block the verified read-only account balance response. */}
        }
        return res.end(JSON.stringify({connected:true,balances,valueHistory}));
      } catch (err) {const allowed=['VAULT_UNLOCK_FAILED','EXCHANGE_READ_FAILED'];const code=allowed.includes(err.message)?err.message:'operation failed';if(!res.headersSent) res.writeHead(400).end(JSON.stringify({error:code}));return;}
    }
    res.writeHead(404).end('{"error":"not found"}');
  });
  if(paper){let monitoring=false;const timer=setInterval(async()=>{if(monitoring)return;monitoring=true;try{if(!paper.status().positions.length)return;let marks=[];try{marks=await scannerPaperMarks({paper,scanner,universe});}catch{}paper.assess(marks);}catch{try{paper.halt();}catch{}}finally{monitoring=false;}},riskIntervalMs);timer.unref();server.on('close',()=>clearInterval(timer));}
  server.on('close',()=>{scanAutomation.close();localGoogle.close();});
  if(autoScan)server.once('listening',()=>{try{scanAutomation.setEnabled(true);}catch{/* fail closed */}});
  return server;
}
if (process.argv[1] && fileURLToPath(import.meta.url) === resolve(process.argv[1])) {
  const sim=new RiskStore(join(homedir(),'.para','simulation.sqlite'),{budget:100000,maxTrade:10000,maxLoss:5000});
  const paper=new PaperStore(join(homedir(),'.para','paper.sqlite'),{feeBps:10,slippageBps:10,quotes:[{asset:'TRY',budget:100000,maxTrade:10000,maxExposure:50000,maxAsset:10000,maxLoss:5000}]});
  createServer({token:process.env.PARA_LOCAL_TOKEN,simulator:sim,paper,aiProviders:new AIProviderVault({directory:join(homedir(),'.para','ai-providers')}),account:new AccountService({path:join(homedir(),'.para','binance-tr.vault')})}).listen(8788,'127.0.0.1',()=>console.log('PARA: http://127.0.0.1:8788 (simulation only)'));
}
