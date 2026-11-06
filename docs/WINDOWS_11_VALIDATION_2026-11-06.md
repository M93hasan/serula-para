# Physical Windows 11 validation — 2026-11-06

Status: **PENDING ON PHYSICAL MACHINE**

The current development environment is Linux and cannot access
`B:\serula-para-git` or the operator's Windows desktop. No result below is marked
as a physical Windows pass until command output and observations are captured on
that machine. Real orders must remain disabled throughout this matrix.

## Preconditions

- Checkout the PR branch in `B:\serula-para-git` with a clean worktree.
- Use Node 24 and run with `REAL_ORDERS_ENABLED=false`.
- Use only a Binance TR key whose withdrawal permission is disabled. Start with
  public/read-only checks; do not enter credentials into CI, chat or GitHub.
- Keep the live-order UI/server route absent. Use synthetic fixtures for all POST,
  timeout, duplicate-order and cancellation tests.

## Required runs

```powershell
cd B:\serula-para-git
npm ci
npm test
npm run build
$env:PARA_SOAK_MINUTES='30'
$env:REAL_ORDERS_ENABLED='false'
node scripts/soak-offline-windows.mjs
```

| Area | Required evidence | Status |
| --- | --- | --- |
| Graphics | BTC/TRY and ETH/TRY initial render, refresh and stale-data recovery at desktop/mobile widths | Pending |
| Account | Withdrawal-disabled read-only account, fresh timestamp, exact free/locked totals, no secret in logs | Pending |
| Risk/P&L | Fill coverage, fee conversion, balance-lot equality, cost basis, daily realized/net P&L | Pending |
| AI | Valid AL/SAT/BEKLE proposal, stale/missing AI gives BEKLE + HALT, no account secrets in prompt | Pending |
| Network fault | POST timeout creates UNKNOWN once; restart reconciles by client/order ID without repeat POST | Pending |
| Cancel fault | HALT cancellation timeout creates unknown outcome and no repeat cancellation | Pending |
| Restart | Startup lock, full-symbol reconciliation and autonomy lock/audit persistence | Pending |
| Endurance | 30-minute offline SQLite/restart soak, stable memory and no network/write calls | Pending |

## Current non-Windows evidence

- Linux Node `v24.22.1`: `npm test` passed 177/177 after the final autonomy
  additions.
- Linux production build completed successfully. A 0.1-minute offline smoke soak
  completed 464 restart cycles with real orders disabled and no network calls.
- Binance TR public documentation/account reachability from this environment
  returned HTTP 451. This is not account, key-permission or Windows connectivity
  evidence.

