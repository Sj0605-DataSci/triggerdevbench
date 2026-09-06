import { randomUUID } from "node:crypto";
import { writeFileSync } from "node:fs";

const API_URL = process.env.TRIGGER_API_URL ?? "http://localhost:8030";
const SECRET_KEY = process.env.TRIGGER_SECRET_KEY;
const key = `dedupe-${randomUUID()}`;
const dedupeKey = `payload-${randomUUID()}`;

const triggers = await Promise.all(
  Array.from({ length: 5 }, () =>
    fetch(`${API_URL}/api/v1/tasks/eval-09-idempotency-side-effect/trigger`, {
      method: "POST",
      headers: { Authorization: `Bearer ${SECRET_KEY}`, "Content-Type": "application/json" },
      body: JSON.stringify({ payload: { dedupeKey }, options: { idempotencyKey: key } }),
    }).then((r) => r.json())
  )
);

const uniqueRunIds = [...new Set(triggers.map((t) => t.id))];
await new Promise((r) => setTimeout(r, 2000));
const run = await fetch(`${API_URL}/api/v3/runs/${uniqueRunIds[0]}`, { headers: { Authorization: `Bearer ${SECRET_KEY}` } }).then((r) =>
  r.json()
);

writeFileSync(
  "/logs/driver/idempotency_result.json",
  JSON.stringify({ uniqueRunCount: uniqueRunIds.length, executionCount: run.output?.executionCount, status: run.status }, null, 2)
);
console.log(`uniqueRunCount=${uniqueRunIds.length}, executionCount=${run.output?.executionCount}`);
