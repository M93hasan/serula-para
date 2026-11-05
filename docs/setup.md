# Windows yerel kurulum

Node.js 22.13+ kurun. PowerShell: `npm ci`, `npm test`, `npm run build`. SQLite bazı Node sürümlerinde deneysel uyarı gösterebilir.

Binance TR için yalnızca okuma izni olan bir API anahtarı kullanın; emir ve para çekme yetkilerini kapalı tutun. `npm run vault` komutu anahtarı ve en az 16 karakterlik kasa parolasını terminalde gizli alır. Şifrelenmiş dosya `%USERPROFILE%\.para\binance-tr.vault` konumundadır; mevcut dosyanın üzerine yazılmaz. Parola saklanmaz ve kaybolursa kasa açılamaz. Kasa henüz TR hesabına bağlanmaz.

Geçici panel erişim anahtarı oluşturun: `$env:PARA_LOCAL_TOKEN = node -e "console.log(require('node:crypto').randomBytes(32).toString('hex'))"`. `npm run engine` çalıştırın, tarayıcıda `http://127.0.0.1:8788` açın. Aynı PowerShell oturumunda `$env:PARA_LOCAL_TOKEN` değerini alın ve panelin yerel erişim alanına girin; Binance anahtarlarını panele girmeyin. Panel anahtarı sayfa kapatılınca silinir. Motoru Ctrl+C ile durdurun. Demo tutarlar gerçek bakiye değildir; durum `%USERPROFILE%\.para\simulation.sqlite` dosyasında tutulur.

Linux'ta Node 22.13+ ile aynı komutlar ve `~/.para` kullanılır. Yerel servisi internete veya ters proxy'ye açmayın. Workers ya da uzaktan erişim için ayrı güvenli mimari gereklidir.
