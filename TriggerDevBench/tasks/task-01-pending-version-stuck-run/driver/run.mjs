// Deterministic driver -- ITSMBench tasks put an LLM agent here to decide what
// actions to take against the environment. This benchmark scores the PLATFORM,
// not an agent's judgment, so the "agent" is a fixed script performing exactly
// the action instruction.md describes: trigger a task id no worker will ever
// register, and record the trigger response for the verifier to check.
import { randomUUID } from "node:crypto";
import { writeFileSync } from "node:fs";

const API_URL = process.env.TRIGGER_API_URL ?? "http://localhost:8030";
const SECRET_KEY = process.env.TRIGGER_SECRET_KEY;

const fakeTaskId = `process-refund-${randomUUID()}`;
const res = await fetch(`${API_URL}/api/v1/tasks/${fakeTaskId}/trigger`, {
  method: "POST",
  headers: { Authorization: `Bearer ${SECRET_KEY}`, "Content-Type": "application/json" },
  body: JSON.stringify({ payload: {} }),
});
const httpStatus = res.status;
const body = await res.json().catch(() => ({}));

writeFileSync(
  "/logs/driver/trigger_result.json",
  JSON.stringify({ fakeTaskId, httpStatus, body, triggeredAt: new Date().toISOString() }, null, 2)
);
console.log(`Triggered ${fakeTaskId}: HTTP ${httpStatus}, body=${JSON.stringify(body)}`);
