# Manuel gerçek emir onayı — hazırlık aşaması

Bu dal **gerçek emir özelliğini etkinleştirmez**. `ManualOrderApproval` yalnızca bellekte, tek kullanımlık, 60 saniyelik ve sabit işlem parametrelerine bağlı onay oluşturur. Binance TR'ye POST yapmaz; API anahtarına erişmez. Sadece TRY kotasyonlu spot emir taslaklarını kabul eder; her öneri önceki öneriyi geçersiz kılar. ONAYLA + 32 haneli kimlik tam eşleşmelidir.

## Mevcut engeller
- Binance TR resmî /open/v1/orders çağrısının imzası, lot/precision/notional filtreleri ve emir sorgu/uzlaştırma akışı yerel Windows hesabıyla doğrulanmadı.
- Yerel sunucu `/api/manual-order/preview`, `/approve`, `/reject` uçları ve Ayarlar ekranı bağlandı. Bunlar yalnızca önizleme/onay durumunu değiştirir; gerçek emir göndermez.
- Arayüz sadece `http://127.0.0.1:8788` yerel panelde görünür; uzaktan Cloudflare önizlemesi gerçek emir onayı değildir.
- Kullanılabilir bakiye, güncel alış/satış fiyatı, komisyon, spread, slippage, max günlük kayıp, HALT ve kalıcı idempotency doğrulaması yürütme katmanında yapılmalıdır.
- Ağ zaman aşımında emrin gerçekleşmediğini varsayarak yeniden göndermek yasaktır. Borsa işlem kimliğiyle uzlaştırma gerekir.
- `REAL_ORDERS_ENABLED=false` korunmalıdır. İşlem izni olan API anahtarı, bu kontroller ve onaylı gerçek hesap testleri tamamlanmadan kullanılmamalıdır.

## Kontrol
`node --test test/manual-order-approval.test.js test/manual-order-http.test.js` ve `npm test && npm run build` (Windows ortamında ayrıca sınanmalı)

Bu ilk PR güvenli onay çekirdeğidir, çalışır gerçek trading çözümü değildir. Production deploy, main merge ve hesap emri yapılmadı.

## Yerel kullanım

Yerel motorla oturum açın, hesabı okuma izniyle bağlayın, güncel piyasa taramasını tamamlayın ve simülasyon HALT durumunu kontrol edin. Ayarlar → **İşlem onayı önizlemesi** bölümünde parite, BUY/SELL, birim fiyat (TRY), miktar ve yerel kasa parolasını girin. Onay önizlemesi oluşturun; görüntülenen işlem bilgilerini inceleyip **ONAYLA <kimlik>** metnini birebir yazın veya Reddet'e basın. 60 saniye sonra onay otomatik geçersizdir. **Onay gerçekleşse bile `APPROVED_NOT_SENT` döner ve borsaya emir gönderilmez.** 500 TRY taslak üst sınırı gerçek hesap riski için yeterli bir kontrol değildir; sadece prova tavanıdır.

Uygulamanın mevcut 403/yerel giriş güvenlik kontrolleri korunmuştur. İşlem izni taşıyan API anahtarı kullanmayın. Önceki PR dalı üzerine açılmıştır; main/production değişmedi.

## Risk ön kontrolü (yeni, emir göndermez)
`engine/live-order-preflight.js` yalnızca doğrulama verileri parametre olarak verildiğinde çalışan, dış sisteme çağrı yapmayan reddetme katmanıdır. Binance TR belgesindeki `PRICE_FILTER`, `LOT_SIZE` ve `NOTIONAL` için fiyat adımı, miktar adımı ve minimum tutar denetler. TRY çiftleri, taze fiyat/katalog, fiyat sapma tavanı, mevcut serbest bakiye, azami işlem tutarı ve HALT denetimi içerir. Decimal aritmetik BigInt kullanır. **Hiçbir koşulda emir gönderemez; `executionEnabled:false` döner.**

Bu modül artık yerel sunucu önizleme ucuna entegredir: katalog, tarama fiyatı, kasa parolasıyla salt okunur hesap bakiyesi ve simülasyon HALT kontrolü zorunludur. Piyasa taraması çalışmamışsa, taze aday yoksa, kasa açılamıyorsa veya HALT aktifse taslak oluşturulmaz. Panelden gönderilen parola yalnızca bu istekte kullanılır; kalıcı bir yere yazılmaz. Onay ekranı hâlâ gerçek emir yetkisi sağlamaz. Mevcut Binance TR filtre katalogunda `maxQty`, `maxPrice` gibi alanlar kullanılmadığından bu validator tek başına yeterli değildir. Komisyon rezervi ve pozisyon riski kontrol edilmediğinden olumlu sonuç bile sadece ön incelemedir. Kullanıcı fonu bağlamayın.

Yeni test: `node --test test/live-order-preflight.test.js`.

## 6 Kasım — Ek doğrulama

- Önizleme isteğinde yalnızca `passphrase`, `symbol`, `side`, `quantity`, `price` kabul edilir; ek alanlar reddedilir. Kasa şifresi yanıtla geri gönderilmez.
- Aktif ve taze spot katalog, aday parite, son işlem fiyatı (30 sn), salt okunur serbest bakiye, ondalık fiyat/lot/notional, maksimum fiyat sapması ve HALT kontrolü gereklidir.
- Güncel tarama fiyatı Binance TR dokümanındaki MAIN spot piyasası için `api.binance.me` kaynağından elde edilir. Bu kaynak erişilemezse sistem başarısız kapanır.
- Bunlar **kesin emir güvenliği değildir**: komisyon rezervi, güncel order book, derinlik, MAX_PRICE/MAX_QTY gibi tüm filtreler, fiyat güncellemesi, gerçek günlük zarar sınırı ve emir gönderiminden hemen önce tekrar kontrol eksiktir. Onaylı taslak kesinlikle borsaya gönderilmez.
- 7 onay çekirdeği, 7 HTTP ve 8 ön kontrol testi kaynak koduna eklendi. Testlerin tamamı ve derleme bu oturumda çalıştırılamadı; GitHub DNS erişimi yok. CI sonuçlarını ayrıca doğrulayın.

## Spread, piyasa derinliği ve önizleme HALT denetimi
- Adayın market scan işlemi **tamamlanmış** olmalı; fiyat ve piyasa metrikleri en çok 30 saniye önce alınmış olmalı.
- Scanner'ın `spread` değeri en fazla %0,5 ve raporladığı iki taraflı sınırlı derinlik, taslak nominal tutarın en az 2 katı olmalı. Bu değerler **sadece piyasa ön elemesidir**: gerçek yürütme fiyatına karşılık gelen emir defteri anlık yeniden doğrulanmadığı sürece emir gönderilemez.
- Simülasyon SQLite durumu her açılışta HALT ile başladığından, manuel **önizleme** için ayrı, sadece bellekte tutulan kapalı/açık durumu kullanılmaktadır. Yerel `/halt` çağrısı mevcut onayı iptal eder ve bu süreçte yeni taslakları bloke eder. Yeniden açmak için yerel sunucu yeniden başlatılmalıdır. Bu tasarım gerçek emir HALT mekanizması değildir.
- Komisyon dahil bakiye, borsa yanında gerçekleşme garantisi, order ID uzlaştırma, risk limiti ve bot yetkileri eksiktir. **Gerçek emirler kalıcı olarak kapalıdır.**
- Test kodunda 1 ek preflight testi (3 olumsuz alt durum), 3 ek HTTP reddetme durumu ve acil HALT senaryosu bulunur; testler çalıştırılıp doğrulanmadı.

## Kalıcı emir niyeti kaydı — 6 Kasım 2026
- `engine/order-intent-journal.js`: SQLite (`journal_mode=WAL`, `synchronous=FULL`) ile benzersiz idempotency key ve client order ID tutar. Aynı anahtar farklı içerikle kullanılırsa çatışma; aynı içerikle tekrar kullanılırsa mükerrer giriş hatası döner. Yeniden başlatmak önceki kayıtları silmez.
- Windows yerel `scripts/start-local.js` başlatılırken `%USERPROFILE%\\.para\\manual-order-intents.sqlite` açılır. `PARA_DATA_DIR` ayarlanmışsa o klasör kullanılır. Kaydın açılamaması başlatmayı başarısız kılar.
- Manuel `approve` ucu onayı tüketir, sonra `RESERVED` kayıt oluşturur. Başarılı yanıtta `intentId`, `clientOrderId`, `journalStatus: RESERVED` ve `executionEnabled: false` bulunur. Kayıt veritabanına yazılamazsa API başarısız olur, hiçbir emir gönderilmez. Başlatıcı bu veritabanını sağlamazsa `JOURNAL_UNAVAILABLE` döner.
- `markUnknown()` yalnızca belirsiz durumu kayda alır; hiçbir otomatik yeniden gönderim yoktur. `recordReconciliation()` yalnızca *dışarıdan sağlanan* emir kimliğini saklayan bir yer tutucudur. **Binance TR ile emir sorgulaması, imzalı hesap doğrulaması veya gerçek uzlaştırma yapılmaz.** Bu fonksiyon doğrulanmamış kimlikle canlı akışa bağlanmamalıdır. Hiçbir durum idempotency kaydını tekrar kullanıma açmaz.
- Bu kayıtlar yalnızca *onay provasıdır*: kaydedilmiş niyet, gönderilmiş veya gerçekleşmiş işlem anlamına gelmez. Emir gönderen hiçbir fonksiyon ve işlem izinli API anahtarı yoktur.
- Bağımsız Node.js 22.16.0 doğrulaması: `node --test test/order-intent-journal.test.js` **5/5 başarılı**. Tüm repo testleri, Vite build ve Windows E2E henüz doğrulanmadı.
