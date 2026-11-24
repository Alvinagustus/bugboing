# BugBoing

**Fail. Boing. Fix. Verify.**  
BugBoing is a strict Kane-verified CLI wrapper for AI fix loops. It can run a fixer after a browser failure, but it turns green **only** when Kane CLI emits a passing `run_end`. Fixer exit `0`, missing verdicts, and unparseable output are never treated as success.

> Hackathon: KaneCLI Online Hackathon (TestMu AI). Built for web verification with Kane CLI as the load-bearing verification engine.

## Problem

AI coding agents can edit code fast, but they often miss the last mile: *did the fix actually work in a real browser?* A fixer can exit `0`, print "done", or patch the wrong thing — and you still don't have browser proof. BugBoing closes that gap by making Kane CLI the only pass/fail oracle.

## How It Works

1. **Run** - BugBoing executes checks via `kane-cli run ... --headless --agent`.
2. **Catch** - It parses Kane NDJSON `run_end` for status, reason/result codes, evidence, and Test Manager link.
3. **Boing** - On failure, it invokes `--fix-cmd` and passes a structured failure payload on stdin (JSON), including `kaneVerified`, `verificationSource`, and `rawRunEnd`.
4. **Verify** - It reruns the same Kane check. Only a Kane `run_end` with `status:"passed"` becomes green. Missing/unparseable `run_end` becomes `unverified` — never green.

```text
checks.json ──> BugBoing ──> kane-cli run (--headless --agent)
                   │                    │
                   │              NDJSON run_end
                   │         (status/evidence/test_url)
                   │                    │
                   ├── pass ────────────┴──> report + exit 0
                   │
                   └── fail ──> fix-cmd (stdin JSON payload)
                                      │
                                      └──> rerun Kane check (boing!)
```

## Why Kane CLI Is Load-Bearing

BugBoing does **not** replace browser verification. Kane CLI is the only pass/fail oracle:
- Runs real browser objectives in natural language.
- Produces structured machine-readable NDJSON (`run_end`, result/reason codes, summary, context).
- Produces evidence packs and Test Manager share links.
- Catches real failures (e.g. assertion/confirmed product bug) that become the fix payload.

Without Kane CLI, BugBoing has no trusted pass/fail signal.

## Verification Contract (the differentiator)

This is the core of BugBoing. The loop pattern is crowded; the strict verdict contract is the point.

| Case | BugBoing result | Why |
|---|---|---|
| Kane `run_end.status == "passed"` | **GREEN / VERIFIED** | Real Kane verdict |
| Kane `run_end.status != "passed"` | **NOT GREEN** | Real Kane failure |
| Fixer exits `0`, but no Kane pass | **NOT GREEN** | Fixer exit code is not proof |
| Missing / unparseable `run_end` | **UNVERIFIED / NOT GREEN** | No verdict, no trust |

The report makes this machine-visible:

```json
{
  "contract": { "rule": "no_kane_pass_no_green", "version": 1, "enforced": true },
  "checks": [{
    "passed": false,
    "kaneVerified": false,
    "verificationSource": "none",
    "trust": "unverified_missing_run_end",
    "trustReason": "Kane did not emit a run_end verdict; BugBoing refuses to treat this as green."
  }]
}
```

## Quick Start

### Prerequisites
- Node.js >= 20
- Kane CLI installed and authenticated (`kane-cli login`, `kane-cli whoami`)
- Windows note: use `kane-cli.cmd` if PowerShell script execution policy blocks `.ps1` wrappers.

### Install

```bash
git clone https://github.com/Alvinagustus/bugboing
cd bugboing
npm install
```

### Run the demo (golden path)

```bash
npm run demo
```

This resets the demo fixture, starts a local server, runs BugBoing with a generic payload-driven fixer (`demo/fix-generic.mjs`), and writes `demo/report.json`.

Expected: attempt 1 fails because Kane catches `BugBoing Demoo` != `BugBoing Demo`, the fixer consumes the failure JSON from stdin and patches `demo/index.html`, attempt 2 passes only after Kane `run_end` reports `passed`.

Manual run:

```bash
node demo/serve.mjs
# in another terminal
npx tsx src/cli.ts verify --checks demo/checks.json --fix-cmd "node demo/fix-generic.mjs" --max-attempts 2 --kane-cmd kane-cli.cmd --report demo/report.json
```

## Checks Format

`checks.json`:

```json
[
  {
    "name": "heading-check",
    "url": "http://127.0.0.1:4173",
    "objective": "Assert the h1 heading text is exactly 'BugBoing Demo'. Fail if the heading is different.",
    "timeoutSeconds": 120,
    "maxSteps": 50
  }
]
```

## Fixer Interface (agent-agnostic, not the novelty)

The stdin fixer interface is useful plumbing, not the headline. Similar agent-cmd/stdin patterns exist in other tools; BugBoing's value is that **the fixer never decides green**.

`--fix-cmd` receives structured JSON on stdin:

```json
{
  "tool": "bugboing",
  "contract": { "rule": "no_kane_pass_no_green", "version": 1 },
  "check": { "name": "...", "url": "...", "objective": "..." },
  "attempt": 1,
  "maxAttempts": 2,
  "result": {
    "status": "failed",
    "reason": "...",
    "trust": "kane_verified_fail",
    "kaneVerified": false,
    "verificationSource": "kane_run_end",
    "testUrl": "...",
    "rawRunEnd": { "...": "..." }
  }
}
```

The fixer can be any command that reads stdin JSON and attempts a repair. After it exits — even with exit `0` — BugBoing reruns Kane.

Examples:

```bash
# Generic payload-driven fixer (included, proves the contract)
--fix-cmd "node demo/fix-generic.mjs"

# Agent CLI examples (templates - adapt to your agent)
--fix-cmd "opencode run 'Fix the bug using the BugBoing JSON on stdin'"
--fix-cmd "claude -p 'Read BugBoing failure JSON from stdin and fix the issue'"
```

## CLI

```text
bugboing verify --checks <checks.json> [--fix-cmd <cmd>] [--max-attempts <n>] [--report <file>] [--kane-cmd <cmd>]
```

Exit codes:
- `0` - all checks passed (after retries if any)
- `1` - one or more checks failed after retries / no fix path
- `2` - tool/config/runtime error

## Evidence

- `demo/report.json` - golden-path report from a real Kane run (fail → fix → pass). The v0.2.0 report schema includes `contract`, `trust`, `kaneVerified`, `verificationSource`, and `rawRunEnd`; regenerate with `npm run demo` to capture a fresh report in the new schema.
- `tests/contract.test.ts` - contract tests proving: pass is green only on Kane `run_end` pass; exit `0` without `run_end` is NOT green; missing `run_end` is unverified.
- `demo/fix-generic.mjs` - payload-driven fixer proving the interface is agent-agnostic.

## Tests

```bash
npm test
```

## Known Limitations / Honest Positioning

- **Crowded pattern.** Fail→fix→rerun loops and stdin-driven agent commands already exist in the ecosystem. BugBoing does **not** claim novelty there.
- **Narrow proof.** BugBoing's value is the strict, testable verdict contract: no Kane `run_end` pass = no green. That contract is enforced in code and covered by contract tests.
- **Demo fixers are scoped.** Included fixers are deterministic/payload-driven for reliability. Real agent CLIs can be plugged in, but are not bundled or benchmarked here.
- **Kane objective quality matters.** Vague objectives may produce weak assertions.
- **Operational dependency.** Requires Kane CLI/TestMu AI availability and credits. Windows PowerShell script policy may require `.cmd` wrappers.
- **Cut for scope.** No parallel checks, MCP server, HTML dashboard, or 0-credit replay regression guard (investigated as a possible gap; not shipped).

## Next Steps

- Add real agent adapters (`--fix-cmd` templates for OpenCode/Claude/Codex).
- Add CI GitHub Action and PR comment report.
- Investigate 0-credit Kane evidence verdict/policy as a regression guard (only if verified).
- Add MCP server mode for agent-native integration.

## License

MIT. See [`LICENSE`](./LICENSE).
