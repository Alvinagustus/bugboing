# PLAN.md - BugBoing (KaneCLI Hackathon)

## Time Budget
- Now: 2026-11-23 ~19:10 WIB
- Hard deadline: 2026-11-27 01:29 WIB (2026-11-26 23:59 IST)
- Submit target: 2026-11-26 13:29 WIB (deadline - 12h)
- Buffer to absolute latest: 2026-11-26 22:00 WIB
- Available to submit target: ~66h

## Milestones (against submit target)
| % | Target (WIB) | Milestone | Exit Criteria |
|---:|---|---|---|
| 15% | 2026-11-24 ~05:00 | Walking skeleton | Fresh repo, CLI scaffold, `bugboing verify` runs 1 Kane check via `kane-cli --headless --agent`, parses NDJSON `run_end`, prints structured result. |
| 40% | 2026-11-24 ~21:30 | Core complete | Checks file, Kane run wrapper, failure payload builder, fix-cmd hook, rerun loop, max-attempts/budget, JSON report. |
| 60% | 2026-11-25 ~10:30 | Golden path reliable | Demo web app with intentional bug; BugBoing catches via Kane, invokes fix-cmd, reruns Kane to green; tested on 1 real external target/site. |
| 70% | 2026-11-25 ~17:00 | **FEATURE FREEZE** | No new features. Only golden path hardening, docs, demo. |
| 85% | 2026-11-26 ~03:00 | Hardened | Error handling, clear exit codes, clean checkout, smoke test, README draft, evidence ledger complete. |
| 100% | 2026-11-26 ~13:00 | Submission-ready | Demo video recorded/uploaded, README finalized, 2+ public posts drafted/published, submission form verified in incognito. |

## Scope (Golden Path)
- Input: `checks.json` (name, url, objective, optional expect/pass criteria) + `--fix-cmd` (agent command receiving failure JSON on stdin/file).
- Run: `kane-cli run "<objective>" --url <url> --headless --agent` per check.
- Parse: NDJSON -> extract `run_end` (status, reason, summary, result_code, evidence/test_url, session_dir).
- On fail: build structured failure payload (check, objective, observed, summary, evidence paths, test_url).
- Loop: invoke fix-cmd with payload, rerun failed check, repeat until pass or `--max-attempts`.
- Output: human summary + machine JSON report; exit 0 all pass, 1 any fail after retries, 2 tool/error.

## Cut List (drop first if behind)
1. Drop MCP server mode; keep CLI only.
2. Drop multi-check parallelism; run sequential.
3. Drop fancy HTML report; JSON + terminal summary only.
4. Drop auto-detecting fix-cmd; require explicit `--fix-cmd`.
5. Drop external-target matrix; keep 1 external target + local demo app.
6. Drop GitHub Action packaging; keep `npx`/node CLI.

## Risks / Mitigations
- Kane stderr noise / exit code 1 on warnings -> parse NDJSON/stdout, ignore stderr.
- Agent fix-cmd flaky/non-deterministic -> deterministic fallback fix-cmd script for demo; record real agent run separately.
- Credit burn -> small checks, max attempts cap, reuse local demo app.
- Login/session issues -> verify `kane-cli whoami` before run; clear error.

## Evidence to Capture (CLAIMS.md later)
- Kane failure caught (before fix) with evidence pack/test_url.
- Auto fix-cmd invoked with structured payload (log).
- Kane rerun pass after fix (evidence pack/test_url).
- End-to-end one-command demo recording.