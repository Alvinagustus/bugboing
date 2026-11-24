# Inventory filter bug (real agent + Kane CLI)

Cookbook class: **UI filter/state logic**. Clicking "In stock only" updates the
button state, but out-of-stock items are never hidden and the count stays wrong.
A "page renders" check stays green; only the filter behavior catches it.

## Bug

`site/app.js` computes `const hide = false` for every item, ignoring
`showInStockOnly` and `item.dataset.stock`.

## Result

From `report.json` (24 Nov 2026, `bugboing 0.3.0`, fixer `opencode/iceman-free`):

| Attempt | Who | Result | Credits |
|---|---|---|---:|
| 1 | Kane CLI | `740`, `assertion_error.confirmed_product_bug`, verdict `confirmed: true`, family `application_issue`, category `functional_defect`, severity `major` — In stock only pressed, but 3 items and Out of stock still visible. | 6.20 |
| — | OpenCode agent (`iceman-free`) | Used tools to edit `site/app.js`; set `hide = showInStockOnly && item.dataset.stock === "out"` (exit 0, not proof) | 0 |
| 2 | Kane CLI | `100`, `success.complete`, **VERIFIED_PASS** — 2 items visible, Out of stock not visible. | 7.02 |

Total **13.22** credits (`--max-credits 80`). Scope guard: clean. Local user paths
sanitized to `<user>`.

## Artifacts

- `report.json` — BugBoing report with both Kane `test_url` links.
- `agent-transcript.ndjson` — OpenCode JSONL tool-use trace.
- `run-output.txt` — full loop output.
- `diff.patch` — exact agent change.

## Reproduce

```bash
npm run build
# set KANE_CMD and OPENCODE_BIN as needed
OPENCODE_MODEL=opencode/iceman-free node examples/inventory-filter/run.mjs
```

## Scope (honest)

- One fixture, one real agent run. Evidence of agent↔Kane communication, not a
  benchmark.
- A first attempt with the same model failed after attempt 2 because the fixture
  CSS overrode the `hidden` attribute; the fixture was hardened with
  `[hidden]{display:none!important;}` and the clean passing run above was recorded.
  Earlier failed attempts cost extra credits but are not counted as passing evidence.
