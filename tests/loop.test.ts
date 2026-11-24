import test from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtempSync, writeFileSync, readFileSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

const cwd = path.resolve(import.meta.dirname, "..");
const fakeKane = path.join(cwd, "tests", "fake-kane.mjs");

test("loop: fixer runs, Kane reruns, green only after Kane run_end pass", () => {
  const dir = mkdtempSync(path.join(tmpdir(), "bugboing-loop-"));
  const checks = path.join(dir, "checks.json");
  const report = path.join(dir, "report.json");
  const counter = path.join(dir, "counter.txt");
  const fixerMarker = path.join(dir, "fixer-ran.txt");
  const fixer = path.join(dir, "fixer.mjs");

  writeFileSync(checks, JSON.stringify([{ name: "c1", url: "http://example.test", objective: "check" }]), "utf8");
  writeFileSync(fixer, [
    'import fs from "node:fs";',
    'const input = fs.readFileSync(0, "utf8");',
    'const payload = JSON.parse(input);',
    'fs.writeFileSync(process.env.FIXER_MARKER, JSON.stringify({',
    '  sawTool: payload.tool,',
    '  sawContract: payload.contract?.rule,',
    '  sawTrust: payload.result?.trust,',
    '  sawVerificationSource: payload.result?.verificationSource,',
    '}));',
    'process.exit(0);',
  ].join("\n"), "utf8");

  const r = spawnSync(process.execPath, [
    "--import", "tsx", "src/cli.ts", "verify",
    "--checks", checks,
    "--max-attempts", "2",
    "--report", report,
    "--kane-cmd", `node "${fakeKane}"`,
    "--fix-cmd", `node "${fixer}"`,
  ], {
    cwd,
    encoding: "utf8",
    env: { ...process.env, FAKE_KANE_MODE: "fail_then_pass", FAKE_KANE_COUNTER: counter, FIXER_MARKER: fixerMarker },
  });

  assert.equal(r.status, 0, r.stderr + "\n" + r.stdout);
  assert.ok(existsSync(fixerMarker), "fixer should have run");
  const fixerPayload = JSON.parse(readFileSync(fixerMarker, "utf8"));
  assert.equal(fixerPayload.sawTool, "bugboing");
  assert.equal(fixerPayload.sawContract, "no_kane_pass_no_green");
  assert.equal(fixerPayload.sawTrust, "kane_verified_fail");
  assert.equal(fixerPayload.sawVerificationSource, "kane_run_end");

  const reportObj = JSON.parse(readFileSync(report, "utf8"));
  assert.equal(reportObj.passed, true);
  assert.equal(reportObj.checks[0].attempt, 2);
  assert.equal(reportObj.checks[0].trust, "kane_verified_pass");
  assert.equal(reportObj.checks[0].kaneVerified, true);
  assert.equal(reportObj.checks[0].verificationSource, "kane_run_end");
  assert.ok(Array.isArray(reportObj.checks[0].attemptHistory));
  assert.equal(reportObj.checks[0].attemptHistory.length, 1);
  assert.equal(reportObj.checks[0].attemptHistory[0].trust, "kane_verified_fail");
  assert.equal(reportObj.checks[0].attemptHistory[0].fixExitCode, 0);

  const count = Number(readFileSync(counter, "utf8"));
  assert.equal(count, 2, "Kane should have run twice");
});
