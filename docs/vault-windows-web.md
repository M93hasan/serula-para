# Binance ve AI API kasaları — Windows ve Web

## Windows — parola yerine DPAPI
- `scripts/start-local.js` Windows'ta `WindowsBinanceAccountService` kullanır.
- Yeni Binance kayıtları `%USERPROFILE%\\.para\\binance-tr.dpapi` dosyasına Windows CurrentUser DPAPI ile şifrelenir; sonraki okuma/test/silme işlemleri kasa parolası sormaz.
- Önceki `binance-tr.vault` kasası **otomatik açılmaz veya silinmez**. Ayarlar → `Eski kasayı DPAPI’ye aktar` ile eski parola **yalnız bir kere** gerekir. Yeni şifreli kasaya aktarım başarılı olunca orijinal eski kasa korunur; kullanıcı ayrıca yedekleyip iptal etmeden silinmez.
- Windows kullanıcısı ya da DPAPI anahtarları kaybolursa yeni kayıt otomatik açılamaz. Başka Windows hesabı, Linux, Cloudflare veya başka cihaz aynı kasayı açamaz.
- AI anahtarları zaten `WindowsAIProviderVault` ile Windows CurrentUser DPAPI kullanır; yeni ilk kurulumdan eski AI parola alanı kaldırıldı. Eski AI kasaları yalnız isteğe bağlı tek seferlik aktarımda parola ister.
- Giriş/oturum denetimi Binance kasasından ayrıdır. Yetkisiz istekler servis uçlarını kullanamaz; gerçek işlem ve para çekme izni açılmaz.

## Web — kod eklendi, ama üretimde etkin değil
- Cloudflare Worker `WebCredentialVault` kullanarak Google'da doğrulanmış `sub` kimliğinden türetilen, kullanıcıya özel D1 satırına **AES-256-GCM** ile şifreler. Şifreleme `owner_id` ve `provider` değerlerini AAD olarak bağlar.
- Web anahtarları tarayıcıya geri gönderilmez. `/api/web-vault/status` yalnız provider/configured döner. `save` / `delete` için same-origin ve oturum/limit kontrolleri uygulanır.
- `POST /api/binance-tr/balance/saved` kayıtlı Binance anahtarını yalnız sunucu belleğinde çözer ve **salt okunur** bakiye sorgular. Sunucuda Binance TR erişimi 403 ile engelleniyorsa yine çalışmayabilir.
- AI sağlayıcıları için şifreli kayıt/silme/durum eklendi, **web AI analiz motorunda kayıtlı anahtarların tüketimi henüz eklenmedi**. Bu, canlı web AI kullanımının tamamlandığı anlamına gelmez.
- Sunucu kasası varsayılan olarak kapalıdır: `WEB_VAULT_DB` (D1 binding) ve `WEB_VAULT_KEY` (gizli base64 kodlu **32 bayt** anahtar) yoksa 503 döner. Eski geçici, sekmeye özel Binance akışı korunmuştur.

### Staging'de doğrulama için (otomatik uygulanmadı)
1. Üretimden **ayrı bir staging D1** oluşturun; yalnız staging Worker'a `WEB_VAULT_DB` olarak bağlayın.
2. Sadece o veritabanında `cloudflare/schema/web-credentials.sql` şemasını uygulayın.
3. Güvenli rastgele 32 bayt anahtarı base64 kodlayarak Worker secret `WEB_VAULT_KEY` olarak tanımlayın. Bu değeri GitHub'a, loglara veya sohbetlere yazmayın.
4. Staging kimlik doğrulama ve oran sınırı kontrollerini doğrulayın.
5. İki farklı test kullanıcısıyla erişim yalıtımı, yanlış AAD, bozuk şifreli veri, sayfa yeniden açılması, iptal ve çıkış testlerini çalıştırın.
6. Gerçek API anahtarlarını testte kullanmayın; sahte sağlayıcı yanıtlarıyla başlayın. Bakiye okumaları için kullanıcı onayı ve salt okunur izinler gereklidir.

**Bu PR hiçbir D1 veritabanını değiştirmez, gerçek gizli anahtar oluşturmaz, üretime deploy etmez ve gerçek emirleri etkinleştirmez.**

### Birleştirme öncesi kontroller
- `npm ci && npm test && npm run build`
- Windows GitHub Actions üzerinde gerçek DPAPI round-trip (CI) ve kullanıcı Windows profiliyle kapanıp açma testi.
- PR #49 henüz `main` üzerinde değilse aynı dosyaların çakışmaları iki PR birleştirilmeden önce çözülmeli.
