import { spawn } from "node:child_process";
import process from "node:process";

// Ignore polite termination signals: only SIGKILL / a process-tree kill stops us.
process.on("SIGTERM", () => {});
process.on("SIGINT", () => {});

// A grandchild that also ignores TERM and inherits stdout/stderr, like a browser
// or agent subprocess holding the pipe open. This is what used to deadlock the
// runner after the shell wrapper was killed.
spawn(process.execPath, ["-e", "process.on('SIGTERM',()=>{});setInterval(()=>{},1000)"], {
  stdio: "inherit",
});

console.log(JSON.stringify({ type: "step", status: "running" }));
setInterval(() => {}, 1000);
