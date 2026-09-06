// Verifier -- mirrors ITSMBench's tests/test_outputs.py convention (deterministic
// assertions against the final system state), ported to Node/mjs since our
// driver and the Trigger.dev SDK stack are both JS. Writes /logs/verifier/reward.txt
// exactly like ITSMBench's test.sh does, so results stay comparable across tasks.
import { readFileSync, writeFileSync } from "node:fs";

const API_URL = process.env.TRIGGER_API_URL ?? "http://localhost:8030";
const SECRET_KEY = process.env.TRIGGER_SECRET_KEY;
const TTL_MS = 10 * 60_000;
const GRACE_MS = 60_000;

const { fakeTaskId, httpStatus, body, triggeredAt } = JSON.parse(
  readFileSync("/logs/driver/trigger_result.json", "utf-8")
);

const results = [];

function check(name, pass, detail) {
  results.push({ name, pass, detail });
  console.log(`[${pass ? "PASS" : "FAIL"}] ${name}: ${detail}`);
}

if (httpStatus !== 200 || !body.id) {
  // Fail-fast path: acceptable outcome #1. If the platform rejected it
  // cleanly, that alone is a pass -- nothing further to check.
  check("fail_fast_or_eventual_resolution", true, `Rejected fast: HTTP ${httpStatus}`);
} else {
  const runId = body.id;
  const deadline = Date.parse(triggeredAt) + TTL_MS + GRACE_MS;
  const terminal = new Set(["FAILED", "CANCELED", "CRASHED", "SYSTEM_FAILURE", "TIMED_OUT"]);
  let finalStatus = null;

  while (Date.now() < deadline) {
    const res = await fetch(`${API_URL}/api/v3/runs/${runId}`, {
      headers: { Authorization: `Bearer ${SECRET_KEY}` },
    });
    const run = await res.json();
    if (terminal.has(run.status)) {
      finalStatus = run.status;
      break;
    }
    await new Promise((r) => setTimeout(r, 5000));
  }

  check(
    "fail_fast_or_eventual_resolution",
    finalStatus !== null,
    finalStatus
      ? `Resolved to ${finalStatus} within TTL+grace`
      : `STILL UNRESOLVED past ttl(${TTL_MS}ms)+grace(${GRACE_MS}ms) -- confirmed stuck run`
  );
}

const allPassed = results.every((r) => r.pass);
writeFileSync("/logs/verifier/results.json", JSON.stringify(results, null, 2));
writeFileSync("/logs/verifier/reward.txt", allPassed ? "1" : "0");
process.exit(allPassed ? 0 : 1);
