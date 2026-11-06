# Binance TR bağlantısı — gerçek Windows doğrulaması

## Kaynaklar ve kapsam
Resmi Binance TR API belgeleri: https://www.binance.tr/apidocs/

Binance TR belgelerinde **HTTP 403 = WAF güvenlik duvarı kuralı ihlali**. Windows cihazındaki kesin neden (çok sık istek, IP/VPN/proxy, WAF kuralı vb.) ağ isteğinden ölçülmeden kesinleştirilemez. 403 ardından hızlı tekrarlı istek denemesi yapmayın, IP engelini aşmaya çalışmayın.

## Windows üzerinde güvenli, gerçek veri testi
1. Çalışma dalını Windows bilgisayarında açın. Node sürümünü kontrol edin.
2. `node scripts/diagnose-binance.js` çalıştırın. Bu komut yalnız sabit, herkese açık Binance TR adreslerine bağlanır; API Key/Secret veya kasa parolası okumaz.
3. Her adres için HTTP durumunu kaydedin. `WAF_BLOCKED` (403) görülürse hızlı tekrar yapmayın. `NETWORK_ERROR`/TIMEOUT ise bilgisayar DNS, proxy/VPN, modem ve saat ayarını araştırın.
4. Tanılama başarılıysa aynı komut BTC_TRY canlı fiyatını yalnız taze, doğru zaman damgalı Binance TR piyasa yanıtından doğrular. Fiyat bulunamazsa kesinlikle sahte fiyat yazmaz.
5. Yerel panelde **Ayarlar → Binance TR bağlantı tanılaması ve açık emirler** bölümünde, hesabınızı doğrulayarak BTC_TRY veya ETH_TRY açık emirlerini sorgulayabilirsiniz.
6. Gerçek bakiye, mevcut `/api/binance-tr/test` çağrısında salt okunur kalır. Eski kasa için mevcut parola gerekir; PR #50 DPAPI entegrasyonuyla sonraki açılışlarda parola gerekmez.
7. İnterneti kesin, komut başarısızlığını kaydedin; internete tekrar bağlanınca tanılamayı ve sadece **GET/salt okunur** sorguları yeniden başlatın. Gerçek emir gönderimini otomatik yeniden oynatmayın.

## Oturum ve emir güvenliği
- Açık emirler Binance TR'nin resmi `GET /open/v1/orders`, `type=1`, belirli `symbol` gereksinimiyle sınırlı.
- Borsa yanıtı sınırı doldurursa liste **eksik** sayılır; eksik bilgiyi sıfır emir gibi raporlamayın.
- Yeni uygulama uçları yalnız girişten sonra çalışır; POST okumalarında Origin, Sec-Fetch-Site ve X-Para-Request denetimi uygulanır.
- Bu dalda emir oluşturma, emir iptal etme, otomatik AL/SAT, üretim veritabanı veya gizli anahtar değişikliği bulunmaz.

## Birleştirme bağımlılıkları
Bu PR `main` tabanlıdır. Taslak PR #49 ve #50 henüz `main` üzerinde değilse çakışabilecek `src/main.js` ve `engine/server.js` kodlarının tek bir entegrasyon PR'ında gözden geçirilmesi gerekir. DPAPI için parola gerektirmeyen açık emir sorgusu, PR #50'nin `WindowsBinanceAccountService` sınıfına ayrıca uyarlanmalıdır.

## Güvenilir sonuca ulaşmak
Gerçek bakiye/açık emir tutarları yalnızca kullanıcı cihazındaki yetkili Binance TR hesabının imzalı gerçek yanıtlarından doğrulanabilir. Sadece GitHub Actions ve sentetik testler bu sonuca kanıt değildir. Gerçek emirler daima kapalı kalmalıdır.
