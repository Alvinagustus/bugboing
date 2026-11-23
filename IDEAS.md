# IDEAS.md - KaneCLI Hackathon (Web, Windows)

## Scoring Map (from BRIEF)
| Criterion | Weight | Concrete Evidence for Full Marks |
|---|---:|---|
| Ships | 25% | Clean-checkout run + recorded golden path |
| Verified | 25% | Real failure caught by Kane (evidence pack), then fixed |
| Closed loop | 25% | Automatic hook: fail -> agent re-prompted with structured result -> re-run, no human in between |
| Craft | 25% | One-command install, clear README, sensible defaults |

## Candidates (8, 2 per blueprint)

### A1 - KaneGate: PR Quality Gate with Auto-Fix Loop
- **Pitch & CLI:** `kanegate run --spec checks.yaml --agent-cmd "..."` runs web checks via Kane, parses NDJSON, auto-reprompts coding agent on failure until green/budget hit.
- **User & Pain:** Solo dev/agent user shipping web UI; regressions slip because tests aren't run or failures aren't fed back to agent.
- **Load-Bearing Role:** `kane-cli run --headless --agent` for execution + structured `run_end`/step events; Kane evidence pack/test_url as proof.
- **Demo Flow:** Run gate on small demo web app -> Kane catches real regression (missing heading/button) -> gate sends structured failure to agent -> agent patches code -> Kane reruns green. Fits 3-5 min.
- **Effort:** ~12-16h (CLI + spec parser + NDJSON parser + agent hook + demo app).

### A2 - KaneA11y Guard: Accessibility/Behavior Gate
- **Pitch & CLI:** `kanea11y scan --url ... --checks a11y.yaml` runs Kane objectives/assertions for key a11y/UX behaviors and emits pass/fail report.
- **User & Pain:** Frontend dev wants quick pre-PR behavioral/a11y smoke checks without writing Playwright tests.
- **Load-Bearing Role:** Kane natural-language assertions/analyzer behavior and evidence screenshots/logs.
- **Demo Flow:** Scan demo page, Kane proves missing label/focus issue, fix, rescan green.
- **Effort:** ~10-14h.

### B1 - DocDrift: README/Quickstart Drift Detector
- **Pitch & CLI:** `docdrift verify README.md --base-url ...` extracts runnable steps/claims from docs, executes via Kane, reports drift and optional patch suggestions.
- **User & Pain:** Maintainers whose README quickstarts rot; users hit broken onboarding.
- **Load-Bearing Role:** Kane executes real browser steps from extracted claims; evidence proves what broke.
- **Demo Flow:** Point at README with intentionally stale step -> Kane fails on missing text/button -> tool outputs drift report -> patch README/flow -> rerun green.
- **Effort:** ~12-18h (doc parsing is fiddly).

### B2 - SpecDrift: Acceptance Spec vs Live App Verifier
- **Pitch & CLI:** `specdrift check spec.md --url ...` turns markdown acceptance bullets into Kane checks and produces Proven/Owed report.
- **User & Pain:** Product/dev teams with stale spec docs; no quick proof what's true in deployed app.
- **Load-Bearing Role:** Kane runs each acceptance criterion as browser objective/assertion; evidence per criterion.
- **Demo Flow:** Feed small spec, Kane proves 2 pass/1 fail, show report, fix app, rerun.
- **Effort:** ~10-14h.

### C1 - IssueProof: GitHub Issue Acceptance Verifier
- **Pitch & CLI:** `issueproof verify --issue issue.md --url ...` converts acceptance criteria into Kane runs and outputs `Proven vs Owed` matrix.
- **User & Pain:** Developer closing issues without reproducible proof; reviewers lack evidence.
- **Load-Bearing Role:** Kane executes criteria and produces evidence packs/test URLs for each check.
- **Demo Flow:** Load issue with 3 criteria -> Kane proves 2, fails 1 with evidence -> agent fixes -> rerun -> all Proven.
- **Effort:** ~10-14h.

### C2 - PRDProof: Plain-English Requirement Evidence Matrix
- **Pitch & CLI:** `prdproof check requirements.txt --url ...` runs plain-English requirements through Kane and emits evidence-backed matrix.
- **User & Pain:** Solo builder/PM-dev validating MVP requirements before demo/release.
- **Load-Bearing Role:** Kane natural-language execution + structured results/evidence.
- **Demo Flow:** 4 requirements, 1 fails, fix, rerun, matrix turns green.
- **Effort:** ~8-12h.

### D1 - KaneBridge: Reliable Agentic Wrapper/MCP-friendly CLI
- **Pitch & CLI:** `kanebridge run --objective ... --json` wraps Kane with retries, budget/timeout caps, normalized JSON schema, and exit-code normalization.
- **User & Pain:** AI coding agents need deterministic machine interface; raw Kane has stderr noise/exit-code quirks.
- **Load-Bearing Role:** Wraps `kane-cli run --headless --agent`; preserves Kane evidence/test_url while normalizing output for agents.
- **Demo Flow:** Agent calls kanebridge, gets clean JSON failure, applies patch, reruns through same bridge.
- **Effort:** ~8-12h (useful but may feel thin unless paired with auto-fix loop).

### D2 - BugBoing: Agent Hook for Fail->Fix->Rerun
- **Pitch & CLI:** `bugboing verify --checks checks.json --fix-cmd "..."` runs Kane checks; on fail sends structured failure context to fix command; reruns until pass or max attempts.
- **User & Pain:** Developers using AI coding agents want verification inside the agent loop, not manual test reruns.
- **Load-Bearing Role:** Kane `--headless --agent` NDJSON `run_end`/step evidence as feedback payload; Kane rerun as verification.
- **Demo Flow:** Demo web app has bug -> BugBoing runs check, gets structured fail -> invokes agent fix command with failure+evidence -> reruns Kane -> pass. Fully automatic.
- **Effort:** ~12-16h.

## Initial Scorecard (1-5, weighted by BRIEF 25% each + feasibility signals)
| Idea | Ships | Verified | Closed loop | Craft | Feasibility | Novelty | Notes |
|---|---:|---:|---:|---:|---:|---:|---|
| A1 KaneGate | 5 | 5 | 5 | 4 | 4 | 4 | Strong fit; close to D2 but more "gate" framing. |
| A2 KaneA11y Guard | 4 | 4 | 3 | 4 | 4 | 3 | Useful, weaker closed-loop story. |
| B1 DocDrift | 4 | 5 | 3 | 4 | 3 | 4 | Doc parsing risk; demoable. |
| B2 SpecDrift | 4 | 4 | 3 | 4 | 4 | 3 | Similar to C1/C2. |
| C1 IssueProof | 4 | 5 | 4 | 4 | 4 | 4 | Good story; needs issue input UX. |
| C2 PRDProof | 4 | 4 | 3 | 4 | 5 | 3 | Simple, less differentiated. |
| D1 KaneBridge | 4 | 4 | 4 | 5 | 5 | 3 | Valuable infra, may look small alone. |
| D2 BugBoing | 5 | 5 | 5 | 4 | 4 | 5 | Best closed-loop fit; clear demo. |

## Kill Test (must all be YES)
| Idea | Clear user+gain | Deterministic golden path/fallback | Deps available now | Core before 70% freeze | Collapses without Kane | Real-world usable today | Verdict |
|---|---|---|---|---|---|---|---|
| A1 | YES | YES (local demo app + canned agent-cmd fallback) | YES (Node/git/kane) | YES | YES | YES | PASS |
| A2 | YES | YES | YES | YES | YES | YES | PASS |
| B1 | YES | MED (doc extraction edge cases) | YES | MAYBE | YES | YES | RISK |
| B2 | YES | YES | YES | YES | YES | YES | PASS |
| C1 | YES | YES | YES | YES | YES | YES | PASS |
| C2 | YES | YES | YES | YES | YES | YES | PASS |
| D1 | YES | YES | YES | YES | YES | YES | PASS |
| D2 BugBoing | YES | YES (local demo app + deterministic fix-cmd fallback) | YES | YES | YES | YES | PASS |

## Selection
- **Primary: D2 BugBoing** (CONFIRMED 2026-11-23) - strongest direct fit to judging bars, especially "Closed loop" (automatic fail -> structured Kane result -> agent re-prompt/fix -> rerun). Easy to prove with real Kane evidence pack and NDJSON.
- **Fallback: A1 KaneGate** - similar core, framed as quality gate; can drop auto-fix sophistication and keep gate+report if agent integration flaky.

## Gate 3 -> 4
Primary confirmed by user: **BugBoing**. Proceed to repo scaffold + PLAN.md.