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
