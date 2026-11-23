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

const before = await readFile(target, "utf8");
if (!before.includes("BugBoing Demoo")) {
  console.log("no known bug found; nothing to fix");
  process.exit(0);
}
const after = before.replace("BugBoing Demoo", "BugBoing Demo");
await writeFile(target, after, "utf8");
console.log(`fixed ${target}`);
console.log(`reason: ${payload?.result?.reason ?? "unknown"}`);
