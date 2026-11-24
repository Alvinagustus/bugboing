import { spawn, execFileSync } from "node:child_process";
import { setTimeout as delay } from "node:timers/promises";
import { createWriteStream } from "node:fs";
import { copyFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, "../..");
const port = Number(process.env.PORT || 4182);
const reportFile = path.join(here, "report.json");
const transcript = path.join(here, "agent-transcript.ndjson");
const transcriptTmp = path.join(os.tmpdir(), `bugboing-transcript-${process.pid}.ndjson`);
const logFile = path.join(here, "run-output.txt");
const logRel = path.relative(root, logFile).split(path.sep).join("/");
const diffFile = path.join(here, "diff.patch");

try {
  execFileSync("git", ["checkout", "--", "examples/inventory-filter/site"], { cwd: root, stdio: "ignore" });
} catch {}

await rm(reportFile, { force: true });
await rm(diffFile, { force: true });
await rm(transcriptTmp, { force: true });
await writeFile(transcript, "", "utf8");

const server = spawn(process.execPath, [path.join(here, "serve.mjs")], {
  cwd: root,
  stdio: ["ignore", "pipe", "inherit"],
  env: { ...process.env, PORT: String(port) },
});
server.stdout.on("data", (d) => process.stdout.write(String(d)));
await delay(700);

const log = createWriteStream(logFile, { flags: "w" });
const args = [
  "dist/cli.js", "verify",
  "--checks", path.join(here, "checks.json"),
  "--fix-cmd", `node "${path.join(here, "fix-with-opencode.mjs")}"`,
  "--max-attempts", "2",
  "--max-credits", process.env.MAX_CREDITS || "80",
  "--allow-fix", logRel,
  "--kane-cmd", process.env.KANE_CMD || (process.platform === "win32" ? "kane-cli.cmd" : "kane-cli"),
  "--report", reportFile,
];
log.write(`$ node ${args.join(" ")}\n\n`);

const child = spawn(process.execPath, args, {
  cwd: root,
  stdio: ["ignore", "pipe", "pipe"],
  env: { ...process.env, AGENT_TRANSCRIPT: transcriptTmp },
});
child.stdout.on("data", (d) => { process.stdout.write(d); log.write(d); });
child.stderr.on("data", (d) => { process.stderr.write(d); log.write(d); });
const code = await new Promise((resolve) => child.on("close", resolve));
log.end();

server.kill();

try {
  await copyFile(transcriptTmp, transcript);
  await rm(transcriptTmp, { force: true });
} catch {
  console.warn(`[run] no agent transcript at ${transcriptTmp}`);
}

try {
  const diff = execFileSync("git", ["diff", "--no-color", "--", "examples/inventory-filter/site"], { cwd: root, encoding: "utf8" });
  await writeFile(diffFile, diff, "utf8");
  console.log(`\n[run] agent diff written to ${path.relative(root, diffFile)}`);
} catch (e) {
  console.error(`[run] could not capture diff: ${String(e)}`);
}

console.log(`[run] bugboing exit=${code}`);
process.exit(code ?? 1);
