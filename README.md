# PARA Trading — Windows 11

**Gerçek alım satım ve para çekme kapalıdır.** Panel yalnızca kendi bilgisayarınızda çalışır.

1. [Node.js](https://nodejs.org/) 22.13 veya daha yeni bir sürümü kurun; kurulumdan sonra terminali yeniden açın.
2. PR #3 dalının proje dosyalarını bilgisayarınıza indirin ve çıkarın. Proje klasöründeki **start-para.cmd** dosyasına çift tıklayın. İlk açılışta internet gerekir; bağımlılıklar indirilir ve panel hazırlanır.
3. Açılan tarayıcıda, siyah pencerede gösterilen **yerel erişim anahtarını** kopyalayıp “Yerel motor bağlantısı” alanına yapıştırın ve **Bağlan** düğmesine basın. Tarayıcı açılmazsa `http://127.0.0.1:8788` adresini elle açın. Pencereyi açık tutun; kapatmak için Ctrl+C kullanın.
4. **Ayarlar → Binance TR API** bölümünde salt okunur API Key, API Secret ve en az 16 karakterli kasa parolası girip **Kaydet** seçin. Binance TR üzerinde anahtara işlem ve para çekme yetkisi vermeyin.
5. Bakiye için kasa parolasını tekrar girip **Bağlantıyı Test Et** seçin. Başarılıysa gerçek varlıklar kullanılabilir ve kilitli miktarlarıyla gösterilir. Simülasyon bütçesi gerçek bakiye değildir.

Kasa ve simülasyon dosyaları `%USERPROFILE%\.para` klasöründedir. Parolanızı unutursanız kasa açılamaz. **Sil**, yalnızca yerel kasayı siler; Binance TR hesabındaki anahtarı ayrıca iptal etmelisiniz. API anahtarlarını sohbet veya GitHub'a göndermeyin. Geliştirme, testler ve Linux için [kurulum notlarına](docs/setup.md) bakın.

Windows 11 cihazında ve gerçek Binance TR hesabıyla doğrulama henüz yapılmadı; uzak erişime veya canlıya açmayın.

## Piyasa analizi

Yerel panele bağlandıktan sonra **Piyasa analizi ve geçmiş simülasyon** bölümünden örnek bütçe, işlem sınırı, kayıp eşiği ve varsayımsal işlem komisyonunu ayarlayıp analiz başlatın. İsterseniz 5 dakikalık otomatik yenilemeyi açın. Sistem iki TRY çiftinden son 20 kapalı saatin işlem hacmine göre seçim yapar; kural tabanlı AL/SAT/BEKLE ve gösterge gücü üretir. Güç skoru başarı olasılığı değildir. Backtest analiz başlatılmadan seçilmiş tek parite üzerinde geçmiş verilere uygulanır; otomatik seçim geçmiş testi değiştirmez. Listeleme ve hayatta kalma yanlılıkları devam edebilir; tahmini sonuçlar gerçek kazanç veya garanti değildir. Kayıp eşiği, fiyat sıçramalarında aşılabilir. Gerçek emir özelliği yoktur.

### Windows'ta gerçek piyasa kontrolü

PR #4 dalının güncel dosyalarını kullanın. Proje klasöründe PowerShell açın ve `node scripts/check-market.js` çalıştırın. Komut yalnızca herkese açık BTC/TRY ve ETH/TRY son işlemlerini ve kapalı saatlik mum sayısını kontrol eder; her iki parite ve zaman damgası listelenirse başarılıdır; API anahtarı veya kasa parolası istemez. Sonrasında `start-para.cmd` ile paneli açıp **Simülasyon → Analiz ve geçmiş test yap** seçin; **Genel Bakış** ekranında BTC/TRY ve ETH/TRY düğmelerini ayrı ayrı deneyin. Fiyat zamanını ve grafiği Binance TR ile karşılaştırın. Hata varsa internet bağlantısını ve Windows saat eşitlemesini kontrol edin. Gerçek emirler kapalıdır; şifreleri ve anahtarları paylaşmayın.

### Deneysel yerel AI analizi

Windows'ta Ollama ve bir yerel model ayrıca kurulup çalıştırıldıktan sonra, PowerShell'de ` $env:PARA_OLLAMA_MODEL = "kurulu-model-adi" ` ayarlayıp aynı pencereden `.\start-para.cmd` çalıştırın. Önce piyasa analizi alın, sonra **AI Kararları → AI Trading Analyst** alanında analizi başlatın. Model istekleri yalnızca `127.0.0.1:11434` adresine ve halka açık piyasa verileriyle yapılır; API/kasa bilgileri gönderilmez. Doğrulanmış haber ve risk verileri henüz mevcut olmadığından nihai sonuç **BEKLE** olur. Model yoksa veya veri eskiyse sistem BEKLE'ye döner. Beş yerel model isteği bilgisayar kaynağı tüketir; bulut API bağlantısı yoktur. AI geçmişi yerel veritabanındadır; gösterilen geçmiş simülasyon AI performansı değildir. Ayrıntılar: [değerlendirme](docs/tradingagents-assessment.md).
