import { randomUUID } from "node:crypto";
import { writeFileSync } from "node:fs";

const API_URL = process.env.TRIGGER_API_URL ?? "http://localhost:8030";
const SECRET_KEY = process.env.TRIGGER_SECRET_KEY;
const failFirstNAttempts = 3;

const trig = await fetch(`${API_URL}/api/v1/tasks/eval-10-retry-backoff/trigger`, {
  method: "POST",
  headers: { Authorization: `Bearer ${SECRET_KEY}`, "Content-Type": "application/json" },
  body: JSON.stringify({ payload: { runKey: `retry-${randomUUID()}`, failFirstNAttempts } }),
}).then((r) => r.json());

const terminal = new Set(["COMPLETED", "FAILED", "CRASHED"]);
let run = null;
const deadline = Date.now() + 20_000;
while (Date.now() < deadline) {
  run = await fetch(`${API_URL}/api/v3/runs/${trig.id}`, { headers: { Authorization: `Bearer ${SECRET_KEY}` } }).then((r) => r.json());
  if (terminal.has(run.status)) break;
  await new Promise((r) => setTimeout(r, 750));
}

const wallMs = new Date(run.finishedAt).getTime() - new Date(run.createdAt).getTime();
writeFileSync(
  "/logs/driver/backoff_result.json",
  JSON.stringify({ status: run.status, attemptCount: run.attemptCount, wallMs, failFirstNAttempts }, null, 2)
);
console.log(`status=${run.status}, attemptCount=${run.attemptCount}, wallMs=${wallMs}`);
