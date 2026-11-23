# FRICTION.md - KaneCLI Hackathon Recon

## Environment
- OS: Windows NT 10.0.22631.0 AMD64
- Date: 2026-11-23 19:01:34 +07:00 (SE Asia Standard Time)
- Node: v26.13.0, Git: 2.56.0.windows.4
- Python: not found (MS Store alias), Docker: not found
- Workspace: `E:\Hackathon\KaneCLI`; tools/cache: `E:\Opencode_workspace`

## Install (2026-11-23)
- Command: `$env:npm_config_cache="E:\Opencode_workspace\npm-cache"; $env:npm_config_prefix="E:\Opencode_workspace\npm-global"; npm.cmd install -g @testmuai/kane-cli`
- Result: added 177 packages, `kane-cli --version` => `0.10.8`
- Install path: `E:\Opencode_workspace\npm-global\kane-cli.cmd`
- Friction: PowerShell script execution policy blocks `npm.ps1`/`kane-cli.ps1`; use `npm.cmd` / `kane-cli.cmd` or `& "..."`.
- Friction: npm warned sharp@0.34.5 install script not allowed by allowScripts (not yet validated if impacts Kane CLI).

## Auth check
- `kane-cli whoami` (before login) => **Not logged in** (profile default, env prod, method none, token missing). Exit code 1.
- `kane-cli whoami` (after login) => **Authenticated**. Profile: `suisei`, env: `prod`, method: `oauth`, user: `alviagsts`, token: `valid`. (Exit code 1 due to stderr warning; auth itself OK.)
- Friction: `whoami` printed stderr warning `Skill update available: not installed → 0.1.4 — run \`kane-cli install skill\`` and returned exit code 1 even though authenticated.

## CLI surface (from --help, v0.10.8)
- Key commands: `login`, `whoami`, `run`, `--tui`, `generate`, `testmd`, `testrun`, `explore`, `config`, `context`, `cover`, `design`, `evidence`, `policy`, `apps/devices` (mobile), `feedback`.
- `run`: browser/mobile objective, natural language. `--headless --agent` for CI/agent mode.
- Exit codes (docs): 0 pass, 1 fail/assertion, 2 error (auth/chrome crash), 3 timeout/cancelled.

## Quickstart/docs reviewed
- https://www.testmuai.com/support/docs/kane-cli-quickstart/
- https://www.testmuai.com/docs/kane-cli-cli-reference
- https://github.com/LambdaTest/kane-cli
- Notes: default run starts on KaneAI playground; login stores creds under `~/.testmuai/kaneai/profiles/`; end of run uploads to Test Manager and prints share link.

## Runs executed
| # | Command | Result | Evidence |
|---|---------|--------|----------|
| 1 | `kane-cli --version` | 0.10.8 | terminal output |
| 2 | `kane-cli --help` | command list captured | terminal output |
| 3 | `kane-cli whoami` (pre-login) | Not logged in | terminal output |
| 4 | `kane-cli whoami` (post-login) | Authenticated as `alviagsts` (suisei/oauth/prod) | terminal output |
| 5 | `kane-cli run "Click the 'More information' link" --url https://example.com` | **PASSED**, 3 steps, 25.5s, 11.3443 credits (user-reported). Opened example.com -> clicked "Learn more" -> landed on https://www.iana.org/help/example-domains | user paste + local session `~/.testmuai/kaneai/sessions/6f3e6375-c276-489f-8bd1-5b26a89ccb6e` (session.json, runner-stderr.log, run.yaml, v16-trajectory/0-run_summary.json: final_status complete, 3 steps, 7.24583 credits in summary) |
| 6 | `kane-cli run "Verify the page heading says 'Example Domain'" --url https://example.com --headless --agent` | **PASSED**, 3 steps, 13.7s, 11.5157 credits. NDJSON stream with `run_end` JSON: status passed, result_code 100, reason success.complete, context.memory/variables, final_state, session_dir/run_dir, Test Manager `test_url`, coverage skipped (not_assurance_project) | terminal NDJSON captured; session `e7a70ea5-0ea8-40c0-8243-f9a0589b5019` |
| 7 | `bugboing verify --checks checks.smoke.json --max-attempts 1 --kane-cmd ... --report smoke-report.json` | **PASSED** (BugBoing wrapper). Parsed Kane NDJSON `run_end`, produced structured report with status/reason/test_url/session_dir/credits. | smoke-report.json + terminal output |
| 8 | `kane-cli run "Assert the h1 heading text is exactly 'BugBoing Demo'. Fail..." --url http://127.0.0.1:4173 --headless --agent` (manual, buggy page) | **FAILED** as expected. Kane caught bug: status failed, result_code 740, reason_code `assertion_error.confirmed_product_bug`, verdict confirmed, observed `BugBoing Demoo` expected `BugBoing Demo`. | terminal NDJSON, session `7787949c-...` |
| 9 | `bugboing verify --checks demo/checks.json --fix-cmd "node demo/fix.mjs" --max-attempts 2 ...` | **PASSED after loop**. Attempt 1: Kane failed (740, confirmed_product_bug, heading mismatch). BugBoing invoked fix-cmd (exit 0, patched demo/index.html). Attempt 2: Kane passed (100, success.complete, heading verified). | `demo/report.json` + terminal output |
| 10 | `bugboing verify --checks checks.external.json --max-attempts 1 ...` (https://httpbin.org/html) | **PASSED** on real external target outside demo fixture. Kane verified h1 `Herman Melville - Moby-Dick`. | `external-report.json` (gitignored) |

## Observations
- Real evidence pack created locally under session evidence dir (run.yaml, steps screenshots/json, network.har, actions.ndjson, run logs). Useful for "Verified".
- `--headless --agent` emits machine-readable NDJSON events (`stream_start`, `recording_state`, `skill_update_available`, `bifurcation`, step events, `coverage`, `run_end`). `run_end` includes status/summary/reason/context/credits/result_code/test_url - strong for "Closed loop" (agent parses structured result and re-prompts).
- Config default: model v16-alpha, mode testing, assertion_mode dom, bug_detection off, final_validation off, 1920x1080, default_url KaneAI playground, project "KaneAI Generated".
- Balance after runs: 11168.6382 credits observed.
- Run used model `v16-alpha`, screen 1920x1080, max_steps 50 (from run_summary).
- Credit accounting differs slightly between UI summary and run_summary.json - note for claims.

## Open friction / unknowns
- Need to confirm: target web or mobile? macOS Apple Silicon / real device plan for mobile?
- Sharp install script not allowed - watch for runtime errors.
- Node v26.13.0 is very new; watch for compatibility issues.
- `whoami`/commands often exit code 1 with stderr "Skill update available..." even on success - parse stdout/JSON, not exit code blindly.
- Need to test: failure case (Kane catches something), `generate`/`testmd`/`testrun`, `--bug-detection`, `--assertion-failure-mode`, `evidence` commands, feedback.
