# PARA Trading — Independent-style fail-closed audit (2026-11-06)

**Release decision: NO-GO FOR REAL ORDERS.** This is an additional code-level security review and synthetic test contribution performed separately from feature implementation. **It is not an independent external auditor's sign-off** and does not prove real Binance account state.

## Scope and evidence

- Reviewed current main implementations: `engine/binance-tr-order-client.js`, `engine/live-order-journal.js`, `engine/live-order-service.js`, `engine/live-order-reconciler.js`, `engine/live-risk-engine.js`, `engine/verified-account-risk-provider.js`, `engine/binance-tr-risk-ledger.js`, `engine/live-order-inputs.js`.
- Verified existing unit tests for startup and periodic reconciliation, unresolved open orders, UNKNOWN placement, daily loss, stop-loss, HALT and restart.
- Binance TR official API: https://www.binance.tr/apidocs/ documents signed GET /open/v1/orders with type=1, GET /open/v1/orders/detail, and says clientId uniqueness is not enforced.
- Operator physical Windows 11 observed public Binance TR `www.binance.tr/open/v1/common/time` HTTP 200, but market host `api.binance.me` HTTP 403. Public time reachability **is not authenticated account/order evidence**.
- No live API keys, live funds, real orders or external requests are used by this audit's tests.
- Current server, Web Worker, scheduler and CLI do not instantiate live order submission. Do not enable `REAL_ORDERS_ENABLED`.

## Findings

### AUD-01 — HIGH — external emergency cancel may be re-sent after uncertain outcome (patched in this PR)

Prior `LiveOrderService.containHalt()` made a `cancelByOrderId()` request for every observed external order on each invocation if the approval gate returned true. It did not persist a cancellation claim for an exchange order not already in the local order journal. A timeout/5XX, repeated HALT or restart could therefore create another cancellation POST.

**Remediation in this PR:** a journal table keyed by `(symbol,order_id)` is created. An `UNKNOWN` claim is committed before any network write. A second call, including after restart, cannot acquire the claim and the order remains retained under HALT. Confirmed successful acknowledgment is retained without granting retry rights. When journal is unavailable, cancellation is denied, not retried. Regression tests cover timeout, second call, restart, success acknowledgment, and journal failure.

**Caveat:** this guarantees at-most-once attempt per durable journal on the same device, **not exactly-once execution by the exchange**. Reset/loss of the SQLite journal, another independently running installation or a separate API client requires an external operational barrier and account-level reconciliation.

### AUD-02 — BLOCKER — real Binance TR order state and risk ledger unverified

The code validates signed API responses and treats a full page as incomplete. It is not possible to assert that user's exchange open orders, partial fills, free/locked balances, fill history, order-status schema, fees, deposits/withdrawals or all eligible symbols were correctly reconciled from this environment. Physical Windows proof with operator-controlled withdrawal-disabled, READ-ONLY permissions is mandatory. Never share API credentials in chat, CI or GitHub.

A read-only account check must compare `GET /open/v1/orders?symbol=...&type=1` and signed `GET /open/v1/orders/detail` results against the operator's Binance TR UI, including pending/partially-filled statuses, every relevant symbol and paging. Treat mismatch, incomplete results or missing symbols as HALT.

### AUD-03 — BLOCKER — daily loss/stop-loss dependencies not verified on the real account

`VerifiedAccountRiskProvider` derives cost basis and daily realized/net P&L from exchange fills and reconciles free+locked holdings. Missing genesis history, external account flows, historical fee conversion and stale price cause fail-closed behavior. This logic has synthetic coverage, but **no real fill/ledger/history evidence**. `api.binance.me` remained HTTP 403 on the physical Windows connection, so live quote-based exposure/stop-loss proof is unavailable.

Stop-loss currently **HALTs new orders and shows an informational close-required recommendation**; it does not guarantee a protective stop order or liquidate a position. Existing exchange orders may remain open after HALT. Disclose this limitation to the operator.

### AUD-04 — BLOCKER — independent operational release approval absent

Feature flags, injected approval callbacks, API permission restrictions, real Windows end-to-end smoke, external security sign-off, multi-process/multi-device exclusivity, durable SQLite backups and physical reconnection testing are not independently completed. No live-order toggle, credentials with trading permission or real POST are allowed.

### AUD-05 — MEDIUM — unknown status validation and scope completeness require a live contract test

`BinanceTROrderClient.openOrders` protects against a fully populated page, invalid order IDs/statuses and symbol mismatch but the snapshot does not currently prove a complete exchange catalogue scope by itself, nor is an exchange response timestamp validated before considering an empty list CLEAR. Reconciliation depends on the externally supplied trusted `loadSymbols`. Confirm all symbols and response freshness before trusting an empty live account result. Do not loosen fail-closed policy to work around 403.

## Existing protections retained

- No live order execution path wired to local or cloud application.
- Independent write approval defaults DENY and signed HTTP transport also denies POST.
- Local journal reserves intent before a write and retains UNKNOWN after timeouts/restarts.
- Unknown order states, stale/missing risk data, daily loss, per-asset exposure and stop-loss block new orders.
- Startup locks HALT; reconciliation after restart uses read-only GET; new authorization must not be inferred from a previous session.
- No automatic cancellation/liquidation without independent explicit authorization.

## Required test/evidence matrix

| Scenario | Evidence | Status |
| --- | --- | --- |
| Real API signed open orders and detail match UI, all symbols | Read-only physical Windows proof; redacted counts and timestamps only | PENDING |
| Timeout/5XX during order POST prevents second send | Synthetic test and UNKNOWN journal persistence | COVERED IN EXISTING TESTS |
| External emergency cancel timeout, repeat HALT and restart never re-send | Durable claim and synthetic regression tests in this PR | CODED; CI REQUIRED |
| Exchange GET timeout/partial result blocks new POST | Synthetic regression in this PR | CODED; CI REQUIRED |
| Daily max loss, stops and stale quotes HALT | Synthetic risk engine tests | COVERED SYNTHETICALLY |
| Real fill fees and free/locked holdings yield correct P&L | Physical Windows read-only ledger + independent review | PENDING |
| 30-minute physical Windows offline/online + restart soak | Device logs with sensitive data removed | PENDING |
| External independent security sign-off | Separate reviewer and written approval | PENDING |

## Release rule

**NO-GO** until all BLOCKER/HIGH findings and physical account tests are signed off; the trading key must have withdrawals disabled. This document **does not approve** enabling real-money orders. Production, secrets, API credentials, main and account funds are unchanged.
