import test from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { enforceScope, globToRegExp, takeScopeSnapshot } from "../src/scope.ts";

const repoRoot = path.resolve(import.meta.dirname, "..");
const fakeKane = path.join(repoRoot, "tests", "fake-kane.mjs");
const tsxLoader = pathToFileURL(path.join(repoRoot, "node_modules", "tsx", "dist", "loader.mjs")).href;

function makeProject() {
  const dir = mkdtempSync(path.join(tmpdir(), "bugboing-scope-"));
  mkdirSync(path.join(dir, "site"), { recursive: true });
  writeFileSync(path.join(dir, "site", "checks.json"), JSON.stringify([{ name: "c1", url: "http://example.test", objective: "check" }]), "utf8");
  writeFileSync(path.join(dir, "site", "app.js"), "export const heading = \"BugBoing Demoo\";\n", "utf8");
  writeFileSync(path.join(dir, "README.md"), "# fixture\n", "utf8");
  return dir;
}

test("glob: directory globs stay inside their directory", () => {
  const site = globToRegExp("site/**");
  assert.equal(site.test("site/app.js"), true);
  assert.equal(site.test("site/nested/app.js"), true);
  assert.equal(site.test("other.txt"), false);

  const js = globToRegExp("**/*.js");
  assert.equal(js.test("app.js"), true);
  assert.equal(js.test("deep/dir/app.js"), true);
  assert.equal(js.test("deep/dir/app.ts"), false);

  const bare = globToRegExp("site");
  assert.equal(bare.test("site/app.js"), true);
  assert.equal(bare.test("site-other/app.js"), false);
});

test("scope: allowed edits survive, out-of-scope edits are restored or deleted", async () => {
  const dir = makeProject();
  const snap = await takeScopeSnapshot(dir);

  writeFileSync(path.join(dir, "site", "app.js"), "export const heading = \"BugBoing Demo\";\n", "utf8");
  writeFileSync(path.join(dir, "outside.txt"), "sneaky\n", "utf8");
  writeFileSync(path.join(dir, "README.md"), "# hacked\n", "utf8");
  rmSync(path.join(dir, "site", "checks.json"));

  const result = await enforceScope(snap, ["site/**"], ["site/checks.json"], "revert");

  assert.equal(result.enforced, true);
  assert.equal(readFileSync(path.join(dir, "site", "app.js"), "utf8").includes("BugBoing Demo"), true);
  assert.equal(existsSync(path.join(dir, "outside.txt")), false, "created file is deleted");
  assert.equal(readFileSync(path.join(dir, "README.md"), "utf8"), "# fixture\n", "modified file is restored");
  assert.equal(existsSync(path.join(dir, "site", "checks.json")), true, "checks file is restored even inside the allowed dir");

  const kinds = result.violations.map((v) => `${v.kind}:${v.path}:${v.action}`).sort();
  assert.deepEqual(kinds, [
    "created:outside.txt:deleted",
    "deleted:site/checks.json:restored",
    "modified:README.md:restored",
  ]);
  rmSync(dir, { recursive: true, force: true });
});

test("scope: warn keeps ordinary edits but restores protected files", async () => {
  const dir = makeProject();
  const snap = await takeScopeSnapshot(dir);
  writeFileSync(path.join(dir, "outside.txt"), "kept\n", "utf8");
  writeFileSync(path.join(dir, "README.md"), "# edited\n", "utf8");
  rmSync(path.join(dir, "site", "checks.json"));

  const result = await enforceScope(snap, ["site/**"], ["site/checks.json"], "warn");
  assert.equal(existsSync(path.join(dir, "outside.txt")), true);
  assert.equal(readFileSync(path.join(dir, "README.md"), "utf8"), "# edited\n");
  assert.equal(existsSync(path.join(dir, "site", "checks.json")), true, "protected file is restored in warn mode");
  assert.deepEqual(result.violations.map((v) => `${v.kind}:${v.path}:${v.action}`).sort(), [
    "created:outside.txt:kept",
    "deleted:site/checks.json:restored",
    "modified:README.md:kept",
  ]);
  rmSync(dir, { recursive: true, force: true });
});

function runCli(project: string, extraArgs: string[] = []) {
  const fixer = path.join(project, "fixer.mjs");
  writeFileSync(fixer, [
    'import fs from "node:fs";',
    "const payload = fs.readFileSync(0, \"utf8\");",
    "fs.writeFileSync(\"payload-seen.json\", payload);",
    "fs.appendFileSync(\"site/app.js\", \"// fixed by the agent\\n\");",
    "fs.writeFileSync(\"outside.txt\", \"out of scope\\n\");",
    "fs.writeFileSync(\"site/checks.json\", \"{}\\n\");",
    "process.exit(0);",
  ].join("\n"), "utf8");

  return spawnSync(process.execPath, [
    "--import", tsxLoader, path.join(repoRoot, "src", "cli.ts"), "verify",
    "--checks", path.join(project, "site", "checks.json"),
    "--max-attempts", "2",
    "--report", path.join(project, "report.json"),
    "--kane-cmd", `node "${fakeKane}"`,
    "--fix-cmd", `node "${fixer}"`,
    ...extraArgs,
  ], {
    cwd: project,
    encoding: "utf8",
    env: {
      ...process.env,
      FAKE_KANE_MODE: "fail_then_pass",
      FAKE_KANE_COUNTER: path.join(project, "counter.txt"),
    },
  });
}

test("CLI: out-of-scope fixer edits are reverted before the Kane rerun", () => {
  const dir = makeProject();
  const r = runCli(dir);
  assert.equal(r.status, 0, r.stderr + "\n" + r.stdout);

  assert.equal(readFileSync(path.join(dir, "site", "app.js"), "utf8").includes("fixed by the agent"), true);
  assert.equal(existsSync(path.join(dir, "outside.txt")), false);
  assert.equal(readFileSync(path.join(dir, "site", "checks.json"), "utf8").includes("objective"), true);

  const report = JSON.parse(readFileSync(path.join(dir, "report.json"), "utf8"));
  const first = report.checks[0].attemptHistory[0];
  assert.equal(first.scope.enforced, true);
  assert.deepEqual(first.scope.allowed, ["site/**"]);
  const paths = first.scope.violations.map((v: { path: string }) => v.path).sort();
  assert.deepEqual(paths, ["outside.txt", "payload-seen.json", "site/checks.json"]);
  assert.equal(report.passed, true);
  rmSync(dir, { recursive: true, force: true });
});

test("CLI: --scope-guard warn keeps out-of-scope edits but still restores checks.json", () => {
  const dir = makeProject();
  const r = runCli(dir, ["--scope-guard", "warn"]);
  assert.equal(r.status, 0, r.stderr + "\n" + r.stdout);

  assert.equal(existsSync(path.join(dir, "outside.txt")), true);
  assert.equal(readFileSync(path.join(dir, "site", "checks.json"), "utf8").includes("objective"), true);
  const report = JSON.parse(readFileSync(path.join(dir, "report.json"), "utf8"));
  const first = report.checks[0].attemptHistory[0];
  const byPath = Object.fromEntries(
    first.scope.violations.map((v: { path: string; action: string }) => [v.path, v.action]),
  );
  assert.deepEqual(byPath, {
    "outside.txt": "kept",
    "payload-seen.json": "kept",
    "site/checks.json": "restored",
  });
  rmSync(dir, { recursive: true, force: true });
});
