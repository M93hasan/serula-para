# Yerel kurulum

Node.js 20+ kurun. PowerShell içinde `npm install`, `npm test`, `npm run build` çalıştırın. Geçici yerel servis anahtarı üretmek için `$env:PARA_LOCAL_TOKEN = node -e "console.log(require('node:crypto').randomBytes(32).toString('hex'))"` ve ardından `npm run engine` kullanın. Anahtarı paylaşmayın, depoya yazmayın. Servis sadece loopback üzerinde dinler, tarayıcıdan gelen Origin isteklerini reddeder ve yalnızca yetkili yerel istemciler içindir. Örnek demo tutarları kuruş cinsindendir ve gerçek bakiye değildir.

Linux'ta token'ı güvenli bir gizli bilgi sağlayıcısından işlem ortamına verin; ters proxy ile internete açmayın. Cloudflare Workers/harici sunucu için ayrı kimlik doğrulama, TLS, yetkilendirme, kalıcı ve atomik risk durumu, güvenli sır yönetimi ve yeniden tasarım gereklidir; mevcut Node sunucusu Workers uyumlu değildir.
