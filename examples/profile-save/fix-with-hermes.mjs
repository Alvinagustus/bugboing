import { appendFileSync, writeFileSync, unlinkSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, "../..");
const transcript =
  process.env.AGENT_TRANSCRIPT || path.join(os.tmpdir(), "bugboing-agent-transcript.ndjson");

let input = "";
process.stdin.setEncoding("utf8");
for await (const chunk of process.stdin) input += chunk;

let payload = {};
try { payload = JSON.parse(input || "{}"); } catch {}

const check = payload.check ?? {};
const result = payload.result ?? {};
const raw = result.rawRunEnd ?? {};
const verdict = raw.verdict ?? {};

const evidence = {
  trust: result.trust,
  status: result.status,
  reason: result.reason,
  result_code: result.resultCode,
  reason_code: result.reasonCode,
  summary: result.summary,
  one_liner: result.oneLiner,
  test_url: result.testUrl,
  kane_verdict: verdict,
  culprit_step: raw.culprit_step ?? null,
  suggestion: raw.suggestion ?? null,
};

const prompt = [
  "You are the fixer in a BugBoing verification loop.",
  "A real browser check just failed. Kane CLI is the only judge; your exit code is not proof.",
  "",
  `Check URL: ${check.url}`,
  `Objective: ${check.objective}`,
  "",
  "Kane failure evidence (JSON):",
  JSON.stringify(evidence, null, 2),
  "",
  "The site lives in examples/profile-save/site/ and is served from this repo.",
  "Find the real cause and make the smallest fix. Edit ONLY files under examples/profile-save/site/.",
  "Do not modify checks.json, the objective, or any file outside that directory.",
  "Do not claim the check passes; just fix the code.",
].join("\n");

const bin = process.env.HERMES_BIN || "hermes";
const model = process.env.HERMES_MODEL || "meituan/longcat-2.5:free";
const provider = process.env.HERMES_PROVIDER || "nous";
const promptFile = path.join(os.tmpdir(), `bugboing-hermes-prompt-${process.pid}.txt`);
writeFileSync(promptFile, prompt, "utf8");

const args = [
  "chat",
  "--query-file", promptFile,
  "--oneshot",
  "--yolo",
  "--quiet",
  "--format", "stream-json",
  "-m", model,
  "--provider", provider,
];

const startedAt = new Date().toISOString();
const r = spawnSync(bin, args, {
  cwd: root,
  encoding: "utf8",
  timeout: 8 * 60 * 1000,
  maxBuffer: 20 * 1024 * 1024,
});

try { unlinkSync(promptFile); } catch {}

if (typeof r.stdout === "string" && r.stdout.length > 0) {
  appendFileSync(transcript, `{"fixer_started_at":"${startedAt}","model":"${model}","provider":"${provider}"}\n${r.stdout.endsWith("\n") ? r.stdout : r.stdout + "\n"}`);
  process.stdout.write(r.stdout);
}
if (typeof r.stderr === "string" && r.stderr.length > 0) {
  process.stderr.write(r.stderr);
}
if (r.error) {
  console.error(`[hermes-fixer] failed to launch ${bin}: ${String(r.error)}`);
}

console.log(`[hermes-fixer] exit=${r.status ?? "null"} signal=${r.signal ?? ""} model=${model}`);
process.exit(r.status ?? 1);
