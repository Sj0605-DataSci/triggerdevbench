import { writeFileSync } from "node:fs";

const API_URL = process.env.TRIGGER_API_URL ?? "http://localhost:8030";
const SECRET_KEY = process.env.TRIGGER_SECRET_KEY;
const N = 4;
const WAIT_SECONDS = 20;
const CONCURRENCY_LIMIT = 2;

const startMs = Date.now();
const runIds = [];
for (let i = 0; i < N; i++) {
  const res = await fetch(`${API_URL}/api/v1/tasks/eval-53-blocking-wait-task/trigger`, {
    method: "POST",
    headers: { Authorization: `Bearer ${SECRET_KEY}`, "Content-Type": "application/json" },
    body: JSON.stringify({ payload: { index: i, waitSeconds: WAIT_SECONDS } }),
  });
  const { id } = await res.json();
  runIds.push(id);
}

const deadline = Date.now() + (N / CONCURRENCY_LIMIT) * WAIT_SECONDS * 1000 + 30_000;
const finished = {};
while (Object.keys(finished).length < N && Date.now() < deadline) {
  for (const id of runIds) {
    if (finished[id]) continue;
    const res = await fetch(`${API_URL}/api/v3/runs/${id}`, { headers: { Authorization: `Bearer ${SECRET_KEY}` } });
    const run = await res.json();
    if (run.status === "COMPLETED") finished[id] = run;
  }
  if (Object.keys(finished).length < N) await new Promise((r) => setTimeout(r, 1000));
}

const lastFinishMs = Math.max(...Object.values(finished).map((r) => new Date(r.finishedAt).getTime()));
const actualDurationMs = lastFinishMs - startMs;

writeFileSync(
  "/logs/driver/checkpoint_result.json",
  JSON.stringify(
    {
      N,
      waitSeconds: WAIT_SECONDS,
      concurrencyLimit: CONCURRENCY_LIMIT,
      actualDurationMs,
      theoreticalNonBlockingMs: WAIT_SECONDS * 1000,
      theoreticalBlockingMs: Math.ceil(N / CONCURRENCY_LIMIT) * WAIT_SECONDS * 1000,
      runs: Object.fromEntries(Object.entries(finished).map(([id, r]) => [id, { startedAt: r.startedAt, finishedAt: r.finishedAt }])),
    },
    null,
    2
  )
);
console.log(`Batch of ${N} completed in ${actualDurationMs}ms (non-blocking theory: ${WAIT_SECONDS * 1000}ms, blocking theory: ${Math.ceil(N / CONCURRENCY_LIMIT) * WAIT_SECONDS * 1000}ms)`);
