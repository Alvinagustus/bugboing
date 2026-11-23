# CLAIMS.md - BugBoing

Evidence ledger for hackathon claims. Only claims with captured evidence.

| Claim | Evidence | Command / Source | Status |
|---|---|---|---|
| Kane CLI installed and authenticated | `kane-cli --version` => 0.10.8; `whoami` authenticated as `alviagsts` (suisei/oauth/prod) | `FRICTION.md` runs #1,#4 | VERIFIED |
| BugBoing can run Kane checks via `--headless --agent` and parse NDJSON `run_end` | Smoke run passed, structured report with status/reason/test_url/session_dir/credits | `checks.smoke.json`, `smoke-report.json`, `FRICTION.md` #7 | VERIFIED |
| Kane caught a real failure (Verified bar) | Manual strict assertion on buggy demo page failed: result_code 740, reason_code `assertion_error.confirmed_product_bug`, expected `BugBoing Demo`, observed `BugBoing Demoo`, verdict confirmed | `FRICTION.md` #8, Kane session `7787949c-0d49-4934-8ee5-7863467888e5` | VERIFIED |
| Closed loop works automatically (fail -> fix-cmd -> rerun pass) | Refreshed 2026-11-23: attempt 1 Kane failed on buggy heading; generic `--fix-cmd node demo/fix-generic.mjs` consumed stdin JSON payload and patched fixture; attempt 2 Kane passed (100, `success.complete`). | `demo/report.json`, `FRICTION.md` #11 | VERIFIED |
| Strict contract: no Kane pass, no green | `exit 0` without `run_end` returns unverified/fail; only `run_end.status==passed` is green. Fixer exit code is not proof. | `tests/contract.test.ts`, `src/cli.ts:evaluateRunEnd` | VERIFIED (local test) |
| Agent-agnostic fixer contract | Any `--fix-cmd` receives structured failure JSON on stdin (`check`, `attempt`, `result` incl. `kaneVerified/verificationSource/rawRunEnd`). Demo proved with generic payload-driven fixer, not agent-specific integration. | `demo/fix-generic.mjs`, `demo/report.json`, `src/cli.ts` | VERIFIED |
| Works on real external target outside fixture | BugBoing+Kane passed against https://httpbin.org/html (h1 assertion) | `FRICTION.md` #10, `external-report.json` (local) | VERIFIED |
| Windows quoting bug found and fixed | Initial shell spawn mangled objective; fixed by Windows-safe command quoting in `runCmd` | `src/cli.ts`, observed before/after in FRICTION/debug | VERIFIED |

## Claims NOT to make
- No claim BugBoing invented the fail-fix-rerun-with-Kane loop; this pattern is crowded in the hackathon. Differentiation must be demonstrated: strict Kane-verified contract (no `run_end` pass = no green) and agent-agnostic `--fix-cmd` contract.
- No claim of "AI agent autonomously fixed arbitrary bugs" - demo fix-cmd is deterministic script; real agent can be plugged in via `--fix-cmd`.
- No claim of broad web compatibility/performance benchmarks.
- No claim Kane always fails/passes perfectly on ambiguous objectives - objective phrasing matters.