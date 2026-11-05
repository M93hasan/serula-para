# PARA Trading — Windows 11

**Gerçek alım satım ve para çekme kapalıdır.** Panel yalnızca kendi bilgisayarınızda çalışır.

1. [Node.js](https://nodejs.org/) 22.13 veya daha yeni bir sürümü kurun; kurulumdan sonra terminali yeniden açın.
2. PR #3 dalının proje dosyalarını bilgisayarınıza indirin ve çıkarın. Proje klasöründeki **start-para.cmd** dosyasına çift tıklayın. İlk açılışta internet gerekir; bağımlılıklar indirilir ve panel hazırlanır.
3. Açılan tarayıcıda, siyah pencerede gösterilen **yerel erişim anahtarını** kopyalayıp “Yerel motor bağlantısı” alanına yapıştırın ve **Bağlan** düğmesine basın. Tarayıcı açılmazsa `http://127.0.0.1:8788` adresini elle açın. Pencereyi açık tutun; kapatmak için Ctrl+C kullanın.
4. **Ayarlar → Binance TR API** bölümünde salt okunur API Key, API Secret ve en az 16 karakterli kasa parolası girip **Kaydet** seçin. Binance TR üzerinde anahtara işlem ve para çekme yetkisi vermeyin.
5. Bakiye için kasa parolasını tekrar girip **Bağlantıyı Test Et** seçin. Başarılıysa gerçek varlıklar kullanılabilir ve kilitli miktarlarıyla gösterilir. Simülasyon bütçesi gerçek bakiye değildir.

Kasa ve simülasyon dosyaları `%USERPROFILE%\.para` klasöründedir. Parolanızı unutursanız kasa açılamaz. **Sil**, yalnızca yerel kasayı siler; Binance TR hesabındaki anahtarı ayrıca iptal etmelisiniz. API anahtarlarını sohbet veya GitHub'a göndermeyin. Geliştirme, testler ve Linux için [kurulum notlarına](docs/setup.md) bakın.

Windows 11 cihazında ve gerçek Binance TR hesabıyla doğrulama henüz yapılmadı; uzak erişime veya canlıya açmayın.
