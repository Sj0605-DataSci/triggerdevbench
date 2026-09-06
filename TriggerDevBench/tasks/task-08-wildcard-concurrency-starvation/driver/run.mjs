import { writeFileSync } from "node:fs";

const API_URL = process.env.TRIGGER_API_URL ?? "http://localhost:8030";
const SECRET_KEY = process.env.TRIGGER_SECRET_KEY;

async function trigger(label, holdMs, concurrencyKey) {
  return fetch(`${API_URL}/api/v1/tasks/eval-02-wildcard-key-task/trigger`, {
    method: "POST",
    headers: { Authorization: `Bearer ${SECRET_KEY}`, "Content-Type": "application/json" },
    body: JSON.stringify({ payload: { label, holdMs }, options: { concurrencyKey } }),
  }).then((r) => r.json());
}

await trigger("wildcard-hog", 6000, "*");
const start = Date.now();
const others = await Promise.all([trigger("k1", 200, "k1"), trigger("k2", 200, "k2"), trigger("k3", 200, "k3")]);

const terminal = new Set(["COMPLETED", "FAILED", "CRASHED"]);
const finished = {};
const deadline = Date.now() + 15_000;
while (Object.keys(finished).length < 3 && Date.now() < deadline) {
  for (const o of others) {
    if (finished[o.id]) continue;
    const run = await fetch(`${API_URL}/api/v3/runs/${o.id}`, { headers: { Authorization: `Bearer ${SECRET_KEY}` } }).then((r) => r.json());
    if (terminal.has(run.status)) finished[o.id] = run;
  }
  if (Object.keys(finished).length < 3) await new Promise((r) => setTimeout(r, 300));
}
const maxWaitMs = Date.now() - start;

writeFileSync(
  "/logs/driver/wildcard_result.json",
  JSON.stringify({ maxWaitMs, statuses: Object.values(finished).map((r) => r.status) }, null, 2)
);
console.log(`maxWaitMs=${maxWaitMs}`);
