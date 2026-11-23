import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const target = path.join(__dirname, "index.html");

let input = "";
process.stdin.setEncoding("utf8");
for await (const chunk of process.stdin) input += chunk;

let payload = {};
try { payload = JSON.parse(input || "{}"); } catch {}

const check = payload?.check ?? {};
const result = payload?.result ?? {};
console.log(`[generic-fix] check=${check.name ?? "unknown"} status=${result.status ?? "unknown"} reason=${result.reason ?? "unknown"}`);
console.log(`[generic-fix] verificationSource=${result.verificationSource ?? "unknown"} kaneVerified=${result.kaneVerified}`);
console.log(`[generic-fix] testUrl=${result.testUrl ?? ""}`);

// Agent-agnostic contract: any fixer receives structured Kane failure evidence on stdin.
// This generic demo fixer uses payload evidence to locate and repair the heading mismatch.
const before = await readFile(target, "utf8");
const summary = String(result.summary ?? "");
const oneLiner = String(result.oneLiner ?? "");
const reason = String(result.reason ?? "");
const evidenceText = `${summary}\n${oneLiner}\n${reason}`;

// Prefer payload-driven inference; fall back to known demo fixture bug.
let after = before;
if (evidenceText.includes("BugBoing Demoo") || evidenceText.includes("BugBoing Demo")) {
  after = after.replace("BugBoing Demoo", "BugBoing Demo");
}
if (after === before && before.includes("BugBoing Demoo")) {
  after = before.replace("BugBoing Demoo", "BugBoing Demo");
}

if (after === before) {
  console.log("[generic-fix] no fix applied");
  process.exit(1);
}

await writeFile(target, after, "utf8");
console.log(`[generic-fix] patched ${target}`);
