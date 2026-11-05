# PARA Trading — Proje durum kaydı ve devir teslim

Tarih: 2026-11-05. Depo: https://github.com/M93hasan/serula-para

Bu belge GitHub'da doğrulanan PR/dal durumlarını, ajan raporlarını ve kullanıcının Windows testlerini bir araya getirir. Parola, API Key, Secret ve erişim tokenları bu belgeye **kaydedilmemiştir**.

## PR ve dal envanteri

| PR | Görev | HEAD SHA | Base | Durum |
|---|---|---|---|---|
| [#1](https://github.com/M93hasan/serula-para/pull/1) | Yerel panel temeli, Windows başlatıcısı | `7f5464fec91e9192f92a8c83f87180ea862088b5` | `main` | Açık taslak |
| [#3](https://github.com/M93hasan/serula-para/pull/3) | Binance TR salt-okunur API, kasa, simülasyon | `53e067433e76ae7ca6744d5b78f0c7ec13e895d9` | `feat/para-trading-panel-foundation` | Açık taslak |
| [#4](https://github.com/M93hasan/serula-para/pull/4) | Piyasa grafikleri, kararlar, arayüz ve portföy alt toplamı | `f33e9040f040604a0f76ffd49dc33d604ec11538` | `feat/para-safe-engine` | Açık taslak |
| [#5](https://github.com/M93hasan/serula-para/pull/5) | OpenTerminal referanslı arayüz, komut paleti, grafik odak | `a58b57d7d5a05a4a7d8174a7cb5de039063fb81f` | `feat/para-dashboard-modern` | Açık taslak |
| [#6](https://github.com/M93hasan/serula-para/pull/6) | Binance TR zaman doğruluğu ve komisyon dahil işlem limiti | `2b271861472f8c72201dcfa34214f7da9be1850f` | `feat/para-dashboard-modern` | Açık taslak |
| [#7](https://github.com/M93hasan/serula-para/pull/7) | **PR #5 + PR #6 kod entegrasyonu** | `3c43783976b8e7ebe1b79f9d97b9a9a0dc0ef6bb` | `feat/para-open-terminal-workspace` | Açık taslak |

[#2](https://github.com/M93hasan/serula-para/issues/2) bir koordinasyon Issue'sudur, PR değildir. `main` commit `b54d72f2caa56620d82e1c1b736827b2a6eba573`; PR'lar main'e merge edilmedi. PR #8/#9 kontrol sırasında mevcut değildi.

PR #7'nin `feat/para-integrated-validation` dalı, PR #5'in arayüzünü ve PR #6'nın teknik düzeltmelerini birlikte içerir. GitHub karşılaştırması: PR #4 dalından 4 commit ahead, 0 behind. Aynı entegrasyon tekrar yapılmamalı.

## Çalışan / kodda mevcut özellikler

- Windows `start-para.cmd`, Vite arayüz ve Node.js yerel motor; `127.0.0.1:8788` üzerindeki erişim geçici bearer anahtarla sınırlı.
- Binance TR salt-okunur hesap bakiyesi; API Key/Secret için scrypt + AES-256-GCM ile yerel şifreli kasa.
- BTC/TRY ve ETH/TRY piyasa fiyatları, kapalı saatlik mumlar, grafik geçişi; anahtarsız `node scripts/check-market.js`.
- SMA(5/20) **kural tabanlı** AL / SAT / BEKLE; simülasyon, komisyon ve limit kontrolleri. Gerçek AI çoklu ajanı henüz entegre edilmedi.
- Portföyde fiyatı eksik coinler için değerlenebilen alt toplam ve eksik varlık ayrımı.
- PR #7'de terminal teması, Ctrl+K komut menüsü, grafik odak ve bölgesel erişim hata mesajı.
- Gerçek emir gönderme ve para çekme **yok**.

## Test kayıtları ve sınırlar

- PR #4 için ajanın raporu: 24 test + build; PR #6 ve PR #7 için ajanın raporu: 27 test + build. Bu oturumda bağımsız olarak yeniden çalıştırılmadı; PR #7 için GitHub Actions çalışma kaydı sorgusunda sonuç bulunmadı.
- PR #7 için ajanın sentetik masaüstü/mobil Chromium kontrol raporu mevcut; **PR #7 birleşik sürümü Windows'ta henüz ayrı doğrulanmadı**.
- Kullanıcı Windows 11'de `start-para.cmd` ile başarılı Vite derleme ve sunucu başlangıcı gösterdi. `node scripts/check-market.js` sonucu “Piyasa kontrolü başarılı. Hesap bilgileri kullanılmadı.” oldu. Kullanıcı BTC/TRY gerçek mum grafiği ekran görüntüsü paylaştı, ETH/TRY grafik geçişinin de çalıştığını söyledi. Bu testler, PR #7 birleşik sürümünün uçtan uca testi yerine geçmez.
- Kullanıcı BNB ile ilgili bir hata olmadığını açıkça belirtti. Gereksiz BNB değişikliği yapılmamalı.

## Devam eden / planlanan görevler

1. **AI çoklu ajan analizi ve entegrasyonu:** [Issue #2'deki görev](https://github.com/M93hasan/serula-para/issues/2) kapsamında `TauricResearch/TradingAgents` ile `auronsun/TradingAgents-crypto` karşılaştırılacak; doğru seçenek ayrı PR'da salt-okunur/simülasyon olarak uyarlanacak. Bu görev planlanmıştır; bir AI PR'ı teslim edildiği doğrulanmadı.
2. **Web sitesi üzerinden güvenli giriş (yeni kullanıcı isteği):** Mevcut yalnızca localhost'a ait bearer erişimi dış internete açılmamalı. Uygun bir web frontend + sunucu oturumu, güvenli kimlik doğrulama, CSRF, cookie, rate limiting, kullanıcı ayrımı, gizli bilgi saklama ve Cloudflare mimarisi için inceleme/ayrı PR gereklidir. **Kullanıcının 2026-11-05 tarihinde onayladığı kesin hedef alan adı: `para.serula.site`.** DNS/domain yönetimi ve erişim yetkileri henüz doğrulanmadı; alan adının onaylanması dağıtım veya canlıya alma onayı anlamına gelmez. Canlı yayın kendiliğinden yapılmayacak.
3. Ortak entegrasyon PR #7 için son Windows/browser testleri; CI kanıtı ve güvenlik kontrolü.
4. PR #1–#7 main'e merge edilmedi; önce bağımlılık sırası, koruma ve açık onay gereklidir.

## Devir kuralları

- `main` dalına doğrudan push, PR merge, production deployment, gerçek emir veya çekim **yapma**.
- PR #5 arayüz, PR #6 teknik iyileştirme, PR #7 ise bunların birleşik test sürümüdür; paralel ajanlar mevcut işleri ezmesin.
- Binance API Key/Secret, şifreli kasa parolası, yerel bearer token, LLM API Key veya kişisel bilgileri issue, PR, log ya da UI'ye kaydetme.
- Web girişinin localhost oturumundan **tamamen ayrı güvenli bir mimari** gerektirdiğini varsay; web erişimini yerel portu açarak sağlamaya çalışma.
- Bu durum anlık görüntüsünü yenilemek gerektiğinde yeni kanıtı ve SHA'yı ekle, gerçekte test edilmemiş sonuçları başarılı diye işaretleme.
