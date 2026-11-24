import test from "node:test";
import assert from "node:assert/strict";
import { runCmd, splitCommandLine } from "../src/proc.js";

test("splitCommandLine keeps quoted paths and empty args", () => {
  assert.deepEqual(
    splitCommandLine(`node "C:\\Program Files\\Kane\\fake-kane.mjs"`),
    ["node", "C:\\Program Files\\Kane\\fake-kane.mjs"],
  );
  assert.deepEqual(splitCommandLine(`bash -lc "echo hello world"`), ["bash", "-lc", "echo hello world"]);
  assert.deepEqual(splitCommandLine("  a   b\t c  "), ["a", "b", "c"]);
  assert.deepEqual(splitCommandLine(`tool ""`), ["tool", ""]);
  assert.deepEqual(splitCommandLine(`tool "a\\"b"`), ["tool", 'a"b']);
});

test("runCmd kills a grandchild that holds the pipes open", async () => {
  const started = Date.now();
  const r = await runCmd(process.execPath, [
    "-e",
    "process.on('SIGTERM',()=>{});require('child_process').spawn(process.execPath,['-e','process.on(\"SIGTERM\",()=>{});setInterval(()=>{},1000)'],{stdio:'inherit'});setInterval(()=>{},1000)",
  ], { timeoutMs: 300, killGraceMs: 1000 });

  assert.equal(r.timedOut, true);
  assert.notEqual(r.code, 0);
  assert.match(r.stderr, /\[timeout\]/);
  assert.ok(Date.now() - started < 5000, "must resolve after the timeout, not hang");
});
