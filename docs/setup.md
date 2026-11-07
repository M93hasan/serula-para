# Windows yerel kurulum

> **07.11.2026 entegrasyon durumu:** `integration/seven-prs` Windows DPAPI, Local/Web seçimi ve OTP değişikliklerini içerir; bu dal `main` ile birleştirilmemiştir. Windows kasası ve eski kasanın açık aktarımı için [Windows/Web kasa rehberini](vault-windows-web.md) izleyin. Aşağıdaki parola ile kasa komutları eski kasa ve Windows dışı kurulumlar içindir.
>
> Gerçek emir gönderimi ve para çekme yetkisi **KAPALIDIR**. API anahtarını hiçbir zaman sohbet/GitHub'a aktarmayın; `%USERPROFILE%\.para` içeriğini değiştirmeyin veya silmeyin. `api.binance.me` üzerinden fiyat kontrolü Windows'ta HTTP 403 gördüğünden **gerçek canlı fiyatlar doğrulanmış değildir**.

### Güvenli Windows 11 kontrolü

PowerShell veya CMD'de proje klasörüne geçin (CMD için `cd /d B:\serula-para-git`, PowerShell için `cd B:\serula-para-git`). Mevcut değişikliklerinizi koruyun: `git status` çalıştırın, sonra `npm ci`, `npm test`, `npm run build`. Salt okunur Binance ağ testi için `node scripts/check-binance-network.js` kullanılabilir. `REAL_ORDERS_ENABLED=false` kalmalıdır. 30 dakikalık offline dayanıklılık adımları için [Windows doğrulama matrisi](WINDOWS_11_VALIDATION_2026-11-06.md) geçerlidir. Bu adımlar **gerçek emir veya gerçek hesap E2E doğrulaması değildir**.

Tek adımlı başlatma: proje klasöründe `start-para.cmd` dosyasını çalıştırın; ayrıntılar README dosyasındadır. Aşağıdaki adımlar manuel alternatiftir.

Node.js 22.13+ kurun. PowerShell: `npm ci`, `npm test`, `npm run build`. SQLite bazı Node sürümlerinde deneysel uyarı gösterebilir.

Binance TR için yalnızca okuma izni olan bir API anahtarı kullanın; emir ve para çekme yetkilerini kapalı tutun. `npm run vault` komutu anahtarı ve en az 16 karakterlik kasa parolasını terminalde gizli alır. Şifrelenmiş dosya `%USERPROFILE%\.para\binance-tr.vault` konumundadır; mevcut dosyanın üzerine yazılmaz. Parola saklanmaz ve kaybolursa kasa açılamaz. Aynı kasa yerel panelden de kullanılır; parola hiçbir zaman saklanmaz.

Geçici panel erişim anahtarı oluşturun: `$env:PARA_LOCAL_TOKEN = node -e "console.log(require('node:crypto').randomBytes(32).toString('hex'))"`. `npm run engine` çalıştırın, tarayıcıda `http://127.0.0.1:8788` açın. Aynı PowerShell oturumunda `$env:PARA_LOCAL_TOKEN` değerini alın ve panelin yerel erişim alanına girin; Binance anahtarlarını bu yerel erişim alanına girmeyin. Panel anahtarı sayfa kapatılınca silinir. Motoru Ctrl+C ile durdurun. Demo tutarlar gerçek bakiye değildir; durum `%USERPROFILE%\.para\simulation.sqlite` dosyasında tutulur.

Linux'ta Node 22.13+ ile aynı komutlar ve `~/.para` kullanılır. Yerel servisi internete veya ters proxy'ye açmayın. Workers ya da uzaktan erişim için ayrı güvenli mimari gereklidir.

Windows entegrasyon panelinde **Ayarlar → Binance TR API** alanına salt okunur API Key ve API Secret girip Kaydet’e basın; DPAPI sonraki okumalarda parola istemez. Windows dışı veya eski parola kasasında kasa parolası gerekir. Önceden kasa varsa parolayı ve yeni bilgileri girip Değiştir kullanın. Bağlantıyı Test Et, ilgili kasayı açıp Binance TR hesap varlıklarını salt okunur sorgular. Sil, yerel kasayı kaldırır; Binance TR üzerindeki anahtarı iptal etmez. Anahtarları ekranda, sohbetlerde veya GitHub’da paylaşmayın. Gerçek işlemler kapalıdır.
