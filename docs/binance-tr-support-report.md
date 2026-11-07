# Binance TR destek talebi taslağı — 07.11.2026

Konu: Binance TR genel API ve piyasa erişiminde 403/451; salt okunur doğrulama yapılamıyor

Merhaba, Binance TR API belgeleri ve izin verilen piyasa verisi adresleri konusunda yardım rica ediyoruz. Uygulamamız salt okunur genel piyasa verisi ve yetkilendirilmiş hesap verisi okumayı amaçlıyor. Bu tanılama sırasında API anahtarı kullanılmadı ve emir gönderilmedi.

- Kullanıcının önceki Windows ağında bildirilen sonuç: `https://www.binance.tr/open/v1/common/time` HTTP 200, piyasa hostu `api.binance.me` HTTP 403. Bu sonuçlar farklı bir ortamda alınmıştır; zaman ve ağ ayrıntıları kullanıcı tarafından teyit edilmelidir.
- 07.11.2026 yaklaşık 08:09 UTC'de yönetilen Linux ortamından `https://www.binance.tr/open/v1/common/time`, `https://www.binance.tr/apidocs/` ve `https://api.binance.me/api/v3/ticker/24hr?symbol=BTCTRY` HTTP 451 döndü. Genel saat yanıtında CloudFront hata başlığı ve `/not-support` içeriği görüldü.
- Ayrı GitHub Actions Windows runner'ında genel saat uç noktası 07.11.2026 08:10 UTC civarında HTTP 451 döndü: https://github.com/M93hasan/serula-para/actions/runs/42354277327
- Bu sonuçlar IP, bölge, WAF veya hizmet politikası nedenlerinden hangisinin geçerli olduğunu tek başına kanıtlamaz. 403, 451 ve 418/429 birbirinden ayrı incelenmelidir. Engeli aşma girişimi yapılmadı.

Lütfen Binance TR için güncel resmî piyasa REST adreslerini ve BTC/TRY, ETH/TRY fiyatı, mum, emir defteri ve zaman damgası uç noktalarını; ilgili ağ/bölge ve kullanım şartlarını; 403 ve 451 için gerekli teşhis bilgilerini ve güvenli tekrar deneme politikasını belirtin. Gerekirse kullanıcının gerçek Windows ağının çıkış IP'si ve istek kimliği destek kanalında özel olarak paylaşılabilir. API anahtarı, secret, parola ve hesap dökümü paylaşılmamalıdır.

## Ek teşhis ve istenen yanıt

- `www.binance.tr` üzerindeki genel saat uç noktası ile `api.binance.me` üzerindeki piyasa uç noktası farklı hizmetlerdir; birinin HTTP 200 yanıtı diğerinin erişilebilir olduğunu göstermez. Genel saat uç noktası piyasada işlem gören fiyatın kanıtı değildir.
- Aynı genel saat uç noktasının bir Windows kullanıcı ağında bildirilen HTTP 200 sonucuna karşılık yönetilen Linux ve GitHub Windows runner ağlarında HTTP 451 dönmesi, bu yanıtın yalnızca uygulamanın Node.js koduna bağlanamayacağını gösterir. İstemci çıkış ağı, bölge veya sağlayıcı politikası dahil kesin kök neden mevcut kanıtla belirlenemez. `api.binance.me` için daha önce bildirilen HTTP 403'ün nedeni de destek tarafından açıklanmalıdır.
- Binance TR'den, bu iki host ve istenen piyasa uç noktaları için resmî destek kapsamını, isteğin reddedilmesine ilişkin uygulanabilir neden/istek kimliği teşhisini ve erişim koşullarını teyit etmesini rica ediyoruz. Destek olumlu yanıt verene ve yetkili ağda tekrar sınanana kadar canlı BTC/TRY veya ETH/TRY doğrulanmış sayılmaz.
- Sentetik 403/451 testlerinde otomatik tarama durur ve tekrar etkinleştirme manuel inceleme ister; bunlar sağlayıcının gerçek ağ erişiminin düzeldiğini göstermez.

## Tekrar kontrol — 07.11.2026

07.11.2026 yaklaşık 08:34 UTC'de aynı yönetilen Linux ağından, yalnızca herkese açık GET ile yeniden kontrol edildi: `www.binance.tr/apidocs/`, `/open/v1/common/time`, `/open/v1/common/symbols` ve `api.binance.me/api/v3/ticker/24hr` üzerindeki `BTCTRY` ve `ETHTRY` sorgularının her biri HTTP 451 döndü. Yanıt gövdelerinden canlı fiyat alınamadı; bu test hesap veya emir uçlarını çağırmadı. Bu yeni bulgu çıkış ağında erişim engelinin sürdüğünü gösterir; Binance TR tarafından söz konusu piyasa yolunun desteklendiği veya 451'in kesin nedeni hakkında tek başına kanıt değildir.
