# Manuel gerçek emir onayı — hazırlık aşaması

Bu dal **gerçek emir özelliğini etkinleştirmez**. `ManualOrderApproval` yalnızca bellekte, tek kullanımlık, 60 saniyelik ve sabit işlem parametrelerine bağlı onay oluşturur. Binance TR'ye POST yapmaz; API anahtarına erişmez. Sadece TRY kotasyonlu spot emir taslaklarını kabul eder; her öneri önceki öneriyi geçersiz kılar. ONAYLA + 32 haneli kimlik tam eşleşmelidir.

## Mevcut engeller
- Binance TR resmî /open/v1/orders çağrısının imzası, lot/precision/notional filtreleri ve emir sorgu/uzlaştırma akışı yerel Windows hesabıyla doğrulanmadı.
- Sunucu endpoint'leri ve ön yüz onay diyaloğu henüz bu modüle bağlanmadı. Dolayısıyla kullanıcı bu modülü panelde kullanamaz.
- Kullanılabilir bakiye, güncel alış/satış fiyatı, komisyon, spread, slippage, max günlük kayıp, HALT ve kalıcı idempotency doğrulaması yürütme katmanında yapılmalıdır.
- Ağ zaman aşımında emrin gerçekleşmediğini varsayarak yeniden göndermek yasaktır. Borsa işlem kimliğiyle uzlaştırma gerekir.
- `REAL_ORDERS_ENABLED=false` korunmalıdır. İşlem izni olan API anahtarı, bu kontroller ve onaylı gerçek hesap testleri tamamlanmadan kullanılmamalıdır.

## Kontrol
`node --test test/manual-order-approval.test.js`

Bu ilk PR güvenli onay çekirdeğidir, çalışır gerçek trading çözümü değildir. Production deploy, main merge ve hesap emri yapılmadı.
