# Package A verification — 2026-11-06

Integrated PR #29 local Google OIDC/session module and launcher configuration into current main. Compared #23 and #31 font history: current main already includes DM Sans and TTF MIME handling; retained those assets and added an HTTP MIME regression test. Cloudflare login HTML links to existing Access login only; no production configuration changed.

Validation: `node --test test/google-login.test.js test/cloudflare-worker.test.js` passed 10/10 on Windows Node 24.21.0. Covers PKCE/state replay and expiry, nonce/account rejection, cookie/logout and mutation CSRF, bounded pending requests, local Host/Origin isolation, font MIME, and existing Access issuer/audience/signature/expiry checks. Google JWT validation uses jose with fixed Google JWKS, RS256, issuer/audience and required claims; Google test identity responses are mocked, not live Google signatures.

Windows Chrome headless smoke rendered the built local panel and visible Google sign-in button (dummy client ID and allowed email, in-memory SQLite, separate temporary browser profile). This only verifies local rendering; it is not a real Google login. No real account login/logout was performed. Configure GOOGLE_OAUTH_CLIENT_ID and an allowed Google email/sub, and register the documented loopback callback before a real-account test.

Original main font file was not replaced. No real orders, production deployment, Access changes, or secret values were used.
