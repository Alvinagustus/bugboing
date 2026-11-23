import { spawn } from "node:child_process";
import { setTimeout as delay } from "node:timers/promises";
import { writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, "..");

const buggyHtml = `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>BugBoing Demo</title>
  </head>
  <body>
    <main>
      <h1>BugBoing Demoo</h1>
      <p id="status">Verification target for BugBoing.</p>
    </main>
  </body>
</html>
`;

await writeFile(path.join(__dirname, "index.html"), buggyHtml, "utf8");
console.log("[demo] reset demo/index.html to buggy state");

const server = spawn(process.execPath, ["demo/serve.mjs"], {
  cwd: root,
  stdio: "inherit",
  shell: false,
});

await delay(1000);

const args = [
  "--import", "tsx", "src/cli.ts", "verify",
  "--checks", "demo/checks.json",
  "--fix-cmd", "node demo/fix.mjs",
  "--max-attempts", "2",
  "--kane-cmd", process.env.KANE_CMD || (process.platform === "win32" ? "kane-cli.cmd" : "kane-cli"),
  "--report", "demo/report.json",
];

const child = spawn(process.execPath, args, {
  cwd: root,
  stdio: "inherit",
  shell: false,
  env: process.env,
});

const code = await new Promise((resolve) => child.on("close", resolve));
server.kill();
process.exit(code ?? 1);
