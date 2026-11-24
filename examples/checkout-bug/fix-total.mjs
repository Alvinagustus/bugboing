import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const target = path.join(here, "site", "app.js");

let input = "";
process.stdin.setEncoding("utf8");
for await (const chunk of process.stdin) input += chunk;

let payload = {};
try {
  payload = JSON.parse(input || "{}");
} catch {}

const check = payload.check ?? {};
const result = payload.result ?? {};
const verdict = result.verdict ?? {};

console.log(`[checkout-fix] check=${check.name ?? "unknown"} trust=${result.trust ?? "unknown"}`);
console.log(`[checkout-fix] family=${verdict.family ?? "unknown"} confirmed=${String(verdict.confirmed)}`);
console.log(`[checkout-fix] suggestion=${verdict.suggestion ?? ""}`);

// Deterministic fixer for this fixture: the bug is a total that ignores the
// discount. A real agent can replace this command; Kane still decides.
const before = `  // BUG: the discount is shown in the cart, but the total still uses the
  // subtotal. A "page loads" check is green; only a total assertion catches it.
  const total = SUBTOTAL;`;
const after = `  const total = SUBTOTAL - DISCOUNT;`;

const source = await readFile(target, "utf8");
if (!source.includes(before)) {
  console.error("[checkout-fix] expected buggy total block not found; refusing to guess");
  process.exit(1);
}

await writeFile(target, source.replace(before, after), "utf8");
console.log(`[checkout-fix] patched ${path.relative(process.cwd(), target)} (total = subtotal - discount)`);
