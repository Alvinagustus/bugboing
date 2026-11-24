# Public checkout-bug loop (GitHub Pages + Kane CLI)

Same checkout defect as [`../checkout-bug/`](../checkout-bug/), but the Kane
checks run against a **public URL**:

- Buggy fixture (deployed): `https://alvinagustus.github.io/bugboing/checkout-public/`
- Source served by Pages: `docs/checkout-public/`

The fixer patches `docs/checkout-public/app.js`, commits, pushes, waits for GitHub
Pages to serve the fixed file, then BugBoing reruns Kane. Only a fresh Kane
`run_end status=passed` turns the check green.

## Results

Pending — filled in after the real public run.

## Scope (honest)

- This is still a fixture we control, but the verification target is a public URL,
  not `127.0.0.1`. The Kane Test Manager `test_url` links in the report are the
  third-party-hosted evidence for each run.
- The fixer is deterministic and deploy-aware; real agent fixers can replace it via
  `--fix-cmd`, but they would also need a deploy step for a public target.
- `run.mjs` restores the committed fixture to its buggy state after capturing
  evidence, so the repo stays reproducible.
