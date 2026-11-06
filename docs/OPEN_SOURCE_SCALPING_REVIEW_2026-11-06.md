# Açık kaynak karşılaştırması — PARA Trading / 06.11.2026

PARA Trading yeniden yazılmaz veya başka trading botuyla değiştirilmez. **Bu çalışmada dış projelerden kod kopyalanmadı.**

| Proje | Lisans (resmî LICENSE) | Bakım kanıtı | Uygulama kararı |
| --- | --- | --- | --- |
| [Freqtrade](https://github.com/freqtrade/freqtrade) | [GPL-3.0](https://github.com/freqtrade/freqtrade/blob/develop/LICENSE) | [2026.10, 30 Ekim 2026](https://github.com/freqtrade/freqtrade/releases) | Backtest, ileri veri sızıntısı, replay yaklaşımı; **GPL kodu kopyalanmaz**, hukuki inceleme olmadan entegre edilmez |
| [Hummingbot](https://github.com/hummingbot/hummingbot) | [Apache-2.0](https://github.com/hummingbot/hummingbot/blob/master/LICENSE) | [v2.17.0, 22 Eylül 2026](https://github.com/hummingbot/hummingbot/releases) | Derinlik, spread, emir yürütme belirsizliği ve bağlantı yönetimi fikirleri; Python sistemini PARA Node motoru yerine koymuyoruz |
| [Jesse](https://github.com/jesse-ai/jesse) | [MIT](https://github.com/jesse-ai/jesse/blob/master/LICENSE) | [2026 depo güncellemeleri](https://github.com/jesse-ai/jesse) | Kısa vadeli strateji araştırması, test ve tarihsel replay fikirleri; kod kopyalanmadı |

Depo genel lisansı tüm alt bağımlılıkların lisansına dair güvence değildir. Gerçek bir parça alınmadan önce tam dosya/lisans/bağımlılık, kaynak commit SHA, NOTICE/attribution, bakım ve güvenlik durumu ayrıca kontrol edilir. Lisans veya mimari uyumsuzsa bağımsız kod yazılır.

## PARA ile mevcut örtüşme

- 'MarketUniverse': Binance TR sembol kataloğu, doğrulanmış parite ve spot filtreleri mevcut.
- 'MarketScanner': çoklu parite araştırma, emir defteri, derinlik, spread, hacim ve volatilite kontrolleri mevcut.
- 'ScanAutomation': operatörün kontrolündeki otomatik araştırma taraması mevcut. Bu dalda HTTP 403 WAF sonrası tüm tarama durur ve kısmi adaylar silinir.
- 'LiveOrderJournal' + 'LiveRiskEngine': kalıcı niyet, yeniden başlatmada HALT, günlük zarar, stop-loss, açık pozisyon risk limiti; gerçek hesap verileriyle fiziksel Windows kanıtı eksik.
- 'AIAnalyst' + 'CloudAIService': rol bazlı analiz ve OpenAI/Gemini bağlantı kodları mevcut. Canlı anahtar/market doğrulaması eksik.
- 'scalping-cost-gate': bu dalda eklenen saf araştırma filtresi. Emir API'sine bağlanmadı.

## Scalping maliyet hesabı — sadece araştırma

Net beklenen hareket (bps) = beklenen brüt hareket - (giriş komisyonu + çıkış komisyonu + **tam spread** + giriş slippage + çıkış slippage + emniyet payı).

Sabit bir beklenen brüt kazanç **uydurulmaz**. Beklenen brüt hareket ve komisyonlar ayrı kaynaklarda doğrulanmalıdır. Piyasa bayatsa, fee schedule doğrulanmamışsa, derinlik veya risk belirsizse sonuç 'BEKLE'. Net pozitifse yalnız 'RESEARCH_CANDIDATE', daima 'executionAuthorized:false'; gerçek AL/SAT kesinlikle açılmaz. Bu, tahmini bir araştırma göstergesidir; kâr garantisi değildir.

Binance Global API özellikleri Binance TR için doğrudan kullanılamaz. Binance TR'de ayrı endpoint, filtre, timestamp ve gerçek order sözleşmesi kanıtı zorunludur. Windows cihazında 'www.binance.tr' saat API'si 200, 'api.binance.me' piyasa API'si 403 olduğundan canlı piyasa verisi doğrulanmadı.

## Sonraki, onay gerektiren teslimatlar

1. Binance TR'nin resmî, erişilebilir ve izinli piyasa API yolunu doğrula; WAF kuralını aşma.
2. Net maliyet filtresini ancak doğrulanmış ücret tarifesi, taze L2 derinlik, gerçek spread ve slippage gözlemleriyle besle.
3. Replay/backtest ile hızlı hareket, komisyon artışı, yetersiz likidite, kısmi dolum, gecikme ve 403/429 senaryolarını denetle.
4. Gerçek hesap emir/kar/zarar mutabakatı, fiziksel Windows uzun süreli test, bağımsız denetim ve ayrı yayın onayı olmadan gerçek emir kapalı kalsın.
