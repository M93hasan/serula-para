# Web önizleme durumu

> **Entegrasyon dalı güncellemesi:** Web Google oturum iptali ayrı `GOOGLE_SESSION_DB` D1 binding ve `cloudflare/schema/google-web-sessions.sql` gerektirir. Bu eski önizleme notu son commit veya kaynak izolasyonunu kanıtlamaz; [güncel Google kurulumunu](GOOGLE_WEB_OAUTH_SETUP.md) inceleyin.

Bu dal PR #11 üzerine kurulmuş deneysel bir hazırlıktır; güvenli oturumla uçtan uca doğrulanmış staging veya production sürümü değildir. Mevcut Cloudflare Builds production bağlantısı `main` dalını kullanıyor; oradaki eksik lockfile sorunu bu dalı oluşturmakla kendiliğinden giderilmez. Main ve production yapılandırmasını değiştirmeyin.

Worker, Cloudflare Access imzasını, issuer ve audience değerlerini doğrulamadıkça paneli ve API'yi açmaz. Test dağıtımında yalnızca ilgili önizlemeye özel Access uygulaması ve erişim politikası, `ACCESS_ISSUER`, `ACCESS_AUD` ve `ANALYSIS_LIMIT` binding'i gerekir. `previews` hız sınırlaması bölgesel ve yaklaşık çalışır; tek başına kapsamlı kötüye kullanım koruması değildir. Başka uygulamaların Access politikasını değiştirmeyin. Çıkış bağlantısı tüm Cloudflare Access oturumlarını sonlandırabilir.

Web sürümü yerel kasayı, hesap bakiyesini, kalıcı işlem geçmişini ve yerel AI servisini kullanmaz; bu özellikler sunucu tarafında henüz mevcut değildir. Piyasa ve simülasyon hesaplamaları bellek içindedir ve gerçek emir özelliği yoktur. Gerçek piyasa yanıtları, Cloudflare bölgesel erişimi ve Access ile kullanıcı girişi bu dalda henüz doğrulanmamıştır.

Yayın öncesi: izole Access kimlik ve yetki politikası oluşturun; doğrulanmış kullanıcıyla giriş, yetkisiz erişim ve çıkışı, mobil/masaüstü ekranları, BTC/ETH gerçek Binance TR mumlarını, risk/simülasyonu ve hata mesajlarını HTTPS önizlemede test edin. Veri ayrımı, kalıcı geçmiş, AI ve hesap bağlantısı ayrı güvenli tasarım ve test gerektirir. TLS ve özel alan adı bağlantısını ayrıca uçtan uca doğrulayın.

Yalnızca bu kontroller ve kullanıcı onayından sonra hedef commit için production branch/build ve Worker sürümünü belirleyin. Geri alma için önceden çalışan Worker sürümünü ve yapılandırma kimliklerini kaydedin; sorun halinde önceki Worker sürümüne dönün, DNS/Access değişikliklerini ayrıca geri alın ve mevcut D1/secretları değiştirmeyin.
