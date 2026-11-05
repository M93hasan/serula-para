# Google ile giriş — PARA Trading (Windows + web/mobil)

Bu iki mod **aynı Google hesabıyla giriş deneyimi** sağlar, ancak **aynı oturumu veya yerel veriyi paylaşmaz**.

## Windows / yerel motor

1. Google Cloud Console → APIs & Services → Credentials → OAuth client ID oluştur. Uygulama tipi **Desktop app** olmalı. Onay ekranı External/Testing ise kendi Google hesabını test kullanıcılarına ekle.
2. Windows CMD oturumunda ortam değişkenlerini ayarla (değerleri GitHub'a, Issue yorumuna, ekran görüntüsüne veya sohbete gönderme):

   ```bat
   set GOOGLE_OAUTH_CLIENT_ID=GOOGLE_DESKTOP_CLIENT_ID
   set GOOGLE_ALLOWED_EMAIL=YOU@gmail.com
   rem Google istemciniz gerektiriyorsa, secret'i sadece bu yerel CMD oturumuna girin:
   rem set GOOGLE_OAUTH_CLIENT_SECRET=SECRET_FROM_GOOGLE_CLOUD
   node scripts/start-local.js
   ```

3. `http://127.0.0.1:8788` → Ayarlar → **Google ile giriş yap**.
4. Google uygulaması sistem tarayıcısında açılır; yerel OAuth dönüş adresi `http://127.0.0.1:8788/auth/google/callback`. Masaüstü OAuth istemcileri bu loopback akışını destekler.
5. Sadece `GOOGLE_ALLOWED_EMAIL` veya `GOOGLE_ALLOWED_SUB` eşleşen Google hesabı kabul edilir. İkinci seçenek, değişmez Google hesap kimliğiyle daha sıkı korumadır. İstenirse ikisi birden ayarlanabilir.
6. Google istemciniz token değişiminde `client_secret` gerektiriyorsa `GOOGLE_OAUTH_CLIENT_SECRET` yalnız **yerel ortam değişkeni** üzerinden verilir. Secret'ı dosyalara yazmayın.

**Koruma:** Authorization Code + PKCE S256, tek kullanımlık süreli state, nonce, doğrulanmış RS256 imzalı Google ID token, issuer/audience/expiry, doğrulanmış e-posta / sub allowlist ve 8 saatlik HttpOnly SameSite=Strict session cookie. Google token'ları, refresh token'ları ve oturum çerezleri SQLite veya dosyalara yazılmaz. Windows bilgisayarındaki sunucu sadece `127.0.0.1` üzerinde çalışır; Google oturumu tarayıcı kapandıktan sonra cookie ömrü boyunca geçerli kalabilir ancak yerel sunucu yeniden başladığında bellek içi oturumlar geçersiz olur.

**Eski yerel erişim anahtarı** kurtarma/fallback amaçlı çalışmaya devam eder. Google ayarları yapılmamışsa bu yöntem kullanılabilir. Böylece eksik Google yapılandırması kullanıcıyı kilitlemez.

Google ile oturum açılması Binance TR **kasa parolasını otomatik çözmez**. API Key/Secret şifreli yerel kasada kalır. Kasayı Windows DPAPI ile parolasız otomatik açma bu PR'ın kapsamında DEĞİLDİR.

## Web ve telefon — Cloudflare Access üzerinden Google

Cloudflare Worker'daki `/api/auth/me` zaten **Cloudflare Access JWT imzası**, issuer ve audience doğrulaması yapar. Web sürümünde ayrı Google OAuth client-secret'ını Worker koduna eklemek yerine Cloudflare Access'in desteklenen **Google** kimlik sağlayıcısı kullanılır:

1. Google Cloud Console'da **Web application** OAuth client oluştur.
2. Google yetkilendirilmiş callback: `https://YOUR-TEAM.cloudflareaccess.com/cdn-cgi/access/callback`.
3. Cloudflare Zero Trust → Integrations → Identity providers → Add → **Google**, client ID ve secret'ı Cloudflare panelinden güvenli kaydet; PKCE etkinleştir.
4. Cloudflare Access → Applications bölümünde PARA Trading uygulamasını ilgili **web alan adlarına** bağla. Sadece istenen Google kimlik sağlayıcısını seç, erişim politikasını **yalnızca izinli kullanıcı e-posta/kimliğine** kısıtla.
5. Login denemesinde Cloudflare Access'in Google girişini sunduğunu ve uygulama API'sinin Access JWT'siz 401 döndürdüğünü doğrula. `/cdn-cgi/access/login` bağlantısı yalnız Access policy doğru kurulduysa çalışır.
6. Access uygulamasına ait `ACCESS_ISSUER`, `ACCESS_AUD` değerleri gizli olmayan yapılandırma olarak doğrulanmalı; yanlış veya boşsa Worker fail closed kalır. Google client-secret GitHub'a veya site front-end'ine yazılmaz.

**Web çalışma sınırları:** Web / mobil panel yalnız mevcut Cloudflare Access tarafından korunan araştırma ekranlarına erişir. Yerel `binance-tr.vault`, `account-observations.sqlite`, `paper.sqlite`, gerçek Binance TR hesap API'si, yerel Ollama ve Windows motoruna uzaktan erişim **YOKTUR**. Bu verileri web/mobil ekrana taşımak için ileride bağımsız bir tasarım, açık kullanıcı onayı ve ek güvenlik denetimi gerekir. Üretim ortamını bu PR ile değiştirmeyin.

## Güvenlik / test

```sh
npm ci
npm test
npm run build
```

Sentetik OAuth testleri, PKCE, state tek kullanımlılığı, nonce/e-posta engelleri, oturum çerezi, cross-origin ve korunan API sınırlarını kapsar. Gerçek Google Cloud OAuth testi için **kullanıcının kendi Google Cloud proje ayarlarını yapması** ve kendi Windows cihazında sistemi açması gerekir. Cloudflare Access Google IdP'yi etkinleştirme adımı da hesap yöneticisince tamamlanmalıdır. Her ikisi bitmeden canlı girişin çalıştığı iddia edilmemelidir.

Bu çalışma gerçek emirleri etkinleştirmez; `REAL_ORDERS_ENABLED=false` korunur. Production deploy, main merge veya production D1/secret değişikliği yapılmaz.

Doküman: https://developers.google.com/identity/protocols/oauth2/native-app ve https://developers.cloudflare.com/cloudflare-one/integrations/identity-providers/google/
