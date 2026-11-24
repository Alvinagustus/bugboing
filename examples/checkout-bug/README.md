# Checkout total bug (business logic, not a typo)

This example targets a class of defect that a "the page loads" check cannot see:
the UI says the promo code was applied, the discount row appears, and the page is
green — but the **order total still charges the undiscounted price**.

A browser check that asserts the real outcome (`$90.00`) catches it. A check that
asserts "the checkout page renders" does not. The fix is a one-line business-logic
change, and Kane still decides whether it worked.

## The bug

`site/app.js` on `apply`:

```js
discountRow.hidden = false;         // UI says the discount is applied
const total = SUBTOTAL;             // BUG: ignores DISCOUNT
totalEl.textContent = "$" + total.toFixed(2);
```

So `SAVE10` on a `$100.00` plan shows a `−$10.00` discount row and an order total of
`$100.00`.

## The check

`checks.json` asks for the outcome, not the layout:

> Type SAVE10 into the promo code field and click Apply. After the discount
> appears, the order total must be exactly `$90.00`. Fail if the order total shows
> `$100.00` or any amount other than `$90.00`.

## Run it

Requirements: Kane CLI authenticated with credits, Node 20+.

```bash
node examples/checkout-bug/run.mjs
```

`run.mjs` resets `site/` to the committed buggy state, serves it on
`http://127.0.0.1:4181`, runs `bugboing verify` with `--max-attempts 2` and
`--max-credits 80`, then writes:

- `report.json` — the BugBoing report (attempt 1 fail, final attempt pass)
- `run-output.txt` — full stdout/stderr, including both Kane `test_url` links
- `diff.patch` — the exact fixer change

Set `KANE_CMD` on Windows if `kane-cli.cmd` is not on `PATH`.

## Results

From `report.json` (24 Nov 2026, `bugboing 0.3.0`):

| Attempt | Who | Result | Credits |
|---|---|---|---|
| 1 | Kane CLI | `740`, `assertion_error.confirmed_product_bug`, verdict `confirmed: true`, family `application_issue`, category `functional_defect`, severity `major` — “SAVE10 shown as applied with a $10.00 discount, but the checkout total remains $100.00 instead of $90.00.” | 21.34 |
| — | `fix-total.mjs` | deterministic one-line fix: `const total = SUBTOTAL - DISCOUNT;` (exit 0, not proof) | 0 |
| 2 | Kane CLI | `100`, `success.complete`, `VERIFIED_PASS`, `final_state.order_total = "$90.00"` | 12.83 |

Total 34.18 credits (`--max-credits 80`). Both Kane `test_url` links are preserved in
`report.json` and `run-output.txt`. Local user paths are sanitized to `<user>`.

## Scope (honest)

- The fixer here is deterministic (it replaces one known block). This example is
  evidence that Kane catches a business-logic defect and gates the fix, not a
  benchmark of agent quality. Real agents can be used via `--fix-cmd`.
- The bug is chosen for determinism and a crisp assertion. It is still a realistic
  class: totals and money math drift while the page stays green.
- `run.mjs` resets the fixture with `git checkout`; the committed site stays buggy.
