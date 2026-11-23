# CLAIMS.md - BugBoing

Evidence ledger for hackathon claims. Only claims with captured evidence.

| Claim | Evidence | Command / Source | Status |
|---|---|---|---|
| Kane CLI installed and authenticated | `kane-cli --version` => 0.10.8; `whoami` authenticated as `alviagsts` (suisei/oauth/prod) | `FRICTION.md` runs #1,#4 | VERIFIED |
| BugBoing can run Kane checks via `--headless --agent` and parse NDJSON `run_end` | Smoke run passed, structured report with status/reason/test_url/session_dir/credits | `checks.smoke.json`, `smoke-report.json`, `FRICTION.md` #7 | VERIFIED |
| Kane caught a real failure (Verified bar) | Manual strict assertion on buggy demo page failed: result_code 740, reason_code `assertion_error.confirmed_product_bug`, expected `BugBoing Demo`, observed `BugBoing Demoo`, verdict confirmed | `FRICTION.md` #8, Kane session `7787949c-0d49-4934-8ee5-7863467888e5` | VERIFIED |
| Closed loop works automatically (fail -> fix-cmd -> rerun pass) | `bugboing verify` attempt 1 failed with Kane evidence; fix-cmd exit 0 patched `demo/index.html`; attempt 2 passed with Kane-verified heading | `demo/report.json`, `FRICTION.md` #9 | VERIFIED |
| Kane and agent/tool talk through structured output | BugBoing parses Kane NDJSON `run_end`; fix-cmd receives failure payload JSON on stdin; rerun uses same Kane check | `src/cli.ts`, `demo/fix.mjs`, `demo/report.json` | VERIFIED |
| Windows quoting bug found and fixed | Initial shell spawn mangled objective; fixed by Windows-safe command quoting in `runCmd` | `src/cli.ts`, observed before/after in FRICTION/debug | VERIFIED |

## Claims NOT to make
- No claim of "AI agent autonomously fixed arbitrary bugs" - demo fix-cmd is deterministic script; real agent can be plugged in via `--fix-cmd`.
- No claim of broad web compatibility/performance benchmarks.
- No claim Kane always fails/passes perfectly on ambiguous objectives - objective phrasing matters.