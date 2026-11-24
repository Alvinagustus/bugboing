#!/usr/bin/env node
import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { runCmd, splitCommandLine } from "./proc.js";

type Check = {
  name: string;
  url: string;
  objective: string;
  timeoutSeconds?: number;
  maxSteps?: number;
};

type RunEnd = {
  type?: string;
  status?: string;
  summary?: string;
  one_liner?: string;
  reason?: string;
  result_code?: number | string;
  reason_code?: string;
  test_url?: string;
  session_dir?: string;
  run_dir?: string;
  final_state?: Record<string, unknown>;
  credits_consumed?: number;
  per_flow_metadata?: unknown[];
  [k: string]: unknown;
};

type Trust = "kane_verified_pass" | "kane_verified_fail" | "unverified_missing_run_end";

type CheckResult = {
  name: string;
  objective: string;
  url: string;
  attempt: number;
  passed: boolean;
  kaneVerified: boolean;
  verificationSource: "kane_run_end" | "none";
  trust: Trust;
  trustReason: string;
  status: string;
  reason: string;
  resultCode?: number | string;
  reasonCode?: string;
  testUrl?: string;
  sessionDir?: string;
  summary?: string;
  oneLiner?: string;
  creditsConsumed?: number;
  rawRunEnd?: RunEnd;
  stdoutTail: string;
  stderrTail: string;
  exitCode: number | null;
  fixCmd?: string;
  fixExitCode?: number | null;
  fixStdoutTail?: string;
  fixStderrTail?: string;
  attemptHistory?: CheckResult[];
};

type Report = {
  tool: "bugboing";
  version: "0.2.0";
  contract: {
    rule: "no_kane_pass_no_green";
    version: 1;
    enforced: true;
    description: "A check is green only when Kane CLI emits run_end with status=passed. Fixer exit codes and missing run_end are never trusted as proof.";
  };
  startedAt: string;
  finishedAt: string;
  passed: boolean;
  checks: CheckResult[];
};

function usage(): string {
  return `BugBoing - fail -> Kane evidence -> agent fix -> rerun

Usage:
  bugboing verify --checks <checks.json> [--fix-cmd <cmd>] [--max-attempts <n>] [--report <file>] [--kane-cmd <cmd>]

Options:
  --checks <file>       JSON file: [{"name","url","objective"}]
  --fix-cmd <cmd>       Command run on failure. Receives failure payload JSON on stdin.
  --max-attempts <n>    Attempts per check including first run (default: 2)
  --report <file>       Write JSON report to file
  --kane-cmd <cmd>      Kane CLI command (default: kane-cli.cmd on Windows, kane-cli otherwise)
  --kane-timeout <s>    Hard kill deadline for the Kane command (default: check timeout + 60s)
  --help                Show help
`;
}

function parseArgs(argv: string[]): Record<string, string | boolean> {
  const out: Record<string, string | boolean> = {};
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (!a.startsWith("--")) {
      if (!out._cmd) out._cmd = a;
      continue;
    }
    const key = a.slice(2);
    const next = argv[i + 1];
    if (!next || next.startsWith("--")) out[key] = true;
    else { out[key] = next; i++; }
  }
  return out;
}

function tail(s: string, max = 4000): string {
  if (s.length <= max) return s;
  return s.slice(s.length - max);
}

function extractRunEnd(stdout: string): RunEnd | undefined {
  const lines = stdout.split(/\r?\n/);
  let found: RunEnd | undefined;
  for (const line of lines) {
    const t = line.trim();
    if (!t.startsWith("{") || !t.endsWith("}")) continue;
    try {
      const obj = JSON.parse(t) as RunEnd;
      if (obj.type === "run_end") {
        found = obj;
      }
    } catch {}
  }
  return found;
}

function evaluateRunEnd(runEnd: RunEnd | undefined): {
  passed: boolean;
  kaneVerified: boolean;
  verificationSource: "kane_run_end" | "none";
  trust: Trust;
  trustReason: string;
  status: string;
  reason: string;
} {
  if (!runEnd) {
    return {
      passed: false,
      kaneVerified: false,
      verificationSource: "none",
      trust: "unverified_missing_run_end",
      trustReason: "Kane did not emit a run_end verdict; BugBoing refuses to treat this as green.",
      status: "unverified",
      reason: "missing_kane_run_end",
    };
  }
  const status = String(runEnd.status ?? "unknown").toLowerCase();
  const passed = status === "passed";
  return {
    passed,
    kaneVerified: passed,
    verificationSource: "kane_run_end",
    trust: passed ? "kane_verified_pass" : "kane_verified_fail",
    trustReason: passed
      ? "Kane run_end reported status=passed."
      : `Kane run_end reported status=${status}; BugBoing treats this as not green.`,
    status,
    reason: String(runEnd.reason ?? runEnd.reason_code ?? (passed ? "ok" : "unknown")),
  };
}

async function loadChecks(file: string): Promise<Check[]> {
  const raw = await readFile(file, "utf8");
  const data = JSON.parse(raw);
  if (!Array.isArray(data)) throw new Error("checks file must be a JSON array");
  return data.map((c, i) => {
    if (!c || typeof c !== "object") throw new Error(`check ${i} must be object`);
    const name = String((c as any).name ?? `check-${i + 1}`);
    const url = String((c as any).url ?? "");
    const objective = String((c as any).objective ?? "");
    if (!url || !objective) throw new Error(`check ${name}: url and objective required`);
    return { name, url, objective, timeoutSeconds: (c as any).timeoutSeconds, maxSteps: (c as any).maxSteps } as Check;
  });
}

async function runKaneCheck(kaneCmd: string, check: Check, hardTimeoutMs?: number): Promise<CheckResult> {
  const args = ["run", check.objective, "--url", check.url, "--headless", "--agent"];
  if (check.maxSteps) args.push("--max-steps", String(check.maxSteps));
  if (check.timeoutSeconds) args.push("--timeout", String(check.timeoutSeconds));
  const timeoutMs = hardTimeoutMs ?? ((check.timeoutSeconds ?? 180) + 60) * 1000;
  const argv = splitCommandLine(kaneCmd);
  if (argv.length === 0) throw new Error("--kane-cmd is empty");
  const { code, stdout, stderr } = await runCmd(argv[0], [...argv.slice(1), ...args], { timeoutMs });
  const runEnd = extractRunEnd(stdout);
  const verdict = evaluateRunEnd(runEnd);
  return {
    name: check.name,
    objective: check.objective,
    url: check.url,
    attempt: 1,
    ...verdict,
    resultCode: runEnd?.result_code,
    reasonCode: runEnd?.reason_code,
    testUrl: runEnd?.test_url,
    sessionDir: runEnd?.session_dir,
    summary: runEnd?.summary,
    oneLiner: runEnd?.one_liner,
    creditsConsumed: runEnd?.credits_consumed,
    rawRunEnd: runEnd,
    stdoutTail: tail(stdout),
    stderrTail: tail(stderr),
    exitCode: code,
  };
}

async function runFix(fixCmd: string, payload: unknown): Promise<{ code: number | null; stdout: string; stderr: string }> {
  const input = JSON.stringify(payload, null, 2);
  if (process.platform === "win32") {
    return await runCmd("powershell.exe", ["-NoProfile", "-Command", fixCmd], { input, timeoutMs: 10 * 60 * 1000 });
  }
  return await runCmd("bash", ["-lc", fixCmd], { input, timeoutMs: 10 * 60 * 1000 });
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (args.help || args._cmd !== "verify") {
    process.stdout.write(usage());
    process.exit(args.help ? 0 : 1);
  }
  const checksFile = String(args.checks || "");
  if (!checksFile) { console.error("--checks is required"); process.exit(2); }
  const maxAttempts = Math.max(1, Number(args["max-attempts"] || 2));
  const kaneCmd = String(args["kane-cmd"] || (process.platform === "win32" ? "kane-cli.cmd" : "kane-cli"));
  const kaneTimeoutArg = args["kane-timeout"] ? Number(args["kane-timeout"]) : NaN;
  const kaneTimeoutMs = Number.isFinite(kaneTimeoutArg) && kaneTimeoutArg > 0
    ? kaneTimeoutArg * 1000
    : undefined;
  if (args["kane-timeout"] && kaneTimeoutMs === undefined) {
    console.error("--kane-timeout must be a positive number of seconds");
    process.exit(2);
  }
  const fixCmd = args["fix-cmd"] ? String(args["fix-cmd"]) : "";
  const reportFile = args.report ? String(args.report) : "";

  const startedAt = new Date().toISOString();
  const checks = await loadChecks(path.resolve(checksFile));
  const results: CheckResult[] = [];

  console.log("[bugboing] CONTRACT: no_kane_pass_no_green");
  console.log("[bugboing] Only Kane run_end status=passed counts as green. Fixer exit 0 is never proof.");

  for (const check of checks) {
    let last: CheckResult | undefined;
    const history: CheckResult[] = [];
    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
      console.log(`\n[bugboing] check=${check.name} attempt=${attempt}/${maxAttempts}`);
      const r = await runKaneCheck(kaneCmd, check, kaneTimeoutMs);
      r.attempt = attempt;
      last = r;
      console.log(`[bugboing] trust=${r.trust} status=${r.status} reason=${r.reason} test_url=${r.testUrl ?? ""}`);
      if (r.passed) {
        console.log(`[bugboing] VERIFIED BY KANE: ${check.name}`);
        history.push(r);
        break;
      }
      if (r.verificationSource === "none") {
        console.log(`[bugboing] NOT GREEN: ${check.name} is unverified (missing Kane run_end). Fixer exit codes cannot make this green.`);
      }
      if (attempt < maxAttempts && fixCmd) {
        console.log(`[bugboing] invoking fix-cmd for ${check.name}`);
        const payload = { tool: "bugboing", contract: { rule: "no_kane_pass_no_green", version: 1 }, check, attempt, maxAttempts, result: r };
        const fix = await runFix(fixCmd, payload);
        r.fixCmd = fixCmd;
        r.fixExitCode = fix.code;
        r.fixStdoutTail = tail(fix.stdout);
        r.fixStderrTail = tail(fix.stderr);
        console.log(`[bugboing] fix-cmd exit=${fix.code} (not proof; rerunning Kane)`);
        history.push(r);
        if (fix.code !== 0) {
          console.log(`[bugboing] fix-cmd failed; stopping retries for this check`);
          break;
        }
      } else {
        history.push(r);
        if (attempt < maxAttempts && !fixCmd) console.log(`[bugboing] no --fix-cmd provided; not retrying`);
        break;
      }
    }
    if (last) {
      const prev = history.filter((a) => a !== last);
      if (prev.length > 0) last.attemptHistory = prev;
      results.push(last);
    }
  }

  const passed = results.every((r) => r.passed);
  const report: Report = {
    tool: "bugboing",
    version: "0.2.0",
    contract: {
      rule: "no_kane_pass_no_green",
      version: 1,
      enforced: true,
      description: "A check is green only when Kane CLI emits run_end with status=passed. Fixer exit codes and missing run_end are never trusted as proof.",
    },
    startedAt,
    finishedAt: new Date().toISOString(),
    passed,
    checks: results,
  };
  const reportJson = JSON.stringify(report, null, 2);
  if (reportFile) await writeFile(path.resolve(reportFile), reportJson, "utf8");
  console.log(`\n[bugboing] CONTRACT no_kane_pass_no_green: ${report.contract.description}`);
  console.log(`[bugboing] RESULT ${passed ? "VERIFIED_PASS" : "NOT_GREEN"}`);
  for (const r of results) {
    console.log(`[bugboing]   - ${r.name}: ${r.trust} (${r.trustReason})`);
  }
  console.log(reportJson);
  process.exit(passed ? 0 : 1);
}

main().catch((e) => {
  console.error(`[bugboing] fatal: ${e instanceof Error ? e.stack || e.message : String(e)}`);
  process.exit(2);
});
