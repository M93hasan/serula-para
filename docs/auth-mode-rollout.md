# Giriş ve ilk kurulum — güvenli geçiş planı

## Durum (06.11.2026)
Bu dalın ilk parçası, her yerel panel açılışında **Local / İnternet tabanlı** seçim ekranını gösterir. İnternet modu, kimlik doğrulama altyapısı hazır olmadığı için **kapalıdır**. Seçim hiçbir kimlik doğrulama hakkı kazandırmaz ve diske kaydedilmez.

## Kalan iş paketleri
1. **E-posta OTP veya tek kullanımlık bağlantı:** Gerçek bir e-posta sağlayıcısı ve güvenilir internet sunucusu gerekir. Tek kullanımlık, süreli, hash'lenmiş tokenlar; yeniden gönderim ve IP/hesap sınırlaması; hesap bulma saldırılarına karşı sabit yanıt; atomik tüketim; teslimat hata yönetimi.
2. **Google oturumu:** Mevcut `engine/local-google-auth.js` PKCE/state/nonce ve ID token doğrulaması yapıyor; ancak oturumlar bellek içi Map'te. Windows kullanıcı hesabıyla korunan, süreli ve iptal edilebilir kalıcı yerel oturum tasarlanmadan yeniden başlatma sonrası otomatik giriş iddia edilmemeli. Google refresh token saklamaya gerek yok.
3. **İnternetsiz Local:** Yerel motor ve oturum doğrulaması tamamen çevrimdışı olmalı; geçerlilik ve zaman aşımı kontrolü yerelde yapılmalı. Bulut oturumunu çevrimdışı doğrulamanın ayrı güven modeli/testleri gerekir. Piyasa/API çağrıları internet yokken erişilemez ve arayüz bunu söylemeli.
4. **İlk kurulum:** İlk ekranda mod seçimi; ardından seçili moda uygun kimlik doğrulama; sonra mevcut Binance TR kasası ve AI sağlayıcısı adımları. Önceden kurulmuş kasalar korunmalı.
5. **Testler:** Çevrimdışı açılış, yeniden başlatma, süre aşımı, logout/iptal, OTP tekrar kullanımı, yanlış kod, rate limit, Google callback CSRF/state/nonce, geçerli oturumla açılış, eski local token geriye uyumluluğu, UI erişilebilirliği.

## Güvenlik
- Tarayıcı localStorage/sessionStorage içinde API anahtarı, Google tokenı veya yerel bearer tokenı kalıcı tutmayın.
- Bulut oturumunu yalnızca geçerli ve yetkilendirilmiş kullanıcıya bağlayın; e-posta eşitliğini tek başına hesap birleştirme kanıtı saymayın.
- Yerel motor yalnızca 127.0.0.1 üzerinde kalsın. Ağ üzerinden açmak için ayrı backend, TLS, session ve CSRF modeli gerekli.
- Binance TR emirleri ve canlı sistem bu çalışmayla etkinleştirilmez.
