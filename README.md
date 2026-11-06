# PARA Trading — Windows 11

**Gerçek alım satım ve para çekme kapalıdır.** Yerel motor kendi bilgisayarınızda çalışır; ayrıca ayrı bir Cloudflare Web araştırma sürümü vardır.

> **Güncel durum (06.11.2026):** Local/Web + e-posta OTP PR #49; Windows Binance DPAPI + Web kasası PR #50; Binance tanısı PR #51; AI doğrulaması PR #52; Web testleri PR #53 ve emir güvenliği PR #55 henüz taslak olduğundan `main` sürümünün parçası değillerdir. Gerçek emir kapalıdır. [Issue #54](https://github.com/M93hasan/serula-para/issues/54) ve [Görev 54 raporu](docs/TASK_54_STATUS_2026-11-06.md) esas alınmalıdır.

1. [Node.js](https://nodejs.org/) 22.13 veya daha yeni bir sürümü kurun; kurulumdan sonra terminali yeniden açın.
2. Güncel `main` kaynaklarını GitHub üzerinden edinin (var olan kullanıcı verilerinizi veya `%USERPROFILE%\.para` klasörünü silmeyin). Proje klasöründeki **start-para.cmd** dosyasına çift tıklayın. İlk açılışta internet gerekir; bağımlılıklar indirilir ve panel hazırlanır.
3. Açılan tarayıcıda, siyah pencerede gösterilen **yerel erişim anahtarını** kopyalayıp “Yerel motor bağlantısı” alanına yapıştırın ve **Bağlan** düğmesine basın. Tarayıcı açılmazsa `http://127.0.0.1:8788` adresini elle açın. Pencereyi açık tutun; kapatmak için Ctrl+C kullanın.
4. **Ayarlar → Binance TR API** bölümünde salt okunur API Key, API Secret ve en az 16 karakterli kasa parolası girip **Kaydet** seçin. Binance TR üzerinde anahtara işlem ve para çekme yetkisi vermeyin.
5. Bakiye için (mevcut `main` Binance kasasında) kasa parolasını tekrar girip **Bağlantıyı Test Et** seçin. Başarılıysa gerçek varlıklar kullanılabilir ve kilitli miktarlarıyla gösterilir. Simülasyon bütçesi gerçek bakiye değildir.

Kasa ve simülasyon dosyaları `%USERPROFILE%\.para` klasöründedir. Parolanızı unutursanız kasa açılamaz. **Sil**, yalnızca yerel kasayı siler; Binance TR hesabındaki anahtarı ayrıca iptal etmelisiniz. API anahtarlarını sohbet veya GitHub'a göndermeyin. Geliştirme, testler ve Linux için [kurulum notlarına](docs/setup.md) bakın.

Windows cihazında Binance TR'nin `www.binance.tr` genel saat API'si HTTP 200 dönmüştür; `api.binance.me` piyasa kaynağı HTTP 403 dönmüştür. Gerçek hesap emir/bakiye mutabakatı ve canlı piyasa fiyatı doğrulanmış değildir. Yerel servisi dış erişime açmayın.

## Piyasa analizi

Yerel panele bağlandıktan sonra **Piyasa analizi ve geçmiş simülasyon** bölümünden örnek bütçe, işlem sınırı, kayıp eşiği ve varsayımsal işlem komisyonunu ayarlayıp analiz başlatın. İsterseniz 5 dakikalık otomatik yenilemeyi açın. Sistem iki TRY çiftinden son 20 kapalı saatin işlem hacmine göre seçim yapar; kural tabanlı AL/SAT/BEKLE ve gösterge gücü üretir. Güç skoru başarı olasılığı değildir. Backtest analiz başlatılmadan seçilmiş tek parite üzerinde geçmiş verilere uygulanır; otomatik seçim geçmiş testi değiştirmez. Listeleme ve hayatta kalma yanlılıkları devam edebilir; tahmini sonuçlar gerçek kazanç veya garanti değildir. Kayıp eşiği, fiyat sıçramalarında aşılabilir. Gerçek emir özelliği yoktur.

### Binance TR 403 bağlantı kontrolü (Windows)

Cloudflare Preview genel Binance TR isteği HTTP 403/451 ile engelleniyorsa, güncel `main` klasöründe **`check-binance.cmd` dosyasına çift tıklayın.** Bu, Windows ağından API anahtarı kullanmadan bağlantıyı test eder. Alternatif olarak terminalden şunu çalıştırabilirsiniz:

```powershell
cd "B:\\serula-para-git"
node scripts/check-binance-network.js
```

Klasörünüz farklıysa `cd` yolunu buna göre değiştirin. Çıktıda iki açık uç noktanın `OK`, `BLOCKED`, `TIMEOUT` veya `NETWORK_ERROR` durumu görünür. `OK` hesabınızın API izinlerini doğrulamaz; sadece Windows ağından genel API erişimini doğrular. `BLOCKED` çıkarsa güvenlik duvarını veya Binance TR erişim kısıtlamasını aşmaya çalışmayın. Bu test hiçbir API Key veya Secret okumaz, bakiye istemez, gerçek emir göndermez. Gerçek hesap bağlantısı yalnızca Windows yerel motorunda ayrıca ve salt okunur anahtarla denenmelidir.

### Windows'ta gerçek piyasa kontrolü

Güncel `main` dalındaki dosyaları kullanın. Proje klasöründe PowerShell açın ve `node scripts/check-market.js` çalıştırın. Komut yalnızca herkese açık BTC/TRY ve ETH/TRY son işlemlerini ve kapalı saatlik mum sayısını kontrol eder; her iki parite ve zaman damgası listelenirse başarılıdır; API anahtarı veya kasa parolası istemez. Sonrasında `start-para.cmd` ile paneli açıp **Simülasyon → Analiz ve geçmiş test yap** seçin; **Genel Bakış** ekranında BTC/TRY ve ETH/TRY düğmelerini ayrı ayrı deneyin. Fiyat zamanını ve grafiği Binance TR ile karşılaştırın. Hata varsa internet bağlantısını ve Windows saat eşitlemesini kontrol edin. Gerçek emirler kapalıdır; şifreleri ve anahtarları paylaşmayın.

### Deneysel yerel AI analizi

Windows'ta Ollama ve bir yerel model ayrıca kurulup çalıştırıldıktan sonra, PowerShell'de ` $env:PARA_OLLAMA_MODEL = "kurulu-model-adi" ` ayarlayıp aynı pencereden `.\start-para.cmd` çalıştırın. Önce piyasa analizi alın, sonra **AI Kararları → AI Trading Analyst** alanında analizi başlatın. Model istekleri yalnızca `127.0.0.1:11434` adresine ve halka açık piyasa verileriyle yapılır; API/kasa bilgileri gönderilmez. Doğrulanmış haber ve risk verileri henüz mevcut olmadığından nihai sonuç **BEKLE** olur. Model yoksa veya veri eskiyse sistem BEKLE'ye döner. Beş yerel model isteği bilgisayar kaynağı tüketir; OpenAI/Gemini ve diğer AI sağlayıcıları için bulut bağlantı kodu bulunur; gerçek kullanıcı anahtarlarıyla uçtan uca doğrulama ayrı bir kontroldür. AI geçmişi yerel veritabanındadır; gösterilen geçmiş simülasyon AI performansı değildir. Ayrıntılar: [değerlendirme](docs/tradingagents-assessment.md).

Ollama ve kurulu modelin yapılandırılmış JSON çıktısını sınamak için aynı PowerShell penceresinde `node scripts/check-ollama.js` çalıştırın. Bu kontrol BTC/TRY ve ETH/TRY için **sentetik** mumlar kullanır, gerçek piyasa veya performans testi değildir; iki parite için `completed:true` ve `BEKLE` beklenir. Model etiketleri değişebilir; kaydedilen isim model dosyasının kriptografik sürüm kanıtı değildir. Model veya servis yanıt vermiyorsa komut başarısız çıkar. Gerçek Binance TR verisini ayrıca `node scripts/check-market.js` ile kontrol edin.
