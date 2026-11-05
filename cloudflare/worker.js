// Public static preview only. The Node.js loopback engine, encrypted local vault,
// simulation and local Ollama are deliberately NOT exposed on the internet.
const apiHeaders = {
  'Content-Type': 'application/json; charset=utf-8',
  'Cache-Control': 'no-store',
  'X-Content-Type-Options': 'nosniff'
};

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    if (url.pathname === '/api/health') {
      return new Response(JSON.stringify({
        status: 'preview-only',
        api_available: false,
        real_orders_enabled: false
      }), { headers: apiHeaders });
    }
    if (url.pathname === '/api' || url.pathname.startsWith('/api/')) {
      return new Response(JSON.stringify({
        error: 'WEB_BACKEND_UNAVAILABLE',
        message: 'Güvenli web oturumu ve Binance TR API sunucusu henüz bağlanmadı. Yerel erişim anahtarını bu web adresine girmeyin.'
      }), { status: 503, headers: apiHeaders });
    }
    if (request.method !== 'GET' && request.method !== 'HEAD') {
      return new Response('Method Not Allowed', {
        status: 405,
        headers: { Allow: 'GET, HEAD', 'Cache-Control': 'no-store' }
      });
    }
    const response = await env.ASSETS.fetch(request);
    const headers = new Headers(response.headers);
    headers.set('X-Content-Type-Options', 'nosniff');
    headers.set('Referrer-Policy', 'strict-origin-when-cross-origin');
    headers.set('X-Frame-Options', 'DENY');
    if (headers.get('Content-Type')?.includes('text/html')) {
      headers.set('Cache-Control', 'no-store');
      headers.set('Content-Security-Policy', "default-src 'self'; base-uri 'self'; object-src 'none'; frame-ancestors 'none'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data: https:; connect-src 'self'; font-src 'self' data:");
    }
    return new Response(response.body, {
      status: response.status,
      statusText: response.statusText,
      headers
    });
  }
};
