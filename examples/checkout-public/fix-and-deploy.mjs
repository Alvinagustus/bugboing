import { readFile, writeFile } from "node:fs/promises";
import { execFileSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, "../..");
const target = path.join(root, "docs/checkout-public/app.js");
const publicUrl = "https://alvinagustus.github.io/bugboing/checkout-public/app.js";

// Drain stdin (BugBoing sends the failure payload); we don't need it for this
// deterministic fix, but we keep the contract-compatible interface.
let input = "";
process.stdin.setEncoding("utf8");
for await (const chunk of process.stdin) input += chunk;

const before = `  // BUG: the discount is shown in the cart, but the total still uses the
  // subtotal. A "page loads" check is green; only a total assertion catches it.
  const total = SUBTOTAL;`;
const after = `  const total = SUBTOTAL - DISCOUNT;`;

const raw = await readFile(target, "utf8");
const eol = raw.includes("\r\n") ? "\r\n" : "\n";
const src = raw.replace(/\r\n/g, "\n");
const beforeN = before.replace(/\r\n/g, "\n");
const afterN = after.replace(/\r\n/g, "\n");
if (src.includes(afterN) && !src.includes(beforeN)) {
  console.log("[public-fix] already fixed locally");
} else if (!src.includes(beforeN)) {
  console.error("[public-fix] expected buggy block not found; refusing to guess");
  process.exit(1);
} else {
  await writeFile(target, src.replace(beforeN, afterN).replace(/\n/g, eol), "utf8");
  console.log("[public-fix] patched docs/checkout-public/app.js");
}

function git(args, opts = {}) {
  return execFileSync("git", args, { cwd: root, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"], ...opts }).trim();
}

try {
  git(["add", "docs/checkout-public/app.js"]);
  const staged = git(["diff", "--cached", "--name-only"]);
  if (staged) {
    git(["commit", "-m", "demo: fix checkout total on public Pages fixture"]);
    git(["push", "origin", "main"]);
    console.log("[public-fix] pushed fix to main");
  } else {
    console.log("[public-fix] no git change to commit (already pushed?)");
  }
} catch (e) {
  console.error(`[public-fix] git push failed: ${String(e?.stderr || e?.message || e)}`);
  process.exit(1);
}

// Wait for GitHub Pages to build and serve the fixed JS.
const deadline = Date.now() + 5 * 60 * 1000;
while (Date.now() < deadline) {
  try {
    const res = await fetch(`${publicUrl}?t=${Date.now()}`, { cache: "no-store" });
    const body = await res.text();
    if (res.ok && body.includes("SUBTOTAL - DISCOUNT") && !body.includes("const total = SUBTOTAL;")) {
      console.log("[public-fix] public Pages serves the fixed app.js");
      process.exit(0);
    }
    console.log(`[public-fix] waiting for Pages deploy... status=${res.status}`);
  } catch (e) {
    console.log(`[public-fix] waiting for Pages deploy... ${String(e?.message || e)}`);
  }
  await new Promise((r) => setTimeout(r, 10000));
}

console.error("[public-fix] timed out waiting for GitHub Pages to serve the fix");
process.exit(1);
