# Package D — scanner verification (2026-11-06)

Scanner now honors Retry-After HTTP-date as well as integer seconds for HTTP 418/429, with a minimum 60-second cooldown and no continued requests to later pairs. Ten scanner tests pass, including six new 418/429 numeric/date/invalid-header cooldown and busy tests. Existing HTTP 451 test verifies early stop without falsely reporting unvisited pairs as analyzed.

Actual Windows read-only public request on this run: catalogue listed 309, eligible 309. A deliberately bounded sample of three spot pairs completed: 0G_TRY candidate, 1000CAT_TRY candidate, 1000SATS_TRY unavailable. Therefore this run scanned only 3/309 (2 candidates, 1 unavailable), not a full 309-pair run. This is distinct from the user's earlier 309/309 result (282 candidates, 5 excluded, 22 unavailable). No credentials/account/order endpoint was used. Catalogue exchange timestamp: 1793949181538.

Browser smoke is not included in this scanner verification.
