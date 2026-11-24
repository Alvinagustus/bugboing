# Real agent loop (OpenCode CLI + Kane CLI)

This is the evidence that the fixer slot is a real coding agent, not a hard-coded
script. A real agent receives Kane's failure payload, uses tools to inspect the
site, patches it, and exits `0` — and BugBoing still refuses to go green until a
fresh Kane run emits `run_end status=passed`.

## What happened

| Attempt | Who | Result |
|---|---|---|
| 1 | Kane CLI | `result_code 740`, `assertion_error.confirmed_product_bug`, verdict `confirmed: true`, family `application_issue`, 16.77 credits |
| — | OpenCode CLI (`opencode/deepseek-v4.1-flash-free`) | tools: `glob`, `read` ×3, `edit`; exit `0`; **not proof** |
| 2 | Kane CLI | `result_code 100`, `success.complete`, `run_end status=passed`, 5.25 credits |

BugBoing reported `VERIFIED_PASS` only after attempt 2. The agent's `exit 0` did
not turn anything green.

The fixture is a runtime bug, not a static typo: `index.html` contains the correct
heading, but `site/app.js` overwrites it with `"BugBoing Demoo"` after load, so the
defect is only visible in the rendered DOM.

## Artifacts

- `report.json` — the real BugBoing report (`attemptHistory[0]` = Kane fail, final = Kane pass).
- `agent-transcript.ndjson` — OpenCode `--format json` stream: session id, tool calls (`glob`/`read`/`edit`), and the agent's own summary.
- `diff.patch` — the exact change the agent made.
- `run-output.txt` — full stdout/stderr of the loop, including both Kane `test_url` share links.

Local user paths in `report.json` and `run-output.txt` are sanitized to `<user>`.

## Reproduce

Requirements: Kane CLI authenticated with credits, OpenCode CLI installed, Node 20+.

```bash
# 1. reset the fixture to its committed buggy state
git checkout -- examples/real-agent-loop/site

# 2. point BugBoing at the real binaries (adjust to your machine)
export KANE_CMD="kane-cli"                                                    # POSIX
export OPENCODE_BIN="opencode"                                                # POSIX
# PowerShell:
#   $env:KANE_CMD="C:\path\to\kane-cli.cmd"
#   $env:OPENCODE_BIN="C:\path\to\opencode-cli.exe"

# 3. run one real loop
node examples/real-agent-loop/run.mjs
```

`run.mjs` starts the fixture on `http://127.0.0.1:4180`, runs
`node dist/cli.js verify ... --fix-cmd "node examples/real-agent-loop/fix-with-opencode.mjs"`
with `--max-attempts 2`, then writes `report.json`, `agent-transcript.ndjson`, and
`diff.patch`.

The wrapper only passes context: it reads BugBoing's JSON from stdin and gives the
agent the check, the objective, and Kane's verdict. The agent decides what to edit.
`--fix-cmd` can be swapped for any other agent CLI with the same stdin contract.

## Scope (honest)

- One fixture and one loop. This is evidence that agent ↔ Kane communication works,
  not a benchmark of agent quality.
- The recorded artifacts predate the verdict gate (`verdict.confirmed` +
  `family=application_issue`) and the scope guard. The recorded verdict satisfies
  that gate, and the recorded change is inside the committed `fixPaths`, but the
  artifacts themselves were produced by the earlier build.
- The bug is a real DOM/runtime mismatch, but it is still a demo bug chosen for
  determinism.
- `run.mjs` resets the fixture with `git checkout`; the committed site stays buggy.
- The agent is granted `--auto` inside a throwaway demo directory. Do not copy that
  permission model to a repo you care about without a scope guard.
