# Giriş ve ilk kurulum — uygulama ve dağıtım

## Bu dalda uygulananlar
- Yerel uygulamada her yeni sayfa açılışında Local / İnternet tabanlı mod seçimi. İnternet modu, çevrimiçi bir kimlik doğrulama sunucusu olmadığı için güvenli biçimde kapalıdır.
- Google OAuth, e-posta kodu ve geçici yerel kurtarma anahtarı ile giriş seçenekleri.
- Google ve e-posta oturumları için 8 saat süreli HttpOnly/SameSite=Strict cookie. Sunucu yalnızca SHA-256 özeti ve süreli kimlik verisini yerel kullanıcı dizininde `~/.para/auth-sessions.json` dosyasında tutar.
- Local motor yeniden başladığında ve internet yokken, süresi dolmamış oturum yerel olarak doğrulanır. Google'a tekrar bağlanmak gerekmez. Oturumun süresi dolduğunda Local kurtarma anahtarı kullanılabilir.
- E-posta kodları 6 rakamlı, tek kullanımlık, 5 dakika geçerli; 5 yanlış doğrulama denemesinde geçersiz; 15 dakikada en fazla 3 gönderim.
- Önceki Binance TR ve AI kasa kurulumu korunur. Gerçek emirler kapalıdır.

## Windows yapılandırması
`start-para.cmd` ile açılan yerel motorun ortamında aşağıdaki değişkenleri tanımlayın; **anahtarları GitHub'a göndermeyin**:

| Değişken | Anlamı |
| --- | --- |
| `PARA_AUTH_EMAIL` | Giriş yapabilecek tek izinli e-posta adresi |
| `PARA_GOOGLE_CLIENT_ID` | Google OAuth Desktop/loopback destekli istemci kimliği |
| `PARA_GOOGLE_CLIENT_SECRET` | Sağlayıcı yapılandırması gerektiriyorsa istemci sırrı |
| `PARA_GOOGLE_ALLOWED_SUB` | İsteğe bağlı ek Google subject kısıtı |
| `PARA_RESEND_API_KEY` | E-posta kodu gönderen Resend hesabının API anahtarı |
| `PARA_EMAIL_FROM` | Resend üzerinde doğrulanmış gönderen adresi |

Google OAuth yönlendirme adresi tam olarak `http://127.0.0.1:8788/auth/google/callback` olmalıdır. Resend gönderim hesabı ve doğrulanmış alan adı olmadan e-posta teslimatı çalışmaz. Yapılandırılmamış seçenekler UI'da gösterilmez.

## Güvenlik ve sınırlar
- Local HTTP servisi internete ve LAN'a açılmamalı; yalnız `127.0.0.1:8788`.
- Kullanıcı Windows profilinin ve `~/.para` klasörünün erişim kontrollerini korumalı. Yerel disk erişimi veya kötü amaçlı yazılım karşısında tarayıcı çerezi tek başına cihaz güvenliği sağlamaz.
- Kodlar ve Google ID tokenları diske yazılmaz; yalnız SHA-256 oturum belirteçleri ve sınırlı kimlik bilgileri diskte kalır. Logout oturum özetini siler.
- Oturumun 8 saatlik süresi internetsizken de uygulanır. Piyasa verisi ve e-posta kodu gönderimi internet olmadan çalışmaz.
- E-posta kodu göndermek için internet gerekir. İlk kez Google girişi de internet gerektirir.
- İnternet tabanlı mod için HTTPS, uzak backend, sunucu oturum deposu, kimlik/CSRF/hesap izolasyonu ayrıca uygulanmalıdır. Buradaki local mekanizmayı doğrudan internete sunmayın.
- E-posta kodunun 6 haneli olması; tek cihazla sınırlı, izinli e-posta ve rate limit ile korunur. Dışarı açılacak bir hizmet için IP tabanlı rate limiting, sağlayıcı teslimat geri bildirimi ve denetim kayıtları da gereklidir.

## Doğrulama
`npm ci && npm test && npm run build`

Windows 11 ve gerçek e-posta sağlayıcısıyla, motoru kapatıp açarak internetsiz oturum devamı, logout, süre aşımı ve 403 durumları ayrıca doğrulanmalıdır. Test geçmeden PR birleştirilmemeli veya canlıya yayınlanmamalıdır.
