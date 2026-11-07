# PARA Trading web — Google OIDC (Cloudflare Access olmadan)

Bu değişiklik sadece PR #32 önizleme dalındadır; production deploy ve main merge içermez.

## Google Cloud

OAuth client: Web application. Authorized JavaScript origin ve Authorized redirect URI'nin önizleme URL'siyle birebir eşleştiğini doğrulayın. Redirect URI: `https://feat-para-integration-20261106-local-serula-para.m93hasan.workers.dev/auth/google/callback`. Google OAuth consent Testing aşamasında izinli test hesabı ekli olmalıdır.

## Cloudflare Worker çalışma zamanı (önizleme)

Aşağıdaki değerler Worker **runtime** ortamına girilmeli (yalnızca build-time değerleri yeterli değildir). Bunları kaynak koduna veya GitHub'a kaydetmeyin:

- `GOOGLE_OAUTH_CLIENT_ID`: Web OAuth client ID (public identifier).
- `GOOGLE_OAUTH_CLIENT_SECRET`: Web OAuth Client Secret, Cloudflare **Secret** olarak.
- `GOOGLE_ALLOWED_EMAIL`: Giriş yapmasına izin verilen, Google'da doğrulanmış test e-posta adresi.
- `GOOGLE_REDIRECT_URI`: Yukarıdaki tam callback URI.
- `GOOGLE_SESSION_SECRET`: Rastgele üretilmiş en az 32 baytlık yüksek entropili secret; diğer ortamlardan farklı olmalı, Cloudflare **Secret** olarak.

DİKKAT: Önizleme ve production aynı Worker secret kaynağını paylaşıyorsa production değerlerini değiştirmeyin. Ayrı preview yapılandırması doğrulanmadan herhangi bir secret yazmayın. `ACCESS_AUD` ve `ACCESS_ISSUER` yeni kimlik doğrulamada kullanılmaz; Access edge uygulamasının varsa kendi policy'si ayrıca yapılandırılır.

## Akış

- `GET /auth/google/login`: state, nonce, PKCE-S256 üretir; 10 dakikalık HttpOnly+Secure cookie; Google'a yönlendirir.
- `GET /auth/google/callback`: state ve Google ID token imzası/issuer/audience/nonce ile izinli e-posta doğrulanır, 8 saatlik imzalı HttpOnly oturum çerezi oluşturulur.
- `GET /api/auth/me`: yalnız doğrulanmış oturuma 200; izinsize 401.
- `POST /auth/logout`: aynı origin ve `X-Para-Request: 1` ile oturumu siler.
- Panel assetleri ve API'ler oturumsuz açılmaz. Analiz API'sinin aynı-origin ve rate-limit koruması sürer. Gerçek emir yetkisi verilmez.

## Doğrulama

`npm ci && npm test && npm run build`; sonra gerçek Google test hesabıyla önizleme URL'sinde giriş, yanlış hesap reddi, süre aşımı, logout, yeniden giriş ve oturumsuz API 401 kontrolleri. Henüz gerçek Google üzerinden uçtan uca giriş doğrulanmış değildir. OAuth client secret veya oturum çerezlerini ticket/sohbete göndermeyin.

## İptal edilebilir Web oturumu — entegrasyon dalı

Oturumlar artık `GOOGLE_SESSION_DB` adlı D1 binding ve `cloudflare/schema/google-web-sessions.sql` şemasını gerektirir. Oturum kimliğinin özeti sunucuda saklanır; logout başarılı dönmeden önce ilgili kayıt iptal edilir. Depo yoksa veya doğrulanamazsa giriş ve oturum doğrulaması güvenli biçimde reddedilir. Önceki kayıtlı olmayan çerezler yeniden giriş gerektirir. Süresi dolan kayıtların temizlenmesi için kontrollü bir bakım politikası ayrıca belirlenmelidir.

Staging için production'dan ayrı D1, OAuth istemcisi/callback, test hesapları ve secret'lar kullanın. D1 şemasını yalnız ayrılmış staging veritabanının kimliği doğrulandıktan sonra uygulayın. Bu değişiklik production'a dağıtılmamıştır; gerçek Cloudflare D1 ve Google ile uçtan uca doğrulama bekler. Logout başarısızsa çerezi temizlemek tek başına token'ı iptal etmez; kullanıcıya sunucu tarafı iptalin doğrulanmadığını bildirin.
