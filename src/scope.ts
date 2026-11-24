import { createHash } from "node:crypto";
import { mkdir, mkdtemp, readFile, readdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

export type ScopeViolation = {
  path: string;
  kind: "modified" | "created" | "deleted";
  action: "restored" | "deleted" | "kept";
};

export type ScopeResult = {
  enforced: boolean;
  allowed: string[];
  violations: ScopeViolation[];
};

export type ScopeSnapshot = {
  root: string;
  dir: string;
  hashes: Map<string, string>;
};

export type ScopeMode = "off" | "warn" | "revert";

// Generated / vendor directories are never part of the fix contract. Keep this
// list small: anything excluded here is invisible to the guard, so `dist` and
// source directories stay in scope.
const EXCLUDED_NAMES = new Set([
  ".git",
  ".testmuai",
  ".next",
  ".cache",
  ".turbo",
  "node_modules",
  "Thumbs.db",
  ".DS_Store",
]);

function isExcluded(name: string): boolean {
  return EXCLUDED_NAMES.has(name);
}

export function toPosixPath(p: string): string {
  return p.split(path.sep).join("/");
}

function sha256(data: Buffer): string {
  return createHash("sha256").update(data).digest("hex");
}

async function walk(
  root: string,
  dir: string,
  visit: (rel: string, abs: string) => Promise<void>,
): Promise<void> {
  const entries = await readdir(dir, { withFileTypes: true });
  for (const entry of entries) {
    if (isExcluded(entry.name)) continue;
    const abs = path.join(dir, entry.name);
    if (entry.isSymbolicLink()) continue;
    if (entry.isDirectory()) {
      await walk(root, abs, visit);
      continue;
    }
    if (!entry.isFile()) continue;
    await visit(toPosixPath(path.relative(root, abs)), abs);
  }
}

/**
 * Copy the workspace into a temp directory and hash every file. The copy is the
 * revert source, so out-of-scope edits can be undone without touching git state.
 */
export async function takeScopeSnapshot(root: string): Promise<ScopeSnapshot> {
  const dir = await mkdtemp(path.join(tmpdir(), "bugboing-scope-"));
  const hashes = new Map<string, string>();
  await walk(root, root, async (rel, abs) => {
    const data = await readFile(abs);
    hashes.set(rel, sha256(data));
    const dest = path.join(dir, rel);
    await mkdir(path.dirname(dest), { recursive: true });
    await writeFile(dest, data);
  });
  return { root, dir, hashes };
}

export function globToRegExp(glob: string): RegExp {
  let p = toPosixPath(glob.trim());
  if (p.endsWith("/")) p += "**";
  if (!/[*?]/.test(p)) p = p.replace(/\/+$/, "") + "/**";

  let out = "^";
  for (let i = 0; i < p.length; i++) {
    const c = p[i];
    if (c === "*") {
      if (p[i + 1] === "*") {
        if (p[i + 2] === "/") {
          // `**/` matches zero or more directories, including none.
          out += "(?:.*/)?";
          i += 2;
        } else {
          out += ".*";
          i += 1;
        }
      } else {
        out += "[^/]*";
      }
    } else if (c === "?") {
      out += "[^/]";
    } else {
      out += c.replace(/[.+^${}()|[\]\\]/g, "\\$&");
    }
  }
  out += "$";
  return new RegExp(out);
}

/**
 * Compare the workspace with the snapshot. Allowed paths (minus protected
 * paths, e.g. checks.json) may change; everything else is reported and, in
 * revert mode, restored.
 */
export async function enforceScope(
  snap: ScopeSnapshot,
  allowed: string[],
  protectedPaths: string[],
  mode: "warn" | "revert",
): Promise<ScopeResult> {
  const matchers = allowed.map(globToRegExp);
  const protectedSet = new Set(protectedPaths.map(toPosixPath));
  const isAllowed = (rel: string) =>
    !protectedSet.has(rel) && matchers.some((m) => m.test(rel));

  const now = new Map<string, string>();
  await walk(snap.root, snap.root, async (rel, abs) => {
    now.set(rel, sha256(await readFile(abs)));
  });

  const violations: ScopeViolation[] = [];

  for (const [rel, hash] of now) {
    if (snap.hashes.get(rel) === hash) continue;
    if (isAllowed(rel)) continue;
    const existed = snap.hashes.has(rel);
    // checks.json (and any other protected path) is restored even in warn mode:
    // leaving a weakened check file behind would poison the next run.
    const restore = mode === "revert" || protectedSet.has(rel);
    if (restore) {
      const abs = path.join(snap.root, rel);
      if (existed) {
        await mkdir(path.dirname(abs), { recursive: true });
        await writeFile(abs, await readFile(path.join(snap.dir, rel)));
      } else {
        await rm(abs, { force: true });
      }
    }
    violations.push({
      path: rel,
      kind: existed ? "modified" : "created",
      action: restore ? (existed ? "restored" : "deleted") : "kept",
    });
  }

  for (const rel of snap.hashes.keys()) {
    if (now.has(rel)) continue;
    if (isAllowed(rel)) continue;
    const restore = mode === "revert" || protectedSet.has(rel);
    if (restore) {
      const abs = path.join(snap.root, rel);
      await mkdir(path.dirname(abs), { recursive: true });
      await writeFile(abs, await readFile(path.join(snap.dir, rel)));
    }
    violations.push({ path: rel, kind: "deleted", action: restore ? "restored" : "kept" });
  }

  await rm(snap.dir, { recursive: true, force: true });
  return { enforced: true, allowed, violations };
}
