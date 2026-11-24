import test from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtempSync, writeFileSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

const cwd = path.resolve(import.meta.dirname, "..");
const hangKane = path.join(cwd, "tests", "fake-kane-hang.mjs");

test("timeout kills the whole Kane process tree instead of hanging", () => {
  const dir = mkdtempSync(path.join(tmpdir(), "bugboing-timeout-"));
  const checks = path.join(dir, "checks.json");
  const report = path.join(dir, "report.json");
  writeFileSync(checks, JSON.stringify([{ name: "c1", url: "http://example.test", objective: "check" }]), "utf8");

  const started = Date.now();
  const r = spawnSync(process.execPath, [
    "--import", "tsx", "src/cli.ts", "verify",
    "--checks", checks,
    "--max-attempts", "1",
    "--report", report,
    "--kane-cmd", `node "${hangKane}"`,
    "--kane-timeout", "1",
  ], { cwd, encoding: "utf8", timeout: 30000 });

  const elapsed = Date.now() - started;
  assert.equal(r.status, 1, r.stderr + "\n" + r.stdout);
  assert.ok(elapsed < 20000, `runner should not hang (took ${elapsed}ms)`);

  const reportObj = JSON.parse(readFileSync(report, "utf8"));
  assert.equal(reportObj.passed, false);
  assert.equal(reportObj.checks[0].status, "unverified");
  assert.equal(reportObj.checks[0].trust, "unverified_missing_run_end");
  assert.match(reportObj.checks[0].stderrTail, /\[timeout\]/);
});
