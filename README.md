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

Terminal 1 - start demo fixture server:

```bash
node demo/serve.mjs
```

Terminal 2 - run BugBoing:

```bash
npx tsx src/cli.ts verify \
  --checks demo/checks.json \
  --fix-cmd "node demo/fix.mjs" \
  --max-attempts 2 \
  --kane-cmd kane-cli.cmd \
  --report demo/report.json
```

Expected: attempt 1 fails because Kane catches `BugBoing Demoo` != `BugBoing Demo`, fix-cmd patches `demo/index.html`, attempt 2 passes with Kane verification.

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

The fix command can be anything: a deterministic script, `opencode run ...`, Claude/Codex/Gemini CLI, or your own agent wrapper. It should exit 0 when it applied a fix attempt.

## CLI

```text
bugboing verify --checks <checks.json> [--fix-cmd <cmd>] [--max-attempts <n>] [--report <file>] [--kane-cmd <cmd>]
```

Exit codes:
- `0` - all checks passed (after retries if any)
- `1` - one or more checks failed after retries / no fix path
- `2` - tool/config/runtime error

## Evidence

- `demo/report.json` - golden-path report (fail -> fix -> pass) with strict `kaneVerified`/`verificationSource` fields.
- `tests/contract.test.ts` - enforces strict contract: only Kane `run_end` pass is green; exit 0 without `run_end` is unverified.

## Known Limitations

- Demo fix-cmd is deterministic (patches known typo) for reliability; real AI-agent fix is pluggable but not auto-bundled.
- Kane objective phrasing matters; vague objectives may pass without strong assertion.
- Depends on Kane CLI/TestMu AI availability and credits.
- Windows PowerShell script policy may require `.cmd` wrappers.
- No parallel checks, no MCP server, no HTML dashboard yet (cut for scope).

## Next Steps

- Add real agent adapters (`--fix-cmd` templates for OpenCode/Claude/Codex).
- Add MCP server mode for agent-native integration.
- Support `kane-cli generate/testmd/testrun` flows for richer assurance.
- Add CI GitHub Action and PR comment report.
- Add flaky-check quarantine and budget policies.

## License

TBD (add before submission per hackathon rules).
