# Yerel AI sağlayıcı ayarları

Ayarlar → AI API ayarları bölümünde OpenAI API, Ollama Cloud, Anthropic, Gemini veya DeepSeek seçip sağlayıcının API model adını, API anahtarını ve en az 16 karakterli AI kasası parolasını girin. Bu bölüm yalnız yerel Windows/Linux panelinde çalışır. Yerel Ollama servisi API anahtarı gerektirmez ve mevcut `PARA_OLLAMA_MODEL` ile çalışır.

Her sağlayıcı ayrı şifreli yerel dosyada tutulur; girilen anahtar tekrar gösterilmez. Değiştirme/silme mevcut kasa parolasını gerektirir. Herhangi bir anahtar veya parolayı GitHub'a, sorun kaydına veya sohbetlere göndermeyin. Paylaşılmış anahtarları sağlayıcının ayarlarından iptal edin.

Bulut analizi için önce piyasa analizi yapın, sonra sağlayıcıyı seçin ve AI kasası parolasını girin. Kullanıcı onayından sonra seçilen sağlayıcıya **yalnız halka açık parite/fiyat/mum verileri** ve önceki AI rol metinleri gönderilir; Binance TR anahtarı, parola, hesap bakiyesi ve diğer gizli bilgiler gönderilmez. Her analiz beş model isteği yapar, ağ kullanır ve sağlayıcı hesabında ücrete yol açabilir. API erişimi ve faturalama ayrı sağlayıcı hesabı gerektirebilir. Kararların başarı garantisi yoktur; doğrulanmış haber/risk eksikliğinde BEKLE uygulanır.

Kaydetme, API anahtarının geçerli olduğunu veya modelin hesabınızda kullanılabildiğini doğrulamaz. `Bu sağlayıcıyla analiz et` gerçek istek gönderir; bağlantı hatasında genel hata veya BEKLE gösterilir. Sağlayıcıların endpoint/model erişimi ve ücretleri değişebilir; gerçek servisler bu geliştirmede doğrulanmamışsa PR sonuçlarına bakın. Gerçek emir ve çekim desteği yoktur.

## 2026-11-06 entegrasyon doğrulaması (Windows)

- `node --test test/ai-analyst.test.js test/ai-providers.test.js`: 12/12 başarılı. Bunlar sahte sağlayıcı yanıtlarıyla çalışan otomatik testlerdir.
- Beş bulut sağlayıcısı için sabit adres, şifreli kasa, parola ile değiştirme/silme, CSRF, açık analiz onayı ve gizli bilgilerin prompta gitmemesi sınandı. Gerçek bulut hesap/anahtarları kullanılmadı; gerçek bulut model uyumluluğu doğrulanmadı.
- Bulut analizleri arasında en az 30 saniye bekleme uygulanır; 429 ve diğer servis hatalarında tekrar denenmez, BEKLE döner. Yerel model ismi uyuşmazlığı ve analiz sürerken 5 dakikayı aşan fiyat reddedilir.
- Gerçek `http://127.0.0.1:11434/api/tags` yanıtı `qwen3:1.7b` modelini listeliyor. `node scripts/check-ai-local.mjs` gerçek model çağrısını sentetik piyasa verisiyle çalıştırdı; 30.016 ms sonra `TimeoutError`, sonuç BEKLE, başarılı model rolü 0 (yalnız sabit haber açıklaması). Bu bir başarılı model analizi veya gerçek piyasa doğrulaması değildir. Tam yerel model analizi zaman aşımı nedeniyle bloke.
- Betik yalnız sentetik halka açık veri biçimi kullanır; emir, hesap erişimi veya bulut çağrısı yapmaz. Gerçek işlem yetkisi eklenmedi; AI sonucu risk kapısını açmaz.
