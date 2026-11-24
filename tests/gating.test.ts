import test from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtempSync, writeFileSync, readFileSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

const cwd = path.resolve(import.meta.dirname, "..");
const fakeKane = path.join(cwd, "tests", "fake-kane.mjs");

type RunOptions = {
  fixerBody?: string;
  args?: string[];
};

function run(mode: string, opts: RunOptions = {}) {
  const dir = mkdtempSync(path.join(tmpdir(), "bugboing-gate-"));
  const checks = path.join(dir, "checks.json");
  const report = path.join(dir, "report.json");
  const fixerMarker = path.join(dir, "fixer-ran.txt");
  const fixer = path.join(dir, "fixer.mjs");
  const payloadFile = path.join(dir, "payload.json");
  const counter = path.join(dir, "counter.txt");

  writeFileSync(checks, JSON.stringify([{ name: "c1", url: "http://example.test", objective: "check" }]), "utf8");
  if (opts.fixerBody !== undefined) writeFileSync(fixer, opts.fixerBody, "utf8");

  const args = [
    "--import", "tsx", "src/cli.ts", "verify",
    "--checks", checks,
    "--max-attempts", "2",
    "--report", report,
    "--kane-cmd", `node "${fakeKane}"`,
  ];
  if (opts.fixerBody !== undefined) args.push("--fix-cmd", `node "${fixer}"`);
  args.push(...(opts.args ?? []));

  const r = spawnSync(process.execPath, args, {
    cwd,
    encoding: "utf8",
    env: {
      ...process.env,
      FAKE_KANE_MODE: mode,
      FAKE_KANE_COUNTER: counter,
      FIXER_MARKER: fixerMarker,
      PAYLOAD_FILE: payloadFile,
    },
  });
  const reportObj = JSON.parse(readFileSync(report, "utf8"));
  return { r, reportObj, fixerMarker, payloadFile };
}

const markerFixer = 'import fs from "node:fs"; fs.writeFileSync(process.env.FIXER_MARKER, "ran"); process.exit(0);';

test("gating: confirmed application issue invokes the fixer, then Kane decides", () => {
  const { r, reportObj, fixerMarker } = run("fail_then_pass", { fixerBody: markerFixer });
  assert.equal(r.status, 0, r.stderr + "\n" + r.stdout);
  assert.ok(existsSync(fixerMarker), "fixer should run for a confirmed app issue");
  assert.equal(reportObj.checks[0].passed, true);
  assert.equal(reportObj.checks[0].attemptHistory[0].fixDecision.invoked, true);
  assert.equal(reportObj.checks[0].attemptHistory[0].trust, "kane_verified_fail");
  assert.equal(reportObj.checks[0].trust, "kane_verified_pass");
});

test("gating: unconfirmed verdict is refused without running the fixer", () => {
  const { r, reportObj, fixerMarker } = run("fail_not_confirmed", { fixerBody: markerFixer });
  assert.equal(r.status, 1);
  assert.equal(existsSync(fixerMarker), false);
  assert.equal(reportObj.passed, false);
  assert.equal(reportObj.checks[0].fixDecision.invoked, false);
  assert.equal(reportObj.checks[0].fixDecision.skipCode, "not_confirmed");
});

test("gating: non-application family is refused without running the fixer", () => {
  const { r, reportObj, fixerMarker } = run("fail_environment", { fixerBody: markerFixer });
  assert.equal(r.status, 1);
  assert.equal(existsSync(fixerMarker), false);
  assert.equal(reportObj.checks[0].fixDecision.skipCode, "not_application_issue");
});

test("gating: Kane failure without a verdict is refused", () => {
  const { r, reportObj, fixerMarker } = run("fail_no_verdict", { fixerBody: markerFixer });
  assert.equal(r.status, 1);
  assert.equal(existsSync(fixerMarker), false);
  assert.equal(reportObj.checks[0].fixDecision.skipCode, "verdict_missing");
});

test("gating: missing run_end never invokes the fixer", () => {
  const { r, reportObj, fixerMarker } = run("no_run_end_exit0", { fixerBody: markerFixer });
  assert.equal(r.status, 2);
  assert.equal(existsSync(fixerMarker), false);
  assert.equal(reportObj.checks[0].fixDecision.skipCode, "unverified");
  assert.equal(reportObj.checks[0].trust, "unverified_missing_run_end");
});

test("gating: --max-credits stops before the fixer and rerun", () => {
  const { r, reportObj, fixerMarker } = run("fail_credits", {
    fixerBody: markerFixer,
    args: ["--max-credits", "5"],
  });
  assert.equal(r.status, 1);
  assert.equal(existsSync(fixerMarker), false);
  assert.equal(reportObj.credits.consumed, 12);
  assert.equal(reportObj.credits.limit, 5);
  assert.equal(reportObj.credits.exhausted, true);
  assert.equal(reportObj.checks[0].fixDecision.skipCode, "credit_budget");
});

test("gating: fixer payload carries the repair packet and scope", () => {
  const dumpFixer = [
    'import fs from "node:fs";',
    'let s = "";',
    'process.stdin.setEncoding("utf8");',
    "for await (const c of process.stdin) s += c;",
    "fs.writeFileSync(process.env.PAYLOAD_FILE, s);",
    "process.exit(1);",
  ].join("\n");

  const { r, reportObj, payloadFile } = run("fail_then_pass", {
    fixerBody: dumpFixer,
    args: ["--allow-fix", "demo/**"],
  });

  assert.equal(r.status, 1);
  const payload = JSON.parse(readFileSync(payloadFile, "utf8"));
  assert.deepEqual(payload.scope.allowed, ["demo/**"]);
  assert.equal(payload.result.verdict.confirmed, true);
  assert.equal(payload.result.verdict.family, "application_issue");
  assert.equal(payload.repair.suggestion, "Fix the heading text and rerun the check.");
  assert.equal(payload.repair.culpritStep, "0-3");
  assert.equal(payload.result.fixDecision, undefined);
  assert.equal(reportObj.checks[0].fixExitCode, 1);
});
