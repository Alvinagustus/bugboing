# Profile required-name bug (real agent + Kane CLI)

Cookbook class: **form validation**. Clearing the required Name field and clicking
"Save changes" shows "Saved!" instead of "Name is required".

## Bug

`site/app.js` always sets `Saved!` on click; it never validates that Name is
non-empty.

## Result

From `report.json` (24 Nov 2026, `bugboing 0.3.0`, fixer Hermes via Nous Portal,
model `meituan/longcat-2.5:free`):

| Attempt | Who | Result | Credits |
|---|---|---|---:|
| 1 | Kane CLI | `740`, `assertion_error.confirmed_product_bug`, verdict `confirmed: true`, family `application_issue`, category `validation_defect`, severity `major` — empty Name saved as "Saved!" instead of showing "Name is required". | 22.29 |
| — | Hermes agent (Nous Portal, `meituan/longcat-2.5:free`) | Added required-name validation and returned before success path (exit 0, not proof) | 0 |
| 2 | Kane CLI | `100`, `success.complete`, **VERIFIED_PASS** — "Name is required" visible, "Saved!" not visible. | 16.35 |

Total **38.64** credits (`--max-credits 80`). Scope guard: clean. Local user paths
sanitized to `<user>`.

## Artifacts

- `report.json` — BugBoing report with both Kane `test_url` links.
- `agent-transcript.ndjson` — Hermes stream-json trace.
- `run-output.txt` — full loop output.
- `diff.patch` — exact agent change.

## Reproduce

```bash
npm run build
# set KANE_CMD and HERMES_BIN as needed
HERMES_PROVIDER=nous HERMES_MODEL=meituan/longcat-2.5:free node examples/profile-save/run.mjs
```

## Scope (honest)

- One fixture, one real agent run. Evidence of agent↔Kane communication, not a
  benchmark.
- The fixer is Hermes CLI in yolo mode inside a throwaway demo directory. Do not
  copy that permission model to a repo you care about without a scope guard.
