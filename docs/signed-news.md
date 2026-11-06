# Yerel AI için imzalı haber kaynağı

Yerel AI, parite analizi sırasında operatörün yapılandırdığı HTTPS kaynağından imzalı bir haber alabilir. Taranan adayın AI ile değerlendirilmesi de aynı sağlayıcıyı kullanır. Kaynak ayarlanmamışsa veya kanıt geçersizse araştırma haber kanıtı olmadan devam eder ve işlem kararı BEKLE kalır.

| Yerel ortam değişkeni | Değer |
| --- | --- |
| `PARA_SIGNED_NEWS_SOURCE` | Sağlayıcıyla üzerinde anlaşılan kaynak kimliği |
| `PARA_SIGNED_NEWS_URL` | Sorgu dizesi ve kullanıcı bilgisi içermeyen sabit HTTPS uç adresi |
| `PARA_SIGNED_NEWS_PUBLIC_KEY` | Sağlayıcının bağımsız olarak doğrulanmış Ed25519 açık anahtarı, Base64 SPKI DER |

Uç adresi `GET ?symbol=BTC_TRY` benzeri bir istek kabul eder ve JSON içinde `payload`, `signature` ve `article` dizgilerini döndürür. İmzalanan UTF-8 `payload` dizgesi `id`, `source`, `symbol`, `url`, `issuedAt`, `expiresAt` ve `articleSha256` alanlarını içerir. `url` sorgu parametresi hariç yapılandırılmış uç adresidir. Zamanlar UTC milisaniye cinsindendir ve kanıtın geçerliliği en fazla beş dakikadır. Sağlayıcı `article` UTF-8 içeriğinin SHA-256 özetini hesaplar ve `payload` dizgesini Ed25519 ile imzalayıp imzayı Base64 olarak döndürür.

Yerel model haberin en fazla ilk 800 karakterini alır. Karar günlüğü doğrulanan kaynak bilgisini ve içerik özetini tutar. İmza kaynağı ve içerik bütünlüğünü doğrular. Haberdeki iddiaların doğruluğu ayrıca değerlendirilir. Piyasa verisi ve risk kaynakları işlem için bağımsız olarak doğrulanmalıdır.

İmza üreten gerçek sağlayıcı ve açık anahtarı kurulum sırasında belirlenir. Otomatik testler sentetik bir Ed25519 anahtar çifti ve ağ yanıtı kullanır.
