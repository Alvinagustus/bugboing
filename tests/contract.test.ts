import test from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtempSync, writeFileSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

const cwd = path.resolve(import.meta.dirname, "..");
const fakeKane = path.join(cwd, "tests", "fake-kane.mjs");

function run(mode: string) {
  const dir = mkdtempSync(path.join(tmpdir(), "bugboing-"));
  const checks = path.join(dir, "checks.json");
  const report = path.join(dir, "report.json");
  writeFileSync(checks, JSON.stringify([{ name: "c1", url: "http://example.test", objective: "check" }]), "utf8");
  const r = spawnSync(process.execPath, [
    "--import", "tsx", "src/cli.ts", "verify",
    "--checks", checks,
    "--max-attempts", "1",
    "--report", report,
    "--kane-cmd", `node "${fakeKane}"`,
  ], {
    cwd,
    encoding: "utf8",
    env: { ...process.env, FAKE_KANE_MODE: mode },
  });
  const reportObj = JSON.parse(readFileSync(report, "utf8"));
  return { r, reportObj };
}

test("strict contract: run_end passed => green", () => {
  const { r, reportObj } = run("pass");
  assert.equal(r.status, 0);
  assert.equal(reportObj.passed, true);
  assert.equal(reportObj.checks[0].kaneVerified, true);
  assert.equal(reportObj.checks[0].verificationSource, "kane_run_end");
});

test("strict contract: run_end failed => red", () => {
  const { r, reportObj } = run("fail");
  assert.equal(r.status, 1);
  assert.equal(reportObj.passed, false);
  assert.equal(reportObj.checks[0].status, "failed");
  assert.equal(reportObj.checks[0].verificationSource, "kane_run_end");
});

test("strict contract: exit 0 without run_end is NOT green", () => {
  const { r, reportObj } = run("no_run_end_exit0");
  assert.equal(r.status, 1);
  assert.equal(reportObj.passed, false);
  assert.equal(reportObj.checks[0].kaneVerified, false);
  assert.equal(reportObj.checks[0].verificationSource, "none");
  assert.equal(reportObj.checks[0].reason, "missing_kane_run_end");
});

test("strict contract: exit 1 without run_end is unverified", () => {
  const { r, reportObj } = run("no_run_end_exit1");
  assert.equal(r.status, 1);
  assert.equal(reportObj.passed, false);
  assert.equal(reportObj.checks[0].status, "unverified");
  assert.equal(reportObj.checks[0].reason, "missing_kane_run_end");
});
