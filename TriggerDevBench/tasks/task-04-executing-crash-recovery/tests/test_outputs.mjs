import { readFileSync, writeFileSync } from "node:fs";

const API_URL = process.env.TRIGGER_API_URL ?? "http://localhost:8030";
const SECRET_KEY = process.env.TRIGGER_SECRET_KEY;
const CLAIMED_SLA_MS = 300_000; // RUN_ENGINE_TIMEOUT_EXECUTING default
const GRACE_MS = 60_000;

const { runId, killTime } = JSON.parse(readFileSync("/logs/driver/crash_result.json", "utf-8"));
const results = [];
function check(name, pass, detail) {
  results.push({ name, pass, detail });
  console.log(`[${pass ? "PASS" : "FAIL"}] ${name}: ${detail}`);
}

const terminal = new Set(["FAILED", "CANCELED", "CRASHED", "SYSTEM_FAILURE", "TIMED_OUT"]);
const deadline = Date.parse(killTime) + CLAIMED_SLA_MS + GRACE_MS;
let finalRun = null;

while (Date.now() < deadline) {
  const res = await fetch(`${API_URL}/api/v3/runs/${runId}`, { headers: { Authorization: `Bearer ${SECRET_KEY}` } });
  const run = await res.json();
  if (terminal.has(run.status)) {
    finalRun = run;
    break;
  }
  await new Promise((r) => setTimeout(r, 5000));
}

check(
  "resolves_within_claimed_sla",
  finalRun !== null,
  finalRun
    ? `Resolved to ${finalRun.status} (${finalRun.error?.message ?? "no error message"}) within SLA+grace`
    : `STILL UNRESOLVED past ${CLAIMED_SLA_MS + GRACE_MS}ms -- worker crash NOT self-healed`
);

if (finalRun) {
  const actualMs = new Date(finalRun.finishedAt).getTime() - new Date(finalRun.startedAt).getTime();
  check(
    "resolution_latency_matches_claimed_sla",
    Math.abs(actualMs - CLAIMED_SLA_MS) < GRACE_MS,
    `Actual resolution latency: ${actualMs}ms vs claimed ${CLAIMED_SLA_MS}ms`
  );
}

const allPassed = results.every((r) => r.pass);
writeFileSync("/logs/verifier/results.json", JSON.stringify(results, null, 2));
writeFileSync("/logs/verifier/reward.txt", allPassed ? "1" : "0");
process.exit(allPassed ? 0 : 1);
