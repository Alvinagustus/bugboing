import { spawn, execFileSync } from "node:child_process";
import { setTimeout as delay } from "node:timers/promises";
import { createWriteStream } from "node:fs";
import { copyFile, readFile, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, "../..");
const reportFile = path.join(here, "report.json");
const logFile = path.join(here, "run-output.txt");
const logRel = path.relative(root, logFile).split(path.sep).join("/");
const diffFile = path.join(here, "diff.patch");
const publicApp = path.join(root, "docs/checkout-public/app.js");
const buggyApp = path.join(root, "examples/checkout-bug/site/app.js");

function git(args) {
  return execFileSync("git", args, { cwd: root, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] }).trim();
}

async function waitForPublic(text, timeoutMs = 5 * 60 * 1000) {
  const url = "https://alvinagustus.github.io/bugboing/checkout-public/app.js";
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    try {
      const res = await fetch(`${url}?t=${Date.now()}`, { cache: "no-store" });
      const body = await res.text();
      if (res.ok && body.includes(text)) return;
      console.log(`[run] waiting for Pages: status=${res.status}`);
    } catch (e) {
      console.log(`[run] waiting for Pages: ${String(e?.message || e)}`);
    }
    await delay(10000);
  }
  throw new Error(`Timed out waiting for public app.js to contain: ${text}`);
}

// 1. Ensure the public fixture is in its buggy state before the run.
await copyFile(buggyApp, publicApp);
git(["add", "docs/checkout-public/app.js"]);
const staged = git(["diff", "--cached", "--name-only"]);
if (staged) {
  git(["commit", "-m", "demo: reset public checkout fixture to buggy state"]);
  git(["push", "origin", "main"]);
  console.log("[run] pushed buggy public fixture");
}
console.log("[run] waiting for buggy public fixture to deploy...");
await waitForPublic("const total = SUBTOTAL;");

await rm(reportFile, { force: true });
await rm(diffFile, { force: true });

// 2. Run the real loop against the public URL.
const log = createWriteStream(logFile, { flags: "w" });
const args = [
  "dist/cli.js", "verify",
  "--checks", path.join(here, "checks.json"),
  "--fix-cmd", `node "${path.join(here, "fix-and-deploy.mjs")}"`,
  "--max-attempts", "2",
  "--max-credits", process.env.MAX_CREDITS || "80",
  "--allow-fix", `docs/checkout-public/**,${logRel}`,
  "--kane-cmd", process.env.KANE_CMD || (process.platform === "win32" ? "kane-cli.cmd" : "kane-cli"),
  "--report", reportFile,
];
log.write(`$ node ${args.join(" ")}\n\n`);

const child = spawn(process.execPath, args, { cwd: root, stdio: ["ignore", "pipe", "pipe"], env: process.env });
child.stdout.on("data", (d) => { process.stdout.write(d); log.write(d); });
child.stderr.on("data", (d) => { process.stderr.write(d); log.write(d); });
const code = await new Promise((resolve) => child.on("close", resolve));
log.end();

// 3. Capture the diff the fixer made (before restoring). The fixer commits the
// fix, so working-tree diff is empty; compare against the known buggy baseline.
try {
  const buggy = await readFile(buggyApp, "utf8");
  const fixed = await readFile(publicApp, "utf8");
  if (buggy === fixed) {
    await writeFile(diffFile, "", "utf8");
  } else {
    const a = path.join(root, ".git", "BUGBOING_buggy_app.js");
    const b = path.join(root, ".git", "BUGBOING_fixed_app.js");
    await writeFile(a, buggy, "utf8");
    await writeFile(b, fixed, "utf8");
    let diff = "";
    try {
      diff = execFileSync("git", ["diff", "--no-color", "--no-index", "--", a, b], { cwd: root, encoding: "utf8" });
    } catch (e) {
      // git diff --no-index exits 1 when files differ
      diff = String(e?.stdout || "");
    }
    await rm(a, { force: true });
    await rm(b, { force: true });
    diff = diff.replaceAll(a.replaceAll("\\", "/"), "examples/checkout-bug/site/app.js");
    diff = diff.replaceAll(b.replaceAll("\\", "/"), "docs/checkout-public/app.js");
    await writeFile(diffFile, diff, "utf8");
  }
} catch (e) {
  console.error(`[run] could not capture diff: ${String(e)}`);
}

// 4. Restore the committed fixture to buggy so the repo stays reproducible.
await copyFile(buggyApp, publicApp);
git(["add", "docs/checkout-public/app.js"]);
const staged2 = git(["diff", "--cached", "--name-only"]);
if (staged2) {
  git(["commit", "-m", "demo: restore public checkout fixture to buggy state"]);
  git(["push", "origin", "main"]);
  console.log("[run] restored buggy public fixture");
}

console.log(`[run] bugboing exit=${code}`);
process.exit(code ?? 1);
