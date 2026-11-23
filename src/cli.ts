#!/usr/bin/env node
import { spawn } from "node:child_process";
import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";

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

type CheckResult = {
  name: string;
  objective: string;
  url: string;
  attempt: number;
  passed: boolean;
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
};

type Report = {
  tool: "bugboing";
  version: "0.1.0";
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

function quoteWin(s: string): string {
  if (!/[\s"&()^<>|]/.test(s)) return s;
  return '"' + s.replace(/"/g, '\\"') + '"';
}

async function runCmd(cmd: string, args: string[], opts: { cwd?: string; input?: string; timeoutMs?: number } = {}): Promise<{ code: number | null; stdout: string; stderr: string }> {
  return await new Promise((resolve) => {
    const useShell = process.platform === "win32";
    const child = useShell
      ? spawn([cmd, ...args.map(quoteWin)].join(" "), {
          cwd: opts.cwd,
          shell: true,
          stdio: ["pipe", "pipe", "pipe"],
          env: process.env,
        })
      : spawn(cmd, args, {
          cwd: opts.cwd,
          stdio: ["pipe", "pipe", "pipe"],
          env: process.env,
        });
    let stdout = "";
    let stderr = "";
    let done = false;
    const finish = (code: number | null) => {
      if (done) return;
      done = true;
      resolve({ code, stdout, stderr });
    };
    child.stdout.on("data", (d) => { stdout += String(d); });
    child.stderr.on("data", (d) => { stderr += String(d); });
    child.on("error", (e) => { stderr += `\n[spawn error] ${String(e)}`; finish(2); });
    child.on("close", (code) => finish(code));
    if (opts.input != null) child.stdin.write(opts.input);
    child.stdin.end();
    if (opts.timeoutMs && opts.timeoutMs > 0) {
      setTimeout(() => {
        if (done) return;
        stderr += `\n[timeout] killed after ${opts.timeoutMs}ms`;
        try { child.kill("SIGKILL"); } catch {}
      }, opts.timeoutMs);
    }
  });
}

function extractRunEnd(stdout: string): RunEnd | undefined {
  const lines = stdout.split(/\r?\n/);
  let found: RunEnd | undefined;
  for (const line of lines) {
    const t = line.trim();
    if (!t.startsWith("{") || !t.endsWith("}")) continue;
    try {
      const obj = JSON.parse(t) as RunEnd;
      if (obj.type === "run_end" || (obj.status && ("result_code" in obj || "reason_code" in obj || "reason" in obj))) {
        found = obj;
      }
    } catch {}
  }
  return found;
}

function isPass(runEnd: RunEnd | undefined, exitCode: number | null): boolean {
  if (runEnd?.status) return String(runEnd.status).toLowerCase() === "passed";
  return exitCode === 0;
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

async function runKaneCheck(kaneCmd: string, check: Check): Promise<CheckResult> {
  const args = ["run", check.objective, "--url", check.url, "--headless", "--agent"];
  if (check.maxSteps) args.push("--max-steps", String(check.maxSteps));
  if (check.timeoutSeconds) args.push("--timeout", String(check.timeoutSeconds));
  const { code, stdout, stderr } = await runCmd(kaneCmd, args, { timeoutMs: ((check.timeoutSeconds ?? 180) + 60) * 1000 });
  const runEnd = extractRunEnd(stdout);
  const passed = isPass(runEnd, code);
  return {
    name: check.name,
    objective: check.objective,
    url: check.url,
    attempt: 1,
    passed,
    status: String(runEnd?.status ?? (passed ? "passed" : "failed")),
    reason: String(runEnd?.reason ?? runEnd?.reason_code ?? (passed ? "ok" : "unknown")),
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
  const fixCmd = args["fix-cmd"] ? String(args["fix-cmd"]) : "";
  const reportFile = args.report ? String(args.report) : "";

  const startedAt = new Date().toISOString();
  const checks = await loadChecks(path.resolve(checksFile));
  const results: CheckResult[] = [];

  for (const check of checks) {
    let last: CheckResult | undefined;
    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
      console.log(`\n[bugboing] check=${check.name} attempt=${attempt}/${maxAttempts}`);
      const r = await runKaneCheck(kaneCmd, check);
      r.attempt = attempt;
      last = r;
      console.log(`[bugboing] status=${r.status} reason=${r.reason} test_url=${r.testUrl ?? ""}`);
      if (r.passed) break;
      if (attempt < maxAttempts && fixCmd) {
        console.log(`[bugboing] invoking fix-cmd for ${check.name}`);
        const payload = { tool: "bugboing", check, attempt, maxAttempts, result: r };
        const fix = await runFix(fixCmd, payload);
        r.fixCmd = fixCmd;
        r.fixExitCode = fix.code;
        r.fixStdoutTail = tail(fix.stdout);
        r.fixStderrTail = tail(fix.stderr);
        console.log(`[bugboing] fix-cmd exit=${fix.code}`);
        if (fix.code !== 0) {
          console.log(`[bugboing] fix-cmd failed; stopping retries for this check`);
          break;
        }
      } else if (attempt < maxAttempts && !fixCmd) {
        console.log(`[bugboing] no --fix-cmd provided; not retrying`);
        break;
      }
    }
    if (last) results.push(last);
  }

  const passed = results.every((r) => r.passed);
  const report: Report = { tool: "bugboing", version: "0.1.0", startedAt, finishedAt: new Date().toISOString(), passed, checks: results };
  const reportJson = JSON.stringify(report, null, 2);
  if (reportFile) await writeFile(path.resolve(reportFile), reportJson, "utf8");
  console.log(`\n[bugboing] RESULT ${passed ? "PASSED" : "FAILED"}`);
  console.log(reportJson);
  process.exit(passed ? 0 : 1);
}

main().catch((e) => {
  console.error(`[bugboing] fatal: ${e instanceof Error ? e.stack || e.message : String(e)}`);
  process.exit(2);
});
