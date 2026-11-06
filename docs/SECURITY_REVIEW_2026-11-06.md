# Binance TR real-order readiness — security review (2026-11-06)

**Decision: NO-GO for real money.** This is a separate source-review pass of PR #38 against the Binance TR official API docs and PR #40 Windows mock-test evidence. It is **not** certification by a third-party independent auditor.

## Evidence
- Current main package version: 0.1.0; real-order routing not deployed.
- Windows GitHub Actions integration checks: 147/147 passing on PR #40 initial run; follow-up 150/150 after malformed/timeout/numeric order response tests; source and later commits require new green CI.
- Windows synthetic SQLite endurance: 1,032 reboot/reopen cycles over 1 minute, no write methods or external network, ~47–48 MiB observed RSS.
- Live public Binance TR call from GitHub Windows runner: GET /open/v1/common/time returned HTTP 451. Cannot independently confirm live connectivity from runner. This is not a permission or private account test.
- Official Binance TR API: https://www.binance.tr/apidocs/ documents POST /open/v1/orders, GET /open/v1/orders/detail, POST /open/v1/orders/cancel. The exchange says clientId uniqueness is **not** enforced and 5XX outcomes may be UNKNOWN. Query details may return numeric status/quantity fields.

## Findings and severity

1. **BLOCKER — No verified aggregate risk feed.** `createLiveOrderInputs` has no trusted `riskContext` provider. Verified net/realized PnL, fees, order-book spread, price impact, complete account exposure and cost basis are absent. `LiveRiskEngine` must fail closed; no caller-provided `source` string can be accepted as provenance. Requires securely derived, fresh exchange inputs and independent acceptance tests.
2. **BLOCKER — Live approval and operational design not reviewed.** Gate callbacks can be injected by future callers; there is no independently authenticated, single-use trade approval protocol, operator controls, restricted credential provisioning or key-level withdrawal-disable proof. PR #34 manual approvals and PR #38 journal are separate overlapping implementations. Must consolidate before enabling.
3. **HIGH — Unreconciled exchange orders.** Initial sync of all outstanding exchange orders, terminal transitions and restart reconciliation are not wired to a production service. Status after timeout remains UNKNOWN; this correctly blocks retries but does not resolve the user-facing incident. No live API write testing performed.
4. **HIGH — Existing asset exposure enforcement.** The original monitoring path did not HALT on an **existing** position exceeding the per-asset limit. Fixed and tested on the PR #40 test branch; port only after CI and review.
5. **HIGH — External market access not proven.** Windows-hosted public probe returned HTTP 451; no authenticated Binance TR account calls from CI. Do not route around geographic restrictions. Validate locally with read-only key permissions.
6. **HIGH — Execution controls remain provisional.** Stop-loss only creates CLOSE_REQUIRED advice; HALT blocks NEW orders but cannot undo/cancel existing exchange orders. No guarantee of realized execution price, slippage or fee bounds. Report risk, do not promise automatic liquidation.
7. **MEDIUM — Order detail provenance and schema.** Numeric quantities/status are documented; mock fixtures were extended. Before live release validate orderId, symbol, side, type, price, origQty and fill progress end-to-end with signed authenticated responses.
8. **MEDIUM — Long-haul Windows observation incomplete.** One-minute synthetic endurance verified, but a 30-minute GitHub workflow must run and be reviewed; user's physical Windows machine is not remotely accessible from this session.

## Existing protections retained
- Live request transport defaults to write denied, no production order routes, no withdrawal endpoint.
- SQLite durable reservation, repeat-order ID/intent blocking, unknown-outcome HALT.
- 30-second price freshness, risk limits and startup locked state.
- Synthetic tests never use API keys or real funds.

## Release gates
- Reconcile PR #34/#38 overlapping flows and achieve an independent security sign-off.
- Resolve every BLOCKER/HIGH finding; demonstrate full PnL/position/order-book sourcing and reject stale inputs.
- Run all Windows unit/integration tests, 30-minute endurance, failure injection, real-order-free exchange contract validation.
- Operator-owned Binance TR API key confirmed withdrawal-disabled in Binance TR controls; do not share it in GitHub or chat.
- Any real orders require a **new, separately approved release**. Do not enable real orders in this PR.
