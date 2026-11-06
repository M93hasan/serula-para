import { spawnSync, spawn } from 'node:child_process';
import { existsSync, statSync } from 'node:fs';
import { randomBytes } from 'node:crypto';
import { homedir } from 'node:os';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

process.chdir(resolve(fileURLToPath(new URL('..', import.meta.url))));
const [major,minor]=process.versions.node.split('.').map(Number);
if(major<22 || (major===22 && minor<13) || (major===23 && minor<4)){console.error('Node.js 22.13 veya daha yeni bir surum gerekli.');process.exit(1);}
const npm=process.platform==='win32'?'npm.cmd':'npm';
function run(args){const result=spawnSync(npm,args,{stdio:'inherit',shell:process.platform==='win32'});if(result.error||result.status!==0)throw Error(`${args.join(' ')} basarisiz`);}
try {
  const installed=existsSync('node_modules/vite/package.json') && existsSync('node_modules/.package-lock.json') && statSync('node_modules/.package-lock.json').mtimeMs>=statSync('package-lock.json').mtimeMs;
  if(!installed){console.log('Bagimliliklar kuruluyor...');run(['ci']);}
  console.log('Panel hazirlaniyor...');run(['run','build']);
  const {RiskStore}=await import('../engine/store.js');
  const {PaperStore}=await import('../engine/paper-store.js');
  const {WindowsAIProviderVault}=await import('../engine/windows-ai-provider-vault.js');
  const {AccountService}=await import('../engine/account-service.js');
  const {WindowsBinanceAccountService}=await import('../engine/windows-binance-account-service.js');
  const {AccountSnapshotStore}=await import('../engine/account-snapshot-store.js');
  const {createServer}=await import('../engine/server.js');
  const {createLocalGoogleAuth}=await import('../engine/local-google-auth.js');
  const dir=process.env.PARA_DATA_DIR ? resolve(process.env.PARA_DATA_DIR) : join(homedir(),'.para'), token=randomBytes(32).toString('hex');
  const sim=new RiskStore(join(dir,'simulation.sqlite'),{budget:100000,maxTrade:10000,maxLoss:5000});
  const paper=new PaperStore(join(dir,'paper.sqlite'),{feeBps:10,slippageBps:10,quotes:[{asset:'TRY',budget:100000,maxTrade:10000,maxExposure:50000,maxAsset:10000,maxLoss:5000}]});
  const accountHistory=new AccountSnapshotStore(join(dir,'account-observations.sqlite'));
  const googleAuth=createLocalGoogleAuth({
    clientId:process.env.GOOGLE_OAUTH_CLIENT_ID||'',
    clientSecret:process.env.GOOGLE_OAUTH_CLIENT_SECRET||'',
    allowedEmail:process.env.GOOGLE_ALLOWED_EMAIL||'',
    allowedSub:process.env.GOOGLE_ALLOWED_SUB||''
  });
  const server=createServer({token,simulator:sim,paper,aiProviders:new WindowsAIProviderVault({directory:join(dir,'ai-providers')}),account:process.platform==='win32' ? new WindowsBinanceAccountService({path:join(dir,'binance-tr.dpapi')}) : new AccountService({path:join(dir,'binance-tr.vault')}),accountHistory,autoScan:true,googleAuth,legacyBinancePath:join(dir,'binance-tr.vault')});
  server.on('error',error=>{console.error(error.code==='EADDRINUSE'?'8788 portu kullanimda. Acik PARA penceresini kapatin.':'Yerel sunucu baslatilamadi.');sim.close();paper.close();accountHistory.close();process.exitCode=1;});
  server.listen(8788,'127.0.0.1',()=>{
    console.log('\nPARA yerel panel: http://127.0.0.1:8788');
    console.log(googleAuth.configured?'Google ile giris: etkin (yerel tarayicidan).':'Google ile giris: ayarlanmadi; eski yerel anahtar girisi kullanilir.');
    console.log(`Yerel erisim anahtari (panele girin): ${token}`);
    console.log('Gercek emirler kapali. Durdurmak icin Ctrl+C.\n');
    if(process.platform==='win32'){const browser=spawn('rundll32.exe',['url.dll,FileProtocolHandler','http://127.0.0.1:8788'],{detached:true,stdio:'ignore'});browser.on('error',()=>console.error('Tarayici otomatik acilamadi; yukaridaki adresi elle acin.'));browser.unref();}
  });
  const stop=()=>server.close(()=>{sim.close();paper.close();accountHistory.close();process.exit(0);});process.on('SIGINT',stop);process.on('SIGTERM',stop);
} catch(error){console.error(`Kurulum veya baslatma hatasi: ${error.message}`);process.exitCode=1;}
