import fs from "node:fs";
import process from "node:process";

const mode = process.env.FAKE_KANE_MODE || "pass";
if (process.env.FAKE_KANE_MARKER) {
  try { fs.writeFileSync(process.env.FAKE_KANE_MARKER, mode, "utf8"); } catch {}
}
const events = [];
if (mode === "pass") {
  events.push({ type: "run_end", status: "passed", result_code: 100, reason: "success.complete", reason_code: "success.complete", test_url: "https://example.test/run/pass", session_dir: "/tmp/pass" });
} else if (mode === "fail") {
  events.push({ type: "run_end", status: "failed", result_code: 740, reason: "assertion_error.confirmed_product_bug", reason_code: "assertion_error.confirmed_product_bug", test_url: "https://example.test/run/fail", session_dir: "/tmp/fail" });
} else if (mode === "no_run_end_exit0") {
  // Intentionally emit no run_end but exit 0 - BugBoing must NOT treat as green.
  console.log(JSON.stringify({ type: "step", status: "ok" }));
  process.exit(0);
} else if (mode === "coverage_pass_no_run_end") {
  // Non-run_end event with status passed - must NOT be accepted as a verdict.
  console.log(JSON.stringify({ type: "coverage", status: "passed", reason: "not_assurance_project" }));
  process.exit(0);
} else if (mode === "no_run_end_exit1") {
  console.error("some error");
  process.exit(1);
}
for (const e of events) console.log(JSON.stringify(e));
if (mode === "pass") process.exit(0);
if (mode === "fail") process.exit(1);
