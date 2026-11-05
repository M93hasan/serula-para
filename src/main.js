import './style.css';
const app = document.querySelector('#app');
app.innerHTML = `<main class="shell"><header><div class="brand"><span class="logo">P</span><div><h1>PARA</h1><p>Trading kontrol merkezi</p></div></div><span class="pill">Kurulum aşamasında</span></header><section class="intro"><div><p class="eyebrow">YÖNETİM PANELİ</p><h2>Trading sistemine genel bakış</h2><p>Binance TR bağlantısı henüz kurulmadı. Gerçek işlemler devre dışı.</p></div><span class="safe">● İşlemler kapalı</span></section><section class="cards" aria-label="Özet"><article><span>Toplam bakiye</span><strong>—</strong><small>Hesap bağlı değil</small></article><article><span>Kâr / zarar</span><strong>—</strong><small>Veri bulunmuyor</small></article><article><span>Açık işlemler</span><strong>—</strong><small>İşlem motoru bağlı değil</small></article><article><span>AI ajanı</span><strong>Pasif</strong><small>Henüz kurulmadı</small></article></section><section class="bottom"><article><h3>Sistem durumu</h3><div class="line"><span>Binance TR API</span><b>Bağlı değil</b></div><div class="line"><span>Karar motoru</span><b>Kurulmadı</b></div><div class="line"><span>Emir gönderimi</span><b>Kapalı</b></div></article><article><h3>Güvenlik</h3><p>Bu ekran yalnızca arayüz iskeletidir. Kimlik doğrulama ve güvenli API henüz eklenmediğinden özel hesap verileri burada gösterilmez.</p><p class="notice">Canlı yayına almadan önce erişim kontrolü zorunludur.</p></article></section><footer>PARA · Geliştirme önizlemesi · Gerçek işlem yapılmaz</footer></main>`;

// The token is kept only in this page's memory and is sent only to the same-origin local service.
const local = document.createElement('section');
local.className = 'bottom';
local.innerHTML = `<article><h3>Yerel motor bağlantısı</h3><form id="local-login"><label for="local-token">Yerel erişim anahtarı</label><p><input id="local-token" type="password" autocomplete="off" required minlength="32"></p><button type="submit">Bağlan</button> <button id="local-halt" type="button" disabled>Acil durdur</button></form><p id="local-status" role="status">Bağlı değil. Yalnızca yerel simülasyon.</p></article>`;
app.querySelector('main').append(local);
let token = '';
const statusEl=local.querySelector('#local-status'), halt=local.querySelector('#local-halt');
async function request(path,method='GET') {
  if(location.hostname!=='127.0.0.1'||location.port!=='8788') throw Error('Paneli yerel motor adresinden açın.');
  const response=await fetch(path,{method,headers:{Authorization:`Bearer ${token}`},cache:'no-store'});
  if(!response.ok) throw Error('Bağlantı reddedildi.'); return response.json();
}
function show(s) { statusEl.textContent=`Simülasyon · ${s.halted?'Durduruldu':'Çalışıyor'} · Demo kalan bütçe: ${(s.budgetRemaining/100).toFixed(2)} TL · Gerçek emirler kapalı`; halt.disabled=false; }
local.querySelector('#local-login').addEventListener('submit',async e=>{e.preventDefault();token=local.querySelector('#local-token').value;local.querySelector('#local-token').value='';try {show(await request('/status'));} catch {token='';halt.disabled=true;statusEl.textContent='Bağlantı kurulamadı. Yerel motor adresini ve anahtarı kontrol edin.';}});
halt.addEventListener('click',async()=>{try{show(await request('/halt','POST'));}catch{halt.disabled=true;statusEl.textContent='Durdurma isteği tamamlanamadı.';}});
