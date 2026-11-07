# PARA Trading: otomatik tarama ve günlük hesap gözlemleri

## Yerel otomatik tarama

Windows yerel paneli (`node scripts/start-local.js`) başlatıldığında **yalnızca halka açık piyasa bilgileri** için tarama otomatik etkinleşir. Tarama mevcut Binance TR uygun spot katalog verilerini kullanır, pariteleri sırayla inceler ve OpenTerminal'de beş saniyede bir yenilenen işlenen / aday / durum sayaçları gösterir.

Tarayıcı piyasa araştırma adaylarını ve metriklerini gösterir; doğrulanmış ücret, fiyat kayması, beklenen hareket ve risk kaynakları mevcut olmadığından araştırma sinyali **BEKLE** kalır. Varsayımsal maliyetler gerçek veri sayılmaz. Bu etiket AI doğrulaması, risk onayı, sanal emir veya gerçek emir değildir. Fiyat tazeliği, makas ve veri yokluğunda da güvenli biçimde BEKLE olur.

Tamamlanan tarama en erken 30 dakika sonra yeniden denenir. Rate-limit (418/429), bölgesel erişim (451) veya genel ulaşılmazlık durumunda otomasyon kendini kapatır; hata manuel incelenmeden otomatik yeniden açılmaz. Uygulama kapalıysa tarama çalışmaz. Kullanıcı panelden otomasyonu kapatabilir/açabilir; açmak sanal işlemi başlatmaz.

## Binance TR hesap değeri: günlük kayıt

**Ayarlar → Binance TR API → Bağlantıyı Test Et** işlevi, kullanıcının salt okunur hesap bağlantısından alınan mevcut varlıkları gösterir. Bu başarılı okumanın ardından ayrı `account-observations.sqlite` dosyasına zaman damgalı değer gözlemi kaydedilir.

Veri dizini `PARA_DATA_DIR` ile seçilebilir, aksi halde `%USERPROFILE%\.para` kullanılır. Dosyaya API anahtarı, secret veya kasa parolası yazılmaz. Yerel HTTP uçları oturum bearer token'ı ile korunur; dışa açık web preview'da gerçek hesap API'si kullanılamaz.

**Gerçek kâr/zarar değildir:** İki değerleme arasındaki 24 saatlik fark yatırım kârı olmayabilir. Para yatırma/çekme, başka hesaplara transfer, komisyon ve maliyet/alış fiyatları ayrıştırılmadan gerçek toplam veya gerçekleşmiş kâr/zarar gösterilmez. Kullanıcıya yalnız **'24 saatlik değer farkı (gerçek kâr/zarar değil)'** sunulur. 24 saat önce tam bir değerleme yoksa fark bilinmiyor kalır. Fiyatı eksik, süresi geçmiş veya TRY karşılığı doğrulanmamış varlık bulunuyorsa toplam **bilinmiyor** olarak saklanır; para birimleri birbirine keyfî biçimde eklenmez. Yeni bakiye gözlemi için kullanıcı salt okunur bağlantı testini tekrar çalıştırır; kasa parolası otomatik olarak arka planda saklanmaz.

Binance TR'nin kendi site veya uygulamasına özel kâr/zarar alanı eklenmez; kayıt **PARA Trading panelinde** görünür. Gerçek hesap P&L için Binance TR'nin belgelendirilmiş salt-okunur işlem geçmişi ve yatırma/çekme verileriyle ayrı hesaplama, doğrulama ve onay gerekir.

## Geliştirici testleri

```sh
npm ci
npm test
npm run build
```

Testler sentetik piyasa verisi kullanır. Gerçek Binance TR, Ollama / TradingAgents ve Windows tarayıcı doğrulaması ayrıca yapılmalıdır.

Gerçek Binance emirleri veya para çekme yolları yoktur; production deploy ya da ana dala birleştirme bu çalışmanın kapsamında değildir.
