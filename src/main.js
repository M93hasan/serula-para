import './style.css';
import { createChart, CandlestickSeries, AreaSeries } from 'lightweight-charts';
import { tryPrices, valuePortfolio } from './portfolio.js';
import { isFreshMarketPrice } from '../engine/market-freshness.js';
import { prepareBalances, displayQuantity } from './balance-view.js';
const app=document.querySelector('#app');
app.innerHTML=`<div class="shell"><aside class="sidebar"><div class="brand"><div class="brandmark">P</div><div><strong>PARA</strong><small>TRADING TERMINAL</small></div></div><div class="navlabel">ÇALIŞMA ALANI</div><nav aria-label="Ana menü"><button class="nav active" data-view="overview"><span>◫</span> Genel Bakış</button><button class="nav" data-view="markets"><span>⌁</span> Piyasalar</button><button class="nav" data-view="decisions"><span>✳</span> AI Kararları</button><button class="nav" data-view="simulation"><span>◉</span> Simülasyon</button><button class="nav" data-view="history"><span>≡</span> İşlem Geçmişi</button><button class="nav" data-view="settings"><span>⚙</span> Ayarlar</button></nav><div class="aside-foot"><span class="dot amber"></span><div><strong>Güvenli mod</strong><small>Gerçek emirler kapalı</small></div></div></aside><main class="main"><header class="topbar"><div><span class="eyebrow">KİŞİSEL TRADING ALANI</span><h1 id="page-title">Genel Bakış</h1></div><div class="top-actions"><button id="command-launch" class="command-launch" type="button" aria-haspopup="dialog" aria-controls="command-overlay" title="Komut menüsü (Ctrl+K)">⌕ Komut <kbd>Ctrl K</kbd></button><span class="status-pill"><i class="dot amber"></i> YEREL MOD</span><button data-goto="settings">⚙ Bağlan</button><button id="local-halt" class="danger" disabled>■ <span>Acil durdur</span></button></div></header>
<div class="terminal-ticker" role="status" aria-label="Terminal durum çubuğu"><span class="terminal-tag">● PARA / TERM</span><span class="terminal-separator">│</span><span>PAZAR <strong>BINANCE TR</strong></span><span class="terminal-separator">│</span><span>VERİ <strong>BAĞLANTI GEREKLİ</strong></span><span class="terminal-separator">│</span><span>EMİR <strong>DEVRE DIŞI</strong></span><button id="workspace-toggle" class="workbench-control" type="button" aria-pressed="false">⛶ Grafik odak</button></div>
<section class="view" id="view-overview"><div class="welcome"><div><span class="eyebrow">KONTROL MERKEZİ</span><h2>Portföyüne genel bakış</h2><p>Verilerini takip et, piyasa sinyallerini incele.</p></div><button class="primary" data-goto="simulation">Piyasayı analiz et →</button></div><div class="cards"><article class="card"><div class="cardhead"><span id="portfolio-label">Toplam portföy</span> <span>↗</span></div><div class="value" id="portfolio-total">—</div><small id="portfolio-note">Hesap bağlanmadı</small></article><article class="card"><div class="cardhead">BTC karşılığı <span>₿</span></div><div class="value" id="portfolio-btc">—</div><small>Yaklaşık değer · BTC</small></article><article class="card"><div class="cardhead">Son sinyal <span>✳</span></div><div class="value" id="overview-signal">—</div><small id="overview-reason">Analiz bekleniyor</small></article><article class="card"><div class="cardhead">Simülasyon sonucu <span>◴</span></div><div class="value" id="overview-pnl">—</div><small>Geçmiş test · gerçek kazanç değil</small></article></div><div class="grid"><article class="panel wide"><div class="panel-head"><div><span class="eyebrow">PİYASA GÖRÜNÜMÜ</span><h3>Fiyat hareketi</h3><p id="chart-subtitle">Kapalı saatlik mumlar</p></div><div class="segmented"><button class="pair active" data-pair="BTC_TRY">BTC/TRY</button><button class="pair" data-pair="ETH_TRY">ETH/TRY</button><button id="active-catalog-pair" class="pair" type="button" hidden></button></div></div><div class="chart-wrap"><div id="market-chart" class="chart"></div><div class="chart-empty" id="chart-empty">Grafikleri yüklemek için yerel motora bağlanın.</div></div><div class="chart-footer"><span>1 SAAT · SON KAPANAN MUMLAR · TÜRKİYE SAATİ (UTC+3)</span><a href="https://www.tradingview.com/" target="_blank" rel="noreferrer">Grafikler: TradingView Lightweight Charts™</a></div></article><article class="panel"><div class="panel-head"><div><span class="eyebrow">HESAP</span><h3>Varlıklarım</h3><p>Gerçek Binance TR bakiyesi</p></div></div><div id="assets-list" class="empty">Bağlantı testinden sonra gösterilir.</div><button class="linkbtn" data-goto="settings">API ayarlarına git →</button></article></div></section>
<section class="view" id="view-markets" hidden><div class="sectionhead"><div><span class="eyebrow">GERÇEK PİYASA VERİSİ</span><h2>Piyasalar</h2><p>Son işlem fiyatları; yeni veri için analizi yenileyin.</p></div></div><article class="panel"><div class="table-wrap"><table><thead><tr><th>PARİTE</th><th>SON FİYAT</th><th>VERİ ZAMANI</th><th></th></tr></thead><tbody id="market-rows"><tr><td colspan="4" class="empty">Henüz piyasa verisi alınmadı.</td></tr></tbody></table></div></article></section>
<section class="view" id="view-decisions" hidden><div class="sectionhead"><div><span class="eyebrow">KURAL TABANLI ANALİZ</span><h2>Karar merkezi</h2><p>Güncel veriye göre üretilen araştırma sinyalleri.</p></div></div><div class="grid"><article class="panel wide"><span class="eyebrow">SEÇİLİ PARİTE</span><h3 id="decision-action">Analiz bekleniyor</h3><p id="decision-reason">Kapalı mumlar üzerinden gösterge hesaplanır.</p><div class="metric-row"><span>Gösterge gücü <strong id="decision-score">—</strong></span><span>Mum kapanışı <strong id="decision-time">—</strong></span></div><p class="disclaimer">Bu skor başarı olasılığı değildir. Kural tabanlı sinyaller yatırım tavsiyesi veya kazanç garantisi değildir.</p></article><article class="panel"><span class="eyebrow">OTOMATİK SEÇİM</span><h3 id="auto-action">—</h3><p>Seçilen paritede geçmişe dönük araştırma; farklı quote hacimleri doğrudan karşılaştırılmaz.</p></article></div></section>
<section class="view" id="view-simulation" hidden><div class="sectionhead"><div><span class="eyebrow">GEÇMİŞ TEST</span><h2>Simülasyon</h2><p>Geçmiş sonuçlar varsayımsaldır; gerçek bakiye kullanılmaz.</p></div></div><div class="grid"><article class="panel"><h3>Risk ayarları</h3><label>Bütçe (seçilen paritenin quote birimi)<input id="sim-budget" type="number" value="1000" min="1"></label><label>İşlem başına limit (quote birimi)<input id="sim-trade" type="number" value="100" min="1"></label><label>Azami kayıp eşiği (quote birimi)<input id="sim-loss" type="number" value="50" min="1"></label><label>İşlem komisyonu (%)<input id="sim-fee" type="number" value="0.1" min="0" max="5" step="0.01"></label><button id="analysis-run" class="primary full" disabled>Analiz ve geçmiş test yap</button><label class="check"><input id="analysis-auto" type="checkbox" disabled> Her 5 dakikada yenile</label><p id="analysis-status" role="status">Önce yerel motora bağlanın.</p></article><article class="panel wide"><div class="panel-head"><div><span class="eyebrow">SİMÜLASYON</span><h3>Kâr / zarar</h3><p id="analysis-backtest">Henüz geçmiş test yapılmadı.</p></div><span class="badge">SANAL VERİ</span></div><div class="chart-wrap"><div id="pnl-chart" class="chart"></div><div class="chart-empty" id="pnl-empty">Analizden sonra grafik burada görünecek.</div></div><p class="disclaimer">Sabit seçilen parite test edilir. Komisyon varsayımsaldır; spread, kayma ve vergiler dahil değildir. Kayıp eşiği fiyat sıçramalarında aşılabilir.</p></article></div></section>
<section class="view" id="view-history" hidden><div class="sectionhead"><div><span class="eyebrow">YALNIZCA SİMÜLASYON</span><h2>İşlem geçmişi</h2><p>Geçmiş testin varsayımsal işlemleri.</p></div></div><article class="panel table-wrap"><table><thead><tr><th>TARİH</th><th>TİP</th><th>FİYAT</th><th>TUTAR</th><th>KOMİSYON</th></tr></thead><tbody id="trade-rows"><tr><td colspan="5" class="empty">Henüz simülasyon işlemi yok.</td></tr></tbody></table></article></section>
<section class="view" id="view-settings" hidden><div class="sectionhead"><div><span class="eyebrow">BAĞLANTI VE GÜVENLİK</span><h2>Ayarlar</h2><p>Yerel motor ve Binance TR bağlantınızı yönetin.</p></div></div><div class="grid"><article class="panel"><span class="eyebrow">YEREL MOTOR</span><h3>Güvenli bağlantı</h3><p>Başlatma penceresinde gösterilen geçici anahtarı kullanın.</p><form id="local-login"><label>Yerel erişim anahtarı<input id="local-token" type="password" autocomplete="off" required minlength="32"></label><button class="primary full" type="submit">Bağlan</button></form><p id="local-status" role="status">Bağlı değil</p></article><article class="panel wide"><div class="panel-head"><div><span class="eyebrow">HESAP ENTEGRASYONU</span><h3>Binance TR API</h3><p>Yalnızca okuma iznine sahip anahtar kullanın.</p></div><span class="status-pill" id="tr-overview">Bağlı değil</span></div><div class="form-grid"><label>API Key<input id="tr-key" type="password" autocomplete="new-password" maxlength="512" placeholder="API anahtarı"></label><label>API Secret<input id="tr-secret" type="password" autocomplete="new-password" maxlength="512" placeholder="Gizli anahtar"></label><label>Kasa parolası<input id="tr-pass" type="password" autocomplete="new-password" minlength="16" maxlength="512" placeholder="En az 16 karakter"></label></div><div class="button-row"><button id="tr-save" class="primary" disabled>Kaydet</button><button id="tr-test" disabled>Bağlantıyı Test Et</button><button id="tr-change" disabled>Değiştir</button><button id="tr-delete" class="danger-outline" disabled>Sil</button></div><p id="tr-state" role="status">Yerel motora bağlanın.</p><p id="last-connected">Son başarılı bağlantı (bu oturum): —</p><p class="disclaimer">Anahtarlar şifreli yerel kasada tutulur; yeniden gösterilmez. Para çekme ve alım satım yetkilerini Binance TR'de kapatın.</p></article></div></section></main></div>
<div class="command-overlay" id="command-overlay" hidden>
  <div class="command-box" role="dialog" aria-modal="true" aria-label="Komut menüsü">
    <div class="command-heading"><span>⌕ HIZLI KOMUTLAR</span><button type="button" id="command-close" aria-label="Kapat">ESC</button></div>
    <input class="command-search" id="command-search" type="search" autocomplete="off" placeholder="Sayfa veya işlem ara…" aria-label="Komut ara">
    <div class="command-results" id="command-results">
      <button class="command-result" data-command-view="overview">◫ Genel Bakış <span>1</span></button>
      <button class="command-result" data-command-view="markets">⌁ Piyasalar <span>2</span></button>
      <button class="command-result" data-command-view="decisions">✳ AI Kararları <span>3</span></button>
      <button class="command-result" data-command-view="simulation">◉ Simülasyon <span>4</span></button>
      <button class="command-result" data-command-view="history">≡ İşlem Geçmişi <span>5</span></button>
      <button class="command-result" data-command-view="settings">⚙ API ve Ayarlar <span>6</span></button>
    </div>
    <div class="command-empty" id="command-empty" hidden>Bu komut bulunamadı.</div>
  </div>
</div>
<div class="setup-overlay" id="setup-overlay" hidden>
  <div class="setup-dialog" role="dialog" aria-modal="true" aria-labelledby="setup-title">
    <div class="setup-heading"><div><span class="eyebrow">İLK KURULUM</span><h2 id="setup-title">PARA'yı güvenli biçimde bağla</h2></div><span class="status-pill">GERÇEK EMİRLER KAPALI</span></div>
    <ol class="setup-progress" aria-label="Kurulum adımları">
      <li data-setup-progress="google"><strong>1</strong><span>Google</span></li>
      <li data-setup-progress="binance"><strong>2</strong><span>Binance TR</span></li>
      <li data-setup-progress="ai"><strong>3</strong><span>Yapay zekâ</span></li>
    </ol>
    <section class="setup-step" data-setup-step="google" hidden>
      <h3>Google hesabınla giriş yap</h3><p>Bu bilgisayardaki PARA oturumunu yalnızca izin verilen Google hesabı açabilir.</p>
      <button id="setup-google-login" class="primary full" type="button">Google ile giriş yap</button>
      <form id="setup-local-login" hidden><label>Yerel kurtarma anahtarı<input id="setup-local-token" type="password" autocomplete="off" required minlength="32"></label><button class="full" type="submit">Yerel anahtarla devam et</button></form>
      <p id="setup-google-status" role="status">Google girişi kontrol ediliyor.</p>
    </section>
    <section class="setup-step" data-setup-step="binance" hidden>
      <h3>Binance TR salt okunur API</h3><p>Binance TR'de yalnızca okuma izni olan bir anahtar kullan. Alım satım ve para çekme izinleri kapalı kalmalıdır.</p>
      <form id="setup-binance-form"><label>API Key<input id="setup-tr-key" type="password" autocomplete="new-password" maxlength="512" required></label><label>API Secret<input id="setup-tr-secret" type="password" autocomplete="new-password" maxlength="512" required></label><label>Kasa parolası<input id="setup-tr-pass" type="password" autocomplete="new-password" minlength="16" maxlength="512" required placeholder="En az 16 karakter"></label><button class="primary full" type="submit">Şifreli kasaya kaydet ve devam et</button></form>
      <p id="setup-binance-status" role="status">Anahtarlar bu bilgisayardaki şifreli kasaya kaydedilir ve tekrar gösterilmez.</p>
    </section>
    <section class="setup-step" data-setup-step="ai" hidden>
      <h3>Yapay zekâ API sağlayıcısı</h3><p>Bir sağlayıcı bağla. ChatGPT aboneliği, OpenAI API kredisi yerine geçmez.</p>
      <form id="setup-ai-form"><label>Sağlayıcı<select id="setup-ai-provider"><option value="openai">OpenAI API</option><option value="ollama_cloud">Ollama Cloud</option><option value="anthropic">Claude / Anthropic</option><option value="gemini">Google Gemini</option><option value="deepseek">DeepSeek</option></select></label><label>Model adı<input id="setup-ai-model" type="text" maxlength="100" autocomplete="off" placeholder="İsteğe bağlı sağlayıcı model adı"></label><label>API anahtarı<input id="setup-ai-key" type="password" maxlength="512" autocomplete="new-password" required></label><label>AI kasası parolası<input id="setup-ai-pass" type="password" minlength="16" maxlength="512" autocomplete="new-password" required placeholder="En az 16 karakter"></label><button class="primary full" type="submit">Şifreli kasaya kaydet ve tamamla</button></form>
      <p id="setup-ai-status" role="status">Anahtar yalnızca yerel şifreli kasada tutulur.</p>
    </section>
  </div>
</div>`;
const $=s=>document.querySelector(s);let scanPrices=[];
let token='',pair='BTC_TRY',snapshot=null,balances=null,lastConnect=null,chart=null,candleSeries=null,pnlChart=null,pnlSeries=null,marketRequest=0;
const text=(sel,value)=>{$(sel).textContent=value};const fmt=n=>new Intl.NumberFormat('tr-TR',{maximumFractionDigits:2}).format(n);const date=t=>new Date(t).toLocaleString('tr-TR');
function navigate(view){document.querySelectorAll('.view').forEach(x=>x.hidden=x.id!==`view-${view}`);document.querySelectorAll('.nav').forEach(x=>x.classList.toggle('active',x.dataset.view===view));text('#page-title',({overview:'Genel Bakış',markets:'Piyasalar',decisions:'AI Kararları',simulation:'Simülasyon',history:'İşlem Geçmişi',settings:'Ayarlar'})[view]);if(chart)chart.applyOptions({width:$('#market-chart').clientWidth});if(pnlChart)pnlChart.applyOptions({width:$('#pnl-chart').clientWidth});}
// Terminal workspace controls are UI-only; never persist credentials.
const commandOverlay=$('#command-overlay');
const commandSearch=$('#command-search');
const commandLaunch=$('#command-launch');
const commandButtons=[...document.querySelectorAll('[data-command-view]')];
let commandPreviousFocus=null;
function closeCommands(){
  if(commandOverlay.hidden)return;
  commandOverlay.hidden=true;
  (commandPreviousFocus?.isConnected?commandPreviousFocus:commandLaunch).focus();
}
function openCommands(){
  commandPreviousFocus=document.activeElement;
  commandOverlay.hidden=false;
  commandSearch.value='';
  filterCommands('');
  commandSearch.focus();
}
function filterCommands(value){
  const term=value.toLocaleLowerCase('tr-TR').trim();
  let count=0;
  for(const button of commandButtons){
    const visible=button.textContent.toLocaleLowerCase('tr-TR').includes(term);
    button.hidden=!visible;
    if(visible)count++;
  }
  $('#command-empty').hidden=count!==0;
}
commandLaunch.addEventListener('click',openCommands);
$('#command-close').addEventListener('click',closeCommands);
commandOverlay.addEventListener('click',e=>{if(e.target===commandOverlay)closeCommands();});
commandSearch.addEventListener('input',()=>filterCommands(commandSearch.value));
commandSearch.addEventListener('keydown',e=>{
  if(e.key==='Enter'){
    const first=commandButtons.find(x=>!x.hidden);
    if(first){e.preventDefault();first.click();}
  }
});
for(const button of commandButtons){
  button.addEventListener('click',()=>{navigate(button.dataset.commandView);closeCommands();});
}
document.addEventListener('keydown',e=>{
  if((e.ctrlKey||e.metaKey)&&e.key.toLowerCase()==='k'){
    e.preventDefault();commandOverlay.hidden?openCommands():closeCommands();
    return;
  }
  if(e.key==='Escape')closeCommands();
  if(!commandOverlay.hidden&&e.key==='Tab'){
    const focusable=[commandSearch,...commandButtons.filter(x=>!x.hidden),$('#command-close')];
    const first=focusable[0],last=focusable.at(-1);
    if(e.shiftKey&&document.activeElement===first){e.preventDefault();last.focus();}
    else if(!e.shiftKey&&document.activeElement===last){e.preventDefault();first.focus();}
  }
});
$('#workspace-toggle').addEventListener('click',()=>{
  const overview=$('#view-overview');
  const enabled=overview.classList.toggle('workspace-focus');
  $('#workspace-toggle').setAttribute('aria-pressed',String(enabled));
  $('#workspace-toggle').textContent=enabled?'⊞ Tüm paneller':'⛶ Grafik odak';
  requestAnimationFrame(()=>chart?.applyOptions({width:$('#market-chart').clientWidth}));
});

document.querySelectorAll('.nav').forEach(x=>x.addEventListener('click',()=>navigate(x.dataset.view)));document.querySelectorAll('[data-goto]').forEach(x=>x.addEventListener('click',()=>navigate(x.dataset.goto)));
const webMode=location.hostname!=='127.0.0.1'||location.port!=='8788';
async function api(path,body){if(!token)throw Error('Önce güvenli oturum açın.');let res;try{res=await fetch(path,{method:body?'POST':'GET',headers:{...(!webMode&&token!=='google-session'?{Authorization:`Bearer ${token}`}:{}) ,...(body?{'Content-Type':'application/json','X-Para-Request':'1'}:{})},body:body?JSON.stringify(body):undefined,cache:'no-store'});}catch{throw Error('Yerel motora ulaşılamadı.');}if(!res.ok){const payload=await res.json().catch(()=>({}));const analysisErrors={REGION_RESTRICTED:'Binance TR piyasa verisi bu ağ veya bölgeden erişilemiyor. Kendi bağlantınızda tekrar deneyin.',INVALID_RISK:'Bütçe, işlem limiti, zarar eşiği ve komisyon ayarlarını kontrol edin.',INVALID_SYMBOL:'Seçilen parite desteklenmiyor.',CLOCK_INVALID:'Bilgisayar saatini otomatik eşitleyip tekrar deneyin.',RATE_LIMIT:'Çok sık istek gönderildi. En az 30 saniye bekleyip tekrar deneyin.',STALE_DATA:'Piyasa verisi eski veya eksik; daha sonra tekrar deneyin.',MARKET_UNAVAILABLE:'Bu paritenin Binance TR verisi bulunamadı.',MARKET_CONNECTION:'Binance TR piyasa verisine ulaşılamadı. İnternet bağlantısını kontrol edin.'};if(analysisErrors[payload.error])throw Error(analysisErrors[payload.error]);if(payload.error==='AUTH_REQUIRED')throw Error('Oturum sona erdi. Sayfayı yenileyip tekrar giriş yapın.');if(payload.error==='VAULT_UNLOCK_FAILED')throw Error('Kasa açılamadı. Parolanızı kontrol edin.');if(payload.error==='EXCHANGE_READ_FAILED')throw Error('Binance TR hesabına ulaşılamadı. API okuma iznini, ağ bağlantısını ve bilgisayar saatini kontrol edin.');throw Error(res.status===403?'Erişim reddedildi. Yerel bağlantıyı ve yetkiyi kontrol edin.':res.status===503?'Piyasa verisi alınamadı. Ağ, zaman ayarı veya istek sınırını kontrol edin.':'İşlem başarısız. Kasa parolasını ve API izinlerini kontrol edin.');}return res.json();}
const setupOverlay=$('#setup-overlay');
const setupSteps=['google','binance','ai'];
function showSetupStep(step,message){
  if(webMode)return;
  setupOverlay.hidden=false;document.body.classList.add('setup-open');
  for(const panel of document.querySelectorAll('[data-setup-step]'))panel.hidden=panel.dataset.setupStep!==step;
  const active=setupSteps.indexOf(step);
  for(const item of document.querySelectorAll('[data-setup-progress]')){const index=setupSteps.indexOf(item.dataset.setupProgress);item.classList.toggle('active',index===active);item.classList.toggle('complete',index<active);}
  if(message)text(`#setup-${step}-status`,message);
  setupOverlay.querySelector(`[data-setup-step="${step}"] input, [data-setup-step="${step}"] button`)?.focus();
}
function finishSetup(){setupOverlay.hidden=true;document.body.classList.remove('setup-open');}
async function syncSetupFlow(binanceConfigured){
  if(webMode||!token)return;
  if(!binanceConfigured){showSetupStep('binance');return;}
  let state;
  try{state=await api('/api/ai/providers');}
  catch{showSetupStep('ai','AI sağlayıcı durumu alınamadı. Yerel motoru kontrol edip tekrar deneyin.');return;}
  providerStates=state.providers;
  if(!providerStates.some(item=>item.configured)){showSetupStep('ai');return;}
  finishSetup();
}
function setControls(configured){$('#tr-save').disabled=configured;for(const id of ['tr-test','tr-change','tr-delete'])$(`#${id}`).disabled=!configured;}
function clearKeys(){for(const id of ['tr-key','tr-secret','tr-pass'])$(`#${id}`).value='';}
function clearBalance(){balances=null;renderPortfolio();}
async function activateLocalSession(){
  try{
    await api('/status');const s=await api('/api/binance-tr/settings');
    setControls(s.configured);text('#local-status',token==='google-session'?'Google oturumu açık · yerel motor bağlı':'Yerel motor bağlı · gerçek emirler kapalı');
    text('#tr-state',s.configured?'Kasa kayıtlı. Bağlantıyı test edin.':'API bilgileri kayıtlı değil.');
    $('#local-halt').disabled=false;$('#analysis-run').disabled=false;$('#analysis-auto').disabled=false;$('#ai-run').disabled=false;
    refreshAIHistory().catch(()=>{});loadAIProviders().catch(()=>{});text('#analysis-status','Analiz başlatılabilir.');refreshAccountHistory().catch(()=>{});refreshScan().catch(()=>{});
     // Populate the public BTC/TRY and ETH/TRY charts without requiring a manual simulation click.
     startChartRefresh();
    if(token==='google-session')$('#google-logout').hidden=false;
    await syncSetupFlow(s.configured);
  }catch(err){
    token='';setControls(false);$('#tr-save').disabled=true;$('#local-halt').disabled=true;$('#analysis-run').disabled=true;
    $('#analysis-auto').disabled=true;$('#ai-run').disabled=true;$('#analysis-auto').checked=false;clearBalance();text('#local-status',err.message);showSetupStep('google',err.message);
  }
}
$('#local-login').addEventListener('submit',async e=>{e.preventDefault();token=$('#local-token').value;$('#local-token').value='';await activateLocalSession();});
$('#setup-google-login').addEventListener('click',()=>{location.assign('/auth/google/start');});
$('#setup-local-login').addEventListener('submit',async e=>{e.preventDefault();token=$('#setup-local-token').value;$('#setup-local-token').value='';await activateLocalSession();});
$('#setup-binance-form').addEventListener('submit',async e=>{e.preventDefault();const form=e.currentTarget,button=form.querySelector('button');button.disabled=true;text('#setup-binance-status','Şifreli kasaya kaydediliyor…');const body={apiKey:$('#setup-tr-key').value,secretKey:$('#setup-tr-secret').value,passphrase:$('#setup-tr-pass').value,replace:false};form.reset();try{await api('/api/binance-tr/save',body);setControls(true);text('#tr-state','Kasa kayıtlı. Bağlantıyı test edin.');await syncSetupFlow(true);}catch(err){text('#setup-binance-status',err.message);}finally{button.disabled=false;}});
$('#setup-ai-form').addEventListener('submit',async e=>{e.preventDefault();const form=e.currentTarget,button=form.querySelector('button');button.disabled=true;text('#setup-ai-status','Şifreli kasaya kaydediliyor…');const body={provider:$('#setup-ai-provider').value,model:$('#setup-ai-model').value.trim(),apiKey:$('#setup-ai-key').value,passphrase:$('#setup-ai-pass').value,replace:false};form.reset();try{await api('/api/ai/providers/save',body);await loadAIProviders();finishSetup();}catch(err){text('#setup-ai-status',err.message);}finally{button.disabled=false;}});
const googleBox=document.createElement('div');
googleBox.innerHTML='<button id="google-login" type="button" class="primary full" hidden>Google ile giriş yap</button><button id="google-logout" type="button" class="full" hidden>Google oturumunu kapat</button><p id="google-login-status" role="status">Google girişi kontrol ediliyor.</p>';
$('#local-login').before(googleBox);
$('#google-login').addEventListener('click',()=>{location.assign('/auth/google/start');});
$('#google-logout').addEventListener('click',async()=>{
  try{await fetch('/auth/google/logout',{method:'POST',headers:{'X-Para-Request':'1'},credentials:'same-origin',cache:'no-store'});}
  finally{location.reload();}
});
if(!webMode){
  showSetupStep('google');
  fetch('/auth/google/status',{cache:'no-store'}).then(r=>r.json()).then(async state=>{
    if(!state.configured){const message='Google girişi bu bilgisayarda henüz yapılandırılmadı. Yerel kurtarma anahtarı kullanılabilir.';text('#google-login-status',message);text('#setup-google-status',message);$('#setup-google-login').hidden=true;$('#setup-local-login').hidden=false;return;}
    $('#google-login').hidden=false;text('#google-login-status','Google oturumu yalnızca bu Windows bilgisayarında geçerlidir. Binance kasası ayrıca korunur.');
    const me=await fetch('/api/auth/me',{cache:'no-store'});
    if(me.ok){token='google-session';await activateLocalSession();return;}
    text('#setup-google-status','Devam etmek için izin verilen Google hesabınla giriş yap.');
  }).catch(()=>{const message='Google oturumu kontrol edilemedi; yerel kurtarma anahtarı kullanılabilir.';text('#google-login-status',message);text('#setup-google-status',message);$('#setup-google-login').hidden=true;$('#setup-local-login').hidden=false;});
}

$('#local-halt').addEventListener('click',async()=>{try{await api('/halt',{});text('#local-status','Acil durdurma etkin · gerçek emirler kapalı');}catch(e){text('#local-status',e.message);}});
async function saveCredentials(replace){const body={apiKey:$('#tr-key').value,secretKey:$('#tr-secret').value,passphrase:$('#tr-pass').value,replace};clearKeys();clearBalance();try{await api('/api/binance-tr/save',body);setControls(true);text('#tr-state','Kasa kaydedildi. Bağlantıyı test edin.');text('#tr-overview','Bağlı değil');}catch(e){text('#tr-state',e.message);}}
$('#tr-save').addEventListener('click',()=>saveCredentials(false));$('#tr-change').addEventListener('click',()=>saveCredentials(true));
$('#tr-delete').addEventListener('click',async()=>{if(!confirm('Yerel kasadaki Binance TR bilgileri silinsin mi?'))return;const passphrase=$('#tr-pass').value;clearKeys();clearBalance();try{await api('/api/binance-tr/delete',{passphrase});setControls(false);text('#tr-state','Yerel kasa silindi. Binance TR anahtarı iptal edilmedi.');text('#tr-overview','Bağlı değil');}catch(e){text('#tr-state',e.message);}});
$('#tr-test').addEventListener('click',async()=>{const passphrase=$('#tr-pass').value;clearKeys();clearBalance();text('#tr-state','Bağlantı test ediliyor…');try{const r=await api('/api/binance-tr/test',{passphrase});balances=r.balances;lastConnect=Date.now();text('#tr-overview','Bağlandı');text('#tr-state','Bağlandı · Gerçek hesap bakiyeleri salt okunur');text('#last-connected',`Son başarılı bağlantı (bu oturum): ${date(lastConnect)}`);renderPortfolio();refreshAccountHistory().catch(()=>{});}catch(e){text('#tr-overview','Bağlı değil');text('#tr-state',e.message);}});
const accountValuePanel=document.createElement('article');
accountValuePanel.className='panel';
accountValuePanel.innerHTML='<h3>Binance TR hesap değeri · günlük kayıtlar</h3><p>Salt okunur hesap bağlantı testinden sonra yerel SQLite veritabanına tarihli kayıt alınır. Gerçek kâr/zarar hesaplanabilmesi için işlem geçmişi ve para giriş/çıkışlarının ayrıca doğrulanması gerekir. Son kayıt canlı bakiye değildir.</p><button id="account-history-refresh">Geçmişi yenile</button><div id="account-value-history">Önce yerel motora bağlanın.</div>';
$('#view-settings .grid').append(accountValuePanel);
async function refreshAccountHistory(){
  const box=$('#account-value-history');
  try{
    const r=await api('/api/binance-tr/value-history');
    box.replaceChildren();
    const summary=document.createElement('p');
    summary.textContent=r.latest
      ?`Son kayıt: ${date(r.latest.time)} · ${r.latest.complete?`≈ ${fmt(r.latest.estimatedTry)} TRY`:'Toplam bilinmiyor (eksik fiyat: '+r.latest.missingAssets.join(', ')+')'} · 24 saatlik değer farkı: ${r.change24h===null?'hesaplanamadı':`${r.change24h>=0?'+':''}${fmt(r.change24h)} TRY`}`
      :'Henüz gerçek hesap gözlem kaydı yok. Salt okunur bağlantı testini çalıştırın.';
    box.append(summary);
    const notice=document.createElement('p');notice.className='disclaimer';notice.textContent=r.notice;box.append(notice);
    for(const x of r.history.slice(0,12)){const p=document.createElement('p');p.textContent=`${date(x.time)} · ${x.complete?`${fmt(x.estimatedTry)} TRY`:'Toplam bilinmiyor'}`;box.append(p);}
  }catch{box.textContent='Günlük hesap geçmişine erişilemiyor.';}
}
$('#account-history-refresh').addEventListener('click',()=>refreshAccountHistory());

function renderPortfolio(){const now=Date.now();const markets=[...scanPrices,...(snapshot?.markets||[])];const list=$('#assets-list');list.replaceChildren();text('#portfolio-total','—');text('#portfolio-btc','—');if(!balances){text('#portfolio-label','Toplam portföy');list.textContent='Bağlantı testinden sonra gösterilir.';text('#portfolio-note','Hesap bağlanmadı');return;}
 let nonzero;try{nonzero=prepareBalances(balances);}catch{list.textContent='Bakiye biçimi doğrulanamadı.';text('#portfolio-note','Hesap bakiyesi doğrulanamadı.');return;}if(!nonzero.length)list.textContent='Sıfırdan büyük varlık bulunamadı.';const prices=tryPrices(markets,now);for(const b of nonzero){const row=document.createElement('div');row.className='asset';const name=document.createElement('strong');name.textContent=b.asset;const amount=document.createElement('span');amount.textContent=`Kullanılabilir: ${displayQuantity(b.free)} · Kilitli: ${displayQuantity(b.locked)} · Toplam: ${displayQuantity(b.total)}`;
  const tryValue=Number(b.total)*prices.get(b.asset);
  amount.textContent+=Number.isFinite(tryValue)?` · ≈ ₺${fmt(tryValue)}`:' · Güncel TRY değeri yok';
  row.append(name,amount);list.append(row);}
 try{const v=valuePortfolio(balances,markets,now);if(v.missing.length){text('#portfolio-label','Hesaplanabilen alt toplam');text('#portfolio-total',v.pricedCount?`≈ ₺${fmt(v.subtotal)}`:'—');text('#portfolio-note',`Fiyatı bulunamayan: ${v.missing.join(', ')} · toplam eksik`);return;}text('#portfolio-label','Toplam portföy');text('#portfolio-total',`≈ ₺${fmt(v.subtotal)}`);text('#portfolio-note','Gerçek bakiye · yaklaşık değer');if(v.btc!==null)text('#portfolio-btc',`≈ ${v.btc.toFixed(8)} BTC`);}catch{text('#portfolio-label','Toplam portföy');text('#portfolio-note','Bakiye hesaplanamadı. Bağlantıyı tekrar test edin.');}}

// Binance TR timestamps are UTC milliseconds; Lightweight Charts needs UTC seconds.
// Only the labels are localized. Never shift timestamps, or hourly bars move on the time axis.
const istanbulTime=new Intl.DateTimeFormat('tr-TR',{timeZone:'Europe/Istanbul',hour:'2-digit',minute:'2-digit',hourCycle:'h23'});
const istanbulDate=new Intl.DateTimeFormat('tr-TR',{timeZone:'Europe/Istanbul',day:'2-digit',month:'2-digit'});
const istanbulDateTime=new Intl.DateTimeFormat('tr-TR',{timeZone:'Europe/Istanbul',day:'2-digit',month:'2-digit',year:'numeric',hour:'2-digit',minute:'2-digit',hourCycle:'h23'});
function chartTimeLabel(time,tickType){if(typeof time!=='number')return null;const when=new Date(time*1000);if(tickType===3||tickType===4)return istanbulTime.format(when);if(tickType===2)return istanbulDate.format(when);return null;}
function createCharts(){const opts={autoSize:true,layout:{background:{color:'#111a27'},textColor:'#8597aa',attributionLogo:true},grid:{vertLines:{color:'#1b2939'},horzLines:{color:'#1b2939'}},localization:{locale:'tr-TR',timeFormatter:time=>typeof time==='number'?istanbulDateTime.format(new Date(time*1000)):String(time)},timeScale:{timeVisible:true,secondsVisible:false,tickMarkFormatter:chartTimeLabel,borderColor:'#263547'},rightPriceScale:{borderColor:'#263547'}};chart=createChart($('#market-chart'),opts);candleSeries=chart.addSeries(CandlestickSeries,{upColor:'#42d8ae',downColor:'#fc7c80',borderVisible:false,wickUpColor:'#42d8ae',wickDownColor:'#fc7c80'});pnlChart=createChart($('#pnl-chart'),opts);pnlSeries=pnlChart.addSeries(AreaSeries,{lineColor:'#5fd8b6',topColor:'rgba(62, 201, 162,.25)',bottomColor:'rgba(62, 201, 162,.01)'});}
function renderPair(fit=true){document.querySelectorAll('.pair').forEach(x=>x.classList.toggle('active',x.dataset.pair===pair));const market=snapshot?.markets?.find(m=>m.symbol===pair);if(!market?.candles?.length){candleSeries.setData([]);$('#chart-empty').hidden=false;$('#chart-empty').textContent='Bu parite için grafik verisi bulunamadı.';text('#chart-subtitle',`${pair.replace('_',' / ')} · Veri mevcut değil`);return;}const candles=market.candles.map(c=>({time:Math.floor(c.time/1000),open:Number(c.open),high:Number(c.high),low:Number(c.low),close:Number(c.close)})).filter(c=>Number.isFinite(c.time)&&[c.open,c.high,c.low,c.close].every(v=>Number.isFinite(v)&&v>0)).sort((a,b)=>a.time-b.time).filter((c,i,a)=>i===0||c.time!==a[i-1].time);if(!candles.length){candleSeries.setData([]);$('#chart-empty').hidden=false;$('#chart-empty').textContent='Geçerli mum verisi bulunamadı.';return;}candleSeries.setData(candles);$('#chart-empty').hidden=true;if(fit)chart.timeScale().fitContent();text('#chart-subtitle',`${pair.replace('_',' / ')} · 1 saatlik kapanmış mumlar · Türkiye saati (UTC+3) · ${isFreshMarketPrice(market)?`Son işlem ≈ ${fmt(market.price)} ${pair.split('_').at(-1)} · ${date(market.priceTime)}`:'Güncel fiyat alınamadı'}`);}
function switchPair(next){if(next===pair)return;pair=next;const custom=$('#active-catalog-pair');custom.hidden=['BTC_TRY','ETH_TRY'].includes(next);custom.dataset.pair=next;custom.textContent=next.replace('_','/');marketRequest++;if(!snapshot?.markets?.some(m=>m.symbol===pair)){candleSeries.setData([]);$('#chart-empty').hidden=false;text('#chart-subtitle','Bu parite için veri yok.');}renderPair();text('#decision-action','Yeni parite için analiz gerekli');text('#overview-signal','—');text('#overview-reason','Yeni parite için analiz gerekli');text('#decision-score','—');text('#analysis-backtest','Yeni parite için geçmiş testi çalıştırın.');text('#overview-pnl','—');$('#pnl-empty').hidden=false;pnlSeries.setData([]);$('#trade-rows').innerHTML='<tr><td colspan="5" class="empty">Yeni parite için analiz gerekli.</td></tr>';}
document.querySelectorAll('.pair').forEach(x=>x.addEventListener('click',()=>switchPair(x.dataset.pair)));
const chartRefreshMs=30_000;
const chartSymbols=new Set(['BTC_TRY','ETH_TRY','BNB_TRY']);
let chartRefreshing=false,chartTimer,chartLastAttempt=-Infinity;
function startChartRefresh(){
  if(!token||webMode||chartRefreshing||document.hidden)return;
  clearTimeout(chartTimer);
  const delay=chartRefreshMs-(performance.now()-chartLastAttempt);
  if(delay>0)chartTimer=setTimeout(startChartRefresh,delay);
  else void refreshMarketCharts();
}
async function refreshMarketCharts(){
  chartRefreshing=true;
  chartLastAttempt=performance.now();
  try{
    const incoming=await api('/api/markets/chart');
    if(!token||!Array.isArray(incoming.markets))return;
    const previouslyShown=!!snapshot?.markets?.some(m=>m.symbol===pair);
    // Keep analysis/backtest results intact; only replace public market data.
    const incomingSymbols=new Set(incoming.markets.map(m=>m.symbol));
    const retained=(snapshot?.markets||[]).filter(m=>!incomingSymbols.has(m.symbol)).map(m=>
      chartSymbols.has(m.symbol)?{...m,price:null,priceTime:null}:m
    );
    snapshot={...snapshot,...incoming,markets:[...incoming.markets,...retained]};
    renderPair(!previouslyShown);
    renderMarkets();
    renderPortfolio();
  }catch(err){
    if(snapshot?.markets){
      snapshot.markets=snapshot.markets.map(m=>chartSymbols.has(m.symbol)?{...m,price:null,priceTime:null}:m);
      renderMarkets();
      renderPortfolio();
    }
    if(!snapshot?.markets?.some(m=>m.symbol===pair&&m.candles?.length)){
      $('#chart-empty').hidden=false;
      $('#chart-empty').textContent='Grafik güncellenemedi: '+err.message;
    }else{
      text('#chart-subtitle',pair.replace('_',' / ')+' · Son veriler korunuyor · Yenileme hatası: '+err.message);
    }
  }finally{
    chartRefreshing=false;
    startChartRefresh();
  }
}
document.addEventListener('visibilitychange',startChartRefresh);
window.addEventListener('online',startChartRefresh);
function renderMarkets(){const rows=$('#market-rows');rows.replaceChildren();for(const m of snapshot.markets.filter(m=>m.candles?.length)){const tr=document.createElement('tr');const fresh=isFreshMarketPrice(m);for(const value of [m.symbol.replace('_',' / '),fresh?`${fmt(m.price)} ${m.symbol.split('_').at(-1)}`:'—',fresh?date(m.priceTime):'—']){const td=document.createElement('td');td.textContent=value;tr.append(td);}const td=document.createElement('td'),button=document.createElement('button');button.textContent='Grafiği aç';button.addEventListener('click',()=>{switchPair(m.symbol);navigate('overview');});td.append(button);tr.append(td);rows.append(tr);}}
async function runAnalysis(){const selected=pair,id=++marketRequest;const quote=selected.split('_').at(-1);$('#analysis-run').disabled=true;text('#analysis-status','Piyasa verileri alınıyor…');if(!snapshot){$('#chart-empty').hidden=false;$('#chart-empty').textContent='BTC/TRY ve ETH/TRY grafikleri yükleniyor…';}try{const config={symbol:selected,budget:Number($('#sim-budget').value),maxTrade:Number($('#sim-trade').value),maxLoss:Number($('#sim-loss').value),feeRate:Number($('#sim-fee').value)/100};const r=await api('/api/analysis',config);if(id!==marketRequest||selected!==pair)return;snapshot=r;renderPair();renderMarkets();renderPortfolio();const d=r.decision,b=r.backtest;text('#decision-action',`${d.symbol.replace('_',' / ')} · ${d.action}`);text('#decision-reason',d.reason);text('#decision-score',`${d.score}/100`);text('#decision-time',date(d.time));text('#auto-action',`${r.automaticDecision.symbol.replace('_',' / ')} · ${r.automaticDecision.action}`);text('#overview-signal',d.action);text('#overview-reason',`${pair.replace('_',' / ')} · gösterge gücü ${d.score}/100`);text('#overview-pnl',`${b.profitLoss>=0?'+':''}${fmt(b.profitLoss)} ${quote}`);text('#analysis-status',`Son güncelleme: ${date(r.priceTime)}`);text('#analysis-backtest',`${r.symbol.replace('_',' / ')} · ${r.candleCount} saat · Başlangıç ${fmt(b.budget)} ${quote} · Sonuç ${fmt(b.equity)} ${quote} · Komisyon ${fmt(b.fees)} ${quote} · ${b.trades.length} işlem`);$('#pnl-empty').hidden=true;pnlSeries.setData(b.curve.map(c=>({time:Math.floor(c.time/1000),value:c.value})));pnlChart.timeScale().fitContent();const rows=$('#trade-rows');rows.replaceChildren();if(!b.trades.length){rows.innerHTML='<tr><td colspan="5" class="empty">Bu dönemde işlem oluşmadı.</td></tr>';}for(const t of b.trades){const tr=document.createElement('tr');for(const v of [date(t.time),t.action,`${fmt(t.price)} ${quote}`,`${fmt(t.notional)} ${quote}`,`${fmt(t.fee)} ${quote}`]){const td=document.createElement('td');td.textContent=v;tr.append(td);}rows.append(tr);}}catch(e){text('#analysis-status',e.message);if(!snapshot){$('#chart-empty').hidden=false;$('#chart-empty').textContent=`Grafik yüklenemedi: ${e.message} Simülasyon bölümünden yeniden deneyin.`;}}finally{$('#analysis-run').disabled=!token;}}
$('#analysis-run').addEventListener('click',runAnalysis);setInterval(()=>{if(token&&$('#analysis-auto').checked&&!$('#analysis-run').disabled)runAnalysis();},300000);setInterval(()=>{if(balances)renderPortfolio();},30000);createCharts();

// AI and deterministic SMA results are deliberately separate.
const providerPanel=document.createElement('article');
providerPanel.className='panel wide';
providerPanel.innerHTML=`<div class="panel-head"><div><span class="eyebrow">YAPAY ZEKÂ SAĞLAYICILARI</span><h3>AI API ayarları</h3><p>Yalnızca bu bilgisayardaki şifreli kasada saklanır.</p></div></div><label>Sağlayıcı<select id="ai-provider"><option value="openai">OpenAI API (ChatGPT modelleri)</option><option value="ollama_cloud">Ollama Cloud</option><option value="anthropic">Claude / Anthropic</option><option value="gemini">Google Gemini</option><option value="deepseek">DeepSeek</option></select></label><label>Model adı<input id="ai-provider-model" type="text" maxlength="100" autocomplete="off" placeholder="Sağlayıcının API model adı"></label><label>API anahtarı<input id="ai-provider-key" type="password" maxlength="512" autocomplete="new-password" placeholder="API anahtarı"></label><label>AI kasası parolası<input id="ai-provider-pass" type="password" minlength="16" maxlength="512" autocomplete="new-password" placeholder="En az 16 karakter"></label><div class="button-row"><button id="ai-provider-save">Kaydet</button><button id="ai-provider-replace">Değiştir</button><button id="ai-provider-delete">Sil</button><button id="ai-provider-analyze">Bu sağlayıcıyla analiz et</button></div><p id="ai-provider-state" role="status">Önce yerel motora bağlanın.</p><p class="disclaimer">Yerel Ollama için API anahtarı gerekmez. Bulut analizinde seçili sağlayıcıya yalnızca kamuya açık piyasa verileri gönderilir; beş model isteği API ücreti doğurabilir. ChatGPT aboneliği API kredisi anlamına gelmez. Haber ve risk doğrulanmadığında sonuç BEKLE olur.</p>`;
$('#view-settings .grid').append(providerPanel);
let providerStates=[];
function selectedProvider(){return $('#ai-provider').value;}
function clearProviderSecrets(){const key=$('#ai-provider-key').value,passphrase=$('#ai-provider-pass').value;$('#ai-provider-key').value='';$('#ai-provider-pass').value='';return {apiKey:key,passphrase};}
async function loadAIProviders(){if(webMode)return;const r=await api('/api/ai/providers');providerStates=r.providers;const found=providerStates.find(x=>x.provider===selectedProvider());text('#ai-provider-state',found?.configured?'Şifreli anahtar kayıtlı; model bağlantısı henüz sınanmadı.':'Bu sağlayıcı için kayıt yok.');}
$('#ai-provider').addEventListener('change',()=>{clearProviderSecrets();if(token&&!webMode)loadAIProviders().catch(()=>text('#ai-provider-state','Sağlayıcı durumu alınamadı.'));});
async function saveProvider(replace){const values=clearProviderSecrets(),provider=selectedProvider(),model=$('#ai-provider-model').value.trim();try{await api('/api/ai/providers/save',{provider,model,...values,replace});await loadAIProviders();}catch{text('#ai-provider-state','Kayıt başarısız. Anahtarı, model adını ve kasa parolasını kontrol edin.');}}
$('#ai-provider-save').addEventListener('click',()=>saveProvider(false));
$('#ai-provider-replace').addEventListener('click',()=>saveProvider(true));
$('#ai-provider-delete').addEventListener('click',async()=>{const {passphrase}=clearProviderSecrets();try{await api('/api/ai/providers/delete',{provider:selectedProvider(),passphrase});await loadAIProviders();}catch{text('#ai-provider-state','Silinemedi. Sağlayıcıyı ve kasa parolasını kontrol edin.');}});
$('#ai-provider-analyze').addEventListener('click',async()=>{const provider=selectedProvider(),{passphrase}=clearProviderSecrets();if(!confirm('Seçili sağlayıcıya herkese açık piyasa verileri gönderilecek ve API ücreti oluşabilir. Analiz başlatılsın mı?'))return;text('#ai-provider-state','Analiz yapılıyor…');try{const result=await api('/api/ai/providers/analyze',{provider,passphrase,symbol:pair,consent:true});showAI(result);text('#ai-provider-state','Analiz tamamlandı; nihai güvenlik sonucu ve gerekçeyi kontrol edin.');navigate('decisions');await refreshAIHistory();}catch{text('#ai-provider-state','Analiz başlatılamadı. Önce piyasa verisini alın; sağlayıcı, model ve kasa parolasını kontrol edin.');}});
if(webMode){for(const el of providerPanel.querySelectorAll('input,select,button'))el.disabled=true;text('#ai-provider-state','AI API ayarları yalnızca yerel bilgisayarda kullanılabilir.');}

const aiPanel=document.createElement('article');aiPanel.className='panel';aiPanel.innerHTML=`<div class="panel-head"><div><span class="eyebrow">YEREL ÇOKLU AJAN · DENEYSEL</span><h3>AI Trading Analyst</h3><p>Model görüşleri ile kural tabanlı sinyal birbirinden ayrıdır.</p></div></div><p>Yerel Ollama modeli isteğe bağlıdır. Bu sürüm güncel doğrulanmış haber ve risk verisine sahip olmadığında BEKLE gösterir. Model analizi gerçek işlem yapmaz.</p><button id="ai-run" disabled>AI analizi çalıştır</button><p id="ai-status" role="status">Önce yerel bağlantı ve piyasa analizi gerekir.</p><div id="ai-results"></div><h3>Geçmiş AI kararları</h3><div id="ai-history">Henüz karar yok.</div><p class="disclaimer">Yerel model için servis ücreti yoktur; bilgisayar kaynağı kullanır. Harici sağlayıcılar Ayarlar bölümünden yapılandırılabilir. Aşağıdaki simülasyon, AI performansı değildir.</p>`;
$('#view-decisions').append(aiPanel);
function showAI(r){const box=$('#ai-results');box.replaceChildren();const summary=document.createElement('p');summary.textContent=`${r.symbol} · ${r.action} · Risk: ${r.risk} · ${date(r.time)} · ${r.reason}`;box.append(summary);for(const role of r.roles){const p=document.createElement('p');const title=document.createElement('strong');title.textContent=role.role+': ';p.append(title,document.createTextNode(role.text));box.append(p);}}
async function refreshAIHistory(){const r=await api('/api/ai/history');const box=$('#ai-history');box.replaceChildren();if(!r.history.length)box.textContent='Henüz karar yok.';for(const item of r.history){const p=document.createElement('p');p.textContent=`${date(item.time)} · ${item.symbol} · ${item.action} · ${item.reason}`;box.append(p);}}
const aiPerformance=document.createElement('div');aiPerformance.innerHTML='<h3>AI kararlarının sonradan gözlemi</h3><p>Varsayımsal tek saatlik gözlem: %0,1 komisyon ve %0,1 kayma her yönde uygulanır. BEKLE ve pozisyonu bilinmeyen SAT kâr/zarar sayılmaz.</p><button id="ai-measure">Gözlemi güncelle</button><div id="ai-measure-results">Önce piyasa analizi ve AI kararı gereklidir.</div>';aiPanel.append(aiPerformance);
const universePanel=document.createElement('article');universePanel.className='panel';universePanel.innerHTML='<h3>Binance TR parite keşfi</h3><p>Aktif spot pariteleri listele ve tür-1 pariteyi analiz için seç. Diğer piyasa türleri, doğrulanmamış fiyatlar ve borsa filtreleri güvenli şekilde dışlanır. Bu bir sanal işlem etkinleştirmesi değildir.</p><button id="universe-load">Pariteleri keşfet</button><p id="universe-status" role="status">Henüz liste alınmadı.</p><div id="universe-list"></div>';$('#view-markets').append(universePanel);
$('#universe-load').addEventListener('click',async()=>{try{const r=await api('/api/markets/universe');text('#universe-status',`Listelenen: ${r.listed} · Spot etkin: ${r.eligible} · Elenen: ${r.ineligible} · Bu listeden yalnızca tür-1 spot pariteler analiz edilebilir.`);const box=$('#universe-list');box.replaceChildren();for(const item of r.markets){const row=document.createElement('div');row.className='asset';const label=document.createElement('span');label.textContent=`${item.symbol.replace('_',' / ')} · ${item.type===1?'spot analizine uygun':'veri bağlayıcısı doğrulanmadı'}`;row.append(label);if(item.type===1){const select=document.createElement('button');select.type='button';select.textContent='Analiz için seç';select.addEventListener('click',()=>{switchPair(item.symbol);navigate('simulation');text('#analysis-status',`${item.symbol.replace('_',' / ')} seçildi. Tutarları ${item.quoteAsset} cinsinden girin; doğrulama yapılmadan alım/satım yok.`);});row.append(select);}box.append(row);}}catch{text('#universe-status','Parite listesine ulaşılamadı; bağlantıyı ve bölgesel erişimi kontrol edin.');}});
const scanPanel=document.createElement('article');scanPanel.className='panel';scanPanel.innerHTML='<h3>Piyasa ön taraması · deneysel</h3><p>Type-1 pariteler sırayla taranır. Diğer türler, maliyet varsayımları ve eksik veriler ayrıca gösterilir; öneri veya garantili getiri değildir.</p><button id="scan-start">Taramayı başlat</button> <button id="scan-refresh">Durumu güncelle</button> <button id="scan-auto-on">Otomatik taramayı aç</button> <button id="scan-auto-off">Sonraki otomatik taramaları durdur</button> <button id="scan-ai">En düşük maliyetli adayı AI ile incele</button><p id="scan-auto-status">Otomatik tarama: durum alınıyor.</p><p id="scan-status" role="status">Tarama başlatılmadı.</p><div id="scan-list"></div>';$('#view-markets').append(scanPanel);
$('#scan-start').addEventListener('click',async()=>{try{await api('/api/markets/scan',{});text('#scan-status','Tarama başlatıldı; ilerleme otomatik güncellenecek.');await refreshScan();}catch{text('#scan-status','Tarama başlatılamadı; yerel bağlantı veya bekleme süresini kontrol edin.');}});
for(const [id,enabled] of [['scan-auto-on',true],['scan-auto-off',false]]){
  $(`#${id}`).addEventListener('click',async()=>{
    try{await api('/api/markets/scan/auto',{enabled});await refreshScan();}
    catch{text('#scan-auto-status','Otomasyon ayarı değiştirilemedi. Bağlantıyı veya bölgesel erişim engelini kontrol edin.');}
  });
}
let lastScanFingerprint='';
async function refreshScan(){
  if(!token)return;
  try{
    const [s,auto]=await Promise.all([api('/api/markets/scan'),api('/api/markets/scan/auto')]);
    const done=s.results.length,all=s.total??0,candidates=s.results.filter(x=>x.status==='candidate').length;
    text('#scan-status',`Durum: ${s.status} · Toplam: ${all||'—'} · İşlenen: ${done} · Aday: ${candidates} · ${all?Math.round(done/all*100):0}%`);
    text('#scan-auto-status',`Otomatik tarama: ${auto.enabled?'AÇIK':'KAPALI'}${auto.lastError?' · Güvenli durdurma: '+auto.lastError:''} · Kapatma devam eden taramayı iptal etmez. Kararlar araştırmadır, işlem emri değildir.`);
    const fingerprint=`${s.startedAt||''}:${s.status}:${done}`;
    if(fingerprint===lastScanFingerprint)return;
    lastScanFingerprint=fingerprint;
    scanPrices=s.results.filter(x=>isFreshMarketPrice(x));
    if(balances)renderPortfolio();
    const box=$('#scan-list');box.replaceChildren();
    for(const x of s.results){
      const p=document.createElement('p');
      const label=x.researchSignal?` · Araştırma sinyali: ${x.researchSignal}`:'';
      p.textContent=`${x.symbol} · ${x.status}${label} · ${x.reason}${x.indicators?` · makas %${(x.indicators.spread*100).toFixed(2)} · varsayımsal maliyet %${(x.indicators.estimatedRoundTripCost*100).toFixed(2)}`:''}`;
      box.append(p);
    }
  }catch{text('#scan-status','Tarama durumuna erişilemedi.');}
}
$('#scan-refresh').addEventListener('click',()=>refreshScan());
setInterval(()=>{if(token)refreshScan().catch(()=>{});},5000);

$('#scan-ai').addEventListener('click',async()=>{try{const r=await api('/api/ai/scan-best',{});showAI(r);navigate('decisions');await refreshAIHistory();}catch{text('#scan-status','Taze aday veya AI servisi kullanılamıyor; BEKLE.');}});
const paperPanel=document.createElement('article');paperPanel.className='panel';paperPanel.innerHTML='<h3>Yerel varsayımsal portföy</h3><p>Örnek başlangıç bütçesi 1.000 TRY’dir. Gerçek bakiye değildir. Bu aşamada sanal işlem yürütme ve fiyat bağlantısı henüz etkin değildir.</p><button id="paper-start">Simülasyonu başlat</button> <button id="paper-stop">Simülasyonu durdur</button> <button id="paper-refresh">Durumu yenile</button><p id="paper-status" role="status">Yerel bağlantı bekleniyor.</p><div id="paper-details"></div>';$('#view-simulation').append(paperPanel);
async function refreshPaper(){const r=await api('/api/paper/status');text('#paper-status',`${r.status.halted?'STOP':'Aktif'} · sanal işlem yürütme henüz bağlı değil`);const box=$('#paper-details');box.replaceChildren();for(const q of r.valuation.quotes){const p=document.createElement('p');const amount=v=>v===null?'bilinmiyor':`${(v/100).toFixed(2)} ${q.asset}`;p.textContent=`${q.asset} · Kullanılabilir ${amount(q.cash)} · Gerçekleşen ${amount(q.realized)} · Gerçekleşmemiş ${amount(q.unrealized)} · Değer ${amount(q.equity)} · Maliyet esaslı maruziyet ${amount(q.exposureAtCost)}`;box.append(p);}for(const position of r.valuation.positions){const p=document.createElement('p');p.textContent=`${position.symbol} · fiyat ${position.valuation==='available'?'mevcut':'bilinmiyor'}`;box.append(p);}for(const q of r.performance?.quotes||[]){const p=document.createElement('p');const amount=v=>v===null?'bilinmiyor':q.asset==='TRY'?((v/100).toFixed(2)+' TRY'):(v+' '+q.asset+' alt birim');p.textContent='SİMÜLASYON · '+q.asset+' · Bugün (UTC) gerçekleşen '+amount(q.day.realizedNet)+' · Son 7 gün '+amount(q.week.realizedNet)+' · Toplam '+amount(q.total.realizedNet)+' · Açık gerçekleşmemiş '+amount(q.currentUnrealized)+' · Bugünkü ücret '+amount(q.day.fees)+' · Günlük özkaynak değişimi: bilinmiyor';box.append(p);}const journal=document.createElement('section');const heading=document.createElement('h4');heading.textContent='Sanal olay günlüğü';journal.append(heading);for(const event of r.history||[]){const line=document.createElement('p');line.textContent=event.kind==='execute'?`${date(event.now)} · SANAL ${event.order.action} · ${event.order.symbol} · miktar ${event.order.quantity}`:event.kind==='start'?'START · izleme başlatıldı; yürütme kapalı':'STOP · simülasyon durduruldu';journal.append(line);}for(const gate of r.gateHistory||[]){const line=document.createElement('p');line.textContent=`${date(gate.time)} · ${gate.symbol||'—'} · BEKLE · ${gate.reasons.join(' · ')}`;journal.append(line);}box.append(journal);const limit=document.createElement('p');limit.textContent='Birden fazla para biriminin toplamı dönüşüm olmadan gösterilmez. Borsa filtresi ve risk kapıları henüz tamamlanmadı.';box.append(limit);}
$('#paper-refresh').addEventListener('click',()=>refreshPaper().catch(()=>text('#paper-status','Simülasyon durumu alınamadı.')));
let paperRefreshing=false;setInterval(async()=>{if(!token||$('#view-simulation').hidden||paperRefreshing)return;paperRefreshing=true;try{await refreshPaper();}catch{text('#paper-status','Simülasyon durumu alınamadı.');}finally{paperRefreshing=false;}},60000);
for(const action of ['start','stop'])$(`#paper-${action}`).addEventListener('click',async()=>{try{await api(`/api/paper/${action}`,{});await refreshPaper();}catch{text('#paper-status','Simülasyon durumu değiştirilemedi.');}});
const ready=document.createElement('div');ready.innerHTML='<button id="paper-check">AI ve güvenlik durumunu kontrol et</button> <button id="ollama-check">Yerel model durumunu kontrol et</button><p id="paper-gate-status" role="status">Sanal yürütme kapalı; veri ve risk doğrulaması bekleniyor.</p><p id="ollama-status" role="status">Yerel model henüz kontrol edilmedi.</p>';paperPanel.append(ready);
$('#paper-check').addEventListener('click',async()=>{try{const r=await api('/api/paper/readiness',{});const labels={PAPER_STOP:'simülasyon durdurulmuş',AI_UNAVAILABLE_OR_STALE:'AI kararı eksik veya eski',MARKET_UNAVAILABLE_OR_STALE:'piyasa verisi eksik veya eski',CATALOG_OR_FILTER_UNVERIFIED:'katalog veya filtre doğrulanamadı',DECISION_SYMBOL_MISMATCH:'karar ve parite uyuşmuyor',AI_HOLD:'AI kararı BEKLE',VERIFIED_NEWS_UNAVAILABLE:'doğrulanmış haber yok',CONTINUOUS_RISK_UNAVAILABLE:'sürekli risk kontrolü hazır değil',PAPER_EXECUTION_DISABLED:'sanal yürütme kapalı'};text('#paper-gate-status',`BEKLE · ${r.reasons.map(x=>labels[x]||x).join(' · ')}`);}catch{text('#paper-gate-status','Güvenlik durumu doğrulanamadı; BEKLE.');}});
$('#ollama-check').addEventListener('click',async()=>{try{const r=await api('/api/ai/health');text('#ollama-status',r.available?`Yerel model listede bulundu: ${r.model}. Analiz ayrıca doğrulanmalıdır.`:'Yerel model bağlantısı veya model bulunamadı.');}catch{text('#ollama-status','Yerel model durumu alınamadı.');}});
$('#ai-measure').addEventListener('click',async()=>{try{const r=await api('/api/ai/performance'),box=$('#ai-measure-results');box.replaceChildren();if(!r.results.length)box.textContent='Henüz AI kararı yok.';for(const x of r.results){const p=document.createElement('p');p.textContent=x.status!=='observed'?`${x.symbol} · ${x.action} · henüz uygun kapalı mum yok`:`${x.symbol} · ${x.action} · piyasa hareketi ${(x.marketMove*100).toFixed(2)}% · ${x.simulatedReturn===null?'kâr/zarar hesaplanmadı':`varsayımsal net ${(x.simulatedReturn*100).toFixed(2)}%`}`;box.append(p);}}catch{text('#ai-measure-results','Gözlem şu anda kullanılamıyor.');}});
$('#ai-run').addEventListener('click',async()=>{const btn=$('#ai-run');btn.disabled=true;text('#ai-status','Yerel model çalışıyor…');try{const result=await api('/api/ai/analyze',{symbol:pair});showAI(result);await refreshAIHistory();text('#ai-status',result.errorCode?result.reason+' ('+result.errorCode+')':'AI araştırma analizi tamamlandı; güvenlik kararı BEKLE.');}catch{text('#ai-status','AI servisi kullanılamıyor; karar BEKLE.');}finally{btn.disabled=!token;}});

if(webMode){
  // Web and local engine are different trust boundaries. Google web login never unlocks a local vault.
  $('#local-login').hidden=true;
  googleBox.hidden=true;
  // Browser-only credentials: never send them to storage, logs, URLs or any order endpoint.
  $('#tr-key').closest('article').hidden=true;
  const accountPanel=document.createElement('article');
  accountPanel.className='panel wide';
  accountPanel.innerHTML=`<span class="eyebrow">BINANCE TR · YALNIZCA OKUMA</span>
    <h3>Hesap bakiyesi bağlantısı</h3>
    <p>Yalnızca okuma izinli Binance TR API bilgilerinizi girin. Anahtarlar bu açık sekmede geçici tutulur, sunucuda saklanmaz ve sekme kapanınca kaybolur. İşlem ve para çekme izinleri vermeyin.</p>
    <form id="web-binance-form" class="form-grid" autocomplete="off">
      <label>API Key<input id="web-binance-key" type="password" autocomplete="off" maxlength="512" required></label>
      <label>API Secret<input id="web-binance-secret" type="password" autocomplete="off" maxlength="512" required></label>
      <button id="web-binance-connect" class="primary" type="submit">Hesabı oku</button>
    </form>
    <div class="form-grid">
      <button id="web-binance-refresh" type="button" disabled>Bakiyeyi yenile</button>
      <button id="web-binance-disconnect" type="button" disabled>Bağlantıyı kes</button>
    </div>
    <div><button id="web-binance-diagnostic" type="button">Binance TR bağlantısını test et (anahtar gerektirmez)</button></div>
    <p id="web-binance-diagnostic-status" role="status">Ağ testi henüz yapılmadı.</p>
    <p id="web-binance-status" role="status">Bağlı değil · gerçek emirler kapalı</p>
    <div id="web-binance-balances" aria-live="polite"></div>`;
  $('#view-settings .grid').append(accountPanel);
  let webBinanceCredentials=null;
  const webStatus=accountPanel.querySelector('#web-binance-status');
  const webBalances=accountPanel.querySelector('#web-binance-balances');
  const webRefresh=accountPanel.querySelector('#web-binance-refresh');
  const webDisconnect=accountPanel.querySelector('#web-binance-disconnect');
  const webConnect=accountPanel.querySelector('#web-binance-connect');
  const webKey=accountPanel.querySelector('#web-binance-key');
  const webSecret=accountPanel.querySelector('#web-binance-secret');
  const diagnosticButton=accountPanel.querySelector('#web-binance-diagnostic');
  const diagnosticStatus=accountPanel.querySelector('#web-binance-diagnostic-status');
  diagnosticButton.addEventListener('click',async()=>{
    diagnosticButton.disabled=true;
    diagnosticStatus.textContent='Binance TR bağlantısı kontrol ediliyor…';
    try{
      const res=await fetch('/api/binance-tr/diagnostic',{method:'GET',credentials:'same-origin',cache:'no-store'});
      const result=await res.json();
      if(!res.ok){diagnosticStatus.textContent=res.status===429?'Çok sık test yapıldı. Bir dakika sonra deneyin.':'Tanılama servisi kullanılamıyor.';return;}
      const explanation={
        HTTP_OK:'Binance TR genel API adresine erişildi. API anahtarı, IP izni ve hesap erişimi ayrıca doğrulanmalı.',
        ACCESS_BLOCKED:'Binance TR genel API isteği engellendi. Sunucu veya güvenlik duvarı kısıtlaması olabilir.',
        RATE_LIMITED:'Binance TR istek sınırına ulaşıldı.',
        REDIRECT:'Binance TR genel API adresi yönlendirme döndürdü.',
        HTTP_ERROR:'Binance TR genel API adresi hata yanıtı verdi.',
        NETWORK_ERROR:'Cloudflare sunucusundan Binance TR genel API adresine ulaşılamadı.'
      };
      diagnosticStatus.textContent=(explanation[result.status]||'Tanılama sonucu belirsiz.')+
        (typeof result.httpStatus==='number'?' (HTTP '+result.httpStatus+')':'')+
        (result.detail==='TIMEOUT'?' · Zaman aşımı':'');
    }catch{diagnosticStatus.textContent='Tanılama isteği çalıştırılamadı.';}
    finally{diagnosticButton.disabled=false;}
  });
  let webRequestBusy=false;
  function renderWebBalances(items){
    webBalances.replaceChildren();
    const heading=document.createElement('h4');heading.textContent='Sıfır olmayan bakiyeler';webBalances.append(heading);
    const rows=prepareBalances(items);
    if(!rows.length){const empty=document.createElement('p');empty.textContent='Hesapta sıfırdan büyük bakiye bulunamadı.';webBalances.append(empty);return;}
    const table=document.createElement('table');
    const head=document.createElement('thead');head.innerHTML='<tr><th>Varlık</th><th>Kullanılabilir</th><th>Kilitli</th><th>Toplam</th></tr>';table.append(head);
    const body=document.createElement('tbody');
    for(const item of rows){const row=document.createElement('tr');for(const value of [item.asset,displayQuantity(item.free),displayQuantity(item.locked),displayQuantity(item.total)]){const cell=document.createElement('td');cell.textContent=value;row.append(cell);}body.append(row);}
    table.append(body);webBalances.append(table);
  }
  async function fetchWebBalances(credentials){
    if(webRequestBusy)return;
    webRequestBusy=true;webConnect.disabled=true;webRefresh.disabled=true;webStatus.textContent='Binance TR bakiyesi okunuyor…';
    try{
      const response=await fetch('/api/binance-tr/balance',{method:'POST',credentials:'same-origin',cache:'no-store',headers:{'Content-Type':'application/json','X-Para-Request':'1'},body:JSON.stringify(credentials)});
      const payload=await response.json().catch(()=>({}));
      if(!response.ok)throw Error(payload.error||'EXCHANGE_READ_FAILED');
      if(!Array.isArray(payload.balances)||payload.readOnly!==true)throw Error('INVALID_EXCHANGE_RESPONSE');
      renderWebBalances(payload.balances);
      webStatus.textContent='Binance TR hesabı okundu · yalnızca okuma · gerçek emirler kapalı';
      return true;
    }catch(error){
      const messages={AUTH_REQUIRED:'Google oturumu sona erdi. Yeniden giriş yapın.',RATE_LIMIT:'Çok sık deneme yapıldı. Bir dakika sonra tekrar deneyin.',EXCHANGE_RATE_LIMIT:'Binance TR istek sınırına ulaşıldı.',EXCHANGE_UNAVAILABLE:'Binance TR sunucusuna erişilemiyor.',INVALID_CREDENTIALS:'API Key ve Secret alanlarını kontrol edin.',INVALID_EXCHANGE_RESPONSE:'Binance TR beklenmeyen yanıt verdi.',EXCHANGE_READ_FAILED:'Binance TR bağlantısı veya API izinleri doğrulanamadı.',SERVICE_NOT_CONFIGURED:'Web hesap okuma servisi henüz yapılandırılmadı.'};
      webStatus.textContent=messages[error.message]||'Bakiye okunamadı. Bağlantıyı kontrol edin.';
      webBalances.replaceChildren();
      return false;
    }finally{
      webRequestBusy=false;webConnect.disabled=false;webRefresh.disabled=!webBinanceCredentials;
    }
  }
  accountPanel.querySelector('#web-binance-form').addEventListener('submit',async event=>{
    event.preventDefault();
    if(webRequestBusy)return;
    // Check public API reachability before transmitting any credentials.
    // The diagnostic request never contains API keys or secrets.
    webRequestBusy=true;webConnect.disabled=true;
    webStatus.textContent='Önce Binance TR sunucu bağlantısı doğrulanıyor…';
    let network;
    try{
      const result=await fetch('/api/binance-tr/diagnostic',{method:'GET',credentials:'same-origin',cache:'no-store'});
      if(!result.ok)throw Error('DIAGNOSTIC_UNAVAILABLE');
      network=await result.json();
    }catch{network=null;}
    finally{webRequestBusy=false;webConnect.disabled=false;}
    if(!network?.reachable||network.status!=='HTTP_OK'){
      webKey.value='';webSecret.value='';
      webStatus.textContent=network?.status==='ACCESS_BLOCKED'
        ?'Binance TR Cloudflare isteğini HTTP 403 ile engelledi. API anahtarların gönderilmedi. Bağlantı için yerel motor kullanılmalı.'
        :'Binance TR genel API bağlantısı doğrulanamadı. Güvenlik için API anahtarların gönderilmedi.';
      return;
    }
    // Clear input elements immediately; retain secrets in this tab's memory only until disconnect.
    const credentials={apiKey:webKey.value,secretKey:webSecret.value};
    webKey.value='';webSecret.value='';
    webBinanceCredentials=null;webRefresh.disabled=true;webDisconnect.disabled=true;
    if(await fetchWebBalances(credentials)){webBinanceCredentials=credentials;webRefresh.disabled=false;webDisconnect.disabled=false;}
  });
  webRefresh.addEventListener('click',()=>{if(webBinanceCredentials)fetchWebBalances(webBinanceCredentials);});
  webDisconnect.addEventListener('click',()=>{
    webBinanceCredentials=null;webRefresh.disabled=true;webDisconnect.disabled=true;webBalances.replaceChildren();
    webStatus.textContent='Bağlantı kesildi · anahtarlar sekme belleğinden çıkarıldı';
  });
  window.addEventListener('pagehide',()=>{webBinanceCredentials=null;});
  const connectionPanel=$('#local-login').closest('article');
  connectionPanel.querySelector('.eyebrow').textContent='WEB OTURUMU';
  connectionPanel.querySelector('h3').textContent='Google ile güvenli giriş';
  connectionPanel.querySelector('h3').nextElementSibling.textContent='Bu web sürümü Google hesabınızla korunur. Windows yerel motoru ve şifreli Binance TR kasası bu oturumdan açılamaz.';
  for(const id of ['tr-key','tr-secret','tr-pass','tr-save','tr-test','tr-change','tr-delete','local-halt','ai-run']){const el=$(`#${id}`);if(el)el.disabled=true;}
  text('#local-status','Google web oturumu kontrol ediliyor…');
  text('#tr-state','Binance TR hesap bağlantısı ve şifreli kasa yalnız yerel bilgisayarda kullanılabilir.');
  text('#ai-status','AI analizi web sürümünde henüz kullanılamıyor.');
  const logout=document.createElement('button');
  logout.type='button';logout.textContent='Çıkış yap';logout.className='status-pill';logout.disabled=true;
  logout.addEventListener('click',async()=>{
    if(!confirm('Google web oturumunuz kapatılsın mı?'))return;
    logout.disabled=true;
    try{
      const response=await fetch('/auth/logout',{method:'POST',headers:{'X-Para-Request':'1'},credentials:'same-origin',cache:'no-store'});
      if(!response.ok)throw Error('LOGOUT_FAILED');
      location.assign('/');
    }catch{logout.disabled=false;text('#local-status','Çıkış yapılamadı. Tekrar deneyin.');}
  });
  document.querySelector('.top-actions').append(logout);
  fetch('/api/auth/me',{cache:'no-store',credentials:'same-origin'})
    .then(r=>{if(!r.ok)throw Error('no session');return r.json();})
    .then(user=>{
      token='web-session';
      text('#local-status',user.email?'Google oturumu açık: '+user.email:'Google oturumu açık.');
      logout.disabled=false;
      $('#analysis-run').disabled=false;$('#analysis-auto').disabled=false;
      text('#analysis-status','Web araştırma analizi başlatılabilir.');
    }).catch(()=>{
      token='';
      text('#local-status','Web oturumu doğrulanamadı. Yeniden Google ile giriş yapın.');
      const login=document.createElement('a');login.href='/auth/google/login';login.textContent='Google ile giriş yap';login.className='primary';connectionPanel.append(login);
    });
}
