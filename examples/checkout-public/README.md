# Public checkout-bug loop (GitHub Pages + Kane CLI)

Same checkout defect as [`../checkout-bug/`](../checkout-bug/), but the Kane
checks run against a **public URL** instead of `127.0.0.1`:

- Public target: `https://alvinagustus.github.io/bugboing/checkout-public/`
- Source served by Pages: [`docs/checkout-public/`](../../docs/checkout-public/)

The fixer patches `docs/checkout-public/app.js`, commits, pushes, waits for
GitHub Pages to serve the fixed file, then BugBoing reruns Kane. Only a fresh
Kane `run_end status=passed` turns the check green.

## Results

From `report.json` (24 Nov 2026, `bugboing 0.3.0`, public target):

| Attempt | Who | Result | Credits |
|---|---|---|---:|
| 1 | Kane CLI (public URL) | `740`, `assertion_error.confirmed_product_bug`, verdict `confirmed: true`, family `application_issue`, category `ui_data_defect`, severity `major` — “SAVE10 is shown as applied for $10.00, but the order total still shows $100.00 instead of $90.00.” | 13.73 |
| — | `fix-and-deploy.mjs` | patched `docs/checkout-public/app.js`, pushed to `main`, waited for Pages to serve the fix (exit 0, not proof) | 0 |
| 2 | Kane CLI (public URL) | `100`, `success.complete`, **VERIFIED_PASS**, final state `url=https://alvinagustus.github.io/bugboing/checkout-public/` | 7.78 |

Total **21.51** credits (`--max-credits 80`). Both Kane runs have public Test Manager
`test_url` links in `report.json` and `run-output.txt`. Local user paths are
sanitized to `<user>`.

## Artifacts

- `report.json` — full BugBoing report, including both Kane `test_url` share links.
- `run-output.txt` — full stdout/stderr of the public loop.
- `diff.patch` — exact fixer change applied to the deployed fixture.

## Reproduce

Requirements: Kane CLI authenticated with credits, Node 20+, `gh` authenticated
with push access, GitHub Pages enabled for `main`/`docs`.

```bash
npm run build
KANE_CMD=kane-cli node examples/checkout-public/run.mjs   # POSIX
# PowerShell:
# $env:KANE_CMD="C:\path\to\kane-cli.cmd"; node examples/checkout-public/run.mjs
```

`run.mjs` resets the public fixture to the buggy state, waits for Pages, runs the
BugBoing loop, captures artifacts, then restores the buggy fixture so the repo
stays reproducible.

## Scope (honest)

- The fixture is still controlled by this repo, but the verification target is a
  public URL and the Kane evidence links are Test Manager-hosted artifacts. This is
  stronger than localhost-only evidence, not a claim of finding a third-party bug.
- The fixer is deterministic and deploy-aware. Real agent fixers can replace it via
  `--fix-cmd`, but a public target also needs a deploy step.
- A first public attempt failed before the rerun because the fixer was brittle on
  CRLF line endings (11.01 credits, no pass). The fixer was hardened; the successful
  run above is the recorded evidence.
