# PARA Trading — haricî güvenlik incelemesi paketi

Bu belge bağımsız uzman için inceleme kapsamı ve kanıt istemidir; bir denetim onayı değildir. **Gerçek emir için karar: NO-GO.** Canlı emir, iptal, para çekme ve işlem yetkili anahtar kullanımı bu inceleme görevi kapsamında değildir. Değerlendirilecek commit SHA'sı ve test sonuçları, inceleme başladığında issue #54'teki son entegrasyon raporuyla sabitlenmelidir. Önceki raporlarda geçen SHA'ların bugünkü HEAD olduğu varsayılmamalıdır.

## Uzmandan beklenen çıktı

Yetkili bağımsız uzman; kapsamı ve incelenen commit SHA'sını, yöntemleri ve sınırları, her bulgu için şiddet/etki/kanıt/yeniden üretim/öneri bilgisini, kritik ve yüksek bulguların düzeltme doğrulamasını ve gerekçeli GO/NO-GO kararını yazılı olarak sunmalıdır. Gerçek işlem için ayrıca kullanıcının açık onayı ve bağımsız operasyonel kabul gereklidir. Bu belge, kod testleri veya önceki iç inceleme bağımsız onay yerine geçmez.

## Öncelikli inceleme alanları

1. **Emir ve bütünlük:** `engine/live-order-service.js`, `engine/live-order-journal.js`, `engine/live-order-reconciler.js`, `engine/binance-tr-order-client.js`. Sipariş öncesi kalıcı intent, benzersizlik, timeout/UNKNOWN, kısmi dolum ve mutabakatı inceleyin. Dış iptal kaydı ağ isteğinden önce alınır ve tek kalıcı journal için tekrar denemeyi engeller; borsada tam bir kez işlenme, journal kaybı veya çoklu cihaz güvencesi sağlamaz. Eşzamanlı örnekleri, SQLite WAL/çökme kurtarma ve yedek geri yüklemeyi inceleyin.
2. **Risk ve HALT:** `engine/live-risk-engine.js`, `engine/verified-account-risk-provider.js`, `engine/binance-tr-risk-ledger.js`. Günlük zarar/pozisyon/bütçe, maliyetler, taze ve tam hesap/fiyat girdileri, bağlantı kesintisi ve restart sonrası kilitlenmeyi doğrulayın. Stop-loss yeni emirleri durdurur ve tavsiye üretir; otomatik pozisyon kapatma garantisi vermez. HALT açık emirleri kendiliğinden iptal etmez.
3. **Kimlik ve izolasyon:** `cloudflare/google-auth.js`, `cloudflare/worker.js`, `engine/local-google-auth.js`, `engine/local-email-auth.js`, `engine/local-session-store.js`. OAuth state/nonce/PKCE, callback, cookie, CSRF, rate limit, logout sonrası token iptali, offline oturum süresi, iki kullanıcı izolasyonu ve yetkisiz istekleri inceleyin. Ortam ve commit'teki güncel oturum saklama/iptal davranışını gerçek yapılandırmayla ayrıca doğrulayın.
4. **Kasalar ve sırlar:** `cloudflare/web-credential-vault.js`, `engine/windows-binance-account-service.js`, Windows AI kasa modülleri. D1 satır izolasyonu, AES-GCM nonce/AAD, anahtar rotasyonu ve kurtarma; Windows CurrentUser DPAPI, ACL ve kullanıcı sınırları; log/sır sızıntısı ve şifreli yedeklemeyi değerlendirin. Üretim veya kullanıcı kasa sırlarını inceleme raporuna, GitHub'a, test loglarına koymayın.
5. **Piyasa ve strateji:** `engine/market-universe.js`, `engine/market-scanner.js`, `engine/scan-automation.js`, `engine/scalping-cost-gate.js`. 403/451/429, eksik sayfa/order book, tazelik, yanlış çift, likidite, komisyon ve kayma yokluğunda fail-closed davranışı inceleyin. Araştırma adayı emir yetkisi değildir; sentetik backtest kârlılık kanıtı değildir.
6. **Dağıtım ve izolasyon:** `wrangler.jsonc`, `cloudflare/schema/web-credentials.sql`, `docs/vault-windows-web.md`. Staging D1, şifreleme anahtarı, OAuth kimliği/callback, rate-limit ve iki test hesabının üretimden ayrıldığını doğrulayın. Üretim D1, DNS veya secrets üzerinde bu belgeyle değişiklik yetkisi verilmez.

## Açık kabul engelleri

- Gerçek Binance TR fiyatları ve salt okunur hesap verileri, tüm ilgili semboller, açık/kısmi emirler, işlem geçmişi, ücret, para hareketleri ve günlük P&L ile kullanıcı arayüzü mutabakatı doğrulanmadı. Eksik tarihçe/sayfa veya güncel olmayan fiyat hiçbir zaman sıfır risk sayılmamalı.
- Binance TR erişiminde ortama göre HTTP 200, 403 ve 451 gözlendi; kök neden doğrulanmadı. [Destek taslağı](binance-tr-support-report.md) ve issue #54'teki zaman/ortam ayrımını kullanın.
- Gerçek kullanıcının Windows 11 cihazında DPAPI yeniden açılışı, gerçek internet kesintisi/yeniden bağlanma, çökme sonrası SQLite bütünlüğü ve 30 dakika dayanıklılık doğrulaması eksiktir. GitHub runner ve sentetik testleri fiziksel cihaz kanıtı saymayın.
- Gerçek Google/e-posta oturumları, izole staging D1/OAuth ve OpenAI/Gemini çağrıları ile canlı haber/piyasa/risk birleşimi doğrulanmadı. Test kimlik bilgisi yoksa gerçek test başarılı kabul edilmez.
- Çoklu cihaz veya süreçte aynı hesabın tek işlemciyle sınırlandırılması, journal kaybı sonrası operasyonel bariyer ve geri yükleme, sipariş kapsamı ile borsa yanıtlarının tazeliği bağımsız doğrulama gerektirir.

## Kanıt ve güvenli doğrulama

`docs/INDEPENDENT_ORDER_SAFETY_AUDIT_2026-11-06.md` önceki iç kod incelemesini ve AUD-01–05 sınırlamalarını listeler; adı haricî onay anlamına gelmez. Test kapsamı için `tests/independent-safety-audit.test.js`, `tests/live-order-foundation.test.js`, `tests/live-order-reconciler.test.js`, `tests/live-risk-engine.test.js`, `tests/verified-account-risk-provider.test.js`, `tests/local-auth-flow.test.js`, `test/web-credential-vault.test.js` ve `test/market-scanner.test.js` incelenebilir. CI çalışmasının SHA'sını ve sonuçlarını [Issue #54](https://github.com/M93hasan/serula-para/issues/54) üzerinden teyit edin.

Gerçek ortam kanıtı yalnız izinli test hesabı ve salt okunur yetkiyle, kullanıcı kontrolündeki cihazdan sağlanmalıdır. Raporda yalnız gizli bilgiden arındırılmış zaman, sonuç, test kapsamı ve mutabakat farkları paylaşılmalı; anahtar, parola, oturum çerezi, kişisel hesap dökümleri ve özel ağ ayrıntıları yer almamalıdır. Testler gerçek emir veya iptal tetiklememelidir.
