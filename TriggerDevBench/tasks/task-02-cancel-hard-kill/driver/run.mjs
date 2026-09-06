// Deterministic driver: fires 5 independent trigger+cancel trials against the
// pre-deployed `eval-25-cancelable-long-task` (see ../environment/README.md for
// the dependency this task has on the shared eval-project deployment).
import { writeFileSync } from "node:fs";

const API_URL = process.env.TRIGGER_API_URL ?? "http://localhost:8030";
const SECRET_KEY = process.env.TRIGGER_SECRET_KEY;
const N = 5;

const trials = [];
for (let i = 0; i < N; i++) {
  const triggerRes = await fetch(`${API_URL}/api/v1/tasks/eval-25-cancelable-long-task/trigger`, {
    method: "POST",
    headers: { Authorization: `Bearer ${SECRET_KEY}`, "Content-Type": "application/json" },
    body: JSON.stringify({ payload: { totalSteps: 20, stepMs: 500 } }),
  });
  const { id: runId } = await triggerRes.json();

  await new Promise((r) => setTimeout(r, 2000));

  const cancelRes = await fetch(`${API_URL}/api/v2/runs/${runId}/cancel`, {
    method: "POST",
    headers: { Authorization: `Bearer ${SECRET_KEY}` },
  });

  let run = null;
  const deadline = Date.now() + 15_000;
  while (Date.now() < deadline) {
    const r = await fetch(`${API_URL}/api/v3/runs/${runId}`, { headers: { Authorization: `Bearer ${SECRET_KEY}` } });
    run = await r.json();
    if (["CANCELED", "COMPLETED", "FAILED", "CRASHED"].includes(run.status)) break;
    await new Promise((res) => setTimeout(res, 500));
  }

  trials.push({ trial: i, runId, cancelOk: cancelRes.ok, status: run?.status, output: run?.output ?? null });
  console.log(`trial ${i}: status=${run?.status}, output=${JSON.stringify(run?.output)}`);
}

writeFileSync("/logs/driver/trials.json", JSON.stringify(trials, null, 2));
