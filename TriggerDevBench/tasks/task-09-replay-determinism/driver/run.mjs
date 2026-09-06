import { randomUUID } from "node:crypto";
import { writeFileSync } from "node:fs";

const API_URL = process.env.TRIGGER_API_URL ?? "http://localhost:8030";
const SECRET_KEY = process.env.TRIGGER_SECRET_KEY;
const label = `replay-${randomUUID()}`;

async function waitForRun(runId) {
  const terminal = new Set(["COMPLETED", "FAILED", "CRASHED"]);
  const deadline = Date.now() + 15_000;
  let run;
  while (Date.now() < deadline) {
    run = await fetch(`${API_URL}/api/v3/runs/${runId}`, { headers: { Authorization: `Bearer ${SECRET_KEY}` } }).then((r) => r.json());
    if (terminal.has(run.status)) return run;
    await new Promise((r) => setTimeout(r, 500));
  }
  return run;
}

const orig = await fetch(`${API_URL}/api/v1/tasks/eval-51-deterministic-computation/trigger`, {
  method: "POST",
  headers: { Authorization: `Bearer ${SECRET_KEY}`, "Content-Type": "application/json" },
  body: JSON.stringify({ payload: { seed: 42, label } }),
}).then((r) => r.json());
const originalRun = await waitForRun(orig.id);

const replayed = await fetch(`${API_URL}/api/v1/runs/${orig.id}/replay`, {
  method: "POST",
  headers: { Authorization: `Bearer ${SECRET_KEY}` },
}).then((r) => r.json());
const replayedRun = await waitForRun(replayed.id);

writeFileSync(
  "/logs/driver/replay_result.json",
  JSON.stringify(
    {
      originalRunId: orig.id,
      replayedRunId: replayed.id,
      originalHash: originalRun.output?.computedHash,
      replayedHash: replayedRun.output?.computedHash,
      executionNumber: replayedRun.output?.executionNumber,
    },
    null,
    2
  )
);
console.log(`original=${orig.id} replayed=${replayed.id} executionNumber=${replayedRun.output?.executionNumber}`);
