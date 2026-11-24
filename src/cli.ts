#!/usr/bin/env node
import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { runCmd, splitCommandLine } from "./proc.js";
import { enforceScope, takeScopeSnapshot, toPosixPath, type ScopeMode } from "./scope.js";

type Check = {
  name: string;
  url: string;
  objective: string;
  timeoutSeconds?: number;
  maxSteps?: number;
  fixPaths?: string[];
};

type KaneVerdict = {
  confirmed?: boolean;
  status?: string;
  family?: string;
  category?: string;
  severity?: string;
  confidence?: number;
  root_cause?: string;
  suggestion?: string;
  bug_title?: string;
  culprit_step?: string;
  one_liner?: string;
  [k: string]: unknown;
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
  verdict?: KaneVerdict;
  [k: string]: unknown;
};

type Trust =
  | "kane_verified_pass"
  | "kane_verified_fail"
  | "unverified_missing_run_end"
  | "unverified_budget_exhausted";

type SkipCode =
  | "unverified"
  | "verdict_missing"
  | "not_confirmed"
  | "not_application_issue"
  | "no_fix_cmd"
  | "max_attempts"
  | "credit_budget"
  | "scope_error";

type RepairPacket = {
  suggestion?: string;
  culpritStep?: string;
  rootCause?: string;
  bugTitle?: string;
  category?: string;
  severity?: string;
};

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
  verdict?: KaneVerdict;
  repair?: RepairPacket;
  fixDecision?: {
    invoked: boolean;
    reason: string;
    skipCode?: SkipCode;
  };
  scope?: {
    enforced: boolean;
    allowed: string[];
    violations: Array<{ path: string; kind: string; action: string }>;
  };
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
  version: "0.3.0";
  contract: {
    rule: "no_kane_pass_no_green";
    version: 1;
    enforced: true;
    description: "A check is green only when Kane CLI emits run_end with status=passed. Fixer exit codes and missing run_end are never trusted as proof.";
  };
  startedAt: string;
  finishedAt: string;
  passed: boolean;
  credits: {
    consumed: number;
    limit: number | null;
    exhausted: boolean;
  };
  checks: CheckResult[];
};

function usage(): string {
  return `BugBoing - fail -> Kane evidence -> agent fix -> rerun

Usage:
  bugboing verify --checks <checks.json> [--fix-cmd <cmd>] [--max-attempts <n>] [--report <file>] [--kane-cmd <cmd>]

Options:
  --checks <file>       JSON file: [{"name","url","objective","fixPaths"?}]
  --fix-cmd <cmd>       Command run on failure. Receives failure payload JSON on stdin.
  --max-attempts <n>    Attempts per check including first run (default: 2)
  --report <file>       Write JSON report to file
  --kane-cmd <cmd>      Kane CLI command (default: kane-cli.cmd on Windows, kane-cli otherwise)
  --kane-timeout <s>    Hard kill deadline for the Kane command (default: check timeout + 60s)
  --max-credits <n>     Stop before the next Kane run once this many credits are spent
  --allow-fix <globs>   Comma-separated paths the fixer may change (default: checks file directory)
  --scope-guard <mode>  off | warn | revert out-of-scope fixer edits (default: revert)
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
    const fixPathsRaw = (c as any).fixPaths;
    const fixPaths = Array.isArray(fixPathsRaw)
      ? fixPathsRaw.map((p: unknown) => String(p)).filter(Boolean)
      : undefined;
    return {
      name,
      url,
      objective,
      timeoutSeconds: (c as any).timeoutSeconds,
      maxSteps: (c as any).maxSteps,
      fixPaths,
    } as Check;
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
  const kaneVerdict =
    runEnd?.verdict && typeof runEnd.verdict === "object" && !Array.isArray(runEnd.verdict)
      ? (runEnd.verdict as KaneVerdict)
      : undefined;
  const repair: RepairPacket | undefined = kaneVerdict
    ? {
        suggestion: kaneVerdict.suggestion,
        culpritStep: kaneVerdict.culprit_step,
        rootCause: kaneVerdict.root_cause,
        bugTitle: kaneVerdict.bug_title,
        category: kaneVerdict.category,
        severity: kaneVerdict.severity,
      }
    : undefined;
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
    verdict: kaneVerdict,
    repair,
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

function classifyFailure(r: CheckResult): { invoke: boolean; skipCode?: SkipCode; reason: string } {
  if (r.verificationSource === "none") {
    return {
      invoke: false,
      skipCode: "unverified",
      reason: "No Kane run_end verdict; refusing to run a fixer on unverified output.",
    };
  }
  const v = r.verdict;
  if (!v) {
    return {
      invoke: false,
      skipCode: "verdict_missing",
      reason: "Kane run_end has no verdict object; refusing to guess whether this is an app bug.",
    };
  }
  if (v.confirmed !== true) {
    return {
      invoke: false,
      skipCode: "not_confirmed",
      reason: `Kane verdict is not confirmed (confidence=${v.confidence ?? "n/a"}); refusing to auto-fix.`,
    };
  }
  const family = String(v.family ?? "");
  if (family !== "application_issue") {
    return {
      invoke: false,
      skipCode: "not_application_issue",
      reason: `Kane verdict family=${family || "unknown"}; not an application defect.`,
    };
  }
  return { invoke: true, reason: "Kane confirmed an application issue." };
}

function allowedPathsFor(check: Check, checksRel: string, cliAllow: string[]): string[] {
  const explicit = [...cliAllow, ...(check.fixPaths ?? [])];
  if (explicit.length > 0) return explicit;
  const dir = path.posix.dirname(checksRel);
  // A checks file next to the workspace root (or outside it) carries no useful
  // directory signal, so fall back to the whole workspace. Use --allow-fix or
  // check.fixPaths for a narrow contract.
  if (!dir || dir === "." || dir.startsWith("..")) return ["**"];
  return [`${dir}/**`];
}

function budgetExhaustedResult(check: Check): CheckResult {
  return {
    name: check.name,
    objective: check.objective,
    url: check.url,
    attempt: 0,
    passed: false,
    kaneVerified: false,
    verificationSource: "none",
    trust: "unverified_budget_exhausted",
    trustReason: "Kane credit budget was exhausted before this check ran.",
    status: "unverified",
    reason: "credit_budget_exhausted",
    stdoutTail: "",
    stderrTail: "",
    exitCode: null,
    fixDecision: {
      invoked: false,
      reason: "Kane credit budget exhausted; not running this check.",
      skipCode: "credit_budget",
    },
  };
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
  const maxCreditsArg = args["max-credits"] ? Number(args["max-credits"]) : NaN;
  const maxCredits = Number.isFinite(maxCreditsArg) && maxCreditsArg > 0 ? maxCreditsArg : undefined;
  if (args["max-credits"] && maxCredits === undefined) {
    console.error("--max-credits must be a positive number");
    process.exit(2);
  }
  const scopeModeRaw = String(args["scope-guard"] || "revert").toLowerCase();
  if (!["off", "warn", "revert"].includes(scopeModeRaw)) {
    console.error("--scope-guard must be off, warn, or revert");
    process.exit(2);
  }
  const scopeMode = scopeModeRaw as ScopeMode;
  const cliAllow = String(args["allow-fix"] || "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);

  const startedAt = new Date().toISOString();
  const checksAbs = path.resolve(checksFile);
  const checks = await loadChecks(checksAbs);
  const checksRel = toPosixPath(path.relative(process.cwd(), checksAbs));
  const results: CheckResult[] = [];
  let totalCredits = 0;
  let budgetExhausted = false;

  console.log("[bugboing] CONTRACT: no_kane_pass_no_green");
  console.log("[bugboing] Only Kane run_end status=passed counts as green. Fixer exit 0 is never proof.");
  console.log(`[bugboing] fix gate: verdict.confirmed && family=application_issue; scope-guard=${scopeMode}`);

  for (const check of checks) {
    if (maxCredits !== undefined && totalCredits >= maxCredits) {
      budgetExhausted = true;
      results.push(budgetExhaustedResult(check));
      console.log(`[bugboing] budget exhausted (${totalCredits}/${maxCredits}); skipping ${check.name}`);
      continue;
    }

    const allowed = allowedPathsFor(check, checksRel, cliAllow);
    if (scopeMode !== "off" && allowed.includes("**")) {
      console.log(
        "[bugboing] scope guard: whole-workspace allowance; pass --allow-fix or check.fixPaths to narrow it",
      );
    }
    let last: CheckResult | undefined;
    const history: CheckResult[] = [];

    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
      console.log(`\n[bugboing] check=${check.name} attempt=${attempt}/${maxAttempts}`);
      const r = await runKaneCheck(kaneCmd, check, kaneTimeoutMs);
      r.attempt = attempt;
      last = r;
      history.push(r);

      const spent = Number(r.creditsConsumed);
      if (Number.isFinite(spent)) totalCredits += spent;

      console.log(`[bugboing] trust=${r.trust} status=${r.status} reason=${r.reason} test_url=${r.testUrl ?? ""}`);
      if (r.passed) {
        console.log(`[bugboing] VERIFIED BY KANE: ${check.name}`);
        break;
      }

      const cls = classifyFailure(r);
      if (!cls.invoke) {
        r.fixDecision = { invoked: false, reason: cls.reason, skipCode: cls.skipCode };
        console.log(`[bugboing] fixer skipped: ${cls.reason}`);
        break;
      }

      if (maxCredits !== undefined && totalCredits >= maxCredits) {
        budgetExhausted = true;
        r.fixDecision = {
          invoked: false,
          reason: "Kane credit budget exhausted; not invoking the fixer.",
          skipCode: "credit_budget",
        };
        console.log(`[bugboing] budget exhausted (${totalCredits}/${maxCredits}); not invoking fixer`);
        break;
      }

      if (attempt >= maxAttempts) {
        r.fixDecision = {
          invoked: false,
          reason: "No attempts left after a confirmed Kane failure.",
          skipCode: "max_attempts",
        };
        break;
      }

      if (!fixCmd) {
        r.fixDecision = { invoked: false, reason: "No --fix-cmd provided.", skipCode: "no_fix_cmd" };
        console.log("[bugboing] no --fix-cmd provided; not retrying");
        break;
      }

      let snap;
      try {
        snap = scopeMode === "off" ? undefined : await takeScopeSnapshot(process.cwd());
      } catch (e) {
        r.fixDecision = {
          invoked: false,
          reason: `Scope snapshot failed: ${String(e)}`,
          skipCode: "scope_error",
        };
        console.log(`[bugboing] scope guard failed; not invoking fixer: ${String(e)}`);
        break;
      }

      console.log(`[bugboing] invoking fix-cmd for ${check.name} (allowed: ${allowed.join(", ") || "none"})`);
      const payload = {
        tool: "bugboing",
        contract: { rule: "no_kane_pass_no_green", version: 1 },
        check,
        attempt,
        maxAttempts,
        scope: { allowed, checksFile: checksRel },
        repair: r.repair ?? null,
        result: r,
      };
      const fix = await runFix(fixCmd, payload);
      r.fixCmd = fixCmd;
      r.fixExitCode = fix.code;
      r.fixStdoutTail = tail(fix.stdout);
      r.fixStderrTail = tail(fix.stderr);
      r.fixDecision = { invoked: true, reason: cls.reason };
      console.log(`[bugboing] fix-cmd exit=${fix.code} (not proof; rerunning Kane)`);

      if (snap) {
        try {
          const scope = await enforceScope(
            snap,
            allowed,
            [checksRel],
            scopeMode === "warn" ? "warn" : "revert",
          );
          r.scope = scope;
          if (scope.violations.length > 0) {
            console.log(
              `[bugboing] scope: ${scope.violations.length} out-of-scope change(s) ${scopeMode === "warn" ? "detected" : "reverted"}`,
            );
            for (const v of scope.violations) console.log(`[bugboing]   - ${v.kind} ${v.path} -> ${v.action}`);
          } else {
            console.log("[bugboing] scope: clean");
          }
        } catch (e) {
          console.log(`[bugboing] scope enforcement failed: ${String(e)}`);
        }
      }

      if (fix.code !== 0) {
        console.log("[bugboing] fix-cmd failed; stopping retries for this check");
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
  // 0 = verified green, 2 = BugBoing could not obtain a Kane verdict, 1 = a
  // Kane-verified failure (red). Auto-fix gating never changes that ranking.
  const blocked = results.some((r) => !r.passed && r.verificationSource === "none");
  const exitCode = passed ? 0 : blocked ? 2 : 1;

  const report: Report = {
    tool: "bugboing",
    version: "0.3.0",
    contract: {
      rule: "no_kane_pass_no_green",
      version: 1,
      enforced: true,
      description:
        "A check is green only when Kane CLI emits run_end with status=passed. Fixer exit codes and missing run_end are never trusted as proof.",
    },
    startedAt,
    finishedAt: new Date().toISOString(),
    passed,
    credits: {
      consumed: Number(totalCredits.toFixed(5)),
      limit: maxCredits ?? null,
      exhausted: budgetExhausted,
    },
    checks: results,
  };
  const reportJson = JSON.stringify(report, null, 2);
  if (reportFile) await writeFile(path.resolve(reportFile), reportJson, "utf8");
  console.log(`\n[bugboing] CONTRACT no_kane_pass_no_green: ${report.contract.description}`);
  console.log(`[bugboing] RESULT ${passed ? "VERIFIED_PASS" : "NOT_GREEN"}`);
  console.log(
    `[bugboing] credits: consumed=${report.credits.consumed} limit=${report.credits.limit ?? "none"} exhausted=${report.credits.exhausted}`,
  );
  for (const r of results) {
    console.log(`[bugboing]   - ${r.name}: ${r.trust} (${r.trustReason})`);
    if (r.fixDecision) {
      console.log(`[bugboing]     fix: invoked=${r.fixDecision.invoked} reason=${r.fixDecision.reason}`);
    }
  }
  console.log(reportJson);
  process.exit(exitCode);
}

main().catch((e) => {
  console.error(`[bugboing] fatal: ${e instanceof Error ? e.stack || e.message : String(e)}`);
  process.exit(2);
});
