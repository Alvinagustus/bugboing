import { spawn, spawnSync } from "node:child_process";
import type { ChildProcess } from "node:child_process";

export type RunResult = {
  code: number | null;
  stdout: string;
  stderr: string;
  timedOut: boolean;
};

export type RunOptions = {
  cwd?: string;
  input?: string;
  timeoutMs?: number;
  /** Extra time to wait for pipes to close after the tree is killed. */
  killGraceMs?: number;
};

/**
 * Split a command line into argv, honouring single/double quotes so a command
 * like `node "C:\Program Files\x\fake-kane.mjs"` can be spawned without a shell.
 */
export function splitCommandLine(input: string): string[] {
  const out: string[] = [];
  let cur = "";
  let quote: '"' | "'" | null = null;
  let started = false;

  for (let i = 0; i < input.length; i++) {
    const ch = input[i];
    if (quote) {
      if (ch === quote) {
        quote = null;
        continue;
      }
      if (quote === '"' && ch === "\\" && i + 1 < input.length) {
        const next = input[i + 1];
        if (next === '"' || next === "\\") {
          cur += next;
          i++;
          continue;
        }
      }
      cur += ch;
      continue;
    }
    if (ch === '"' || ch === "'") {
      quote = ch;
      started = true;
      continue;
    }
    if (/\s/.test(ch)) {
      if (started) {
        out.push(cur);
        cur = "";
        started = false;
      }
      continue;
    }
    cur += ch;
    started = true;
  }
  if (started) out.push(cur);
  return out;
}

function quoteCmd(s: string): string {
  if (s.length > 0 && !/[\s"&()^<>|]/.test(s)) return s;
  // cmd.exe has no backslash escaping: a literal quote inside a quoted
  // argument is written as "".
  return '"' + s.replace(/"/g, '""') + '"';
}

function usesShell(cmd: string): boolean {
  return process.platform === "win32" && /\.(cmd|bat)$/i.test(cmd);
}

/**
 * Kill the child *and its descendants*.
 *
 * POSIX: the child is spawned detached, so it leads its own process group and
 * `kill(-pid)` reaps grandchildren (Kane may spawn browsers, agents, etc).
 * Windows: `taskkill /T /F` walks the process tree; a bare `child.kill()`
 * would leave the `cmd.exe` wrapper and its children alive.
 */
function killTree(child: ChildProcess): void {
  const pid = child.pid;
  if (pid == null) return;
  if (process.platform === "win32") {
    try {
      spawnSync("taskkill", ["/pid", String(pid), "/T", "/F"], { stdio: "ignore", windowsHide: true });
    } catch {
      try { child.kill(); } catch {}
    }
    return;
  }
  try {
    process.kill(-pid, "SIGKILL");
  } catch {
    try { child.kill("SIGKILL"); } catch {}
  }
}

export function runCmd(cmd: string, args: string[], opts: RunOptions = {}): Promise<RunResult> {
  return new Promise((resolve) => {
    const isWin = process.platform === "win32";
    const shell = usesShell(cmd);
    let child: ChildProcess;
    try {
      child = shell
        ? // Windows needs cmd.exe to resolve .cmd/.bat shims (kane-cli.cmd).
          spawn([quoteCmd(cmd), ...args.map(quoteCmd)].join(" "), {
            cwd: opts.cwd,
            shell: true,
            windowsHide: true,
            stdio: ["pipe", "pipe", "pipe"],
            env: process.env,
          })
        : // Everywhere else (and for .exe/script commands on Windows) spawn the
          // argv directly: no shell wrapper to orphan, and no cmd.exe quoting.
          spawn(cmd, args, {
            cwd: opts.cwd,
            detached: !isWin,
            windowsHide: isWin,
            stdio: ["pipe", "pipe", "pipe"],
            env: process.env,
          });
    } catch (e) {
      resolve({ code: 2, stdout: "", stderr: `[spawn error] ${String(e)}`, timedOut: false });
      return;
    }

    let stdout = "";
    let stderr = "";
    let timedOut = false;
    let done = false;
    let timeoutTimer: NodeJS.Timeout | undefined;
    let graceTimer: NodeJS.Timeout | undefined;

    const finish = (code: number | null) => {
      if (done) return;
      done = true;
      if (timeoutTimer) clearTimeout(timeoutTimer);
      if (graceTimer) clearTimeout(graceTimer);
      resolve({ code, stdout, stderr, timedOut });
    };

    child.stdout?.on("data", (d) => { stdout += String(d); });
    child.stderr?.on("data", (d) => { stderr += String(d); });
    child.on("error", (e) => {
      stderr += `\n[spawn error] ${String(e)}`;
      finish(2);
    });
    child.on("close", (code) => finish(code));

    if (opts.input != null) {
      try { child.stdin?.write(opts.input); } catch {}
    }
    try { child.stdin?.end(); } catch {}

    if (opts.timeoutMs && opts.timeoutMs > 0) {
      timeoutTimer = setTimeout(() => {
        if (done) return;
        timedOut = true;
        stderr += `\n[timeout] no verdict after ${opts.timeoutMs}ms; killing process tree`;
        killTree(child);
        // Backstop: if some escaped process still holds the pipes open, resolve
        // anyway instead of hanging forever (the result is never green).
        graceTimer = setTimeout(() => finish(null), opts.killGraceMs ?? 2000);
        graceTimer.unref?.();
      }, opts.timeoutMs);
      timeoutTimer.unref?.();
    }
  });
}

export function runCommandLine(commandLine: string, opts: RunOptions = {}): Promise<RunResult> {
  const argv = splitCommandLine(commandLine);
  if (argv.length === 0) {
    return Promise.resolve({ code: 2, stdout: "", stderr: "[spawn error] empty command", timedOut: false });
  }
  return runCmd(argv[0], argv.slice(1), opts);
}
