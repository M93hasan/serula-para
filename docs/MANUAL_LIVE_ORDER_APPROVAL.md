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
