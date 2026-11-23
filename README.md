# BugBoing

**Fail. Boing. Fix. Verify.**  
BugBoing is a small, agent-agnostic verification loop around Kane CLI. When Kane catches a browser failure, BugBoing sends structured evidence to any `--fix-cmd`, reruns the same Kane check, and turns green **only** when Kane emits a passing `run_end`.

> Hackathon: KaneCLI Online Hackathon (TestMu AI). Built for web verification with Kane CLI as the load-bearing verification engine.

## Problem

AI coding agents can edit code fast, but they often miss the last mile: *did the fix actually work in a real browser?* BugBoing closes that gap by wiring Kane CLI's real-browser evidence back into the fix loop.

## How It Works

1. **Run** - BugBoing executes checks via `kane-cli run ... --headless --agent`.
2. **Catch** - It parses Kane NDJSON `run_end` for pass/fail, reason, verdict, evidence, and Test Manager link.
3. **Boing** - On failure, it invokes `--fix-cmd` and passes a structured failure payload on stdin (JSON).
4. **Verify** - It reruns the same Kane check until Kane `run_end` passes or `--max-attempts` is reached. No Kane pass, no green.

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

## Verification Contract (strict)

- **No Kane pass, no green.** BugBoing only reports success when it parses a Kane `run_end` with `status: "passed"`.
- **Fixer exit code is not proof.** A `--fix-cmd` can exit 0, but BugBoing still reruns Kane and requires a passing Kane verdict.
- **Missing/unparseable `run_end` is unverified.** If Kane exits 0/1 without a `run_end`, BugBoing reports `unverified` / `missing_kane_run_end`, not success.
- **Agent-agnostic fixer.** Any command can be plugged into `--fix-cmd`; it receives the failure payload JSON on stdin.

## Quick Start

### Prerequisites
- Node.js >= 20
- Kane CLI installed and authenticated (`kane-cli login`, `kane-cli whoami`)
- Windows note: use `kane-cli.cmd` if PowerShell script execution policy blocks `.ps1` wrappers.

### Install

```bash
git clone <repo-url>
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

## Fix Command Contract

`--fix-cmd` receives JSON on stdin:

```json
{
  "tool": "bugboing",
  "check": { "name": "...", "url": "...", "objective": "..." },
  "attempt": 1,
  "maxAttempts": 2,
  "result": {
    "status": "failed",
    "reason": "...",
    "kaneVerified": false,
    "verificationSource": "kane_run_end",
    "testUrl": "...",
    "rawRunEnd": { "...": "..." }
  }
}
```

The fix command can be anything that reads stdin JSON and attempts a fix. BugBoing does not trust the fixer's exit code as proof; it reruns Kane.

Examples:

```bash
# Generic payload-driven fixer (included)
--fix-cmd "node demo/fix-generic.mjs"

# Deterministic demo fixer (included)
--fix-cmd "node demo/fix.mjs"

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

- `demo/report.json` - golden-path report (fail -> fix -> pass) with strict `kaneVerified`/`verificationSource` fields, refreshed from a real Kane run.
- `tests/contract.test.ts` - enforces strict contract: only Kane `run_end` pass is green; exit 0 without `run_end` is unverified.

## Tests

```bash
npm test
```

## Known Limitations

- The fail→fix→rerun verification loop is a crowded pattern. BugBoing's differentiator is the strict contract (no Kane `run_end` pass = no green) and an agent-agnostic `--fix-cmd` payload interface, not novelty of the loop itself.
- Included fixers are demo-scoped (deterministic/payload-driven) for reliability; real agent CLIs can be plugged in via `--fix-cmd`, but are not bundled.
- Kane objective phrasing matters; vague objectives may pass without strong assertion.
- Depends on Kane CLI/TestMu AI availability and credits.
- Windows PowerShell script policy may require `.cmd` wrappers.
- No parallel checks, MCP server, or HTML dashboard (cut for scope).

## Next Steps

- Add real agent adapters (`--fix-cmd` templates for OpenCode/Claude/Codex).
- Add MCP server mode for agent-native integration.
- Support `kane-cli generate/testmd/testrun` flows for richer assurance.
- Add CI GitHub Action and PR comment report.
- Add flaky-check quarantine and budget policies.

## License

MIT. See [`LICENSE`](./LICENSE).
