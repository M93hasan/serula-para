# PARA ilerleme

- PR #1 üzerine PR #3: Binance TR salt okunur time/symbols/account adapteri; gerçek emir/para çekme yok. TR hesap bağlantısı gerçek anahtarla doğrulanmadı. Skills Hub, CCXT ve Binance Trade Bot için TR uyumu kanıtlanmadı; kullanılmadı.
- Yerel kasa: scrypt + AES-256-GCM; parola ve anahtarlar terminalde gizli girilir, kasa üzerine yazılmaz. Kasa yerel hesap istemcisine ve panele bağlıdır. Windows dosya ACL'leri işletim sistemi kullanıcı hesabına bağlıdır; Windows üzerinde sınanmadı.
- SQLite işleminde simülasyon risk durumu ve olaylar birlikte kalıcıdır; yeniden açılışta durdurulur. Çoklu bağlantı kontrolleri mevcut; simülasyondur, gerçek emir muhasebesi değildir.
- 127.0.0.1:8788 aynı kaynak paneli: bellekte tutulan bearer anahtarı, Host/Origin/Fetch Metadata denetimi, CSP, durum ve acil durdurma. İnternete açılmamalı. Oturum yönetimi, uzaktan erişim, parola kurtarma ve güvenli çok kullanıcılı ortam henüz yok.
- Eksik: Windows gerçek cihaz testi, canlı TR salt okunur uyumluluk, gerçek piyasa verisi/strateji ve muhasebe, otomatik ajan, canlı işlem risk değerlendirmesi, Cloudflare/uzak sunucu kimlik doğrulaması. Gerçek işlemler kapalıdır.
- Test: Node testleri, derleme ve Host/Origin sınamaları; Linux Chromium masaüstünde sahte hesap verileriyle panel akışı denendi. Mobil ve Windows cihaz testi yapılmadı.

- Binance TR ayarları: yerel panelden şifreli kasa kaydet/değiştir/sil ve parolayla Binance TR signed spot account sorgusu, gerçek varlıkların salt okunur gösterimi. Sentetik verilerle uçtan uca sunucu testi yapıldı; gerçek hesap ve Windows üzerinde doğrulanmadı. Chromium tarayıcıda yerel giriş, sahte API bilgisi kaydı ve örnek bakiye gösterimi doğrulandı. Binance TR tarafında yalnızca okuma izni elle ayarlanmalıdır.

- Windows için start-para.cmd ve yerel başlatıcı eklendi: bağımlılık kontrolü, panel derleme, geçici erişim anahtarı ve tarayıcı açma. Windows 11 cihazında henüz çalıştırılmadı.

- PR #3 karar araştırması: Binance TR belgelerindeki type-1 `api.binance.me` mum ve son işlem uçları, yalnızca `BTC_TRY`/`ETH_TRY`; kapalı saatlik mum, gecikmiş veri ve saat farkı kontrolü. Windows kullanıcısı mevcut hesap bağlantısını doğruladığını bildirdi; piyasa uçlarına gerçek ağ erişimi bu ortamda doğrulanmadı.
- Kural tabanlı SMA(5/20) AL/SAT/BEKLE, gösterge gücü (başarı olasılığı değil), son 20 mumun TRY hacmiyle seçim. Son 250 saatlik veriyle tek varlıklı backtest; sinyal kapanışta, sanal dolum sonraki açılışta, varsayımsal komisyon ve bütçe/kayıp eşiği. Seçim güncel örneklem üzerinden yapıldığı için geçmiş testte seçim yanlılığı vardır. Kayma, spread, likidite, tam borsa filtreleri, vergiler ve gerçek komisyon otomatik doğrulanmaz. Kayıp eşiği sıçramalarda aşılabilir. Sonuçlar gerçek kazanç değildir.
- Freqtrade stratejileri/backtest ve Binance Skills Hub değerlendirildi: Binance TR uyumu kanıtlanmadığından ve emir yetenekleri nedeniyle kodları kullanılmadı. https://github.com/freqtrade/freqtrade-strategies ; https://github.com/freqtrade/freqtrade/blob/develop/docs/lookahead-analysis.md ; https://github.com/binance/binance-skills-hub ; https://www.binance.tr/apidocs/ .
