import test from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import path from "node:path";

const cwd = path.resolve(import.meta.dirname, "..");

test("bugboing --help prints usage", () => {
  const r = spawnSync(process.execPath, ["--import", "tsx", "src/cli.ts", "--help"], {
    cwd,
    encoding: "utf8",
  });
  assert.equal(r.status, 0);
  assert.match(r.stdout, /BugBoing/);
  assert.match(r.stdout, /--checks/);
});
