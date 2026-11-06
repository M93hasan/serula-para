# Binance TR gerçek emir altyapısı — KAPALI
**Durum:** yalnızca geliştirme/test altyapısı. Mevcut sunucuya, kullanıcı arayüzüne ve otomatik tarayıcıya bağlı değildir. Gerçek emir etkin değildir.

- Binance TR /open/v1/orders POST, /open/v1/orders/detail GET, /open/v1/orders/cancel POST için ayrı, imzalı ve uç nokta kısıtlı adapter.
- Sadece LIMIT emirleri: tam ondalık doğrulama, güncel borsa sembol filtreleri, miktar/fiyat adımı, minimum notional, kullanılabilir bakiye, fiyat yaşı ve fiyat sapması kontrolü.
- Her emir için kalıcı ve benzersiz clientId. Binance TR belgeleri clientId benzersizliğini **garanti etmez**; ağ kesintisinde aynı emir asla tekrar POST edilmez.
- İlk POST öncesi niyet SQLite'a kalıcı yazılır. Belirsiz durumda UNKNOWN; detay sorgusu ile uzlaştırılır. Kısmi dolum (PARTIALLY_FILLED) ve gerçekleşen miktar takibi vardır.
- İptal sonrası dahi detay yeniden sorgulanır: iptal talebi tam dolum veya kısmi gerçekleşmenin yokluğu anlamına gelmez.
- Bağımsız `gate` varsayılan olarak reddeder. Gerçek emir gönderen hiçbir HTTP uç noktası, başlatıcı, UI butonu veya otomasyon yazılmamıştır.
- Para çekme için hiçbir metod veya uç nokta eklenmemiştir. API anahtarına Binance TR panelinde **para çekme yetkisi verilmemelidir**.
- Bu çalışma tamamlanmadan önce gerekenler: ayrı güvenlik onayı, tutar/günlük zarar/açık emir limitleri, eşzamanlı işlemler ve yeniden başlatma testleri, kötü bağlantı senaryoları, Binance TR resmi ortamında kullanıcı gözetiminde doğrulama ve yeni ticaret kimlik bilgileri için ayrı izin mimarisi.

Bu kaynaklar gerçek para ile kullanılmaya hazır bir onay veya üretim dağıtımı değildir. Gerçek emir gönderimine yönelik hiçbir ayarı değiştirmeyin.

## Gerçek emir risk katmanı (taslak)

`engine/live-risk-engine.js` sadece bağımsız bir güvenlik bileşenidir. Ana sunucuda gerçek alım/satım yolu **yoktur**. `LiveOrderService` artık risk motoru olmadan yeni emir kabul etmez. Taşıyıcıdaki ayrıca kapalı `writeApproval` geçidi korunur. `REAL_ORDERS_ENABLED` değiştirilmedi.

Aşağıdaki sınırlar yalnızca **taslak güvenlik başlangıç değerleri** olarak kodlandı. Gerçek para ile kullanılmak üzere onaylanmadılar:

| Kontrol | Taslak sınır |
| --- | --- |
| İşlem başına maksimum tutar | 250 TRY |
| Günlük gerçekleşen ve net toplam zarar sınırı | 75 TRY |
| Toplam pozisyon maruziyeti | 500 TRY |
| Tek varlık pozisyon maruziyeti | 200 TRY |
| Günlük yeni emir sayısı | 5 |
| Tahmini komisyon | 30 baz puan |
| Spread | 60 baz puan |
| Fiyat kayması | 50 baz puan |
| Fiyat oynaklığı | 400 baz puan |
| Stop-loss uyarısı | Maliyet esasına göre %3 |
| Gözlemlenen fiyatın azami yaşı | 30 saniye |
| Risk verisi yaşı | 10 saniye |
| İzleyici kontrol aralığı | 5 saniye |

- Günlük zarar için doğrulanmış **gerçekleşen** ve **net (gerçekleşmemiş dahil)** PnL gerekir. Günlük emir sayıları yerel günlükte UTC takvim gününe göre de sayılır.
- Gerçek, doğrulanmış maliyet esası, toplam hesap maruziyeti, komisyon, spread, kayma ve net PnL sağlayıcısı henüz uçtan uca tamamlanmadı. Kullanıcı tarafından gönderilen JSON, bu bilgilerin yerine geçmez. **Veri yoksa HALT**, asla varsayımsal sıfır zarar kabul edilmez.
- Her yeniden başlatmada risk motoru yeniden **STARTUP_LOCK** durumuna döner. Ayrı ve devamlı sağlık izleme sağlayıcısı ile bağımsız onay olmadan `arm` reddedilir.
- İzleyici piyasa/bağlantı/anormal spread/stop-loss durumunda HALT kaydeder. Bağlantı kopması ve sonucu bilinmeyen emir uzlaştırmasında HALT kalıcıdır.
- HALT yeni alış veya satış emri başlatmaz. Stop-loss için `CLOSE_REQUIRED` önerisi üretilir, **otomatik satış / otomatik tasfiye yapılmaz**. Doğrulanmış bakiye, kullanıcı onayı ve ayrı yürütme güvenliği olmadan pozisyon kapatılamaz.
- `/halt` uç noktası mevcut simülasyon ve sanal işlemleri durdururken, bağımsız canlı risk motoru sisteme güvenli biçimde verilmişse onu da durdurur. Bugünkü başlatıcıda **canlı risk motoru kurulmadığından** bu yeni bir işlem yolu açmaz.

### Yayın öncesi zorunlu doğrulamalar

1. Binance TR'nin güncel emir şeması ve gerçek komisyonları resmi dokümantasyonla doğrulanmalı; yazma uç noktaları için para kullanılmayan ayrı test ortamı tercih edilmeli.
2. Borsadaki **tüm açık emirler** ve hesap bakiyeleriyle başlangıç uzlaştırması, toplam ve varlık bazlı maruziyet için tüm pariteleri kapsayan güncel değerleme, gerçekleşen/net PnL ve maliyet esası kaynağı kurulmalı.
3. Ağ bölünmesi, tekrarlı işlem niyeti, eşzamanlı istekte yarış, yeniden başlatma, gece/gün değişimi ve kısmi dolum testleri tam olarak geçmeli.
4. Kod gözden geçirme, bağımsız güvenlik onayı ve yalnızca operatörün bilinçli olarak başlatabildiği onay akışı eklenmeli. Para çekme izni hiçbir zaman açılmamalı.
