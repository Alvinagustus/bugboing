import fs from "node:fs";
import process from "node:process";

const mode = process.env.FAKE_KANE_MODE || "pass";
if (process.env.FAKE_KANE_MARKER) {
  try { fs.writeFileSync(process.env.FAKE_KANE_MARKER, mode, "utf8"); } catch {}
}

function nextCount() {
  const f = process.env.FAKE_KANE_COUNTER;
  if (!f) return 1;
  let n = 0;
  try { n = Number(fs.readFileSync(f, "utf8") || "0"); } catch {}
  n += 1;
  try { fs.writeFileSync(f, String(n), "utf8"); } catch {}
  return n;
}

const appVerdict = {
  confirmed: true,
  status: "failed",
  family: "application_issue",
  category: "ui_data_defect",
  severity: "minor",
  confidence: 0.99,
  root_cause: "heading text mismatch",
  suggestion: "Fix the heading text and rerun the check.",
  bug_title: "Heading mismatch",
  culprit_step: "0-3",
  one_liner: "heading mismatch",
};

function failed(extra = {}) {
  return {
    type: "run_end",
    status: "failed",
    result_code: 740,
    reason: "assertion_error.confirmed_product_bug",
    reason_code: "assertion_error.confirmed_product_bug",
    test_url: "https://example.test/run/fail",
    session_dir: "/tmp/fail",
    ...extra,
  };
}

function passed(extra = {}) {
  return {
    type: "run_end",
    status: "passed",
    result_code: 100,
    reason: "success.complete",
    reason_code: "success.complete",
    test_url: "https://example.test/run/pass",
    session_dir: "/tmp/pass",
    ...extra,
  };
}

const events = [];
if (mode === "pass") {
  events.push(passed());
} else if (mode === "fail") {
  // Kane-verified failure with a confirmed application verdict.
  events.push(failed({ verdict: appVerdict }));
} else if (mode === "fail_then_pass") {
  const n = nextCount();
  events.push(n <= 1 ? failed({ verdict: appVerdict }) : passed());
} else if (mode === "fail_not_confirmed") {
  events.push(failed({ verdict: { ...appVerdict, confirmed: false, confidence: 0.2 } }));
} else if (mode === "fail_environment") {
  events.push(failed({ verdict: { ...appVerdict, family: "environment_issue" } }));
} else if (mode === "fail_no_verdict") {
  events.push(failed());
} else if (mode === "fail_credits") {
  events.push(failed({ verdict: appVerdict, credits_consumed: 12 }));
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
if (mode === "fail_then_pass") {
  const last = events[events.length - 1];
  process.exit(last && last.status === "passed" ? 0 : 1);
}
if (mode.startsWith("fail")) process.exit(1);
