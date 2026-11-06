# Windows yerel doğrulama listesi

Bu kontroller yalnız Windows bilgisayarda kullanıcı tarafından yetkilendirilmiş ortamda yapılmalıdır. Parolaları, API anahtarlarını ve ham hesap verilerini kayda veya GitHub'a yazmayın.

- Proje klasöründe `git status -sb`, `node --version`, `npm --version`; kaydedilmemiş değişiklikleri koruyun.
- Ollama açıkken `ollama --version`, `ollama list` ve `node scripts/diagnose-ollama.mjs`: kısa çağrı ve tam analizi ayrı kaydedin. Zaman aşımında güvenli BEKLE beklenir.
- `node scripts/check-market.js`: anahtarsız Binance TR piyasa kontrolünü çalıştırın. 418/429/451 veya eksik veride taramayı durdurun; kısıtları aşmaya çalışmayın. Eski 309 sayısını yeni tarama olarak sunmayın.
- Chrome veya Edge masaüstü ve dar ekran: DM Sans, menüler, Google giriş/çıkış, AI ve HALT düğmelerini gözlemleyin. Gerçek OAuth testi için kullanıcı tarafından yapılandırılmış Google istemcisi ve allowlist gerekir.
- Cloudflare Access ve bulut AI testleri ayrı yetkili test ortamı ve hesap gerektirir; anahtarların hiçbirini sohbete, teste veya GitHub'a taşımayın. Bulut çağrıları ücretli olabilir.
- `npm ci`, `npm test`, `npm run build`. Sonuçlara Windows sürümü ve gerçek/sentetik ayrımını ekleyin. Gerçek emirleri ve otomatik paper yürütmeyi etkinleştirmeyin.
